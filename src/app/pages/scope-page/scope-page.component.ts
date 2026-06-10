import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Observable, forkJoin, merge, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { ProjectService } from '../../services/project.service';

interface AnalysisObjective {
  id: number;
  focus: string;
  stakeholder: string;
  priority: 'High' | 'Medium' | 'Low';
}

interface Step1ObjectiveDto extends AnalysisObjective {
  rationale?: string;
}

type ResourceSourceType = 'manual' | 'standard' | 'repo' | 'paper' | 'ai';

interface ReferenceResource {
  id: number;
  name: string;
  category: string;
  reference: string;
  sourceType?: ResourceSourceType;
}

interface Step1ResourceDto extends ReferenceResource {
  rationale?: string;
}

interface SystemComponentEntry {
  id: number;
  name: string;
  description: string;
  sourceType?: 'manual' | 'ai';
}

interface Step1SystemComponentDto extends SystemComponentEntry {
  rationale?: string;
}

interface AccidentEntry {
  id: number;
  code: string;
  description: string;
  sourceType?: 'manual' | 'ai';
}

interface Step1AccidentDto extends AccidentEntry {
  rationale?: string;
}

interface HazardEntry {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string[];
  linkedUcas: string[];
  sourceType?: 'manual' | 'ai';
}

interface Step1HazardDto {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string[];
  linkedUcas?: string[];
  sourceType?: 'manual' | 'ai';
  rationale?: string;
}

interface SafetyConstraintEntry {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string[];
  sourceType?: 'manual' | 'ai';
}

interface Step1SafetyConstraintDto {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string[];
  sourceType?: 'manual' | 'ai';
  rationale?: string;
}

interface ResponsibilityEntry {
  id: number;
  code: string;
  component: string;
  responsibility: string;
  linkedConstraints: string[];
  sourceType?: 'manual' | 'ai';
}

interface Step1ResponsibilityDto {
  id: number;
  code?: string;
  component: string;
  responsibility: string;
  linkedConstraints: string[];
  sourceType?: 'manual' | 'ai';
  rationale?: string;
}

interface ArtefactEntry {
  id: number;
  name: string;
  purpose: string;
  reference: string;
  sourceType?: 'manual' | 'ai';
}

interface Step1ArtefactDto extends ArtefactEntry {
  rationale?: string;
}

interface Step1GeneralSummaryDto {
  analysisPurpose?: string;
  assumptions?: string;
  systemDefinition?: string;
  systemBoundary?: string;
  outOfScope?: string;
}

interface Step1ScopeDto {
  lastUpdatedBy?: string;
  generalSummary?: Step1GeneralSummaryDto;
  objectives?: string;
  resources?: Step1ResourceDto[];
  systemComponents?: Step1SystemComponentDto[];
  accidents?: Step1AccidentDto[];
  hazards?: Step1HazardDto[];
  safetyConstraints?: Step1SafetyConstraintDto[];
  responsibilities?: Step1ResponsibilityDto[];
  artefacts?: Step1ArtefactDto[];
}

type GeneralSubstepId = '1.1.1' | '1.1.2' | '1.1.3' | '1.1.4' | '1.1.5';
type SafetySubstepId = '1.2.1' | '1.2.2' | '1.2.3' | '1.2.4' | '1.2.5';
type AiSubstepId = GeneralSubstepId | SafetySubstepId;

interface SequenceRunResult {
  succeeded: AiSubstepId[];
  failed: AiSubstepId[];
}

interface StepExecutionTracker {
  succeeded: Set<AiSubstepId>;
  failed: Set<AiSubstepId>;
}

@Component({
  selector: 'app-scope-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './scope-page.component.html',
  styleUrl: './scope-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScopePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistant = inject(AiAssistantService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly generalSummaryForm = this.fb.group({
    systemDefinition: ['', Validators.required],
    systemBoundary: ['']
  });

  readonly objectiveForm = this.fb.group({
    focus: ['', [Validators.required, Validators.minLength(6)]],
    stakeholder: ['', Validators.required],
    priority: ['High', Validators.required]
  });

  readonly analysisObjectiveForm = this.fb.group({
    objectivesText: ['']
  });

  readonly analysisObjectiveAiForm = this.fb.group({
    objectivesText: ['']
  });

  readonly analysisObjectiveModalForm = this.fb.group({
    objectivesText: ['']
  });

  readonly analysisObjectiveAiModalForm = this.fb.group({
    objectivesText: ['']
  });

  readonly systemDefinitionModalForm = this.fb.group({
    systemDefinitionText: ['']
  });

  readonly systemDefinitionAiForm = this.fb.group({
    systemDefinitionText: ['']
  });

  readonly systemDefinitionAiModalForm = this.fb.group({
    systemDefinitionText: ['']
  });

  readonly systemBoundaryModalForm = this.fb.group({
    systemBoundaryText: ['']
  });

  readonly systemBoundaryAiForm = this.fb.group({
    systemBoundaryText: ['']
  });

  readonly systemBoundaryAiModalForm = this.fb.group({
    systemBoundaryText: ['']
  });

  readonly resourceForm = this.fb.group({
    name: ['', Validators.required],
    category: [''],
    reference: ['']
  });

  readonly resourceModalForm = this.fb.group({
    name: ['', Validators.required],
    category: [''],
    reference: ['']
  });

  readonly componentForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  readonly componentModalForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  readonly accidentForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^L\d+$/)]],
    description: ['', [Validators.required, this.accidentDescriptionValidator()]]
  });

  readonly hazardForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^H\d+$/)]],
    description: ['', [Validators.required, this.hazardDescriptionValidator()]],
    linkedAccidents: [[] as string[], [this.atLeastOneSelectionValidator()]],
    linkedUcas: [[] as string[]]
  });

  readonly constraintForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^SC-\d{2}$/)]],
    statement: ['', [Validators.required, this.constraintStatementValidator()]],
    linkedHazards: [[] as string[], [this.atLeastOneSelectionValidator()]]
  });

  readonly responsibilityForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^R-\d{2}$/)]],
    component: ['', Validators.required],
    responsibility: ['', Validators.required],
    linkedConstraints: [[] as string[], [this.atLeastOneSelectionValidator()]]
  });

  readonly artefactForm = this.fb.group({
    name: ['', Validators.required],
    purpose: ['', Validators.required],
    reference: ['', Validators.required]
  });

  private nextObjectiveId = 0;
  private nextResourceId = 0;
  private nextComponentId = 0;
  private nextAccidentId = 0;
  private nextHazardId = 0;
  private nextConstraintId = 0;
  private nextResponsibilityId = 0;
  private nextArtefactId = 0;

  readonly objectives = signal<AnalysisObjective[]>([]);

  readonly resources = signal<ReferenceResource[]>([]);

  readonly systemComponents = signal<SystemComponentEntry[]>([]);

  readonly accidents = signal<AccidentEntry[]>([]);

  readonly hazards = signal<HazardEntry[]>([]);

  readonly constraints = signal<SafetyConstraintEntry[]>([]);

  readonly responsibilities = signal<ResponsibilityEntry[]>([]);

  readonly availableUcas = signal<string[]>([]);
  readonly safetyConcernsErrors = signal<string[]>([]);

  readonly artefacts = signal<ArtefactEntry[]>([]);

  readonly objectiveCount = computed(() => this.objectives().length);
  readonly hazardCount = computed(() => this.hazards().length);
  readonly accidentCount = computed(() => this.accidents().length);
  readonly resourceCount = computed(() => this.resources().length);
  readonly componentCount = computed(() => this.systemComponents().length);
  readonly artefactCount = computed(() => this.artefacts().length);

  isStep111Complete(): boolean {
    const manualObjectives = this.analysisObjectiveForm.get('objectivesText')?.value;
    const aiObjectives = this.analysisObjectiveAiForm.get('objectivesText')?.value;
    return this.hasMeaningfulText(manualObjectives) || this.hasMeaningfulText(aiObjectives);
  }

  isStep112Complete(): boolean {
    return this.hasMeaningfulText(this.generalSummaryForm.get('systemDefinition')?.value);
  }

  isStep113Complete(): boolean {
    return this.resources().length > 0;
  }

  isStep114Complete(): boolean {
    const manualBoundary = this.generalSummaryForm.get('systemBoundary')?.value;
    const aiBoundary = this.systemBoundaryAiForm.get('systemBoundaryText')?.value;
    return this.hasMeaningfulText(manualBoundary) || this.hasMeaningfulText(aiBoundary);
  }

  isStep115Complete(): boolean {
    return this.systemComponents().length > 0;
  }

  canEdit112(): boolean {
    return this.isStep111Complete();
  }

  canEdit113(): boolean {
    return this.canEdit112() && this.isStep112Complete();
  }

  canEdit114(): boolean {
    return this.canEdit113() && this.isStep113Complete();
  }

  canEdit115(): boolean {
    return this.canEdit114() && this.isStep114Complete();
  }

  canEditStep12(): boolean {
    return this.canEdit115() && this.isStep115Complete();
  }

  canEdit122(): boolean {
    return this.canEditStep12() && this.accidents().length > 0;
  }

  canEdit123(): boolean {
    return this.canEdit122() && this.hazards().length > 0;
  }

  canEdit124(): boolean {
    return this.canEdit123() && this.constraints().length > 0;
  }

  canEdit125(): boolean {
    return this.canEdit124() && this.responsibilities().length > 0;
  }

  readonly isObjectiveModalOpen = signal(false);
  readonly isObjectiveAiModalOpen = signal(false);
  readonly isSystemDefinitionModalOpen = signal(false);
  readonly isSystemDefinitionAiModalOpen = signal(false);
  readonly isResourceModalOpen = signal(false);
  readonly isSystemBoundaryModalOpen = signal(false);
  readonly isSystemBoundaryAiModalOpen = signal(false);
  readonly isComponentModalOpen = signal(false);
  readonly isObjectivePrimaryDirectiveModalOpen = signal(false);
  readonly isBpmnModelModalOpen = signal(false);
  readonly selectedBpmnModelTitle = signal('BPMN model');
  readonly selectedBpmnModelImage = signal('/assets/scope-bpmn-model.jpg');
  readonly selectedObjectiveSource = signal<'manual' | 'ai'>('manual');
  readonly selectedSystemDefinitionSource = signal<'manual' | 'ai'>('manual');
  readonly selectedSystemBoundarySource = signal<'manual' | 'ai'>('manual');
  readonly objectivePrimaryDirectivePreference = signal<'ask' | 'always-yes' | 'always-no'>('ask');
  readonly currentProjectId = signal<number | null>(null);
  readonly isGeneralConcernsAiRunning = signal(false);
  readonly isSafetyConcernsAiRunning = signal(false);
  readonly isStepOneAiRunning = signal(false);

  private pendingObjectiveAiContext: {
    manualObjectives: string;
    stepTwoObjectives: string;
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null;
    stepOneInfo: Record<string, unknown> | null;
    stepTwoInfo: Record<string, unknown> | null;
  } | null = null;

  constructor() {
    this.setupProgressiveFieldLocks();
    this.initializeFromRoute();
  }

  private setupProgressiveFieldLocks(): void {
    merge(
      this.analysisObjectiveForm.valueChanges,
      this.analysisObjectiveAiForm.valueChanges,
      this.generalSummaryForm.valueChanges,
      this.systemBoundaryAiForm.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncProgressiveFieldLocks());

    effect(() => {
      // Re-run when list-based completion state changes.
      this.resources();
      this.systemComponents();
      this.accidents();
      this.hazards();
      this.constraints();

      this.syncProgressiveFieldLocks();
    });

    this.syncProgressiveFieldLocks();
  }

  private syncProgressiveFieldLocks(): void {
    this.setControlEnabled(this.generalSummaryForm.get('systemDefinition'), this.canEdit112());
    this.setFormEnabled(this.resourceForm, this.canEdit113());
    this.setControlEnabled(this.generalSummaryForm.get('systemBoundary'), this.canEdit114());
    this.setFormEnabled(this.componentForm, this.canEdit115());

    this.setFormEnabled(this.accidentForm, this.canEditStep12());
    this.setFormEnabled(this.hazardForm, this.canEdit122());
    this.setFormEnabled(this.constraintForm, this.canEdit123());
    this.setFormEnabled(this.responsibilityForm, this.canEdit124());
    this.setFormEnabled(this.artefactForm, this.canEdit125());

    // Keep modal forms aligned with the same progression rules.
    this.setControlEnabled(this.systemDefinitionModalForm.get('systemDefinitionText'), this.canEdit112());
    this.setControlEnabled(this.systemDefinitionAiForm.get('systemDefinitionText'), this.canEdit112());
    this.setControlEnabled(this.systemDefinitionAiModalForm.get('systemDefinitionText'), this.canEdit112());
    this.setFormEnabled(this.resourceModalForm, this.canEdit113());
    this.setControlEnabled(this.systemBoundaryModalForm.get('systemBoundaryText'), this.canEdit114());
    this.setControlEnabled(this.systemBoundaryAiForm.get('systemBoundaryText'), this.canEdit114());
    this.setControlEnabled(this.systemBoundaryAiModalForm.get('systemBoundaryText'), this.canEdit114());
    this.setFormEnabled(this.componentModalForm, this.canEdit115());
  }

  private setFormEnabled(form: FormGroup, enabled: boolean): void {
    if (enabled && form.disabled) {
      form.enable({ emitEvent: false });
      return;
    }

    if (!enabled && form.enabled) {
      form.disable({ emitEvent: false });
    }
  }

  private setControlEnabled(control: AbstractControl | null, enabled: boolean): void {
    if (!control) {
      return;
    }

    if (enabled && control.disabled) {
      control.enable({ emitEvent: false });
      return;
    }

    if (!enabled && control.enabled) {
      control.disable({ emitEvent: false });
    }
  }

  openObjectiveModal(): void {
    this.analysisObjectiveModalForm.setValue({
      objectivesText: this.analysisObjectiveForm.get('objectivesText')?.value ?? ''
    });
    this.isObjectiveModalOpen.set(true);
  }

  closeObjectiveModal(): void {
    this.isObjectiveModalOpen.set(false);
  }

  confirmObjectiveModal(): void {
    this.analysisObjectiveForm.setValue({
      objectivesText: this.analysisObjectiveModalForm.get('objectivesText')?.value ?? ''
    });
    this.closeObjectiveModal();
  }

  openObjectiveAiModal(): void {
    this.analysisObjectiveAiModalForm.setValue({
      objectivesText: this.analysisObjectiveAiForm.get('objectivesText')?.value ?? ''
    });
    this.isObjectiveAiModalOpen.set(true);
  }

  closeObjectiveAiModal(): void {
    this.isObjectiveAiModalOpen.set(false);
  }

  confirmObjectiveAiModal(): void {
    this.analysisObjectiveAiForm.setValue({
      objectivesText: this.analysisObjectiveAiModalForm.get('objectivesText')?.value ?? ''
    });
    this.closeObjectiveAiModal();
  }

  selectObjectiveSource(source: 'manual' | 'ai'): void {
    this.selectedObjectiveSource.set(source);
  }

  selectSystemDefinitionSource(source: 'manual' | 'ai'): void {
    this.selectedSystemDefinitionSource.set(source);
  }

  selectSystemBoundarySource(source: 'manual' | 'ai'): void {
    this.selectedSystemBoundarySource.set(source);
    this.syncProgressiveFieldLocks();
  }

  openSystemDefinitionModal(): void {
    if (!this.canEdit112()) {
      return;
    }

    this.systemDefinitionModalForm.setValue({
      systemDefinitionText: this.generalSummaryForm.get('systemDefinition')?.value ?? ''
    });
    this.isSystemDefinitionModalOpen.set(true);
  }

  closeSystemDefinitionModal(): void {
    this.isSystemDefinitionModalOpen.set(false);
  }

  confirmSystemDefinitionModal(): void {
    this.generalSummaryForm.patchValue({
      systemDefinition: this.systemDefinitionModalForm.get('systemDefinitionText')?.value ?? ''
    });
    this.closeSystemDefinitionModal();
  }

  openSystemDefinitionAiModal(): void {
    if (!this.canEdit112()) {
      return;
    }

    this.systemDefinitionAiModalForm.setValue({
      systemDefinitionText: this.systemDefinitionAiForm.get('systemDefinitionText')?.value ?? ''
    });
    this.isSystemDefinitionAiModalOpen.set(true);
  }

  closeSystemDefinitionAiModal(): void {
    this.isSystemDefinitionAiModalOpen.set(false);
  }

  confirmSystemDefinitionAiModal(): void {
    if (!this.canEdit112()) {
      return;
    }

    this.systemDefinitionAiForm.patchValue({
      systemDefinitionText: this.systemDefinitionAiModalForm.get('systemDefinitionText')?.value ?? ''
    });
    this.closeSystemDefinitionAiModal();
  }

  openSystemBoundaryModal(): void {
    if (!this.canEdit114()) {
      return;
    }

    this.systemBoundaryModalForm.setValue({
      systemBoundaryText: this.generalSummaryForm.get('systemBoundary')?.value ?? ''
    });
    this.isSystemBoundaryModalOpen.set(true);
  }

  closeSystemBoundaryModal(): void {
    this.isSystemBoundaryModalOpen.set(false);
  }

  confirmSystemBoundaryModal(): void {
    if (!this.canEdit114()) {
      return;
    }

    this.generalSummaryForm.patchValue({
      systemBoundary: this.systemBoundaryModalForm.get('systemBoundaryText')?.value ?? ''
    });
    this.closeSystemBoundaryModal();
  }

  openSystemBoundaryAiModal(): void {
    if (!this.canEdit114()) {
      return;
    }

    this.systemBoundaryAiModalForm.setValue({
      systemBoundaryText: this.systemBoundaryAiForm.get('systemBoundaryText')?.value ?? ''
    });
    this.isSystemBoundaryAiModalOpen.set(true);
  }

  closeSystemBoundaryAiModal(): void {
    this.isSystemBoundaryAiModalOpen.set(false);
  }

  confirmSystemBoundaryAiModal(): void {
    if (!this.canEdit114()) {
      return;
    }

    this.systemBoundaryAiForm.patchValue({
      systemBoundaryText: this.systemBoundaryAiModalForm.get('systemBoundaryText')?.value ?? ''
    });
    this.closeSystemBoundaryAiModal();
  }

  openResourceModal(): void {
    if (!this.canEdit113()) {
      return;
    }

    this.resourceModalForm.setValue({
      name: this.resourceForm.get('name')?.value ?? '',
      category: this.resourceForm.get('category')?.value ?? 'Article',
      reference: this.resourceForm.get('reference')?.value ?? ''
    });
    this.isResourceModalOpen.set(true);
  }

  closeResourceModal(): void {
    this.isResourceModalOpen.set(false);
  }

  confirmResourceModal(): void {
    if (!this.canEdit113()) {
      return;
    }

    this.resourceForm.setValue({
      name: this.resourceModalForm.get('name')?.value ?? '',
      category: this.resourceModalForm.get('category')?.value ?? 'Article',
      reference: this.resourceModalForm.get('reference')?.value ?? ''
    });
    this.closeResourceModal();
  }

  openComponentModal(): void {
    if (!this.canEdit115()) {
      return;
    }

    this.componentModalForm.setValue({
      name: this.componentForm.get('name')?.value ?? '',
      description: this.componentForm.get('description')?.value ?? ''
    });
    this.isComponentModalOpen.set(true);
  }

  closeComponentModal(): void {
    this.isComponentModalOpen.set(false);
  }

  confirmComponentModal(): void {
    if (!this.canEdit115()) {
      return;
    }

    this.componentForm.setValue({
      name: this.componentModalForm.get('name')?.value ?? '',
      description: this.componentModalForm.get('description')?.value ?? ''
    });
    this.closeComponentModal();
  }

  openBpmnModelModal(title: string, imagePath: string): void {
    this.selectedBpmnModelTitle.set(title);
    this.selectedBpmnModelImage.set(imagePath);
    this.isBpmnModelModalOpen.set(true);
  }

  closeBpmnModelModal(): void {
    this.isBpmnModelModalOpen.set(false);
  }

  private initializeFromRoute(): void {
    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          const prefill = params.get('prefill');
          const projectIdParam = params.get('projectId');
          const projectId = projectIdParam ? Number(projectIdParam) : undefined;

          this.currentProjectId.set(projectId && !Number.isNaN(projectId) ? projectId : null);

          if (!projectId || Number.isNaN(projectId)) {
            this.applyPrefill(prefill);
            return EMPTY;
          }

          return this.projectService.getStepOneScope(projectId).pipe(
            tap((scope) => {
              if (!scope || Object.keys(scope).length === 0) {
                this.applyPrefill(prefill);
                return;
              }
              this.applyStep1Scope(scope as Step1ScopeDto);
            }),
            catchError((error) => {
              console.error(
                `Failed to load Step 1 scope from /api/projects/step_one_project_information/${projectId}`,
                error
              );
              this.applyPrefill(prefill);
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private applyPrefill(prefill: string | null): void {
    if (prefill === 'empty') {
      this.applyEmptyPrefill();
      return;
    }

    if (prefill === 'ai') {
      this.applyAiPrefill();
    }
  }

  private applyStep1Scope(scope: Step1ScopeDto): void {
    const summary = scope.generalSummary ?? {};

    this.generalSummaryForm.reset({
      systemDefinition: summary.systemDefinition ?? '',
      systemBoundary: summary.systemBoundary ?? ''
    });

    this.analysisObjectiveForm.reset({
      objectivesText: scope.objectives ?? ''
    });

    this.analysisObjectiveAiForm.reset({
      objectivesText: ''
    });
    this.selectedObjectiveSource.set('manual');
    this.systemDefinitionAiForm.reset({
      systemDefinitionText: ''
    });
    this.selectedSystemDefinitionSource.set('manual');
    this.systemBoundaryAiForm.reset({
      systemBoundaryText: ''
    });
    this.selectedSystemBoundarySource.set('manual');

    const resources = (scope.resources ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      reference: item.reference,
      sourceType: item.sourceType ?? 'manual'
    }));

    const systemComponents = (scope.systemComponents ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      sourceType: item.sourceType ?? 'manual'
    }));

    const accidents = (scope.accidents ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      sourceType: item.sourceType ?? 'manual'
    }));

    const hazards = (scope.hazards ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      linkedAccidents: [...(item.linkedAccidents ?? [])],
      linkedUcas: [...(item.linkedUcas ?? [])],
      sourceType: item.sourceType ?? 'manual'
    }));

    const constraints = (scope.safetyConstraints ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      statement: item.statement,
      linkedHazards: [...(item.linkedHazards ?? [])],
      sourceType: item.sourceType ?? 'manual'
    }));

    const responsibilities = (scope.responsibilities ?? []).map((item, index) => ({
      id: item.id,
      code: item.code ?? `R-${String(index + 1).padStart(2, '0')}`,
      component: item.component,
      responsibility: item.responsibility,
      linkedConstraints: [...(item.linkedConstraints ?? [])],
      sourceType: item.sourceType ?? 'manual'
    }));

    const artefacts = (scope.artefacts ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      purpose: item.purpose,
      reference: item.reference,
      sourceType: item.sourceType ?? 'manual'
    }));

    this.resources.set(resources);
    this.systemComponents.set(systemComponents);
    this.accidents.set(accidents);
    this.hazards.set(hazards);
    this.constraints.set(constraints);
    this.responsibilities.set(responsibilities);
    this.artefacts.set(artefacts);

    this.nextResourceId = this.getNextId(resources);
    this.nextComponentId = this.getNextId(systemComponents);
    this.nextAccidentId = this.getNextId(accidents);
    this.nextHazardId = this.getNextId(hazards);
    this.nextConstraintId = this.getNextId(constraints);
    this.nextResponsibilityId = this.getNextId(responsibilities);
    this.nextArtefactId = this.getNextId(artefacts);
  }

  private normalizePriority(priority: string | undefined): AnalysisObjective['priority'] {
    if (priority === 'High' || priority === 'Medium' || priority === 'Low') {
      return priority;
    }
    return 'Medium';
  }

  saveStepOne(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId) {
      console.warn('Missing projectId; cannot save Step 1 scope.');
      return;
    }

    const validationErrors = this.validateSafetyConcerns();
    this.safetyConcernsErrors.set(validationErrors);
    if (validationErrors.length > 0) {
      console.warn('Step 1.2 validation failed. Resolve safety concern errors before saving.', validationErrors);
      return;
    }

    const payload: Step1ScopeDto & { id: number } = {
      id: projectId,
      lastUpdatedBy: 'admin',
      generalSummary: {
        systemDefinition: this.getSelectedSystemDefinitionText(),
        systemBoundary: this.getSelectedSystemBoundaryText()
      },
      objectives: this.getSelectedObjectivesText(),
      resources: this.resources().map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        reference: item.reference
      })),
      systemComponents: this.systemComponents().map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description
      })),
      accidents: this.accidents().map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description
      })),
      hazards: this.hazards().map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description,
        linkedAccidents: [...item.linkedAccidents],
        linkedUcas: [...item.linkedUcas]
      })),
      safetyConstraints: this.constraints().map((item) => ({
        id: item.id,
        code: item.code,
        statement: item.statement,
        linkedHazards: [...item.linkedHazards]
      })),
      responsibilities: this.responsibilities().map((item) => ({
        id: item.id,
        code: item.code,
        component: item.component,
        responsibility: item.responsibility,
        linkedConstraints: [...item.linkedConstraints]
      })),
      artefacts: this.artefacts().map((item) => ({
        id: item.id,
        name: item.name,
        purpose: item.purpose,
        reference: item.reference
      }))
    };

    this.projectService
      .updateStepOneScope(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (continueAfterSave) {
            this.router.navigate(['/istar-models'], { queryParams: { projectId } });
          }
        },
        error: (error) => {
          console.error('Failed to update Step 1 scope via POST /api/projects/step_one_project_update', error);
        }
      });
  }

  generateObjectivesWithAi(): void {
    const projectId = this.currentProjectId();
    const manualObjectives = (this.analysisObjectiveForm.get('objectivesText')?.value ?? '').trim();

    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const stepTwoObjectives = this.extractStepTwoObjectivesText(stepTwoInfo) || this.extractStepOneObjectivesText(stepOneInfo);
        this.generateObjectivesWithAiDecision(
          manualObjectives,
          stepTwoObjectives,
          resume,
          stepOneInfo,
          stepTwoInfo
        );
      });
  }

  confirmObjectivePrimaryDirective(useManual: boolean, remember: 'always-yes' | 'always-no' | null = null): void {
    if (remember) {
      this.objectivePrimaryDirectivePreference.set(remember);
    }

    const context = this.pendingObjectiveAiContext;
    this.pendingObjectiveAiContext = null;
    this.isObjectivePrimaryDirectiveModalOpen.set(false);

    if (!context) {
      return;
    }

    const primaryDirective = useManual ? context.manualObjectives : context.stepTwoObjectives;
    this.requestObjectivesAiUsingPrimaryDirective(primaryDirective, context.resume, context.stepOneInfo, context.stepTwoInfo);
  }

  closeObjectivePrimaryDirectiveModal(): void {
    this.pendingObjectiveAiContext = null;
    this.isObjectivePrimaryDirectiveModalOpen.set(false);
  }

  private generateObjectivesWithAiDecision(
    manualObjectives: string,
    stepTwoObjectives: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): void {
    const normalizedManual = this.normalizeObjectiveText(manualObjectives);
    const normalizedStepTwo = this.normalizeObjectiveText(stepTwoObjectives);
    const stepTwoDirective = stepTwoObjectives || manualObjectives;

    const mustUseStepTwoWithoutModal = !normalizedManual || (normalizedStepTwo.length > 0 && normalizedManual === normalizedStepTwo);
    if (mustUseStepTwoWithoutModal) {
      this.requestObjectivesAiUsingPrimaryDirective(stepTwoDirective, resume, stepOneInfo, stepTwoInfo);
      return;
    }

    const preference = this.objectivePrimaryDirectivePreference();
    if (preference === 'always-yes') {
      this.requestObjectivesAiUsingPrimaryDirective(manualObjectives, resume, stepOneInfo, stepTwoInfo);
      return;
    }

    if (preference === 'always-no') {
      this.requestObjectivesAiUsingPrimaryDirective(stepTwoDirective, resume, stepOneInfo, stepTwoInfo);
      return;
    }

    this.pendingObjectiveAiContext = {
      manualObjectives,
      stepTwoObjectives,
      resume,
      stepOneInfo,
      stepTwoInfo
    };
    this.isObjectivePrimaryDirectiveModalOpen.set(true);
  }

  private requestObjectivesAiUsingPrimaryDirective(
    primaryOrientation: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): void {
    const question = this.buildObjectivesAiQuestion(primaryOrientation, resume, stepOneInfo, stepTwoInfo);

    this.requestAiText(question, (text) => {
      this.analysisObjectiveAiForm.patchValue({ objectivesText: text });
      this.analysisObjectiveAiModalForm.patchValue({ objectivesText: text });
      this.selectedObjectiveSource.set('ai');
    });
  }

  private buildObjectivesAiQuestion(
    primaryOrientation: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryOrientation = primaryOrientation || 'No text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    const stepOneContext = this.buildCurrentStepOneContext(stepOneInfo);
    const stepTwoContext = stepTwoInfo ?? {};

    return [
      'You are a Systems Engineering expert helping define Step 1.1.1 "Define analysis objectives" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY THE FINAL ANALYSIS OBJECTIVES TEXT.',
      'Do not include greetings, explanations, markdown formatting, labels, or any other text.',
      'Provide a single, concise, and actionable paragraph focused on the analysis to be performed.',
      '',
      'Follow these directives exactly:',
      '1) PRIORITIZE the current user-written text from the [PRIMARY ORIENTATION] field as the MAIN orientation.',
      '2) Define the OBJECTIVES OF THE ANALYSIS ACTIVITY (what this safety analysis process aims to achieve through this app).',
      '3) Emphasize iterative analysis outcomes and refinement of safety analysis artefacts, aligned with the RESafety process context when available.',
      '4) Keep the text scoped to analysis intent, expected analysis outputs, and how it guides subsequent steps.',
      '5) DO NOT rewrite or restate the system mission/operational goals as the main focus.',
      '',
      'Important: The first-field manual text below is current user input and may be unsaved. Treat it as the primary guidance.',
      '',
      '[PRIMARY ORIENTATION - CURRENT OBJECTIVE TEXT TO USE AS MAIN DIRECTIVE] ',
      safePrimaryOrientation,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(stepOneContext, null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoContext, null, 2),
      '',
      'Output requirement: Output strictly the analysis objectives text for Step 1.1.1, ready to be pasted programmatically into a database field.'
    ].join('\n');
  }
  

  private extractStepTwoObjectivesText(stepTwoInfo: Record<string, unknown> | null): string {
    if (!stepTwoInfo) {
      return '';
    }

    const directCandidates: unknown[] = [
      stepTwoInfo['objectives'],
      stepTwoInfo['objective'],
      stepTwoInfo['analysisObjectives'],
      stepTwoInfo['analysisObjective'],
      stepTwoInfo['systemObjectives'],
      stepTwoInfo['systemObjective']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    const nestedCandidates: unknown[] = [
      stepTwoInfo['step2Information'],
      stepTwoInfo['stepTwoInformation'],
      stepTwoInfo
    ];

    for (const candidate of nestedCandidates) {
      const found = this.findObjectiveTextInUnknown(candidate, new Set<unknown>());
      if (found) {
        return found;
      }
    }

    return '';
  }

  private extractStepOneObjectivesText(stepOneInfo: Record<string, unknown> | null): string {
    if (!stepOneInfo) {
      return '';
    }

    const directCandidates: unknown[] = [
      stepOneInfo['objectives'],
      stepOneInfo['objective'],
      stepOneInfo['analysisObjectives'],
      stepOneInfo['analysisObjective']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    const nestedCandidates: unknown[] = [
      stepOneInfo['step1Information'],
      stepOneInfo['stepOneInformation'],
      stepOneInfo
    ];

    for (const candidate of nestedCandidates) {
      const found = this.findObjectiveTextInUnknown(candidate, new Set<unknown>());
      if (found) {
        return found;
      }
    }

    return '';
  }

  private findObjectiveTextInUnknown(candidate: unknown, visited: Set<unknown>): string {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return '';
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return this.findObjectiveTextInUnknown(parsed, visited);
      } catch {
        return '';
      }
    }

    if (!candidate || typeof candidate !== 'object') {
      return '';
    }

    if (visited.has(candidate)) {
      return '';
    }
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = this.findObjectiveTextInUnknown(item, visited);
        if (found) {
          return found;
        }
      }
      return '';
    }

    const record = candidate as Record<string, unknown>;
    const priorityKeys = ['objectives', 'objective', 'analysisObjectives', 'analysisObjective', 'systemObjectives', 'systemObjective'];

    for (const key of priorityKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && /objective/i.test(key) && value.trim()) {
        return value.trim();
      }
    }

    for (const value of Object.values(record)) {
      const found = this.findObjectiveTextInUnknown(value, visited);
      if (found) {
        return found;
      }
    }

    return '';
  }

  private normalizeObjectiveText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private getSelectedObjectivesText(): string {
    if (this.selectedObjectiveSource() === 'ai') {
      return this.analysisObjectiveAiForm.get('objectivesText')?.value ?? '';
    }

    return this.analysisObjectiveForm.get('objectivesText')?.value ?? '';
  }

  private getSelectedSystemDefinitionText(): string {
    if (this.selectedSystemDefinitionSource() === 'ai') {
      return this.systemDefinitionAiForm.get('systemDefinitionText')?.value ?? '';
    }

    return this.generalSummaryForm.get('systemDefinition')?.value ?? '';
  }

  private getSelectedSystemBoundaryText(): string {
    if (this.selectedSystemBoundarySource() === 'ai') {
      return this.systemBoundaryAiForm.get('systemBoundaryText')?.value ?? '';
    }

    return this.generalSummaryForm.get('systemBoundary')?.value ?? '';
  }

  private buildCurrentStepOneContext(stepOneInfo: Record<string, unknown> | null): Record<string, unknown> {
    const apiContext = stepOneInfo ?? {};

    return {
      ...apiContext,
      objectives: this.getSelectedObjectivesText(),
      generalSummary: {
        systemDefinition: this.getSelectedSystemDefinitionText(),
        systemBoundary: this.getSelectedSystemBoundaryText()
      },
      resources: this.resources().map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        reference: item.reference
      })),
      systemComponents: this.systemComponents().map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description
      })),
      accidents: this.accidents().map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description
      })),
      hazards: this.hazards().map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description,
        linkedAccidents: [...item.linkedAccidents],
        linkedUcas: [...item.linkedUcas]
      })),
      safetyConstraints: this.constraints().map((item) => ({
        id: item.id,
        code: item.code,
        statement: item.statement,
        linkedHazards: [...item.linkedHazards]
      })),
      responsibilities: this.responsibilities().map((item) => ({
        id: item.id,
        code: item.code,
        component: item.component,
        responsibility: item.responsibility,
        linkedConstraints: [...item.linkedConstraints]
      })),
      artefacts: this.artefacts().map((item) => ({
        id: item.id,
        name: item.name,
        purpose: item.purpose,
        reference: item.reference
      })),
      liveFormState: {
        selectedObjectiveSource: this.selectedObjectiveSource(),
        selectedSystemDefinitionSource: this.selectedSystemDefinitionSource(),
        selectedSystemBoundarySource: this.selectedSystemBoundarySource(),
        objectivesManual: this.analysisObjectiveForm.get('objectivesText')?.value ?? '',
        objectivesAi: this.analysisObjectiveAiForm.get('objectivesText')?.value ?? '',
        systemDefinitionManual: this.generalSummaryForm.get('systemDefinition')?.value ?? '',
        systemDefinitionAi: this.systemDefinitionAiForm.get('systemDefinitionText')?.value ?? '',
        systemBoundaryManual: this.generalSummaryForm.get('systemBoundary')?.value ?? '',
        systemBoundaryAi: this.systemBoundaryAiForm.get('systemBoundaryText')?.value ?? ''
      }
    };
  }

  generateSystemDefinitionWithAi(): void {
    if (!this.canEdit112()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();

    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildSystemDefinitionAiQuestion(primarySystemDefinitionDraft, resume, stepOneInfo, stepTwoInfo);

        this.requestAiText(question, (text) => {
          this.systemDefinitionAiForm.patchValue({ systemDefinitionText: text });
          this.systemDefinitionAiModalForm.patchValue({ systemDefinitionText: text });
          this.selectedSystemDefinitionSource.set('ai');
        });
      });
  }

  generateGeneralConcernsWithAi(): void {
    if (this.isGeneralConcernsAiRunning()) {
      return;
    }

    this.isGeneralConcernsAiRunning.set(true);

    const projectId = this.currentProjectId();
    const initialObjectivesSeed = (this.analysisObjectiveForm.get('objectivesText')?.value ?? '').trim();

    this.runGeneralConcernsSequence$(projectId, initialObjectivesSeed)
      .pipe(
        switchMap((firstPass) => {
          if (firstPass.failed.length === 0) {
            this.showFinalRunSnackbar('1.1', firstPass, 5);
            return of(void 0);
          }

          this.showRetryWarningSnackbar(firstPass.failed);

          return this.runGeneralConcernsSequence$(projectId, initialObjectivesSeed, new Set<AiSubstepId>(firstPass.failed)).pipe(
            tap((retryPass) => {
              const finalResult = this.mergeFirstAndRetryRunResults(firstPass, retryPass);
              this.showFinalRunSnackbar('1.1', finalResult, 5);
            }),
            map(() => void 0)
          );
        }),
        finalize(() => this.isGeneralConcernsAiRunning.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to run sequential AI generation for Step 1.1 via /api/ai/ask', error);
        }
      });
  }

  generateSafetyConcernsWithAi(): void {
    if (this.isSafetyConcernsAiRunning() || !this.canEditStep12()) {
      return;
    }

    this.isSafetyConcernsAiRunning.set(true);

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.runSafetyConcernsSequence$(
      projectId,
      primaryObjectives,
      primarySystemDefinitionDraft,
      primarySystemBoundaryDraft
    )
      .pipe(
        switchMap((firstPass) => {
          if (firstPass.failed.length === 0) {
            this.showFinalRunSnackbar('1.2', firstPass, 5);
            return of(void 0);
          }

          this.showRetryWarningSnackbar(firstPass.failed);

          return this.runSafetyConcernsSequence$(
            projectId,
            primaryObjectives,
            primarySystemDefinitionDraft,
            primarySystemBoundaryDraft,
            new Set<AiSubstepId>(firstPass.failed)
          ).pipe(
            tap((retryPass) => {
              const finalResult = this.mergeFirstAndRetryRunResults(firstPass, retryPass);
              this.showFinalRunSnackbar('1.2', finalResult, 5);
            }),
            map(() => void 0)
          );
        }),
        finalize(() => this.isSafetyConcernsAiRunning.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to run sequential AI generation for Step 1.2 via /api/ai/ask', error);
        }
      });
  }

  generateStepOneWithAi(): void {
    if (this.isStepOneAiRunning()) {
      return;
    }

    this.isStepOneAiRunning.set(true);

    const projectId = this.currentProjectId();
    const initialObjectivesSeed = (this.analysisObjectiveForm.get('objectivesText')?.value ?? '').trim();

    this.runGeneralConcernsSequence$(projectId, initialObjectivesSeed)
      .pipe(
        switchMap((generalFirstPass) => {
          const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
          const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
          const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

          return this.runSafetyConcernsSequence$(
            projectId,
            primaryObjectives,
            primarySystemDefinitionDraft,
            primarySystemBoundaryDraft
          ).pipe(map((safetyFirstPass) => ({ generalFirstPass, safetyFirstPass })));
        }),
        switchMap(({ generalFirstPass, safetyFirstPass }) => {
          const combinedFirstPass = this.combineRunResults([generalFirstPass, safetyFirstPass]);

          if (combinedFirstPass.failed.length === 0) {
            this.showFinalRunSnackbar('Step 1', combinedFirstPass, 10);
            return of(void 0);
          }

          this.showRetryWarningSnackbar(combinedFirstPass.failed);

          const retryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
          const retrySystemDefinition = (this.getSelectedSystemDefinitionText() ?? '').trim();
          const retrySystemBoundary = (this.getSelectedSystemBoundaryText() ?? '').trim();

          return this.runGeneralConcernsSequence$(
            projectId,
            initialObjectivesSeed,
            new Set<AiSubstepId>(generalFirstPass.failed)
          ).pipe(
            switchMap((generalRetryPass) =>
              this.runSafetyConcernsSequence$(
                projectId,
                retryObjectives,
                retrySystemDefinition,
                retrySystemBoundary,
                new Set<AiSubstepId>(safetyFirstPass.failed)
              ).pipe(
                tap((safetyRetryPass) => {
                  const finalGeneral = this.mergeFirstAndRetryRunResults(generalFirstPass, generalRetryPass);
                  const finalSafety = this.mergeFirstAndRetryRunResults(safetyFirstPass, safetyRetryPass);
                  const finalCombined = this.combineRunResults([finalGeneral, finalSafety]);
                  this.showFinalRunSnackbar('Step 1', finalCombined, 10);
                }),
                map(() => void 0)
              )
            )
          );
        }),
        finalize(() => this.isStepOneAiRunning.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to run full Step 1 sequential AI generation via /api/ai/ask', error);
        }
      });
  }

  private shouldRunStep(stepId: AiSubstepId, retryOnlyFailed: Set<AiSubstepId> | null): boolean {
    return !retryOnlyFailed || retryOnlyFailed.has(stepId);
  }

  private createExecutionTracker(): StepExecutionTracker {
    return {
      succeeded: new Set<AiSubstepId>(),
      failed: new Set<AiSubstepId>()
    };
  }

  private trackerToResult(tracker: StepExecutionTracker): SequenceRunResult {
    return {
      succeeded: this.sortSubsteps([...tracker.succeeded]),
      failed: this.sortSubsteps([...tracker.failed])
    };
  }

  private sortSubsteps(substeps: AiSubstepId[]): AiSubstepId[] {
    return [...substeps].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  private executeAiStep$<T>(
    stepId: AiSubstepId,
    retryOnlyFailed: Set<AiSubstepId> | null,
    request$: Observable<T>,
    fallback: T,
    tracker: StepExecutionTracker,
    onSuccess?: (value: T) => void
  ): Observable<T> {
    if (!this.shouldRunStep(stepId, retryOnlyFailed)) {
      return of(fallback);
    }

    return request$.pipe(
      tap((value) => {
        tracker.failed.delete(stepId);
        tracker.succeeded.add(stepId);
        if (onSuccess) {
          onSuccess(value);
        }
      }),
      catchError((error) => {
        console.error(`Failed AI substep ${stepId} via /api/ai/ask`, error);
        tracker.succeeded.delete(stepId);
        tracker.failed.add(stepId);
        return of(fallback);
      })
    );
  }

  private mergeFirstAndRetryRunResults(firstPass: SequenceRunResult, retryPass: SequenceRunResult): SequenceRunResult {
    const succeeded = new Set<AiSubstepId>(firstPass.succeeded);
    for (const step of retryPass.succeeded) {
      succeeded.add(step);
    }

    return {
      succeeded: this.sortSubsteps([...succeeded]),
      failed: this.sortSubsteps([...retryPass.failed])
    };
  }

  private combineRunResults(results: SequenceRunResult[]): SequenceRunResult {
    const succeeded = new Set<AiSubstepId>();
    const failed = new Set<AiSubstepId>();

    for (const result of results) {
      for (const step of result.succeeded) {
        succeeded.add(step);
      }

      for (const step of result.failed) {
        failed.add(step);
      }
    }

    return {
      succeeded: this.sortSubsteps([...succeeded]),
      failed: this.sortSubsteps([...failed])
    };
  }

  private showRetryWarningSnackbar(failedSubsteps: AiSubstepId[]): void {
    const message = `Failed substeps: ${failedSubsteps.join(', ')}. Retrying once.`;
    this.snackBar.open(message, 'OK', {
      duration: 5000,
      verticalPosition: 'top',
      horizontalPosition: 'center',
      panelClass: ['ai-snackbar-warning']
    });
  }

  private showFinalRunSnackbar(scopeLabel: '1.1' | '1.2' | 'Step 1', result: SequenceRunResult, totalSubsteps: number): void {
    if (result.failed.length === 0) {
      this.snackBar.open(
        `${scopeLabel}: all ${totalSubsteps} endpoint calls succeeded.`,
        'OK',
        {
          duration: 4500,
          verticalPosition: 'top',
          horizontalPosition: 'center',
          panelClass: ['ai-snackbar-success']
        }
      );
      return;
    }

    if (result.failed.length === totalSubsteps) {
      this.snackBar.open(
        `${scopeLabel}: all endpoint calls failed. Failed substeps: ${result.failed.join(', ')}`,
        'OK',
        {
          duration: 7000,
          verticalPosition: 'top',
          horizontalPosition: 'center',
          panelClass: ['ai-snackbar-error']
        }
      );
      return;
    }

    this.snackBar.open(
      `${scopeLabel}: partial success. Failed substeps: ${result.failed.join(', ')}`,
      'OK',
      {
        duration: 7000,
        verticalPosition: 'top',
        horizontalPosition: 'center',
        panelClass: ['ai-snackbar-partial']
      }
    );
  }

  private askAiText$(question: string): Observable<string> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiText(response)));
  }

  private askAiResources$(question: string): Observable<Array<{ name: string; category: string; reference: string }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiResources(response)));
  }

  private askAiComponents$(question: string): Observable<Array<{ name: string; description: string }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiComponents(response)));
  }

  private askAiLosses$(question: string): Observable<Array<{ code: string; description: string }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiLosses(response)));
  }

  private askAiHazards$(question: string): Observable<Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiHazards(response)));
  }

  private askAiConstraints$(question: string): Observable<Array<{ code: string; statement: string; linkedHazards: string[] }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiConstraints(response)));
  }

  private askAiResponsibilities$(question: string): Observable<Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiResponsibilities(response)));
  }

  private askAiArtefacts$(question: string): Observable<Array<{ name: string; purpose: string; reference: string }>> {
    return this.aiAssistant.ask({ question }).pipe(map((response) => this.extractAiArtefacts(response)));
  }

  private runGeneralConcernsSequence$(
    projectId: number | null,
    initialObjectivesSeed: string,
    retryOnlyFailed: Set<AiSubstepId> | null = null
  ): Observable<SequenceRunResult> {
    const tracker = this.createExecutionTracker();
    const fallbackObjectives = (this.getSelectedObjectivesText() ?? '').trim() || initialObjectivesSeed;
    const fallbackSystemDefinition = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const fallbackSystemBoundary = (this.getSelectedSystemBoundaryText() ?? '').trim();

    return this.fetchAiProjectContext(projectId).pipe(
      switchMap(({ resume, stepOneInfo, stepTwoInfo }) => {
        const q111 = this.buildObjectivesAiQuestion(initialObjectivesSeed, resume, stepOneInfo, stepTwoInfo);

        return this.executeAiStep$('1.1.1', retryOnlyFailed, this.askAiText$(q111), fallbackObjectives, tracker, (text) => {
          if (!text) {
            return;
          }

          this.analysisObjectiveAiForm.patchValue({ objectivesText: text });
          this.analysisObjectiveAiModalForm.patchValue({ objectivesText: text });
          this.selectedObjectiveSource.set('ai');
        }).pipe(map((objectivesText) => ({ resume, stepOneInfo, stepTwoInfo, objectivesText }))); 
      }),
      switchMap((state111) => {
        const existingSystemDefinition = (this.getSelectedSystemDefinitionText() ?? '').trim();
        const systemDefinitionSeed = existingSystemDefinition || state111.objectivesText || fallbackSystemDefinition;
        const q112 = this.buildSystemDefinitionAiQuestion(
          systemDefinitionSeed,
          state111.resume,
          state111.stepOneInfo,
          state111.stepTwoInfo
        );

        return this.executeAiStep$('1.1.2', retryOnlyFailed, this.askAiText$(q112), systemDefinitionSeed, tracker, (text) => {
          if (!text) {
            return;
          }

          this.systemDefinitionAiForm.patchValue({ systemDefinitionText: text });
          this.systemDefinitionAiModalForm.patchValue({ systemDefinitionText: text });
          this.selectedSystemDefinitionSource.set('ai');
        }).pipe(map((systemDefinitionText) => ({ ...state111, systemDefinitionText })));
      }),
      switchMap((state112) => {
        const q113 = this.buildResourcesAiQuestion(
          state112.objectivesText,
          state112.systemDefinitionText,
          state112.resume,
          state112.stepOneInfo,
          state112.stepTwoInfo,
          this.resources()
        );

        return this.executeAiStep$('1.1.3', retryOnlyFailed, this.askAiResources$(q113), [], tracker, (resources) => {
          this.mergeAiResources(resources);
        }).pipe(map(() => state112));
      }),
      switchMap((state113) => {
        const q114 = this.buildSystemBoundaryAiQuestion(
          state113.objectivesText,
          state113.systemDefinitionText,
          state113.resume,
          state113.stepOneInfo,
          state113.stepTwoInfo
        );

        return this.executeAiStep$('1.1.4', retryOnlyFailed, this.askAiText$(q114), fallbackSystemBoundary, tracker, (text) => {
          if (!text) {
            return;
          }

          this.systemBoundaryAiForm.patchValue({ systemBoundaryText: text });
          this.systemBoundaryAiModalForm.patchValue({ systemBoundaryText: text });
          this.selectedSystemBoundarySource.set('ai');
        }).pipe(map((systemBoundaryText) => ({ ...state113, systemBoundaryText })));
      }),
      switchMap((state114) => {
        const q115 = this.buildComponentsAiQuestion(
          state114.objectivesText,
          state114.systemDefinitionText,
          state114.systemBoundaryText,
          state114.resume,
          state114.stepOneInfo,
          state114.stepTwoInfo
        );

        return this.executeAiStep$('1.1.5', retryOnlyFailed, this.askAiComponents$(q115), [], tracker, (components) => {
          this.mergeAiComponents(components);
        });
      }),
      map(() => this.trackerToResult(tracker))
    );
  }

  private runSafetyConcernsSequence$(
    projectId: number | null,
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    retryOnlyFailed: Set<AiSubstepId> | null = null
  ): Observable<SequenceRunResult> {
    const tracker = this.createExecutionTracker();

    return this.fetchAiProjectContext(projectId).pipe(
      switchMap(({ resume, stepOneInfo, stepTwoInfo }) => {
        const q121 = this.buildLossesAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        return this.executeAiStep$('1.2.1', retryOnlyFailed, this.askAiLosses$(q121), [], tracker, (losses) => {
          this.mergeAiLosses(losses);
        }).pipe(map(() => ({ resume, stepOneInfo, stepTwoInfo })));
      }),
      switchMap((state121) => {
        const q122 = this.buildHazardsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          state121.resume,
          state121.stepOneInfo,
          state121.stepTwoInfo
        );

        return this.executeAiStep$('1.2.2', retryOnlyFailed, this.askAiHazards$(q122), [], tracker, (hazards) => {
          this.mergeAiHazards(hazards);
        }).pipe(map(() => state121));
      }),
      switchMap((state122) => {
        const q123 = this.buildConstraintsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          state122.resume,
          state122.stepOneInfo,
          state122.stepTwoInfo
        );

        return this.executeAiStep$('1.2.3', retryOnlyFailed, this.askAiConstraints$(q123), [], tracker, (constraints) => {
          this.mergeAiConstraints(constraints);
        }).pipe(map(() => state122));
      }),
      switchMap((state123) => {
        const q124 = this.buildResponsibilitiesAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          state123.resume,
          state123.stepOneInfo,
          state123.stepTwoInfo
        );

        return this.executeAiStep$('1.2.4', retryOnlyFailed, this.askAiResponsibilities$(q124), [], tracker, (responsibilities) => {
          this.mergeAiResponsibilities(responsibilities);
        }).pipe(map(() => state123));
      }),
      switchMap((state124) => {
        const q125 = this.buildArtefactsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          state124.resume,
          state124.stepOneInfo,
          state124.stepTwoInfo
        );

        return this.executeAiStep$('1.2.5', retryOnlyFailed, this.askAiArtefacts$(q125), [], tracker, (artefacts) => {
          this.mergeAiArtefacts(artefacts);
        });
      }),
      map(() => this.trackerToResult(tracker))
    );
  }

  private mergeAiResources(items: Array<{ name: string; category: string; reference: string }>): void {
    if (items.length === 0) {
      return;
    }

    const existingNames = new Set(this.resources().map((item) => this.normalizeResourceName(item.name)));
    const addedNames = new Set<string>();

    const toAdd = items.filter((item) => {
      const normalizedName = this.normalizeResourceName(item.name);
      if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
        return false;
      }

      addedNames.add(normalizedName);
      return true;
    });

    if (toAdd.length === 0) {
      return;
    }

    this.resources.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextResourceId,
        name: item.name,
        category: item.category,
        reference: item.reference,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiComponents(items: Array<{ name: string; description: string }>): void {
    if (items.length === 0) {
      return;
    }

    const existingNames = new Set(this.systemComponents().map((item) => this.normalizeComponentName(item.name)));
    const addedNames = new Set<string>();

    const toAdd = items.filter((item) => {
      const normalizedName = this.normalizeComponentName(item.name);
      if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
        return false;
      }

      addedNames.add(normalizedName);
      return true;
    });

    if (toAdd.length === 0) {
      return;
    }

    this.systemComponents.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextComponentId,
        name: item.name,
        description: item.description,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiLosses(items: Array<{ code: string; description: string }>): void {
    if (items.length === 0) {
      return;
    }

    const existingCodes = new Set(this.accidents().map((item) => item.code.trim().toUpperCase()));
    const existingDescriptions = new Set(this.accidents().map((item) => this.normalizeFreeText(item.description)));
    const addedCodes = new Set<string>();
    const addedDescriptions = new Set<string>();

    const toAdd = items
      .map((item) => {
        const description = item.description.trim();
        const normalizedDescription = this.normalizeFreeText(description);
        if (!normalizedDescription || existingDescriptions.has(normalizedDescription) || addedDescriptions.has(normalizedDescription)) {
          return null;
        }

        let code = item.code.trim().toUpperCase();
        if (!/^L\d+$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
          code = this.nextSequentialCode('L', existingCodes, addedCodes);
        }

        addedCodes.add(code);
        addedDescriptions.add(normalizedDescription);
        return { code, description };
      })
      .filter((item): item is { code: string; description: string } => item !== null);

    if (toAdd.length === 0) {
      return;
    }

    this.accidents.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextAccidentId,
        code: item.code,
        description: item.description,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiHazards(
    items: Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }>
  ): void {
    if (items.length === 0) {
      return;
    }

    const validLosses = new Set(this.accidents().map((item) => item.code.trim().toUpperCase()));
    const validUcas = new Set(this.availableUcas());
    const existingCodes = new Set(this.hazards().map((item) => item.code.trim().toUpperCase()));
    const existingDescriptions = new Set(this.hazards().map((item) => this.normalizeFreeText(item.description)));
    const addedCodes = new Set<string>();
    const addedDescriptions = new Set<string>();

    const toAdd = items
      .map((item) => {
        const description = item.description.trim();
        const normalizedDescription = this.normalizeFreeText(description);
        if (!normalizedDescription || existingDescriptions.has(normalizedDescription) || addedDescriptions.has(normalizedDescription)) {
          return null;
        }

        const linkedAccidents = item.linkedAccidents.filter((code) => validLosses.has(code.trim().toUpperCase()));
        if (linkedAccidents.length === 0) {
          return null;
        }

        const linkedUcas = validUcas.size > 0 ? item.linkedUcas.filter((uca) => validUcas.has(uca)) : item.linkedUcas;

        let code = item.code.trim().toUpperCase();
        if (!/^H\d+$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
          code = this.nextSequentialCode('H', existingCodes, addedCodes);
        }

        addedCodes.add(code);
        addedDescriptions.add(normalizedDescription);
        return {
          code,
          description,
          linkedAccidents,
          linkedUcas
        };
      })
      .filter(
        (item): item is { code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] } =>
          item !== null
      );

    if (toAdd.length === 0) {
      return;
    }

    this.hazards.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextHazardId,
        code: item.code,
        description: item.description,
        linkedAccidents: item.linkedAccidents,
        linkedUcas: item.linkedUcas,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiConstraints(items: Array<{ code: string; statement: string; linkedHazards: string[] }>): void {
    if (items.length === 0) {
      return;
    }

    const validHazards = new Set(this.hazards().map((item) => item.code.trim().toUpperCase()));
    const existingCodes = new Set(this.constraints().map((item) => item.code.trim().toUpperCase()));
    const existingStatements = new Set(this.constraints().map((item) => this.normalizeFreeText(item.statement)));
    const addedCodes = new Set<string>();
    const addedStatements = new Set<string>();

    const toAdd = items
      .map((item) => {
        const statement = item.statement.trim();
        const normalizedStatement = this.normalizeFreeText(statement);
        if (!normalizedStatement || existingStatements.has(normalizedStatement) || addedStatements.has(normalizedStatement)) {
          return null;
        }

        const linkedHazards = item.linkedHazards.filter((code) => validHazards.has(code.trim().toUpperCase()));
        if (linkedHazards.length === 0) {
          return null;
        }

        let code = item.code.trim().toUpperCase();
        if (!/^SC-\d{2}$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
          code = this.nextSequentialCode('SC-', existingCodes, addedCodes, 2);
        }

        addedCodes.add(code);
        addedStatements.add(normalizedStatement);
        return { code, statement, linkedHazards };
      })
      .filter((item): item is { code: string; statement: string; linkedHazards: string[] } => item !== null);

    if (toAdd.length === 0) {
      return;
    }

    this.constraints.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextConstraintId,
        code: item.code,
        statement: item.statement,
        linkedHazards: item.linkedHazards,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiResponsibilities(
    items: Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }>
  ): void {
    if (items.length === 0) {
      return;
    }

    const validConstraints = new Set(this.constraints().map((item) => item.code.trim().toUpperCase()));
    const existingCodes = new Set(this.responsibilities().map((item) => item.code.trim().toUpperCase()));
    const existingPairs = new Set(
      this.responsibilities().map(
        (item) => `${this.normalizeFreeText(item.component)}::${this.normalizeFreeText(item.responsibility)}`
      )
    );
    const addedCodes = new Set<string>();
    const addedPairs = new Set<string>();

    const toAdd = items
      .map((item) => {
        const component = item.component.trim();
        const responsibility = item.responsibility.trim();
        if (!component || !responsibility) {
          return null;
        }

        const key = `${this.normalizeFreeText(component)}::${this.normalizeFreeText(responsibility)}`;
        if (existingPairs.has(key) || addedPairs.has(key)) {
          return null;
        }

        const linkedConstraints = item.linkedConstraints.filter((code) => validConstraints.has(code.trim().toUpperCase()));
        if (linkedConstraints.length === 0) {
          return null;
        }

        let code = item.code.trim().toUpperCase();
        if (!/^R-\d{2}$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
          code = this.nextSequentialCode('R-', existingCodes, addedCodes, 2);
        }

        addedCodes.add(code);
        addedPairs.add(key);
        return { code, component, responsibility, linkedConstraints };
      })
      .filter(
        (item): item is { code: string; component: string; responsibility: string; linkedConstraints: string[] } =>
          item !== null
      );

    if (toAdd.length === 0) {
      return;
    }

    this.responsibilities.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextResponsibilityId,
        code: item.code,
        component: item.component,
        responsibility: item.responsibility,
        linkedConstraints: item.linkedConstraints,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private mergeAiArtefacts(items: Array<{ name: string; purpose: string; reference: string }>): void {
    if (items.length === 0) {
      return;
    }

    const existingNames = new Set(this.artefacts().map((item) => this.normalizeFreeText(item.name)));
    const addedNames = new Set<string>();

    const toAdd = items.filter((item) => {
      const normalizedName = this.normalizeFreeText(item.name);
      if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
        return false;
      }

      addedNames.add(normalizedName);
      return true;
    });

    if (toAdd.length === 0) {
      return;
    }

    this.artefacts.update((current) => [
      ...toAdd.map((item) => ({
        id: ++this.nextArtefactId,
        name: item.name,
        purpose: item.purpose,
        reference: item.reference,
        sourceType: 'ai' as const
      })),
      ...current
    ]);
  }

  private buildSystemDefinitionAiQuestion(
    primarySystemDefinitionDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    const stepOneContext = this.buildCurrentStepOneContext(stepOneInfo);
    const stepTwoContext = stepTwoInfo ?? {};

    return [
      'You are a Systems Engineering expert helping define Step 1.1.2 "System definition" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY THE FINAL SYSTEM DEFINITION TEXT.',
      'Do not include greetings, explanations, markdown formatting, labels, or any other text.',
      'Provide a single, concise, and actionable paragraph.',
      '',
      'Follow these directives exactly:',
      '1) PRIORITIZE the current user-written text from [PRIMARY SYSTEM DEFINITION DRAFT] as the main directive.',
      '2) Define what the system is, its operational purpose, and its core functions in the project context.',
      '3) Keep it high-level and socio-technical when relevant; avoid implementation details.',
      '4) Make it clearly usable as Step 1.1.2 output and consistent with the user draft and project context.',
      '5) Do not describe hazards, unsafe control actions, constraints, or mitigation strategies in detail.',
      '',
      'Important: The system-definition draft below is current user input and may be unsaved. Treat it as primary guidance.',
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT TO USE AS MAIN DIRECTIVE]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(stepOneContext, null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoContext, null, 2),
      '',
      'Output requirement: Output strictly the Step 1.1.2 system definition text, ready to be pasted programmatically into a database field.'
    ].join('\n');
  }

  private buildResourcesAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null,
    existingResources: ReferenceResource[]
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };
    const stepOneContext = this.buildCurrentStepOneContext(stepOneInfo);
    const stepTwoContext = stepTwoInfo ?? {};

    return [
      'You are a Systems Engineering expert helping define Step 1.1.3 "List resources needed" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"resources":[{"Resource name":"...","type":"...","reference (abnt) or link":"..."}]}',
      '',
      'Rules:',
      '1) Suggest resources needed to conduct the analysis (repositories/artifacts, manuals, standards, books, papers, images, prototypes, and related materials).',
      '2) Use the current analysis objectives and system definition as primary guidance.',
      '3) You may return multiple resources.',
      '4) Avoid duplicates by resource name.',
      '5) Prefer concise and specific names; when possible provide ABNT style reference or a link.',
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(stepOneContext, null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoContext, null, 2)
    ].join('\n');
  }

  private buildComponentsAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };
    const stepOneContext = this.buildCurrentStepOneContext(stepOneInfo);
    const stepTwoContext = stepTwoInfo ?? {};

    return [
      'You are a Systems Engineering expert helping define Step 1.1.5 "System components" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"components":[{"name":"...","description":"..."}]}',
      '',
      'Rules:',
      '1) This is an early scoping step: suggest only the most relevant high-level (coarse-grained) socio-technical components that define who/what participates in control and safety-related interactions.',
      '2) Do not decompose into detailed subcomponents yet; refinement will happen in later modelling/analysis iterations.',
      '3) Use the current analysis objectives, system definition, and system boundary as the primary guidance to keep the list consistent with the analysis scope.',
      '4) Prefer components that are useful as actors/controllers/controlled processes/channels for subsequent Step 1.2 safety analysis progression.',
      '5) You may return multiple components and must avoid duplicates by component name.',
      '6) Keep descriptions concise, operational, and analysis-oriented (what role the component plays in the socio-technical control structure).',
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(stepOneContext, null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoContext, null, 2)
    ].join('\n');
  }

  private requestAiResources(
    question: string,
    onResources: (items: Array<{ name: string; category: string; reference: string }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const items = this.extractAiResources(response);
          onResources(items);
        },
        error: (error) => {
          console.error('Failed to fetch AI resources from /api/ai/ask', error);
        }
      });
  }

  private requestAiComponents(
    question: string,
    onComponents: (items: Array<{ name: string; description: string }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const items = this.extractAiComponents(response);
          onComponents(items);
        },
        error: (error) => {
          console.error('Failed to fetch AI components from /api/ai/ask', error);
        }
      });
  }

  private extractAiResources(response: unknown): Array<{ name: string; category: string; reference: string }> {
    const fromObject = this.parseAiResourcesPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      return this.parseAiResourcesPayload(parsed);
    } catch {
      return [];
    }
  }

  private extractAiComponents(response: unknown): Array<{ name: string; description: string }> {
    const fromObject = this.parseAiComponentsPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      return this.parseAiComponentsPayload(parsed);
    } catch {
      return [];
    }
  }

  private parseAiResourcesPayload(payload: unknown): Array<{ name: string; category: string; reference: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];

    if (Array.isArray(payload)) {
      candidates.push(payload);
    }

    if (Array.isArray(record['resources'])) {
      candidates.push(record['resources']);
    }

    if (Array.isArray(record['Resources'])) {
      candidates.push(record['Resources']);
    }

    const parsedUnique: Array<{ name: string; category: string; reference: string }> = [];
    const names = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const name = this.pickString(item, [
          'Resource name',
          'resource name',
          'resourceName',
          'resource_name',
          'name',
          'resource',
          'title'
        ]);
        const category = this.pickString(item, ['type', 'category', 'kind']) || 'Reference';
        const reference =
          this.pickString(item, ['reference (abnt) or link', 'reference', 'abnt', 'link', 'url', 'citation']) ||
          'Reference pending';

        if (!name) {
          continue;
        }

        const normalizedName = this.normalizeResourceName(name);
        if (!normalizedName || names.has(normalizedName)) {
          continue;
        }

        names.add(normalizedName);
        parsedUnique.push({ name, category, reference });
      }
    }

    return parsedUnique;
  }

  private parseAiComponentsPayload(payload: unknown): Array<{ name: string; description: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];

    if (Array.isArray(payload)) {
      candidates.push(payload);
    }

    if (Array.isArray(record['components'])) {
      candidates.push(record['components']);
    }

    if (Array.isArray(record['Components'])) {
      candidates.push(record['Components']);
    }

    const parsedUnique: Array<{ name: string; description: string }> = [];
    const names = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const name = this.pickString(item, ['name', 'component', 'componentName', 'component_name']);
        const description = this.pickString(item, ['description', 'desc', 'details']) || 'Description not provided';

        if (!name) {
          continue;
        }

        const normalizedName = this.normalizeComponentName(name);
        if (!normalizedName || names.has(normalizedName)) {
          continue;
        }

        names.add(normalizedName);
        parsedUnique.push({ name, description });
      }
    }

    return parsedUnique;
  }

  private pickString(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private normalizeResourceName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeComponentName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  generateSystemBoundaryWithAi(): void {
    if (!this.canEdit114()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();

    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildSystemBoundaryAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiText(question, (text) => {
          this.systemBoundaryAiForm.patchValue({ systemBoundaryText: text });
          this.systemBoundaryAiModalForm.patchValue({ systemBoundaryText: text });
          this.selectedSystemBoundarySource.set('ai');
        });
      });
  }

  private buildSystemBoundaryAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    const stepOneContext = this.buildCurrentStepOneContext(stepOneInfo);
    const stepTwoContext = stepTwoInfo ?? {};

    return [
      'You are a Systems Engineering expert helping define Step 1.1.4 "System boundary" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY THE FINAL SYSTEM BOUNDARY TEXT.',
      'Do not include greetings, explanations, markdown formatting, labels, or any other text.',
      'Provide a single, concise, and actionable paragraph.',
      '',
      'Follow these directives exactly:',
      '1) Use the current analysis objectives and system definition as primary orientation.',
      '2) Define what is inside and outside the system boundary for the analysis scope.',
      '3) Focus on the portions where control can be exercised to implement safety strategies.',
      '4) Describe the operational start/end points of the boundary when applicable.',
      '5) Keep it high-level and avoid implementation details.',
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(stepOneContext, null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoContext, null, 2),
      '',
      'Output requirement: Output strictly the Step 1.1.4 system boundary text, ready to be pasted programmatically into a database field.'
    ].join('\n');
  }

  private requestAiText(question: string, onText: (text: string) => void): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const text = this.extractAiText(response);
          if (text) {
            onText(text);
          }
        },
        error: (error) => {
          console.error('Failed to fetch AI response from /api/ai/ask', error);
        }
      });
  }

  private extractAiText(response: unknown): string {
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

  private getNextId<T extends { id: number }>(items: T[]): number {
    return items.reduce((max, item) => Math.max(max, item.id), 0);
  }

  private applyEmptyPrefill(): void {
    this.generalSummaryForm.reset({
      systemDefinition: '',
      systemBoundary: ''
    });

    this.analysisObjectiveForm.reset({ objectivesText: '' });
    this.analysisObjectiveAiForm.reset({ objectivesText: '' });
    this.selectedObjectiveSource.set('manual');
    this.systemDefinitionAiForm.reset({ systemDefinitionText: '' });
    this.selectedSystemDefinitionSource.set('manual');
    this.systemBoundaryAiForm.reset({ systemBoundaryText: '' });
    this.selectedSystemBoundarySource.set('manual');
    this.resourceForm.reset({ name: '', category: '', reference: '' });
    this.componentForm.reset({ name: '', description: '' });
    this.accidentForm.reset({ code: '', description: '' });
    this.hazardForm.reset({ code: '', description: '', linkedAccidents: [], linkedUcas: [] });
    this.constraintForm.reset({ code: '', statement: '', linkedHazards: [] });
    this.responsibilityForm.reset({ code: '', component: '', responsibility: '', linkedConstraints: [] });
    this.artefactForm.reset({ name: '', purpose: '', reference: '' });
    this.resources.set([]);
    this.systemComponents.set([]);
    this.accidents.set([]);
    this.hazards.set([]);
    this.constraints.set([]);
    this.responsibilities.set([]);
    this.artefacts.set([]);

    this.nextResourceId = 0;
    this.nextComponentId = 0;
    this.nextAccidentId = 0;
    this.nextHazardId = 0;
    this.nextConstraintId = 0;
    this.nextResponsibilityId = 0;
    this.nextArtefactId = 0;
    this.safetyConcernsErrors.set([]);
  }

  private applyAiPrefill(): void {
    this.applyEmptyPrefill();

    const lorem = 'Lorem ipsum dolor sit amet.';
    const loremLong =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

    this.generalSummaryForm.setValue({
      systemDefinition: loremLong,
      systemBoundary: loremLong
    });
    this.systemDefinitionAiForm.setValue({ systemDefinitionText: loremLong });
    this.selectedSystemDefinitionSource.set('ai');
    this.systemBoundaryAiForm.setValue({ systemBoundaryText: loremLong });
    this.selectedSystemBoundarySource.set('ai');

    this.analysisObjectiveForm.setValue({ objectivesText: '' });
    this.analysisObjectiveAiForm.setValue({ objectivesText: loremLong });
    this.selectedObjectiveSource.set('ai');
    this.resourceForm.setValue({ name: lorem, category: lorem, reference: lorem });
    this.componentForm.setValue({ name: lorem, description: lorem });
    this.accidentForm.setValue({ code: 'L1', description: lorem });
    this.hazardForm.setValue({ code: 'H1', description: lorem, linkedAccidents: ['L1'], linkedUcas: [] });
    this.constraintForm.setValue({ code: 'SC-01', statement: `The system must not ${lorem.toLowerCase()}`, linkedHazards: ['H1'] });
    this.responsibilityForm.setValue({ code: 'R-01', component: lorem, responsibility: lorem, linkedConstraints: ['SC-01'] });
    this.artefactForm.setValue({ name: lorem, purpose: lorem, reference: lorem });
  }

  addObjective(): void {
    if (this.objectiveForm.invalid) {
      this.objectiveForm.markAllAsTouched();
      return;
    }

    const value = this.objectiveForm.getRawValue();
    this.objectives.update((current) => [
      {
        id: ++this.nextObjectiveId,
        focus: value.focus ?? 'Objective description pending refinement',
        stakeholder: value.stakeholder ?? 'Stakeholder',
        priority: (value.priority as AnalysisObjective['priority']) ?? 'Medium'
      },
      ...current
    ]);

    this.objectiveForm.reset({ priority: 'Medium' });
  }

  addResource(form: FormGroup = this.resourceForm as FormGroup): void {
    if (!this.canEdit113()) {
      return;
    }

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const value = form.getRawValue();
    this.resources.update((current) => [
      {
        id: ++this.nextResourceId,
        name: value.name ?? 'Resource name pending',
        category: value.category ?? 'Reference',
        reference: value.reference ?? 'Reference pending',
        sourceType: 'manual'
      },
      ...current
    ]);

    form.reset({ category: '' });
  }

  addComponent(form: FormGroup = this.componentForm as FormGroup): void {
    if (!this.canEdit115()) {
      return;
    }

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const value = form.getRawValue();
    this.systemComponents.update((current) => [
      {
        id: ++this.nextComponentId,
        name: value.name ?? 'Component',
        description: value.description ?? 'Description not provided',
        sourceType: 'manual'
      },
      ...current
    ]);

    form.reset();
  }

  removeResource(resourceId: number): void {
    this.resources.update((current) => current.filter((item) => item.id !== resourceId));
  }

  removeComponent(componentId: number): void {
    this.systemComponents.update((current) => current.filter((item) => item.id !== componentId));
  }

  generateComponentsWithAi(): void {
    if (!this.canEdit115()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildComponentsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiComponents(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const existingNames = new Set(this.systemComponents().map((item) => this.normalizeComponentName(item.name)));
          const addedNames = new Set<string>();

          const toAdd = items.filter((item) => {
            const normalizedName = this.normalizeComponentName(item.name);
            if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
              return false;
            }

            addedNames.add(normalizedName);
            return true;
          });

          if (toAdd.length === 0) {
            return;
          }

          this.systemComponents.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextComponentId,
              name: item.name,
              description: item.description,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateResourcesWithAi(): void {
    if (!this.canEdit113()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();

    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildResourcesAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          resume,
          stepOneInfo,
          stepTwoInfo,
          this.resources()
        );

        this.requestAiResources(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const existingNames = new Set(this.resources().map((item) => this.normalizeResourceName(item.name)));
          const addedNames = new Set<string>();

          const toAdd = items.filter((item) => {
            const normalizedName = this.normalizeResourceName(item.name);
            if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
              return false;
            }

            addedNames.add(normalizedName);
            return true;
          });

          if (toAdd.length === 0) {
            return;
          }

          this.resources.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextResourceId,
              name: item.name,
              category: item.category,
              reference: item.reference,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateLossesWithAi(): void {
    if (!this.canEditStep12()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.fetchAiProjectContext(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildLossesAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiLosses(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const existingCodes = new Set(this.accidents().map((item) => item.code.trim().toUpperCase()));
          const existingDescriptions = new Set(this.accidents().map((item) => this.normalizeFreeText(item.description)));
          const addedCodes = new Set<string>();
          const addedDescriptions = new Set<string>();

          const toAdd = items
            .map((item) => {
              const description = item.description.trim();
              const normalizedDescription = this.normalizeFreeText(description);
              if (!normalizedDescription || existingDescriptions.has(normalizedDescription) || addedDescriptions.has(normalizedDescription)) {
                return null;
              }

              let code = item.code.trim().toUpperCase();
              if (!/^L\d+$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
                code = this.nextSequentialCode('L', existingCodes, addedCodes);
              }

              addedCodes.add(code);
              addedDescriptions.add(normalizedDescription);
              return { code, description };
            })
            .filter((item): item is { code: string; description: string } => item !== null);

          if (toAdd.length === 0) {
            return;
          }

          this.accidents.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextAccidentId,
              code: item.code,
              description: item.description,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateHazardsWithAi(): void {
    if (!this.canEdit122()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.fetchAiProjectContext(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildHazardsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiHazards(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const validLosses = new Set(this.accidents().map((item) => item.code.trim().toUpperCase()));
          const validUcas = new Set(this.availableUcas());
          const existingCodes = new Set(this.hazards().map((item) => item.code.trim().toUpperCase()));
          const existingDescriptions = new Set(this.hazards().map((item) => this.normalizeFreeText(item.description)));
          const addedCodes = new Set<string>();
          const addedDescriptions = new Set<string>();

          const toAdd = items
            .map((item) => {
              const description = item.description.trim();
              const normalizedDescription = this.normalizeFreeText(description);
              if (!normalizedDescription || existingDescriptions.has(normalizedDescription) || addedDescriptions.has(normalizedDescription)) {
                return null;
              }

              const linkedAccidents = item.linkedAccidents.filter((code) => validLosses.has(code.trim().toUpperCase()));
              if (linkedAccidents.length === 0) {
                return null;
              }

              const linkedUcas = validUcas.size > 0
                ? item.linkedUcas.filter((uca) => validUcas.has(uca))
                : item.linkedUcas;

              let code = item.code.trim().toUpperCase();
              if (!/^H\d+$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
                code = this.nextSequentialCode('H', existingCodes, addedCodes);
              }

              addedCodes.add(code);
              addedDescriptions.add(normalizedDescription);
              return {
                code,
                description,
                linkedAccidents,
                linkedUcas
              };
            })
            .filter(
              (item): item is { code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] } =>
                item !== null
            );

          if (toAdd.length === 0) {
            return;
          }

          this.hazards.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextHazardId,
              code: item.code,
              description: item.description,
              linkedAccidents: item.linkedAccidents,
              linkedUcas: item.linkedUcas,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateConstraintsWithAi(): void {
    if (!this.canEdit123()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.fetchAiProjectContext(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildConstraintsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiConstraints(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const validHazards = new Set(this.hazards().map((item) => item.code.trim().toUpperCase()));
          const existingCodes = new Set(this.constraints().map((item) => item.code.trim().toUpperCase()));
          const existingStatements = new Set(this.constraints().map((item) => this.normalizeFreeText(item.statement)));
          const addedCodes = new Set<string>();
          const addedStatements = new Set<string>();

          const toAdd = items
            .map((item) => {
              const statement = item.statement.trim();
              const normalizedStatement = this.normalizeFreeText(statement);
              if (!normalizedStatement || existingStatements.has(normalizedStatement) || addedStatements.has(normalizedStatement)) {
                return null;
              }

              const linkedHazards = item.linkedHazards.filter((code) => validHazards.has(code.trim().toUpperCase()));
              if (linkedHazards.length === 0) {
                return null;
              }

              let code = item.code.trim().toUpperCase();
              if (!/^SC-\d{2}$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
                code = this.nextSequentialCode('SC-', existingCodes, addedCodes, 2);
              }

              addedCodes.add(code);
              addedStatements.add(normalizedStatement);
              return { code, statement, linkedHazards };
            })
            .filter((item): item is { code: string; statement: string; linkedHazards: string[] } => item !== null);

          if (toAdd.length === 0) {
            return;
          }

          this.constraints.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextConstraintId,
              code: item.code,
              statement: item.statement,
              linkedHazards: item.linkedHazards,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateResponsibilitiesWithAi(): void {
    if (!this.canEdit124()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.fetchAiProjectContext(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildResponsibilitiesAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiResponsibilities(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const validConstraints = new Set(this.constraints().map((item) => item.code.trim().toUpperCase()));
          const existingCodes = new Set(this.responsibilities().map((item) => item.code.trim().toUpperCase()));
          const existingPairs = new Set(
            this.responsibilities().map(
              (item) => `${this.normalizeFreeText(item.component)}::${this.normalizeFreeText(item.responsibility)}`
            )
          );
          const addedCodes = new Set<string>();
          const addedPairs = new Set<string>();

          const toAdd = items
            .map((item) => {
              const component = item.component.trim();
              const responsibility = item.responsibility.trim();
              if (!component || !responsibility) {
                return null;
              }

              const key = `${this.normalizeFreeText(component)}::${this.normalizeFreeText(responsibility)}`;
              if (existingPairs.has(key) || addedPairs.has(key)) {
                return null;
              }

              const linkedConstraints = item.linkedConstraints.filter((code) =>
                validConstraints.has(code.trim().toUpperCase())
              );
              if (linkedConstraints.length === 0) {
                return null;
              }

              let code = item.code.trim().toUpperCase();
              if (!/^R-\d{2}$/.test(code) || existingCodes.has(code) || addedCodes.has(code)) {
                code = this.nextSequentialCode('R-', existingCodes, addedCodes, 2);
              }

              addedCodes.add(code);
              addedPairs.add(key);
              return { code, component, responsibility, linkedConstraints };
            })
            .filter(
              (item): item is { code: string; component: string; responsibility: string; linkedConstraints: string[] } =>
                item !== null
            );

          if (toAdd.length === 0) {
            return;
          }

          this.responsibilities.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextResponsibilityId,
              code: item.code,
              component: item.component,
              responsibility: item.responsibility,
              linkedConstraints: item.linkedConstraints,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  generateArtefactsWithAi(): void {
    if (!this.canEdit125()) {
      return;
    }

    const projectId = this.currentProjectId();
    const primaryObjectives = (this.getSelectedObjectivesText() ?? '').trim();
    const primarySystemDefinitionDraft = (this.getSelectedSystemDefinitionText() ?? '').trim();
    const primarySystemBoundaryDraft = (this.getSelectedSystemBoundaryText() ?? '').trim();

    this.fetchAiProjectContext(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resume, stepOneInfo, stepTwoInfo }) => {
        const question = this.buildArtefactsAiQuestion(
          primaryObjectives,
          primarySystemDefinitionDraft,
          primarySystemBoundaryDraft,
          resume,
          stepOneInfo,
          stepTwoInfo
        );

        this.requestAiArtefacts(question, (items) => {
          if (items.length === 0) {
            return;
          }

          const existingNames = new Set(this.artefacts().map((item) => this.normalizeFreeText(item.name)));
          const addedNames = new Set<string>();

          const toAdd = items.filter((item) => {
            const normalizedName = this.normalizeFreeText(item.name);
            if (!normalizedName || existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
              return false;
            }
            addedNames.add(normalizedName);
            return true;
          });

          if (toAdd.length === 0) {
            return;
          }

          this.artefacts.update((current) => [
            ...toAdd.map((item) => ({
              id: ++this.nextArtefactId,
              name: item.name,
              purpose: item.purpose,
              reference: item.reference,
              sourceType: 'ai' as const
            })),
            ...current
          ]);
        });
      });
  }

  private fetchAiProjectContext(projectId: number | null): Observable<{
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null;
    stepOneInfo: Record<string, unknown> | null;
    stepTwoInfo: Record<string, unknown> | null;
  }> {
    const resume$ = this.projectService.listOpenResumes().pipe(
      map((projects) => projects.find((project) => project.id === projectId) ?? null),
      switchMap((resumeProject) => {
        if (resumeProject || !projectId) {
          return of(resumeProject);
        }

        return this.projectService.list().pipe(
          map((projects) => projects.find((project) => project.id === projectId) ?? null),
          catchError((error) => {
            console.error('Failed to load project fallback context from GET /api/projects', error);
            return of(null);
          })
        );
      }),
      catchError((error) => {
        console.error('Failed to load project resume from GET /api/project-resume', error);
        return of(null);
      })
    );

    const stepOneInfo$ = projectId
      ? this.projectService.getStepOneScope(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 1 scope context from GET /api/projects/step_one_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    const stepTwoInfo$ = projectId
      ? this.projectService.getStepTwoInformation(projectId).pipe(
          catchError((error) => {
            console.error(
              `Failed to load Step 2 context from GET /api/projects/step_two_project_information/${projectId}`,
              error
            );
            return of(null);
          })
        )
      : of(null);

    return forkJoin({ resume: resume$, stepOneInfo: stepOneInfo$, stepTwoInfo: stepTwoInfo$ });
  }

  private buildLossesAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    return [
      'You are a Systems Engineering expert helping define Step 1.2.1 "Identify losses" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"losses":[{"code":"L1","description":"..."}]}',
      '',
      'Rules:',
      '1) A loss is a negative unacceptable outcome affecting stakeholder value (e.g., injury, death, mission failure, environmental harm, privacy/reputation damage).',
      '2) Use identifier format Lx (L1, L2, ...).',
      '3) Keep losses system-level and avoid individual component causes or terms like "human error".',
      '4) Return multiple losses when relevant and avoid duplicates.',
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(this.buildCurrentStepOneContext(stepOneInfo), null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoInfo ?? {}, null, 2)
    ].join('\n');
  }

  private buildHazardsAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    return [
      'You are a Systems Engineering expert helping define Step 1.2.2 "Identify system-level hazards" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"hazards":[{"code":"H1","description":"...","linkedLosses":["L1"],"linkedUcas":["..."]}]}',
      '',
      'Rules:',
      '1) Hazards are system states/conditions that can lead to losses in worst-case conditions.',
      '2) Use identifier format Hx (H1, H2, ...).',
      '3) Each hazard must include at least one linked loss code in linkedLosses.',
      '4) Avoid individual component references in hazard descriptions.',
      '5) Include linkedUcas when available, otherwise return an empty array for linkedUcas.',
      '',
      '[CURRENT LOSSES ALREADY ADDED]',
      JSON.stringify(this.accidents(), null, 2),
      '',
      '[AVAILABLE UCAS]',
      JSON.stringify(this.availableUcas(), null, 2),
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(this.buildCurrentStepOneContext(stepOneInfo), null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoInfo ?? {}, null, 2)
    ].join('\n');
  }

  private buildConstraintsAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    return [
      'You are a Systems Engineering expert helping define Step 1.2.3 "Identify safety constraints" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"constraints":[{"code":"SC-01","statement":"The system must not ...","linkedHazards":["H1"]}]}',
      '',
      'Rules:',
      '1) Constraints must be high-level and traceable to one or more hazards.',
      '2) Use identifier format SC-xx (SC-01, SC-02, ...).',
      '3) Focus on what must not be violated; avoid implementation details or specific technical solutions.',
      '4) Each constraint must include at least one linked hazard in linkedHazards.',
      '',
      '[CURRENT HAZARDS ALREADY ADDED]',
      JSON.stringify(this.hazards(), null, 2),
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(this.buildCurrentStepOneContext(stepOneInfo), null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoInfo ?? {}, null, 2)
    ].join('\n');
  }

  private buildResponsibilitiesAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    return [
      'You are a Systems Engineering expert helping define Step 1.2.4 "Define responsibilities" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"responsibilities":[{"code":"R-01","component":"...","responsibility":"...","linkedConstraints":["SC-01"]}]}',
      '',
      'Rules:',
      '1) Responsibilities refine safety constraints and assign concrete duties to actors/components from system components.',
      '2) Use identifier format R-xx (R-01, R-02, ...).',
      '3) Each responsibility must include at least one linked constraint in linkedConstraints.',
      '4) Keep responsibilities actionable and aligned with enforcing safety constraints.',
      '',
      '[CURRENT SYSTEM COMPONENTS ALREADY ADDED]',
      JSON.stringify(this.systemComponents(), null, 2),
      '',
      '[CURRENT SAFETY CONSTRAINTS ALREADY ADDED]',
      JSON.stringify(this.constraints(), null, 2),
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(this.buildCurrentStepOneContext(stepOneInfo), null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoInfo ?? {}, null, 2)
    ].join('\n');
  }

  private buildArtefactsAiQuestion(
    primaryObjectives: string,
    primarySystemDefinitionDraft: string,
    primarySystemBoundaryDraft: string,
    resume: { name?: string | null; domain?: string | null; owner?: string | null; description?: string | null } | null,
    stepOneInfo: Record<string, unknown> | null,
    stepTwoInfo: Record<string, unknown> | null
  ): string {
    const safePrimaryObjectives = primaryObjectives || 'No analysis objectives text provided yet by the user.';
    const safePrimarySystemDefinitionDraft =
      primarySystemDefinitionDraft || 'No system definition text provided yet by the user.';
    const safePrimarySystemBoundaryDraft = primarySystemBoundaryDraft || 'No system boundary text provided yet by the user.';
    const resumeContext = {
      name: resume?.name ?? '',
      domain: resume?.domain ?? '',
      owner: resume?.owner ?? '',
      description: resume?.description ?? ''
    };

    return [
      'You are a Systems Engineering expert helping define Step 1.2.5 "Define other relevant artefacts" for a project.',
      '',
      'CRITICAL INSTRUCTION: RETURN ONLY VALID JSON. No markdown, no explanations, no extra text.',
      'Return a JSON object with this exact shape:',
      '{"artefacts":[{"name":"...","purpose":"...","reference":"..."}]}',
      '',
      'Rules:',
      '1) Suggest relevant artefacts that support the system safety analysis (manuals, standards, checklists, procedures, architecture docs, test evidence, etc.).',
      '2) Keep purpose concise and directly related to safety analysis use.',
      '3) Prefer specific references or links when available.',
      '4) Avoid duplicates by artefact name.',
      '',
      '[CURRENT ARTEFACTS ALREADY ADDED]',
      JSON.stringify(this.artefacts(), null, 2),
      '',
      '[PRIMARY ANALYSIS OBJECTIVES - CURRENT TEXT]',
      safePrimaryObjectives,
      '',
      '[PRIMARY SYSTEM DEFINITION DRAFT - CURRENT TEXT]',
      safePrimarySystemDefinitionDraft,
      '',
      '[PRIMARY SYSTEM BOUNDARY DRAFT - CURRENT TEXT]',
      safePrimarySystemBoundaryDraft,
      '',
      '[PROJECT RESUME CONTEXT - FROM /api/project-resume fields]',
      JSON.stringify(resumeContext, null, 2),
      '',
      '[STEP 1 CONTEXT - CURRENT STEP 1 FORM STATE (SAVED OR UNSAVED), WITH API FALLBACK]',
      JSON.stringify(this.buildCurrentStepOneContext(stepOneInfo), null, 2),
      '',
      '[STEP 2 CONTEXT - FROM GET /api/projects/step_two_project_information/{id}]',
      JSON.stringify(stepTwoInfo ?? {}, null, 2)
    ].join('\n');
  }

  private requestAiLosses(question: string, onItems: (items: Array<{ code: string; description: string }>) => void): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => onItems(this.extractAiLosses(response)),
        error: (error) => {
          console.error('Failed to fetch AI losses from /api/ai/ask', error);
        }
      });
  }

  private requestAiHazards(
    question: string,
    onItems: (items: Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => onItems(this.extractAiHazards(response)),
        error: (error) => {
          console.error('Failed to fetch AI hazards from /api/ai/ask', error);
        }
      });
  }

  private requestAiConstraints(
    question: string,
    onItems: (items: Array<{ code: string; statement: string; linkedHazards: string[] }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => onItems(this.extractAiConstraints(response)),
        error: (error) => {
          console.error('Failed to fetch AI constraints from /api/ai/ask', error);
        }
      });
  }

  private requestAiResponsibilities(
    question: string,
    onItems: (items: Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => onItems(this.extractAiResponsibilities(response)),
        error: (error) => {
          console.error('Failed to fetch AI responsibilities from /api/ai/ask', error);
        }
      });
  }

  private requestAiArtefacts(
    question: string,
    onItems: (items: Array<{ name: string; purpose: string; reference: string }>) => void
  ): void {
    this.aiAssistant
      .ask({ question })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => onItems(this.extractAiArtefacts(response)),
        error: (error) => {
          console.error('Failed to fetch AI artefacts from /api/ai/ask', error);
        }
      });
  }

  private extractAiLosses(response: unknown): Array<{ code: string; description: string }> {
    const fromObject = this.parseAiLossesPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      return this.parseAiLossesPayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }

  private extractAiHazards(response: unknown): Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }> {
    const fromObject = this.parseAiHazardsPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      return this.parseAiHazardsPayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }

  private extractAiConstraints(response: unknown): Array<{ code: string; statement: string; linkedHazards: string[] }> {
    const fromObject = this.parseAiConstraintsPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      return this.parseAiConstraintsPayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }

  private extractAiResponsibilities(response: unknown): Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }> {
    const fromObject = this.parseAiResponsibilitiesPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      return this.parseAiResponsibilitiesPayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }

  private extractAiArtefacts(response: unknown): Array<{ name: string; purpose: string; reference: string }> {
    const fromObject = this.parseAiArtefactsPayload(response);
    if (fromObject.length > 0) {
      return fromObject;
    }

    const text = this.extractAiText(response);
    if (!text) {
      return [];
    }

    try {
      return this.parseAiArtefactsPayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }

  private parseAiLossesPayload(payload: unknown): Array<{ code: string; description: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(payload)) {
      candidates.push(payload);
    }
    if (Array.isArray(record['losses'])) {
      candidates.push(record['losses']);
    }
    if (Array.isArray(record['accidents'])) {
      candidates.push(record['accidents']);
    }

    const parsed: Array<{ code: string; description: string }> = [];
    const keys = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const code = (this.pickString(item, ['code', 'id']) || '').toUpperCase();
        const description = this.pickString(item, ['description', 'loss', 'accident', 'statement']);
        if (!description) {
          continue;
        }

        const key = `${code}::${this.normalizeFreeText(description)}`;
        if (keys.has(key)) {
          continue;
        }

        keys.add(key);
        parsed.push({ code, description });
      }
    }

    return parsed;
  }

  private parseAiHazardsPayload(payload: unknown): Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(payload)) {
      candidates.push(payload);
    }
    if (Array.isArray(record['hazards'])) {
      candidates.push(record['hazards']);
    }

    const parsed: Array<{ code: string; description: string; linkedAccidents: string[]; linkedUcas: string[] }> = [];
    const keys = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const code = (this.pickString(item, ['code', 'id']) || '').toUpperCase();
        const description = this.pickString(item, ['description', 'hazard', 'state']);
        const linkedAccidents = this.pickStringArray(item, ['linkedLosses', 'linkedAccidents', 'losses', 'accidents']);
        const linkedUcas = this.pickStringArray(item, ['linkedUcas', 'ucas']);

        if (!description) {
          continue;
        }

        const key = `${code}::${this.normalizeFreeText(description)}`;
        if (keys.has(key)) {
          continue;
        }

        keys.add(key);
        parsed.push({ code, description, linkedAccidents, linkedUcas });
      }
    }

    return parsed;
  }

  private parseAiConstraintsPayload(payload: unknown): Array<{ code: string; statement: string; linkedHazards: string[] }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(payload)) {
      candidates.push(payload);
    }
    if (Array.isArray(record['constraints'])) {
      candidates.push(record['constraints']);
    }
    if (Array.isArray(record['safetyConstraints'])) {
      candidates.push(record['safetyConstraints']);
    }

    const parsed: Array<{ code: string; statement: string; linkedHazards: string[] }> = [];
    const keys = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const code = (this.pickString(item, ['code', 'id']) || '').toUpperCase();
        const statement = this.pickString(item, ['statement', 'description', 'constraint']);
        const linkedHazards = this.pickStringArray(item, ['linkedHazards', 'hazards']);
        if (!statement) {
          continue;
        }

        const key = `${code}::${this.normalizeFreeText(statement)}`;
        if (keys.has(key)) {
          continue;
        }

        keys.add(key);
        parsed.push({ code, statement, linkedHazards });
      }
    }

    return parsed;
  }

  private parseAiResponsibilitiesPayload(
    payload: unknown
  ): Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(payload)) {
      candidates.push(payload);
    }
    if (Array.isArray(record['responsibilities'])) {
      candidates.push(record['responsibilities']);
    }

    const parsed: Array<{ code: string; component: string; responsibility: string; linkedConstraints: string[] }> = [];
    const keys = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const code = (this.pickString(item, ['code', 'id']) || '').toUpperCase();
        const component = this.pickString(item, ['component', 'actor', 'entity']);
        const responsibility = this.pickString(item, ['responsibility', 'description', 'duty']);
        const linkedConstraints = this.pickStringArray(item, ['linkedConstraints', 'constraints']);

        if (!component || !responsibility) {
          continue;
        }

        const key = `${code}::${this.normalizeFreeText(component)}::${this.normalizeFreeText(responsibility)}`;
        if (keys.has(key)) {
          continue;
        }

        keys.add(key);
        parsed.push({ code, component, responsibility, linkedConstraints });
      }
    }

    return parsed;
  }

  private parseAiArtefactsPayload(payload: unknown): Array<{ name: string; purpose: string; reference: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(payload)) {
      candidates.push(payload);
    }
    if (Array.isArray(record['artefacts'])) {
      candidates.push(record['artefacts']);
    }
    if (Array.isArray(record['artifacts'])) {
      candidates.push(record['artifacts']);
    }

    const parsed: Array<{ name: string; purpose: string; reference: string }> = [];
    const keys = new Set<string>();

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      for (const entry of candidate) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const name = this.pickString(item, ['name', 'artefact', 'artifact', 'title']);
        const purpose = this.pickString(item, ['purpose', 'description', 'use']) || 'Purpose pending refinement';
        const reference = this.pickString(item, ['reference', 'link', 'url', 'citation']) || 'Reference pending';

        if (!name) {
          continue;
        }

        const key = this.normalizeFreeText(name);
        if (keys.has(key)) {
          continue;
        }

        keys.add(key);
        parsed.push({ name, purpose, reference });
      }
    }

    return parsed;
  }

  private pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
    for (const key of keys) {
      const value = record[key];

      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }

      if (typeof value === 'string' && value.trim()) {
        return value
          .replace(/[\[\]]/g, '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
    }

    return [];
  }

  private normalizeFreeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private nextSequentialCode(prefix: 'L' | 'H' | 'SC-' | 'R-', existingCodes: Set<string>, addedCodes: Set<string>, pad = 0): string {
    let index = 1;
    while (true) {
      const suffix = pad > 0 ? String(index).padStart(pad, '0') : String(index);
      const candidate = `${prefix}${suffix}`;
      if (!existingCodes.has(candidate) && !addedCodes.has(candidate)) {
        return candidate;
      }
      index += 1;
    }
  }

  addAccident(): void {
    if (!this.canEditStep12()) {
      return;
    }

    if (this.accidentForm.invalid) {
      this.accidentForm.markAllAsTouched();
      return;
    }

    const value = this.accidentForm.getRawValue();
    const code = (value.code ?? '').trim();
    const description = (value.description ?? '').trim();

    if (!/^L\d+$/.test(code)) {
      this.accidentForm.controls.code.setErrors({ pattern: true });
      return;
    }

    if (this.accidents().some((item) => item.code === code)) {
      this.accidentForm.controls.code.setErrors({ duplicate: true });
      return;
    }

    this.accidents.update((current) => [
      {
        id: ++this.nextAccidentId,
        code,
        description,
        sourceType: 'manual'
      },
      ...current
    ]);

    this.accidentForm.reset({ code: '', description: '' });
    this.safetyConcernsErrors.set([]);
  }

  addHazard(): void {
    if (!this.canEdit122()) {
      return;
    }

    if (this.hazardForm.invalid) {
      this.hazardForm.markAllAsTouched();
      return;
    }

    const value = this.hazardForm.getRawValue();
    const code = (value.code ?? '').trim();
    const description = (value.description ?? '').trim();
    const linkedAccidents = value.linkedAccidents ?? [];
    const linkedUcas = value.linkedUcas ?? [];

    if (!/^H\d+$/.test(code)) {
      this.hazardForm.controls.code.setErrors({ pattern: true });
      return;
    }

    if (this.hazards().some((item) => item.code === code)) {
      this.hazardForm.controls.code.setErrors({ duplicate: true });
      return;
    }

    if (linkedAccidents.length === 0) {
      this.hazardForm.controls.linkedAccidents.setErrors({ required: true });
      return;
    }

    this.hazards.update((current) => [
      {
        id: ++this.nextHazardId,
        code,
        description,
        linkedAccidents: [...linkedAccidents],
        linkedUcas: [...linkedUcas],
        sourceType: 'manual'
      },
      ...current
    ]);

    this.hazardForm.reset({ code: '', description: '', linkedAccidents: [], linkedUcas: [] });
    this.safetyConcernsErrors.set([]);
  }

  addConstraint(): void {
    if (!this.canEdit123()) {
      return;
    }

    if (this.constraintForm.invalid) {
      this.constraintForm.markAllAsTouched();
      return;
    }

    const value = this.constraintForm.getRawValue();
    const code = (value.code ?? '').trim();
    const statement = (value.statement ?? '').trim();
    const linkedHazards = value.linkedHazards ?? [];

    if (!/^SC-\d{2}$/.test(code)) {
      this.constraintForm.controls.code.setErrors({ pattern: true });
      return;
    }

    if (this.constraints().some((item) => item.code === code)) {
      this.constraintForm.controls.code.setErrors({ duplicate: true });
      return;
    }

    if (linkedHazards.length === 0) {
      this.constraintForm.controls.linkedHazards.setErrors({ required: true });
      return;
    }

    this.constraints.update((current) => [
      {
        id: ++this.nextConstraintId,
        code,
        statement,
        linkedHazards: [...linkedHazards],
        sourceType: 'manual'
      },
      ...current
    ]);

    this.constraintForm.reset({ code: '', statement: '', linkedHazards: [] });
    this.safetyConcernsErrors.set([]);
  }

  addResponsibility(): void {
    if (!this.canEdit124()) {
      return;
    }

    if (this.responsibilityForm.invalid) {
      this.responsibilityForm.markAllAsTouched();
      return;
    }

    const value = this.responsibilityForm.getRawValue();
    const code = (value.code ?? '').trim();
    const component = (value.component ?? '').trim();
    const responsibility = (value.responsibility ?? '').trim();
    const linkedConstraints = value.linkedConstraints ?? [];

    if (!/^R-\d{2}$/.test(code)) {
      this.responsibilityForm.controls.code.setErrors({ pattern: true });
      return;
    }

    if (this.responsibilities().some((item) => item.code === code)) {
      this.responsibilityForm.controls.code.setErrors({ duplicate: true });
      return;
    }

    if (linkedConstraints.length === 0) {
      this.responsibilityForm.controls.linkedConstraints.setErrors({ required: true });
      return;
    }

    this.responsibilities.update((current) => [
      {
        id: ++this.nextResponsibilityId,
        code,
        component,
        responsibility,
        linkedConstraints: [...linkedConstraints],
        sourceType: 'manual'
      },
      ...current
    ]);

    this.responsibilityForm.reset({ code: '', component: '', responsibility: '', linkedConstraints: [] });
    this.safetyConcernsErrors.set([]);
  }

  removeAccident(accidentId: number): void {
    const removed = this.accidents().find((item) => item.id === accidentId);
    if (!removed) {
      return;
    }

    this.accidents.update((current) => current.filter((item) => item.id !== accidentId));
    this.hazards.update((current) =>
      current.map((hazard) => ({
        ...hazard,
        linkedAccidents: hazard.linkedAccidents.filter((code) => code !== removed.code)
      }))
    );
  }

  removeHazard(hazardId: number): void {
    const removed = this.hazards().find((item) => item.id === hazardId);
    if (!removed) {
      return;
    }

    this.hazards.update((current) => current.filter((item) => item.id !== hazardId));
    this.constraints.update((current) =>
      current.map((constraint) => ({
        ...constraint,
        linkedHazards: constraint.linkedHazards.filter((code) => code !== removed.code)
      }))
    );
  }

  removeConstraint(constraintId: number): void {
    const removed = this.constraints().find((item) => item.id === constraintId);
    if (!removed) {
      return;
    }

    this.constraints.update((current) => current.filter((item) => item.id !== constraintId));
    this.responsibilities.update((current) =>
      current.map((responsibility) => ({
        ...responsibility,
        linkedConstraints: responsibility.linkedConstraints.filter((code) => code !== removed.code)
      }))
    );
  }

  removeResponsibility(responsibilityId: number): void {
    this.responsibilities.update((current) => current.filter((item) => item.id !== responsibilityId));
  }

  private atLeastOneSelectionValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (Array.isArray(value) && value.length > 0) {
        return null;
      }
      return { required: true };
    };
  }

  private hasMeaningfulText(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private accidentDescriptionValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const text = String(control.value ?? '').toLowerCase();
      if (!text.trim()) {
        return null;
      }

      const bannedTerms = ['human error', 'operator error', 'pump', 'sensor', 'controller', 'component'];
      if (bannedTerms.some((term) => text.includes(term))) {
        return { componentOrCauseReference: true };
      }

      return null;
    };
  }

  private hazardDescriptionValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const text = String(control.value ?? '').toLowerCase();
      if (!text.trim()) {
        return null;
      }

      const componentNames = this.systemComponents()
        .map((item) => item.name.toLowerCase())
        .filter((name) => name.trim().length > 0);
      if (componentNames.some((name) => text.includes(name))) {
        return { componentReference: true };
      }

      return null;
    };
  }

  private constraintStatementValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const statement = String(control.value ?? '').trim().toLowerCase();
      if (!statement) {
        return null;
      }

      const isNegation =
        statement.includes(' must not ') || statement.startsWith('must not ') || statement.includes(' shall not ') || statement.startsWith('shall not ') || statement.includes(' cannot ') || statement.startsWith('cannot ');
      if (!isNegation) {
        return { negationRequired: true };
      }

      const implementationTerms = ['algorithm', 'implementation', 'code', 'ui', 'database', 'api'];
      if (implementationTerms.some((term) => statement.includes(term))) {
        return { implementationDetail: true };
      }

      return null;
    };
  }

  private validateSafetyConcerns(): string[] {
    const errors: string[] = [];
    const accidentCodes = new Set(this.accidents().map((item) => item.code));
    const hazardCodes = new Set(this.hazards().map((item) => item.code));
    const constraintCodes = new Set(this.constraints().map((item) => item.code));

    for (const hazard of this.hazards()) {
      if (!hazard.linkedAccidents.length) {
        errors.push(`Hazard '${hazard.code}' must be linked to at least one accident.`);
      }

      for (const linkedAccident of hazard.linkedAccidents) {
        if (!accidentCodes.has(linkedAccident)) {
          errors.push(`Hazard '${hazard.code}' references unknown accident '${linkedAccident}'.`);
        }
      }
    }

    for (const constraint of this.constraints()) {
      if (!constraint.linkedHazards.length) {
        errors.push(`Safety constraint '${constraint.code}' must be linked to at least one hazard.`);
      }

      for (const linkedHazard of constraint.linkedHazards) {
        if (!hazardCodes.has(linkedHazard)) {
          errors.push(`Safety constraint '${constraint.code}' references unknown hazard '${linkedHazard}'.`);
        }
      }
    }

    for (const responsibility of this.responsibilities()) {
      if (!responsibility.component.trim()) {
        errors.push(`Responsibility '${responsibility.code}' must target a specific actor/component.`);
      }

      if (!responsibility.linkedConstraints.length) {
        errors.push(`Responsibility '${responsibility.code}' must address at least one safety constraint.`);
      }

      for (const linkedConstraint of responsibility.linkedConstraints) {
        if (!constraintCodes.has(linkedConstraint)) {
          errors.push(`Responsibility '${responsibility.code}' references unknown safety constraint '${linkedConstraint}'.`);
        }
      }
    }

    if (this.availableUcas().length > 0) {
      const linkedUcas = new Set(this.hazards().flatMap((hazard) => hazard.linkedUcas));
      for (const uca of this.availableUcas()) {
        if (!linkedUcas.has(uca)) {
          errors.push(`UCA '${uca}' must be linked to at least one hazard.`);
        }
      }
    }

    return errors;
  }

  addArtefact(): void {
    if (!this.canEdit125()) {
      return;
    }

    if (this.artefactForm.invalid) {
      this.artefactForm.markAllAsTouched();
      return;
    }

    const value = this.artefactForm.getRawValue();
    this.artefacts.update((current) => [
      {
        id: ++this.nextArtefactId,
        name: value.name ?? 'Artefact',
        purpose: value.purpose ?? 'Purpose pending refinement',
        reference: value.reference ?? 'Reference pending',
        sourceType: 'manual'
      },
      ...current
    ]);

    this.artefactForm.reset();
  }

  removeArtefact(artefactId: number): void {
    this.artefacts.update((current) => current.filter((item) => item.id !== artefactId));
  }
}