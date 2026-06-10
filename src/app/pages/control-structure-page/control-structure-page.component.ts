import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { AiAssistantService } from '../../services/ai-assistant.service';

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
  kind: 'controller' | 'process' | 'external';
  x: number;
  y: number;
  width: number;
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
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  private readonly destroyRef = inject(DestroyRef);
  readonly currentProjectId = signal<number | null>(null);
  readonly isBpmnModelModalOpen = signal(false);
  readonly isLoading = signal(false);
  readonly isSavingStepThree = signal(false);
  readonly isGeneratingStepThreeAi = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly stepThreeSaveMessage = signal<string | null>(null);
  readonly stepThreeSaveError = signal<string | null>(null);

  private entitySeq = 0;
  private actionSeq = 0;
  private optionalElementSeq = 0;
  private latestStepOneScope: Record<string, unknown> | null = null;

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

  readonly passiveTargetGuidance = signal<string | null>(null);
  readonly optionalElementError = signal<string | null>(null);
  readonly editingControlActionId = signal<string | null>(null);

  readonly entities = signal<StructuralEntity[]>([]);
  readonly controlActions = signal<ControlAction[]>([]);
  readonly optionalElements = signal<OptionalElement[]>([]);

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

  readonly sketchCanvasWidth = 1020;

  readonly sketchNodes = computed<SketchNode[]>(() => {
    const controllerNames = this.uniqueNames(this.controllerEntities().map((entity) => entity.name));
    const processNames = this.uniqueNames(this.controllableEntities().map((entity) => entity.name));

    const controllerNodes = this.layoutNodes(controllerNames, 'controller', 170, 920, 60);
    const processNodes = this.layoutNodes(processNames, 'process', 170, 920, 395);

    const knownNames = new Set([...controllerNames, ...processNames].map((name) => name.toLowerCase()));
    const externalNames = this.uniqueNames(
      this.optionalElements()
        .flatMap((item) => [item.source, item.destination])
        .filter((name) => !!name)
        .map((name) => name.trim())
        .filter((name) => !knownNames.has(name.toLowerCase()))
    ).slice(0, 3);

    const externalNodes = externalNames.map((name, index) => ({
      id: `ext-${index + 1}`,
      label: name,
      kind: 'external' as const,
      x: 760,
      y: 165 + index * 95,
      width: 210,
      height: 68
    }));

    return [...controllerNodes, ...processNodes, ...externalNodes];
  });

  readonly sketchEdges = computed<SketchEdge[]>(() => {
    const nodes = this.sketchNodes();
    const edges: SketchEdge[] = [];

    for (const action of this.controlActions()) {
      const source = this.findNodeByName(nodes, action.sourceController, ['controller']);
      const destination = this.findNodeByName(nodes, action.targetProcess, ['process']);

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

    for (const element of this.optionalElements()) {
      const isFeedback = element.type === 'Feedback' || element.type === 'Sensor';
      const sourceKinds: Array<SketchNode['kind']> = isFeedback
        ? ['process', 'external', 'controller']
        : ['controller', 'process', 'external'];
      const destinationKinds: Array<SketchNode['kind']> = isFeedback
        ? ['controller', 'process', 'external']
        : ['process', 'controller', 'external'];

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
    const lowestPoint = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 530);
    return lowestPoint + 70;
  });

  readonly hasSketchData = computed(() =>
    this.sketchNodes().some((node) => node.kind === 'controller') &&
    this.sketchNodes().some((node) => node.kind === 'process')
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

  generateStepThreeWithAi(): void {
    if (this.isGeneratingStepThreeAi()) {
      return;
    }

    if (this.entityCandidates().length === 0 || this.availableResponsibilities().length === 0) {
      this.stepThreeSaveMessage.set(null);
      this.stepThreeSaveError.set('Load the Step 3 catalogs before generating with AI.');
      return;
    }

    const question = this.buildStepThreeAiPrompt();
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
      .ask({ question, context })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isGeneratingStepThreeAi.set(false))
      )
      .subscribe({
        next: (response) => {
          const draft = this.parseStepThreeAiDraft(response);
          if (!draft) {
            this.stepThreeSaveError.set('AI returned an invalid Step 3 payload.');
            return;
          }

          this.applyStepThreeAiDraft(draft);
          this.stepThreeSaveMessage.set('AI proposal applied to Step 3. Review and save when ready.');
        },
        error: (error) => {
          this.stepThreeSaveMessage.set(null);
          this.stepThreeSaveError.set('Failed to generate Step 3 content with AI.');
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
          this.stepThreeSaveMessage.set(
            continueAfterSave ? 'Step 3 saved. Opening the next step.' : 'Step 3 saved successfully.'
          );

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

  private buildStepThreeAiPrompt(): string {
    return `You are generating a complete Step 3 STPA control structure draft for a safety analysis workflow.

Return JSON only. Do not include markdown fences, commentary, or explanations.

Return an object with this exact shape:
{
  "entities": [{ "name": "", "roles": ["Controller"] }],
  "controlActions": [{ "ref": "CA-01", "action": "", "sourceController": "", "targetProcess": "", "responsibility": "" }],
  "optionalElements": [{ "type": "Feedback", "name": "", "source": "", "destination": "", "responsibility": "" }]
}

Rules:
- Use only roles from the provided Step 3 entityRoles catalog.
- Use entity names from the provided entityCandidates when possible.
- Use only responsibility labels from the provided responsibilities catalog.
- Use only optional element types from the provided optionalElementTypes catalog.
- sourceController must reference an entity with role Controller.
- targetProcess must reference an entity with role Controlled Process.
- Optional element source and destination must reference either generated entity names or provided external source labels.
- Preserve valid existing currentData when possible and fill missing sections so the page is meaningfully populated.
- Avoid duplicates.
- Prefer a concise but complete draft over placeholder text.`;
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
    const responsibilityLabels = new Set(this.availableResponsibilities().map((item) => item.label));
    const optionalTypes = new Set(this.optionalElementTypes());
    const externalLabels = new Set(this.externalSources().map((item) => item.label));
    const existingEntityIdByName = new Map(this.entities().map((item) => [item.name.trim().toLowerCase(), item.id]));

    let nextEntitySeq = this.entitySeq;
    const normalizedEntities = (draft.entities ?? [])
      .map((item) => {
        const name = (item.name ?? '').trim();
        const roles = (item.roles ?? []).filter((role): role is EntityRole => availableRoles.has(role as EntityRole));
        if (!name || roles.length === 0) {
          return null;
        }

        const normalizedKey = name.toLowerCase();
        const existingId = existingEntityIdByName.get(normalizedKey);
        return {
          id: existingId ?? `local-ai-entity-${++nextEntitySeq}`,
          name,
          roles: Array.from(new Set(roles))
        } as StructuralEntity;
      })
      .filter((item): item is StructuralEntity => !!item)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase()) === index);

    const entityByName = new Map(normalizedEntities.map((item) => [item.name, item]));

    let nextActionSeq = 0;
    const normalizedActions = (draft.controlActions ?? [])
      .map((item) => {
        const action = (item.action ?? '').trim();
        const sourceController = (item.sourceController ?? '').trim();
        const targetProcess = (item.targetProcess ?? '').trim();
        const responsibility = (item.responsibility ?? '').trim();
        const sourceEntity = entityByName.get(sourceController);
        const targetEntity = entityByName.get(targetProcess);

        if (
          !action ||
          !sourceEntity ||
          !targetEntity ||
          !sourceEntity.roles.includes('Controller') ||
          !targetEntity.roles.includes('Controlled Process') ||
          !responsibilityLabels.has(responsibility)
        ) {
          return null;
        }

        nextActionSeq += 1;
        return {
          id: `local-ai-control-action-${nextActionSeq}`,
          ref: this.formatControlActionRef(nextActionSeq),
          action,
          sourceController,
          targetProcess,
          sourceEntityId: sourceEntity.id,
          targetEntityId: targetEntity.id,
          responsibility,
          responsibilityId: this.availableResponsibilities().find((entry) => entry.label === responsibility)?.id
        } as ControlAction;
      })
      .filter((item): item is ControlAction => !!item);

    let nextOptionalSeq = 0;
    const normalizedOptionalElements = (draft.optionalElements ?? [])
      .map((item) => {
        const type = (item.type ?? '').trim() as OptionalElementType;
        const name = (item.name ?? '').trim();
        const source = (item.source ?? '').trim();
        const destination = (item.destination ?? '').trim();
        const responsibility = (item.responsibility ?? '').trim();

        if (!optionalTypes.has(type) || !name || !source || !destination || !responsibilityLabels.has(responsibility)) {
          return null;
        }

        const sourceEntity = entityByName.get(source);
        const destinationEntity = entityByName.get(destination);
        if (!sourceEntity && !externalLabels.has(source)) {
          return null;
        }

        if (!destinationEntity && !externalLabels.has(destination)) {
          return null;
        }

        nextOptionalSeq += 1;
        return {
          id: `local-ai-optional-element-${nextOptionalSeq}`,
          type,
          name,
          source,
          destination,
          sourceEntityId: sourceEntity?.id ?? null,
          sourceExternalId: sourceEntity ? null : this.externalSources().find((entry) => entry.label === source)?.id ?? null,
          destinationEntityId: destinationEntity?.id ?? null,
          destinationExternalId: destinationEntity ? null : this.externalSources().find((entry) => entry.label === destination)?.id ?? null,
          responsibility,
          responsibilityId: this.availableResponsibilities().find((entry) => entry.label === responsibility)?.id
        } as OptionalElement;
      })
      .filter((item): item is OptionalElement => !!item);

    this.entities.set(normalizedEntities);
    this.controlActions.set(normalizedActions);
    this.optionalElements.set(normalizedOptionalElements);
    this.entitySeq = normalizedEntities.length;
    this.actionSeq = normalizedActions.length;
    this.optionalElementSeq = normalizedOptionalElements.length;
    this.controlActionForm.patchValue({
      ref: this.formatControlActionRef(this.actionSeq + 1)
    });
    if (this.optionalElementTypes().length > 0) {
      this.optionalElementForm.patchValue({ type: this.optionalElementTypes()[0] });
    }
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

  private layoutNodes(
    names: string[],
    kind: SketchNode['kind'],
    minX: number,
    maxX: number,
    y: number
  ): SketchNode[] {
    if (names.length === 0) {
      return [];
    }

    const width = kind === 'process' ? 250 : 230;
    const height = kind === 'process' ? 86 : 78;
    const usableRange = Math.max(maxX - minX - width, 0);
    const spacing = names.length > 1 ? usableRange / (names.length - 1) : 0;

    return names.map((name, index) => ({
      id: `${kind}-${index + 1}`,
      label: name,
      kind,
      x: names.length === 1 ? minX + usableRange / 2 : minX + index * spacing,
      y,
      width,
      height
    }));
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

    return edges
      .map((edge) => {
        const source = nodeMap.get(edge.fromId);
        const destination = nodeMap.get(edge.toId);

        if (!source || !destination) {
          return null;
        }

        const sourceCenterX = source.x + source.width / 2;
        const sourceCenterY = source.y + source.height / 2;
        const destinationCenterX = destination.x + destination.width / 2;
        const destinationCenterY = destination.y + destination.height / 2;

        let x1 = sourceCenterX;
        let y1 = sourceCenterY;
        let x2 = destinationCenterX;
        let y2 = destinationCenterY;

        if (destinationCenterY > sourceCenterY + 6) {
          y1 = source.y + source.height;
          y2 = destination.y;
        } else if (destinationCenterY < sourceCenterY - 6) {
          y1 = source.y;
          y2 = destination.y + destination.height;
        } else if (destinationCenterX >= sourceCenterX) {
          x1 = source.x + source.width;
          x2 = destination.x;
        } else {
          x1 = source.x;
          x2 = destination.x + destination.width;
        }

        const labelX = (x1 + x2) / 2;
        const labelY = (y1 + y2) / 2 - 8;

        const marker =
          edge.kind === 'control'
            ? 'url(#arrow-control)'
            : edge.kind === 'feedback'
              ? 'url(#arrow-feedback)'
              : 'url(#arrow-optional)';

        return {
          id: edge.id,
          label: edge.label,
          x1,
          y1,
          x2,
          y2,
          labelX,
          labelY,
          marker,
          cssClass: `edge edge--${edge.kind}`
        } as SketchEdgeGeometry;
      })
      .filter((item): item is SketchEdgeGeometry => !!item);
  }
}
