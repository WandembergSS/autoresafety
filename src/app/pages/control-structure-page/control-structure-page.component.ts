import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';

import {
  ProjectService,
  StepThreeEntityCandidate,
  StepThreeEntityRecord,
  StepThreeEntityRole,
  StepThreeExternalSource,
  StepThreeControlActionRecord,
  StepThreeOptionalElementType,
  StepThreeOptionalElementRecord,
  StepThreeProjectUpdatePayload,
  StepThreeProjectInformation,
  StepThreeResponsibility
} from '../../services/project.service';

type EntityRole = StepThreeEntityRole;
type OptionalElementType = StepThreeOptionalElementType;

type EntityRoleControlName =
  | 'controller'
  | 'controlledProcess'
  | 'passiveEntity'
  | 'dependencyRestriction';

interface StructuralEntity {
  id: string;
  entityCandidateId?: string;
  name: string;
  roles: EntityRole[];
}

interface ControlAction {
  id: string;
  ref: string;
  action: string;
  sourceController: string;
  targetProcess: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  responsibilityId?: string;
  responsibility: string;
}

interface OptionalElement {
  id: string;
  type: OptionalElementType;
  name: string;
  source: string;
  destination: string;
  sourceEntityId?: string | null;
  sourceExternalId?: string | null;
  destinationEntityId?: string | null;
  destinationExternalId?: string | null;
  responsibilityId?: string;
  responsibility: string;
}

interface EntityRoleOption {
  role: EntityRole;
  controlName: EntityRoleControlName;
  title: string;
  description: string;
}

interface StepThreeAiDraft {
  entities?: Array<{
    name?: string;
    roles?: string[];
  }>;
  controlActions?: Array<{
    ref?: string;
    action?: string;
    sourceController?: string;
    targetProcess?: string;
    responsibility?: string;
  }>;
  optionalElements?: Array<{
    type?: string;
    name?: string;
    source?: string;
    destination?: string;
    responsibility?: string;
  }>;
}

interface StepOneSystemComponentEntry {
  id: number;
  name: string;
  description: string;
}

interface StepOneScopeUpdatePayload {
  id: number;
  lastUpdatedBy?: string;
  generalSummary?: Record<string, unknown>;
  objectives?: string;
  resources?: Array<Record<string, unknown>>;
  systemComponents?: StepOneSystemComponentEntry[];
  accidents?: Array<Record<string, unknown>>;
  hazards?: Array<Record<string, unknown>>;
  safetyConstraints?: Array<Record<string, unknown>>;
  responsibilities?: Array<Record<string, unknown>>;
  artefacts?: Array<Record<string, unknown>>;
}

interface PendingControllerApprovalOption {
  name: string;
  selected: boolean;
}

interface StepThreeAiRequestOptions {
  allowNewControllers: boolean;
  minControlActions: number;
  maxControlActions: number;
  minOptionalElements: number;
  maxOptionalElements: number;
  promptInstructions: string;
}

interface StepThreeFlatControlAction {
  id: string | number;
  controller?: string;
  action?: string;
  controlledProcess?: string;
  feedback?: string;
}

interface StepThreeFlatFeedbackLoop {
  id: string | number;
  source?: string;
  destination?: string;
  signal?: string;
  latency?: string;
}

interface StepThreeFlatResponse {
  entities?: Array<Record<string, unknown>>;
  controlActions?: StepThreeFlatControlAction[];
  feedbackLoops?: StepThreeFlatFeedbackLoop[];
}

interface SketchNode {
  id: string;
  label: string;
  kind: 'controller' | 'shared' | 'process' | 'external';
  tier: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

interface SketchNodeDraft {
  id: string;
  label: string;
  kind: SketchNode['kind'];
  tier: number;
  side?: 'left' | 'right';
  relatedLabels?: string[];
}

interface SketchTierBand {
  id: string;
  label: string;
  kind: 'controller' | 'shared' | 'process';
  y: number;
  height: number;
}

interface SketchEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  kind: 'control' | 'feedback' | 'optional';
}

interface SketchEdgeGeometry {
  id: string;
  label: string;
  path: string;
  labelX: number;
  labelY: number;
  marker: string;
  cssClass: string;
}

@Component({
  selector: 'app-control-structure-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './control-structure-page.component.html',
  styleUrl: './control-structure-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlStructurePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly aiFeedback = inject(AiFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  readonly currentProjectId = signal<number | null>(null);
  readonly isBpmnModelModalOpen = signal(false);
  readonly isLoading = signal(false);
  readonly isSavingStepThree = signal(false);
  readonly isGeneratingStepThreeAi = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly stepThreeSaveMessage = signal<string | null>(null);
  readonly stepThreeSaveError = signal<string | null>(null);
  readonly isStepThreeAiModalOpen = signal(false);
  readonly stepThreeAiConfigError = signal<string | null>(null);
  readonly isControllerApprovalModalOpen = signal(false);
  readonly isSavingPendingControllers = signal(false);
  readonly pendingControllerApprovalOptions = signal<PendingControllerApprovalOption[]>([]);

  private entitySeq = 0;
  private actionSeq = 0;
  private optionalElementSeq = 0;
  private latestStepOneScope: Record<string, unknown> | null = null;
  private pendingStepThreeAiDraft: StepThreeAiDraft | null = null;

  readonly entityCatalog = signal<string[]>([]);
  readonly responsibilitiesCatalog = signal<string[]>([]);
  readonly availableEntityRoles = signal<EntityRole[]>([]);
  readonly optionalElementTypes = signal<OptionalElementType[]>([]);
  readonly externalSources = signal<StepThreeExternalSource[]>([]);
  readonly entityCandidates = signal<StepThreeEntityCandidate[]>([]);
  readonly availableResponsibilities = signal<StepThreeResponsibility[]>([]);

  readonly formCards = [
    {
      key: 'entities',
      label: 'Entity classification',
      step: 'Step 3.1',
      title: 'Define controllers and controlled processes',
      description: 'Classify the structural entities before deriving actions or feedback paths.'
    },
    {
      key: 'control-actions',
      label: 'Control action definition',
      step: 'Step 3.2',
      title: 'Define control actions',
      description: 'Map dependums from the SD model into controller-to-process commands.'
    },
    {
      key: 'optional-elements',
      label: 'Optional structure elements',
      step: 'Steps 3.3-3.8',
      title: 'Add optional structure elements',
      description: 'Capture feedback, sensors, actuators, and other high-resolution elements only where needed.'
    }
  ];

  readonly analystPrompts = [
    'Start from the Step 1.1.5 system components and the updated SR actors, then decide which ones issue commands and which ones only react.',
    'A hierarchical component can be both a controller and a controlled process in different control relationships.',
    'If an interaction targets a passive entity, block the control action and model it as feedback or another optional element instead.',
    'Every optional structural element should remain traceable to at least one Step 1.2.4 responsibility.'
  ];

  readonly entityForm = this.fb.group({
    entityName: ['', Validators.required],
    controller: [false],
    controlledProcess: [false],
    passiveEntity: [false],
    dependencyRestriction: [false]
  });

  readonly controlActionForm = this.fb.group({
    ref: [this.formatControlActionRef(this.actionSeq + 1), Validators.required],
    action: ['', Validators.required],
    sourceController: ['', Validators.required],
    targetProcess: ['', Validators.required],
    responsibility: ['']
  });

  readonly optionalElementForm = this.fb.group({
    type: ['Feedback' as OptionalElementType, Validators.required],
    name: ['', Validators.required],
    source: ['', Validators.required],
    destination: ['', Validators.required],
    responsibility: ['', Validators.required]
  });

  readonly stepThreeAiConfigForm = this.fb.group({
    allowNewControllers: [false],
    existingControllersOnly: [true],
    minControlActions: [2, [Validators.required, Validators.min(1)]],
    maxControlActions: [4, [Validators.required, Validators.min(1)]],
    minOptionalElements: [2, [Validators.required, Validators.min(0)]],
    maxOptionalElements: [4, [Validators.required, Validators.min(0)]],
    promptInstructions: ['']
  });

  readonly passiveTargetGuidance = signal<string | null>(null);
  readonly optionalElementError = signal<string | null>(null);
  readonly editingControlActionId = signal<string | null>(null);
  readonly sketchPreviewMessage = signal<string | null>(null);

  readonly entities = signal<StructuralEntity[]>([]);
  readonly controlActions = signal<ControlAction[]>([]);
  readonly optionalElements = signal<OptionalElement[]>([]);
  readonly sketchPreviewEntities = signal<StructuralEntity[] | null>(null);
  readonly sketchPreviewControlActions = signal<ControlAction[] | null>(null);
  readonly sketchPreviewOptionalElements = signal<OptionalElement[] | null>(null);

  readonly controllerEntities = computed(() =>
    this.entities().filter((entity) => this.hasRole(entity, 'Controller'))
  );

  readonly controllableEntities = computed(() =>
    this.entities().filter(
      (entity) => this.hasRole(entity, 'Controlled Process') || this.hasRole(entity, 'Passive Entity')
    )
  );

  readonly entityRoleCount = computed(() => this.entities().length);
  readonly passiveEntityCount = computed(
    () => this.entities().filter((entity) => this.hasRole(entity, 'Passive Entity')).length
  );
  readonly optionalElementsCount = computed(() => this.optionalElements().length);

  readonly sketchCanvasWidth = 1320;
  readonly sketchEntities = computed(() => this.sketchPreviewEntities() ?? this.entities());
  readonly sketchControlActions = computed(() => this.sketchPreviewControlActions() ?? this.controlActions());
  readonly sketchOptionalElements = computed(() => this.sketchPreviewOptionalElements() ?? this.optionalElements());
  readonly isSketchPreviewActive = computed(
    () =>
      this.sketchPreviewEntities() !== null ||
      this.sketchPreviewControlActions() !== null ||
      this.sketchPreviewOptionalElements() !== null
  );

  readonly sketchNodes = computed<SketchNode[]>(() => this.buildSketchNodes());

  readonly sketchTierBands = computed<SketchTierBand[]>(() => this.buildSketchTierBands(this.sketchNodes()));

  readonly sketchEdges = computed<SketchEdge[]>(() => {
    const nodes = this.sketchNodes();
    const edges: SketchEdge[] = [];

    for (const action of this.sketchControlActions()) {
      const source = this.findNodeByName(nodes, action.sourceController, ['controller', 'shared']);
      const destination = this.findNodeByName(nodes, action.targetProcess, ['shared', 'process']);

      if (!source || !destination) {
        continue;
      }

      edges.push({
        id: `control-${action.id}`,
        fromId: source.id,
        toId: destination.id,
        label: `${action.ref}: ${action.action}`,
        kind: 'control'
      });
    }

    for (const element of this.sketchOptionalElements()) {
      const isFeedback = element.type === 'Feedback' || element.type === 'Sensor';
      const sourceKinds: Array<SketchNode['kind']> = isFeedback
        ? ['process', 'shared', 'external', 'controller']
        : ['controller', 'shared', 'process', 'external'];
      const destinationKinds: Array<SketchNode['kind']> = isFeedback
        ? ['shared', 'controller', 'process', 'external']
        : ['shared', 'process', 'controller', 'external'];

      const source = this.findNodeByName(nodes, element.source, sourceKinds);
      const destination = this.findNodeByName(nodes, element.destination, destinationKinds);

      if (!source || !destination) {
        continue;
      }

      edges.push({
        id: `optional-${element.id}`,
        fromId: source.id,
        toId: destination.id,
        label: `${element.type}: ${element.name}`,
        kind: isFeedback ? 'feedback' : 'optional'
      });
    }

    return edges;
  });

  readonly sketchEdgeGeometries = computed(() =>
    this.buildSketchEdgeGeometries(this.sketchNodes(), this.sketchEdges())
  );

  readonly sketchCanvasHeight = computed(() => {
    const nodes = this.sketchNodes();
    const bands = this.sketchTierBands();
    const lowestPoint = Math.max(
      nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0),
      bands.reduce((max, band) => Math.max(max, band.y + band.height), 0),
      560
    );
    return lowestPoint + 80;
  });

  readonly hasSketchData = computed(() =>
    this.sketchNodes().some((node) => node.kind === 'controller' || node.kind === 'shared') &&
    this.sketchNodes().some((node) => node.kind === 'process' || node.kind === 'shared')
  );

  readonly sketchHasExternalContext = computed(() =>
    this.sketchNodes().some((node) => node.kind === 'external')
  );

  readonly form1Ready = computed(() => this.entities().length > 0);
  readonly form2Ready = computed(
    () => this.controllerEntities().length > 0 && this.controllableEntities().length > 0
  );
  readonly form3Ready = computed(() => this.optionalElements().length > 0);

  readonly selectedTargetEntity = computed(() => {
    const targetName = this.controlActionForm.controls.targetProcess.value ?? '';
    return this.controllableEntities().find((entity) => entity.name === targetName);
  });

  readonly selectedOptionalType = computed(
    () => (this.optionalElementForm.controls.type.value ?? 'Feedback') as OptionalElementType
  );

  readonly entityRoleOptions = computed<EntityRoleOption[]>(() =>
    this.availableEntityRoles()
      .map((role) => this.toEntityRoleOption(role))
      .filter((option): option is EntityRoleOption => option !== null)
  );

  readonly optionalSourceOptions = computed(() => {
    const type = this.selectedOptionalType();
    if (type === 'External Input') {
      return ['External Environment'];
    }

    return this.entities().map((entity) => entity.name);
  });

  readonly optionalDestinationOptions = computed(() => {
    return this.entities().map((entity) => entity.name);
  });

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
            this.resetStepThreeState();
            this.isLoading.set(false);
            return EMPTY;
          }

          return forkJoin({
            stepThree: this.projectService.getStepThreeInformation(projectId),
            stepOne: this.projectService.getStepOneScope(projectId).pipe(
              catchError((error) => {
                console.warn(
                  'Failed to fetch Step 1 information via GET /api/projects/step_one_project_information/{id}. Entity options will be empty.',
                  error
                );
                return of(null);
              })
            )
          }).pipe(
            tap(({ stepThree, stepOne }) => {
              this.latestStepOneScope = stepOne;
              this.hydrateFromStepThreeInformation(stepThree, stepOne);
            }),
            catchError((error) => {
              console.error(
                'Failed to fetch Step 3 information via GET /api/projects/step_three_project_information/{id}',
                error
              );
              this.loadError.set('Failed to load Step 3 information for the selected project.');
              this.resetStepThreeState();
              return EMPTY;
            }),
            tap(() => this.isLoading.set(false))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  openBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  closeControllerApprovalModal(): void {
    if (this.isSavingPendingControllers()) {
      return;
    }

    this.isControllerApprovalModalOpen.set(false);
    this.pendingControllerApprovalOptions.set([]);
    this.pendingStepThreeAiDraft = null;
  }

  togglePendingController(name: string, selected: boolean): void {
    this.pendingControllerApprovalOptions.update((current) =>
      current.map((item) => (item.name === name ? { ...item, selected } : item))
    );
  }

  applyPendingControllerSelection(): void {
    const draft = this.pendingStepThreeAiDraft;
    if (!draft) {
      this.closeControllerApprovalModal();
      return;
    }

    const rejectedControllers = this.pendingControllerApprovalOptions()
      .filter((item) => !item.selected)
      .map((item) => item.name);
    const selectedControllers = this.pendingControllerApprovalOptions()
      .filter((item) => item.selected)
      .map((item) => item.name);
    const filteredDraft = this.filterDraftByRejectedControllers(draft, rejectedControllers);

    if (selectedControllers.length === 0) {
      this.pendingStepThreeAiDraft = null;
      this.pendingControllerApprovalOptions.set([]);
      this.isControllerApprovalModalOpen.set(false);
      this.applyStepThreeAiDraft(filteredDraft);
      this.stepThreeSaveMessage.set('AI proposal applied to Step 3. Rows that depended on rejected controllers were ignored.');
      this.aiFeedback.showWarning('Rejected controllers were ignored.');
      return;
    }

    const projectId = this.currentProjectId();
    if (!projectId || projectId <= 0) {
      const message = 'Missing valid project id. New Step 1 system components cannot be saved.';
      this.stepThreeSaveError.set(message);
      this.aiFeedback.showError(message);
      return;
    }

    const stepOnePayload = this.buildStepOneScopeUpdatePayload(projectId, selectedControllers);

    this.isSavingPendingControllers.set(true);
    this.projectService
      .updateStepOneScope(stepOnePayload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingPendingControllers.set(false))
      )
      .subscribe({
        next: () => {
          this.mergeApprovedControllersIntoStepOneScope(selectedControllers);

          const refreshedEntityCandidates = this.extractStepOneEntityCandidates(this.latestStepOneScope);
          this.entityCandidates.set(refreshedEntityCandidates);
          this.entityCatalog.set(refreshedEntityCandidates.map((item) => item.name));

          this.pendingStepThreeAiDraft = null;
          this.pendingControllerApprovalOptions.set([]);
          this.isControllerApprovalModalOpen.set(false);
          this.applyStepThreeAiDraft(filteredDraft);

          this.stepThreeSaveMessage.set('AI proposal applied to Step 3. Approved controllers were added to Step 1 system components.');
          if (rejectedControllers.length > 0) {
            this.aiFeedback.showPartial('Approved controllers were added to Step 1. Rows that depended on rejected controllers were ignored.');
          } else {
            this.aiFeedback.showSuccess('Approved controllers were added to Step 1 and the AI proposal was applied.');
          }
        },
        error: (error) => {
          const message = 'Failed to update Step 1 system components for the new controllers.';
          this.stepThreeSaveError.set(message);
          this.aiFeedback.showError(message);
          console.error('Failed to update Step 1 scope via POST /api/projects/step_one_project_update', error);
        }
      });
  }

  openStepThreeAiModal(): void {
    this.stepThreeAiConfigError.set(null);
    this.stepThreeAiConfigForm.reset({
      allowNewControllers: false,
      existingControllersOnly: true,
      minControlActions: 2,
      maxControlActions: 4,
      minOptionalElements: 2,
      maxOptionalElements: 4,
      promptInstructions: ''
    });
    this.isStepThreeAiModalOpen.set(true);
  }

  closeStepThreeAiModal(): void {
    if (this.isGeneratingStepThreeAi()) {
      return;
    }

    this.isStepThreeAiModalOpen.set(false);
    this.stepThreeAiConfigError.set(null);
  }

  setStepThreeAiControllerMode(mode: 'allow-new' | 'existing-only', checked: boolean): void {
    if (mode === 'allow-new') {
      this.stepThreeAiConfigForm.patchValue(
        {
          allowNewControllers: checked,
          existingControllersOnly: !checked
        },
        { emitEvent: false }
      );
    } else {
      this.stepThreeAiConfigForm.patchValue(
        {
          allowNewControllers: !checked,
          existingControllersOnly: checked
        },
        { emitEvent: false }
      );
    }

    this.stepThreeAiConfigError.set(null);
  }

  submitStepThreeAiRequest(): void {
    if (this.isGeneratingStepThreeAi()) {
      return;
    }

    if (this.stepThreeAiConfigForm.invalid) {
      this.stepThreeAiConfigForm.markAllAsTouched();
      return;
    }

    const options = this.getStepThreeAiRequestOptionsFromForm();
    if (options.minControlActions > options.maxControlActions) {
      this.stepThreeAiConfigError.set('Minimum number of control actions cannot be greater than the maximum.');
      return;
    }

    if (options.minOptionalElements > options.maxOptionalElements) {
      this.stepThreeAiConfigError.set('Minimum number of optional elements cannot be greater than the maximum.');
      return;
    }

    this.generateStepThreeWithAi(options);
  }

  generateStepThreeWithAi(options: StepThreeAiRequestOptions = this.buildDefaultStepThreeAiRequestOptions()): void {
    if (this.isGeneratingStepThreeAi()) {
      return;
    }

    if (this.entityCandidates().length === 0 || this.availableResponsibilities().length === 0) {
      this.stepThreeSaveMessage.set(null);
      this.stepThreeSaveError.set('Load the Step 3 catalogs before generating with AI.');
      return;
    }

    const question = this.buildStepThreeAiPrompt(options);
    const context = JSON.stringify(
      {
        entityCandidates: this.entityCandidates(),
        responsibilities: this.availableResponsibilities(),
        entityRoles: this.availableEntityRoles(),
        optionalElementTypes: this.optionalElementTypes(),
        externalSources: this.externalSources(),
        currentData: {
          entities: this.entities(),
          controlActions: this.controlActions(),
          optionalElements: this.optionalElements()
        }
      },
      null,
      2
    );

    this.isGeneratingStepThreeAi.set(true);
    this.stepThreeSaveMessage.set(null);
    this.stepThreeSaveError.set(null);

    this.aiAssistant
      .askWithSummary({ question, context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGeneratingStepThreeAi.set(false))
      )
      .subscribe({
        next: ({ payload, summary }) => {
          const draft = this.parseStepThreeAiDraft(payload);
          if (!draft) {
            const message = 'AI returned an invalid Step 3 payload.';
            this.stepThreeSaveError.set(message);
            this.aiFeedback.showError(message);
            return;
          }

          this.isStepThreeAiModalOpen.set(false);
          this.stepThreeAiConfigError.set(null);

          const newControllers = this.collectUnknownAiControllers(draft);
          if (!options.allowNewControllers && newControllers.length > 0) {
            const filteredDraft = this.filterDraftByRejectedControllers(draft, newControllers);
            this.applyStepThreeAiDraft(filteredDraft);
            this.stepThreeSaveMessage.set(
              'AI proposal applied to Step 3. Rows that depended on controllers outside Step 1 were ignored.'
            );
            this.aiFeedback.showPartial(
              'The AI suggested controllers outside Step 1. Related rows were ignored because the request was limited to existing controllers.'
            );
            return;
          }

          if (newControllers.length > 0) {
            this.pendingStepThreeAiDraft = draft;
            this.pendingControllerApprovalOptions.set(
              newControllers.map((name) => ({
                name,
                selected: true
              }))
            );
            this.isControllerApprovalModalOpen.set(true);
            this.stepThreeSaveMessage.set('Review the new controllers before applying the AI proposal to Step 3.');
            this.aiFeedback.showWarning(summary);
            return;
          }

          this.applyStepThreeAiDraft(draft);
          this.stepThreeSaveMessage.set('AI proposal applied to Step 3. Review and save when ready.');
          this.aiFeedback.showSummary(summary);
        },
        error: (error) => {
          const message = 'Failed to generate Step 3 content with AI.';
          this.stepThreeSaveMessage.set(null);
          this.stepThreeSaveError.set(message);
          this.aiFeedback.showError(message);
          console.error('Failed to generate Step 3 content via /api/ai/ask', error);
        }
      });
  }

  onPassiveEntityChange(checked: boolean): void {
    if (!checked) {
      return;
    }

    this.entityForm.patchValue({
      controller: false,
      controlledProcess: true,
      dependencyRestriction: false
    });
  }

  onEntityRoleChange(controlName: EntityRoleControlName, checked: boolean): void {
    if (controlName === 'passiveEntity') {
      this.onPassiveEntityChange(checked);
    }
  }

  addEntity(): void {
    const roles = this.selectedEntityRoles();

    if (this.entityForm.invalid || roles.length === 0) {
      this.entityForm.markAllAsTouched();
      return;
    }

    const entityName = (this.entityForm.controls.entityName.value ?? '').trim();
    const existing = this.entities().find((entity) => entity.name === entityName);

    if (existing) {
      this.entities.update((current) =>
        current.map((entity) =>
          entity.id === existing.id
            ? {
                ...entity,
                roles
              }
            : entity
        )
      );
    } else {
      this.entities.update((current) => [
        {
          id: `local-entity-${++this.entitySeq}`,
          name: entityName,
          roles
        },
        ...current
      ]);
    }

    this.entityForm.reset({
      entityName: '',
      controller: false,
      controlledProcess: false,
      passiveEntity: false,
      dependencyRestriction: false
    });
    this.clearSketchPreview();
  }

  addControlAction(): void {
    if (this.controlActionForm.invalid) {
      this.controlActionForm.markAllAsTouched();
      return;
    }

    const value = this.controlActionForm.getRawValue();
    const target = this.controllableEntities().find((entity) => entity.name === value.targetProcess);

    if (target && this.hasRole(target, 'Passive Entity')) {
      this.passiveTargetGuidance.set(
        `${target.name} is modeled as a Passive Entity, so this interaction must be captured as Feedback in the optional structure elements stage instead of as a control action.`
      );
      this.optionalElementForm.patchValue({
        type: 'Feedback',
        name: value.action ?? '',
        source: target.name,
        destination: value.sourceController ?? '',
        responsibility: value.responsibility ?? ''
      });
      return;
    }

    this.passiveTargetGuidance.set(null);
    const editingId = this.editingControlActionId();
    const nextControlAction: ControlAction = {
      id: editingId ?? `local-control-action-${this.actionSeq + 1}`,
      ref: value.ref ?? this.formatControlActionRef(this.actionSeq),
      action: value.action ?? 'Control action',
      sourceController: value.sourceController ?? 'Controller',
      targetProcess: value.targetProcess ?? 'Controlled process',
      responsibility: value.responsibility?.trim() || 'Responsibility linkage not yet specified'
    };

    if (editingId) {
      this.controlActions.update((current) =>
        current.map((item) => (item.id === editingId ? { ...item, ...nextControlAction } : item))
      );
    } else {
      this.controlActions.update((current) => [nextControlAction, ...current]);
      this.actionSeq += 1;
    }

    this.editingControlActionId.set(null);

    this.controlActionForm.reset({
      ref: this.formatControlActionRef(this.actionSeq + 1),
      action: '',
      sourceController: '',
      targetProcess: '',
      responsibility: ''
    });
    this.clearSketchPreview();
  }

  editControlAction(item: ControlAction): void {
    this.editingControlActionId.set(item.id);
    this.passiveTargetGuidance.set(null);
    this.controlActionForm.patchValue({
      ref: item.ref,
      action: item.action,
      sourceController: item.sourceController,
      targetProcess: item.targetProcess,
      responsibility:
        item.responsibility === 'Responsibility linkage not yet specified' ? '' : item.responsibility
    });
  }

  removeControlAction(itemId: string): void {
    const wasEditing = this.editingControlActionId() === itemId;
    this.controlActions.update((current) => current.filter((item) => item.id !== itemId));

    if (!wasEditing) {
      return;
    }

    this.editingControlActionId.set(null);
    this.passiveTargetGuidance.set(null);
    this.controlActionForm.reset({
      ref: this.formatControlActionRef(this.actionSeq + 1),
      action: '',
      sourceController: '',
      targetProcess: '',
      responsibility: ''
    });
    this.clearSketchPreview();
  }

  addOptionalElement(): void {
    this.optionalElementError.set(null);

    const value = this.optionalElementForm.getRawValue();

    if (this.responsibilitiesCatalog().length === 0) {
      this.optionalElementError.set(
        'No responsibilities were loaded from Step 1.2.4. Add responsibilities first, then select one here.'
      );
      return;
    }

    const missingRequiredFields: string[] = [];
    if (!(value.type ?? '').toString().trim()) {
      missingRequiredFields.push('type');
    }
    if (!(value.name ?? '').toString().trim()) {
      missingRequiredFields.push('name');
    }
    if (!(value.source ?? '').toString().trim()) {
      missingRequiredFields.push('source');
    }
    if (!(value.destination ?? '').toString().trim()) {
      missingRequiredFields.push('destination');
    }
    if (!(value.responsibility ?? '').toString().trim()) {
      missingRequiredFields.push('responsibility');
    }

    if (this.optionalElementForm.invalid) {
      this.optionalElementForm.markAllAsTouched();
      this.optionalElementError.set(
        `Please fill in the required fields: ${missingRequiredFields.join(', ')}.`
      );
      return;
    }

    const type = (value.type ?? 'Feedback') as OptionalElementType;
    const source = (value.source ?? '').trim();
    const destination = (value.destination ?? '').trim();
    const responsibility = (value.responsibility ?? '').trim();

    if (!this.isKnownResponsibility(responsibility)) {
      this.optionalElementError.set(
        'Associated Responsibility must match one of the responsibilities defined in Step 1.2.4.'
      );
      return;
    }

    if ((type === 'Feedback' || type === 'Actuator' || type === 'Sensor') && source === destination) {
      this.optionalElementError.set(`${type} requires distinct Source and Destination values.`);
      return;
    }

    if (type === 'External Input' && source !== 'External Environment') {
      this.optionalElementError.set('External Input must use "External Environment" as Source.');
      return;
    }

    if (type === 'External Input' && !this.isKnownEntityName(destination)) {
      this.optionalElementError.set('External Input Destination must be a Step 1 entity.');
      return;
    }

    if (type === 'External Input' && source === destination) {
      this.optionalElementError.set('External Input requires distinct Source and Destination values.');
      return;
    }

    this.optionalElementError.set(null);
    this.optionalElements.update((current) => [
      {
        id: `local-optional-element-${++this.optionalElementSeq}`,
        type,
        name: value.name ?? 'Optional element',
        source,
        destination,
        responsibility
      },
      ...current
    ]);

    this.optionalElementForm.reset({
      type: (this.optionalElementTypes()[0] ?? 'Feedback') as OptionalElementType,
      name: '',
      source: '',
      destination: '',
      responsibility: ''
    });
    this.clearSketchPreview();
  }

  updateSketchPreview(): void {
    const previewEntities = this.buildSketchPreviewEntities();
    const previewControlActions = this.buildSketchPreviewControlActions(previewEntities);
    const previewOptionalElements = this.buildSketchPreviewOptionalElements(previewEntities);

    this.sketchPreviewEntities.set(previewEntities);
    this.sketchPreviewControlActions.set(previewControlActions);
    this.sketchPreviewOptionalElements.set(previewOptionalElements);
    this.sketchPreviewMessage.set('Sketch refreshed from the current form entries.');
  }

  clearSketchPreview(): void {
    this.sketchPreviewEntities.set(null);
    this.sketchPreviewControlActions.set(null);
    this.sketchPreviewOptionalElements.set(null);
    this.sketchPreviewMessage.set(null);
  }

  saveStepThree(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId || projectId <= 0) {
      this.stepThreeSaveMessage.set(null);
      this.stepThreeSaveError.set('Missing valid project id. Step 3 cannot be saved.');
      console.warn('Missing projectId; cannot save Step 3 information.');
      return;
    }

    if (this.isSavingStepThree()) {
      return;
    }

    this.stepThreeSaveMessage.set(null);
    this.stepThreeSaveError.set(null);

    const payload: StepThreeProjectUpdatePayload = {
      id: projectId,
      step3Information: {
        entities: this.buildStepThreeEntitiesPayload(),
        controlActions: this.buildStepThreeControlActionsPayload(),
        optionalElements: this.buildStepThreeOptionalElementsPayload()
      }
    };

    this.isSavingStepThree.set(true);

    this.projectService
      .updateStepThreeInformation(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSavingStepThree.set(false))
      )
      .subscribe({
        next: (response) => {
          try {
            if (response) {
              this.hydrateFromStepThreeInformation(response, this.latestStepOneScope);
            }
          } catch (error) {
            console.warn(
              'Step 3 save succeeded, but the update response could not be rehydrated. Preserving local state before navigation.',
              error
            );
          }
          this.stepThreeSaveError.set(null);
          const successMessage = continueAfterSave
            ? 'Step 3 saved. Opening the next step.'
            : 'Step 3 saved successfully.';
          this.stepThreeSaveMessage.set(successMessage);
          this.aiFeedback.showSuccess(successMessage);

          if (continueAfterSave) {
            this.router.navigate(['/ucas'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          this.stepThreeSaveMessage.set(null);
          this.stepThreeSaveError.set(this.getStepThreeSaveErrorMessage(error));
          console.error(
            'Failed to update Step 3 information via POST /api/projects/step_three_project_update',
            error
          );
        }
      });
  }

  roleLabel(entity: StructuralEntity): string {
    return entity.roles.join(' · ');
  }

  isSelectedTargetPassive(): boolean {
    const target = this.selectedTargetEntity();
    return !!target && this.hasRole(target, 'Passive Entity');
  }

  private selectedEntityRoles(): EntityRole[] {
    const roles: EntityRole[] = [];
    const value = this.entityForm.getRawValue();

    if (value.passiveEntity) {
      return ['Controlled Process', 'Passive Entity'];
    }

    if (value.controller) {
      roles.push('Controller');
    }

    if (value.controlledProcess) {
      roles.push('Controlled Process');
    }

    if (value.dependencyRestriction) {
      roles.push('Dependency/Restriction');
    }

    return roles;
  }

  private hasRole(entity: StructuralEntity, role: EntityRole): boolean {
    return entity.roles.includes(role);
  }

  private externalSourceLabels(): string[] {
    return this.externalSources().map((item) => item.label);
  }

  private isController(name: string): boolean {
    return this.controllerEntities().some((entity) => entity.name === name);
  }

  private isControlledProcess(name: string): boolean {
    return this.entities().some(
      (entity) => entity.name === name && this.hasRole(entity, 'Controlled Process')
    );
  }

  private isKnownEntityName(name: string): boolean {
    return this.entities().some((entity) => entity.name === name);
  }

  private isKnownResponsibility(label: string): boolean {
    return this.responsibilitiesCatalog().includes(label);
  }

  private buildSketchPreviewEntities(): StructuralEntity[] {
    const preview = this.entities().map((entity) => ({
      ...entity,
      roles: [...entity.roles]
    }));
    const roles = this.selectedEntityRoles();
    const entityName = (this.entityForm.controls.entityName.value ?? '').trim();

    if (!entityName || roles.length === 0) {
      return preview;
    }

    const existingIndex = preview.findIndex((entity) => entity.name === entityName);
    const draftEntity: StructuralEntity = {
      id: existingIndex >= 0 ? preview[existingIndex].id : 'draft-sketch-entity',
      entityCandidateId: preview[existingIndex]?.entityCandidateId,
      name: entityName,
      roles
    };

    if (existingIndex >= 0) {
      preview[existingIndex] = draftEntity;
    } else {
      preview.unshift(draftEntity);
    }

    return preview;
  }

  private buildSketchPreviewControlActions(previewEntities: StructuralEntity[]): ControlAction[] {
    const preview = this.controlActions().map((item) => ({ ...item }));
    const value = this.controlActionForm.getRawValue();
    const sourceController = (value.sourceController ?? '').trim();
    const targetProcess = (value.targetProcess ?? '').trim();
    const action = (value.action ?? '').trim();
    const responsibility = (value.responsibility ?? '').trim();

    if (!sourceController || !targetProcess || !action) {
      return preview;
    }

    const targetEntity = previewEntities.find((entity) => entity.name === targetProcess);
    if (targetEntity && this.hasRole(targetEntity, 'Passive Entity')) {
      return preview;
    }

    const editingId = this.editingControlActionId();
    const draftAction: ControlAction = {
      id: editingId ?? 'draft-sketch-control-action',
      ref:
        (value.ref ?? this.formatControlActionRef(this.actionSeq + 1)).trim() ||
        this.formatControlActionRef(this.actionSeq + 1),
      action,
      sourceController,
      targetProcess,
      responsibility: responsibility || 'Responsibility linkage not yet specified'
    };

    if (editingId) {
      const existingIndex = preview.findIndex((item) => item.id === editingId);
      if (existingIndex >= 0) {
        preview[existingIndex] = { ...preview[existingIndex], ...draftAction };
        return preview;
      }
    }

    return [draftAction, ...preview.filter((item) => item.id !== draftAction.id)];
  }

  private buildSketchPreviewOptionalElements(previewEntities: StructuralEntity[]): OptionalElement[] {
    const preview = this.optionalElements().map((item) => ({ ...item }));
    const value = this.optionalElementForm.getRawValue();
    const type = (value.type ?? '').toString().trim() as OptionalElementType;
    const name = (value.name ?? '').trim();
    const source = (value.source ?? '').trim();
    const destination = (value.destination ?? '').trim();
    const responsibility = (value.responsibility ?? '').trim();

    if (!type || !name || !source || !destination) {
      return this.maybeAppendPassiveTargetRedirectPreview(preview, previewEntities);
    }

    const sourceEntity = previewEntities.find((entity) => entity.name === source);
    const destinationEntity = previewEntities.find((entity) => entity.name === destination);

    const draftOptional: OptionalElement = {
      id: 'draft-sketch-optional-element',
      type,
      name,
      source,
      destination,
      sourceEntityId: sourceEntity?.id ?? null,
      sourceExternalId: null,
      destinationEntityId: destinationEntity?.id ?? null,
      destinationExternalId: null,
      responsibility: responsibility || 'Responsibility linkage pending refinement'
    };

    return [draftOptional, ...preview.filter((item) => item.id !== draftOptional.id)];
  }

  private maybeAppendPassiveTargetRedirectPreview(
    preview: OptionalElement[],
    previewEntities: StructuralEntity[]
  ): OptionalElement[] {
    const value = this.controlActionForm.getRawValue();
    const sourceController = (value.sourceController ?? '').trim();
    const targetProcess = (value.targetProcess ?? '').trim();
    const action = (value.action ?? '').trim();

    if (!sourceController || !targetProcess || !action) {
      return preview;
    }

    const targetEntity = previewEntities.find((entity) => entity.name === targetProcess);
    if (!targetEntity || !this.hasRole(targetEntity, 'Passive Entity')) {
      return preview;
    }

    const draftOptional: OptionalElement = {
      id: 'draft-sketch-passive-feedback',
      type: 'Feedback',
      name: action,
      source: targetProcess,
      destination: sourceController,
      sourceEntityId: targetEntity.id,
      sourceExternalId: null,
      destinationEntityId: previewEntities.find((entity) => entity.name === sourceController)?.id ?? null,
      destinationExternalId: null,
      responsibility: (value.responsibility ?? '').trim() || 'Responsibility linkage pending refinement'
    };

    return [draftOptional, ...preview.filter((item) => item.id !== draftOptional.id)];
  }

  private formatControlActionRef(id: number): string {
    return `CA-${String(id).padStart(2, '0')}`;
  }

  private hydrateFromStepThreeInformation(
    response: StepThreeProjectInformation | StepThreeFlatResponse,
    stepOneScope: Record<string, unknown> | null = null
  ): void {
    const normalized = this.normalizeStepThreeInformation(response);
    const stepThreeEntityCandidates = normalized.availableInputs.entityCandidates ?? [];
    const entityCandidates = this.extractStepOneEntityCandidates(stepOneScope);
    const stepThreeResponsibilities = normalized.availableInputs.responsibilities ?? [];
    const stepOneResponsibilities = this.extractStepOneResponsibilities(stepOneScope);
    const responsibilities =
      stepOneResponsibilities.length > 0 ? stepOneResponsibilities : stepThreeResponsibilities;
    const entityMap = new Map(normalized.currentData.entities.map((entity) => [entity.id, entity]));
    const responsibilityMap = new Map(
      [...stepThreeResponsibilities, ...stepOneResponsibilities].map((item) => [item.id, item.label])
    );
    const candidateMap = new Map(
      [...stepThreeEntityCandidates, ...entityCandidates].map((item) => [item.id, item])
    );
    const externalSourceMap = new Map(
      (normalized.availableInputs.externalSources ?? []).map((item) => [item.id, item.label])
    );

    this.entityCandidates.set(entityCandidates);
    this.availableResponsibilities.set(responsibilities);
    this.entityCatalog.set(entityCandidates.map((item) => item.name));
    this.responsibilitiesCatalog.set(responsibilities.map((item) => item.label));
    this.availableEntityRoles.set(normalized.availableInputs.entityRoles ?? []);
    this.optionalElementTypes.set(normalized.availableInputs.optionalElementTypes ?? []);
    this.externalSources.set(normalized.availableInputs.externalSources ?? []);

    this.entities.set(
      (normalized.currentData.entities ?? []).map((entity) => ({
        id: entity.id,
        entityCandidateId: entity.entityCandidateId,
        name: entity.name?.trim() || candidateMap.get(entity.entityCandidateId)?.name || 'Unnamed entity',
        roles: entity.roles ?? []
      }))
    );

    this.controlActions.set(
      (normalized.currentData.controlActions ?? []).map((item) => ({
        id: item.id,
        ref: item.ref,
        action: item.action,
        sourceEntityId: item.sourceEntityId,
        targetEntityId: item.targetEntityId,
        responsibilityId: item.responsibilityId,
        sourceController: entityMap.get(item.sourceEntityId)?.name || 'Unknown controller',
        targetProcess: entityMap.get(item.targetEntityId)?.name || 'Unknown controlled process',
        responsibility: responsibilityMap.get(item.responsibilityId) || 'Responsibility linkage not yet specified'
      }))
    );

    this.optionalElements.set(
      (normalized.currentData.optionalElements ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        sourceEntityId: item.sourceEntityId,
        sourceExternalId: item.sourceExternalId,
        destinationEntityId: item.destinationEntityId,
        destinationExternalId: item.destinationExternalId,
        responsibilityId: item.responsibilityId,
        source:
          item.sourceKind === 'entity'
            ? entityMap.get(item.sourceEntityId ?? '')?.name || 'Unknown source'
            : externalSourceMap.get(item.sourceExternalId ?? '') || 'External source',
        destination:
          item.destinationKind === 'entity'
            ? entityMap.get(item.destinationEntityId ?? '')?.name || 'Unknown destination'
            : externalSourceMap.get(item.destinationExternalId ?? '') || 'External destination',
        responsibility: responsibilityMap.get(item.responsibilityId) || 'Responsibility linkage pending refinement'
      }))
    );

    this.entitySeq = this.entities().length;
    this.optionalElementSeq = this.optionalElements().length;
    this.actionSeq = this.parseControlActionRef(normalized.defaults.nextControlActionRef) - 1;

    this.controlActionForm.patchValue({
      ref: normalized.defaults.nextControlActionRef
    });

    this.optionalElementForm.patchValue({
      type: normalized.defaults.defaultOptionalElementType
    });

    this.verifyStepThreeLoad(response, normalized);
    console.info('Step 3 entity options source verification', {
      source: 'GET /api/projects/step_one_project_information/{id} -> 1.1.5 System components',
      stepOneEntityOptions: entityCandidates.length,
      ignoredStepThreeEntityCandidates: stepThreeEntityCandidates.length
    });
    console.info('Step 3 responsibility options source verification', {
      source:
        stepOneResponsibilities.length > 0
          ? 'GET /api/projects/step_one_project_information/{id} -> 1.2.4 responsibilities'
          : 'GET /api/projects/step_three_project_information/{id} -> availableInputs.responsibilities (fallback)',
      stepOneResponsibilities: stepOneResponsibilities.length,
      stepThreeResponsibilities: stepThreeResponsibilities.length,
      activeResponsibilityOptions: responsibilities.length
    });
  }

  private extractStepOneEntityCandidates(stepOneScope: Record<string, unknown> | null): StepThreeEntityCandidate[] {
    if (!stepOneScope) {
      return [];
    }

    const componentRecords = this.collectStepOneSystemComponentRecords(stepOneScope);
    const seenNames = new Set<string>();

    return componentRecords
      .map((item, index) => {
        const name = this.readTextField(item, ['name', 'component', 'componentName', 'systemComponent']).trim();
        if (!name) {
          return null;
        }

        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) {
          return null;
        }
        seenNames.add(normalizedName);

        const fallbackId = `step1-component-${index + 1}`;
        const sourceRefId = this.readTextField(item, ['id', 'code', 'reference', 'ref']) || fallbackId;

        return {
          id: fallbackId,
          name,
          sourceType: 'systemComponent',
          sourceStep: '1.1.5',
          sourceRefId
        } as StepThreeEntityCandidate;
      })
      .filter((item): item is StepThreeEntityCandidate => !!item);
  }

  private collectStepOneSystemComponentRecords(stepOneScope: Record<string, unknown>): Record<string, unknown>[] {
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
        const isSystemComponentsField =
          normalizedKey === 'systemcomponents' ||
          normalizedKey === 'components' ||
          normalizedKey.includes('115systemcomponents');

        if (isSystemComponentsField && Array.isArray(child)) {
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

  private extractStepOneResponsibilities(stepOneScope: Record<string, unknown> | null): StepThreeResponsibility[] {
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

        const fallbackId = `step1-responsibility-${index + 1}`;
        const id = this.readTextField(item, ['id']).trim() || fallbackId;
        const resolvedCode = code || `R-${String(index + 1).padStart(2, '0')}`;
        const labelBase = component ? `${component}: ${responsibilityText}` : responsibilityText;

        return {
          id,
          code: resolvedCode,
          text: responsibilityText,
          label: `${resolvedCode} - ${labelBase}`
        } as StepThreeResponsibility;
      })
      .filter((item): item is StepThreeResponsibility => !!item);
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

  private readTextField(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }

      if (typeof value === 'number') {
        return String(value);
      }
    }

    return '';
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
          nextControlActionRef: maybeNested.defaults.nextControlActionRef ?? this.formatControlActionRef(1),
          defaultOptionalElementType: maybeNested.defaults.defaultOptionalElementType ?? 'Feedback'
        }
      };
    }

    const flat = response as StepThreeFlatResponse;
    const flatControlActions = flat.controlActions ?? [];
    const flatFeedbackLoops = flat.feedbackLoops ?? [];
    const rolesByEntity = new Map<string, Set<EntityRole>>();

    for (const controlAction of flatControlActions) {
      const controller = controlAction.controller?.trim();
      const controlledProcess = controlAction.controlledProcess?.trim();

      if (controller) {
        const current = rolesByEntity.get(controller) ?? new Set<EntityRole>();
        current.add('Controller');
        rolesByEntity.set(controller, current);
      }

      if (controlledProcess) {
        const current = rolesByEntity.get(controlledProcess) ?? new Set<EntityRole>();
        current.add('Controlled Process');
        rolesByEntity.set(controlledProcess, current);
      }
    }

    const entities: StepThreeEntityRecord[] = Array.from(rolesByEntity.entries()).map(([name, roles], index) => ({
      id: `ent-${index + 1}`,
      entityCandidateId: `ent-${index + 1}`,
      name,
      roles: Array.from(roles)
    }));

    const entityIdByName = new Map(entities.map((entity) => [entity.name, entity.id]));
    const externalLabels = new Set<string>();

    for (const loop of flatFeedbackLoops) {
      const source = loop.source?.trim();
      const destination = loop.destination?.trim();

      if (source && !entityIdByName.has(source)) {
        externalLabels.add(source);
      }

      if (destination && !entityIdByName.has(destination)) {
        externalLabels.add(destination);
      }
    }

    const externalSources = Array.from(externalLabels).map((label, index) => ({
      id: `ext-${index + 1}`,
      label
    }));
    const externalIdByLabel = new Map(externalSources.map((item) => [item.label, item.id]));

    const controlActions: StepThreeControlActionRecord[] = flatControlActions.map((item, index) => ({
      id: String(item.id ?? index + 1),
      ref: this.formatControlActionRef(index + 1),
      action: item.action?.trim() || 'Unnamed action',
      sourceEntityId: entityIdByName.get(item.controller?.trim() ?? '') ?? '',
      targetEntityId: entityIdByName.get(item.controlledProcess?.trim() ?? '') ?? '',
      responsibilityId: ''
    }));

    const optionalElements: StepThreeOptionalElementRecord[] = flatFeedbackLoops.map((loop, index) => {
      const source = loop.source?.trim() ?? '';
      const destination = loop.destination?.trim() ?? '';
      const signal = loop.signal?.trim();
      const sourceEntityId = entityIdByName.get(source) ?? null;
      const destinationEntityId = entityIdByName.get(destination) ?? null;

      return {
        id: String(loop.id ?? index + 1),
        type: 'Feedback',
        name: signal || `Feedback ${index + 1}`,
        sourceKind: sourceEntityId ? 'entity' : 'external',
        sourceEntityId,
        sourceExternalId: sourceEntityId ? null : externalIdByLabel.get(source) ?? null,
        destinationKind: destinationEntityId ? 'entity' : 'external',
        destinationEntityId,
        destinationExternalId: destinationEntityId ? null : externalIdByLabel.get(destination) ?? null,
        responsibilityId: ''
      };
    });

    return {
      projectId: this.currentProjectId() ?? 0,
      step: 3,
      availableInputs: {
        entityCandidates: entities.map((item) => ({
          id: item.id,
          name: item.name,
          sourceType: 'systemComponent',
          sourceStep: '1.1.5',
          sourceRefId: item.id
        })),
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
        externalSources
      },
      currentData: {
        entities,
        controlActions,
        optionalElements
      },
      defaults: {
        nextControlActionRef: this.formatControlActionRef(controlActions.length + 1),
        defaultOptionalElementType: 'Feedback'
      }
    };
  }

  private verifyStepThreeLoad(
    rawResponse: StepThreeProjectInformation | StepThreeFlatResponse,
    normalized: StepThreeProjectInformation
  ): void {
    const nested = rawResponse as StepThreeProjectInformation;
    const flat = rawResponse as StepThreeFlatResponse;

    const apiControlActionsCount =
      nested.currentData?.controlActions?.length ??
      flat.controlActions?.length ??
      0;

    const apiFeedbackLoopsCount =
      flat.feedbackLoops?.length ?? normalized.currentData.optionalElements.filter((item) => item.type === 'Feedback').length;

    const loadedControlActionsCount = this.controlActions().length;
    const loadedFeedbackLoopsCount = this.optionalElements().filter((item) => item.type === 'Feedback').length;

    const verification = {
      api: {
        controlActions: apiControlActionsCount,
        feedbackLoops: apiFeedbackLoopsCount
      },
      loaded: {
        controlActions: loadedControlActionsCount,
        feedbackLoops: loadedFeedbackLoopsCount
      },
      matches:
        apiControlActionsCount === loadedControlActionsCount && apiFeedbackLoopsCount === loadedFeedbackLoopsCount
    };

    if (!verification.matches) {
      console.warn('Step 3 load verification mismatch (API vs loaded state)', verification);
      return;
    }

    console.info('Step 3 load verification passed (API vs loaded state)', verification);
  }

  private resetStepThreeState(): void {
    this.currentProjectId.set(null);
    this.entityCatalog.set([]);
    this.responsibilitiesCatalog.set([]);
    this.availableEntityRoles.set([]);
    this.optionalElementTypes.set([]);
    this.externalSources.set([]);
    this.entityCandidates.set([]);
    this.availableResponsibilities.set([]);
    this.entities.set([]);
    this.controlActions.set([]);
    this.optionalElements.set([]);
    this.entitySeq = 0;
    this.actionSeq = 0;
    this.optionalElementSeq = 0;
    this.passiveTargetGuidance.set(null);
    this.optionalElementError.set(null);
    this.stepThreeSaveMessage.set(null);
    this.stepThreeSaveError.set(null);
    this.isStepThreeAiModalOpen.set(false);
    this.stepThreeAiConfigError.set(null);
    this.isControllerApprovalModalOpen.set(false);
    this.isSavingPendingControllers.set(false);
    this.pendingControllerApprovalOptions.set([]);
    this.pendingStepThreeAiDraft = null;
    this.entityForm.reset({
      entityName: '',
      controller: false,
      controlledProcess: false,
      passiveEntity: false,
      dependencyRestriction: false
    });
    this.controlActionForm.reset({
      ref: this.formatControlActionRef(1),
      action: '',
      sourceController: '',
      targetProcess: '',
      responsibility: ''
    });
    this.optionalElementForm.reset({
      type: 'Feedback',
      name: '',
      source: '',
      destination: '',
      responsibility: ''
    });
  }

  private toEntityRoleOption(role: EntityRole): EntityRoleOption | null {
    const definitions: Record<EntityRole, EntityRoleOption> = {
      Controller: {
        role: 'Controller',
        controlName: 'controller',
        title: 'Controller',
        description: ''
      },
      'Controlled Process': {
        role: 'Controlled Process',
        controlName: 'controlledProcess',
        title: 'Controlled Process',
        description: ''
      },
      'Passive Entity': {
        role: 'Passive Entity',
        controlName: 'passiveEntity',
        title: 'Passive Entity',
        description:
          ''
      },
      'Dependency/Restriction': {
        role: 'Dependency/Restriction',
        controlName: 'dependencyRestriction',
        title: 'Dependency/Restriction',
        description: ''
      }
    };

    return definitions[role] ?? null;
  }

  private parseControlActionRef(ref: string | null | undefined): number {
    const match = (ref ?? '').match(/CA-(\d+)/i);
    return match ? Number(match[1]) : 1;
  }

  private buildStepThreeEntitiesPayload(): StepThreeEntityRecord[] {
    const candidateByName = new Map(this.entityCandidates().map((item) => [item.name, item]));

    return this.entities().map((entity) => ({
      id: entity.id,
      entityCandidateId: entity.entityCandidateId ?? candidateByName.get(entity.name)?.id ?? entity.id,
      name: entity.name,
      roles: entity.roles
    }));
  }

  private buildStepThreeControlActionsPayload(): StepThreeControlActionRecord[] {
    const entityIdByName = new Map(this.entities().map((entity) => [entity.name, entity.id]));
    const responsibilityIdByLabel = new Map(this.availableResponsibilities().map((item) => [item.label, item.id]));

    return this.controlActions().map((item) => ({
      id: item.id,
      ref: item.ref,
      action: item.action,
      sourceEntityId: item.sourceEntityId ?? entityIdByName.get(item.sourceController) ?? '',
      targetEntityId: item.targetEntityId ?? entityIdByName.get(item.targetProcess) ?? '',
      responsibilityId: item.responsibilityId ?? responsibilityIdByLabel.get(item.responsibility) ?? ''
    }));
  }

  private buildStepThreeOptionalElementsPayload(): StepThreeOptionalElementRecord[] {
    const entityIdByName = new Map(this.entities().map((entity) => [entity.name, entity.id]));
    const externalIdByLabel = new Map(this.externalSources().map((item) => [item.label, item.id]));
    const responsibilityIdByLabel = new Map(this.availableResponsibilities().map((item) => [item.label, item.id]));

    return this.optionalElements().map((item) => {
      const sourceEntityId = item.sourceEntityId ?? entityIdByName.get(item.source) ?? null;
      const sourceExternalId = item.sourceExternalId ?? externalIdByLabel.get(item.source) ?? null;
      const destinationEntityId = item.destinationEntityId ?? entityIdByName.get(item.destination) ?? null;
      const destinationExternalId = item.destinationExternalId ?? externalIdByLabel.get(item.destination) ?? null;

      return {
        id: item.id,
        type: item.type,
        name: item.name,
        sourceKind: sourceEntityId ? 'entity' : 'external',
        sourceEntityId,
        sourceExternalId,
        destinationKind: destinationEntityId ? 'entity' : 'external',
        destinationEntityId,
        destinationExternalId,
        responsibilityId: item.responsibilityId ?? responsibilityIdByLabel.get(item.responsibility) ?? ''
      };
    });
  }

  private getStepThreeSaveErrorMessage(error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error['status']) : undefined;

    if (status === 404) {
      return 'Project not found. The backend returned 404 while saving Step 3.';
    }

    if (status === 400) {
      return 'Failed to save Step 3. The backend rejected the step3Information payload.';
    }

    if (status && status >= 400) {
      return `Failed to save Step 3. The backend returned status ${status}.`;
    }

    return 'Failed to save Step 3 due to an unexpected error.';
  }

  private buildDefaultStepThreeAiRequestOptions(): StepThreeAiRequestOptions {
    return {
      allowNewControllers: true,
      minControlActions: 2,
      maxControlActions: 4,
      minOptionalElements: 2,
      maxOptionalElements: 4,
      promptInstructions: ''
    };
  }

  private getStepThreeAiRequestOptionsFromForm(): StepThreeAiRequestOptions {
    return {
      allowNewControllers: !!this.stepThreeAiConfigForm.controls.allowNewControllers.value,
      minControlActions: Number(this.stepThreeAiConfigForm.controls.minControlActions.value ?? 2),
      maxControlActions: Number(this.stepThreeAiConfigForm.controls.maxControlActions.value ?? 4),
      minOptionalElements: Number(this.stepThreeAiConfigForm.controls.minOptionalElements.value ?? 2),
      maxOptionalElements: Number(this.stepThreeAiConfigForm.controls.maxOptionalElements.value ?? 4),
      promptInstructions: (this.stepThreeAiConfigForm.controls.promptInstructions.value ?? '').trim()
    };
  }

  private buildStepThreeAiPrompt(options: StepThreeAiRequestOptions): string {
    const controllerStrategyInstructions = options.allowNewControllers
      ? [
          '- You may suggest a new systemComponent that acts as a controller when the existing Step 1 controllers are insufficient.',
          '- Reuse controllers from currentData and Step 1.1.5 system components whenever possible before inventing a new controller.',
          '- Every new controller must appear in the entities array with role Controller and must actually be used by at least one returned control action or optional element.'
        ].join('\n')
      : [
          '- Use only controllers that already exist in currentData or in the Step 1.1.5 system components returned through entityCandidates.',
          '- Do not invent, rename, or substitute a new controller name.',
          '- If a possible control action would require a new controller, skip that action and propose a different valid one.'
        ].join('\n');

    const additionalDirectives = options.promptInstructions
      ? `\n#### Additional directives from the analyst:\n${options.promptInstructions}`
      : '';

    return `You are extending an existing Step 3 STPA control structure draft for a safety analysis workflow.

Return JSON only. Do not include markdown fences, commentary, or explanations.

Return an object with this exact shape:
{
  "entities": [{ "name": "", "roles": ["Controller"] }],
  "controlActions": [{ "ref": "CA-01", "action": "", "sourceController": "", "targetProcess": "", "responsibility": "" }],
  "optionalElements": [{ "type": "Feedback", "name": "", "source": "", "destination": "", "responsibility": "" }]
}

#### Entity classification (Step 3.1) belongs to the analyst:
- Reuse the entities already present in currentData whenever possible, referring to them by their exact existing name.
- Never rename, re-role, or remove an existing entity.
- In the entities array, list every entity referenced by your control actions and optional elements. Include a brand-new entity (with its roles from the entityRoles catalog) only when a new control action or optional element needs a controller or process that currentData does not define yet.
${controllerStrategyInstructions}

#### Define control actions (Step 3.2) - REQUIRED:
- Add between ${options.minControlActions} and ${options.maxControlActions} NEW control actions that are not already in currentData, and keep all existing ones.
- sourceController must be an entity that has the Controller role.
- targetProcess must be an entity that has the Controlled Process role.
- Prefer responsibility labels from the provided responsibilities catalog when one fits.

#### Define optional control structure elements (Steps 3.3-3.8) - REQUIRED:
- Add between ${options.minOptionalElements} and ${options.maxOptionalElements} NEW optional elements that are not already in currentData, and keep all existing ones.
- Use the optional element type value exactly as one of the provided optionalElementTypes catalog entries.
- Do not invent labels such as Monitoring or Sensing. If you mean a monitoring or acknowledgement loop, use Feedback. If you mean sensing or sensor data, use Sensor.
- source and destination must reference an entity name or a provided external source label.
- Use feedback, sensing, actuation, or monitoring links that match the control actions.

General rules:
- Keep every existing valid control action and optional element from currentData; only add to them.
- Avoid duplicates.
- Prefer concrete, domain-specific names over placeholder text.${additionalDirectives}`;
  }

  private parseStepThreeAiDraft(response: unknown): StepThreeAiDraft | null {
    const parsed = this.parseAiJsonResponse(response);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as StepThreeAiDraft;
  }

  private applyStepThreeAiDraft(draft: StepThreeAiDraft): void {
    const availableRoles = new Set(this.availableEntityRoles());
    const optionalTypes = new Set(this.optionalElementTypes());
    const optionalTypeByKey = new Map(this.optionalElementTypes().map((item) => [item.trim().toLowerCase(), item]));
    const externalSourceByLabel = new Map(this.externalSources().map((item) => [item.label.trim().toLowerCase(), item]));
    const responsibilityByLabel = new Map(this.availableResponsibilities().map((item) => [item.label.trim().toLowerCase(), item]));

    let nextEntitySeq = this.entitySeq;
    let nextActionSeq = this.actionSeq;
    let nextOptionalSeq = this.optionalElementSeq;

    // Existing Step 3.1 entities are protected: they are never renamed, re-roled, or removed.
    // The AI button only ADDS control actions (3.2) and optional elements (3.3-3.8). A new
    // supporting entity is created only when one of those additions references a controller or
    // process the analyst has not classified yet, so the new rows stay valid and saveable.
    const mergedEntities = [...this.entities()];
    const entityByNameKey = new Map(mergedEntities.map((item) => [item.name.trim().toLowerCase(), item]));

    const aiRolesByName = new Map<string, EntityRole[]>();
    for (const item of draft.entities ?? []) {
      const name = (item.name ?? '').trim();
      if (!name) {
        continue;
      }

      const roles = Array.from(
        new Set((item.roles ?? []).filter((role): role is EntityRole => availableRoles.has(role as EntityRole)))
      );
      aiRolesByName.set(name.toLowerCase(), roles);
    }

    const ensureEntity = (rawName: string, requiredRole?: EntityRole): StructuralEntity | null => {
      const name = rawName.trim();
      const key = name.toLowerCase();
      if (!key) {
        return null;
      }

      const existing = entityByNameKey.get(key);
      if (existing) {
        // Never mutate analyst-owned entities: reject the link if the role does not already fit.
        return requiredRole && !existing.roles.includes(requiredRole) ? null : existing;
      }

      const roles = Array.from(
        new Set([...(requiredRole ? [requiredRole] : []), ...(aiRolesByName.get(key) ?? [])])
      ).filter((role): role is EntityRole => availableRoles.has(role));

      if (roles.length === 0) {
        return null;
      }

      const created: StructuralEntity = {
        id: `local-ai-entity-${++nextEntitySeq}`,
        name,
        roles
      };
      mergedEntities.push(created);
      entityByNameKey.set(key, created);
      return created;
    };

    const mergedControlActions = [...this.controlActions()];
    const controlActionKeys = new Set(
      mergedControlActions.map((item) =>
        [item.action, item.sourceController, item.targetProcess]
          .map((value) => value.trim().toLowerCase())
          .join('|')
      )
    );

    for (const item of draft.controlActions ?? []) {
      const action = (item.action ?? '').trim();
      const responsibility = (item.responsibility ?? '').trim();
      const sourceEntity = ensureEntity(item.sourceController ?? '', 'Controller');
      const targetEntity = ensureEntity(item.targetProcess ?? '', 'Controlled Process');

      if (!action || !sourceEntity || !targetEntity) {
        continue;
      }

      const actionKey = [action, sourceEntity.name, targetEntity.name]
        .map((value) => value.toLowerCase())
        .join('|');
      if (controlActionKeys.has(actionKey)) {
        continue;
      }

      mergedControlActions.push({
        id: `local-ai-control-action-${++nextActionSeq}`,
        ref: (item.ref ?? '').trim() || this.formatControlActionRef(nextActionSeq),
        action,
        sourceController: sourceEntity.name,
        targetProcess: targetEntity.name,
        sourceEntityId: sourceEntity.id,
        targetEntityId: targetEntity.id,
        responsibility: responsibility || 'Responsibility linkage not yet specified',
        responsibilityId: responsibilityByLabel.get(responsibility.toLowerCase())?.id
      });
      controlActionKeys.add(actionKey);
    }

    const mergedOptionalElements = [...this.optionalElements()];
    const optionalElementKeys = new Set(
      mergedOptionalElements.map((item) =>
        [item.type, item.name, item.source, item.destination]
          .map((value) => value.trim().toLowerCase())
          .join('|')
      )
    );

    for (const item of draft.optionalElements ?? []) {
      const type = this.normalizeOptionalElementType(item.type ?? '', optionalTypeByKey);
      const name = (item.name ?? '').trim();
      const source = (item.source ?? '').trim();
      const destination = (item.destination ?? '').trim();
      const responsibility = (item.responsibility ?? '').trim();

      if (!type || !optionalTypes.has(type) || !name || !source || !destination) {
        continue;
      }

      const sourceExternal = externalSourceByLabel.get(source.toLowerCase());
      const destinationExternal = externalSourceByLabel.get(destination.toLowerCase());
      const sourceEntity = sourceExternal ? null : ensureEntity(source);
      const destinationEntity = destinationExternal ? null : ensureEntity(destination);

      if (!sourceEntity && !sourceExternal) {
        continue;
      }

      if (!destinationEntity && !destinationExternal) {
        continue;
      }

      const resolvedSource = sourceEntity?.name ?? source;
      const resolvedDestination = destinationEntity?.name ?? destination;
      const optionalKey = [type, name, resolvedSource, resolvedDestination]
        .map((value) => value.toLowerCase())
        .join('|');
      if (optionalElementKeys.has(optionalKey)) {
        continue;
      }

      mergedOptionalElements.push({
        id: `local-ai-optional-element-${++nextOptionalSeq}`,
        type,
        name,
        source: resolvedSource,
        destination: resolvedDestination,
        sourceEntityId: sourceEntity?.id ?? null,
        sourceExternalId: sourceEntity ? null : sourceExternal?.id ?? null,
        destinationEntityId: destinationEntity?.id ?? null,
        destinationExternalId: destinationEntity ? null : destinationExternal?.id ?? null,
        responsibility: responsibility || 'Responsibility linkage pending refinement',
        responsibilityId: responsibilityByLabel.get(responsibility.toLowerCase())?.id
      });
      optionalElementKeys.add(optionalKey);
    }

    this.entities.set(mergedEntities);
    this.controlActions.set(mergedControlActions);
    this.optionalElements.set(mergedOptionalElements);
    this.entitySeq = nextEntitySeq;
    this.actionSeq = nextActionSeq;
    this.optionalElementSeq = nextOptionalSeq;
    this.controlActionForm.patchValue({
      ref: this.formatControlActionRef(this.actionSeq + 1)
    });
    if (this.optionalElementTypes().length > 0) {
      this.optionalElementForm.patchValue({ type: this.optionalElementTypes()[0] });
    }
  }

  private collectUnknownAiControllers(draft: StepThreeAiDraft): string[] {
    const knownStepOneComponents = new Set(
      this.entityCandidates()
        .filter((item) => item.sourceType === 'systemComponent')
        .map((item) => item.name.trim().toLowerCase())
    );
    const seen = new Set<string>();
    const draftRolesByName = new Map(
      (draft.entities ?? []).map((item) => [
        (item.name ?? '').trim().toLowerCase(),
        Array.from(new Set(item.roles ?? []))
      ])
    );
    const results: string[] = [];

    for (const action of draft.controlActions ?? []) {
      const controllerName = (action.sourceController ?? '').trim();
      if (!controllerName) {
        continue;
      }

      const normalized = controllerName.toLowerCase();
      if (seen.has(normalized) || knownStepOneComponents.has(normalized)) {
        continue;
      }

      const existingEntity = this.entities().find((item) => item.name.trim().toLowerCase() === normalized);
      if (existingEntity && this.hasRole(existingEntity, 'Controller')) {
        continue;
      }

      const draftRoles = draftRolesByName.get(normalized) ?? [];
      if (!draftRoles.includes('Controller')) {
        continue;
      }

      seen.add(normalized);
      results.push(controllerName);
    }

    return results;
  }

  private normalizeOptionalElementType(
    rawType: string,
    optionalTypeByKey: Map<string, OptionalElementType>
  ): OptionalElementType | null {
    const normalized = rawType.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const exact = optionalTypeByKey.get(normalized);
    if (exact) {
      return exact;
    }

    if (normalized.includes('monitor')) {
      return optionalTypeByKey.get('feedback') ?? null;
    }

    if (normalized.includes('sens')) {
      return optionalTypeByKey.get('sensor') ?? null;
    }

    if (normalized.includes('actuat')) {
      return optionalTypeByKey.get('actuator') ?? null;
    }

    if (normalized.includes('algorithm') || normalized.includes('logic')) {
      return optionalTypeByKey.get('control algorithm') ?? null;
    }

    if (normalized.includes('model')) {
      return optionalTypeByKey.get('process model') ?? null;
    }

    if (normalized.includes('external') || normalized.includes('input')) {
      return optionalTypeByKey.get('external input') ?? null;
    }

    return null;
  }

  private filterDraftByRejectedControllers(draft: StepThreeAiDraft, rejectedControllers: string[]): StepThreeAiDraft {
    if (rejectedControllers.length === 0) {
      return draft;
    }

    const rejectedKeys = new Set(rejectedControllers.map((item) => item.trim().toLowerCase()));
    const isRejectedControllerName = (value: string | null | undefined): boolean =>
      rejectedKeys.has((value ?? '').trim().toLowerCase());

    const filteredControlActions = (draft.controlActions ?? []).filter(
      (item) =>
        !isRejectedControllerName(item.sourceController) && !isRejectedControllerName(item.targetProcess)
    );

    const filteredOptionalElements = (draft.optionalElements ?? []).filter((item) => {
      const source = (item.source ?? '').trim().toLowerCase();
      const destination = (item.destination ?? '').trim().toLowerCase();
      return !rejectedKeys.has(source) && !rejectedKeys.has(destination);
    });

    const referencedNames = new Set<string>();
    for (const item of filteredControlActions) {
      const sourceController = (item.sourceController ?? '').trim().toLowerCase();
      const targetProcess = (item.targetProcess ?? '').trim().toLowerCase();
      if (sourceController) {
        referencedNames.add(sourceController);
      }
      if (targetProcess) {
        referencedNames.add(targetProcess);
      }
    }

    for (const item of filteredOptionalElements) {
      const source = (item.source ?? '').trim().toLowerCase();
      const destination = (item.destination ?? '').trim().toLowerCase();
      if (source) {
        referencedNames.add(source);
      }
      if (destination) {
        referencedNames.add(destination);
      }
    }

    const filteredEntities = (draft.entities ?? []).filter((item) => {
      const name = (item.name ?? '').trim().toLowerCase();
      if (rejectedKeys.has(name)) {
        return false;
      }

      return !name || referencedNames.has(name) || this.isKnownEntityName(item.name ?? '');
    });

    return {
      entities: filteredEntities,
      controlActions: filteredControlActions,
      optionalElements: filteredOptionalElements
    };
  }

  private buildStepOneScopeUpdatePayload(projectId: number, approvedControllerNames: string[]): StepOneScopeUpdatePayload {
    const scope = this.cloneRecord(this.latestStepOneScope ?? {}) as unknown as StepOneScopeUpdatePayload;
    scope.id = projectId;

    const existingComponents = this.collectStepOneSystemComponentRecords(this.latestStepOneScope ?? {}).map((item, index) => ({
      id: this.readNumericField(item, ['id']) ?? index + 1,
      name: this.readTextField(item, ['name', 'component', 'componentName', 'systemComponent']).trim(),
      description: this.readTextField(item, ['description', 'details', 'summary']).trim()
    }));
    const existingKeys = new Set(existingComponents.map((item) => item.name.trim().toLowerCase()));
    let nextId = existingComponents.reduce((max, item) => Math.max(max, item.id), 0);

    for (const name of approvedControllerNames) {
      const normalized = name.trim().toLowerCase();
      if (!normalized || existingKeys.has(normalized)) {
        continue;
      }

      nextId += 1;
      existingComponents.push({
        id: nextId,
        name,
        description: 'Added from Step 3 AI-proposed controller'
      });
      existingKeys.add(normalized);
    }

    scope.systemComponents = existingComponents;
    return scope;
  }

  private mergeApprovedControllersIntoStepOneScope(approvedControllerNames: string[]): void {
    const scope = this.cloneRecord(this.latestStepOneScope ?? {}) as Record<string, unknown>;
    const existingComponents = this.collectStepOneSystemComponentRecords(scope).map((item, index) => ({
      id: this.readNumericField(item, ['id']) ?? index + 1,
      name: this.readTextField(item, ['name', 'component', 'componentName', 'systemComponent']).trim(),
      description: this.readTextField(item, ['description', 'details', 'summary']).trim()
    }));
    const existingKeys = new Set(existingComponents.map((item) => item.name.trim().toLowerCase()));
    let nextId = existingComponents.reduce((max, item) => Math.max(max, item.id), 0);

    for (const name of approvedControllerNames) {
      const normalized = name.trim().toLowerCase();
      if (!normalized || existingKeys.has(normalized)) {
        continue;
      }

      nextId += 1;
      existingComponents.push({
        id: nextId,
        name,
        description: 'Added from Step 3 AI-proposed controller'
      });
      existingKeys.add(normalized);
    }

    scope['systemComponents'] = existingComponents;
    this.latestStepOneScope = scope;
  }

  private cloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private readNumericField(record: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return null;
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

  private uniqueNames(items: string[]): string[] {
    const seen = new Set<string>();
    const values: string[] = [];

    for (const item of items) {
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      values.push(normalized);
    }

    return values;
  }

  private buildSketchNodes(): SketchNode[] {
    const relevantEntities = this.sketchEntities().filter(
      (entity) =>
        this.hasRole(entity, 'Controller') ||
        this.hasRole(entity, 'Controlled Process') ||
        this.hasRole(entity, 'Passive Entity')
    );

    if (relevantEntities.length === 0) {
      return [];
    }

    const entityByKey = new Map(
      relevantEntities.map((entity) => [entity.name.trim().toLowerCase(), entity])
    );
    const incomingControlSources = new Map<string, string[]>();

    for (const action of this.sketchControlActions()) {
      const sourceKey = action.sourceController.trim().toLowerCase();
      const targetKey = action.targetProcess.trim().toLowerCase();

      if (!entityByKey.has(sourceKey) || !entityByKey.has(targetKey)) {
        continue;
      }

      const currentSources = incomingControlSources.get(targetKey) ?? [];
      if (!currentSources.includes(sourceKey)) {
        currentSources.push(sourceKey);
        incomingControlSources.set(targetKey, currentSources);
      }
    }

    const tierCache = new Map<string, number>();
    const resolveTier = (entityKey: string, stack = new Set<string>()): number => {
      if (tierCache.has(entityKey)) {
        return tierCache.get(entityKey) ?? 0;
      }

      if (stack.has(entityKey)) {
        return 0;
      }

      stack.add(entityKey);

      const incoming = (incomingControlSources.get(entityKey) ?? []).filter((sourceKey) => {
        const sourceEntity = entityByKey.get(sourceKey);
        return !!sourceEntity && this.hasRole(sourceEntity, 'Controller');
      });

      const tier =
        incoming.length === 0
          ? 0
          : 1 + Math.max(...incoming.map((sourceKey) => resolveTier(sourceKey, new Set(stack))));

      stack.delete(entityKey);
      tierCache.set(entityKey, tier);
      return tier;
    };

    const internalDrafts: SketchNodeDraft[] = relevantEntities.map((entity) => {
      const entityKey = entity.name.trim().toLowerCase();
      const isController = this.hasRole(entity, 'Controller');
      const isProcess =
        this.hasRole(entity, 'Controlled Process') || this.hasRole(entity, 'Passive Entity');

      const kind: SketchNode['kind'] = isController && isProcess
        ? 'shared'
        : isController
          ? 'controller'
          : 'process';

      let tier = 0;

      if (kind === 'controller' || kind === 'shared') {
        tier = resolveTier(entityKey);
      } else {
        const incoming = incomingControlSources.get(entityKey) ?? [];
        tier = incoming.length > 0
          ? Math.max(...incoming.map((sourceKey) => resolveTier(sourceKey))) + 1
          : 1;
      }

      return {
        id: entity.id,
        label: entity.name,
        kind,
        tier
      };
    });

    const uniqueTiers = Array.from(new Set(internalDrafts.map((item) => item.tier))).sort((a, b) => a - b);
    const yByTier = new Map(uniqueTiers.map((tier, index) => [tier, 96 + index * 160]));

    const internalNodes = uniqueTiers.flatMap((tier) => {
      const tierDrafts = internalDrafts
        .filter((item) => item.tier === tier)
        .sort((left, right) => {
          const kindDiff = this.sketchKindRank(left.kind) - this.sketchKindRank(right.kind);
          return kindDiff !== 0 ? kindDiff : left.label.localeCompare(right.label);
        });

      return this.layoutTierNodes(tierDrafts, yByTier.get(tier) ?? 96, 200, 1060);
    });

    const internalNodeByLabel = new Map(
      internalNodes.map((node) => [node.label.trim().toLowerCase(), node])
    );
    const externalDrafts = this.buildExternalSketchNodeDrafts(internalNodeByLabel);
    const leftExternalDrafts = externalDrafts.filter((item) => item.side === 'left');
    const rightExternalDrafts = externalDrafts.filter((item) => item.side !== 'left');

    const externalNodes = [
      ...this.layoutExternalNodes(leftExternalDrafts, 'left', internalNodeByLabel),
      ...this.layoutExternalNodes(rightExternalDrafts, 'right', internalNodeByLabel)
    ];

    return [...internalNodes, ...externalNodes];
  }

  private sketchKindRank(kind: SketchNode['kind']): number {
    switch (kind) {
      case 'controller':
        return 0;
      case 'shared':
        return 1;
      case 'process':
        return 2;
      case 'external':
        return 3;
    }
  }

  private layoutTierNodes(
    drafts: SketchNodeDraft[],
    y: number,
    minX: number,
    maxX: number
  ): SketchNode[] {
    if (drafts.length === 0) {
      return [];
    }

    const nodes = drafts.map((draft) => {
      const lines = this.wrapSketchLabel(draft.label, draft.kind === 'process' ? 19 : 17);
      const width = draft.kind === 'process' ? 270 : draft.kind === 'shared' ? 260 : 245;
      const height = Math.max(draft.kind === 'shared' ? 102 : 92, 44 + lines.length * 20);

      return {
        ...draft,
        x: 0,
        y,
        width,
        height,
        lines
      } satisfies SketchNode;
    });

    const gap = 34;
    const totalWidth =
      nodes.reduce((sum, node) => sum + node.width, 0) + Math.max(0, nodes.length - 1) * gap;
    const availableWidth = maxX - minX;
    let cursorX = minX + Math.max(0, (availableWidth - totalWidth) / 2);

    return nodes.map((node) => {
      const positioned = {
        ...node,
        x: cursorX
      };
      cursorX += node.width + gap;
      return positioned;
    });
  }

  private buildExternalSketchNodeDrafts(
    internalNodeByLabel: Map<string, SketchNode>
  ): SketchNodeDraft[] {
    const stats = new Map<
      string,
      { label: string; asSourceCount: number; asDestinationCount: number; relatedLabels: string[] }
    >();

    for (const element of this.sketchOptionalElements()) {
      const sourceKey = element.source.trim().toLowerCase();
      const destinationKey = element.destination.trim().toLowerCase();
      const sourceIsInternal = internalNodeByLabel.has(sourceKey);
      const destinationIsInternal = internalNodeByLabel.has(destinationKey);

      if (!sourceIsInternal && sourceKey) {
        const entry = stats.get(sourceKey) ?? {
          label: element.source.trim(),
          asSourceCount: 0,
          asDestinationCount: 0,
          relatedLabels: []
        };
        entry.asSourceCount += 1;
        if (destinationIsInternal) {
          entry.relatedLabels.push(element.destination.trim());
        }
        stats.set(sourceKey, entry);
      }

      if (!destinationIsInternal && destinationKey) {
        const entry = stats.get(destinationKey) ?? {
          label: element.destination.trim(),
          asSourceCount: 0,
          asDestinationCount: 0,
          relatedLabels: []
        };
        entry.asDestinationCount += 1;
        if (sourceIsInternal) {
          entry.relatedLabels.push(element.source.trim());
        }
        stats.set(destinationKey, entry);
      }
    }

    return Array.from(stats.entries()).map(([key, value], index) => {
      const side = value.asSourceCount >= value.asDestinationCount ? 'left' : 'right';
      const relatedTiers = this.uniqueNames(value.relatedLabels)
        .map((label) => internalNodeByLabel.get(label.toLowerCase())?.tier)
        .filter((tier): tier is number => typeof tier === 'number');
      const tier =
        relatedTiers.length > 0
          ? Math.round(relatedTiers.reduce((sum, item) => sum + item, 0) / relatedTiers.length)
          : index;

      return {
        id: `external-${index + 1}`,
        label: value.label,
        kind: 'external' as const,
        tier,
        side,
        relatedLabels: this.uniqueNames(value.relatedLabels)
      };
    });
  }

  private layoutExternalNodes(
    drafts: SketchNodeDraft[],
    side: 'left' | 'right',
    internalNodeByLabel: Map<string, SketchNode>
  ): SketchNode[] {
    if (drafts.length === 0) {
      return [];
    }

    const orderedDrafts = [...drafts].sort((left, right) => {
      if (left.tier !== right.tier) {
        return left.tier - right.tier;
      }

      return left.label.localeCompare(right.label);
    });

    const x = side === 'left' ? 32 : this.sketchCanvasWidth - 232;
    let cursorY = 112;

    return orderedDrafts.map((draft) => {
      const lines = this.wrapSketchLabel(draft.label, 16);
      const width = 200;
      const height = Math.max(86, 42 + lines.length * 18);
      const relatedNodes = (draft.relatedLabels ?? [])
        .map((label) => internalNodeByLabel.get(label.toLowerCase()))
        .filter((node): node is SketchNode => !!node);
      const preferredY =
        relatedNodes.length > 0
          ? relatedNodes.reduce((sum, node) => sum + node.y + node.height / 2, 0) / relatedNodes.length -
            height / 2
          : cursorY;
      const y = Math.max(cursorY, preferredY);

      cursorY = y + height + 26;

      return {
        id: draft.id,
        label: draft.label,
        kind: 'external',
        tier: draft.tier,
        x,
        y,
        width,
        height,
        lines
      };
    });
  }

  private buildSketchTierBands(nodes: SketchNode[]): SketchTierBand[] {
    const internalNodes = nodes.filter((node) => node.kind !== 'external');
    const tiers = Array.from(new Set(internalNodes.map((node) => node.tier))).sort((a, b) => a - b);

    return tiers.map((tier) => {
      const tierNodes = internalNodes.filter((node) => node.tier === tier);
      const y = Math.min(...tierNodes.map((node) => node.y)) - 28;
      const height = Math.max(...tierNodes.map((node) => node.y + node.height)) - y + 28;
      const kind: SketchTierBand['kind'] = tierNodes.some((node) => node.kind === 'shared')
        ? 'shared'
        : tierNodes.some((node) => node.kind === 'process')
          ? 'process'
          : 'controller';

      return {
        id: `tier-${tier}`,
        label: this.describeSketchTier(kind, tier, tiers.length),
        kind,
        y,
        height
      };
    });
  }

  private describeSketchTier(
    kind: SketchTierBand['kind'],
    tier: number,
    totalTiers: number
  ): string {
    if (kind === 'shared') {
      return 'Controller / controlled process';
    }

    if (kind === 'process') {
      return totalTiers > 1 ? 'Controlled processes' : 'Controlled process';
    }

    return tier === 0 ? 'High-level controllers' : 'Supervisory controllers';
  }

  private wrapSketchLabel(label: string, maxLineLength: number, maxLines = 3): string[] {
    const words = label.trim().split(/\s+/).filter((word) => word.length > 0);

    if (words.length === 0) {
      return [label];
    }

    const lines: string[] = [];
    let currentLine = '';
    let wordIndex = 0;

    while (wordIndex < words.length) {
      const word = words[wordIndex];
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (candidate.length <= maxLineLength || !currentLine) {
        currentLine = candidate;
        wordIndex += 1;
        continue;
      }

      lines.push(currentLine);
      currentLine = '';

      if (lines.length === maxLines - 1) {
        break;
      }
    }

    const remainingWords = currentLine
      ? [currentLine, ...words.slice(wordIndex)]
      : words.slice(wordIndex);
    if (remainingWords.length > 0) {
      let finalLine = remainingWords.join(' ');
      if (finalLine.length > maxLineLength) {
        finalLine = `${finalLine.slice(0, Math.max(0, maxLineLength - 3)).trimEnd()}...`;
      }
      lines.push(finalLine);
    }

    return lines.slice(0, maxLines);
  }

  private findNodeByName(
    nodes: SketchNode[],
    label: string,
    preferredKinds: Array<SketchNode['kind']>
  ): SketchNode | null {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel) {
      return null;
    }

    for (const kind of preferredKinds) {
      const node = nodes.find(
        (candidate) => candidate.kind === kind && candidate.label.toLowerCase() === normalizedLabel
      );
      if (node) {
        return node;
      }
    }

    return null;
  }

  private buildSketchEdgeGeometries(nodes: SketchNode[], edges: SketchEdge[]): SketchEdgeGeometry[] {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const samePathOffsetCount = new Map<string, number>();

    return edges
      .map((edge) => {
        const source = nodeMap.get(edge.fromId);
        const destination = nodeMap.get(edge.toId);

        if (!source || !destination) {
          return null;
        }

        const pairKey = `${edge.fromId}->${edge.toId}:${edge.kind}`;
        const pairIndex = samePathOffsetCount.get(pairKey) ?? 0;
        samePathOffsetCount.set(pairKey, pairIndex + 1);

        const lateralOffset =
          edge.kind === 'control' ? -26 - pairIndex * 10 : edge.kind === 'feedback' ? 26 + pairIndex * 10 : pairIndex * 12;

        const verticalRelation =
          destination.y > source.y + source.height
            ? 'down'
            : destination.y + destination.height < source.y
              ? 'up'
              : 'same';

        let path = '';
        let labelX = 0;
        let labelY = 0;

        if (verticalRelation === 'down') {
          const startX = source.x + source.width / 2 + lateralOffset;
          const startY = source.y + source.height;
          const endX = destination.x + destination.width / 2 + lateralOffset;
          const endY = destination.y;
          const midY = (startY + endY) / 2;

          path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
          labelX = startX === endX ? startX + 44 : (startX + endX) / 2;
          labelY = midY - 10;
        } else if (verticalRelation === 'up') {
          const startX = source.x + source.width / 2 + lateralOffset;
          const startY = source.y;
          const endX = destination.x + destination.width / 2 + lateralOffset;
          const endY = destination.y + destination.height;
          const midY = (startY + endY) / 2;

          path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
          labelX = startX === endX ? startX + 44 : (startX + endX) / 2;
          labelY = midY - 12;
        } else {
          const destinationIsRight = destination.x >= source.x;
          const startX = destinationIsRight ? source.x + source.width : source.x;
          const endX = destinationIsRight ? destination.x : destination.x + destination.width;
          const startY = source.y + source.height / 2 + (edge.kind === 'feedback' ? -12 : 12);
          const endY = destination.y + destination.height / 2 + (edge.kind === 'feedback' ? -12 : 12);
          const direction = destinationIsRight ? 1 : -1;
          const bendY = Math.min(startY, endY) - 36 - pairIndex * 14;
          const entryOffset = 26 * direction;

          path = `M ${startX} ${startY} L ${startX + entryOffset} ${startY} L ${startX + entryOffset} ${bendY} L ${endX - entryOffset} ${bendY} L ${endX - entryOffset} ${endY} L ${endX} ${endY}`;
          labelX = (startX + endX) / 2;
          labelY = bendY - 8;
        }

        const marker =
          edge.kind === 'control'
            ? 'url(#arrow-control)'
            : edge.kind === 'feedback'
              ? 'url(#arrow-feedback)'
              : 'url(#arrow-optional)';

        return {
          id: edge.id,
          label: edge.label,
          path,
          labelX,
          labelY,
          marker,
          cssClass: `edge edge--${edge.kind}`
        } as SketchEdgeGeometry;
      })
      .filter((item): item is SketchEdgeGeometry => !!item);
  }
}
