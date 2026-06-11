import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap, tap } from 'rxjs';
import { AiAssistantService } from '../../services/ai-assistant.service';

import {
  ProjectService,
  StepSixInjectedLossScenario,
  StepSixInjectedSafetyRequirement,
  StepSixInjectedUnsafeBehavior,
  StepSixLossScenarioOption,
  StepSixProjectInformation,
  StepSixProjectUpdatePayload,
  StepSixResponsibilityOption,
  StepSixSafetyRequirementOption,
  StepSixUnsafeBehaviorOption,
  StepSixVerificationResult
} from '../../services/project.service';

type ViewMode = 'SR' | 'SD';
type SafetyElementType = 'SafetyGoal' | 'Hazard' | 'SafetyTask';
type MitigationRelationshipType = 'OR' | 'AND';

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function requireSelection(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    return Array.isArray(value) && value.length > 0 ? null : { required: true };
  };
}

interface StepSixAiDraft {
  injectedUnsafeBehaviors?: Array<{
    responsibilityId?: string;
    unsafeBehaviorId?: string;
  }>;
  injectedLossScenarios?: Array<{
    targetUnsafeBehaviorId?: string;
    lossScenarioId?: string;
  }>;
  injectedSafetyRequirements?: Array<{
    targetLossScenarioId?: string;
    safetyRequirementId?: string;
    relationshipType?: string;
  }>;
  currentView?: string;
}

@Component({
  selector: 'app-model-update-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './model-update-page.component.html',
  styleUrl: './model-update-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelUpdatePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentProjectId = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly isSavingStepSix = signal(false);
  readonly isGeneratingStepSixAi = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly stepSixSaveMessage = signal<string | null>(null);
  readonly stepSixSaveError = signal<string | null>(null);
  readonly isBpmnModelModalOpen = signal(false);

  readonly responsibilities = signal<StepSixResponsibilityOption[]>([]);
  readonly unsafeBehaviors = signal<StepSixUnsafeBehaviorOption[]>([]);
  readonly lossScenarios = signal<StepSixLossScenarioOption[]>([]);
  readonly safetyRequirements = signal<StepSixSafetyRequirementOption[]>([]);

  readonly injectUnsafeBehaviorForm = this.fb.group({
    responsibilityId: ['', Validators.required],
    unsafeBehaviorId: ['', Validators.required],
    elementType: [{ value: 'SafetyTask' as SafetyElementType, disabled: true }, Validators.required],
    establishObstructsLink: [false, Validators.requiredTrue]
  });

  readonly injectLossScenarioForm = this.fb.group({
    targetUnsafeBehaviorId: ['', Validators.required],
    contributingLossScenarioIds: [[] as string[], [requireSelection()]],
    elementType: [{ value: 'Hazard' as SafetyElementType, disabled: true }, Validators.required],
    establishTriggerLink: [false, Validators.requiredTrue]
  });

  readonly injectSafetyRequirementForm = this.fb.group({
    targetLossScenarioId: ['', Validators.required],
    safetyRequirementIds: [[] as string[], [requireSelection()]],
    elementType: [{ value: 'SafetyTask' as SafetyElementType, disabled: true }, Validators.required],
    relationshipType: ['OR' as MitigationRelationshipType, Validators.required]
  });

  readonly injectedUnsafeBehaviors = signal<StepSixInjectedUnsafeBehavior[]>([]);

  readonly injectedLossScenarios = signal<StepSixInjectedLossScenario[]>([]);

  readonly injectedSafetyRequirements = signal<StepSixInjectedSafetyRequirement[]>([]);

  readonly currentView = signal<ViewMode>('SR');
  readonly viewStatusMessage = signal('Strategic Rationale view is active. Internal safety reasoning is visible.');
  readonly verificationResult = signal<StepSixVerificationResult | null>(null);

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
            this.resetStepSixState();
            this.isLoading.set(false);
            return EMPTY;
          }

          return this.projectService.getStepSixInformation(projectId).pipe(
            tap((response) => this.hydrateFromStepSixInformation(response)),
            catchError((error) => {
              console.error(
                'Failed to fetch Step 6 information via GET /api/projects/step_six_project_information/{id}',
                error
              );
              this.loadError.set(
                error?.status === 404
                  ? 'No Step 6 project document exists for the selected project.'
                  : 'Failed to load Step 6 information for the selected project.'
              );
              this.resetStepSixState();
              return EMPTY;
            }),
            finalize(() => this.isLoading.set(false))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  readonly summaryCards = computed(() => [
    { label: 'Responsibilities available', value: this.responsibilities().length },
    { label: 'Unsafe behaviors injected', value: this.injectedUnsafeBehaviors().length },
    { label: 'Loss scenarios injected', value: this.injectedLossScenarios().length },
    { label: 'Safety requirements injected', value: this.injectedSafetyRequirements().length }
  ]);

  readonly filteredUnsafeBehaviors = computed(() => {
    const responsibilityId = this.injectUnsafeBehaviorForm.controls.responsibilityId.value ?? '';
    return this.unsafeBehaviors().filter((item) => item.responsibilityId === responsibilityId);
  });

  readonly availableUnsafeBehaviorTargets = computed(() =>
    this.injectedUnsafeBehaviors()
      .map((entry) => this.findUnsafeBehavior(entry.unsafeBehaviorId))
      .filter((entry): entry is StepSixUnsafeBehaviorOption => !!entry)
  );

  readonly filteredLossScenarios = computed(() => {
    const targetId = this.injectLossScenarioForm.controls.targetUnsafeBehaviorId.value ?? '';
    return this.lossScenarios().filter((scenario) => scenario.unsafeBehaviorIds.includes(targetId));
  });

  readonly availableLossScenarioTargets = computed(() =>
    this.injectedLossScenarios()
      .map((entry) => this.findLossScenario(entry.lossScenarioId))
      .filter((entry): entry is StepSixLossScenarioOption => !!entry)
  );

  readonly filteredSafetyRequirements = computed(() => {
    const targetLossScenarioId = this.injectSafetyRequirementForm.controls.targetLossScenarioId.value ?? '';
    return this.safetyRequirements().filter((requirement) => requirement.lossScenarioIds.includes(targetLossScenarioId));
  });

  readonly sdGuardrailIssues = computed(() => {
    const orphanedHazards = this.injectedLossScenarios().filter(
      (entry) => !this.injectedUnsafeBehaviors().some((unsafe) => unsafe.unsafeBehaviorId === entry.targetUnsafeBehaviorId)
    );

    const orphanedRequirements = this.injectedSafetyRequirements().filter(
      (entry) => !this.injectedLossScenarios().some((lossScenario) => lossScenario.lossScenarioId === entry.targetLossScenarioId)
    );

    const externalDependencyViolations: string[] = [];

    if (orphanedHazards.length > 0) {
      externalDependencyViolations.push('Some loss scenarios are linked to UCA/HC targets that are not present in the SR model.');
    }

    if (orphanedRequirements.length > 0) {
      externalDependencyViolations.push('Some safety requirements are linked to loss scenarios that are not present in the SR model.');
    }

    return externalDependencyViolations;
  });

  readonly fullChainReady = computed(() => this.computeVerificationErrors().length === 0);

  openBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  generateStepSixWithAi(): void {
    if (this.isGeneratingStepSixAi()) {
      return;
    }

    if (this.responsibilities().length === 0 || this.unsafeBehaviors().length === 0) {
      this.stepSixSaveMessage.set(null);
      this.stepSixSaveError.set('Load the Step 6 catalogs before generating with AI.');
      return;
    }

    const question = this.buildStepSixAiPrompt();
    const context = JSON.stringify(
      {
        responsibilities: this.responsibilities(),
        unsafeBehaviors: this.unsafeBehaviors(),
        lossScenarios: this.lossScenarios(),
        safetyRequirements: this.safetyRequirements(),
        currentData: {
          injectedUnsafeBehaviors: this.injectedUnsafeBehaviors(),
          injectedLossScenarios: this.injectedLossScenarios(),
          injectedSafetyRequirements: this.injectedSafetyRequirements(),
          currentView: this.currentView()
        }
      },
      null,
      2
    );

    this.isGeneratingStepSixAi.set(true);
    this.stepSixSaveMessage.set(null);
    this.stepSixSaveError.set(null);

    this.aiAssistant
      .ask({ question, context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGeneratingStepSixAi.set(false))
      )
      .subscribe({
        next: (response) => {
          const draft = this.parseStepSixAiDraft(response);
          if (!draft) {
            this.stepSixSaveError.set('AI returned an invalid Step 6 payload.');
            return;
          }

          this.applyStepSixAiDraft(draft);
          this.runVerification();
          this.stepSixSaveMessage.set('AI proposal applied to Step 6. Review and save when ready.');
        },
        error: (error) => {
          this.stepSixSaveMessage.set(null);
          this.stepSixSaveError.set('Failed to generate Step 6 content with AI.');
          console.error('Failed to generate Step 6 content via /api/ai/ask', error);
        }
      });
  }

  controlInvalid(
    formName: 'injectUnsafeBehaviorForm' | 'injectLossScenarioForm' | 'injectSafetyRequirementForm',
    controlName:
      | 'responsibilityId'
      | 'unsafeBehaviorId'
      | 'establishObstructsLink'
      | 'targetUnsafeBehaviorId'
      | 'contributingLossScenarioIds'
      | 'establishTriggerLink'
      | 'targetLossScenarioId'
      | 'safetyRequirementIds'
      | 'relationshipType'
  ): boolean {
    if (formName === 'injectUnsafeBehaviorForm') {
      const control = this.injectUnsafeBehaviorForm.controls[
        controlName as 'responsibilityId' | 'unsafeBehaviorId' | 'establishObstructsLink'
      ];
      return control.invalid && (control.touched || control.dirty);
    }

    if (formName === 'injectLossScenarioForm') {
      const control = this.injectLossScenarioForm.controls[
        controlName as 'targetUnsafeBehaviorId' | 'contributingLossScenarioIds' | 'establishTriggerLink'
      ];
      return control.invalid && (control.touched || control.dirty);
    }

    const control = this.injectSafetyRequirementForm.controls[
      controlName as 'targetLossScenarioId' | 'safetyRequirementIds' | 'relationshipType'
    ];
    return control.invalid && (control.touched || control.dirty);
  }

  addInjectedUnsafeBehavior(): void {
    if (this.injectUnsafeBehaviorForm.invalid) {
      this.injectUnsafeBehaviorForm.markAllAsTouched();
      return;
    }

    const value = this.injectUnsafeBehaviorForm.getRawValue();
    const responsibilityId = value.responsibilityId ?? '';
    const unsafeBehaviorId = value.unsafeBehaviorId ?? '';
    const alreadyExists = this.injectedUnsafeBehaviors().some(
      (entry) => entry.responsibilityId === responsibilityId && entry.unsafeBehaviorId === unsafeBehaviorId
    );

    if (!alreadyExists && responsibilityId && unsafeBehaviorId) {
      this.injectedUnsafeBehaviors.update((current) => [
        {
          responsibilityId,
          unsafeBehaviorId,
          elementType: 'SafetyTask',
          obstructsLinked: true
        },
        ...current
      ]);
    }

    this.injectUnsafeBehaviorForm.reset({
      responsibilityId: '',
      unsafeBehaviorId: '',
      establishObstructsLink: false
    });
  }

  addInjectedLossScenarios(): void {
    if (this.injectLossScenarioForm.invalid) {
      this.injectLossScenarioForm.markAllAsTouched();
      return;
    }

    const value = this.injectLossScenarioForm.getRawValue();
    const targetUnsafeBehaviorId = value.targetUnsafeBehaviorId ?? '';
    const selectedLossScenarioIds = value.contributingLossScenarioIds ?? [];

    this.injectedLossScenarios.update((current) => {
      const additions = selectedLossScenarioIds
        .filter(
          (lossScenarioId) =>
            !current.some(
              (entry) => entry.targetUnsafeBehaviorId === targetUnsafeBehaviorId && entry.lossScenarioId === lossScenarioId
            )
        )
        .map((lossScenarioId) => ({
          targetUnsafeBehaviorId,
          lossScenarioId,
          elementType: 'Hazard' as const,
          triggerLinked: true as const
        }));

      return [...additions, ...current];
    });

    this.injectLossScenarioForm.reset({
      targetUnsafeBehaviorId: '',
      contributingLossScenarioIds: [],
      establishTriggerLink: false
    });
  }

  addInjectedSafetyRequirements(): void {
    if (this.injectSafetyRequirementForm.invalid) {
      this.injectSafetyRequirementForm.markAllAsTouched();
      return;
    }

    const value = this.injectSafetyRequirementForm.getRawValue();
    const targetLossScenarioId = value.targetLossScenarioId ?? '';
    const selectedRequirementIds = value.safetyRequirementIds ?? [];
    const relationshipType = (value.relationshipType ?? 'OR') as MitigationRelationshipType;

    this.injectedSafetyRequirements.update((current) => {
      const additions = selectedRequirementIds
        .filter(
          (safetyRequirementId) =>
            !current.some(
              (entry) => entry.targetLossScenarioId === targetLossScenarioId && entry.safetyRequirementId === safetyRequirementId
            )
        )
        .map((safetyRequirementId) => ({
          targetLossScenarioId,
          safetyRequirementId,
          elementType: 'SafetyTask' as const,
          relationshipType
        }));

      return [...additions, ...current];
    });

    this.injectSafetyRequirementForm.reset({
      targetLossScenarioId: '',
      safetyRequirementIds: [],
      relationshipType: 'OR'
    });
  }

  onResponsibilityChange(): void {
    this.injectUnsafeBehaviorForm.patchValue({ unsafeBehaviorId: '' });
  }

  onUnsafeBehaviorTargetChange(): void {
    this.injectLossScenarioForm.patchValue({ contributingLossScenarioIds: [] });
  }

  onLossScenarioTargetChange(): void {
    this.injectSafetyRequirementForm.patchValue({ safetyRequirementIds: [], relationshipType: 'OR' });
  }

  generateSdView(): void {
    const issues = this.sdGuardrailIssues();
    if (issues.length > 0) {
      this.currentView.set('SR');
      this.viewStatusMessage.set(`SD view blocked: ${issues[0]}`);
      return;
    }

    this.currentView.set('SD');
    this.viewStatusMessage.set('Strategic Dependency view generated. Internal safety elements are collapsed and no invalid safety dependencies were detected.');
  }

  generateSrView(): void {
    this.currentView.set('SR');
    this.viewStatusMessage.set('Strategic Rationale view generated. Internal actor boundaries are expanded to show UCA/HC, loss scenario, and safety requirement reasoning.');
  }

  runVerification(): void {
    const errors = this.computeVerificationErrors();
    this.verificationResult.set({
      ranAt: new Date().toLocaleString(),
      passed: errors.length === 0,
      checks: [
        'Every injected Safety Element ID matches a record from Steps 1-5.',
        'Every Safety Requirement connects to a Loss Scenario, which connects to a UCA/HC, which obstructs a Responsibility.'
      ],
      errors
    });
  }

  saveStepSix(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId || projectId <= 0) {
      this.stepSixSaveMessage.set(null);
      this.stepSixSaveError.set('Missing valid project id. Step 6 cannot be saved.');
      console.warn('Missing projectId; cannot save Step 6 information.');
      return;
    }

    if (this.isSavingStepSix()) {
      return;
    }

    this.stepSixSaveMessage.set(null);
    this.stepSixSaveError.set(null);

    const payload: StepSixProjectUpdatePayload = {
      id: projectId,
      step6Information: {
        injectedUnsafeBehaviors: this.injectedUnsafeBehaviors(),
        injectedLossScenarios: this.injectedLossScenarios(),
        injectedSafetyRequirements: this.injectedSafetyRequirements()
      }
    };

    this.isSavingStepSix.set(true);

    this.projectService
      .updateStepSixInformation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingStepSix.set(false))
      )
      .subscribe({
        next: (response) => {
          this.hydrateFromStepSixInformation(response);
          this.stepSixSaveError.set(null);
          this.stepSixSaveMessage.set(
            continueAfterSave ? 'Step 6 saved. Opening the next step.' : 'Step 6 saved successfully.'
          );

          if (continueAfterSave) {
            this.router.navigate(['/model-update'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          this.stepSixSaveMessage.set(null);
          this.stepSixSaveError.set(this.getStepSixSaveErrorMessage(error));
          console.error(
            'Failed to update Step 6 information via POST /api/projects/step_six_project_update',
            error
          );
        }
      });
  }

  responsibilityLabel(responsibilityId: string): string {
    const responsibility = this.responsibilities().find((item) => item.id === responsibilityId);

    return responsibility ? `${responsibility.id} - ${responsibility.name}` : responsibilityId;
  }

  unsafeBehaviorLabel(unsafeBehaviorId: string): string {
    const behavior = this.findUnsafeBehavior(unsafeBehaviorId);
    return behavior ? `${behavior.id} (${behavior.type}) - ${behavior.description}` : unsafeBehaviorId;
  }

  lossScenarioLabel(lossScenarioId: string): string {
    const lossScenario = this.findLossScenario(lossScenarioId);
    return lossScenario ? `${lossScenario.id} - ${lossScenario.description}` : lossScenarioId;
  }

  safetyRequirementLabel(safetyRequirementId: string): string {
    const safetyRequirement = this.findSafetyRequirement(safetyRequirementId);
    return safetyRequirement ? `${safetyRequirement.id} - ${safetyRequirement.description}` : safetyRequirementId;
  }

  suggestedRelationshipType(): MitigationRelationshipType {
    const selectedCount = (this.injectSafetyRequirementForm.controls.safetyRequirementIds.value ?? []).length;
    return selectedCount > 1 ? 'OR' : ((this.injectSafetyRequirementForm.controls.relationshipType.value ?? 'OR') as MitigationRelationshipType);
  }

  private computeVerificationErrors(): string[] {
    const errors: string[] = [];

    for (const entry of this.injectedUnsafeBehaviors()) {
      if (!this.responsibilities().some((item) => item.id === entry.responsibilityId)) {
        errors.push(`Responsibility '${entry.responsibilityId}' is missing from the Step 2.2 catalog.`);
      }

      const unsafeBehavior = this.findUnsafeBehavior(entry.unsafeBehaviorId);
      if (!unsafeBehavior) {
        errors.push(`Unsafe behavior '${entry.unsafeBehaviorId}' is missing from the Step 4 catalog.`);
        continue;
      }

      if (unsafeBehavior.responsibilityId !== entry.responsibilityId) {
        errors.push(`Unsafe behavior '${entry.unsafeBehaviorId}' does not trace to responsibility '${entry.responsibilityId}'.`);
      }

      if (!entry.obstructsLinked) {
        errors.push(`Unsafe behavior '${entry.unsafeBehaviorId}' must obstruct a responsibility.`);
      }
    }

    for (const entry of this.injectedLossScenarios()) {
      const lossScenario = this.findLossScenario(entry.lossScenarioId);
      if (!lossScenario) {
        errors.push(`Loss scenario '${entry.lossScenarioId}' is missing from the Step 5 catalog.`);
        continue;
      }

      if (!lossScenario.unsafeBehaviorIds.includes(entry.targetUnsafeBehaviorId)) {
        errors.push(`Loss scenario '${entry.lossScenarioId}' is not linked to '${entry.targetUnsafeBehaviorId}'.`);
      }

      if (!this.injectedUnsafeBehaviors().some((unsafe) => unsafe.unsafeBehaviorId === entry.targetUnsafeBehaviorId && unsafe.obstructsLinked)) {
        errors.push(`Loss scenario '${entry.lossScenarioId}' points to '${entry.targetUnsafeBehaviorId}' without an obstructs link to a responsibility.`);
      }
    }

    for (const entry of this.injectedSafetyRequirements()) {
      const safetyRequirement = this.findSafetyRequirement(entry.safetyRequirementId);
      if (!safetyRequirement) {
        errors.push(`Safety requirement '${entry.safetyRequirementId}' is missing from the Step 5.3 catalog.`);
        continue;
      }

      if (!safetyRequirement.lossScenarioIds.includes(entry.targetLossScenarioId)) {
        errors.push(`Safety requirement '${entry.safetyRequirementId}' is not justified by '${entry.targetLossScenarioId}'.`);
      }

      if (!this.injectedLossScenarios().some((lossScenario) => lossScenario.lossScenarioId === entry.targetLossScenarioId && lossScenario.triggerLinked)) {
        errors.push(`Safety requirement '${entry.safetyRequirementId}' connects to a loss scenario that has not been injected as a hazard.`);
      }
    }

    for (const lossScenario of this.injectedLossScenarios()) {
      const hasMitigation = this.injectedSafetyRequirements().some(
        (safetyRequirement) => safetyRequirement.targetLossScenarioId === lossScenario.lossScenarioId
      );
      if (!hasMitigation) {
        errors.push(`Loss scenario '${lossScenario.lossScenarioId}' is orphaned because no safety requirement mitigates it.`);
      }
    }

    for (const safetyRequirement of this.injectedSafetyRequirements()) {
      if (!this.injectedLossScenarios().some((lossScenario) => lossScenario.lossScenarioId === safetyRequirement.targetLossScenarioId)) {
        errors.push(`Safety requirement '${safetyRequirement.safetyRequirementId}' is orphaned because its target loss scenario is missing.`);
      }
    }

    return errors;
  }

  private findUnsafeBehavior(id: string): StepSixUnsafeBehaviorOption | undefined {
    return this.unsafeBehaviors().find((item) => item.id === id);
  }

  private findLossScenario(id: string): StepSixLossScenarioOption | undefined {
    return this.lossScenarios().find((item) => item.id === id);
  }

  private findSafetyRequirement(id: string): StepSixSafetyRequirementOption | undefined {
    return this.safetyRequirements().find((item) => item.id === id);
  }

  private hydrateFromStepSixInformation(response: StepSixProjectInformation): void {
    this.responsibilities.set(response.responsibilities ?? []);
    this.unsafeBehaviors.set(response.unsafeBehaviors ?? []);
    this.lossScenarios.set(response.lossScenarios ?? []);
    this.safetyRequirements.set(response.safetyRequirements ?? []);
    this.injectedUnsafeBehaviors.set(response.injectedUnsafeBehaviors ?? []);
    this.injectedLossScenarios.set(response.injectedLossScenarios ?? []);
    this.injectedSafetyRequirements.set(response.injectedSafetyRequirements ?? []);
    this.currentView.set(response.currentView ?? 'SR');
    this.verificationResult.set(response.verificationResult ?? null);
    this.viewStatusMessage.set(
      (response.currentView ?? 'SR') === 'SD'
        ? 'Strategic Dependency view is active. Internal safety reasoning is collapsed.'
        : 'Strategic Rationale view is active. Internal safety reasoning is visible.'
    );
    this.resetForms();
  }

  private resetStepSixState(): void {
    this.currentProjectId.set(null);
    this.responsibilities.set([]);
    this.unsafeBehaviors.set([]);
    this.lossScenarios.set([]);
    this.safetyRequirements.set([]);
    this.injectedUnsafeBehaviors.set([]);
    this.injectedLossScenarios.set([]);
    this.injectedSafetyRequirements.set([]);
    this.currentView.set('SR');
    this.verificationResult.set(null);
    this.viewStatusMessage.set('Strategic Rationale view is active. Internal safety reasoning is visible.');
    this.stepSixSaveMessage.set(null);
    this.stepSixSaveError.set(null);
    this.resetForms();
  }

  private resetForms(): void {
    this.injectUnsafeBehaviorForm.reset({
      responsibilityId: '',
      unsafeBehaviorId: '',
      establishObstructsLink: false
    });
    this.injectLossScenarioForm.reset({
      targetUnsafeBehaviorId: '',
      contributingLossScenarioIds: [],
      establishTriggerLink: false
    });
    this.injectSafetyRequirementForm.reset({
      targetLossScenarioId: '',
      safetyRequirementIds: [],
      relationshipType: 'OR'
    });
  }

  private getStepSixSaveErrorMessage(error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error['status']) : undefined;

    if (status === 404) {
      return 'Project not found. The backend returned 404 while saving Step 6.';
    }

    if (status === 400) {
      return 'Failed to save Step 6. The backend rejected the step6Information payload.';
    }

    if (status && status >= 400) {
      return `Failed to save Step 6. The backend returned status ${status}.`;
    }

    return 'Failed to save Step 6 due to an unexpected error.';
  }

  private buildStepSixAiPrompt(): string {
    return `You are generating a complete Step 6 iStar4Safety update draft.

Return JSON only. Do not include markdown fences or commentary.

Return an object with this exact shape:
{
  "injectedUnsafeBehaviors": [{ "responsibilityId": "", "unsafeBehaviorId": "" }],
  "injectedLossScenarios": [{ "targetUnsafeBehaviorId": "", "lossScenarioId": "" }],
  "injectedSafetyRequirements": [{ "targetLossScenarioId": "", "safetyRequirementId": "", "relationshipType": "OR" }],
  "currentView": "SR"
}

Rules:
- Use only ids from the provided catalogs.
- Each injectedUnsafeBehavior must pair an unsafe behavior with its matching responsibilityId.
- Each injectedLossScenario must target an unsafe behavior listed on that loss scenario.
- Each injectedSafetyRequirement must target a loss scenario listed on that safety requirement.
- relationshipType must be OR or AND.
- Prefer SR view unless SD is clearly consistent.
- Preserve valid existing currentData when possible and fill missing traceability links.
- Avoid duplicates.`;
  }

  private parseStepSixAiDraft(response: unknown): StepSixAiDraft | null {
    const parsed = this.parseAiJsonResponse(response);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as StepSixAiDraft;
  }

  private applyStepSixAiDraft(draft: StepSixAiDraft): void {
    const responsibilityIds = new Set(this.responsibilities().map((item) => item.id));
    const unsafeBehaviorMap = new Map(this.unsafeBehaviors().map((item) => [item.id, item]));
    const lossScenarioMap = new Map(this.lossScenarios().map((item) => [item.id, item]));
    const safetyRequirementMap = new Map(this.safetyRequirements().map((item) => [item.id, item]));

    const normalizedInjectedUnsafeBehaviors = (draft.injectedUnsafeBehaviors ?? [])
      .map<StepSixInjectedUnsafeBehavior | null>((item) => {
        const responsibilityId = (item.responsibilityId ?? '').trim();
        const unsafeBehaviorId = (item.unsafeBehaviorId ?? '').trim();
        const unsafeBehavior = unsafeBehaviorMap.get(unsafeBehaviorId);
        if (!responsibilityIds.has(responsibilityId) || !unsafeBehavior || unsafeBehavior.responsibilityId !== responsibilityId) {
          return null;
        }

        return {
          responsibilityId,
          unsafeBehaviorId,
          elementType: 'SafetyTask' as const,
          obstructsLinked: true as const
        };
      })
      .filter(isPresent)
      .filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.responsibilityId === item.responsibilityId && candidate.unsafeBehaviorId === item.unsafeBehaviorId
          ) === index
      );

    const normalizedInjectedLossScenarios = (draft.injectedLossScenarios ?? [])
      .map<StepSixInjectedLossScenario | null>((item) => {
        const targetUnsafeBehaviorId = (item.targetUnsafeBehaviorId ?? '').trim();
        const lossScenarioId = (item.lossScenarioId ?? '').trim();
        const lossScenario = lossScenarioMap.get(lossScenarioId);
        if (!lossScenario || !lossScenario.unsafeBehaviorIds.includes(targetUnsafeBehaviorId)) {
          return null;
        }

        return {
          targetUnsafeBehaviorId,
          lossScenarioId,
          elementType: 'Hazard' as const,
          triggerLinked: true as const
        };
      })
      .filter(isPresent)
      .filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.targetUnsafeBehaviorId === item.targetUnsafeBehaviorId && candidate.lossScenarioId === item.lossScenarioId
          ) === index
      );

    const normalizedInjectedSafetyRequirements = (draft.injectedSafetyRequirements ?? [])
      .map<StepSixInjectedSafetyRequirement | null>((item) => {
        const targetLossScenarioId = (item.targetLossScenarioId ?? '').trim();
        const safetyRequirementId = (item.safetyRequirementId ?? '').trim();
        const safetyRequirement = safetyRequirementMap.get(safetyRequirementId);
        if (!safetyRequirement || !safetyRequirement.lossScenarioIds.includes(targetLossScenarioId)) {
          return null;
        }

        return {
          targetLossScenarioId,
          safetyRequirementId,
          elementType: 'SafetyTask' as const,
          relationshipType: (item.relationshipType ?? 'OR').trim() === 'AND' ? 'AND' : 'OR'
        };
      })
      .filter(isPresent)
      .filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.targetLossScenarioId === item.targetLossScenarioId &&
              candidate.safetyRequirementId === item.safetyRequirementId
          ) === index
      );

    this.injectedUnsafeBehaviors.set(normalizedInjectedUnsafeBehaviors);
    this.injectedLossScenarios.set(normalizedInjectedLossScenarios);
    this.injectedSafetyRequirements.set(normalizedInjectedSafetyRequirements);
    this.currentView.set((draft.currentView ?? '').trim() === 'SD' ? 'SD' : 'SR');
    this.viewStatusMessage.set(
      this.currentView() === 'SD'
        ? 'Strategic Dependency view generated. Internal safety reasoning is collapsed and no invalid safety dependencies were detected.'
        : 'Strategic Rationale view generated. Internal actor boundaries are expanded to show UCA/HC, loss scenario, and safety requirement reasoning.'
    );
    this.resetForms();
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
