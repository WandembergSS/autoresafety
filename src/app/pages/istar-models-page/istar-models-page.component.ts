import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService, StepTwoProjectUpdatePayload } from '../../services/project.service';

type ActorType = 'Actor' | 'Agent' | 'Role';
type ActorAssociationType = 'is-a' | 'participates-in';

type StandardElementType = 'Goal' | 'Task' | 'Resource' | 'Quality';
type SafetyElementType = 'SafetyGoal' | 'Hazard' | 'SafetyTask' | 'SafetyResource';
type IntentionalElementType = StandardElementType | SafetyElementType;

type SafetyGoalKind = 'Safety Constraint' | 'Responsibility';
type InternalRelationshipType = 'Refinement' | 'NeededBy' | 'Contribution' | 'Qualification';
type RefinementType = 'AND' | 'OR';
type ContributionMetric = 'Make' | 'Help' | 'Hurt' | 'Break';
type AccidentLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

interface ActorAssociation {
  type: ActorAssociationType;
  targetActorId: string;
}

interface ActorDefinition {
  id: string;
  name: string;
  type: ActorType;
  x?: number;
  y?: number;
  associations: ActorAssociation[];
}

interface IntentionalElement {
  id: string;
  actorId: string;
  name: string;
  traceabilityId?: string;
  type: IntentionalElementType;
  source: 'standard' | 'safety';
  x?: number;
  y?: number;
  accidentLevel?: AccidentLevel;
  safetyGoalKind?: SafetyGoalKind;
  obstructsSafetyGoalIds?: string[];
}

interface InternalRelationship {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  type: InternalRelationshipType;
  refinementType?: RefinementType;
  contributionMetric?: ContributionMetric;
}

interface SocialDependency {
  id: string;
  dependerActorId: string;
  dependerElementId?: string;
  dependum: {
    id: string;
    name: string;
    type: StandardElementType;
  };
  dependeeActorId: string;
  dependeeElementId?: string;
  x?: number;
  y?: number;
}

interface StepTwoIntentionalElementDto {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  accidentLevel?: string | null;
  safetyGoalKind?: string | null;
  refinedBy?: string[];
  obstructs?: string[];
  qualifies?: string[];
}

interface StepTwoRefinementDto {
  id: string;
  type: string;
  parent: string;
  children: string[];
}

interface StepTwoContributionDto {
  id: string;
  source: string;
  target: string;
  metric?: string;
}

interface StepTwoNeededByDto {
  id: string;
  source: string;
  target: string;
}

interface StepTwoInternalLinksDto {
  refinements?: StepTwoRefinementDto[];
  contributions?: StepTwoContributionDto[];
  neededBy?: StepTwoNeededByDto[];
}

interface StepTwoActorDto {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  isA?: string[];
  participatesIn?: string[];
  intentionalElements?: StepTwoIntentionalElementDto[];
  internalLinks?: StepTwoInternalLinksDto;
}

interface StepTwoDependumDto {
  id: string;
  name: string;
  type: StandardElementType;
}

interface StepTwoDependencyDto {
  id: string;
  depender: string;
  dependerElement?: string | null;
  x?: number;
  y?: number;
  dependum: StepTwoDependumDto;
  dependee: string;
  dependeeElement?: string | null;
}

interface StepTwoGoalLinkDto {
  id?: string | number;
  fromActor?: string;
  toActor?: string;
  goal?: string;
  linkType?: string;
  dependumType?: string;
  x?: number;
  y?: number;
}

interface StepTwoInformationDto {
  modelName: string | null;
  actors: StepTwoActorDto[];
  dependencies: StepTwoDependencyDto[];
}

interface PistarElement {
  id: string;
  text: string;
  type: string;
  x: number;
  y: number;
  customProperties?: Record<string, unknown>;
  nodes?: PistarElement[];
  source?: string;
  target?: string;
}

interface PistarLink {
  id: string;
  type: string;
  source: string;
  target: string;
  label?: string;
}

interface PistarModel {
  actors: PistarElement[];
  dependencies: PistarElement[];
  links: PistarLink[];
  display: Record<string, unknown>;
  tool: string;
  istar: string;
  saveDate: string;
  diagram: {
    width: number;
    height: number;
    name: string;
    customProperties?: Record<string, unknown>;
  };
}

interface PistarModelPatch {
  actors?: PistarElement[];
  dependencies?: PistarElement[];
  links?: PistarLink[];
  display?: Record<string, unknown>;
  tool?: string;
  istar?: string;
  saveDate?: string;
  diagram?: Partial<PistarModel['diagram']>;
}

@Component({
  selector: 'app-istar-models-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './istar-models-page.component.html',
  styleUrl: './istar-models-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IstarModelsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly aiFeedback = inject(AiFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('modellerFrame') private modellerFrame?: ElementRef<HTMLIFrameElement>;

  readonly actorDefinitionForm = this.fb.group({
    actorName: ['', Validators.required],
    actorType: ['Actor' as ActorType, Validators.required],
    isATargetActorId: [''],
    participatesInTargetActorId: ['']
  });

  readonly standardIntentionalElementForm = this.fb.group({
    actorId: ['', Validators.required],
    elementName: ['', Validators.required],
    elementType: ['Goal' as StandardElementType, Validators.required]
  });

  readonly safetyIntentionalElementForm = this.fb.group({
    actorId: ['', Validators.required],
    traceabilityId: ['', Validators.required],
    elementName: ['', Validators.required],
    elementType: ['SafetyGoal' as SafetyElementType, Validators.required],
    safetyGoalKind: ['Safety Constraint' as SafetyGoalKind],
    accidentLevel: ['L1' as AccidentLevel],
    obstructsSafetyGoalIds: [[] as string[]]
  });

  readonly internalRelationshipForm = this.fb.group({
    sourceElementId: ['', Validators.required],
    targetElementId: ['', Validators.required],
    relationshipType: ['Refinement' as InternalRelationshipType, Validators.required],
    refinementType: ['AND' as RefinementType],
    contributionMetric: ['Help' as ContributionMetric]
  });

  readonly socialDependencyForm = this.fb.group({
    dependerActorId: ['', Validators.required],
    dependerElementId: [''],
    dependumName: ['', Validators.required],
    dependumType: ['Goal' as StandardElementType, Validators.required],
    dependeeActorId: ['', Validators.required],
    dependeeElementId: ['']
  });

  readonly addActorsAiForm = this.fb.group({
    minActors: [1, [Validators.required, Validators.min(1)]],
    maxActors: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addGoalsAiForm = this.fb.group({
    minGoals: [1, [Validators.required, Validators.min(1)]],
    maxGoals: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addQualityAiForm = this.fb.group({
    minQualities: [1, [Validators.required, Validators.min(1)]],
    maxQualities: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addResourceAiForm = this.fb.group({
    minResources: [1, [Validators.required, Validators.min(1)]],
    maxResources: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addSafetyGoalAiForm = this.fb.group({
    minSafetyGoals: [1, [Validators.required, Validators.min(1)]],
    maxSafetyGoals: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addHazardAiForm = this.fb.group({
    minHazards: [1, [Validators.required, Validators.min(1)]],
    maxHazards: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addSafetyTaskAiForm = this.fb.group({
    minSafetyTasks: [1, [Validators.required, Validators.min(1)]],
    maxSafetyTasks: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly addSafetyResourceAiForm = this.fb.group({
    minSafetyResources: [1, [Validators.required, Validators.min(1)]],
    maxSafetyResources: [3, [Validators.required, Validators.min(1)]],
    promptInstructions: ['']
  });

  readonly currentProjectId = signal<number | null>(null);
  readonly currentProjectName = signal('project');

  readonly actors = signal<ActorDefinition[]>([]);
  readonly standardIntentionalElements = signal<IntentionalElement[]>([]);
  readonly safetyIntentionalElements = signal<IntentionalElement[]>([]);
  readonly internalRelationships = signal<InternalRelationship[]>([]);
  readonly socialDependencies = signal<SocialDependency[]>([]);

  readonly validationErrors = signal<string[]>([]);
  readonly payloadPreview = signal<string>('');
  readonly processWarnings = signal<string[]>([]);
  readonly isBpmnModelModalOpen = signal(false);
  readonly isAddActorsAiModalOpen = signal(false);
  readonly isAddActorsAiRunning = signal(false);
  readonly addActorsAiError = signal<string | null>(null);
  readonly isAddGoalsAiModalOpen = signal(false);
  readonly isAddGoalsAiRunning = signal(false);
  readonly addGoalsAiError = signal<string | null>(null);
  readonly isAddQualityAiModalOpen = signal(false);
  readonly isAddQualityAiRunning = signal(false);
  readonly addQualityAiError = signal<string | null>(null);
  readonly isAddResourceAiModalOpen = signal(false);
  readonly isAddResourceAiRunning = signal(false);
  readonly addResourceAiError = signal<string | null>(null);
  readonly isAddSafetyGoalAiModalOpen = signal(false);
  readonly isAddSafetyGoalAiRunning = signal(false);
  readonly addSafetyGoalAiError = signal<string | null>(null);
  readonly isAddHazardAiModalOpen = signal(false);
  readonly isAddHazardAiRunning = signal(false);
  readonly addHazardAiError = signal<string | null>(null);
  readonly isAddSafetyTaskAiModalOpen = signal(false);
  readonly isAddSafetyTaskAiRunning = signal(false);
  readonly addSafetyTaskAiError = signal<string | null>(null);
  readonly isAddSafetyResourceAiModalOpen = signal(false);
  readonly isAddSafetyResourceAiRunning = signal(false);
  readonly addSafetyResourceAiError = signal<string | null>(null);
  readonly isCorrectingModelWithAi = signal(false);
  readonly correctModelAiError = signal<string | null>(null);
  readonly isSavingStepTwo = signal(false);
  readonly stepTwoSaveMessage = signal<string | null>(null);
  readonly stepTwoSaveError = signal<string | null>(null);

  readonly isStep21Complete = computed(() => this.actors().length > 0);
  readonly canStartStep22 = computed(() => this.isStep21Complete());
  readonly isStep221Complete = computed(() =>
    this.standardIntentionalElements().some((element) => element.type === 'Goal')
  );
  readonly canDoStep222 = computed(() => this.canStartStep22() && this.isStep221Complete());
  readonly isStep222Complete = computed(() =>
    this.safetyIntentionalElements().some((element) => (element.traceabilityId ?? '').toUpperCase().startsWith('SC-'))
  );
  readonly canDoStep223 = computed(() => this.canDoStep222() && this.isStep222Complete());
  readonly isStep223Complete = computed(() =>
    this.safetyIntentionalElements().some((element) => (element.traceabilityId ?? '').toUpperCase().startsWith('R-'))
  );
  readonly canDoStep224 = computed(() => this.canDoStep223() && this.isStep223Complete());
  readonly canAiAddActors = computed(() => true);
  readonly canAiAddGoals = computed(() => this.actors().length > 0);
  readonly canAiAddQuality = computed(() => this.actors().length > 0);
  readonly canAiAddResource = computed(() => this.actors().length > 0);
  readonly canAiAddSafetyGoal = computed(() => this.actors().length > 0);
  readonly canAiAddHazard = computed(() => this.actors().length > 0 && this.getSafetyGoals().length > 0);
  readonly canAiAddSafetyTask = computed(() => this.actors().length > 0);
  readonly canAiAddSafetyResource = computed(
    () =>
      this.actors().length > 0 &&
      this.getAllElements().some((element) => element.type === 'Task' || element.type === 'SafetyTask' || element.type === 'Hazard')
  );

  private actorSeq = 0;
  private elementSeq = 0;
  private relationshipSeq = 0;
  private dependencySeq = 0;
  private dependumSeq = 0;

  private syncPullIntervalId: number | null = null;
  private syncPushTimeoutId: number | null = null;
  private suppressFormToModelSync = false;
  private suppressModelToFormSync = false;
  private lastPulledModelSnapshot = '';
  private lastPushedModelSnapshot = '';

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.syncPullIntervalId !== null) {
        window.clearInterval(this.syncPullIntervalId);
      }
      if (this.syncPushTimeoutId !== null) {
        window.clearTimeout(this.syncPushTimeoutId);
      }
    });

    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          const projectIdParam = params.get('projectId');
          const parsedProjectId = projectIdParam ? Number(projectIdParam) : null;
          const projectId = parsedProjectId && !Number.isNaN(parsedProjectId) ? parsedProjectId : null;

          this.currentProjectId.set(projectId);
          this.resolveCurrentProjectName();

          if (!projectId) {
            this.resetStepTwoState();
            return EMPTY;
          }

          return this.projectService.getStepTwoInformation(projectId).pipe(
            tap((response) => {
              console.info('[Step2][API] GET step_two_project_information success', {
                projectId,
                topLevelKeys: Object.keys(response ?? {})
              });
              this.hydrateFromStepTwoInformation(this.extractStepTwoInformationFromApiResponse(response));
            }),
            catchError((error) => {
              console.error('[Step2][API] GET step_two_project_information failed', { projectId, error });
              console.error('Failed to fetch Step 2 information via GET /api/projects/step_two_project_information/{id}', error);
              this.resetStepTwoState();
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private resolveCurrentProjectName(): void {
    const projectId = this.currentProjectId();
    if (!projectId) {
      return;
    }

    this.projectService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          const project = projects.find((item) => item.id === projectId);
          const resolved = project?.name?.trim();
          if (resolved) {
            this.currentProjectName.set(resolved);
          }
        },
        error: () => {
        }
      });
  }

  addActorDefinition(): void {
    if (this.actorDefinitionForm.invalid) {
      this.actorDefinitionForm.markAllAsTouched();
      return;
    }

    const { actorName, actorType, isATargetActorId, participatesInTargetActorId } = this.actorDefinitionForm.getRawValue();
    const trimmedName = actorName?.trim() ?? '';
    if (!trimmedName) {
      this.actorDefinitionForm.controls.actorName.setErrors({ required: true });
      return;
    }

    const associations: ActorAssociation[] = [];
    if (isATargetActorId) {
      associations.push({ type: 'is-a', targetActorId: isATargetActorId });
    }
    if (participatesInTargetActorId) {
      associations.push({ type: 'participates-in', targetActorId: participatesInTargetActorId });
    }

    this.actors.update((current) => [
      ...current,
      {
        id: this.nextActorId(),
        name: trimmedName,
        type: actorType ?? 'Actor',
        associations
      }
    ]);

    this.actorDefinitionForm.reset({
      actorType: 'Actor',
      isATargetActorId: '',
      participatesInTargetActorId: ''
    });

    this.queuePushModelFromForms();
  }

  openAddActorsAiModal(): void {
    this.addActorsAiError.set(null);
    this.addActorsAiForm.reset({
      minActors: 1,
      maxActors: 3,
      promptInstructions: ''
    });
    this.isAddActorsAiModalOpen.set(true);
  }

  closeAddActorsAiModal(): void {
    if (this.isAddActorsAiRunning()) {
      return;
    }

    this.isAddActorsAiModalOpen.set(false);
    this.addActorsAiError.set(null);
  }

  openAddGoalsAiModal(): void {
    this.addGoalsAiError.set(null);
    this.addGoalsAiForm.reset({
      minGoals: 1,
      maxGoals: 3,
      promptInstructions: ''
    });
    this.isAddGoalsAiModalOpen.set(true);
  }

  closeAddGoalsAiModal(): void {
    if (this.isAddGoalsAiRunning()) {
      return;
    }

    this.isAddGoalsAiModalOpen.set(false);
    this.addGoalsAiError.set(null);
  }

  openAddQualityAiModal(): void {
    this.addQualityAiError.set(null);
    this.addQualityAiForm.reset({
      minQualities: 1,
      maxQualities: 3,
      promptInstructions: ''
    });
    this.isAddQualityAiModalOpen.set(true);
  }

  closeAddQualityAiModal(): void {
    if (this.isAddQualityAiRunning()) {
      return;
    }

    this.isAddQualityAiModalOpen.set(false);
    this.addQualityAiError.set(null);
  }

  openAddResourceAiModal(): void {
    this.addResourceAiError.set(null);
    this.addResourceAiForm.reset({
      minResources: 1,
      maxResources: 3,
      promptInstructions: ''
    });
    this.isAddResourceAiModalOpen.set(true);
  }

  closeAddResourceAiModal(): void {
    if (this.isAddResourceAiRunning()) {
      return;
    }

    this.isAddResourceAiModalOpen.set(false);
    this.addResourceAiError.set(null);
  }

  openAddSafetyGoalAiModal(): void {
    this.addSafetyGoalAiError.set(null);
    this.addSafetyGoalAiForm.reset({
      minSafetyGoals: 1,
      maxSafetyGoals: 3,
      promptInstructions: ''
    });
    this.isAddSafetyGoalAiModalOpen.set(true);
  }

  closeAddSafetyGoalAiModal(): void {
    if (this.isAddSafetyGoalAiRunning()) {
      return;
    }

    this.isAddSafetyGoalAiModalOpen.set(false);
    this.addSafetyGoalAiError.set(null);
  }

  openAddHazardAiModal(): void {
    this.addHazardAiError.set(null);
    this.addHazardAiForm.reset({
      minHazards: 1,
      maxHazards: 3,
      promptInstructions: ''
    });
    this.isAddHazardAiModalOpen.set(true);
  }

  closeAddHazardAiModal(): void {
    if (this.isAddHazardAiRunning()) {
      return;
    }

    this.isAddHazardAiModalOpen.set(false);
    this.addHazardAiError.set(null);
  }

  openAddSafetyTaskAiModal(): void {
    this.addSafetyTaskAiError.set(null);
    this.addSafetyTaskAiForm.reset({
      minSafetyTasks: 1,
      maxSafetyTasks: 3,
      promptInstructions: ''
    });
    this.isAddSafetyTaskAiModalOpen.set(true);
  }

  closeAddSafetyTaskAiModal(): void {
    if (this.isAddSafetyTaskAiRunning()) {
      return;
    }

    this.isAddSafetyTaskAiModalOpen.set(false);
    this.addSafetyTaskAiError.set(null);
  }

  openAddSafetyResourceAiModal(): void {
    this.addSafetyResourceAiError.set(null);
    this.addSafetyResourceAiForm.reset({
      minSafetyResources: 1,
      maxSafetyResources: 3,
      promptInstructions: ''
    });
    this.isAddSafetyResourceAiModalOpen.set(true);
  }

  closeAddSafetyResourceAiModal(): void {
    if (this.isAddSafetyResourceAiRunning()) {
      return;
    }

    this.isAddSafetyResourceAiModalOpen.set(false);
    this.addSafetyResourceAiError.set(null);
  }

  private runPistarAiRequest(options: {
    currentModel: PistarModel;
    question: string;
    context: string;
    setRunning: (value: boolean) => void;
    setError: (message: string | null) => void;
    invalidPayloadMessage: string;
    requestFailureMessage: string;
    successMessage: string;
    closeModal: () => void;
    validatePatch?: (patch: PistarModelPatch) => string | null;
    preparePatch?: (patch: PistarModelPatch, currentModel: PistarModel) => PistarModelPatch;
    mergeOptions?: { allowExistingActorUpdates?: boolean };
    errorLogLabel: string;
  }): void {
    options.setRunning(true);
    options.setError(null);
    this.stepTwoSaveMessage.set(null);

    this.aiAssistant
      .askWithSummary({ question: options.question, context: options.context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => options.setRunning(false))
      )
      .subscribe({
        next: ({ payload, summary }) => {
          const parsedPatch = this.parsePistarModelFromAiResponse(payload);
          if (!parsedPatch) {
            options.setError(options.invalidPayloadMessage);
            this.aiFeedback.showError(options.invalidPayloadMessage);
            return;
          }

          const preparedPatch = options.preparePatch
            ? options.preparePatch(parsedPatch, options.currentModel)
            : parsedPatch;

          const validationError = options.validatePatch?.(preparedPatch) ?? null;
          if (validationError) {
            options.setError(validationError);
            this.aiFeedback.showError(validationError);
            return;
          }

          const normalizedPatch = this.normalizeAiModelPatchForMerge(
            options.currentModel,
            preparedPatch,
            options.mergeOptions
          );
          const mergedModel = this.mergePistarModels(options.currentModel, normalizedPatch);
          const sanitizedModel = this.sanitizePistarModelForImport(mergedModel);
          const serialized = JSON.stringify(sanitizedModel);
          this.lastPulledModelSnapshot = serialized;
          this.lastPushedModelSnapshot = serialized;
          this.syncFormsFromPistarModel(sanitizedModel);
          this.applyModelObjectToPistar(sanitizedModel);
          this.stepTwoSaveError.set(null);
          this.stepTwoSaveMessage.set(options.successMessage);
          options.closeModal();
          this.aiFeedback.showSummary(summary);
        },
        error: (error) => {
          options.setError(options.requestFailureMessage);
          this.aiFeedback.showError(options.requestFailureMessage);
          console.error(`${options.errorLogLabel} via /api/ai/ask`, error);
        }
      });
  }

  submitAddActorsAiRequest(): void {
    if (this.isAddActorsAiRunning()) {
      return;
    }

    if (this.addActorsAiForm.invalid) {
      this.addActorsAiForm.markAllAsTouched();
      return;
    }

    const minActorsToAdd = Number(this.addActorsAiForm.controls.minActors.value ?? 1);
    const maxActorsToAdd = Number(this.addActorsAiForm.controls.maxActors.value ?? 3);
    const promptInstructions = (this.addActorsAiForm.controls.promptInstructions.value ?? '').trim();

    if (minActorsToAdd > maxActorsToAdd) {
      this.addActorsAiError.set('Minimum number of actors cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddActorsAiPrompt(currentModel, minActorsToAdd, maxActorsToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddActorsAiRunning.set(value),
      setError: (message) => this.addActorsAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid model payload.',
      requestFailureMessage: 'Failed to generate actors with AI.',
      successMessage: 'AI actor proposal applied to the Step 2 model.',
      closeModal: () => this.isAddActorsAiModalOpen.set(false),
      validatePatch: (parsedPatch) => this.validateAiActorPatchCount(parsedPatch, minActorsToAdd, maxActorsToAdd),
      errorLogLabel: 'Failed to generate Step 2 actors'
    });
  }

  submitAddGoalsAiRequest(): void {
    if (this.isAddGoalsAiRunning()) {
      return;
    }

    if (this.addGoalsAiForm.invalid) {
      this.addGoalsAiForm.markAllAsTouched();
      return;
    }

    const minGoalsToAdd = Number(this.addGoalsAiForm.controls.minGoals.value ?? 1);
    const maxGoalsToAdd = Number(this.addGoalsAiForm.controls.maxGoals.value ?? 3);
    const promptInstructions = (this.addGoalsAiForm.controls.promptInstructions.value ?? '').trim();

    if (minGoalsToAdd > maxGoalsToAdd) {
      this.addGoalsAiError.set('Minimum number of goals cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddGoalsAiPrompt(currentModel, minGoalsToAdd, maxGoalsToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddGoalsAiRunning.set(value),
      setError: (message) => this.addGoalsAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid goal patch payload.',
      requestFailureMessage: 'Failed to generate goals with AI.',
      successMessage: 'AI goal proposal applied to the Step 2 model.',
      closeModal: () => this.isAddGoalsAiModalOpen.set(false),
      validatePatch: (parsedPatch) => this.validateAiGoalPatchCount(currentModel, parsedPatch, minGoalsToAdd, maxGoalsToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 goals'
    });
  }

  submitAddQualityAiRequest(): void {
    if (this.isAddQualityAiRunning()) {
      return;
    }

    if (this.addQualityAiForm.invalid) {
      this.addQualityAiForm.markAllAsTouched();
      return;
    }

    const minQualitiesToAdd = Number(this.addQualityAiForm.controls.minQualities.value ?? 1);
    const maxQualitiesToAdd = Number(this.addQualityAiForm.controls.maxQualities.value ?? 3);
    const promptInstructions = (this.addQualityAiForm.controls.promptInstructions.value ?? '').trim();

    if (minQualitiesToAdd > maxQualitiesToAdd) {
      this.addQualityAiError.set('Minimum number of qualities cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddQualityAiPrompt(currentModel, minQualitiesToAdd, maxQualitiesToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddQualityAiRunning.set(value),
      setError: (message) => this.addQualityAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid quality patch payload.',
      requestFailureMessage: 'Failed to generate qualities with AI.',
      successMessage: 'AI quality proposal applied to the Step 2 model.',
      closeModal: () => this.isAddQualityAiModalOpen.set(false),
      validatePatch: (parsedPatch) =>
        this.validateAiQualityPatchCount(currentModel, parsedPatch, minQualitiesToAdd, maxQualitiesToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 qualities'
    });
  }

  submitAddResourceAiRequest(): void {
    if (this.isAddResourceAiRunning()) {
      return;
    }

    if (this.addResourceAiForm.invalid) {
      this.addResourceAiForm.markAllAsTouched();
      return;
    }

    const minResourcesToAdd = Number(this.addResourceAiForm.controls.minResources.value ?? 1);
    const maxResourcesToAdd = Number(this.addResourceAiForm.controls.maxResources.value ?? 3);
    const promptInstructions = (this.addResourceAiForm.controls.promptInstructions.value ?? '').trim();

    if (minResourcesToAdd > maxResourcesToAdd) {
      this.addResourceAiError.set('Minimum number of resources cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddResourceAiPrompt(currentModel, minResourcesToAdd, maxResourcesToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddResourceAiRunning.set(value),
      setError: (message) => this.addResourceAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid resource patch payload.',
      requestFailureMessage: 'Failed to generate resources with AI.',
      successMessage: 'AI resource proposal applied to the Step 2 model.',
      closeModal: () => this.isAddResourceAiModalOpen.set(false),
      validatePatch: (parsedPatch) =>
        this.validateAiResourcePatchCount(currentModel, parsedPatch, minResourcesToAdd, maxResourcesToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 resources'
    });
  }

  submitAddSafetyGoalAiRequest(): void {
    if (this.isAddSafetyGoalAiRunning()) {
      return;
    }

    if (this.addSafetyGoalAiForm.invalid) {
      this.addSafetyGoalAiForm.markAllAsTouched();
      return;
    }

    const minSafetyGoalsToAdd = Number(this.addSafetyGoalAiForm.controls.minSafetyGoals.value ?? 1);
    const maxSafetyGoalsToAdd = Number(this.addSafetyGoalAiForm.controls.maxSafetyGoals.value ?? 3);
    const promptInstructions = (this.addSafetyGoalAiForm.controls.promptInstructions.value ?? '').trim();

    if (minSafetyGoalsToAdd > maxSafetyGoalsToAdd) {
      this.addSafetyGoalAiError.set('Minimum number of safety goals cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddSafetyGoalAiPrompt(currentModel, minSafetyGoalsToAdd, maxSafetyGoalsToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddSafetyGoalAiRunning.set(value),
      setError: (message) => this.addSafetyGoalAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid safety goal patch payload.',
      requestFailureMessage: 'Failed to generate safety goals with AI.',
      successMessage: 'AI safety goal proposal applied to the Step 2 model.',
      closeModal: () => this.isAddSafetyGoalAiModalOpen.set(false),
      validatePatch: (parsedPatch) =>
        this.validateAiSafetyGoalPatchCount(currentModel, parsedPatch, minSafetyGoalsToAdd, maxSafetyGoalsToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 safety goals'
    });
  }

  submitAddHazardAiRequest(): void {
    if (this.isAddHazardAiRunning()) {
      return;
    }

    if (this.addHazardAiForm.invalid) {
      this.addHazardAiForm.markAllAsTouched();
      return;
    }

    const minHazardsToAdd = Number(this.addHazardAiForm.controls.minHazards.value ?? 1);
    const maxHazardsToAdd = Number(this.addHazardAiForm.controls.maxHazards.value ?? 3);
    const promptInstructions = (this.addHazardAiForm.controls.promptInstructions.value ?? '').trim();

    if (minHazardsToAdd > maxHazardsToAdd) {
      this.addHazardAiError.set('Minimum number of hazards cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddHazardAiPrompt(currentModel, minHazardsToAdd, maxHazardsToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddHazardAiRunning.set(value),
      setError: (message) => this.addHazardAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid hazard patch payload.',
      requestFailureMessage: 'Failed to generate hazards with AI.',
      successMessage: 'AI hazard proposal applied to the Step 2 model.',
      closeModal: () => this.isAddHazardAiModalOpen.set(false),
      validatePatch: (parsedPatch) =>
        this.validateAiHazardPatchCount(currentModel, parsedPatch, minHazardsToAdd, maxHazardsToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 hazards'
    });
  }

  submitAddSafetyTaskAiRequest(): void {
    if (this.isAddSafetyTaskAiRunning()) {
      return;
    }

    if (this.addSafetyTaskAiForm.invalid) {
      this.addSafetyTaskAiForm.markAllAsTouched();
      return;
    }

    const minSafetyTasksToAdd = Number(this.addSafetyTaskAiForm.controls.minSafetyTasks.value ?? 1);
    const maxSafetyTasksToAdd = Number(this.addSafetyTaskAiForm.controls.maxSafetyTasks.value ?? 3);
    const promptInstructions = (this.addSafetyTaskAiForm.controls.promptInstructions.value ?? '').trim();

    if (minSafetyTasksToAdd > maxSafetyTasksToAdd) {
      this.addSafetyTaskAiError.set('Minimum number of safety tasks cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddSafetyTaskAiPrompt(currentModel, minSafetyTasksToAdd, maxSafetyTasksToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddSafetyTaskAiRunning.set(value),
      setError: (message) => this.addSafetyTaskAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid safety task patch payload.',
      requestFailureMessage: 'Failed to generate safety tasks with AI.',
      successMessage: 'AI safety task proposal applied to the Step 2 model.',
      closeModal: () => this.isAddSafetyTaskAiModalOpen.set(false),
      validatePatch: (parsedPatch) =>
        this.validateAiSafetyTaskPatchCount(currentModel, parsedPatch, minSafetyTasksToAdd, maxSafetyTasksToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 safety tasks'
    });
  }

  submitAddSafetyResourceAiRequest(): void {
    if (this.isAddSafetyResourceAiRunning()) {
      return;
    }

    if (this.addSafetyResourceAiForm.invalid) {
      this.addSafetyResourceAiForm.markAllAsTouched();
      return;
    }

    const minSafetyResourcesToAdd = Number(this.addSafetyResourceAiForm.controls.minSafetyResources.value ?? 1);
    const maxSafetyResourcesToAdd = Number(this.addSafetyResourceAiForm.controls.maxSafetyResources.value ?? 3);
    const promptInstructions = (this.addSafetyResourceAiForm.controls.promptInstructions.value ?? '').trim();

    if (minSafetyResourcesToAdd > maxSafetyResourcesToAdd) {
      this.addSafetyResourceAiError.set('Minimum number of safety resources cannot be greater than the maximum.');
      return;
    }

    const currentModel = this.getCurrentPistarModelForAi();
    const question = this.buildAddSafetyResourceAiPrompt(currentModel, minSafetyResourcesToAdd, maxSafetyResourcesToAdd, promptInstructions);
    const context = JSON.stringify(currentModel, null, 2);

    this.runPistarAiRequest({
      currentModel,
      question,
      context,
      setRunning: (value) => this.isAddSafetyResourceAiRunning.set(value),
      setError: (message) => this.addSafetyResourceAiError.set(message),
      invalidPayloadMessage: 'AI returned an invalid safety resource patch payload.',
      requestFailureMessage: 'Failed to generate safety resources with AI.',
      successMessage: 'AI safety resource proposal applied to the Step 2 model.',
      closeModal: () => this.isAddSafetyResourceAiModalOpen.set(false),
      preparePatch: (parsedPatch, baseModel) => this.coerceSafetyResourceAiPatch(baseModel, parsedPatch),
      validatePatch: (parsedPatch) =>
        this.validateAiSafetyResourcePatchCount(currentModel, parsedPatch, minSafetyResourcesToAdd, maxSafetyResourcesToAdd),
      mergeOptions: { allowExistingActorUpdates: true },
      errorLogLabel: 'Failed to generate Step 2 safety resources'
    });
  }

  removeActorDefinition(actorId: string): void {
    const actorElementIds = this.getAllElements()
      .filter((element) => element.actorId === actorId)
      .map((element) => element.id);

    this.actors.update((current) =>
      current
        .filter((actor) => actor.id !== actorId)
        .map((actor) => ({
          ...actor,
          associations: actor.associations.filter((association) => association.targetActorId !== actorId)
        }))
    );

    this.standardIntentionalElements.update((current) => current.filter((element) => element.actorId !== actorId));
    this.safetyIntentionalElements.update((current) => current.filter((element) => element.actorId !== actorId));

    this.internalRelationships.update((current) =>
      current.filter(
        (relationship) =>
          !actorElementIds.includes(relationship.sourceElementId) && !actorElementIds.includes(relationship.targetElementId)
      )
    );

    this.socialDependencies.update((current) =>
      current.filter(
        (dependency) =>
          dependency.dependerActorId !== actorId &&
          dependency.dependeeActorId !== actorId &&
          (!dependency.dependerElementId || !actorElementIds.includes(dependency.dependerElementId)) &&
          (!dependency.dependeeElementId || !actorElementIds.includes(dependency.dependeeElementId))
      )
    );

    this.queuePushModelFromForms();
  }

  addStandardIntentionalElement(): void {
    if (!this.canStartStep22()) {
      return;
    }

    if (this.standardIntentionalElementForm.invalid) {
      this.standardIntentionalElementForm.markAllAsTouched();
      return;
    }

    const { actorId, elementName, elementType } = this.standardIntentionalElementForm.getRawValue();
    const trimmedName = elementName?.trim() ?? '';
    if (!actorId || !trimmedName) {
      return;
    }

    this.standardIntentionalElements.update((current) => [
      ...current,
      {
        id: this.nextElementId(),
        actorId,
        name: trimmedName,
        type: elementType ?? 'Goal',
        source: 'standard'
      }
    ]);

    this.standardIntentionalElementForm.reset({
      actorId: '',
      elementType: 'Goal'
    });

    this.queuePushModelFromForms();
  }

  removeStandardIntentionalElement(elementId: string): void {
    this.standardIntentionalElements.update((current) => current.filter((element) => element.id !== elementId));
    this.removeElementReferences(elementId);
    this.queuePushModelFromForms();
  }

  addSafetyIntentionalElement(): void {
    if (!this.canDoStep222()) {
      return;
    }

    if (this.safetyIntentionalElementForm.invalid) {
      this.safetyIntentionalElementForm.markAllAsTouched();
      return;
    }

    const { actorId, traceabilityId, elementName, elementType, safetyGoalKind, accidentLevel, obstructsSafetyGoalIds } =
      this.safetyIntentionalElementForm.getRawValue();

    const trimmedName = elementName?.trim() ?? '';
    const trimmedTraceabilityId = traceabilityId?.trim() ?? '';
    if (!actorId || !trimmedName || !trimmedTraceabilityId || !elementType) {
      return;
    }

    if (!this.isValidTraceabilityIdForType(trimmedTraceabilityId, elementType, safetyGoalKind ?? undefined)) {
      this.safetyIntentionalElementForm.controls.traceabilityId.setErrors({ invalidTraceability: true });
      return;
    }

    if (elementType === 'Hazard' && (!obstructsSafetyGoalIds || obstructsSafetyGoalIds.length === 0)) {
      this.safetyIntentionalElementForm.controls.obstructsSafetyGoalIds.setErrors({ required: true });
      return;
    }

    const payload: IntentionalElement = {
      id: this.nextElementId(),
      actorId,
      name: trimmedName,
      traceabilityId: trimmedTraceabilityId,
      type: elementType,
      source: 'safety'
    };

    if (elementType === 'SafetyGoal') {
      payload.accidentLevel = accidentLevel ?? 'L1';
      payload.safetyGoalKind = safetyGoalKind ?? 'Safety Constraint';
    }

    if (elementType === 'Hazard') {
      payload.obstructsSafetyGoalIds = [...(obstructsSafetyGoalIds ?? [])];
    }

    this.safetyIntentionalElements.update((current) => [...current, payload]);
    this.processWarnings.set([]);

    this.safetyIntentionalElementForm.reset({
      actorId: '',
      traceabilityId: '',
      elementType: 'SafetyGoal',
      safetyGoalKind: 'Safety Constraint',
      accidentLevel: 'L1',
      obstructsSafetyGoalIds: []
    });

    this.queuePushModelFromForms();
  }

  removeSafetyIntentionalElement(elementId: string): void {
    this.safetyIntentionalElements.update((current) =>
      current
        .filter((element) => element.id !== elementId)
        .map((element) => ({
          ...element,
          obstructsSafetyGoalIds: element.obstructsSafetyGoalIds?.filter((id) => id !== elementId)
        }))
    );
    this.removeElementReferences(elementId);
    this.queuePushModelFromForms();
  }

  private removeElementReferences(elementId: string): void {
    this.internalRelationships.update((current) =>
      current.filter(
        (relationship) => relationship.sourceElementId !== elementId && relationship.targetElementId !== elementId
      )
    );

    this.socialDependencies.update((current) =>
      current.filter(
        (dependency) => dependency.dependerElementId !== elementId && dependency.dependeeElementId !== elementId
      )
    );

    this.safetyIntentionalElements.update((current) =>
      current.map((element) => ({
        ...element,
        obstructsSafetyGoalIds: element.obstructsSafetyGoalIds?.filter((id) => id !== elementId)
      }))
    );
  }

  addInternalRelationship(): void {
    if (!this.canDoStep223()) {
      return;
    }

    if (this.internalRelationshipForm.invalid) {
      this.internalRelationshipForm.markAllAsTouched();
      return;
    }

    const { sourceElementId, targetElementId, relationshipType, refinementType, contributionMetric } =
      this.internalRelationshipForm.getRawValue();

    if (!sourceElementId || !targetElementId || !relationshipType) {
      return;
    }

    const relationship: InternalRelationship = {
      id: this.nextRelationshipId(),
      sourceElementId,
      targetElementId,
      type: relationshipType
    };

    if (relationshipType === 'Refinement') {
      relationship.refinementType = refinementType ?? 'AND';
    }

    if (relationshipType === 'Contribution') {
      relationship.contributionMetric = contributionMetric ?? 'Help';
    }

    this.internalRelationships.update((current) => [...current, relationship]);

    this.internalRelationshipForm.reset({
      sourceElementId: '',
      targetElementId: '',
      relationshipType: 'Refinement',
      refinementType: 'AND',
      contributionMetric: 'Help'
    });

    this.queuePushModelFromForms();
  }

  removeInternalRelationship(relationshipId: string): void {
    this.internalRelationships.update((current) => current.filter((item) => item.id !== relationshipId));
    this.queuePushModelFromForms();
  }

  addSocialDependency(): void {
    if (!this.canDoStep224()) {
      return;
    }

    if (this.socialDependencyForm.invalid) {
      this.socialDependencyForm.markAllAsTouched();
      return;
    }

    const {
      dependerActorId,
      dependerElementId,
      dependumName,
      dependumType,
      dependeeActorId,
      dependeeElementId
    } = this.socialDependencyForm.getRawValue();

    if (!dependerActorId || !dependeeActorId || !dependumName?.trim() || !dependumType) {
      return;
    }

    this.socialDependencies.update((current) => [
      ...current,
      {
        id: this.nextDependencyId(),
        dependerActorId,
        dependerElementId: dependerElementId || undefined,
        dependum: {
          id: this.nextDependumId(),
          name: dependumName.trim(),
          type: dependumType
        },
        dependeeActorId,
        dependeeElementId: dependeeElementId || undefined
      }
    ]);

    this.socialDependencyForm.reset({
      dependerActorId: '',
      dependerElementId: '',
      dependumName: '',
      dependumType: 'Goal',
      dependeeActorId: '',
      dependeeElementId: ''
    });

    this.queuePushModelFromForms();
  }

  removeSocialDependency(dependencyId: string): void {
    this.socialDependencies.update((current) => current.filter((dependency) => dependency.id !== dependencyId));
    this.queuePushModelFromForms();
  }

  onHazardObstructsSelectionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const selectedIds = Array.from(select.selectedOptions).map((option) => option.value);
    this.safetyIntentionalElementForm.controls.obstructsSafetyGoalIds.setValue(selectedIds);
    this.safetyIntentionalElementForm.controls.obstructsSafetyGoalIds.updateValueAndValidity();
    this.queuePushModelFromForms();
  }

  runValidationAndPreview(): void {
    this.correctModelAiError.set(null);

    const { errors } = this.collectCurrentValidationState();
    this.validationErrors.set(errors);

    if (errors.length === 0) {
      this.payloadPreview.set(JSON.stringify(this.buildPayload(), null, 2));
      return;
    }

    this.payloadPreview.set('');
  }

  runAiModelCorrection(): void {
    if (this.isCorrectingModelWithAi()) {
      return;
    }

    this.correctModelAiError.set(null);
    this.stepTwoSaveMessage.set(null);

    const { model: currentModel, errors: currentErrors } = this.collectCurrentValidationState();
    this.validationErrors.set(currentErrors);

    if (currentErrors.length === 0) {
      this.payloadPreview.set(JSON.stringify(this.buildPayload(), null, 2));
      this.aiFeedback.showWarning('The current Step 2 model already satisfies all validation rules.');
      return;
    }

    this.payloadPreview.set('');
    this.isCorrectingModelWithAi.set(true);

    this.aiAssistant
      .askWithSummary({
        question: this.buildCorrectModelAiPrompt(currentModel, currentErrors),
        context: 'Step 2 iStar4Safety model correction'
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isCorrectingModelWithAi.set(false))
      )
      .subscribe({
        next: ({ payload, summary }) => {
          const parsedModel = this.parseCompletePistarModelFromAiResponse(payload);
          if (!parsedModel) {
            const message = 'AI correction must return one complete corrected iStar4Safety JSON model.';
            this.correctModelAiError.set(message);
            this.aiFeedback.showError(message);
            return;
          }

          const sanitizedModel = this.sanitizePistarModelForImport(parsedModel);
          const correctedErrors = this.validateCandidateModelAgainstAllRules(sanitizedModel, currentModel);

          if (correctedErrors.length > 0) {
            const message = 'AI returned a model that still violates one or more iStar4Safety rules.';
            this.validationErrors.set(correctedErrors);
            this.correctModelAiError.set(message);
            this.aiFeedback.showError(message);
            return;
          }

          const serialized = JSON.stringify(sanitizedModel);
          this.lastPulledModelSnapshot = serialized;
          this.lastPushedModelSnapshot = serialized;
          this.syncFormsFromPistarModel(sanitizedModel);
          this.applyModelObjectToPistar(sanitizedModel);
          this.validationErrors.set([]);
          this.payloadPreview.set(JSON.stringify(this.buildPayload(), null, 2));
          this.stepTwoSaveError.set(null);
          this.stepTwoSaveMessage.set('AI corrected model applied to the Step 2 model.');
          this.correctModelAiError.set(null);
          this.aiFeedback.showSummary(summary);
        },
        error: (error) => {
          const message = 'Failed to request an AI-corrected Step 2 model.';
          this.correctModelAiError.set(message);
          this.aiFeedback.showError(message);
          console.error('[Step2][AI] Failed to correct Step 2 model via /api/ai/ask', error);
        }
      });
  }

  saveStepTwo(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId || projectId <= 0) {
      this.stepTwoSaveMessage.set(null);
      this.stepTwoSaveError.set('Missing valid project id. Step 2 cannot be saved.');
      console.warn('Missing projectId; cannot save Step 2 information.');
      return;
    }

    if (this.isSavingStepTwo()) {
      return;
    }

    this.stepTwoSaveMessage.set(null);
    this.stepTwoSaveError.set(null);

    const { errors } = this.collectCurrentValidationState();
    this.validationErrors.set(errors);

    if (errors.length > 0) {
      this.payloadPreview.set('');
      this.stepTwoSaveError.set('Fix validation errors before saving Step 2.');
      console.warn('Step 2 validation failed. Fix model issues before saving.', errors);
      return;
    }

    const payload: StepTwoProjectUpdatePayload = {
      id: projectId,
      step2Information: this.buildStepTwoInformationPayload()
    };

    this.isSavingStepTwo.set(true);

    this.projectService
      .updateStepTwoInformation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingStepTwo.set(false))
      )
      .subscribe({
        next: (response) => {
          this.hydrateFromStepTwoInformation(this.extractStepTwoInformationFromApiResponse(response));
          this.stepTwoSaveError.set(null);
          const successMessage = continueAfterSave
            ? 'Step 2 saved. Opening the next step.'
            : 'Step 2 saved successfully.';
          this.stepTwoSaveMessage.set(successMessage);
          this.aiFeedback.showSuccess(successMessage);

          if (continueAfterSave) {
            this.router.navigate(['/control-structure'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          this.stepTwoSaveMessage.set(null);
          this.stepTwoSaveError.set(this.getStepTwoSaveErrorMessage(error));
          console.error('Failed to update Step 2 information via POST /api/projects/step_two_project_update', error);
        }
      });
  }

  private getStepTwoSaveErrorMessage(error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error['status']) : undefined;

    if (status === 404) {
      return 'Project not found. The backend returned 404 while saving Step 2.';
    }

    if (status && status >= 400) {
      return `Failed to save Step 2. The backend returned status ${status}.`;
    }

    return 'Failed to save Step 2 due to an unexpected error.';
  }

  private extractStepTwoInformationFromApiResponse(response: Record<string, unknown>): Record<string, unknown> {
    const candidates: unknown[] = [
      response['step2Information'],
      response['stepTwoInformation'],
      response
    ];

    let bestMatch: Record<string, unknown> | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      const parsed = this.tryParseStepTwoCandidate(candidate);
      if (!parsed) {
        continue;
      }

      const actors = Array.isArray(parsed['actors']) ? (parsed['actors'] as Array<Record<string, unknown>>) : [];
      const actorCount = actors.length;
      const intentionalElementCount = actors.reduce((total, actor) => {
        const elements = Array.isArray(actor?.['intentionalElements']) ? actor['intentionalElements'] : [];
        return total + elements.length;
      }, 0);

      // Prefer the candidate with richer Step 2 content. This avoids picking shallow
      // top-level payloads that can appear after Step 3 entity-selection changes.
      const score = actorCount * 1000 + intentionalElementCount;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = parsed;
      }
    }

    console.info('[Step2][Hydrate] Extracted step2 candidate from API response', {
      hasMatch: Boolean(bestMatch),
      actorCount: Array.isArray(bestMatch?.['actors']) ? bestMatch['actors'].length : 0,
      hasDependencies: Array.isArray(bestMatch?.['dependencies']),
      goalLinksCount: Array.isArray(bestMatch?.['goalLinks']) ? bestMatch['goalLinks'].length : 0
    });

    return bestMatch ?? {};
  }

  private tryParseStepTwoCandidate(candidate: unknown): Record<string, unknown> | null {
    if (!candidate) {
      return null;
    }

    if (typeof candidate === 'object') {
      const objectCandidate = candidate as Record<string, unknown>;
      const hasStepTwoShape =
        Array.isArray(objectCandidate['actors']) &&
        (Array.isArray(objectCandidate['dependencies']) || Array.isArray(objectCandidate['goalLinks']));
      return hasStepTwoShape ? objectCandidate : null;
    }

    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === 'object') {
          const parsedRecord = parsed as Record<string, unknown>;
          const hasStepTwoShape =
            Array.isArray(parsedRecord['actors']) &&
            (Array.isArray(parsedRecord['dependencies']) || Array.isArray(parsedRecord['goalLinks']));
          return hasStepTwoShape ? parsedRecord : null;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private getCurrentPistarModelForAi(): PistarModel {
    const frameWindow = this.modellerFrame?.nativeElement?.contentWindow as
      | {
          saveModel?: () => unknown;
        }
      | null
      | undefined;

    const serialized = frameWindow?.saveModel?.();
    if (typeof serialized === 'string' && serialized.trim()) {
      const parsed = this.parsePistarModelFromText(serialized);
      if (parsed) {
        this.lastPulledModelSnapshot = JSON.stringify(parsed);
        this.syncFormsFromPistarModel(parsed);
        return parsed;
      }
    }

    return this.buildPistarModelFromForms();
  }

  private buildAiPatchResponseFormat(actorDescription: string, linkDescription: string): string {
    return `Patch Response Format:
Return an object with only the changed content. Use this structure:
{
  "actors": [${actorDescription}],
  "dependencies": [new or updated social dependency elements only],
  "links": [${linkDescription}],
  "display": { optional display updates },
  "diagram": { optional diagram updates }
}`;
  }

  private buildConnectedModelIntegrationInstructions(): string {
    return `Main objective:
Add the requested new elements and integrate them into the existing model with the minimum valid relationships needed to make them meaningful.

Mandatory integration rules:
1. Do not add isolated elements unless no valid relation can be inferred from the current model.
2. For every new element, try to add at least one valid relation to an existing or newly created element.
3. Prefer fewer, semantically strong relations over many weak ones.
4. Keep existing actor ids unchanged when updating actors.
5. Use fresh unique ids for every new node, dependency, and link.

Relationship rules:
1. If the relation is inside one actor boundary, return it in links.
2. If the relation crosses actor boundaries, return it as a social dependency in dependencies and also return its two istar.DependencyLink entries in links.
3. Do not encode cross-actor dependencies as refinement, contribution, qualification, or needed-by links.

Allowed internal link patterns:
1. Goal to Goal: istar.AndRefinementLink or istar.OrRefinementLink, child as source and parent as target.
2. Element to Quality: istar.ContributionLink, with the Quality as target.
3. Quality to Goal, Task, or Resource: istar.QualificationLink.
4. Resource or SafetyResource to Task, Hazard, or SafetyTask: istar.NeededByLink when semantically valid.

Element-specific expectations:
1. New Goals should refine, operationalize, or be qualified by something relevant in the same actor.
2. New Qualities or Hazards should qualify or contribute to an existing or new goal, task, resource, or safety goal in the same actor.
3. New Resources or SafetyResources should support a task, safety task, or hazard.
4. New SafetyTasks should mitigate a hazard, operationalize a responsibility, or support a safety goal.
5. New actors should, when justified, also include actor-to-actor links such as istar.IsALink or istar.ParticipatesInLink.

Social dependency output format:
Each new cross-actor dependency must include one dependency object in dependencies with this shape:
{
  "id": "dep-unique-id",
  "text": "Dependum name",
  "type": "istar.Goal" or "istar.Quality" or "istar.Resource" or "istar.Task",
  "x": number,
  "y": number,
  "customProperties": {},
  "source": "depender actor id or depender element id",
  "target": "dependee actor id or dependee element id"
}

And it must also include these two links in links:
1. {
  "id": "dep-unique-id-in",
  "type": "istar.DependencyLink",
  "source": "depender actor id or depender element id",
  "target": "dep-unique-id"
}
2. {
  "id": "dep-unique-id-out",
  "type": "istar.DependencyLink",
  "source": "dep-unique-id",
  "target": "dependee actor id or dependee element id"
}

Quality bar for this response:
At least half of the newly added elements must be connected by a valid internal link or dependency unless the current model truly lacks enough context.

${this.buildFullPistarValidationRuleSet()}`;
  }

  private buildFullPistarValidationRuleSet(): string {
    return `### Full rule set checked by piStar/iStar4Safety (MUST OBEY)
You must satisfy the combined rule set enforced by this Step 2 application and by the embedded piStar/iStar4Safety validator. If two rules overlap, obey the stricter rule.

Actor rules:
1. Actor type must be exactly one of "istar.Actor", "istar.Agent", or "istar.Role".
2. is-a links are only valid between same-type generic Actors or same-type Roles.
3. An Agent cannot specialize another actor through an is-a link.
4. Do not create self is-a links or self participates-in links.
5. A specific pair of actors can have at most one actor-to-actor link.
6. is-a and participates-in relationships must be acyclic.

Boundary and patch rules:
1. Every intentional element must belong to exactly one actor boundary and must appear inside that actor's nodes array.
2. Keep existing actor ids unchanged when updating actors.
3. Any non-dependency link must connect elements inside the same actor boundary.
4. Cross-actor relations must be represented as dependencies plus their two istar.DependencyLink entries, never as refinement, contribution, qualification, or needed-by links.
5. Use fresh unique ids for every new node, dependency, and link.
6. Do not produce links or dependencies whose endpoints do not resolve to existing actors, nodes, or dependency ids in the final merged model.

Internal link rules:
1. Refinement links use the child as source and the parent as target.
2. A refinement parent cannot mix AND and OR children.
3. Refinement links must be acyclic.
4. QualificationLink: source must be a Quality; target must be Goal, Task, or Resource.
5. ContributionLink: target must be a Quality.
6. Do not create a self-contribution link.
7. The same source-target pair cannot have both a ContributionLink and a QualificationLink.
8. NeededByLink: source must be a Resource or SafetyResource.
9. If a NeededByLink source is a SafetyResource, its target must be Hazard, Task, or SafetyTask.

Standard element rules:
1. Standard Goal must use type "istar.Goal" and must not set customProperties.safetyType to a safety kind.
2. Standard Quality must use type "istar.Quality" and must not set customProperties.safetyType to a safety kind.
3. Standard Resource must use type "istar.Resource" and must not set customProperties.safetyType to a safety kind.

Safety element rules:
1. SafetyGoal must use type "istar.SafetyGoal", set customProperties.safetyType to "SafetyGoal", set customProperties.traceabilityId, set customProperties.accidentLevel to L1, L2, L3, L4, or L5, and set customProperties.safetyGoalKind to "Safety Constraint" or "Responsibility".
2. If a SafetyGoal has safetyGoalKind "Safety Constraint", its traceabilityId must match SC-xx. If it has safetyGoalKind "Responsibility", its traceabilityId must match R-xx.
3. Hazard must use type "istar.Hazard", set customProperties.safetyType to "Hazard", set customProperties.traceabilityId matching H<number> or UCA-xx, and set customProperties.obstructsSafetyGoalIds to at least one valid SafetyGoal id.
4. SafetyTask must use type "istar.SafetyTask", set customProperties.safetyType to "SafetyTask", and set customProperties.traceabilityId matching R-xx.
5. SafetyResource must use type "istar.SafetyResource", set customProperties.safetyType to "SafetyResource", and set customProperties.traceabilityId matching R-xx or SC-xx.

Safety reasoning structure rules:
1. In this Step 2 application, a SafetyGoal refinement can only use children that are all SafetyGoals or all Hazards.
2. If a SafetyGoal is refined by Hazards, each such Hazard cannot be a refinement parent and cannot also be the child of another refinement.
3. A Hazard refinement can only use children that are all Hazards or all SafetyTasks/SafetyResources.
4. Every Hazard must obstruct at least one existing SafetyGoal.
5. Every non-Responsibility SafetyGoal must be obstructed by at least one Hazard.

Social dependency rules:
1. A dependency must have different depender and dependee actors.
2. A dependency dependum cannot be Hazard, SafetyGoal, SafetyTask, or SafetyResource.
3. Do not duplicate the same dependum name plus dependum type combination.
4. If dependerElementId or dependeeElementId is used, that element must exist and belong to the corresponding actor.
5. A depender element used in a dependency cannot also be a refinement parent and cannot be the target of a contribution link.

Output discipline:
1. Return only the incremental JSON patch.
2. Do not repeat untouched actors, dependencies, or links.
3. Prefer connected additions over isolated additions.
4. When a relation would violate any rule above, omit it and choose a different valid relation instead.`;
  }

  private buildAddActorsAiPrompt(model: PistarModel, minActorsToAdd: number, maxActorsToAdd: number, promptInstructions: string): string {
    const userInstructions = promptInstructions || 'Add actors that fit the current SD/SR model context.';
    const currentActorCount = model.actors.length;

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to dynamically update or generate a JSON model based on user instructions. You must manipulate the actors array and their structural relationships while strictly adhering to the exact JSON schema provided in the template.

Your Output Constraints:

Valid JSON Only: Your output must be a single, valid JSON object representing only the incremental update to apply to the current SD/SR PiStar model. Do not include markdown code blocks, conversational text, explanations, comments, headings, prefixes, suffixes, or trailing characters.

Endpoint Response Contract: The /ai/ask consumer will merge your response into the current SD/SR model in the embedded PiStar tool. Therefore, the first character of your response must be { and the last character must be }. Return only the final JSON object.

${this.buildAiPatchResponseFormat('new or updated actor objects only', 'new or updated actor-to-actor links, internal links, and dependency links only')}

Do not repeat untouched existing actors, dependencies, or links.

${this.buildConnectedModelIntegrationInstructions()}

Strict Schema Adherence: You must respect the provided JSON template. Actors must contain id, text, type, x, y, customProperties, and nodes.

iStar 2.0 & iStar4Safety Rules for Actors (MUST OBEY):
When creating, modifying, or linking Actors, you must evaluate and enforce the following integrity rules:

Actor Types: An actor's type must be exactly one of the following: "istar.Actor" (Generic), "istar.Agent" (Concrete/Physical entity), or "istar.Role" (Abstract characterization).

The Agent Specialization Ban: Agents are concrete instantiations. An Actor with type: "istar.Agent" cannot have an is-a (specialization) link pointing to another actor. is-a links are strictly reserved for pairs of Roles or pairs of generic Actors.

The Single Link Rule: A specific pair of actors can be linked by at most one actor link. You cannot connect Actor A to Actor B using both an is-a link and a participates-in link.

Acyclicity: There must be absolutely no cycles in is-a or participates-in relationships (e.g., Actor A participates in Actor B, and Actor B participates in Actor A is invalid).

Boundary Encapsulation: Actors act as boundaries for intentional elements. Any newly added internal nodes (Goals, Tasks, Hazards, SafetyGoals, etc.) must be placed inside the specific Actor's nodes array.

Internal Link Restriction: Any link (istar.AndRefinementLink, istar.ContributionLink, istar.QualificationLink, etc.) that connects two nodes must verify that both the source and target nodes reside within the exact same Actor's nodes array. Cross-actor links are strictly reserved for Dependencies.

Input Template Reference:
Use this exact current SD/SR model as the base context for your changes. You must return only the actor additions or updates needed to satisfy the request. Note how custom properties handle safety extensions.

JSON
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentActorCount} actors.
- Add at least ${minActorsToAdd} new actors in this response.
- Add at most ${maxActorsToAdd} new actors in this response.
- For this Add Actors operation, prefer adding new actors instead of modifying existing actors.
- Preserve valid existing model content unless the user instruction explicitly requires changes.
- Return only the incremental JSON patch object to merge into the current model, not a full replacement model and not a list of changes.`;
  }

  private buildAddGoalsAiPrompt(model: PistarModel, minGoalsToAdd: number, maxGoalsToAdd: number, promptInstructions: string): string {
    const userInstructions = promptInstructions || 'Add standard goals that fit the current SD/SR model context.';
    const currentGoalCount = model.actors.reduce((total, actor) => {
      const actorGoalCount = (actor.nodes ?? []).filter((node) => this.isStandardGoalNode(node)).length;
      return total + actorGoalCount;
    }, 0);
    const actorReference = this.buildActorGoalReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding standard Goal intentional elements inside the existing actor boundaries.

Your Output Constraints:

Valid JSON Only: Your output must be a single, valid JSON object representing only the incremental update to apply to the current SD/SR PiStar model. Do not include markdown code blocks, conversational text, explanations, comments, headings, prefixes, suffixes, or trailing characters.

Endpoint Response Contract: The /ai/ask consumer will merge your response into the current SD/SR model in the embedded PiStar tool. Therefore, the first character of your response must be { and the last character must be }. Return only the final JSON object.

${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

Do not repeat untouched actors, dependencies, or links. When updating an existing actor, keep the actor id unchanged and include only the new or changed nodes for that actor.

${this.buildConnectedModelIntegrationInstructions()}

Strict Schema Adherence: Updated actor objects must remain compatible with the current PiStar schema. Each returned actor should preserve its existing boundary identity and use these fields: id, text, type, x, y, customProperties, and nodes.

Reference Rules for Standard Goals (MUST OBEY):
- Add only standard Goal intentional elements. A standard goal must use type "istar.Goal" and must not set customProperties.safetyType to a safety element kind.
- Do not create new actors in this Add Goals operation. Update existing actors only.
- Place every new goal inside exactly one existing actor's nodes array.
- Use fresh unique ids for every new goal and every new link.
- Keep existing actor ids unchanged so the patch merges into the current actor boundaries.
- Any non-dependency link in links must stay within the same actor boundary.
- If a meaningful cross-actor relation is needed, return it in dependencies and add the two istar.DependencyLink entries in links.
- If you create refinement links, use istar.AndRefinementLink or istar.OrRefinementLink and connect child source -> parent target.
- If you create contribution links, the target must be a Quality.
- If you create qualification links, the source must be a Quality and the target must be Goal, Task, or Resource.
- Prefer goals that refine or operationalize the existing actor rationale instead of isolated generic goals.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentGoalCount} standard goal${currentGoalCount === 1 ? '' : 's'}.
- Add at least ${minGoalsToAdd} new standard goal${minGoalsToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxGoalsToAdd} new standard goals in this response.
- Prefer reusing the existing actors listed in the reference snapshot instead of inventing new boundaries.
- Return only the incremental JSON patch object to merge into the current model, not a full replacement model and not a list of changes.`;
  }

  private buildAddQualityAiPrompt(
    model: PistarModel,
    minQualitiesToAdd: number,
    maxQualitiesToAdd: number,
    promptInstructions: string
  ): string {
    const userInstructions = promptInstructions || 'Add standard qualities that fit the current SD/SR model context.';
    const currentQualityCount = model.actors.reduce((total, actor) => {
      const actorQualityCount = (actor.nodes ?? []).filter((node) => this.isStandardQualityNode(node)).length;
      return total + actorQualityCount;
    }, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding standard Quality intentional elements inside the existing actor boundaries.

Your Output Constraints:

Valid JSON Only: Your output must be a single, valid JSON object representing only the incremental update to apply to the current SD/SR PiStar model. Do not include markdown code blocks, conversational text, explanations, comments, headings, prefixes, suffixes, or trailing characters.

Endpoint Response Contract: The /ai/ask consumer will merge your response into the current SD/SR model in the embedded PiStar tool. Therefore, the first character of your response must be { and the last character must be }. Return only the final JSON object.

${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

Do not repeat untouched actors, dependencies, or links. When updating an existing actor, keep the actor id unchanged and include only the new or changed nodes for that actor.

${this.buildConnectedModelIntegrationInstructions()}

Strict Schema Adherence: Updated actor objects must remain compatible with the current PiStar schema. Each returned actor should preserve its existing boundary identity and use these fields: id, text, type, x, y, customProperties, and nodes.

Reference Rules for Standard Qualities (MUST OBEY):
- Add only standard Quality intentional elements. A standard quality must use type "istar.Quality" and must not set customProperties.safetyType to a safety element kind.
- Do not create new actors in this Add Quality operation. Update existing actors only.
- Place every new quality inside exactly one existing actor's nodes array.
- Use fresh unique ids for every new quality and every new link.
- Keep existing actor ids unchanged so the patch merges into the current actor boundaries.
- Any non-dependency link in links must stay within the same actor boundary.
- If a meaningful cross-actor relation is needed, return it in dependencies and add the two istar.DependencyLink entries in links.
- If you create contribution links, the new or existing Quality must be the target of the contribution.
- If you create qualification links, the Quality must be the source and the target must be Goal, Task, or Resource in the same actor.
- Prefer qualities that evaluate or constrain existing goals, tasks, and resources already present in the actor rationale instead of isolated generic labels.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentQualityCount} standard qualit${currentQualityCount === 1 ? 'y' : 'ies'}.
- Add at least ${minQualitiesToAdd} new standard qualit${minQualitiesToAdd === 1 ? 'y' : 'ies'} in this response.
- Add at most ${maxQualitiesToAdd} new standard qualities in this response.
- Prefer reusing the existing actors listed in the reference snapshot instead of inventing new boundaries.
- Return only the incremental JSON patch object to merge into the current model, not a full replacement model and not a list of changes.`;
  }

  private buildAddResourceAiPrompt(
    model: PistarModel,
    minResourcesToAdd: number,
    maxResourcesToAdd: number,
    promptInstructions: string
  ): string {
    const userInstructions = promptInstructions || 'Add standard resources that fit the current SD/SR model context.';
    const currentResourceCount = model.actors.reduce((total, actor) => {
      const actorResourceCount = (actor.nodes ?? []).filter((node) => this.isStandardResourceNode(node)).length;
      return total + actorResourceCount;
    }, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding standard Resource intentional elements inside the existing actor boundaries.

Your Output Constraints:

Valid JSON Only: Your output must be a single, valid JSON object representing only the incremental update to apply to the current SD/SR PiStar model. Do not include markdown code blocks, conversational text, explanations, comments, headings, prefixes, suffixes, or trailing characters.

Endpoint Response Contract: The /ai/ask consumer will merge your response into the current SD/SR model in the embedded PiStar tool. Therefore, the first character of your response must be { and the last character must be }. Return only the final JSON object.

${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

Do not repeat untouched actors, dependencies, or links. When updating an existing actor, keep the actor id unchanged and include only the new or changed nodes for that actor.

${this.buildConnectedModelIntegrationInstructions()}

Strict Schema Adherence: Updated actor objects must remain compatible with the current PiStar schema. Each returned actor should preserve its existing boundary identity and use these fields: id, text, type, x, y, customProperties, and nodes.

Reference Rules for Standard Resources (MUST OBEY):
- Add only standard Resource intentional elements. A standard resource must use type "istar.Resource" and must not set customProperties.safetyType to a safety element kind.
- Do not create new actors in this Add Resource operation. Update existing actors only.
- Place every new resource inside exactly one existing actor's nodes array.
- Use fresh unique ids for every new resource and every new link.
- Keep existing actor ids unchanged so the patch merges into the current actor boundaries.
- Any non-dependency link in links must stay within the same actor boundary.
- If a meaningful cross-actor relation is needed, return it in dependencies and add the two istar.DependencyLink entries in links.
- If you create qualification links, the source must be a Quality and the target may be the new or existing Resource in the same actor.
- If you create needed-by links, the source must be a Resource and the target must be a Task in the same actor.
- Prefer resources that operationalize or support existing goals and tasks already present in the actor rationale instead of isolated generic assets.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentResourceCount} standard resource${currentResourceCount === 1 ? '' : 's'}.
- Add at least ${minResourcesToAdd} new standard resource${minResourcesToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxResourcesToAdd} new standard resources in this response.
- Prefer reusing the existing actors listed in the reference snapshot instead of inventing new boundaries.
- Return only the incremental JSON patch object to merge into the current model, not a full replacement model and not a list of changes.`;
  }

  private buildAddSafetyGoalAiPrompt(
    model: PistarModel,
    minSafetyGoalsToAdd: number,
    maxSafetyGoalsToAdd: number,
    promptInstructions: string
  ): string {
    const userInstructions = promptInstructions || 'Add safety goals that fit the current safety reasoning context.';
    const currentCount = model.actors.reduce((total, actor) => total + (actor.nodes ?? []).filter((node) => this.isSafetyGoalNode(node)).length, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding SafetyGoal intentional elements inside existing actor boundaries.

Your Output Constraints:
Valid JSON Only: return a single JSON object and nothing else.
${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

${this.buildConnectedModelIntegrationInstructions()}

Reference Rules for Safety Goals (MUST OBEY):
- A safety goal node must use type "istar.SafetyGoal".
- Every new safety goal must set customProperties.safetyType to "SafetyGoal".
- Every new safety goal must set customProperties.traceabilityId.
- If customProperties.safetyGoalKind is "Safety Constraint", traceabilityId must match SC-xx.
- If customProperties.safetyGoalKind is "Responsibility", traceabilityId must match R-xx.
- Every new safety goal must set customProperties.accidentLevel to L1, L2, L3, L4, or L5.
- Prefer Safety Constraint unless the user explicitly asks for responsibilities.
- Do not add standard Goal, Task, Resource, or Quality nodes as the primary additions in this SafetyGoal operation.
- Do not create new actors. Update existing actors only.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentCount} safety goal${currentCount === 1 ? '' : 's'}.
- Add at least ${minSafetyGoalsToAdd} new safety goal${minSafetyGoalsToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxSafetyGoalsToAdd} new safety goals in this response.
- Return only the incremental JSON patch object to merge into the current model.`;
  }

  private buildAddHazardAiPrompt(model: PistarModel, minHazardsToAdd: number, maxHazardsToAdd: number, promptInstructions: string): string {
    const userInstructions = promptInstructions || 'Add hazards that obstruct the existing safety goals.';
    const currentCount = model.actors.reduce((total, actor) => total + (actor.nodes ?? []).filter((node) => this.isHazardNode(node)).length, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding Hazard intentional elements inside existing actor boundaries.

Your Output Constraints:
Valid JSON Only: return a single JSON object and nothing else.
${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

${this.buildConnectedModelIntegrationInstructions()}

Reference Rules for Hazards (MUST OBEY):
- A hazard node must use type "istar.Hazard".
- Every new hazard must set customProperties.safetyType to "Hazard".
- Every new hazard must set customProperties.traceabilityId and it must match H<number> or UCA-xx.
- Every new hazard must set customProperties.obstructsSafetyGoalIds to an array with at least one valid SafetyGoal id.
- Do not add standard Goal, Task, Resource, or Quality nodes as the primary additions in this Hazard operation.
- Do not add SafetyGoal, SafetyTask, or SafetyResource nodes unless the user explicitly asked to update an existing related structure.
- Do not create new actors. Update existing actors only.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentCount} hazard${currentCount === 1 ? '' : 's'}.
- Add at least ${minHazardsToAdd} new hazard${minHazardsToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxHazardsToAdd} new hazards in this response.
- Return only the incremental JSON patch object to merge into the current model.`;
  }

  private buildAddSafetyTaskAiPrompt(
    model: PistarModel,
    minSafetyTasksToAdd: number,
    maxSafetyTasksToAdd: number,
    promptInstructions: string
  ): string {
    const userInstructions = promptInstructions || 'Add safety tasks that mitigate hazards or operationalize responsibilities.';
    const currentCount = model.actors.reduce((total, actor) => total + (actor.nodes ?? []).filter((node) => this.isSafetyTaskNode(node)).length, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding SafetyTask intentional elements inside existing actor boundaries.

Your Output Constraints:
Valid JSON Only: return a single JSON object and nothing else.
${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

${this.buildConnectedModelIntegrationInstructions()}

Reference Rules for Safety Tasks (MUST OBEY):
- A safety task node must use type "istar.SafetyTask".
- Every new safety task must set customProperties.safetyType to "SafetyTask".
- Every new safety task must set customProperties.traceabilityId and it must match R-xx.
- Do not add standard Goal, Task, Resource, or Quality nodes as the primary additions in this SafetyTask operation.
- Do not create new actors. Update existing actors only.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentCount} safety task${currentCount === 1 ? '' : 's'}.
- Add at least ${minSafetyTasksToAdd} new safety task${minSafetyTasksToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxSafetyTasksToAdd} new safety tasks in this response.
- Return only the incremental JSON patch object to merge into the current model.`;
  }

  private buildAddSafetyResourceAiPrompt(
    model: PistarModel,
    minSafetyResourcesToAdd: number,
    maxSafetyResourcesToAdd: number,
    promptInstructions: string
  ): string {
    const userInstructions = promptInstructions || 'Add safety resources that support hazards, tasks, or safety tasks.';
    const currentCount = model.actors.reduce((total, actor) => total + (actor.nodes ?? []).filter((node) => this.isSafetyResourceNode(node)).length, 0);
    const actorReference = this.buildActorIntentionalElementReference(model);

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in the iStar 2.0 core language and the iStar4Safety extension. Your task is to update the current SD/SR PiStar JSON by adding SafetyResource intentional elements inside existing actor boundaries.

Your Output Constraints:
Valid JSON Only: return a single JSON object and nothing else.
${this.buildAiPatchResponseFormat('updated existing actor objects only', 'new or updated internal links and dependency links only')}

${this.buildConnectedModelIntegrationInstructions()}

Reference Rules for Safety Resources (MUST OBEY):
- A safety resource node must use type "istar.SafetyResource".
- Every new safety resource must set customProperties.safetyType to "SafetyResource".
- Every new safety resource must set customProperties.traceabilityId and it must match R-xx or SC-xx.
- Do not add standard Goal, Task, Resource, or Quality nodes as the primary additions in this SafetyResource operation.
- Do not create new actors. Update existing actors only.
- If you create needed-by links, the source must be a SafetyResource and the target must be Hazard, Task, or SafetyTask in the same actor.

Reference Snapshot of the Current Model:
${actorReference}

Full Current Model JSON:
${JSON.stringify(model, null, 2)}

Task:
${userInstructions}

Additional constraints for this run:
- The current model already contains ${currentCount} safety resource${currentCount === 1 ? '' : 's'}.
- Add at least ${minSafetyResourcesToAdd} new safety resource${minSafetyResourcesToAdd === 1 ? '' : 's'} in this response.
- Add at most ${maxSafetyResourcesToAdd} new safety resources in this response.
- Return only the incremental JSON patch object to merge into the current model.`;
  }

  private validateAiActorPatchCount(aiPatch: PistarModelPatch, minActorsToAdd: number, maxActorsToAdd: number): string | null {
    const actorCount = aiPatch.actors?.length ?? 0;
    if (actorCount < minActorsToAdd) {
      return `AI returned ${actorCount} actor${actorCount === 1 ? '' : 's'}, but at least ${minActorsToAdd} new actors were requested.`;
    }

    if (actorCount > maxActorsToAdd) {
      return `AI returned ${actorCount} actors, but the maximum requested was ${maxActorsToAdd}.`;
    }

    return null;
  }

  private validateAiGoalPatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minGoalsToAdd: number,
    maxGoalsToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const goalCount = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorGoalCount = (actor.nodes ?? []).filter(
        (node) => !existingNodeIds.has(node.id) && this.isStandardGoalNode(node)
      ).length;
      return total + actorGoalCount;
    }, 0);

    if (goalCount < minGoalsToAdd) {
      return `AI returned ${goalCount} new standard goal${goalCount === 1 ? '' : 's'}, but at least ${minGoalsToAdd} were requested.`;
    }

    if (goalCount > maxGoalsToAdd) {
      return `AI returned ${goalCount} new standard goals, but the maximum requested was ${maxGoalsToAdd}.`;
    }

    return null;
  }

  private validateAiQualityPatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minQualitiesToAdd: number,
    maxQualitiesToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const qualityCount = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorQualityCount = (actor.nodes ?? []).filter(
        (node) => !existingNodeIds.has(node.id) && this.isStandardQualityNode(node)
      ).length;
      return total + actorQualityCount;
    }, 0);

    if (qualityCount < minQualitiesToAdd) {
      return `AI returned ${qualityCount} new standard qualit${qualityCount === 1 ? 'y' : 'ies'}, but at least ${minQualitiesToAdd} were requested.`;
    }

    if (qualityCount > maxQualitiesToAdd) {
      return `AI returned ${qualityCount} new standard qualities, but the maximum requested was ${maxQualitiesToAdd}.`;
    }

    return null;
  }

  private validateAiResourcePatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minResourcesToAdd: number,
    maxResourcesToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const resourceCount = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorResourceCount = (actor.nodes ?? []).filter(
        (node) => !existingNodeIds.has(node.id) && this.isStandardResourceNode(node)
      ).length;
      return total + actorResourceCount;
    }, 0);

    if (resourceCount < minResourcesToAdd) {
      return `AI returned ${resourceCount} new standard resource${resourceCount === 1 ? '' : 's'}, but at least ${minResourcesToAdd} were requested.`;
    }

    if (resourceCount > maxResourcesToAdd) {
      return `AI returned ${resourceCount} new standard resources, but the maximum requested was ${maxResourcesToAdd}.`;
    }

    return null;
  }

  private validateAiSafetyGoalPatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minSafetyGoalsToAdd: number,
    maxSafetyGoalsToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const count = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorCount = (actor.nodes ?? []).filter((node) => !existingNodeIds.has(node.id) && this.isSafetyGoalNode(node)).length;
      return total + actorCount;
    }, 0);

    if (count < minSafetyGoalsToAdd) {
      return `AI returned ${count} new safety goal${count === 1 ? '' : 's'}, but at least ${minSafetyGoalsToAdd} were requested.`;
    }

    if (count > maxSafetyGoalsToAdd) {
      return `AI returned ${count} new safety goals, but the maximum requested was ${maxSafetyGoalsToAdd}.`;
    }

    return null;
  }

  private validateAiHazardPatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minHazardsToAdd: number,
    maxHazardsToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const count = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorCount = (actor.nodes ?? []).filter((node) => !existingNodeIds.has(node.id) && this.isHazardNode(node)).length;
      return total + actorCount;
    }, 0);

    if (count < minHazardsToAdd) {
      return `AI returned ${count} new hazard${count === 1 ? '' : 's'}, but at least ${minHazardsToAdd} were requested.`;
    }

    if (count > maxHazardsToAdd) {
      return `AI returned ${count} new hazards, but the maximum requested was ${maxHazardsToAdd}.`;
    }

    return null;
  }

  private validateAiSafetyTaskPatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minSafetyTasksToAdd: number,
    maxSafetyTasksToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const count = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorCount = (actor.nodes ?? []).filter((node) => !existingNodeIds.has(node.id) && this.isSafetyTaskNode(node)).length;
      return total + actorCount;
    }, 0);

    if (count < minSafetyTasksToAdd) {
      return `AI returned ${count} new safety task${count === 1 ? '' : 's'}, but at least ${minSafetyTasksToAdd} were requested.`;
    }

    if (count > maxSafetyTasksToAdd) {
      return `AI returned ${count} new safety tasks, but the maximum requested was ${maxSafetyTasksToAdd}.`;
    }

    return null;
  }

  private validateAiSafetyResourcePatchCount(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    minSafetyResourcesToAdd: number,
    maxSafetyResourcesToAdd: number
  ): string | null {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));
    const count = (aiPatch.actors ?? []).reduce((total, actor) => {
      const actorCount = (actor.nodes ?? []).filter(
        (node) => !existingNodeIds.has(node.id) && this.isSafetyResourceNode(node)
      ).length;
      return total + actorCount;
    }, 0);

    if (count < minSafetyResourcesToAdd) {
      return `AI returned ${count} new safety resource${count === 1 ? '' : 's'}, but at least ${minSafetyResourcesToAdd} were requested.`;
    }

    if (count > maxSafetyResourcesToAdd) {
      return `AI returned ${count} new safety resources, but the maximum requested was ${maxSafetyResourcesToAdd}.`;
    }

    return null;
  }

  private parsePistarModelFromAiResponse(response: unknown): PistarModelPatch | null {
    if (response && typeof response === 'object') {
      const parsedDirect = this.parseWrappedPistarModelPatchCandidate(response as Record<string, unknown>);
      if (parsedDirect) {
        return parsedDirect;
      }
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

    try {
      return this.parsePistarModelPatchCandidate(JSON.parse(normalized) as unknown);
    } catch {
      const parsedModel = this.parsePistarModelFromText(normalized);
      if (!parsedModel) {
        return null;
      }

      return {
        actors: parsedModel.actors,
        dependencies: parsedModel.dependencies,
        links: parsedModel.links,
        display: parsedModel.display,
        tool: parsedModel.tool,
        istar: parsedModel.istar,
        saveDate: parsedModel.saveDate,
        diagram: parsedModel.diagram
      };
    }
  }

  private parseWrappedPistarModelPatchCandidate(candidate: Record<string, unknown>): PistarModelPatch | null {
    const directCandidate = this.parsePistarModelPatchCandidate(candidate);
    if (directCandidate) {
      return directCandidate;
    }

    const nestedCandidate = candidate['content'];
    if (nestedCandidate && typeof nestedCandidate === 'object' && !Array.isArray(nestedCandidate)) {
      return this.parsePistarModelPatchCandidate(nestedCandidate);
    }

    return null;
  }

  private parseCompletePistarModelFromAiResponse(response: unknown): PistarModel | null {
    if (response && typeof response === 'object') {
      const parsedDirect = this.parseWrappedPistarFullModelCandidate(response as Record<string, unknown>);
      if (parsedDirect) {
        return parsedDirect;
      }
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

    const parsedModel = this.parsePistarModelFromText(normalized);
    if (!parsedModel || !Array.isArray(parsedModel.links)) {
      return null;
    }

    return parsedModel;
  }

  private parseWrappedPistarFullModelCandidate(candidate: Record<string, unknown>): PistarModel | null {
    const directCandidate = this.parsePistarFullModelCandidate(candidate);
    if (directCandidate) {
      return directCandidate;
    }

    const nestedCandidate = candidate['content'];
    if (nestedCandidate && typeof nestedCandidate === 'object' && !Array.isArray(nestedCandidate)) {
      return this.parsePistarFullModelCandidate(nestedCandidate);
    }

    return null;
  }

  private parsePistarFullModelCandidate(candidate: unknown): PistarModel | null {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    const record = candidate as Record<string, unknown>;
    if (!Array.isArray(record['actors']) || !Array.isArray(record['dependencies']) || !Array.isArray(record['links'])) {
      return null;
    }

    return this.parsePistarModelFromText(JSON.stringify(candidate));
  }

  private parsePistarModelPatchCandidate(candidate: unknown): PistarModelPatch | null {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const record = candidate as Record<string, unknown>;
    const hasRecognizedShape =
      Array.isArray(record['actors']) ||
      Array.isArray(record['dependencies']) ||
      Array.isArray(record['links']) ||
      (!!record['display'] && typeof record['display'] === 'object') ||
      (!!record['diagram'] && typeof record['diagram'] === 'object');

    if (!hasRecognizedShape) {
      return null;
    }

    return {
      actors: Array.isArray(record['actors']) ? (record['actors'] as PistarElement[]) : undefined,
      dependencies: Array.isArray(record['dependencies']) ? (record['dependencies'] as PistarElement[]) : undefined,
      links: Array.isArray(record['links']) ? (record['links'] as PistarLink[]) : undefined,
      display: record['display'] && typeof record['display'] === 'object' ? (record['display'] as Record<string, unknown>) : undefined,
      tool: typeof record['tool'] === 'string' ? record['tool'] : undefined,
      istar: typeof record['istar'] === 'string' ? record['istar'] : undefined,
      saveDate: typeof record['saveDate'] === 'string' ? record['saveDate'] : undefined,
      diagram: record['diagram'] && typeof record['diagram'] === 'object' ? (record['diagram'] as Partial<PistarModel['diagram']>) : undefined
    };
  }

  private coerceSafetyResourceAiPatch(baseModel: PistarModel, aiPatch: PistarModelPatch): PistarModelPatch {
    const existingNodeIds = new Set(baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id)));

    const actors = (aiPatch.actors ?? []).map((actor) => ({
      ...actor,
      nodes: (actor.nodes ?? []).map((node) => {
        const mappedType = this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']);
        if (existingNodeIds.has(node.id) || mappedType !== 'Resource') {
          return node;
        }

        return {
          ...node,
          type: 'istar.SafetyResource',
          customProperties: {
            ...(node.customProperties ?? {}),
            safetyType: 'SafetyResource'
          }
        };
      })
    }));

    return {
      ...aiPatch,
      actors
    };
  }

  private normalizeAiModelPatchForMerge(
    baseModel: PistarModel,
    aiPatch: PistarModelPatch,
    options?: { allowExistingActorUpdates?: boolean }
  ): PistarModelPatch {
    const actorIdMap = new Map<string, string>();
    const nodeIdMap = new Map<string, string>();
    const allowExistingActorUpdates = options?.allowExistingActorUpdates ?? false;

    const existingActorIds = new Set(baseModel.actors.map((actor) => actor.id));
    const usedActorIds = new Set(baseModel.actors.map((actor) => actor.id));
    const usedNodeLikeIds = new Set(
      baseModel.actors.flatMap((actor) => (actor.nodes ?? []).map((node) => node.id))
    );
    for (const dependency of baseModel.dependencies) {
      usedNodeLikeIds.add(dependency.id);
    }
    const usedLinkIds = new Set(baseModel.links.map((link) => link.id));

    const nextUniqueId = (seed: string, used: Set<string>): string => {
      let candidate = seed;
      let counter = 1;
      while (used.has(candidate)) {
        candidate = `${seed}-ai-${counter}`;
        counter += 1;
      }
      used.add(candidate);
      return candidate;
    };

    const actors = (aiPatch.actors ?? []).map((actor) => {
      let nextActorId = actor.id;
      if (existingActorIds.has(actor.id) && allowExistingActorUpdates) {
        nextActorId = actor.id;
      } else if (usedActorIds.has(actor.id)) {
        nextActorId = nextUniqueId(actor.id, usedActorIds);
      } else {
        usedActorIds.add(actor.id);
      }
      actorIdMap.set(actor.id, nextActorId);

      const rawNodes = actor.nodes ?? [];
      for (const node of rawNodes) {
        const nextNodeId = usedNodeLikeIds.has(node.id)
          ? nextUniqueId(node.id, usedNodeLikeIds)
          : (usedNodeLikeIds.add(node.id), node.id);
        nodeIdMap.set(node.id, nextNodeId);
      }

      const nodes = rawNodes.map((node) => {
        const nextNodeId = nodeIdMap.get(node.id) ?? node.id;
        const customProperties = node.customProperties ? { ...node.customProperties } : undefined;
        const obstructs = customProperties?.['obstructsSafetyGoalIds'];
        if (customProperties && Array.isArray(obstructs)) {
          customProperties['obstructsSafetyGoalIds'] = obstructs.map((goalId) =>
            typeof goalId === 'string' ? nodeIdMap.get(goalId) ?? goalId : goalId
          );
        }
        return {
          ...node,
          id: nextNodeId,
          type: this.normalizePistarNodeType(node.type, customProperties),
          customProperties
        };
      });

      return {
        ...actor,
        id: nextActorId,
        nodes
      };
    });

    const dependencies = (aiPatch.dependencies ?? []).map((dependency) => {
      const nextDependencyId = usedNodeLikeIds.has(dependency.id)
        ? nextUniqueId(dependency.id, usedNodeLikeIds)
        : (usedNodeLikeIds.add(dependency.id), dependency.id);

      return {
        ...dependency,
        id: nextDependencyId,
        source: dependency.source ? actorIdMap.get(dependency.source) ?? nodeIdMap.get(dependency.source) ?? dependency.source : dependency.source,
        target: dependency.target ? actorIdMap.get(dependency.target) ?? nodeIdMap.get(dependency.target) ?? dependency.target : dependency.target
      };
    });

    const links = (aiPatch.links ?? []).map((link) => {
      const nextLinkId = usedLinkIds.has(link.id) ? nextUniqueId(link.id, usedLinkIds) : (usedLinkIds.add(link.id), link.id);
      return {
        ...link,
        id: nextLinkId,
        source: actorIdMap.get(link.source) ?? nodeIdMap.get(link.source) ?? link.source,
        target: actorIdMap.get(link.target) ?? nodeIdMap.get(link.target) ?? link.target
      };
    });

    const display = aiPatch.display
      ? Object.fromEntries(
          Object.entries(aiPatch.display).map(([key, value]) => [actorIdMap.get(key) ?? key, value])
        )
      : undefined;

    return {
      ...aiPatch,
      actors,
      dependencies,
      links,
      display
    };
  }

  private sanitizePistarModelForImport(model: PistarModel): PistarModel {
    const actorIds = new Set(model.actors.map((actor) => actor.id));
    const nodeOwnerById = new Map<string, string>();

    for (const actor of model.actors) {
      for (const node of actor.nodes ?? []) {
        nodeOwnerById.set(node.id, actor.id);
      }
    }

    const actorOrNodeIds = new Set<string>([...actorIds, ...nodeOwnerById.keys()]);
    const dependencies = model.dependencies.filter((dependency) => {
      if (typeof dependency.source !== 'string' || typeof dependency.target !== 'string') {
        return false;
      }

      return actorOrNodeIds.has(dependency.source) && actorOrNodeIds.has(dependency.target);
    });

    const dependencyIds = new Set(dependencies.map((dependency) => dependency.id));
    const importableIds = new Set<string>([...actorIds, ...nodeOwnerById.keys(), ...dependencyIds]);

    const links = model.links.filter((link) => {
      if (!importableIds.has(link.source) || !importableIds.has(link.target)) {
        return false;
      }

      const normalizedType = link.type.toLowerCase();
      if (normalizedType.includes('dependencylink')) {
        return dependencyIds.has(link.source) || dependencyIds.has(link.target);
      }

      if (normalizedType.includes('isa') || normalizedType.includes('particip')) {
        return actorIds.has(link.source) && actorIds.has(link.target);
      }

      const sourceActorId = nodeOwnerById.get(link.source);
      const targetActorId = nodeOwnerById.get(link.target);
      return Boolean(sourceActorId && targetActorId && sourceActorId === targetActorId);
    });

    return {
      ...model,
      dependencies,
      links
    };
  }

  private normalizePistarNodeType(type: string, customProperties?: Record<string, unknown>): string {
    const safetyTypeHint = customProperties?.['safetyType'];
    if (typeof safetyTypeHint === 'string') {
      const normalizedSafetyType = safetyTypeHint.startsWith('istar.')
        ? safetyTypeHint.replace('istar.', '')
        : safetyTypeHint;
      if (
        normalizedSafetyType === 'SafetyGoal' ||
        normalizedSafetyType === 'Hazard' ||
        normalizedSafetyType === 'SafetyTask' ||
        normalizedSafetyType === 'SafetyResource'
      ) {
        return `istar.${normalizedSafetyType}`;
      }
    }

    const normalizedType = type.startsWith('istar.') ? type.replace('istar.', '') : type;
    if (
      normalizedType === 'SafetyGoal' ||
      normalizedType === 'Hazard' ||
      normalizedType === 'SafetyTask' ||
      normalizedType === 'SafetyResource'
    ) {
      return `istar.${normalizedType}`;
    }

    return type;
  }

  private mergePistarModels(baseModel: PistarModel, aiModel: PistarModelPatch): PistarModel {
    const mergeElementsById = (baseItems: PistarElement[] = [], aiItems: PistarElement[] = []): PistarElement[] => {
      const merged = new Map<string, PistarElement>();

      for (const item of baseItems) {
        merged.set(item.id, {
          ...item,
          customProperties: item.customProperties ? { ...item.customProperties } : undefined,
          nodes: item.nodes ? item.nodes.map((node) => ({ ...node, customProperties: node.customProperties ? { ...node.customProperties } : undefined })) : []
        });
      }

      for (const item of aiItems) {
        const existing = merged.get(item.id);
        const mergedNodes = this.mergeNestedPistarNodes(existing?.nodes ?? [], item.nodes ?? []);
        merged.set(item.id, {
          ...(existing ?? {}),
          ...item,
          customProperties: {
            ...(existing?.customProperties ?? {}),
            ...(item.customProperties ?? {})
          },
          nodes: mergedNodes
        });
      }

      return Array.from(merged.values());
    };

    const mergeLinksById = (baseLinks: PistarLink[] = [], aiLinks: PistarLink[] = []): PistarLink[] => {
      const merged = new Map<string, PistarLink>();

      for (const link of baseLinks) {
        merged.set(link.id, { ...link });
      }

      for (const link of aiLinks) {
        merged.set(link.id, { ...(merged.get(link.id) ?? {}), ...link });
      }

      return Array.from(merged.values());
    };

    return {
      actors: mergeElementsById(baseModel.actors, aiModel.actors),
      dependencies: mergeElementsById(baseModel.dependencies, aiModel.dependencies),
      links: mergeLinksById(baseModel.links, aiModel.links),
      display: {
        ...(baseModel.display ?? {}),
        ...(aiModel.display ?? {})
      },
      tool: aiModel.tool || baseModel.tool,
      istar: aiModel.istar || baseModel.istar,
      saveDate: aiModel.saveDate || new Date().toUTCString(),
      diagram: {
        width: aiModel.diagram?.width ?? baseModel.diagram.width,
        height: aiModel.diagram?.height ?? baseModel.diagram.height,
        name: aiModel.diagram?.name || baseModel.diagram.name,
        customProperties: {
          ...(baseModel.diagram.customProperties ?? {}),
          ...(aiModel.diagram?.customProperties ?? {})
        }
      }
    };
  }

  private mergeNestedPistarNodes(baseNodes: PistarElement[], aiNodes: PistarElement[]): PistarElement[] {
    const merged = new Map<string, PistarElement>();

    for (const node of baseNodes) {
      merged.set(node.id, {
        ...node,
        customProperties: node.customProperties ? { ...node.customProperties } : undefined
      });
    }

    for (const node of aiNodes) {
      const existing = merged.get(node.id);
      merged.set(node.id, {
        ...(existing ?? {}),
        ...node,
        customProperties: {
          ...(existing?.customProperties ?? {}),
          ...(node.customProperties ?? {})
        }
      });
    }

    return Array.from(merged.values());
  }

  private buildActorIntentionalElementReference(model: PistarModel): string {
    if (model.actors.length === 0) {
      return '- No actors exist yet.';
    }

    return model.actors
      .map((actor) => {
        const nodes = actor.nodes ?? [];
        const goals = nodes.filter((node) => this.isStandardGoalNode(node)).map((node) => node.text || node.id);
        const tasks = nodes
          .filter((node) => this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Task')
          .map((node) => node.text || node.id);
        const resources = nodes
          .filter((node) => this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Resource')
          .map((node) => node.text || node.id);
        const qualities = nodes
          .filter((node) => this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Quality')
          .map((node) => node.text || node.id);
        const safetyGoals = nodes.filter((node) => this.isSafetyGoalNode(node)).map((node) => node.text || node.id);
        const hazards = nodes.filter((node) => this.isHazardNode(node)).map((node) => node.text || node.id);
        const safetyTasks = nodes.filter((node) => this.isSafetyTaskNode(node)).map((node) => node.text || node.id);
        const safetyResources = nodes.filter((node) => this.isSafetyResourceNode(node)).map((node) => node.text || node.id);

        const summarize = (values: string[]): string => (values.length > 0 ? values.join(', ') : 'none');

        return `- ${actor.text || actor.id} [id=${actor.id}, type=${actor.type}] | goals: ${summarize(goals)} | tasks: ${summarize(tasks)} | resources: ${summarize(resources)} | qualities: ${summarize(qualities)} | safety goals: ${summarize(safetyGoals)} | hazards: ${summarize(hazards)} | safety tasks: ${summarize(safetyTasks)} | safety resources: ${summarize(safetyResources)}`;
      })
      .join('\n');
  }

  private buildActorGoalReference(model: PistarModel): string {
    return this.buildActorIntentionalElementReference(model);
  }

  private isStandardGoalNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Goal';
  }

  private isStandardQualityNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Quality';
  }

  private isStandardResourceNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Resource';
  }

  private isSafetyGoalNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'SafetyGoal';
  }

  private isHazardNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'Hazard';
  }

  private isSafetyTaskNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'SafetyTask';
  }

  private isSafetyResourceNode(node: PistarElement): boolean {
    return this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']) === 'SafetyResource';
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

  private collectCurrentValidationState(): { model: PistarModel; errors: string[] } {
    const model = this.getCurrentPistarModelForAi();
    const errors = this.mergeValidationErrors(this.validateModelDefinition(), this.validatePistarModel(model));
    return { model, errors };
  }

  private validateCandidateModelAgainstAllRules(model: PistarModel, restoreModel: PistarModel): string[] {
    const previousValidationErrors = this.validationErrors();
    const previousPayloadPreview = this.payloadPreview();

    this.syncFormsFromPistarModel(model);
    const errors = this.mergeValidationErrors(this.validateModelDefinition(), this.validatePistarModel(model));
    this.syncFormsFromPistarModel(restoreModel);

    this.validationErrors.set(previousValidationErrors);
    this.payloadPreview.set(previousPayloadPreview);

    return errors;
  }

  private validatePistarModel(model: PistarModel): string[] {
    const frameWindow = this.modellerFrame?.nativeElement?.contentWindow as
      | {
          pistarValidateModelText?: (value: string) => unknown;
        }
      | null
      | undefined;

    if (!frameWindow || typeof frameWindow.pistarValidateModelText !== 'function') {
      return [];
    }

    try {
      const result = frameWindow.pistarValidateModelText(JSON.stringify(model));
      if (!Array.isArray(result)) {
        return [];
      }

      return result
        .filter((message): message is string => typeof message === 'string')
        .map((message) => message.trim())
        .filter((message) => message.length > 0);
    } catch (error) {
      console.error('[Step2][Validation] Failed to run piStar validation bridge', error);
      return [];
    }
  }

  private mergeValidationErrors(...groups: string[][]): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const group of groups) {
      for (const error of group) {
        const normalized = error.trim();
        if (!normalized || seen.has(normalized)) {
          continue;
        }

        seen.add(normalized);
        merged.push(normalized);
      }
    }

    return merged;
  }

  private buildCorrectModelAiPrompt(model: PistarModel, validationErrors: string[]): string {
    const listedErrors = validationErrors.map((error, index) => `${index + 1}. ${error}`).join('\n');

    return `System Role & Objective:
You are an expert Requirements Engineer and System Modeler specializing in iStar 2.0 and the iStar4Safety extension. Correct the full Step 2 JSON model so it satisfies every rule below while preserving as much of the existing model as possible.

Your Output Constraints:
Valid JSON Only: Return one complete corrected JSON model object only. Do not return markdown, comments, explanations, prefixes, suffixes, or code fences.
Full Model Only: Do not return a patch. Return the full corrected model with actors, dependencies, links, display, tool, istar, saveDate, and diagram.
Preserve ids when possible: Keep existing ids for actors, nodes, dependencies, and links unless an invalid item must be removed or replaced.
Rule compliance is mandatory: If a structure violates any rule, remove it or replace it with a valid alternative.

Current validation errors to fix:
${listedErrors}

Current full model JSON:
${JSON.stringify(model, null, 2)}

${this.buildFullPistarValidationRuleSet()}

Additional correction requirements:
1. Keep every intentional element inside exactly one actor boundary.
2. Ensure every dependency endpoint and every link endpoint resolves in the final model.
3. If a corrected relation cannot be made valid, omit it instead of returning an invalid structure.
4. Return only the corrected JSON model.`;
  }

  private validateModelDefinition(): string[] {
    const errors: string[] = [];
    const actors = this.actors();
    const elements = this.getAllElements();
    const internalLinks = this.internalRelationships();
    const dependencies = this.socialDependencies();

    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const elementById = new Map(elements.map((element) => [element.id, element]));

    const actorEdges: Array<{ from: string; to: string; type: ActorAssociationType }> = [];
    const actorPairLinks = new Set<string>();

    for (const actor of actors) {
      for (const association of actor.associations) {
        actorEdges.push({ from: actor.id, to: association.targetActorId, type: association.type });

        if (association.targetActorId === actor.id) {
          errors.push(`Actor '${actor.name}' cannot have a self '${association.type}' link.`);
        }

        const pairKey = [actor.id, association.targetActorId].sort().join('::');
        if (actorPairLinks.has(pairKey)) {
          errors.push(`Actors '${actor.name}' and '${this.getActorName(association.targetActorId)}' violate the single-link rule.`);
        }
        actorPairLinks.add(pairKey);

        if (association.type === 'is-a') {
          if (actor.type === 'Agent') {
            errors.push(`Actor '${actor.name}' is an Agent and cannot be specialized via is-a.`);
          }

          const targetActor = actorById.get(association.targetActorId);
          if (!targetActor) {
            errors.push(`Actor '${actor.name}' has an is-a link to an unknown actor.`);
          } else {
            const sameType = actor.type === targetActor.type;
            const validTypePair = actor.type === 'Role' || actor.type === 'Actor';
            if (!sameType || !validTypePair) {
              errors.push(`Invalid is-a specialization between '${actor.name}' (${actor.type}) and '${targetActor.name}' (${targetActor.type}).`);
            }
          }
        }
      }
    }

    const isAEdges = actorEdges.filter((edge) => edge.type === 'is-a').map((edge) => ({ from: edge.from, to: edge.to }));
    const participatesEdges = actorEdges
      .filter((edge) => edge.type === 'participates-in')
      .map((edge) => ({ from: edge.from, to: edge.to }));

    if (this.hasDirectedCycle(isAEdges)) {
      errors.push('Actor is-a links contain a cycle.');
    }
    if (this.hasDirectedCycle(participatesEdges)) {
      errors.push('Actor participates-in links contain a cycle.');
    }

    const contributionPairs = new Set<string>();
    const qualificationPairs = new Set<string>();

    const refinementByParent = new Map<string, { type: RefinementType; children: string[] }>();
    const refinementChildParents = new Map<string, string[]>();

    for (const relationship of internalLinks) {
      const source = elementById.get(relationship.sourceElementId);
      const target = elementById.get(relationship.targetElementId);

      if (!source || !target) {
        errors.push(`Internal relationship '${relationship.id}' references unknown elements.`);
        continue;
      }

      if (source.actorId !== target.actorId) {
        errors.push(`Relationship '${relationship.id}' violates same-actor constraint.`);
      }

      if (relationship.type === 'Contribution') {
        if (target.type !== 'Quality') {
          errors.push(`Contribution '${relationship.id}' must target a Quality.`);
        }
        if (source.id === target.id) {
          errors.push(`Contribution '${relationship.id}' cannot contribute to itself.`);
        }
        contributionPairs.add(`${source.id}->${target.id}`);
      }

      if (relationship.type === 'Qualification') {
        if (source.type !== 'Quality') {
          errors.push(`Qualification '${relationship.id}' must have a Quality as source.`);
        }
        if (!['Goal', 'Task', 'Resource'].includes(target.type)) {
          errors.push(`Qualification '${relationship.id}' target must be Goal, Task, or Resource.`);
        }
        qualificationPairs.add(`${source.id}->${target.id}`);
      }

      if (relationship.type === 'NeededBy') {
        if (source.type !== 'Resource' && source.type !== 'SafetyResource') {
          errors.push(`NeededBy '${relationship.id}' must have Resource or SafetyResource as source.`);
        }

        if (source.type === 'SafetyResource' && !['Hazard', 'Task', 'SafetyTask'].includes(target.type)) {
          errors.push(`SafetyResource in NeededBy '${relationship.id}' can only target Hazard, Task, or SafetyTask.`);
        }
      }

      if (relationship.type === 'Refinement') {
        const parentId = relationship.targetElementId;
        const childId = relationship.sourceElementId;
        const kind = relationship.refinementType ?? 'AND';

        const current = refinementByParent.get(parentId);
        if (!current) {
          refinementByParent.set(parentId, { type: kind, children: [childId] });
        } else {
          if (current.type !== kind) {
            errors.push(`Parent element '${target.name}' uses both AND and OR refinements.`);
          }
          current.children.push(childId);
        }

        const childParents = refinementChildParents.get(childId) ?? [];
        childParents.push(parentId);
        refinementChildParents.set(childId, childParents);
      }
    }

    for (const pair of contributionPairs) {
      if (qualificationPairs.has(pair)) {
        errors.push(`Elements in pair '${pair}' cannot have both Contribution and Qualification links.`);
      }
    }

    const refinementEdges: Array<{ from: string; to: string }> = [];

    refinementByParent.forEach((value, parentId) => {
      const parent = elementById.get(parentId);
      if (!parent) {
        return;
      }

      for (const childId of value.children) {
        refinementEdges.push({ from: parentId, to: childId });
      }

      // if (value.type === 'AND' && value.children.length < 2) {
      //   errors.push(`AND refinement on '${parent.name}' must have at least 2 children.`);
      // }

      if (value.type === 'OR' && value.children.length < 1) {
        errors.push(`OR refinement on '${parent.name}' must have at least 1 child.`);
      }

      const childTypes = value.children
        .map((childId) => elementById.get(childId)?.type)
        .filter((type): type is IntentionalElementType => Boolean(type));

      if (parent.type === 'SafetyGoal' && childTypes.length > 0) {
        const allSafetyGoals = childTypes.every((type) => type === 'SafetyGoal');
        const allHazards = childTypes.every((type) => type === 'Hazard');

        if (!allSafetyGoals && !allHazards) {
          errors.push(`SafetyGoal '${parent.name}' refinement children must be all SafetyGoals or all Hazards.`);
        }

        if (allHazards) {
          for (const childId of value.children) {
            const childElement = elementById.get(childId);
            if (!childElement || childElement.type !== 'Hazard') {
              continue;
            }

            if (refinementByParent.has(childId)) {
              errors.push(`Hazard '${childElement.name}' refined from SafetyGoal cannot be a refinement parent.`);
            }

            const parents = refinementChildParents.get(childId) ?? [];
            if (parents.some((parentCandidate) => parentCandidate !== parentId)) {
              errors.push(`Hazard '${childElement.name}' refined from SafetyGoal cannot be child of another refinement.`);
            }
          }
        }
      }

      if (parent.type === 'Hazard' && childTypes.length > 0) {
        const allHazards = childTypes.every((type) => type === 'Hazard');
        const allSafetyTaskOrResource = childTypes.every((type) => ['SafetyTask', 'SafetyResource'].includes(type));

        if (!allHazards && !allSafetyTaskOrResource) {
          errors.push(`Hazard '${parent.name}' refinement children must be all Hazards or all SafetyTask/SafetyResource.`);
        }
      }
    });

    if (this.hasDirectedCycle(refinementEdges)) {
      errors.push('Refinement links contain a cycle.');
    }

    const hazardElements = this.safetyIntentionalElements().filter((element) => element.type === 'Hazard');
    const safetyGoalElements = this.safetyIntentionalElements().filter((element) => element.type === 'SafetyGoal');

    for (const safetyElement of this.safetyIntentionalElements()) {
      if (!safetyElement.traceabilityId || !safetyElement.traceabilityId.trim()) {
        errors.push(`Safety element '${safetyElement.name}' must include a traceability ID.`);
        continue;
      }

      if (!this.isSafetyElementType(safetyElement.type)) {
        continue;
      }

      if (
        !this.isValidTraceabilityIdForType(
          safetyElement.traceabilityId,
          safetyElement.type,
          safetyElement.type === 'SafetyGoal' ? safetyElement.safetyGoalKind : undefined
        )
      ) {
        errors.push(
          `Safety element '${safetyElement.name}' has invalid traceability ID '${safetyElement.traceabilityId}' for type '${safetyElement.type}'.`
        );
      }
    }

    const safetyGoalById = new Map(safetyGoalElements.map((item) => [item.id, item]));
    const hazardsByGoal = new Map<string, IntentionalElement[]>();

    for (const hazard of hazardElements) {
      const obstructedGoals = hazard.obstructsSafetyGoalIds ?? [];
      if (obstructedGoals.length === 0) {
        errors.push(`Hazard '${hazard.name}' must obstruct at least one SafetyGoal.`);
      }

      for (const goalId of obstructedGoals) {
        if (!safetyGoalById.has(goalId)) {
          errors.push(`Hazard '${hazard.name}' references unknown SafetyGoal '${goalId}' in obstructs.`);
          continue;
        }

        const list = hazardsByGoal.get(goalId) ?? [];
        list.push(hazard);
        hazardsByGoal.set(goalId, list);
      }
    }

    for (const safetyGoal of safetyGoalElements) {
      if (safetyGoal.safetyGoalKind === 'Responsibility') {
        continue;
      }

      const relatedHazards = hazardsByGoal.get(safetyGoal.id) ?? [];
      if (relatedHazards.length === 0) {
        errors.push(
          `SafetyGoal '${safetyGoal.name}' must be obstructed by at least one Hazard to complete the safety reasoning chain.`
        );
      }
    }

    const contributionTargets = internalLinks
      .filter((link) => link.type === 'Contribution')
      .map((link) => link.targetElementId);

    const dependumKeys = new Set<string>();

    for (const dependency of dependencies) {
      if (dependency.dependerActorId === dependency.dependeeActorId) {
        errors.push(`Dependency '${dependency.id}' must have different depender and dependee actors.`);
      }

      const dependumType = dependency.dependum.type;
      if (['Hazard', 'SafetyGoal', 'SafetyTask', 'SafetyResource'].includes(dependumType)) {
        errors.push(`Dependency '${dependency.id}' dependum cannot be a safety element.`);
      }

      const dependumKey = `${dependency.dependum.name.trim().toLowerCase()}::${dependency.dependum.type}`;
      if (dependumKeys.has(dependumKey)) {
        errors.push(`Dependency '${dependency.id}' duplicates an existing dependum definition.`);
      }
      dependumKeys.add(dependumKey);

      if (dependency.dependerElementId) {
        const dependerElement = elementById.get(dependency.dependerElementId);
        if (!dependerElement || dependerElement.actorId !== dependency.dependerActorId) {
          errors.push(`Dependency '${dependency.id}' has invalid depender element assignment.`);
        }

        if (refinementByParent.has(dependency.dependerElementId)) {
          errors.push(`Dependency '${dependency.id}' depender element cannot be refined (freeze rule).`);
        }

        if (contributionTargets.includes(dependency.dependerElementId)) {
          errors.push(`Dependency '${dependency.id}' depender element cannot be contribution target (freeze rule).`);
        }
      }

      if (dependency.dependeeElementId) {
        const dependeeElement = elementById.get(dependency.dependeeElementId);
        if (!dependeeElement || dependeeElement.actorId !== dependency.dependeeActorId) {
          errors.push(`Dependency '${dependency.id}' has invalid dependee element assignment.`);
        }
      }
    }

    return errors;
  }

  private hasDirectedCycle(edges: Array<{ from: string; to: string }>): boolean {
    const adjacency = new Map<string, string[]>();

    for (const edge of edges) {
      const list = adjacency.get(edge.from) ?? [];
      list.push(edge.to);
      adjacency.set(edge.from, list);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const dfs = (node: string): boolean => {
      if (visiting.has(node)) {
        return true;
      }
      if (visited.has(node)) {
        return false;
      }

      visiting.add(node);

      const neighbours = adjacency.get(node) ?? [];
      for (const neighbour of neighbours) {
        if (dfs(neighbour)) {
          return true;
        }
      }

      visiting.delete(node);
      visited.add(node);
      return false;
    };

    for (const node of adjacency.keys()) {
      if (dfs(node)) {
        return true;
      }
    }

    return false;
  }

  private buildPayload(): unknown {
    return {
      projectId: this.currentProjectId(),
      projectName: this.currentProjectName(),
      actors: this.actors().map((actor) => ({
        id: actor.id,
        name: actor.name,
        type: actor.type,
        isA: actor.associations.filter((association) => association.type === 'is-a').map((association) => association.targetActorId),
        participatesIn: actor.associations
          .filter((association) => association.type === 'participates-in')
          .map((association) => association.targetActorId)
      })),
      standardIntentionalElements: this.standardIntentionalElements(),
      safetyIntentionalElements: this.safetyIntentionalElements(),
      internalRelationships: this.internalRelationships(),
      socialDependencies: this.socialDependencies()
    };
  }

  private queuePushModelFromForms(): void {
    if (this.suppressFormToModelSync) {
      return;
    }

    if (this.syncPushTimeoutId !== null) {
      window.clearTimeout(this.syncPushTimeoutId);
    }

    this.syncPushTimeoutId = window.setTimeout(() => {
      this.syncPushTimeoutId = null;

      const model = this.buildPistarModelFromForms();
      const snapshot = JSON.stringify(model);
      if (snapshot === this.lastPushedModelSnapshot) {
        return;
      }

      this.lastPushedModelSnapshot = snapshot;
      console.info('[Step2][Push] Queue push model from forms', {
        actorCount: model.actors.length,
        dependencyCount: model.dependencies.length,
        linkCount: model.links.length
      });
      this.applyModelObjectToPistar(model);
    }, 300);
  }

  private startModelPullSync(): void {
    this.syncPullIntervalId = window.setInterval(() => this.pullModelFromPistar(), 1200);
  }

  private pullModelFromPistar(): void {
    if (this.suppressModelToFormSync) {
      return;
    }

    const frameWindow = this.modellerFrame?.nativeElement?.contentWindow as
      | {
          saveModel?: () => unknown;
        }
      | null
      | undefined;

    if (!frameWindow || typeof frameWindow.saveModel !== 'function') {
      return;
    }

    const serialized = frameWindow.saveModel();
    if (typeof serialized !== 'string' || !serialized.trim()) {
      return;
    }

    const parsed = this.parsePistarModelFromText(serialized);
    if (!parsed) {
      return;
    }

    if (this.isPistarModelEmpty(parsed) && this.hasLocalStepTwoData()) {
      return;
    }

    const snapshot = JSON.stringify(parsed);
    if (snapshot === this.lastPulledModelSnapshot || snapshot === this.lastPushedModelSnapshot) {
      return;
    }

    this.lastPulledModelSnapshot = snapshot;
    this.syncFormsFromPistarModel(parsed);
  }

  private syncFormsFromPistarModel(model: PistarModel): void {
    const actors: ActorDefinition[] = [];
    const standardElements: IntentionalElement[] = [];
    const safetyElements: IntentionalElement[] = [];
    const internalRelationships: InternalRelationship[] = [];
    const socialDependencies: SocialDependency[] = [];

    const nodeOwner = new Map<string, { actorId: string; isActor: boolean }>();
    const allElementIds = new Set<string>();

    for (const actor of model.actors ?? []) {
      actors.push({
        id: actor.id,
        name: actor.text || actor.id,
        type: this.mapPistarTypeToActorType(actor.type),
        x: this.normalizeCoordinate(actor.x),
        y: this.normalizeCoordinate(actor.y),
        associations: []
      });

      nodeOwner.set(actor.id, { actorId: actor.id, isActor: true });

      for (const node of actor.nodes ?? []) {
        const mappedType = this.mapPistarTypeToIntentionalElementType(node.type, node.customProperties?.['safetyType']);
        const nodeName = node.text || node.id;
        const traceabilityFromName = this.extractTraceabilityIdFromName(nodeName);
        const mapped: IntentionalElement = {
          id: node.id,
          actorId: actor.id,
          name: this.isSafetyElementType(mappedType) ? this.stripTraceabilityPrefix(nodeName) : nodeName,
          traceabilityId: this.isSafetyElementType(mappedType)
            ? this.normalizeTraceabilityId(
                typeof node.customProperties?.['traceabilityId'] === 'string'
                  ? (node.customProperties['traceabilityId'] as string)
                  : undefined
              ) ?? traceabilityFromName
            : undefined,
          type: mappedType,
          source: this.isSafetyElementType(mappedType) ? 'safety' : 'standard',
          x: this.normalizeCoordinate(node.x),
          y: this.normalizeCoordinate(node.y)
        };

        if (mappedType === 'SafetyGoal') {
          mapped.accidentLevel = this.normalizeAccidentLevel(
            typeof node.customProperties?.['accidentLevel'] === 'string'
              ? (node.customProperties['accidentLevel'] as string)
              : null
          );
          mapped.safetyGoalKind = this.normalizeSafetyGoalKind(
            typeof node.customProperties?.['safetyGoalKind'] === 'string'
              ? (node.customProperties['safetyGoalKind'] as string)
              : null
          );
        }

        if (mappedType === 'Hazard') {
          mapped.obstructsSafetyGoalIds = Array.isArray(node.customProperties?.['obstructsSafetyGoalIds'])
            ? (node.customProperties['obstructsSafetyGoalIds'] as unknown[]).filter(
                (value): value is string => typeof value === 'string' && value.trim().length > 0
              )
            : [];
        }

        if (mapped.source === 'safety') {
          safetyElements.push(mapped);
        } else {
          standardElements.push(mapped);
        }

        nodeOwner.set(node.id, { actorId: actor.id, isActor: false });
        allElementIds.add(node.id);
      }
    }

    for (const link of model.links ?? []) {
      const sourceOwner = nodeOwner.get(link.source);
      const targetOwner = nodeOwner.get(link.target);
      const linkType = (link.type ?? '').toLowerCase();

      if (!sourceOwner || !targetOwner) {
        continue;
      }

      if (linkType.includes('dependencylink')) {
        continue;
      }

      if (sourceOwner.isActor && targetOwner.isActor) {
        if (linkType.includes('isa')) {
          const actor = actors.find((item) => item.id === link.source);
          if (actor) {
            actor.associations.push({ type: 'is-a', targetActorId: link.target });
          }
          continue;
        }

        if (linkType.includes('particip')) {
          const actor = actors.find((item) => item.id === link.source);
          if (actor) {
            actor.associations.push({ type: 'participates-in', targetActorId: link.target });
          }
          continue;
        }
      }

      if (sourceOwner.actorId !== targetOwner.actorId) {
        continue;
      }

      if (!allElementIds.has(link.source) || !allElementIds.has(link.target)) {
        continue;
      }

      if (linkType.includes('andrefinement') || linkType.includes('orrefinement')) {
        internalRelationships.push({
          id: link.id,
          sourceElementId: link.source,
          targetElementId: link.target,
          type: 'Refinement',
          refinementType: linkType.includes('orrefinement') ? 'OR' : 'AND'
        });
        continue;
      }

      if (linkType.includes('contribution')) {
        internalRelationships.push({
          id: link.id,
          sourceElementId: link.source,
          targetElementId: link.target,
          type: 'Contribution',
          contributionMetric: this.normalizeContributionMetric(
            typeof link.label === 'string' ? this.capitalizeMetric(link.label) : 'Help'
          )
        });
        continue;
      }

      if (linkType.includes('qualification')) {
        internalRelationships.push({
          id: link.id,
          sourceElementId: link.source,
          targetElementId: link.target,
          type: 'Qualification'
        });
        continue;
      }

      if (linkType.includes('neededby')) {
        internalRelationships.push({
          id: link.id,
          sourceElementId: link.source,
          targetElementId: link.target,
          type: 'NeededBy'
        });
      }
    }

    for (const dependency of model.dependencies ?? []) {
      const dependerOwner = dependency.source ? nodeOwner.get(dependency.source) : undefined;
      const dependeeOwner = dependency.target ? nodeOwner.get(dependency.target) : undefined;

      if (!dependerOwner || !dependeeOwner) {
        continue;
      }

      socialDependencies.push({
        id: dependency.id,
        dependerActorId: dependerOwner.actorId,
        dependerElementId: dependerOwner.isActor ? undefined : dependency.source,
        dependum: {
          id: dependency.id,
          name: dependency.text || dependency.id,
          type: this.mapPistarDependumTypeToStandardType(dependency.type)
        },
        dependeeActorId: dependeeOwner.actorId,
        dependeeElementId: dependeeOwner.isActor ? undefined : dependency.target,
        x: this.normalizeCoordinate(dependency.x),
        y: this.normalizeCoordinate(dependency.y)
      });
    }

    this.suppressFormToModelSync = true;
    this.suppressModelToFormSync = true;

    this.actors.set(actors);
    this.standardIntentionalElements.set(standardElements);
    this.safetyIntentionalElements.set(safetyElements);
    this.internalRelationships.set(internalRelationships);
    this.socialDependencies.set(socialDependencies);
    this.payloadPreview.set('');
    this.syncCountersFromLoadedData();

    this.suppressModelToFormSync = false;
    this.suppressFormToModelSync = false;
  }

  private buildPistarModelFromForms(): PistarModel {
    const actors = this.actors();
    const standardElements = this.standardIntentionalElements();
    const safetyElements = this.safetyIntentionalElements();
    const allElements = [...standardElements, ...safetyElements];
    const elementById = new Map(allElements.map((item) => [item.id, item]));
    const actorIds = new Set(actors.map((actor) => actor.id));
    const validEndpointIds = new Set([...actorIds, ...allElements.map((element) => element.id)]);

    const pistarActors: PistarElement[] = actors.map((actor, actorIndex) => {
      const actorElements = allElements.filter((element) => element.actorId === actor.id);
      const nodes = actorElements.map((element, elementIndex) => ({
        id: element.id,
        text: this.composeElementDisplayName(element.name, element.traceabilityId),
        type: this.mapIntentionalElementTypeToPistarType(element.type),
        x: this.getCoordinateOrDefault(element.x, 80 + actorIndex * 300),
        y: this.getCoordinateOrDefault(element.y, 120 + elementIndex * 90),
        customProperties: {
          safetyType: this.isSafetyElementType(element.type) ? element.type : null,
          accidentLevel: element.accidentLevel ?? null,
          traceabilityId: element.traceabilityId ?? null,
          safetyGoalKind: element.safetyGoalKind ?? null,
          obstructsSafetyGoalIds: element.obstructsSafetyGoalIds ?? null
        }
      }));

      return {
        id: actor.id,
        text: actor.name,
        type: this.mapActorTypeToPistarType(actor.type),
        x: this.getCoordinateOrDefault(actor.x, 40 + actorIndex * 320),
        y: this.getCoordinateOrDefault(actor.y, 20),
        customProperties: {},
        nodes
      };
    });

    const links: PistarLink[] = [];

    for (const actor of actors) {
      for (const association of actor.associations) {
        if (!actorIds.has(actor.id) || !actorIds.has(association.targetActorId)) {
          continue;
        }

        links.push({
          id: `assoc-${actor.id}-${association.type}-${association.targetActorId}`,
          type: association.type === 'is-a' ? 'istar.IsALink' : 'istar.ParticipatesInLink',
          source: actor.id,
          target: association.targetActorId
        });
      }
    }

    for (const relationship of this.internalRelationships()) {
      const sourceElement = elementById.get(relationship.sourceElementId);
      const targetElement = elementById.get(relationship.targetElementId);
      if (!sourceElement || !targetElement || sourceElement.actorId !== targetElement.actorId) {
        continue;
      }

      if (relationship.type === 'Refinement') {
        links.push({
          id: relationship.id,
          type: relationship.refinementType === 'OR' ? 'istar.OrRefinementLink' : 'istar.AndRefinementLink',
          source: relationship.sourceElementId,
          target: relationship.targetElementId
        });
        continue;
      }

      if (relationship.type === 'Contribution') {
        links.push({
          id: relationship.id,
          type: 'istar.ContributionLink',
          source: relationship.sourceElementId,
          target: relationship.targetElementId,
          label: (relationship.contributionMetric ?? 'Help').toLowerCase()
        });
        continue;
      }

      if (relationship.type === 'Qualification') {
        links.push({
          id: relationship.id,
          type: 'istar.QualificationLink',
          source: relationship.sourceElementId,
          target: relationship.targetElementId
        });
        continue;
      }

      if (relationship.type === 'NeededBy') {
        links.push({
          id: relationship.id,
          type: 'istar.NeededByLink',
          source: relationship.sourceElementId,
          target: relationship.targetElementId
        });
      }
    }

    const dependencies: PistarElement[] = [];
    this.socialDependencies().forEach((dependency, index) => {
      const sourceId = dependency.dependerElementId || dependency.dependerActorId;
      const targetId = dependency.dependeeElementId || dependency.dependeeActorId;

      if (!dependency.id || !sourceId || !targetId) {
        return;
      }

      if (!validEndpointIds.has(sourceId) || !validEndpointIds.has(targetId)) {
        return;
      }

      links.push(
        {
          id: `${dependency.id}-in`,
          type: 'istar.DependencyLink',
          source: sourceId,
          target: dependency.id
        },
        {
          id: `${dependency.id}-out`,
          type: 'istar.DependencyLink',
          source: dependency.id,
          target: targetId
        }
      );

      dependencies.push({
        id: dependency.id,
        text: dependency.dependum.name,
        type: this.mapStandardTypeToPistarDependumType(dependency.dependum.type),
        x: this.getCoordinateOrDefault(dependency.x, 180 + index * 180),
        y: this.getCoordinateOrDefault(dependency.y, 520),
        customProperties: {},
        source: sourceId,
        target: targetId
      });
    });

    return {
      actors: pistarActors,
      dependencies,
      links,
      display: {},
      tool: 'pistar.2.1.0',
      istar: '2.0',
      saveDate: new Date().toUTCString(),
      diagram: {
        width: 2000,
        height: 1200,
        name: this.currentProjectName() || 'iStar4Safety Model',
        customProperties: {
          Description: 'Generated from Step 2 forms'
        }
      }
    };
  }

  private applyModelObjectToPistar(model: PistarModel): void {
    this.applyModelJsonToPistar(JSON.stringify(model));
  }

  private applyModelJsonToPistar(jsonText: string): void {
    const parsedForLog = this.parsePistarModelFromText(jsonText);
    if (parsedForLog) {
      console.info('[Step2][Push] Applying model to piStar iframe', {
        actorCount: parsedForLog.actors.length,
        dependencyCount: parsedForLog.dependencies.length,
        linkCount: parsedForLog.links.length
      });
    }

    const frameWindow = this.modellerFrame?.nativeElement?.contentWindow as
      | {
          pistarSetWelcomeModel?: (value: string) => void;
          pistarLoadModelFromText?: (value: string) => void;
          postMessage?: (message: unknown, targetOrigin: string) => void;
        }
      | null
      | undefined;

    if (frameWindow?.pistarSetWelcomeModel) {
      console.info('[Step2][Push] Using pistarSetWelcomeModel');
      frameWindow.pistarSetWelcomeModel(jsonText);
      return;
    }

    if (frameWindow?.pistarLoadModelFromText) {
      console.info('[Step2][Push] Using pistarLoadModelFromText');
      frameWindow.pistarLoadModelFromText(jsonText);
      return;
    }

    console.info('[Step2][Push] Using postMessage fallback');
    frameWindow?.postMessage?.({ type: 'pistar-set-welcome-model', text: jsonText }, '*');

    // Retry once in case iframe helper APIs are not ready yet during initial route hydration.
    window.setTimeout(() => {
      const retryWindow = this.modellerFrame?.nativeElement?.contentWindow as
        | {
            pistarSetWelcomeModel?: (value: string) => void;
            pistarLoadModelFromText?: (value: string) => void;
          }
        | null
        | undefined;

      if (retryWindow?.pistarSetWelcomeModel) {
        console.info('[Step2][Push] Retry with pistarSetWelcomeModel');
        retryWindow.pistarSetWelcomeModel(jsonText);
        return;
      }

      if (retryWindow?.pistarLoadModelFromText) {
        console.info('[Step2][Push] Retry with pistarLoadModelFromText');
        retryWindow.pistarLoadModelFromText(jsonText);
      }
    }, 250);
  }

  private parsePistarModelFromText(text: string): PistarModel | null {
    try {
      const parsed = JSON.parse(text) as PistarModel;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.actors) || !Array.isArray(parsed.dependencies)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private isPistarModelEmpty(model: PistarModel): boolean {
    const actorCount = Array.isArray(model.actors) ? model.actors.length : 0;
    const dependencyCount = Array.isArray(model.dependencies) ? model.dependencies.length : 0;
    const linkCount = Array.isArray(model.links) ? model.links.length : 0;
    return actorCount === 0 && dependencyCount === 0 && linkCount === 0;
  }

  private hasLocalStepTwoData(): boolean {
    return (
      this.actors().length > 0 ||
      this.standardIntentionalElements().length > 0 ||
      this.safetyIntentionalElements().length > 0 ||
      this.internalRelationships().length > 0 ||
      this.socialDependencies().length > 0
    );
  }

  private mapActorTypeToPistarType(type: ActorType): string {
    if (type === 'Role') {
      return 'istar.Role';
    }
    if (type === 'Agent') {
      return 'istar.Agent';
    }
    return 'istar.Actor';
  }

  private mapPistarTypeToActorType(type: string): ActorType {
    if (type === 'istar.Role') {
      return 'Role';
    }
    if (type === 'istar.Agent') {
      return 'Agent';
    }
    return 'Actor';
  }

  private mapIntentionalElementTypeToPistarType(type: IntentionalElementType): string {
    return `istar.${type}`;
  }

  private mapPistarTypeToIntentionalElementType(type: string, safetyTypeHint?: unknown): IntentionalElementType {
    if (typeof safetyTypeHint === 'string') {
      const hinted = this.normalizeIntentionalElementType(safetyTypeHint);
      if (this.isSafetyElementType(hinted)) {
        return hinted;
      }
    }

    const normalized = type.startsWith('istar.') ? type.replace('istar.', '') : type;
    return this.normalizeIntentionalElementType(normalized);
  }

  private mapStandardTypeToPistarDependumType(type: StandardElementType): string {
    return `istar.${type}`;
  }

  private mapPistarDependumTypeToStandardType(type: string): StandardElementType {
    const normalized = type.startsWith('istar.') ? type.replace('istar.', '') : type;
    return this.normalizeStandardElementType(normalized);
  }

  private capitalizeMetric(value: string): string {
    const lower = value.trim().toLowerCase();
    if (!lower) {
      return 'Help';
    }
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }

  private buildStepTwoInformationPayload(): StepTwoInformationDto {
    const allElements = this.getAllElements();
    const allRelationships = this.internalRelationships();

    const actors = this.actors().map((actor): StepTwoActorDto => {
      const actorElements = allElements.filter((element) => element.actorId === actor.id);
      const actorRelationships = allRelationships.filter((relationship) => {
        const source = allElements.find((element) => element.id === relationship.sourceElementId);
        const target = allElements.find((element) => element.id === relationship.targetElementId);
        return source?.actorId === actor.id && target?.actorId === actor.id;
      });

      const refinementsMap = new Map<string, StepTwoRefinementDto>();
      actorRelationships
        .filter((relationship) => relationship.type === 'Refinement')
        .forEach((relationship) => {
          const parent = relationship.targetElementId;
          const existing = refinementsMap.get(parent);

          if (!existing) {
            refinementsMap.set(parent, {
              id: relationship.id,
              type: relationship.refinementType ?? 'AND',
              parent,
              children: [relationship.sourceElementId]
            });
            return;
          }

          existing.children.push(relationship.sourceElementId);
        });

      const qualificationsBySource = new Map<string, string[]>();
      actorRelationships
        .filter((relationship) => relationship.type === 'Qualification')
        .forEach((relationship) => {
          const targets = qualificationsBySource.get(relationship.sourceElementId) ?? [];
          targets.push(relationship.targetElementId);
          qualificationsBySource.set(relationship.sourceElementId, targets);
        });

      const intentionalElements: StepTwoIntentionalElementDto[] = actorElements.map((element) => {
        const dto: StepTwoIntentionalElementDto = {
          id: element.id,
          name: this.composeElementDisplayName(element.name, element.traceabilityId),
          type: element.type,
          x: this.normalizeCoordinate(element.x),
          y: this.normalizeCoordinate(element.y),
          refinedBy: Array.from(refinementsMap.values())
            .filter((refinement) => refinement.parent === element.id)
            .map((refinement) => refinement.id),
          qualifies: qualificationsBySource.get(element.id) ?? []
        };

        if (element.type === 'SafetyGoal') {
          dto.accidentLevel = element.accidentLevel ?? 'L1';
          dto.safetyGoalKind = element.safetyGoalKind ?? 'Safety Constraint';
        }

        if (element.type === 'Hazard') {
          dto.obstructs = [...(element.obstructsSafetyGoalIds ?? [])];
        }

        return dto;
      });

      return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        x: this.normalizeCoordinate(actor.x),
        y: this.normalizeCoordinate(actor.y),
        isA: actor.associations.filter((association) => association.type === 'is-a').map((association) => association.targetActorId),
        participatesIn: actor.associations
          .filter((association) => association.type === 'participates-in')
          .map((association) => association.targetActorId),
        intentionalElements,
        internalLinks: {
          refinements: Array.from(refinementsMap.values()),
          contributions: actorRelationships
            .filter((relationship) => relationship.type === 'Contribution')
            .map((relationship) => ({
              id: relationship.id,
              source: relationship.sourceElementId,
              target: relationship.targetElementId,
              metric: relationship.contributionMetric ?? 'Help'
            })),
          neededBy: actorRelationships
            .filter((relationship) => relationship.type === 'NeededBy')
            .map((relationship) => ({
              id: relationship.id,
              source: relationship.sourceElementId,
              target: relationship.targetElementId
            }))
        }
      };
    });

    const dependencies: StepTwoDependencyDto[] = this.socialDependencies().map((dependency) => ({
      id: dependency.id,
      depender: dependency.dependerActorId,
      dependerElement: dependency.dependerElementId ?? null,
      x: this.normalizeCoordinate(dependency.x),
      y: this.normalizeCoordinate(dependency.y),
      dependum: {
        id: dependency.dependum.id,
        name: dependency.dependum.name,
        type: dependency.dependum.type
      },
      dependee: dependency.dependeeActorId,
      dependeeElement: dependency.dependeeElementId ?? null
    }));

    return {
      modelName: this.currentProjectName(),
      actors,
      dependencies
    };
  }

  private hydrateFromStepTwoInformation(raw: Record<string, unknown>): void {
    const stepTwo = this.normalizeStepTwoInformation(raw);

    if (stepTwo.modelName && stepTwo.modelName.trim()) {
      this.currentProjectName.set(stepTwo.modelName.trim());
    }

    const actors: ActorDefinition[] = stepTwo.actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      type: this.normalizeActorType(actor.type),
      x: this.normalizeCoordinate(actor.x),
      y: this.normalizeCoordinate(actor.y),
      associations: [
        ...(actor.isA ?? []).map((targetActorId) => ({ type: 'is-a' as const, targetActorId })),
        ...(actor.participatesIn ?? []).map((targetActorId) => ({ type: 'participates-in' as const, targetActorId }))
      ]
    }));

    // Some backend payloads can reference actors only through dependency endpoints.
    // Materialize those actors so dependency links are not dropped during model sync.
    const knownActorIds = new Set(actors.map((actor) => actor.id));
    for (const dependency of stepTwo.dependencies) {
      for (const endpointActorId of [dependency.depender, dependency.dependee]) {
        const normalizedActorId = endpointActorId?.trim();
        if (!normalizedActorId || knownActorIds.has(normalizedActorId)) {
          continue;
        }

        knownActorIds.add(normalizedActorId);
        actors.push({
          id: normalizedActorId,
          name: normalizedActorId,
          type: 'Actor',
          associations: []
        });
      }
    }

    const standardElements: IntentionalElement[] = [];
    const safetyElements: IntentionalElement[] = [];
    const relationships: InternalRelationship[] = [];
    const relationshipKeys = new Set<string>();

    const registerRelationship = (relationship: InternalRelationship): void => {
      const key = `${relationship.type}|${relationship.sourceElementId}|${relationship.targetElementId}|${relationship.refinementType ?? ''}|${relationship.contributionMetric ?? ''}`;
      if (relationshipKeys.has(key)) {
        return;
      }
      relationshipKeys.add(key);
      relationships.push(relationship);
    };

    for (const actor of stepTwo.actors) {
      for (const element of actor.intentionalElements ?? []) {
        const normalizedType = this.normalizeIntentionalElementType(element.type);
        const extractedTraceabilityId = this.extractTraceabilityIdFromName(element.name);
        const mapped: IntentionalElement = {
          id: element.id,
          actorId: actor.id,
          name: this.isSafetyElementType(normalizedType) ? this.stripTraceabilityPrefix(element.name) : element.name,
          traceabilityId: this.isSafetyElementType(normalizedType) ? extractedTraceabilityId : undefined,
          type: normalizedType,
          source: this.isSafetyElementType(normalizedType) ? 'safety' : 'standard',
          x: this.normalizeCoordinate(element.x),
          y: this.normalizeCoordinate(element.y)
        };

        if (normalizedType === 'SafetyGoal') {
          mapped.accidentLevel = this.normalizeAccidentLevel(element.accidentLevel);
          mapped.safetyGoalKind = this.normalizeSafetyGoalKind(
            typeof (element as StepTwoIntentionalElementDto).safetyGoalKind === 'string'
              ? (element as StepTwoIntentionalElementDto).safetyGoalKind
              : undefined
          );
        }

        if (normalizedType === 'Hazard') {
          mapped.obstructsSafetyGoalIds = [...(element.obstructs ?? [])];
        }

        if (mapped.source === 'safety') {
          safetyElements.push(mapped);
        } else {
          standardElements.push(mapped);
        }

        for (const qualifiedTargetId of element.qualifies ?? []) {
          registerRelationship({
            id: `${element.id}-qual-${qualifiedTargetId}`,
            sourceElementId: element.id,
            targetElementId: qualifiedTargetId,
            type: 'Qualification'
          });
        }
      }

      for (const refinement of actor.internalLinks?.refinements ?? []) {
        for (const childId of refinement.children ?? []) {
          registerRelationship({
            id: `${refinement.id}-${childId}`,
            sourceElementId: childId,
            targetElementId: refinement.parent,
            type: 'Refinement',
            refinementType: this.normalizeRefinementType(refinement.type)
          });
        }
      }

      for (const contribution of actor.internalLinks?.contributions ?? []) {
        registerRelationship({
          id: contribution.id,
          sourceElementId: contribution.source,
          targetElementId: contribution.target,
          type: 'Contribution',
          contributionMetric: this.normalizeContributionMetric(contribution.metric)
        });
      }

      for (const neededBy of actor.internalLinks?.neededBy ?? []) {
        registerRelationship({
          id: neededBy.id,
          sourceElementId: neededBy.source,
          targetElementId: neededBy.target,
          type: 'NeededBy'
        });
      }
    }

    const socialDependencies: SocialDependency[] = stepTwo.dependencies.map((dependency) => ({
      id: dependency.id,
      dependerActorId: dependency.depender,
      dependerElementId: dependency.dependerElement ?? undefined,
      dependum: {
        id: dependency.dependum.id,
        name: dependency.dependum.name,
        type: dependency.dependum.type
      },
      dependeeActorId: dependency.dependee,
      dependeeElementId: dependency.dependeeElement ?? undefined,
      x: this.normalizeCoordinate(dependency.x),
      y: this.normalizeCoordinate(dependency.y)
    }));

    this.actors.set(actors);
    this.standardIntentionalElements.set(standardElements);
    this.safetyIntentionalElements.set(safetyElements);
    this.internalRelationships.set(relationships);
    this.socialDependencies.set(socialDependencies);
    this.payloadPreview.set('');
    this.syncCountersFromLoadedData();
    console.info('[Step2][Hydrate] Applied hydrated data to forms', {
      actorCount: actors.length,
      standardElementCount: standardElements.length,
      safetyElementCount: safetyElements.length,
      relationshipCount: relationships.length,
      dependencyCount: socialDependencies.length
    });
    this.queuePushModelFromForms();
  }

  private normalizeStepTwoInformation(raw: Record<string, unknown>): StepTwoInformationDto {
    const modelName = typeof raw['modelName'] === 'string' || raw['modelName'] === null ? (raw['modelName'] as string | null) : null;
    const actorsRaw = Array.isArray(raw['actors']) ? (raw['actors'] as StepTwoActorDto[]) : [];
    const dependenciesRaw = Array.isArray(raw['dependencies']) ? (raw['dependencies'] as StepTwoDependencyDto[]) : [];
    const goalLinksRaw = Array.isArray(raw['goalLinks']) ? (raw['goalLinks'] as StepTwoGoalLinkDto[]) : [];

    const normalizedActors: StepTwoActorDto[] = actorsRaw.map((actor, index) => {
      const actorRecord = actor as unknown as Record<string, unknown>;
      const actorId = this.normalizeActorId(actorRecord['id'], index + 1);

      const explicitIntentionalElements = Array.isArray(actor.intentionalElements)
        ? actor.intentionalElements
            .filter((item): item is StepTwoIntentionalElementDto => Boolean(item && typeof item === 'object'))
            .map((item, itemIndex) => ({
              id: typeof item.id === 'string' && item.id.trim() ? item.id : `element-${index + 1}-${itemIndex + 1}`,
              name: typeof item.name === 'string' && item.name.trim() ? item.name : `Element ${itemIndex + 1}`,
              type: typeof item.type === 'string' ? item.type : 'Goal',
              x: this.normalizeCoordinate(item.x),
              y: this.normalizeCoordinate(item.y),
              accidentLevel: typeof item.accidentLevel === 'string' ? item.accidentLevel : null,
              refinedBy: Array.isArray(item.refinedBy)
                ? item.refinedBy.filter((refId): refId is string => typeof refId === 'string')
                : [],
              obstructs: Array.isArray(item.obstructs)
                ? item.obstructs.filter((target): target is string => typeof target === 'string')
                : [],
              qualifies: Array.isArray(item.qualifies)
                ? item.qualifies.filter((target): target is string => typeof target === 'string')
                : []
            }))
        : [];

      const responsibilities = Array.isArray(actorRecord['responsibilities'])
        ? actorRecord['responsibilities'].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      const inferredIntentionalElements: StepTwoIntentionalElementDto[] =
        explicitIntentionalElements.length > 0
          ? []
          : responsibilities.map((responsibility, respIndex) => ({
              id: `${actorId}-resp-${respIndex + 1}`,
              name: responsibility.trim(),
              type: 'Task'
            }));

      return {
        id: actorId,
        name: typeof actor?.name === 'string' && actor.name.trim() ? actor.name : `Actor ${index + 1}`,
        type: typeof actor?.type === 'string' ? this.normalizeImportedActorType(actor.type) : 'Actor',
        x: this.normalizeCoordinate(actor?.x),
        y: this.normalizeCoordinate(actor?.y),
        isA: Array.isArray(actor?.isA) ? actor.isA.filter((item): item is string => typeof item === 'string') : [],
        participatesIn: Array.isArray(actor?.participatesIn)
          ? actor.participatesIn.filter((item): item is string => typeof item === 'string')
          : [],
        intentionalElements: [...explicitIntentionalElements, ...inferredIntentionalElements],
        internalLinks: {
          refinements: Array.isArray(actor?.internalLinks?.refinements)
            ? actor.internalLinks.refinements.filter((item): item is StepTwoRefinementDto => Boolean(item && typeof item === 'object'))
            : [],
          contributions: Array.isArray(actor?.internalLinks?.contributions)
            ? actor.internalLinks.contributions.filter((item): item is StepTwoContributionDto => Boolean(item && typeof item === 'object'))
            : [],
          neededBy: Array.isArray(actor?.internalLinks?.neededBy)
            ? actor.internalLinks.neededBy.filter((item): item is StepTwoNeededByDto => Boolean(item && typeof item === 'object'))
            : []
        }
      };
    });

    const actorIdByName = new Map<string, string>();
    for (const actor of normalizedActors) {
      actorIdByName.set(actor.id.trim().toLowerCase(), actor.id);
      actorIdByName.set(actor.name.trim().toLowerCase(), actor.id);
    }

    const normalizedDependenciesFromStepTwo: StepTwoDependencyDto[] = dependenciesRaw
      .filter((dependency): dependency is StepTwoDependencyDto => Boolean(dependency && typeof dependency === 'object'))
      .map((dependency, index) => ({
        id: typeof dependency.id === 'string' && dependency.id.trim() ? dependency.id : `dependency-${index + 1}`,
        depender: typeof dependency.depender === 'string' ? dependency.depender : '',
        dependerElement:
          typeof dependency.dependerElement === 'string' || dependency.dependerElement === null
            ? dependency.dependerElement
            : null,
        x: this.normalizeCoordinate(dependency.x),
        y: this.normalizeCoordinate(dependency.y),
        dependum: {
          id: typeof dependency.dependum?.id === 'string' ? dependency.dependum.id : `dependum-${index + 1}`,
          name: typeof dependency.dependum?.name === 'string' ? dependency.dependum.name : `Dependum ${index + 1}`,
          type: this.normalizeStandardElementType(dependency.dependum?.type)
        },
        dependee: typeof dependency.dependee === 'string' ? dependency.dependee : '',
        dependeeElement:
          typeof dependency.dependeeElement === 'string' || dependency.dependeeElement === null
            ? dependency.dependeeElement
            : null
      }));

    const normalizedDependenciesFromGoalLinks: StepTwoDependencyDto[] = goalLinksRaw
      .filter((goalLink): goalLink is StepTwoGoalLinkDto => Boolean(goalLink && typeof goalLink === 'object'))
      .map((goalLink, index) => {
        const dependerToken = typeof goalLink.fromActor === 'string' ? goalLink.fromActor.trim() : '';
        const explicitDependeeToken = typeof goalLink.toActor === 'string' ? goalLink.toActor.trim() : '';

        const depender = actorIdByName.get(dependerToken.toLowerCase()) ?? dependerToken;
        const explicitDependeeByName = actorIdByName.get(explicitDependeeToken.toLowerCase());
        const fallbackDependee = explicitDependeeToken || normalizedActors.find((actor) => actor.id !== depender)?.id || depender;
        const resolvedDependee = explicitDependeeByName ?? fallbackDependee;

        return {
          id:
            (typeof goalLink.id === 'string' && goalLink.id.trim()) || typeof goalLink.id === 'number'
              ? String(goalLink.id)
              : `goal-link-${index + 1}`,
          depender,
          dependerElement: null,
          x: this.normalizeCoordinate(goalLink.x),
          y: this.normalizeCoordinate(goalLink.y),
          dependum: {
            id: `goal-link-dependum-${index + 1}`,
            name: typeof goalLink.goal === 'string' && goalLink.goal.trim() ? goalLink.goal.trim() : `Goal ${index + 1}`,
            type: this.normalizeStandardElementType(goalLink.dependumType ?? goalLink.linkType)
          },
          dependee: resolvedDependee,
          dependeeElement: null
        };
      });

    const normalized = {
      modelName,
      actors: normalizedActors,
      dependencies: [...normalizedDependenciesFromStepTwo, ...normalizedDependenciesFromGoalLinks]
    };

    console.info('[Step2][Hydrate] Normalized step2 payload', {
      actorCount: normalized.actors.length,
      dependencyCount: normalized.dependencies.length,
      dependenciesFromStep2Count: normalizedDependenciesFromStepTwo.length,
      dependenciesFromGoalLinksCount: normalizedDependenciesFromGoalLinks.length
    });

    return normalized;
  }

  private resetStepTwoState(): void {
    this.actors.set([]);
    this.standardIntentionalElements.set([]);
    this.safetyIntentionalElements.set([]);
    this.internalRelationships.set([]);
    this.socialDependencies.set([]);
    this.validationErrors.set([]);
    this.payloadPreview.set('');
    this.actorSeq = 0;
    this.elementSeq = 0;
    this.relationshipSeq = 0;
    this.dependencySeq = 0;
    this.dependumSeq = 0;
    this.queuePushModelFromForms();
  }

  private syncCountersFromLoadedData(): void {
    this.actorSeq = this.getMaxNumericSuffix(this.actors().map((item) => item.id));
    this.elementSeq = this.getMaxNumericSuffix(this.getAllElements().map((item) => item.id));
    this.relationshipSeq = this.getMaxNumericSuffix(this.internalRelationships().map((item) => item.id));
    this.dependencySeq = this.getMaxNumericSuffix(this.socialDependencies().map((item) => item.id));
    this.dependumSeq = this.getMaxNumericSuffix(this.socialDependencies().map((item) => item.dependum.id));
  }

  private getMaxNumericSuffix(ids: string[]): number {
    return ids.reduce((max, id) => {
      const match = id.match(/(\d+)(?!.*\d)/);
      if (!match) {
        return max;
      }

      const value = Number(match[1]);
      if (Number.isNaN(value)) {
        return max;
      }

      return Math.max(max, value);
    }, 0);
  }

  private normalizeActorType(type: string): ActorType {
    if (type === 'Agent' || type === 'Role') {
      return type;
    }
    if (type === 'Actor' || type === 'Generic Actor') {
      return 'Actor';
    }
    return 'Actor';
  }

  private normalizeImportedActorType(type: string): string {
    const normalized = type.trim().toLowerCase();
    if (normalized === 'human' || normalized === 'person' || normalized === 'role') {
      return 'Role';
    }
    if (normalized === 'software' || normalized === 'system' || normalized === 'agent') {
      return 'Agent';
    }
    if (normalized === 'actor' || normalized === 'generic actor') {
      return 'Actor';
    }
    return 'Actor';
  }

  private normalizeActorId(value: unknown, fallbackIndex: number): string {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return `actor-${value}`;
    }

    return `actor-${fallbackIndex}`;
  }

  private normalizeStandardElementType(type: unknown): StandardElementType {
    return type === 'Task' || type === 'Resource' || type === 'Quality' ? type : 'Goal';
  }

  private normalizeSafetyGoalKind(kind: unknown): SafetyGoalKind {
    return kind === 'Responsibility' ? 'Responsibility' : 'Safety Constraint';
  }

  private normalizeIntentionalElementType(type: string): IntentionalElementType {
    const standardTypes: StandardElementType[] = ['Goal', 'Task', 'Resource', 'Quality'];
    const safetyTypes: SafetyElementType[] = ['SafetyGoal', 'Hazard', 'SafetyTask', 'SafetyResource'];

    if (standardTypes.includes(type as StandardElementType)) {
      return type as StandardElementType;
    }

    if (safetyTypes.includes(type as SafetyElementType)) {
      return type as SafetyElementType;
    }

    return 'Goal';
  }

  private isSafetyElementType(type: IntentionalElementType): type is SafetyElementType {
    return type === 'SafetyGoal' || type === 'Hazard' || type === 'SafetyTask' || type === 'SafetyResource';
  }

  private normalizeRefinementType(type: string): RefinementType {
    return type === 'OR' ? 'OR' : 'AND';
  }

  private normalizeContributionMetric(metric?: string): ContributionMetric {
    return metric === 'Make' || metric === 'Hurt' || metric === 'Break' ? metric : 'Help';
  }

  private normalizeAccidentLevel(level?: string | null): AccidentLevel {
    if (level === 'L2' || level === 'L3' || level === 'L4' || level === 'L5') {
      return level;
    }
    return 'L1';
  }

  private normalizeTraceabilityId(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private composeElementDisplayName(name: string, traceabilityId?: string): string {
    const trimmedName = name.trim();
    const traceability = this.normalizeTraceabilityId(traceabilityId);

    if (!traceability) {
      return trimmedName;
    }

    if (trimmedName.startsWith(`[${traceability}]`)) {
      return trimmedName;
    }

    return `[${traceability}] ${trimmedName}`;
  }

  private stripTraceabilityPrefix(name: string): string {
    const value = name.trim();
    return value.replace(/^\[[^\]]+\]\s*/, '').trim();
  }

  private extractTraceabilityIdFromName(name: string): string | undefined {
    const match = name.trim().match(/^\[([^\]]+)\]/);
    return match?.[1]?.trim() || undefined;
  }

  private isValidTraceabilityIdForType(traceabilityId: string, type: SafetyElementType, kind?: SafetyGoalKind): boolean {
    if (type === 'SafetyGoal') {
      // Safety Constraint: SC-xx  |  Responsibility: R-xx
      if (kind === 'Responsibility') {
        return /^R-\d{2}$/.test(traceabilityId);
      }
      return /^SC-\d{2}$/.test(traceabilityId);
    }

    if (type === 'SafetyTask') {
      return /^R-\d{2}$/.test(traceabilityId);
    }

    if (type === 'Hazard') {
      return /^(H\d+|UCA-\d{2})$/.test(traceabilityId);
    }

    if (type === 'SafetyResource') {
      return /^(R-\d{2}|SC-\d{2})$/.test(traceabilityId);
    }

    return false;
  }

  getSelectedSafetyElementProcessWarning(): string | null {
    return null;
  }

  private normalizeCoordinate(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private getCoordinateOrDefault(value: unknown, fallback: number): number {
    const normalized = this.normalizeCoordinate(value);
    return normalized ?? fallback;
  }

  getAllElements(): IntentionalElement[] {
    return [...this.standardIntentionalElements(), ...this.safetyIntentionalElements()];
  }

  getElementsByActor(actorId: string): IntentionalElement[] {
    return this.getAllElements().filter((element) => element.actorId === actorId);
  }

  getSafetyGoals(): IntentionalElement[] {
    return this.safetyIntentionalElements().filter((element) => element.type === 'SafetyGoal');
  }

  getAiAddGoalsDisabledReason(): string | null {
    return this.canAiAddGoals() ? null : 'Disabled until at least one Actor, Agent, or Role exists in the model.';
  }

  getAiAddQualityDisabledReason(): string | null {
    return this.canAiAddQuality() ? null : 'Disabled until at least one Actor exists in the model.';
  }

  getAiAddResourceDisabledReason(): string | null {
    return this.canAiAddResource() ? null : 'Disabled until at least one Actor exists in the model.';
  }

  getAiAddSafetyGoalDisabledReason(): string | null {
    return this.canAiAddSafetyGoal() ? null : 'Disabled until at least one Actor exists in the model.';
  }

  getAiAddHazardDisabledReason(): string | null {
    return this.canAiAddHazard() ? null : 'Disabled until at least one Actor and one Safety Goal exist in the model.';
  }

  getAiAddSafetyTaskDisabledReason(): string | null {
    return this.canAiAddSafetyTask() ? null : 'Disabled until at least one Actor exists in the model.';
  }

  getAiAddSafetyResourceDisabledReason(): string | null {
    return this.canAiAddSafetyResource()
      ? null
      : 'Disabled until at least one Actor and one Task, Safety Task, or Hazard exist in the model.';
  }

  getActorName(actorId: string): string {
    return this.actors().find((actor) => actor.id === actorId)?.name ?? 'Unknown Actor';
  }

  getElementName(elementId: string): string {
    const element = this.getAllElements().find((item) => item.id === elementId);
    if (!element) {
      return 'Unknown Element';
    }
    return `${element.name} (${element.type})`;
  }

  describeActorAssociations(actor: ActorDefinition): string {
    if (actor.associations.length === 0) {
      return 'None';
    }

    return actor.associations
      .map((association) => `${association.type} → ${this.getActorName(association.targetActorId)}`)
      .join(' | ');
  }

  describeInternalRelationship(relationship: InternalRelationship): string {
    if (relationship.type === 'Refinement') {
      return `${relationship.type} (${relationship.refinementType ?? 'AND'})`;
    }

    if (relationship.type === 'Contribution') {
      return `${relationship.type} (${relationship.contributionMetric ?? 'Help'})`;
    }

    return relationship.type;
  }

  onModellerLoaded(): void {
    if (this.syncPullIntervalId === null) {
      this.startModelPullSync();
    }

    this.lastPulledModelSnapshot = '';
    this.lastPushedModelSnapshot = '';
    console.info('[Step2][Push] Iframe loaded, forcing initial push');
    this.queuePushModelFromForms();
  }

  openBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  saveCurrentModel(): void {
    const frameWindow = this.modellerFrame?.nativeElement?.contentWindow as
      | {
          saveModel?: () => unknown;
          document?: Document;
        }
      | null
      | undefined;

    if (!frameWindow) {
      return;
    }

    if (typeof frameWindow.saveModel === 'function') {
      const serialized = frameWindow.saveModel();
      if (typeof serialized === 'string' && serialized.trim()) {
        const blob = new Blob([serialized], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = this.buildDownloadFileName();
        anchor.click();
        URL.revokeObjectURL(url);
      }
      return;
    }

    frameWindow.document?.getElementById('saveModelButton')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  }

  private buildDownloadFileName(): string {
    const projectName = this.sanitizeFileName(this.currentProjectName() || `project-${this.currentProjectId() ?? 'unknown'}`);
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${projectName}-pistar4safety-${timestamp}.txt`;
  }

  private sanitizeFileName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
  }

  private nextActorId(): string {
    this.actorSeq += 1;
    return `actor-${this.actorSeq}`;
  }

  private nextElementId(): string {
    this.elementSeq += 1;
    return `element-${this.elementSeq}`;
  }

  private nextRelationshipId(): string {
    this.relationshipSeq += 1;
    return `relationship-${this.relationshipSeq}`;
  }

  private nextDependencyId(): string {
    this.dependencySeq += 1;
    return `dependency-${this.dependencySeq}`;
  }

  private nextDependumId(): string {
    this.dependumSeq += 1;
    return `dependum-${this.dependumSeq}`;
  }
}
