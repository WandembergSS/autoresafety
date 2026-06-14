import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';

import {
  ConstraintSourceOption,
  ControllerConstraint,
  ControllerConstraintsPageComponent
} from '../controller-constraints-page/controller-constraints-page.component';
import {
  ProjectService,
  StepFourControlActionCatalogItem,
  StepFourControllerConstraintRecord,
  StepFourHazardCatalogItem,
  StepFourProjectInformation,
  StepFourProjectUpdatePayload,
  StepFourResponsibilityCatalogItem,
  StepThreeProjectInformation
} from '../../services/project.service';

export type UcaCategory = 'Not provided' | 'Provided' | 'Incorrect duration' | 'Incorrect timing';
type UcaRegisterFilter = 'all' | UcaCategory;

interface UnsafeControlAction {
  id: number;
  ref: string;
  controlActionRef?: string;
  sourceActor: string;
  targetActor: string;
  controller: string;
  controlAction: string;
  controlledProcess: string;
  responsibilityId?: string;
  safetyConstraintId?: string;
  responsibility: string;
  safetyConstraint: string;
  hazard: string[];
  category: UcaCategory;
  context: string;
  consequence: string;
  rationale: string;
}

interface HazardousCondition {
  id: number;
  ref: string;
  responsibilityId?: string;
  safetyConstraintId?: string;
  responsibility: string;
  safetyConstraint: string;
  description: string;
  linkedHazards: string[];
  coverageGap: string;
}

interface ControlActionOption {
  ref: string;
  sourceActor: string;
  targetActor: string;
  controller: string;
  controlAction: string;
  controlledProcess: string;
}

interface ResponsibilityOption {
  responsibilityId: string;
  safetyConstraintId: string;
  responsibility: string;
  safetyConstraint: string;
}

interface StepThreeFlatControlAction {
  id?: string | number;
  ref?: string;
  controller?: string;
  controlledProcess?: string;
  action?: string;
}

interface StepThreeFlatResponse {
  entities?: Array<Record<string, unknown>>;
  controlActions?: StepThreeFlatControlAction[];
}

interface StepFourFlatUca {
  id?: string | number;
  ref?: string;
  controller?: string;
  controlAction?: string;
  hazard?: string | string[];
  category?: string;
  context?: string;
  consequence?: string;
  rationale?: string;
}

interface StepFourFlatResponse {
  ucas?: StepFourFlatUca[];
  controllerConstraints?: StepFourControllerConstraintRecord[];
}

interface StepFourAiDraft {
  unsafeControlActions?: Array<{
    controlActionRef?: string;
    category?: string;
    context?: string;
    consequence?: string;
    rationale?: string;
    hazards?: string[];
    hazardRefs?: string[];
    responsibility?: string;
  }>;
  hazardousConditions?: Array<{
    description?: string;
    linkedHazards?: string[];
    linkedHazardRefs?: string[];
    responsibility?: string;
    coverageGap?: string;
  }>;
  controllerConstraints?: Array<{
    sourceRef?: string;
    hazardLinkage?: string;
    responsibilityChain?: string;
    constraint?: string;
    enforcementMechanism?: string;
    status?: string;
  }>;
}

@Component({
  selector: 'app-ucas-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ControllerConstraintsPageComponent],
  templateUrl: './ucas-page.component.html',
  styleUrl: './ucas-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UcasPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly aiFeedback = inject(AiFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentProjectId = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly isSavingStepFour = signal(false);
  readonly isGeneratingStepFourAi = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly stepFourSaveMessage = signal<string | null>(null);
  readonly stepFourSaveError = signal<string | null>(null);
  readonly isBpmnModelModalOpen = signal(false);
  readonly ucaModalMode = signal<'create' | 'edit' | null>(null);
  readonly editingUcaId = signal<number | null>(null);
  readonly controlActionCatalog = signal<ControlActionOption[]>([]);
  readonly availableHazards = signal<StepFourHazardCatalogItem[]>([]);
  readonly availableResponsibilities = signal<StepFourResponsibilityCatalogItem[]>([]);
  readonly editResponsibilityOptions = signal<ResponsibilityOption[]>([]);
  readonly controllerConstraints = signal<ControllerConstraint[]>([]);
  readonly nextUcaRefValue = signal('UCA-01');
  readonly nextHcRefValue = signal('HC-01');
  readonly nextConstraintIdValue = signal('CC-01');

  readonly ucaForm = this.fb.group({
    refCode: ['01', [Validators.required, Validators.pattern(/^\d+$/)]],
    controlActionRef: ['', Validators.required],
    sourceActor: ['', Validators.required],
    targetActor: ['', Validators.required],
    controller: ['', Validators.required],
    controlAction: ['', Validators.required],
    controlledProcess: ['', Validators.required],
    hazardSelections: [[] as string[]],
    additionalHazard: [''],
    responsibility: ['', Validators.required],
    safetyConstraint: ['', Validators.required],
    category: ['Not provided' as UcaCategory, Validators.required],
    context: ['', [Validators.required, Validators.minLength(12)]],
    consequence: ['', [Validators.required, Validators.minLength(12)]],
    rationale: ['', [Validators.required, Validators.minLength(12)]]
  });

  readonly hcForm = this.fb.group({
    responsibility: [''],
    safetyConstraint: [''],
    description: ['', [Validators.required, Validators.minLength(12)]],
    linkedHazards: [[] as string[]],
    additionalHazard: [''],
    coverageGap: ['', [Validators.required, Validators.minLength(12)]]
  });

  readonly editUcaForm = this.fb.group({
    refCode: ['01', [Validators.required, Validators.pattern(/^\d+$/)]],
    controlActionRef: [''],
    sourceActor: [''],
    targetActor: [''],
    controller: [''],
    controlAction: [''],
    controlledProcess: [''],
    hazardSelections: [[] as string[]],
    additionalHazard: [''],
    responsibility: [''],
    safetyConstraint: [''],
    category: ['Not provided' as UcaCategory, Validators.required],
    context: [''],
    consequence: [''],
    rationale: ['']
  });

  private sequence = 0;
  private hcSequence = 0;

  readonly categoryGuidance: ReadonlyArray<{
    step: string;
    category: UcaCategory;
    prompt: string;
    effect: string;
  }> = [
    {
      step: '4.2',
      category: 'Not provided',
      prompt: 'What becomes hazardous if the controller does not provide the action when the process needs it?',
      effect: 'Missing control can leave the process in an unsafe state.'
    },
    {
      step: '4.3',
      category: 'Provided',
      prompt: 'What becomes hazardous if the controller provides the action in the wrong way or to the wrong target?',
      effect: 'Incorrect execution can directly trigger a hazardous system state.'
    },
    {
      step: '4.4',
      category: 'Incorrect timing',
      prompt: 'What becomes hazardous if the action is issued too early, too late, or out of sequence?',
      effect: 'Unsafe timing can defeat assumptions built into the control loop.'
    },
    {
      step: '4.5',
      category: 'Incorrect duration',
      prompt: 'What becomes hazardous if the action stops early or persists beyond the safe duration?',
      effect: 'Unsafe duration can accumulate into loss or hazard exposure.'
    }
  ];

  readonly ucas = signal<UnsafeControlAction[]>([]);

  readonly hazardousConditions = signal<HazardousCondition[]>([]);

  readonly hcDecision = signal<'yes' | 'no'>('no');
  readonly selectedRegisterCategory = signal<UcaRegisterFilter>('all');

  readonly totalUcas = computed(() => this.ucas().length);
  readonly totalHazardousConditions = computed(() => this.hazardousConditions().length);
  readonly filteredRegisteredUcas = computed(() => {
    const selectedCategory = this.selectedRegisterCategory();
    if (selectedCategory === 'all') {
      return this.ucas();
    }

    return this.ucas().filter((item) => item.category === selectedCategory);
  });
  readonly hazardCatalog = computed(() =>
    this.uniqueValues([
      ...this.availableHazards().map((item) => item.label),
      ...this.ucas().flatMap((item) => item.hazard),
      ...this.hazardousConditions().flatMap((item) => item.linkedHazards)
    ])
  );
  readonly responsibilityCatalog = computed<ResponsibilityOption[]>(() => {
    return this.availableResponsibilities().map((item) => ({
      responsibilityId: item.responsibilityId,
      safetyConstraintId: item.safetyConstraintId,
      responsibility: item.responsibilityLabel,
      safetyConstraint: item.safetyConstraintLabel
    }));
  });
  readonly constraintSources = computed<ConstraintSourceOption[]>(() => [
    ...this.ucas().map((item) => ({
      ref: item.ref,
      summary: `${item.ref}: ${item.controlAction} from ${item.sourceActor} to ${item.targetActor}. ${item.context}`,
      hazardLinkage: item.hazard.join(', '),
      responsibilityChain: `${item.responsibility} -> ${item.safetyConstraint} -> ${item.hazard.join(', ')}`
    })),
    ...this.hazardousConditions().map((item) => ({
      ref: item.ref,
      summary: `${item.ref}: ${item.description}`,
      hazardLinkage: item.linkedHazards.join(', '),
      responsibilityChain: item.responsibility
        ? `${item.responsibility} -> ${item.safetyConstraint || 'Safety Constraint to be defined'} -> ${item.linkedHazards.join(', ')}`
        : `Hazard-only condition -> ${item.linkedHazards.join(', ')}`
    }))
  ]);

  readonly selectedCategoryGuidance = computed(() => {
    const category = (this.ucaForm.controls.category.value ?? 'Not provided') as UcaCategory;
    return this.categoryGuidance.find((item) => item.category === category) ?? this.categoryGuidance[0];
  });
  readonly ucaModalTitle = computed(() =>
    this.ucaModalMode() === 'create' ? 'Create unsafe control action' : 'Edit unsafe control action'
  );
  readonly ucaModalSubmitLabel = computed(() =>
    this.ucaModalMode() === 'create' ? 'Create UCA' : 'Save changes'
  );

  openBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  generateStepFourWithAi(): void {
    if (this.isGeneratingStepFourAi()) {
      return;
    }

    if (this.controlActionCatalog().length === 0 || this.availableResponsibilities().length === 0) {
      this.stepFourSaveMessage.set(null);
      this.stepFourSaveError.set('Load the Step 4 catalogs before generating with AI.');
      return;
    }

    const question = this.buildStepFourAiPrompt();
    const context = JSON.stringify(
      {
        controlActions: this.controlActionCatalog(),
        hazards: this.availableHazards(),
        responsibilities: this.availableResponsibilities(),
        currentData: {
          unsafeControlActions: this.ucas(),
          hazardousConditions: this.hazardousConditions(),
          controllerConstraints: this.controllerConstraints()
        }
      },
      null,
      2
    );

    this.isGeneratingStepFourAi.set(true);
    this.stepFourSaveMessage.set(null);
    this.stepFourSaveError.set(null);

    this.aiAssistant
      .askWithSummary({ question, context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGeneratingStepFourAi.set(false))
      )
      .subscribe({
        next: ({ payload, summary }) => {
          const draft = this.parseStepFourAiDraft(payload);
          if (!draft) {
            const message = 'AI returned an invalid Step 4 payload.';
            this.stepFourSaveError.set(message);
            this.aiFeedback.showError(message);
            return;
          }

          this.applyStepFourAiDraft(draft);
          this.stepFourSaveMessage.set('AI proposal applied to Step 4. Review and save when ready.');
          this.aiFeedback.showSummary(summary);
        },
        error: (error) => {
          const message = 'Failed to generate Step 4 content with AI.';
          this.stepFourSaveMessage.set(null);
          this.stepFourSaveError.set(message);
          this.aiFeedback.showError(message);
          console.error('Failed to generate Step 4 content via /api/ai/ask', error);
        }
      });
  }

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
            this.resetStepFourState();
            this.isLoading.set(false);
            return EMPTY;
          }

          return forkJoin({
            stepOne: this.projectService.getStepOneScope(projectId).pipe(
              catchError((error) => {
                console.warn(
                  'Failed to fetch Step 1 information via GET /api/projects/step_one_project_information/{id}. Falling back to Step 4 hazard catalog options.',
                  error
                );
                return of(null);
              })
            ),
            stepFour: this.projectService.getStepFourInformation(projectId).pipe(
              catchError((error) => {
                console.warn(
                  'Failed to fetch Step 4 information via GET /api/projects/step_four_project_information/{id}. Loading Step 3 control actions with empty Step 4 data.',
                  error
                );
                this.loadError.set('Step 4 data is not available yet. Control actions were loaded from Step 3.');
                return of(this.createEmptyStepFourInformation(projectId));
              })
            ),
            stepThree: this.projectService.getStepThreeInformation(projectId).pipe(
              catchError((error) => {
                console.warn(
                  'Failed to fetch Step 3 information via GET /api/projects/step_three_project_information/{id}. Falling back to Step 4 catalog control actions.',
                  error
                );
                return of(null);
              })
            )
          }).pipe(
            tap(({ stepOne, stepFour, stepThree }) => this.hydrateFromStepFourInformation(stepFour, stepThree, stepOne)),
            catchError((error) => {
              console.error('Failed to load Step 4, Step 3, or Step 1 information for the selected project.', error);
              this.loadError.set('Failed to load Step 4, Step 3, or Step 1 information for the selected project.');
              this.resetStepFourState();
              return EMPTY;
            }),
            tap(() => this.isLoading.set(false))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  selectedControlActionDetails(): ControlActionOption | undefined {
    const controlActionRef = this.ucaForm.controls.controlActionRef.value ?? '';
    return this.controlActionCatalog().find((item) => item.ref === controlActionRef);
  }

  isControlActionSelected(): boolean {
    const sourceActor = (this.ucaForm.get('sourceActor')?.value ?? '').trim();
    const targetActor = (this.ucaForm.get('targetActor')?.value ?? '').trim();
    const controller = (this.ucaForm.get('controller')?.value ?? '').trim();
    const controlAction = (this.ucaForm.get('controlAction')?.value ?? '').trim();
    const controlledProcess = (this.ucaForm.get('controlledProcess')?.value ?? '').trim();
    return (
      sourceActor.length > 0 &&
      targetActor.length > 0 &&
      controller.length > 0 &&
      controlAction.length > 0 &&
      controlledProcess.length > 0
    );
  }

  readyForRecording(): boolean {
    return (
      this.isControlActionSelected() &&
      this.collectHazards(
        this.ucaForm.controls.hazardSelections.value,
        this.ucaForm.controls.additionalHazard.value
      ).length > 0 &&
      !!(this.ucaForm.get('responsibility')?.value ?? '').trim() &&
      !!(this.ucaForm.get('safetyConstraint')?.value ?? '').trim()
    );
  }

  nextUcaRef(): string {
    return this.buildUcaRef(this.ucaForm.controls.refCode.value ?? this.getDefaultUcaRefCode());
  }

  nextHcRef(): string {
    return this.nextHcRefValue();
  }

  onControlActionSelected(controlActionRef: string): void {
    const selectedControlAction = this.controlActionCatalog().find((item) => item.ref === controlActionRef);
    if (!selectedControlAction) {
      return;
    }

    this.ucaForm.patchValue({
      controlActionRef,
      sourceActor: selectedControlAction.sourceActor,
      targetActor: selectedControlAction.targetActor,
      controller: selectedControlAction.controller,
      controlAction: selectedControlAction.controlAction,
      controlledProcess: selectedControlAction.controlledProcess
    });
  }

  onResponsibilitySelected(responsibility: string): void {
    const match = this.responsibilityCatalog().find((item) => item.responsibility === responsibility);
    this.ucaForm.patchValue({ safetyConstraint: match?.safetyConstraint ?? '' });
  }

  onHcResponsibilitySelected(responsibility: string): void {
    const match = this.responsibilityCatalog().find((item) => item.responsibility === responsibility);
    this.hcForm.patchValue({ safetyConstraint: match?.safetyConstraint ?? '' });
  }

  setHazardousConditionDecision(decision: 'yes' | 'no'): void {
    this.hcDecision.set(decision);
  }

  setRegisterCategoryFilter(category: string): void {
    const nextCategory = category === 'all' ? 'all' : this.normalizeUcaCategory(category);
    this.selectedRegisterCategory.set(nextCategory);
  }

  isUcaModalOpen(): boolean {
    return this.ucaModalMode() !== null;
  }

  openNewUcaModal(): void {
    this.ucaModalMode.set('create');
    this.editingUcaId.set(null);
    this.resetEditUcaForm();
  }

  openEditUca(uca: UnsafeControlAction): void {
    const knownHazards = new Set(this.hazardCatalog());
    const selectedHazards = uca.hazard.filter((hazard) => knownHazards.has(hazard));
    const additionalHazards = uca.hazard.filter((hazard) => !knownHazards.has(hazard));
    const responsibility = uca.responsibility?.trim() || 'Responsibility pending refinement';
    const safetyConstraint = uca.safetyConstraint?.trim() || 'Safety constraint pending refinement';

    this.ucaModalMode.set('edit');
    this.editingUcaId.set(uca.id);
    this.editUcaForm.reset({
      refCode: String(uca.id),
      controlActionRef: uca.controlActionRef ?? '',
      sourceActor: uca.sourceActor?.trim() || 'Source actor',
      targetActor: uca.targetActor?.trim() || 'Target actor',
      controller: uca.controller?.trim() || 'Controller',
      controlAction: uca.controlAction?.trim() || 'Control action',
      controlledProcess: uca.controlledProcess?.trim() || 'Controlled process',
      hazardSelections: selectedHazards,
      additionalHazard: additionalHazards.join(', '),
      responsibility,
      safetyConstraint,
      category: uca.category,
      context: uca.context?.trim() || 'Context pending refinement',
      consequence: uca.consequence?.trim() || 'Consequence pending refinement',
      rationale: uca.rationale?.trim() || 'Rationale pending refinement'
    });
  }

  closeEditUcaModal(): void {
    this.ucaModalMode.set(null);
    this.editingUcaId.set(null);
    this.resetEditUcaForm();
  }

  onEditControlActionSelected(controlActionRef: string): void {
    const selectedControlAction = this.controlActionCatalog().find((item) => item.ref === controlActionRef);
    if (!selectedControlAction) {
      return;
    }

    this.editUcaForm.patchValue({
      controlActionRef,
      sourceActor: selectedControlAction.sourceActor,
      targetActor: selectedControlAction.targetActor,
      controller: selectedControlAction.controller,
      controlAction: selectedControlAction.controlAction,
      controlledProcess: selectedControlAction.controlledProcess
    });
  }

  onEditResponsibilitySelected(responsibility: string): void {
    const match = this.findEditResponsibilityOption(responsibility);
    this.editUcaForm.patchValue({ safetyConstraint: match?.safetyConstraint ?? '' });
  }

  isEditHazardSelected(hazard: string): boolean {
    return (this.editUcaForm.controls.hazardSelections.value ?? []).includes(hazard);
  }

  onEditHazardSelectionChange(hazard: string, checked: boolean): void {
    const currentSelections = this.editUcaForm.controls.hazardSelections.value ?? [];
    const nextSelections = checked
      ? this.uniqueValues([...currentSelections, hazard])
      : currentSelections.filter((item) => item !== hazard);

    this.editUcaForm.patchValue({ hazardSelections: nextSelections });
  }

  saveEditedUca(): void {
    if (this.ucaModalMode() === 'create') {
      this.addUcaFromModal();
      return;
    }

    const ucaId = this.editingUcaId();
    if (!ucaId) {
      return;
    }

    if (this.editUcaForm.invalid) {
      this.editUcaForm.markAllAsTouched();
      return;
    }

    const value = this.editUcaForm.getRawValue();
    const responsibility = this.findEditResponsibilityOption(value.responsibility ?? '');
    const nextId = this.parseUcaNumericId(value.refCode) ?? this.getDefaultUcaId();
    const nextRef = this.formatUcaRef(nextId);

    if (this.hasDuplicateUcaId(nextId, ucaId)) {
      this.setDuplicateRefError(this.editUcaForm.controls.refCode);
      return;
    }

    this.sequence = Math.max(this.sequence, nextId);

    this.ucas.update((current) =>
      current.map((item) =>
        item.id === ucaId
          ? {
              ...item,
              id: nextId,
              ref: nextRef,
              controlActionRef: value.controlActionRef?.trim() || '',
              sourceActor: value.sourceActor?.trim() || 'Source actor',
              targetActor: value.targetActor?.trim() || 'Target actor',
              controller: value.controller?.trim() || 'Controller',
              controlAction: value.controlAction?.trim() || 'Control action',
              controlledProcess: value.controlledProcess?.trim() || 'Controlled process',
              responsibilityId: responsibility?.responsibilityId,
              safetyConstraintId: responsibility?.safetyConstraintId,
              responsibility: value.responsibility?.trim() || 'Responsibility pending refinement',
              safetyConstraint:
                value.safetyConstraint?.trim() ||
                responsibility?.safetyConstraint ||
                'Safety constraint pending refinement',
              hazard: this.collectHazards(value.hazardSelections, value.additionalHazard),
              category: (value.category as UcaCategory) ?? 'Not provided',
              context: value.context?.trim() || 'Context pending refinement',
              consequence: value.consequence?.trim() || 'Consequence pending refinement',
              rationale: value.rationale?.trim() || 'Rationale pending refinement'
            }
          : item
      )
    );

    this.closeEditUcaModal();
  }

  private addUcaFromModal(): void {
    if (this.editUcaForm.invalid) {
      this.editUcaForm.markAllAsTouched();
      return;
    }

    const value = this.editUcaForm.getRawValue();
    const responsibility = this.findEditResponsibilityOption(value.responsibility ?? '');
    const nextId = this.parseUcaNumericId(value.refCode) ?? this.getDefaultUcaId();
    const nextRef = this.formatUcaRef(nextId);

    if (this.hasDuplicateUcaId(nextId)) {
      this.setDuplicateRefError(this.editUcaForm.controls.refCode);
      return;
    }

    this.sequence = Math.max(this.sequence, nextId);

    this.ucas.update((current) => [
      {
        id: nextId,
        ref: nextRef,
        controlActionRef: value.controlActionRef?.trim() || '',
        sourceActor: value.sourceActor?.trim() || 'Source actor',
        targetActor: value.targetActor?.trim() || 'Target actor',
        controller: value.controller?.trim() || 'Controller',
        controlAction: value.controlAction?.trim() || 'Control action',
        controlledProcess: value.controlledProcess?.trim() || 'Controlled process',
        responsibilityId: responsibility?.responsibilityId,
        safetyConstraintId: responsibility?.safetyConstraintId,
        responsibility: value.responsibility?.trim() || 'Responsibility pending refinement',
        safetyConstraint:
          value.safetyConstraint?.trim() ||
          responsibility?.safetyConstraint ||
          'Safety constraint pending refinement',
        hazard: this.collectHazards(value.hazardSelections, value.additionalHazard),
        category: (value.category as UcaCategory) ?? 'Not provided',
        context: value.context?.trim() || 'Context pending refinement',
        consequence: value.consequence?.trim() || 'Consequence pending refinement',
        rationale: value.rationale?.trim() || 'Rationale pending refinement'
      },
      ...current
    ]);

    this.nextUcaRefValue.set(this.incrementPrefixedRef(nextRef, 'UCA'));
    this.closeEditUcaModal();
  }

  categoryCount(category: UcaCategory): number {
    return this.ucas().filter((item) => item.category === category).length;
  }

  previewStatement(): string {
    if (!this.readyForRecording()) {
      return 'Complete the control action definition and hazard traceability to generate the Step 4.6 UCA statement.';
    }

    const value = this.ucaForm.getRawValue();
    const ref = this.buildUcaRef(value.refCode ?? this.getDefaultUcaRefCode());
    const sourceActor = (value.sourceActor ?? 'Source actor').trim();
    const targetActor = (value.targetActor ?? 'Target actor').trim();
    const controller = (value.controller ?? 'The controller').trim();
    const controlAction = (value.controlAction ?? 'the control action').trim();
    const context = (value.context ?? 'the identified context').trim();
    const consequence = (value.consequence ?? 'the associated hazard').trim();
    const category = (value.category ?? 'Not provided') as UcaCategory;

    return `${ref}: ${sourceActor} -> ${targetActor}. ${controller} ${this.categoryVerb(category)} ${controlAction} when ${context}. This can lead to ${consequence}.`;
  }

  addUca(): void {
    if (this.ucaForm.invalid) {
      this.ucaForm.markAllAsTouched();
      return;
    }

    const value = this.ucaForm.getRawValue();
    const nextId = this.parseUcaNumericId(value.refCode) ?? this.getDefaultUcaId();
    const nextRef = this.formatUcaRef(nextId);

    if (this.hasDuplicateUcaId(nextId)) {
      this.setDuplicateRefError(this.ucaForm.controls.refCode);
      return;
    }

    this.sequence = Math.max(this.sequence, nextId);

    this.ucas.update((current) => [
      {
        id: nextId,
        ref: nextRef,
        controlActionRef: value.controlActionRef ?? '',
        sourceActor: value.sourceActor ?? 'Source actor',
        targetActor: value.targetActor ?? 'Target actor',
        controller: value.controller ?? 'Controller',
        controlAction: value.controlAction ?? 'Control action',
        controlledProcess: value.controlledProcess ?? 'Controlled process',
        responsibilityId: this.findResponsibilityOption(value.responsibility ?? '')?.responsibilityId,
        safetyConstraintId: this.findResponsibilityOption(value.responsibility ?? '')?.safetyConstraintId,
        responsibility: value.responsibility ?? 'Responsibility pending refinement',
        safetyConstraint: value.safetyConstraint ?? 'Safety constraint pending refinement',
        hazard: this.collectHazards(value.hazardSelections, value.additionalHazard),
        category: (value.category as UcaCategory) ?? 'Not provided',
        context: value.context ?? 'Context pending refinement',
        consequence: value.consequence ?? 'Consequence pending refinement',
        rationale: value.rationale ?? 'Rationale pending refinement'
      },
      ...current
    ]);

    this.nextUcaRefValue.set(this.incrementPrefixedRef(nextRef, 'UCA'));

    this.ucaForm.reset({
      refCode: this.getDefaultUcaRefCode(),
      controlActionRef: '',
      sourceActor: '',
      targetActor: '',
      controller: '',
      controlAction: '',
      controlledProcess: '',
      hazardSelections: [],
      additionalHazard: '',
      responsibility: '',
      safetyConstraint: '',
      category: 'Not provided',
      context: '',
      consequence: '',
      rationale: ''
    });
  }

  removeUca(ucaId: number): void {
    if (this.editingUcaId() === ucaId) {
      this.closeEditUcaModal();
    }
    this.ucas.update((current) => current.filter((item) => item.id !== ucaId));
  }

  addHazardousCondition(): void {
    const linkedHazards = this.collectHazards(
      this.hcForm.controls.linkedHazards.value,
      this.hcForm.controls.additionalHazard.value
    );

    if (this.hcForm.invalid || linkedHazards.length === 0) {
      this.hcForm.markAllAsTouched();
      return;
    }

    const value = this.hcForm.getRawValue();
    const nextRef = this.nextHcRefValue();
    this.hazardousConditions.update((current) => [
      {
        id: ++this.hcSequence,
        ref: nextRef,
        responsibilityId: this.findResponsibilityOption(value.responsibility ?? '')?.responsibilityId,
        safetyConstraintId: this.findResponsibilityOption(value.responsibility ?? '')?.safetyConstraintId,
        responsibility: value.responsibility ?? 'Responsibility pending refinement',
        safetyConstraint: value.safetyConstraint ?? 'Safety constraint pending refinement',
        description: value.description ?? 'Hazardous condition pending refinement',
        linkedHazards,
        coverageGap: value.coverageGap ?? 'Coverage gap pending refinement'
      },
      ...current
    ]);

    this.nextHcRefValue.set(this.incrementPrefixedRef(nextRef, 'HC'));

    this.hcForm.reset({
      responsibility: '',
      safetyConstraint: '',
      description: '',
      linkedHazards: [],
      additionalHazard: '',
      coverageGap: ''
    });
  }

  onControllerConstraintsChange(constraints: ControllerConstraint[]): void {
    this.controllerConstraints.set(constraints);
  }

  saveStepFour(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId || projectId <= 0) {
      this.stepFourSaveMessage.set(null);
      this.stepFourSaveError.set('Missing valid project id. Step 4 cannot be saved.');
      console.warn('Missing projectId; cannot save Step 4 information.');
      return;
    }

    if (this.isSavingStepFour()) {
      return;
    }

    this.stepFourSaveMessage.set(null);
    this.stepFourSaveError.set(null);

    const payload: StepFourProjectUpdatePayload = {
      id: projectId,
      step4Information: {
        unsafeControlActions: this.buildStepFourUcasPayload(),
        hazardousConditions: this.buildStepFourHazardousConditionsPayload(),
        controllerConstraints: this.buildStepFourControllerConstraintsPayload()
      }
    };

    this.isSavingStepFour.set(true);

    this.projectService
      .updateStepFourInformation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingStepFour.set(false))
      )
      .subscribe({
        next: (response) => {
          try {
            if (response) {
              this.hydrateFromStepFourInformation(response);
            }
          } catch (error) {
            console.warn(
              'Step 4 save succeeded, but the update response could not be rehydrated. Preserving local state before navigation.',
              error
            );
          }
          this.stepFourSaveError.set(null);
          const successMessage = continueAfterSave
            ? 'Step 4 saved. Opening the next step.'
            : 'Step 4 saved successfully.';
          this.stepFourSaveMessage.set(successMessage);
          this.aiFeedback.showSuccess(successMessage);

          if (continueAfterSave) {
            this.router.navigate(['/loss-scenarios'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          this.stepFourSaveMessage.set(null);
          this.stepFourSaveError.set(this.getStepFourSaveErrorMessage(error));
          console.error(
            'Failed to update Step 4 information via POST /api/projects/step_four_project_update',
            error
          );
        }
      });
  }

  categoryClass(category: UcaCategory): string {
    return category.replace(/\s+|\//g, '-').toLowerCase();
  }

  private formatUcaRef(id: number): string {
    return `UCA-${String(id).padStart(2, '0')}`;
  }

  private formatHcRef(id: number): string {
    return `HC-${String(id).padStart(2, '0')}`;
  }

  private collectHazards(selectedHazards: string[] | null | undefined, additionalHazard: string | null | undefined): string[] {
    const merged = [
      ...(selectedHazards ?? []).filter((item) => item.trim().length > 0),
      ...(additionalHazard?.trim() ? [additionalHazard.trim()] : [])
    ];

    return this.uniqueValues(merged);
  }

  private uniqueValues(values: string[]): string[] {
    return Array.from(new Set(values.filter((item) => item.trim().length > 0)));
  }

  private categoryVerb(category: UcaCategory): string {
    switch (category) {
      case 'Not provided':
        return 'does not provide';
      case 'Provided':
        return 'provides';
      case 'Incorrect timing':
        return 'provides';
      case 'Incorrect duration':
        return 'stops or sustains';
      default:
        return 'provides';
    }
  }

  private hydrateFromStepFourInformation(
    response: StepFourProjectInformation | StepFourFlatResponse,
    stepThreeInformation: StepThreeProjectInformation | StepThreeFlatResponse | null = null,
    stepOneScope: Record<string, unknown> | null = null
  ): void {
    const normalized = this.normalizeStepFourInformation(response);
    const resolvedHazards = this.resolveHazardCatalog(stepOneScope, normalized.catalogs.hazards ?? []);
    const resolvedEditResponsibilities = this.resolveEditResponsibilityOptions(
      stepOneScope,
      normalized.catalogs.responsibilities ?? []
    );
    const hazardLabelMap = new Map(resolvedHazards.map((item) => [item.code, item.label]));
    const responsibilityMap = new Map(
      normalized.catalogs.responsibilities.map((item) => [
        item.responsibilityId,
        {
          responsibility: item.responsibilityLabel,
          safetyConstraint: item.safetyConstraintLabel,
          safetyConstraintId: item.safetyConstraintId
        }
      ])
    );

    const stepThreeCatalog = this.buildControlActionCatalogFromStepThree(stepThreeInformation);
    const stepFourCatalog = normalized.catalogs.controlActions ?? [];
    const fallbackCatalog = stepFourCatalog.length > 0 ? stepFourCatalog : this.controlActionCatalog();

    this.controlActionCatalog.set(stepThreeCatalog.length > 0 ? stepThreeCatalog : fallbackCatalog);
    this.availableHazards.set(resolvedHazards);
    this.availableResponsibilities.set(normalized.catalogs.responsibilities ?? []);
    this.editResponsibilityOptions.set(resolvedEditResponsibilities);

    const hydratedUcas = (normalized.currentData.unsafeControlActions ?? []).map((item) => ({
        id: item.id,
        ref: item.ref,
        controlActionRef: item.controlActionRef,
        sourceActor: item.sourceActor,
        targetActor: item.targetActor,
        controller: item.controller,
        controlAction: item.controlAction,
        controlledProcess: item.controlledProcess,
        responsibilityId: item.responsibilityId,
        safetyConstraintId: item.safetyConstraintId,
        responsibility: responsibilityMap.get(item.responsibilityId)?.responsibility || 'Responsibility pending refinement',
        safetyConstraint: responsibilityMap.get(item.responsibilityId)?.safetyConstraint || 'Safety constraint pending refinement',
        hazard: (item.hazardRefs ?? []).map((hazardRef) => hazardLabelMap.get(hazardRef) || hazardRef),
        category: this.normalizeUcaCategory(item.category),
        context: item.context,
        consequence: item.consequence,
        rationale: item.rationale
      }));

    const hydratedHazardousConditions = (normalized.currentData.hazardousConditions ?? []).map((item) => ({
        id: item.id,
        ref: item.ref,
        responsibilityId: item.responsibilityId,
        safetyConstraintId: item.safetyConstraintId,
        responsibility: responsibilityMap.get(item.responsibilityId)?.responsibility || '',
        safetyConstraint: responsibilityMap.get(item.responsibilityId)?.safetyConstraint || '',
        description: item.description,
        linkedHazards: (item.linkedHazardRefs ?? []).map((hazardRef) => hazardLabelMap.get(hazardRef) || hazardRef),
        coverageGap: item.coverageGap
      }));

    const constraintSourceLookup = this.buildConstraintSourceLookup(hydratedUcas, hydratedHazardousConditions);

    this.ucas.set(hydratedUcas);
    this.hazardousConditions.set(hydratedHazardousConditions);
    this.controllerConstraints.set(
      (normalized.currentData.controllerConstraints ?? []).map((item) =>
        this.mapControllerConstraintRecord(item, constraintSourceLookup)
      )
    );

    this.sequence = this.ucas().reduce((maxId, item) => Math.max(maxId, item.id), 0);
    this.hcSequence = this.hazardousConditions().reduce((maxId, item) => Math.max(maxId, item.id), 0);
    this.nextUcaRefValue.set(normalized.defaults.nextUcaRef || 'UCA-01');
    this.nextHcRefValue.set(normalized.defaults.nextHcRef || 'HC-01');
    this.nextConstraintIdValue.set(normalized.defaults.nextConstraintId || this.buildNextConstraintIdFromRecords());
    this.hcDecision.set(this.hazardousConditions().length > 0 ? 'yes' : 'no');
    this.ucaForm.patchValue({ refCode: this.getDefaultUcaRefCode() });
  }

  private normalizeStepFourInformation(
    response: StepFourProjectInformation | StepFourFlatResponse
  ): StepFourProjectInformation {
    const maybeNested = response as StepFourProjectInformation;
    if (maybeNested.catalogs && maybeNested.currentData && maybeNested.defaults) {
      return {
        ...maybeNested,
        catalogs: {
          controlActions: maybeNested.catalogs.controlActions ?? [],
          hazards: maybeNested.catalogs.hazards ?? [],
          responsibilities: maybeNested.catalogs.responsibilities ?? []
        },
        currentData: {
          unsafeControlActions: maybeNested.currentData.unsafeControlActions ?? [],
          hazardousConditions: maybeNested.currentData.hazardousConditions ?? [],
          controllerConstraints: maybeNested.currentData.controllerConstraints ?? []
        },
        defaults: {
          nextUcaRef: maybeNested.defaults.nextUcaRef ?? 'UCA-01',
          nextHcRef: maybeNested.defaults.nextHcRef ?? 'HC-01',
          nextConstraintId: maybeNested.defaults.nextConstraintId ?? 'CC-01'
        }
      };
    }

    const flat = response as StepFourFlatResponse;
    const flatUcas = flat.ucas ?? [];
    const hazardCodes = this.uniqueValues(
      flatUcas.flatMap((item) => {
        const hazard = item.hazard;
        if (Array.isArray(hazard)) {
          return hazard.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
        }

        if (typeof hazard === 'string' && hazard.trim().length > 0) {
          return [hazard.trim()];
        }

        return [];
      })
    );

    return {
      projectId: this.currentProjectId() ?? 0,
      step: 4,
      catalogs: {
        controlActions: [],
        hazards: hazardCodes.map((code) => ({
          id: code,
          code,
          description: code,
          label: code
        })),
        responsibilities: []
      },
      currentData: {
        unsafeControlActions: flatUcas.map((item, index) => {
          const id = Number(item.id ?? index + 1);
          const hazard = item.hazard;
          const hazardRefs = Array.isArray(hazard)
            ? hazard.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
            : typeof hazard === 'string' && hazard.trim().length > 0
              ? [hazard.trim()]
              : [];

          return {
            id: Number.isFinite(id) ? id : index + 1,
            ref: item.ref?.trim() || this.formatUcaRef(Number.isFinite(id) ? id : index + 1),
            controlActionRef: '',
            sourceActor: item.controller?.trim() || '',
            targetActor: '',
            controller: item.controller?.trim() || '',
            controlAction: item.controlAction?.trim() || 'Unnamed control action',
            controlledProcess: '',
            category: this.normalizeUcaCategory(item.category),
            context: item.context?.trim() || '',
            consequence: item.consequence?.trim() || '',
            rationale: item.rationale?.trim() || '',
            hazardRefs,
            responsibilityId: '',
            safetyConstraintId: ''
          };
        }),
        hazardousConditions: [],
        controllerConstraints: flat.controllerConstraints ?? []
      },
      defaults: {
        nextUcaRef: this.formatUcaRef(flatUcas.length + 1),
        nextHcRef: 'HC-01',
        nextConstraintId: this.buildNextConstraintIdFromRecords(flat.controllerConstraints ?? [])
      }
    };
  }

  private buildNextConstraintIdFromRecords(records: StepFourControllerConstraintRecord[] = []): string {
    const maxValue = records.reduce(
      (currentMax, item) => Math.max(currentMax, this.parsePrefixedNumericId(item.constraintId)),
      this.parsePrefixedNumericId(this.nextConstraintIdValue())
    );
    const prefix = this.extractConstraintIdPrefix(records.map((item) => item.constraintId), this.nextConstraintIdValue());

    return `${prefix}${String(Math.max(maxValue, 0) + 1).padStart(2, '0')}`;
  }

  private parsePrefixedNumericId(value: string | null | undefined): number {
    const match = (value ?? '').match(/(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  private extractConstraintIdPrefix(values: Array<string | null | undefined>, fallback = 'CC-'): string {
    const match = values
      .map((value) => (value ?? '').trim())
      .find((value) => /\d+/.test(value))
      ?.match(/^([^\d]*?)(\d+)$/);

    if (match?.[1]) {
      return match[1];
    }

    const fallbackMatch = (fallback ?? '').trim().match(/^([^\d]*?)(\d+)$/);
    return fallbackMatch?.[1] || 'CC-';
  }

  private buildControlActionCatalogFromStepThree(
    stepThreeInformation: StepThreeProjectInformation | StepThreeFlatResponse | null
  ): ControlActionOption[] {
    if (!stepThreeInformation) {
      return [];
    }

    const normalized = this.normalizeStepThreeInformation(stepThreeInformation);
    const entityNameById = new Map(
      normalized.currentData.entities.map((entity) => [entity.id, entity.name?.trim() || ''])
    );

    const mapped = normalized.currentData.controlActions
      .map((item, index) => {
        const action = item.action?.trim();
        if (!action) {
          return null;
        }

        const sourceName = entityNameById.get(item.sourceEntityId) || 'Unspecified controller';
        const targetName = entityNameById.get(item.targetEntityId) || 'Unspecified controlled process';
        const ref = item.ref?.trim() || `CA-${String(index + 1).padStart(2, '0')}`;

        return {
          ref,
          sourceActor: sourceName,
          targetActor: targetName,
          controller: sourceName,
          controlAction: action,
          controlledProcess: targetName
        } as ControlActionOption;
      })
      .filter((item): item is ControlActionOption => !!item);

    return this.dedupeControlActionOptions(mapped);
  }

  private normalizeStepThreeInformation(
    response: StepThreeProjectInformation | StepThreeFlatResponse
  ): StepThreeProjectInformation {
    const maybeNested = response as StepThreeProjectInformation;
    if (maybeNested.availableInputs && maybeNested.currentData && maybeNested.defaults) {
      return {
        ...maybeNested,
        availableInputs: {
          entityCandidates: maybeNested.availableInputs.entityCandidates ?? [],
          responsibilities: maybeNested.availableInputs.responsibilities ?? [],
          entityRoles: maybeNested.availableInputs.entityRoles ?? ['Controller', 'Controlled Process'],
          optionalElementTypes: maybeNested.availableInputs.optionalElementTypes ?? [
            'Feedback',
            'Process Model',
            'Control Algorithm',
            'Actuator',
            'Sensor',
            'External Input'
          ],
          externalSources: maybeNested.availableInputs.externalSources ?? []
        },
        currentData: {
          entities: maybeNested.currentData.entities ?? [],
          controlActions: maybeNested.currentData.controlActions ?? [],
          optionalElements: maybeNested.currentData.optionalElements ?? []
        },
        defaults: {
          nextControlActionRef: maybeNested.defaults.nextControlActionRef ?? 'CA-01',
          defaultOptionalElementType: maybeNested.defaults.defaultOptionalElementType ?? 'Feedback'
        }
      };
    }

    const flat = response as StepThreeFlatResponse;
    const flatControlActions = flat.controlActions ?? [];
    const rolesByEntity = new Map<string, Set<'Controller' | 'Controlled Process'>>();

    for (const controlAction of flatControlActions) {
      const controller = controlAction.controller?.trim();
      const controlledProcess = controlAction.controlledProcess?.trim();

      if (controller) {
        const current = rolesByEntity.get(controller) ?? new Set<'Controller' | 'Controlled Process'>();
        current.add('Controller');
        rolesByEntity.set(controller, current);
      }

      if (controlledProcess) {
        const current = rolesByEntity.get(controlledProcess) ?? new Set<'Controller' | 'Controlled Process'>();
        current.add('Controlled Process');
        rolesByEntity.set(controlledProcess, current);
      }
    }

    const entities = Array.from(rolesByEntity.entries()).map(([name, roles], index) => ({
      id: `ent-${index + 1}`,
      entityCandidateId: `ent-${index + 1}`,
      name,
      roles: Array.from(roles)
    }));

    const entityIdByName = new Map(entities.map((entity) => [entity.name, entity.id]));
    const controlActions = flatControlActions.map((item, index) => ({
      id: String(item.id ?? index + 1),
      ref: item.ref?.trim() || `CA-${String(index + 1).padStart(2, '0')}`,
      action: item.action?.trim() || 'Unnamed action',
      sourceEntityId: entityIdByName.get(item.controller?.trim() ?? '') ?? '',
      targetEntityId: entityIdByName.get(item.controlledProcess?.trim() ?? '') ?? '',
      responsibilityId: ''
    }));

    return {
      projectId: this.currentProjectId() ?? 0,
      step: 3,
      availableInputs: {
        entityCandidates: [],
        responsibilities: [],
        entityRoles: ['Controller', 'Controlled Process', 'Passive Entity', 'Dependency/Restriction'],
        optionalElementTypes: [
          'Feedback',
          'Process Model',
          'Control Algorithm',
          'Actuator',
          'Sensor',
          'External Input'
        ],
        externalSources: []
      },
      currentData: {
        entities,
        controlActions,
        optionalElements: []
      },
      defaults: {
        nextControlActionRef: `CA-${String(controlActions.length + 1).padStart(2, '0')}`,
        defaultOptionalElementType: 'Feedback'
      }
    };
  }

  private dedupeControlActionOptions(options: ControlActionOption[]): ControlActionOption[] {
    const byRef = new Map(options.map((item) => [item.ref, item]));

    return Array.from(byRef.values()).sort((a, b) => {
      const aNum = Number((a.ref.match(/(\d+)/) ?? [])[1] ?? Number.MAX_SAFE_INTEGER);
      const bNum = Number((b.ref.match(/(\d+)/) ?? [])[1] ?? Number.MAX_SAFE_INTEGER);
      return aNum - bNum;
    });
  }

  private normalizeUcaCategory(category: string | undefined): UcaCategory {
    const value = (category ?? '').trim().toLowerCase();

    if (!value || value === 'not provided') {
      return 'Not provided';
    }

    if (value.includes('tim') || value.includes('late') || value.includes('early') || value.includes('order')) {
      return 'Incorrect timing';
    }

    if (value.includes('soon') || value.includes('long') || value.includes('duration') || value.includes('applied')) {
      return 'Incorrect duration';
    }

    if (value === 'provided' || value.includes('incorrect') || value.includes('wrong') || value.includes('carried')) {
      return 'Provided';
    }

    return 'Provided';
  }

  private createEmptyStepFourInformation(projectId: number): StepFourProjectInformation {
    return {
      projectId,
      step: 4,
      catalogs: {
        controlActions: [],
        hazards: [],
        responsibilities: []
      },
      currentData: {
        unsafeControlActions: [],
        hazardousConditions: [],
        controllerConstraints: []
      },
      defaults: {
        nextUcaRef: 'UCA-01',
        nextHcRef: 'HC-01',
        nextConstraintId: 'CC-01'
      }
    };
  }

  private resetStepFourState(): void {
    this.currentProjectId.set(null);
    this.controlActionCatalog.set([]);
    this.availableHazards.set([]);
    this.availableResponsibilities.set([]);
    this.editResponsibilityOptions.set([]);
    this.controllerConstraints.set([]);
    this.ucas.set([]);
    this.hazardousConditions.set([]);
    this.sequence = 0;
    this.hcSequence = 0;
    this.hcDecision.set('no');
    this.nextUcaRefValue.set('UCA-01');
    this.nextHcRefValue.set('HC-01');
    this.nextConstraintIdValue.set('CC-01');
    this.stepFourSaveMessage.set(null);
    this.stepFourSaveError.set(null);
    this.ucaForm.reset({
      refCode: this.getDefaultUcaRefCode(),
      controlActionRef: '',
      sourceActor: '',
      targetActor: '',
      controller: '',
      controlAction: '',
      controlledProcess: '',
      hazardSelections: [],
      additionalHazard: '',
      responsibility: '',
      safetyConstraint: '',
      category: 'Not provided',
      context: '',
      consequence: '',
      rationale: ''
    });
    this.closeEditUcaModal();
    this.hcForm.reset({
      responsibility: '',
      safetyConstraint: '',
      description: '',
      linkedHazards: [],
      additionalHazard: '',
      coverageGap: ''
    });
  }

  private findResponsibilityOption(responsibility: string): ResponsibilityOption | undefined {
    return this.responsibilityCatalog().find((item) => item.responsibility === responsibility);
  }

  private resetEditUcaForm(): void {
    const firstResponsibility = this.editResponsibilityOptions()[0];
    this.editUcaForm.reset({
      refCode: this.getDefaultUcaRefCode(),
      controlActionRef: '',
      sourceActor: '',
      targetActor: '',
      controller: '',
      controlAction: '',
      controlledProcess: '',
      hazardSelections: [],
      additionalHazard: '',
      responsibility: firstResponsibility?.responsibility ?? '',
      safetyConstraint: firstResponsibility?.safetyConstraint ?? '',
      category: 'Not provided',
      context: 'Context pending refinement',
      consequence: 'Consequence pending refinement',
      rationale: 'Rationale pending refinement'
    });
  }

  private findEditResponsibilityOption(responsibility: string): ResponsibilityOption | undefined {
    return this.editResponsibilityOptions().find((item) => item.responsibility === responsibility);
  }

  private resolveHazardCatalog(
    stepOneScope: Record<string, unknown> | null,
    fallbackHazards: StepFourHazardCatalogItem[]
  ): StepFourHazardCatalogItem[] {
    const stepOneHazards = this.extractStepOneHazards(stepOneScope);
    if (stepOneHazards.length === 0) {
      return fallbackHazards;
    }

    const merged = new Map<string, StepFourHazardCatalogItem>();

    for (const item of stepOneHazards) {
      merged.set(item.code, item);
    }

    for (const item of fallbackHazards) {
      if (!merged.has(item.code)) {
        merged.set(item.code, item);
      }
    }

    return Array.from(merged.values());
  }

  private resolveEditResponsibilityOptions(
    stepOneScope: Record<string, unknown> | null,
    fallbackResponsibilities: StepFourResponsibilityCatalogItem[]
  ): ResponsibilityOption[] {
    const stepOneResponsibilities = this.extractStepOneResponsibilities(stepOneScope, fallbackResponsibilities);
    if (stepOneResponsibilities.length > 0) {
      return stepOneResponsibilities;
    }

    return fallbackResponsibilities.map((item) => ({
      responsibilityId: item.responsibilityId,
      safetyConstraintId: item.safetyConstraintId,
      responsibility: item.responsibilityLabel,
      safetyConstraint: item.safetyConstraintLabel
    }));
  }

  private extractStepOneResponsibilities(
    stepOneScope: Record<string, unknown> | null,
    fallbackResponsibilities: StepFourResponsibilityCatalogItem[]
  ): ResponsibilityOption[] {
    if (!stepOneScope) {
      return [];
    }

    const responsibilityRecords = this.collectStepOneResponsibilityRecords(stepOneScope);
    const seen = new Set<string>();

    return responsibilityRecords
      .map((item, index) => {
        const responsibilityText = this.readTextField(item, [
          'responsibility',
          'text',
          'statement',
          'description'
        ]).trim();
        const component = this.readTextField(item, ['component', 'actor', 'owner']).trim();
        const code = this.readTextField(item, ['code', 'ref', 'reference']).trim();

        if (!responsibilityText) {
          return null;
        }

        const normalizedKey = `${component.toLowerCase()}::${responsibilityText.toLowerCase()}`;
        if (seen.has(normalizedKey)) {
          return null;
        }
        seen.add(normalizedKey);

        const resolvedCode = code || `R-${String(index + 1).padStart(2, '0')}`;
        const labelBase = component ? `${component}: ${responsibilityText}` : responsibilityText;
        const responsibilityLabel = `${resolvedCode} - ${labelBase}`;
        const matchedFallback = fallbackResponsibilities.find((candidate) => {
          const candidateCode = candidate.responsibilityCode.trim().toLowerCase();
          const candidateText = candidate.responsibilityText.trim().toLowerCase();
          const candidateLabel = candidate.responsibilityLabel.trim().toLowerCase();
          return (
            candidateCode === resolvedCode.toLowerCase() ||
            candidateText === responsibilityText.toLowerCase() ||
            candidateLabel === responsibilityLabel.toLowerCase()
          );
        });

        return {
          responsibilityId:
            matchedFallback?.responsibilityId ||
            this.readTextField(item, ['id']).trim() ||
            `step1-responsibility-${index + 1}`,
          safetyConstraintId: matchedFallback?.safetyConstraintId ?? '',
          responsibility: responsibilityLabel,
          safetyConstraint: matchedFallback?.safetyConstraintLabel ?? ''
        } as ResponsibilityOption;
      })
      .filter((item): item is ResponsibilityOption => !!item);
  }

  private collectStepOneResponsibilityRecords(stepOneScope: Record<string, unknown>): Record<string, unknown>[] {
    const collected: Record<string, unknown>[] = [];

    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          visit(entry);
        }
        return;
      }

      const record = value as Record<string, unknown>;
      for (const [key, child] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const isResponsibilitiesField =
          normalizedKey === 'responsibilities' ||
          normalizedKey === 'componentresponsibilities' ||
          normalizedKey.includes('124responsibilities') ||
          normalizedKey.includes('124defineresponsibilities');

        if (isResponsibilitiesField && Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              collected.push(item as Record<string, unknown>);
            }
          }
        }

        visit(child);
      }
    };

    visit(stepOneScope);
    return collected;
  }

  private extractStepOneHazards(stepOneScope: Record<string, unknown> | null): StepFourHazardCatalogItem[] {
    if (!stepOneScope) {
      return [];
    }

    const collected = this.collectStepOneHazardRecords(stepOneScope);
    const seen = new Set<string>();

    return collected
      .map((item, index) => {
        const code = this.readTextField(item, ['code', 'ref', 'reference']).trim();
        const description = this.readTextField(item, ['description', 'hazard', 'text', 'statement']).trim();
        if (!code && !description) {
          return null;
        }

        const key = `${code.toLowerCase()}::${description.toLowerCase()}`;
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);

        const resolvedCode = code || `H-${String(index + 1).padStart(2, '0')}`;
        const label = description ? `${resolvedCode} - ${description}` : resolvedCode;

        return {
          id: this.readTextField(item, ['id']).trim() || resolvedCode,
          code: resolvedCode,
          description: description || resolvedCode,
          label
        } as StepFourHazardCatalogItem;
      })
      .filter((item): item is StepFourHazardCatalogItem => !!item);
  }

  private collectStepOneHazardRecords(stepOneScope: Record<string, unknown>): Record<string, unknown>[] {
    const collected: Record<string, unknown>[] = [];

    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          visit(entry);
        }
        return;
      }

      const record = value as Record<string, unknown>;
      for (const [key, child] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const isHazardsField =
          normalizedKey === 'hazards' ||
          normalizedKey.includes('122hazards') ||
          normalizedKey.includes('122systemlevelhazards');

        if (isHazardsField && Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              collected.push(item as Record<string, unknown>);
            }
          }
        }

        visit(child);
      }
    };

    visit(stepOneScope);
    return collected;
  }

  private readTextField(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
    }

    return '';
  }

  private extractUcaRefCode(ref: string | null | undefined): string {
    return String(this.extractUcaId(ref) ?? this.getDefaultUcaId());
  }

  private extractUcaId(ref: string | null | undefined): number | null {
    const match = (ref ?? '').trim().match(/^UCA-(\d+)$/i);
    if (!match) {
      return null;
    }

    const value = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  private normalizeUcaRefCode(refCode: string | null | undefined): string {
    const nextId = this.parseUcaNumericId(refCode) ?? this.getDefaultUcaId();
    return String(nextId).padStart(2, '0');
  }

  private parseUcaNumericId(refCode: string | null | undefined): number | null {
    const normalized = (refCode ?? '').trim().replace(/^UCA-/i, '');
    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const value = Number.parseInt(normalized, 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  private buildUcaRef(refCode: string | null | undefined): string {
    return `UCA-${this.normalizeUcaRefCode(refCode)}`;
  }

  private getDefaultUcaId(): number {
    return this.extractUcaId(this.nextUcaRefValue()) ?? 1;
  }

  private getDefaultUcaRefCode(): string {
    return String(this.getDefaultUcaId()).padStart(2, '0');
  }

  private hasDuplicateUcaId(id: number, excludeId?: number): boolean {
    return this.ucas().some((item) => item.id !== excludeId && item.id === id);
  }

  private setDuplicateRefError(control: { errors: Record<string, unknown> | null; setErrors: (errors: Record<string, unknown> | null) => void; markAsTouched: () => void; }): void {
    control.setErrors({ ...(control.errors ?? {}), duplicate: true });
    control.markAsTouched();
  }

  private incrementPrefixedRef(ref: string, prefix: string): string {
    const match = ref.match(new RegExp(`${prefix}-(\\d+)`, 'i'));
    const value = match ? Number(match[1]) + 1 : 1;
    return `${prefix}-${String(value).padStart(2, '0')}`;
  }

  private buildStepFourUcasPayload() {
    const hazardCodeByLabel = new Map(this.availableHazards().map((item) => [item.label, item.code]));

    return this.ucas().map((item) => ({
      id: item.id,
      ref: item.ref,
      controlActionRef: item.controlActionRef ?? '',
      sourceActor: item.sourceActor,
      targetActor: item.targetActor,
      controller: item.controller,
      controlAction: item.controlAction,
      controlledProcess: item.controlledProcess,
      category: item.category,
      context: item.context,
      consequence: item.consequence,
      rationale: item.rationale,
      hazardRefs: item.hazard.map((hazard) => hazardCodeByLabel.get(hazard) ?? hazard),
      responsibilityId: item.responsibilityId ?? '',
      safetyConstraintId: item.safetyConstraintId ?? ''
    }));
  }

  private buildStepFourHazardousConditionsPayload() {
    const hazardCodeByLabel = new Map(this.availableHazards().map((item) => [item.label, item.code]));

    return this.hazardousConditions().map((item) => ({
      id: item.id,
      ref: item.ref,
      description: item.description,
      linkedHazardRefs: item.linkedHazards.map((hazard) => hazardCodeByLabel.get(hazard) ?? hazard),
      responsibilityId: item.responsibilityId ?? '',
      safetyConstraintId: item.safetyConstraintId ?? '',
      coverageGap: item.coverageGap
    }));
  }

  private buildConstraintSourceLookup(
    ucas: UnsafeControlAction[],
    hazardousConditions: HazardousCondition[]
  ): Map<string, ConstraintSourceOption> {
    return new Map(
      [
        ...ucas.map((item) => ({
          ref: item.ref,
          summary: `${item.ref}: ${item.controlAction} from ${item.sourceActor} to ${item.targetActor}. ${item.context}`,
          hazardLinkage: item.hazard.join(', '),
          responsibilityChain: `${item.responsibility} -> ${item.safetyConstraint} -> ${item.hazard.join(', ')}`
        })),
        ...hazardousConditions.map((item) => ({
          ref: item.ref,
          summary: `${item.ref}: ${item.description}`,
          hazardLinkage: item.linkedHazards.join(', '),
          responsibilityChain: item.responsibility
            ? `${item.responsibility} -> ${item.safetyConstraint || 'Safety Constraint to be defined'} -> ${item.linkedHazards.join(', ')}`
            : `Hazard-only condition -> ${item.linkedHazards.join(', ')}`
        }))
      ].map((item) => [item.ref, item])
    );
  }

  private mapControllerConstraintRecord(
    item: StepFourControllerConstraintRecord,
    sourceLookup: Map<string, ConstraintSourceOption>
  ): ControllerConstraint {
    const sourceRef = this.normalizeConstraintSourceRef(item.sourceUcaHc ?? item.sourceRef ?? '');
    const sourceOption = sourceLookup.get(sourceRef);
    const statement = (item.constraintStatement ?? item.constraint ?? '').trim();

    return {
      id: Number(item.id),
      constraintId: item.constraintId?.trim() || '',
      sourceRef,
      hazardLinkage: item.hazardLinkage?.trim() || sourceOption?.hazardLinkage || '',
      responsibilityChain: item.responsibilityChain?.trim() || sourceOption?.responsibilityChain || '',
      constraint: statement,
      enforcementMechanism: item.enforcementMechanism?.trim() || 'Not specified',
      status: this.normalizeControllerConstraintStatus(item.status)
    };
  }

  private normalizeConstraintSourceRef(value: string | null | undefined): string {
    const trimmedValue = (value ?? '').trim();
    const match = trimmedValue.match(/^(UCA|HC)-(\d+)$/i);

    if (!match) {
      return trimmedValue;
    }

    return `${match[1].toUpperCase()}-${String(Number.parseInt(match[2], 10)).padStart(2, '0')}`;
  }

  private normalizeControllerConstraintStatus(
    status: StepFourControllerConstraintRecord['status'] | string | null | undefined
  ): ControllerConstraint['status'] {
    switch ((status ?? '').trim().toLowerCase()) {
      case 'approved':
        return 'Approved';
      case 'pending review':
        return 'Pending Review';
      default:
        return 'Draft';
    }
  }

  private buildStepFourControllerConstraintsPayload() {
    return this.controllerConstraints().map((item) => ({
      id: item.id,
      constraintId: item.constraintId,
      sourceUcaHc: item.sourceRef,
      constraintStatement: item.constraint
    }));
  }

  private getStepFourSaveErrorMessage(error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error['status']) : undefined;

    if (status === 404) {
      return 'Project not found. The backend returned 404 while saving Step 4.';
    }

    if (status === 400) {
      return 'Failed to save Step 4. The backend rejected the step4Information payload.';
    }

    if (status && status >= 400) {
      return `Failed to save Step 4. The backend returned status ${status}.`;
    }

    return 'Failed to save Step 4 due to an unexpected error.';
  }

  private buildStepFourAiPrompt(): string {
    return `You are generating a complete Step 4 STPA analysis draft.

Return JSON only. Do not include markdown fences or commentary.

Return an object with this exact shape:
{
  "unsafeControlActions": [{
    "controlActionRef": "CA-01",
    "category": "Not provided",
    "context": "",
    "consequence": "",
    "rationale": "",
    "hazards": ["H1 - label"],
    "responsibility": "R1 - label"
  }],
  "hazardousConditions": [{
    "description": "",
    "linkedHazards": ["H1 - label"],
    "responsibility": "R1 - label",
    "coverageGap": ""
  }],
  "controllerConstraints": [{
    "sourceRef": "UCA-01",
    "constraint": "",
    "enforcementMechanism": "",
    "status": "Draft"
  }]
}

Rules:
- Use only controlActionRef values from the provided controlActions catalog.
- Use only hazards from the provided hazards catalog, either by label or code.
- Use only responsibility labels from the provided responsibilities catalog.
- Categories must be one of: Not provided, Provided, Incorrect duration, Incorrect timing.
- Generate a concise but complete set of UCAs, hazardous conditions, and controller constraints.
- Preserve valid existing currentData when possible and fill missing analysis data.
- Avoid duplicates.`;
  }

  private parseStepFourAiDraft(response: unknown): StepFourAiDraft | null {
    const parsed = this.parseAiJsonResponse(response);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as StepFourAiDraft;
  }

  private applyStepFourAiDraft(draft: StepFourAiDraft): void {
    const controlActionMap = new Map(this.controlActionCatalog().map((item) => [item.ref, item]));
    const hazardLabelByCode = new Map(this.availableHazards().map((item) => [item.code, item.label]));
    const hazardLabelSet = new Set(this.availableHazards().map((item) => item.label));
    const responsibilityByLabel = new Map(this.responsibilityCatalog().map((item) => [item.responsibility, item]));
    const allowedCategories = new Set<UcaCategory>([
      'Not provided',
      'Provided',
      'Incorrect timing',
      'Incorrect duration'
    ]);

    let nextUcaId = 0;
    const normalizedUcas = (draft.unsafeControlActions ?? [])
      .map((item) => {
        const controlActionRef = (item.controlActionRef ?? '').trim();
        const controlAction = controlActionMap.get(controlActionRef);
        const responsibility = responsibilityByLabel.get((item.responsibility ?? '').trim());
        const hazards = this.uniqueValues(
          [...(item.hazards ?? []), ...(item.hazardRefs ?? [])].map((hazard) => hazardLabelByCode.get(hazard) ?? hazard)
        ).filter((hazard) => hazardLabelSet.has(hazard));

        if (!controlAction || !responsibility || hazards.length === 0) {
          return null;
        }

        const category = allowedCategories.has(item.category as UcaCategory)
          ? (item.category as UcaCategory)
          : 'Not provided';

        nextUcaId += 1;
        return {
          id: nextUcaId,
          ref: this.formatUcaRef(nextUcaId),
          controlActionRef,
          sourceActor: controlAction.sourceActor,
          targetActor: controlAction.targetActor,
          controller: controlAction.controller,
          controlAction: controlAction.controlAction,
          controlledProcess: controlAction.controlledProcess,
          responsibilityId: responsibility.responsibilityId,
          safetyConstraintId: responsibility.safetyConstraintId,
          responsibility: responsibility.responsibility,
          safetyConstraint: responsibility.safetyConstraint,
          hazard: hazards,
          category,
          context: (item.context ?? '').trim(),
          consequence: (item.consequence ?? '').trim(),
          rationale: (item.rationale ?? '').trim()
        } as UnsafeControlAction;
      })
      .filter((item): item is UnsafeControlAction => !!item)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.controlActionRef === item.controlActionRef && candidate.category === item.category) === index);

    let nextHcId = 0;
    const normalizedHazardousConditions = (draft.hazardousConditions ?? [])
      .map((item) => {
        const responsibility = responsibilityByLabel.get((item.responsibility ?? '').trim());
        const linkedHazards = this.uniqueValues(
          [...(item.linkedHazards ?? []), ...(item.linkedHazardRefs ?? [])].map((hazard) => hazardLabelByCode.get(hazard) ?? hazard)
        ).filter((hazard) => hazardLabelSet.has(hazard));

        if (!responsibility || linkedHazards.length === 0 || !(item.description ?? '').trim()) {
          return null;
        }

        nextHcId += 1;
        return {
          id: nextHcId,
          ref: this.formatHcRef(nextHcId),
          responsibilityId: responsibility.responsibilityId,
          safetyConstraintId: responsibility.safetyConstraintId,
          responsibility: responsibility.responsibility,
          safetyConstraint: responsibility.safetyConstraint,
          description: (item.description ?? '').trim(),
          linkedHazards,
          coverageGap: (item.coverageGap ?? '').trim()
        } as HazardousCondition;
      })
      .filter((item): item is HazardousCondition => !!item);

    const sourceEntries: Array<[string, ConstraintSourceOption]> = [
      ...normalizedUcas.map(
        (item): [string, ConstraintSourceOption] => [
          item.ref,
          {
            ref: item.ref,
            summary: `${item.ref}: ${item.controlAction} from ${item.sourceActor} to ${item.targetActor}. ${item.context}`,
            hazardLinkage: item.hazard.join(', '),
            responsibilityChain: `${item.responsibility} -> ${item.safetyConstraint} -> ${item.hazard.join(', ')}`
          }
        ]
      ),
      ...normalizedHazardousConditions.map(
        (item): [string, ConstraintSourceOption] => [
          item.ref,
          {
            ref: item.ref,
            summary: `${item.ref}: ${item.description}`,
            hazardLinkage: item.linkedHazards.join(', '),
            responsibilityChain: `${item.responsibility} -> ${item.safetyConstraint} -> ${item.linkedHazards.join(', ')}`
          }
        ]
      )
    ];
    const sourceMap = new Map<string, ConstraintSourceOption>(sourceEntries);

    const allowedStatuses = new Set<ControllerConstraint['status']>(['Draft', 'Approved', 'Pending Review']);
    const constraintIdPrefix = this.extractConstraintIdPrefix([], this.nextConstraintIdValue());
    let nextConstraintId = 0;
    let normalizedConstraints = (draft.controllerConstraints ?? [])
      .map((item) => {
        const sourceRef = this.normalizeConstraintSourceRef(item.sourceRef ?? '');
        const source = sourceMap.get(sourceRef);
        const constraint = (item.constraint ?? '').trim();
        const enforcementMechanism = (item.enforcementMechanism ?? '').trim();
        if (!source || !constraint || !enforcementMechanism) {
          return null;
        }

        nextConstraintId += 1;
        return {
          id: nextConstraintId,
          constraintId: `${constraintIdPrefix}${String(nextConstraintId).padStart(2, '0')}`,
          sourceRef,
          hazardLinkage: (item.hazardLinkage ?? '').trim() || source.hazardLinkage,
          responsibilityChain: (item.responsibilityChain ?? '').trim() || source.responsibilityChain,
          constraint,
          enforcementMechanism,
          status: allowedStatuses.has(item.status as ControllerConstraint['status'])
            ? (item.status as ControllerConstraint['status'])
            : 'Draft'
        } as ControllerConstraint;
      })
      .filter((item): item is ControllerConstraint => !!item);

    if (normalizedConstraints.length === 0) {
      normalizedConstraints = Array.from(sourceMap.values()).map((source, index) => ({
        id: index + 1,
        constraintId: `${constraintIdPrefix}${String(index + 1).padStart(2, '0')}`,
        sourceRef: source.ref,
        hazardLinkage: source.hazardLinkage,
        responsibilityChain: source.responsibilityChain,
        constraint: `Ensure ${source.ref} is constrained so the associated hazards are prevented or mitigated.`,
        enforcementMechanism: 'Controller logic, monitoring, and review workflow.',
        status: 'Draft' as const
      }));
    }

    this.ucas.set(normalizedUcas);
    this.hazardousConditions.set(normalizedHazardousConditions);
    this.controllerConstraints.set(normalizedConstraints);
    this.sequence = normalizedUcas.length;
    this.hcSequence = normalizedHazardousConditions.length;
    this.nextUcaRefValue.set(this.formatUcaRef(normalizedUcas.length + 1));
    this.nextHcRefValue.set(this.formatHcRef(normalizedHazardousConditions.length + 1));
    this.nextConstraintIdValue.set(`${constraintIdPrefix}${String(normalizedConstraints.length + 1).padStart(2, '0')}`);
    this.hcDecision.set(normalizedHazardousConditions.length > 0 ? 'yes' : 'no');
    this.ucaForm.patchValue({ refCode: this.getDefaultUcaRefCode() });
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
