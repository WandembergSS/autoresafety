import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
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

interface ReferenceResource {
  id: number;
  name: string;
  category: string;
  reference: string;
}

interface Step1ResourceDto extends ReferenceResource {
  sourceType?: 'manual' | 'standard' | 'repo' | 'paper';
  rationale?: string;
}

interface SystemComponentEntry {
  id: number;
  name: string;
  description: string;
}

interface Step1SystemComponentDto extends SystemComponentEntry {
  rationale?: string;
}

interface AccidentEntry {
  id: number;
  code: string;
  description: string;
}

interface Step1AccidentDto extends AccidentEntry {
  rationale?: string;
}

interface HazardEntry {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string;
}

interface Step1HazardDto {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string[];
  rationale?: string;
}

interface SafetyConstraintEntry {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string;
}

interface Step1SafetyConstraintDto {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string[];
  rationale?: string;
}

interface ResponsibilityEntry {
  id: number;
  component: string;
  responsibility: string;
  linkedConstraints: string;
}

interface Step1ResponsibilityDto {
  id: number;
  component: string;
  responsibility: string;
  linkedConstraints: string[];
  rationale?: string;
}

interface ArtefactEntry {
  id: number;
  name: string;
  purpose: string;
  reference: string;
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
  private readonly destroyRef = inject(DestroyRef);

  readonly generalSummaryForm = this.fb.group({
    systemDefinition: [
      'The IIP is a safety-critical device that automates basal and bolus insulin delivery to support Type 1 Diabetes management.',
      Validators.required
    ],
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

  readonly analysisObjectiveModalForm = this.fb.group({
    objectivesText: ['']
  });

  readonly systemDefinitionModalForm = this.fb.group({
    systemDefinitionText: ['']
  });

  readonly systemBoundaryModalForm = this.fb.group({
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
    code: ['', Validators.required],
    description: ['', Validators.required]
  });

  readonly hazardForm = this.fb.group({
    code: ['', Validators.required],
    description: ['', Validators.required],
    linkedAccidents: ['', Validators.required]
  });

  readonly constraintForm = this.fb.group({
    code: ['', Validators.required],
    statement: ['', Validators.required],
    linkedHazards: ['', Validators.required]
  });

  readonly responsibilityForm = this.fb.group({
    component: ['', Validators.required],
    responsibility: ['', Validators.required],
    linkedConstraints: ['', Validators.required]
  });

  readonly artefactForm = this.fb.group({
    name: ['', Validators.required],
    purpose: ['', Validators.required],
    reference: ['', Validators.required]
  });

  private nextObjectiveId = 2;
  private nextResourceId = 4;
  private nextComponentId = 4;
  private nextAccidentId = 2;
  private nextHazardId = 2;
  private nextConstraintId = 2;
  private nextResponsibilityId = 7;
  private nextArtefactId = 2;

  readonly objectives = signal<AnalysisObjective[]>([
    {
      id: 1,
      focus: 'Ensure the RESafety iteration clarifies scope for high-risk insulin delivery scenarios.',
      stakeholder: 'Safety Engineering Lead',
      priority: 'High'
    },
    {
      id: 2,
      focus: 'Capture baseline data flows to align future iStar4Safety and STPA artefacts.',
      stakeholder: 'Systems Architect',
      priority: 'Medium'
    }
  ]);

  readonly resources = signal<ReferenceResource[]>([
    {
      id: 1,
      name: 'Martinazzo (2022) – STPA of Insulin Pumps',
      category: 'Manual',
      reference: 'martinazzo-2022-stpa-insulin.pdf'
    },
    {
      id: 2,
      name: 'Leveson & Thomas (2018)',
      category: 'Book',
      reference: 'Engineering a Safer World'
    },
    {
      id: 3,
      name: 'Manufacturer user manual (Medtronic 780G)',
      category: 'Manual',
      reference: 'https://www.medtronic.com/us-manual'
    }
  ]);

  readonly systemComponents = signal<SystemComponentEntry[]>([
    {
      id: 1,
      name: 'Patient (Human Controller)',
      description: 'Configures infusion parameters and supervises therapy.'
    },
    {
      id: 2,
      name: 'Insulin Pump',
      description: 'Executes basal/bolus delivery and enforces configuration constraints.'
    },
    {
      id: 3,
      name: 'Infusion Set',
      description: 'Provides physical channel for insulin delivery; integrity is critical.'
    }
  ]);

  readonly accidents = signal<AccidentEntry[]>([
    {
      id: 1,
      code: 'A1',
      description: 'Risk of death due to insulin mismanagement.'
    },
    {
      id: 2,
      code: 'A2',
      description: 'Risk of serious injury caused by inadequate insulin delivery.'
    }
  ]);

  readonly hazards = signal<HazardEntry[]>([
    {
      id: 1,
      code: 'H1',
      description: 'Hypoglycemia triggered by over-infusion or unintended dosing.',
      linkedAccidents: 'A1, A2'
    },
    {
      id: 2,
      code: 'H2',
      description: 'Hyperglycemia caused by missed or delayed insulin delivery.',
      linkedAccidents: 'A2'
    }
  ]);

  readonly constraints = signal<SafetyConstraintEntry[]>([
    {
      id: 1,
      code: 'SC-01',
      statement: 'The system must not administer insulin beyond validated dosage schedules or in unintended contexts.',
      linkedHazards: 'H1'
    },
    {
      id: 2,
      code: 'SC-02',
      statement: 'The system must assure the correct insulin dose is delivered at the intended time.',
      linkedHazards: 'H2'
    }
  ]);

  readonly responsibilities = signal<ResponsibilityEntry[]>([
    {
      id: 1,
      component: 'Patient (Human Controller)',
      responsibility: 'Configure infusion settings in accordance with the medical prescription.',
      linkedConstraints: 'SC-01, SC-02'
    },
    {
      id: 2,
      component: 'Insulin Pump',
      responsibility: 'Administer insulin only according to validated parameters and block unauthorised dosages.',
      linkedConstraints: 'SC-01'
    },
    {
      id: 3,
      component: 'Insulin Pump',
      responsibility: 'Monitor timing and quantity of delivery to confirm the correct dose is given on schedule.',
      linkedConstraints: 'SC-02'
    },
    {
      id: 4,
      component: 'Insulin Pump',
      responsibility: 'Detect anomalies such as occlusions or over-delivery and alert the user immediately.',
      linkedConstraints: 'SC-01, SC-02'
    },
    {
      id: 5,
      component: 'Infusion Set',
      responsibility: 'Maintain physical integrity to prevent leaks or unintended flow.',
      linkedConstraints: 'SC-01'
    },
    {
      id: 6,
      component: 'Infusion Set',
      responsibility: 'Ensure timely delivery of insulin from pump to patient.',
      linkedConstraints: 'SC-02'
    },
    {
      id: 7,
      component: 'Patient (Human Body)',
      responsibility: 'Respond physiologically to insulin as expected within treatment tolerance.',
      linkedConstraints: 'SC-02'
    }
  ]);

  readonly artefacts = signal<ArtefactEntry[]>([
    {
      id: 1,
      name: 'Insulin pump clinical effectiveness dossier',
      purpose: 'Validates the necessity of safety constraints and responsibilities.',
      reference: 'internal-sharepoint://clinical/insulin-dossier'
    }
  ]);

  readonly objectiveCount = computed(() => this.objectives().length);
  readonly hazardCount = computed(() => this.hazards().length);
  readonly accidentCount = computed(() => this.accidents().length);
  readonly resourceCount = computed(() => this.resources().length);
  readonly componentCount = computed(() => this.systemComponents().length);

  readonly isObjectiveModalOpen = signal(false);
  readonly isSystemDefinitionModalOpen = signal(false);
  readonly isResourceModalOpen = signal(false);
  readonly isSystemBoundaryModalOpen = signal(false);
  readonly isComponentModalOpen = signal(false);
  readonly currentProjectId = signal<number | null>(null);

  constructor() {
    this.initializeFromRoute();
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

  openSystemDefinitionModal(): void {
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

  openSystemBoundaryModal(): void {
    this.systemBoundaryModalForm.setValue({
      systemBoundaryText: this.generalSummaryForm.get('systemBoundary')?.value ?? ''
    });
    this.isSystemBoundaryModalOpen.set(true);
  }

  closeSystemBoundaryModal(): void {
    this.isSystemBoundaryModalOpen.set(false);
  }

  confirmSystemBoundaryModal(): void {
    this.generalSummaryForm.patchValue({
      systemBoundary: this.systemBoundaryModalForm.get('systemBoundaryText')?.value ?? ''
    });
    this.closeSystemBoundaryModal();
  }

  openResourceModal(): void {
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
    this.resourceForm.setValue({
      name: this.resourceModalForm.get('name')?.value ?? '',
      category: this.resourceModalForm.get('category')?.value ?? 'Article',
      reference: this.resourceModalForm.get('reference')?.value ?? ''
    });
    this.closeResourceModal();
  }

  openComponentModal(): void {
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
    this.componentForm.setValue({
      name: this.componentModalForm.get('name')?.value ?? '',
      description: this.componentModalForm.get('description')?.value ?? ''
    });
    this.closeComponentModal();
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

    const resources = (scope.resources ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      reference: item.reference
    }));

    const systemComponents = (scope.systemComponents ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description
    }));

    const accidents = (scope.accidents ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description
    }));

    const hazards = (scope.hazards ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      linkedAccidents: this.joinCodes(item.linkedAccidents)
    }));

    const constraints = (scope.safetyConstraints ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      statement: item.statement,
      linkedHazards: this.joinCodes(item.linkedHazards)
    }));

    const responsibilities = (scope.responsibilities ?? []).map((item) => ({
      id: item.id,
      component: item.component,
      responsibility: item.responsibility,
      linkedConstraints: this.joinCodes(item.linkedConstraints)
    }));

    const artefacts = (scope.artefacts ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      purpose: item.purpose,
      reference: item.reference
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

  private joinCodes(values: string[] | undefined): string {
    return (values ?? []).join(', ');
  }

  private splitCodes(value: string | null | undefined): string[] {
    return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  saveStepOne(continueAfterSave = false): void {
    const projectId = this.currentProjectId();

    if (!projectId) {
      console.warn('Missing projectId; cannot save Step 1 scope.');
      return;
    }

    const payload: Step1ScopeDto & { id: number } = {
      id: projectId,
      lastUpdatedBy: 'admin',
      generalSummary: {
        systemDefinition: this.generalSummaryForm.get('systemDefinition')?.value ?? '',
        systemBoundary: this.generalSummaryForm.get('systemBoundary')?.value ?? ''
      },
      objectives: this.analysisObjectiveForm.get('objectivesText')?.value ?? '',
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
        linkedAccidents: this.splitCodes(item.linkedAccidents)
      })),
      safetyConstraints: this.constraints().map((item) => ({
        id: item.id,
        code: item.code,
        statement: item.statement,
        linkedHazards: this.splitCodes(item.linkedHazards)
      })),
      responsibilities: this.responsibilities().map((item) => ({
        id: item.id,
        component: item.component,
        responsibility: item.responsibility,
        linkedConstraints: this.splitCodes(item.linkedConstraints)
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
    this.requestAiText(
      'Give me the a analysis objectives of a generic project Safety-Critical System',
      (text) => {
        this.analysisObjectiveForm.patchValue({ objectivesText: text });
        this.analysisObjectiveModalForm.patchValue({ objectivesText: text });
      }
    );
  }

  generateSystemDefinitionWithAi(): void {
    this.requestAiText(
      'Give me the a system definition of a generic project Safety-Critical System',
      (text) => {
        this.generalSummaryForm.patchValue({ systemDefinition: text });
        this.systemDefinitionModalForm.patchValue({ systemDefinitionText: text });
      }
    );
  }

  generateSystemBoundaryWithAi(): void {
    this.requestAiText(
      'Give me the a system boundary of a generic project Safety-Critical System',
      (text) => {
        this.generalSummaryForm.patchValue({ systemBoundary: text });
        this.systemBoundaryModalForm.patchValue({ systemBoundaryText: text });
      }
    );
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
    this.resourceForm.reset({ name: '', category: '', reference: '' });
    this.componentForm.reset({ name: '', description: '' });
    this.accidentForm.reset({ code: '', description: '' });
    this.hazardForm.reset({ code: '', description: '', linkedAccidents: '' });
    this.constraintForm.reset({ code: '', statement: '', linkedHazards: '' });
    this.responsibilityForm.reset({ component: '', responsibility: '', linkedConstraints: '' });
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

    this.analysisObjectiveForm.setValue({ objectivesText: loremLong });
    this.resourceForm.setValue({ name: lorem, category: lorem, reference: lorem });
    this.componentForm.setValue({ name: lorem, description: lorem });
    this.accidentForm.setValue({ code: lorem, description: lorem });
    this.hazardForm.setValue({ code: lorem, description: lorem, linkedAccidents: lorem });
    this.constraintForm.setValue({ code: lorem, statement: lorem, linkedHazards: lorem });
    this.responsibilityForm.setValue({ component: lorem, responsibility: lorem, linkedConstraints: lorem });
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
        reference: value.reference ?? 'Reference pending'
      },
      ...current
    ]);

    form.reset({ category: '' });
  }

  addComponent(form: FormGroup = this.componentForm as FormGroup): void {
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const value = form.getRawValue();
    this.systemComponents.update((current) => [
      {
        id: ++this.nextComponentId,
        name: value.name ?? 'Component',
        description: value.description ?? 'Description not provided'
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

  addAccident(): void {
    if (this.accidentForm.invalid) {
      this.accidentForm.markAllAsTouched();
      return;
    }

    const value = this.accidentForm.getRawValue();
    this.accidents.update((current) => [
      {
        id: ++this.nextAccidentId,
        code: value.code ?? `A${this.nextAccidentId}`,
        description: value.description ?? 'Accident description pending'
      },
      ...current
    ]);

    this.accidentForm.reset();
  }

  addHazard(): void {
    if (this.hazardForm.invalid) {
      this.hazardForm.markAllAsTouched();
      return;
    }

    const value = this.hazardForm.getRawValue();
    this.hazards.update((current) => [
      {
        id: ++this.nextHazardId,
        code: value.code ?? `H${this.nextHazardId}`,
        description: value.description ?? 'Hazard description pending',
        linkedAccidents: value.linkedAccidents ?? ''
      },
      ...current
    ]);

    this.hazardForm.reset();
  }

  addConstraint(): void {
    if (this.constraintForm.invalid) {
      this.constraintForm.markAllAsTouched();
      return;
    }

    const value = this.constraintForm.getRawValue();
    this.constraints.update((current) => [
      {
        id: ++this.nextConstraintId,
        code: value.code ?? `SC-${this.nextConstraintId.toString().padStart(2, '0')}`,
        statement: value.statement ?? 'Safety constraint pending refinement',
        linkedHazards: value.linkedHazards ?? ''
      },
      ...current
    ]);

    this.constraintForm.reset();
  }

  addResponsibility(): void {
    if (this.responsibilityForm.invalid) {
      this.responsibilityForm.markAllAsTouched();
      return;
    }

    const value = this.responsibilityForm.getRawValue();
    this.responsibilities.update((current) => [
      {
        id: ++this.nextResponsibilityId,
        component: value.component ?? 'Component',
        responsibility: value.responsibility ?? 'Responsibility statement pending refinement',
        linkedConstraints: value.linkedConstraints ?? ''
      },
      ...current
    ]);

    this.responsibilityForm.reset();
  }

  addArtefact(): void {
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
        reference: value.reference ?? 'Reference pending'
      },
      ...current
    ]);

    this.artefactForm.reset();
  }
}
