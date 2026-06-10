import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap, tap } from 'rxjs';
import { AiAssistantService } from '../../services/ai-assistant.service';

import { ProjectService, StepFiveProjectInformation, StepFiveProjectUpdatePayload } from '../../services/project.service';

type UnsafeBehaviorType = 'UCA' | 'HC';

interface UnsafeBehaviorOption {
  id: string;
  type: UnsafeBehaviorType;
  title: string;
  description: string;
  hazards: string[];
}

interface LossScenario {
  id: string;
  description: string;
  associatedUnsafeBehaviorIds: string[];
  sourceRationale: string;
}

interface SafetyRequirement {
  id: string;
  description: string;
  addressedLossScenarioIds: string[];
}

interface TraceabilityChain {
  requirement: SafetyRequirement;
  scenarios: Array<{
    scenario: LossScenario;
    unsafeBehaviors: UnsafeBehaviorOption[];
    hazards: string[];
  }>;
}

interface StepFiveAiDraft {
  lossScenarios?: Array<{
    id?: string;
    description?: string;
    associatedUnsafeBehaviorIds?: string[];
    sourceRationale?: string;
  }>;
  safetyRequirements?: Array<{
    id?: string;
    description?: string;
    addressedLossScenarioIds?: string[];
  }>;
}

function requireSelection(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    return Array.isArray(value) && value.length > 0 ? null : { required: true };
  };
}

@Component({
  selector: 'app-loss-scenarios-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './loss-scenarios-page.component.html',
  styleUrl: './loss-scenarios-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LossScenariosPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentProjectId = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly isSavingStepFive = signal(false);
  readonly isGeneratingStepFiveAi = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly stepFiveSaveMessage = signal<string | null>(null);
  readonly stepFiveSaveError = signal<string | null>(null);
  readonly isBpmnModelModalOpen = signal(false);
  readonly nextLossScenarioId = signal('LS-01');
  readonly nextSafetyRequirementId = signal('SR-01');

  readonly unsafeBehaviorCatalog = signal<UnsafeBehaviorOption[]>([]);

  readonly lossScenarioForm = this.fb.group({
    id: ['LS-01', [Validators.required, Validators.pattern(/^LS-\d{2}$/)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(600)]],
    associatedUnsafeBehaviorIds: [[] as string[], [requireSelection()]],
    sourceRationale: ['', Validators.maxLength(220)]
  });

  readonly safetyRequirementForm = this.fb.group({
    id: ['SR-01', [Validators.required, Validators.pattern(/^SR-\d{2}$/)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(600)]],
    addressedLossScenarioIds: [[] as string[], [requireSelection()]]
  });

  readonly lossScenarios = signal<LossScenario[]>([]);

  readonly safetyRequirements = signal<SafetyRequirement[]>([]);

  constructor() {
    this.route.queryParamMap
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.loadError.set(null);
        }),
        switchMap((params) => {
          const projectIdParam = params.get('projectId');
          const parsedProjectId = projectIdParam ? Number(projectIdParam) : null;
          const projectId = parsedProjectId && !Number.isNaN(parsedProjectId) ? parsedProjectId : null;

          this.currentProjectId.set(projectId);

          if (!projectId) {
            this.resetStepFiveState();
            this.isLoading.set(false);
            return EMPTY;
          }

          return this.projectService.getStepFiveInformation(projectId).pipe(
            tap((response) => this.hydrateFromStepFiveInformation(response)),
            catchError((error) => {
              console.error(
                'Failed to fetch Step 5 information via GET /api/projects/step_five_project_information/{id}',
                error
              );
              this.loadError.set('Failed to load Step 5 information for the selected project.');
              this.resetStepFiveState();
              return EMPTY;
            }),
            tap(() => this.isLoading.set(false))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  readonly summaryCards = computed(() => {
    const scenarioCount = this.lossScenarios().length;
    const requirementCount = this.safetyRequirements().length;
    const linkedBehaviorCount = new Set(
      this.lossScenarios().flatMap((scenario) => scenario.associatedUnsafeBehaviorIds)
    ).size;

    return [
      { label: 'Loss scenarios', value: scenarioCount },
      { label: 'Safety requirements', value: requirementCount },
      { label: 'Unsafe behaviors covered', value: linkedBehaviorCount }
    ];
  });

  readonly traceabilityGuardrails = computed(() => {
    const scenarios = this.lossScenarios();
    const requirements = this.safetyRequirements();

    const scenariosWithTraceability = scenarios.filter(
      (scenario) => scenario.associatedUnsafeBehaviorIds.length > 0
    ).length;
    const requirementsWithTraceability = requirements.filter(
      (requirement) => requirement.addressedLossScenarioIds.length > 0
    ).length;

    return {
      scenariosWithTraceability,
      requirementsWithTraceability,
      readyForStep6:
        scenarios.length > 0 &&
        requirements.length > 0 &&
        scenariosWithTraceability === scenarios.length &&
        requirementsWithTraceability === requirements.length
    };
  });

  readonly traceabilityChains = computed<TraceabilityChain[]>(() =>
    this.safetyRequirements().map((requirement) => ({
      requirement,
      scenarios: requirement.addressedLossScenarioIds
        .map((scenarioId) => this.findLossScenario(scenarioId))
        .filter((scenario): scenario is LossScenario => !!scenario)
        .map((scenario) => {
          const unsafeBehaviors = this.lookupUnsafeBehaviors(scenario.associatedUnsafeBehaviorIds);
          return {
            scenario,
            unsafeBehaviors,
            hazards: this.uniqueValues(unsafeBehaviors.flatMap((behavior) => behavior.hazards))
          };
        })
    }))
  );

  readonly draftLossScenarioBehaviors = computed(() =>
    this.lookupUnsafeBehaviors(this.lossScenarioForm.controls.associatedUnsafeBehaviorIds.value ?? [])
  );

  readonly draftLossScenarioHazards = computed(() =>
    this.uniqueValues(this.draftLossScenarioBehaviors().flatMap((behavior) => behavior.hazards))
  );

  readonly draftRequirementScenarios = computed(() =>
    (this.safetyRequirementForm.controls.addressedLossScenarioIds.value ?? [])
      .map((scenarioId) => this.findLossScenario(scenarioId))
      .filter((scenario): scenario is LossScenario => !!scenario)
  );

  openBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  generateStepFiveWithAi(): void {
    if (this.isGeneratingStepFiveAi()) {
      return;
    }

    if (this.unsafeBehaviorCatalog().length === 0) {
      this.stepFiveSaveMessage.set(null);
      this.stepFiveSaveError.set('Load the Step 5 unsafe behavior catalog before generating with AI.');
      return;
    }

    const question = this.buildStepFiveAiPrompt();
    const context = JSON.stringify(
      {
        unsafeBehaviors: this.unsafeBehaviorCatalog(),
        currentData: {
          lossScenarios: this.lossScenarios(),
          safetyRequirements: this.safetyRequirements()
        }
      },
      null,
      2
    );

    this.isGeneratingStepFiveAi.set(true);
    this.stepFiveSaveMessage.set(null);
    this.stepFiveSaveError.set(null);

    this.aiAssistant
      .ask({ question, context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGeneratingStepFiveAi.set(false))
      )
      .subscribe({
        next: (response) => {
          const draft = this.parseStepFiveAiDraft(response);
          if (!draft) {
            this.stepFiveSaveError.set('AI returned an invalid Step 5 payload.');
            return;
          }

          this.applyStepFiveAiDraft(draft);
          this.stepFiveSaveMessage.set('AI proposal applied to Step 5. Review and save when ready.');
        },
        error: (error) => {
          this.stepFiveSaveMessage.set(null);
          this.stepFiveSaveError.set('Failed to generate Step 5 content with AI.');
          console.error('Failed to generate Step 5 content via /api/ai/ask', error);
        }
      });
  }

  controlInvalid(
    formName: 'lossScenarioForm' | 'safetyRequirementForm',
    controlName: 'id' | 'description' | 'associatedUnsafeBehaviorIds' | 'sourceRationale' | 'addressedLossScenarioIds'
  ): boolean {
    const control =
      formName === 'lossScenarioForm'
        ? this.lossScenarioForm.controls[
            controlName as 'id' | 'description' | 'associatedUnsafeBehaviorIds' | 'sourceRationale'
          ]
        : this.safetyRequirementForm.controls[
            controlName as 'id' | 'description' | 'addressedLossScenarioIds'
          ];

    return !!control && control.invalid && (control.touched || control.dirty);
  }

  addLossScenario(): void {
    if (this.lossScenarioForm.invalid) {
      this.lossScenarioForm.markAllAsTouched();
      return;
    }

    const value = this.lossScenarioForm.getRawValue();
    const nextId = value.id ?? this.nextLossScenarioId();
    this.lossScenarios.update((current) => [
      {
        id: nextId,
        description: value.description ?? '',
        associatedUnsafeBehaviorIds: value.associatedUnsafeBehaviorIds ?? [],
        sourceRationale: value.sourceRationale?.trim() ?? ''
      },
      ...current
    ]);

    this.nextLossScenarioId.set(this.incrementId(nextId, 'LS'));

    this.lossScenarioForm.reset({
      id: this.nextLossScenarioId(),
      description: '',
      associatedUnsafeBehaviorIds: [],
      sourceRationale: ''
    });
  }

  addSafetyRequirement(): void {
    if (this.safetyRequirementForm.invalid) {
      this.safetyRequirementForm.markAllAsTouched();
      return;
    }

    const value = this.safetyRequirementForm.getRawValue();
    const nextId = value.id ?? this.nextSafetyRequirementId();
    this.safetyRequirements.update((current) => [
      {
        id: nextId,
        description: value.description ?? '',
        addressedLossScenarioIds: value.addressedLossScenarioIds ?? []
      },
      ...current
    ]);

    this.nextSafetyRequirementId.set(this.incrementId(nextId, 'SR'));

    this.safetyRequirementForm.reset({
      id: this.nextSafetyRequirementId(),
      description: '',
      addressedLossScenarioIds: []
    });
  }

  saveStepFive(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId || projectId <= 0) {
      this.stepFiveSaveMessage.set(null);
      this.stepFiveSaveError.set('Missing valid project id. Step 5 cannot be saved.');
      console.warn('Missing projectId; cannot save Step 5 information.');
      return;
    }

    if (this.isSavingStepFive()) {
      return;
    }

    this.stepFiveSaveMessage.set(null);
    this.stepFiveSaveError.set(null);

    const payload: StepFiveProjectUpdatePayload = {
      id: projectId,
      step5Information: {
        lossScenarios: this.lossScenarios().map((item) => ({
          id: item.id,
          description: item.description,
          associatedUnsafeBehaviorIds: item.associatedUnsafeBehaviorIds,
          sourceRationale: item.sourceRationale || null
        })),
        safetyRequirements: this.safetyRequirements().map((item) => ({
          id: item.id,
          description: item.description,
          addressedLossScenarioIds: item.addressedLossScenarioIds
        }))
      }
    };

    this.isSavingStepFive.set(true);

    this.projectService
      .updateStepFiveInformation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingStepFive.set(false))
      )
      .subscribe({
        next: (response) => {
          this.hydrateFromStepFiveInformation(response);
          this.stepFiveSaveError.set(null);
          this.stepFiveSaveMessage.set(
            continueAfterSave ? 'Step 5 saved. Opening the next step.' : 'Step 5 saved successfully.'
          );

          if (continueAfterSave) {
            this.router.navigate(['/model-update'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          this.stepFiveSaveMessage.set(null);
          this.stepFiveSaveError.set(this.getStepFiveSaveErrorMessage(error));
          console.error(
            'Failed to update Step 5 information via POST /api/projects/step_five_project_update',
            error
          );
        }
      });
  }

  behaviorLabel(behaviorId: string): string {
    const behavior = this.unsafeBehaviorCatalog().find((item) => item.id === behaviorId);
    return behavior ? `${behavior.id} (${behavior.type})` : behaviorId;
  }

  lossScenarioHazards(lossScenario: LossScenario): string[] {
    return this.uniqueValues(
      this.lookupUnsafeBehaviors(lossScenario.associatedUnsafeBehaviorIds).flatMap((behavior) => behavior.hazards)
    );
  }

  private lookupUnsafeBehaviors(ids: string[]): UnsafeBehaviorOption[] {
    return ids
      .map((id) => this.unsafeBehaviorCatalog().find((item) => item.id === id))
      .filter((item): item is UnsafeBehaviorOption => !!item);
  }

  private findLossScenario(id: string): LossScenario | undefined {
    return this.lossScenarios().find((scenario) => scenario.id === id);
  }

  private uniqueValues(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private hydrateFromStepFiveInformation(response: StepFiveProjectInformation): void {
    this.unsafeBehaviorCatalog.set(
      (response.availableInputs.unsafeBehaviors ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description ?? '',
        hazards: item.hazards ?? []
      }))
    );

    this.lossScenarios.set(
      (response.currentData.lossScenarios ?? []).map((item) => ({
        id: item.id,
        description: item.description ?? '',
        associatedUnsafeBehaviorIds: item.associatedUnsafeBehaviorIds ?? [],
        sourceRationale: item.sourceRationale ?? ''
      }))
    );

    this.safetyRequirements.set(
      (response.currentData.safetyRequirements ?? []).map((item) => ({
        id: item.id,
        description: item.description ?? '',
        addressedLossScenarioIds: item.addressedLossScenarioIds ?? []
      }))
    );

    this.nextLossScenarioId.set(response.defaults.nextLossScenarioId || 'LS-01');
    this.nextSafetyRequirementId.set(response.defaults.nextSafetyRequirementId || 'SR-01');

    this.lossScenarioForm.patchValue({
      id: this.nextLossScenarioId()
    });

    this.safetyRequirementForm.patchValue({
      id: this.nextSafetyRequirementId()
    });
  }

  private resetStepFiveState(): void {
    this.currentProjectId.set(null);
    this.unsafeBehaviorCatalog.set([]);
    this.lossScenarios.set([]);
    this.safetyRequirements.set([]);
    this.nextLossScenarioId.set('LS-01');
    this.nextSafetyRequirementId.set('SR-01');
    this.stepFiveSaveMessage.set(null);
    this.stepFiveSaveError.set(null);

    this.lossScenarioForm.reset({
      id: 'LS-01',
      description: '',
      associatedUnsafeBehaviorIds: [],
      sourceRationale: ''
    });

    this.safetyRequirementForm.reset({
      id: 'SR-01',
      description: '',
      addressedLossScenarioIds: []
    });
  }

  private incrementId(id: string, prefix: 'LS' | 'SR'): string {
    const match = id.match(new RegExp(`${prefix}-(\\d+)`, 'i'));
    const nextNumber = match ? Number(match[1]) + 1 : 1;
    return `${prefix}-${String(nextNumber).padStart(2, '0')}`;
  }

  private getStepFiveSaveErrorMessage(error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error['status']) : undefined;

    if (status === 404) {
      return 'Project not found. The backend returned 404 while saving Step 5.';
    }

    if (status === 400) {
      return 'Failed to save Step 5. The backend rejected the step5Information payload.';
    }

    if (status && status >= 400) {
      return `Failed to save Step 5. The backend returned status ${status}.`;
    }

    return 'Failed to save Step 5 due to an unexpected error.';
  }

  private buildStepFiveAiPrompt(): string {
    return `You are generating a complete Step 5 loss-scenario and safety-requirement draft.

Return JSON only. Do not include markdown fences or commentary.

Return an object with this exact shape:
{
  "lossScenarios": [{
    "id": "LS-01",
    "description": "",
    "associatedUnsafeBehaviorIds": ["UCA-01"],
    "sourceRationale": ""
  }],
  "safetyRequirements": [{
    "id": "SR-01",
    "description": "",
    "addressedLossScenarioIds": ["LS-01"]
  }]
}

Rules:
- Use only unsafe behavior ids from the provided unsafeBehaviors catalog.
- Every loss scenario must reference at least one unsafe behavior.
- Every safety requirement must reference at least one generated loss scenario.
- Preserve valid existing currentData when possible and fill missing traceability data.
- Avoid duplicates.`;
  }

  private parseStepFiveAiDraft(response: unknown): StepFiveAiDraft | null {
    const parsed = this.parseAiJsonResponse(response);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as StepFiveAiDraft;
  }

  private applyStepFiveAiDraft(draft: StepFiveAiDraft): void {
    const validUnsafeBehaviorIds = new Set(this.unsafeBehaviorCatalog().map((item) => item.id));

    let nextLossScenarioIndex = 0;
    const normalizedLossScenarios = (draft.lossScenarios ?? [])
      .map((item) => {
        const description = (item.description ?? '').trim();
        const associatedUnsafeBehaviorIds = this.uniqueValues(item.associatedUnsafeBehaviorIds ?? []).filter((id) => validUnsafeBehaviorIds.has(id));
        if (!description || associatedUnsafeBehaviorIds.length === 0) {
          return null;
        }

        nextLossScenarioIndex += 1;
        return {
          id: `LS-${String(nextLossScenarioIndex).padStart(2, '0')}`,
          description,
          associatedUnsafeBehaviorIds,
          sourceRationale: (item.sourceRationale ?? '').trim()
        } as LossScenario;
      })
      .filter((item): item is LossScenario => !!item);

    const validLossScenarioIds = new Set(normalizedLossScenarios.map((item) => item.id));

    let nextSafetyRequirementIndex = 0;
    const normalizedSafetyRequirements = (draft.safetyRequirements ?? [])
      .map((item) => {
        const description = (item.description ?? '').trim();
        const addressedLossScenarioIds = this.uniqueValues(item.addressedLossScenarioIds ?? []).filter((id) => validLossScenarioIds.has(id));
        if (!description || addressedLossScenarioIds.length === 0) {
          return null;
        }

        nextSafetyRequirementIndex += 1;
        return {
          id: `SR-${String(nextSafetyRequirementIndex).padStart(2, '0')}`,
          description,
          addressedLossScenarioIds
        } as SafetyRequirement;
      })
      .filter((item): item is SafetyRequirement => !!item);

    this.lossScenarios.set(normalizedLossScenarios);
    this.safetyRequirements.set(normalizedSafetyRequirements);
    this.nextLossScenarioId.set(`LS-${String(normalizedLossScenarios.length + 1).padStart(2, '0')}`);
    this.nextSafetyRequirementId.set(`SR-${String(normalizedSafetyRequirements.length + 1).padStart(2, '0')}`);
    this.lossScenarioForm.patchValue({ id: this.nextLossScenarioId() });
    this.safetyRequirementForm.patchValue({ id: this.nextSafetyRequirementId() });
  }

  private parseAiJsonResponse(response: unknown): unknown {
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      return response;
    }

    const text = this.extractAiResponseText(response);
    if (!text) {
      return null;
    }

    const normalized = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const candidates = [normalized];
    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractAiResponseText(response: unknown): string {
    if (typeof response === 'string') {
      return response.trim();
    }

    if (!response || typeof response !== 'object') {
      return '';
    }

    const anyResponse = response as Record<string, unknown>;
    const directFields = ['answer', 'response', 'text', 'content', 'message', 'result'];

    for (const key of directFields) {
      const value = anyResponse[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const choices = anyResponse['choices'];
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown> | undefined;
      if (first) {
        const message = first['message'] as Record<string, unknown> | undefined;
        const messageContent = message?.['content'];
        if (typeof messageContent === 'string' && messageContent.trim()) {
          return messageContent.trim();
        }

        const text = first['text'];
        if (typeof text === 'string' && text.trim()) {
          return text.trim();
        }
      }
    }

    return '';
  }
}
