import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

interface AnalysisObjective {
  id: number;
  focus: string;
  stakeholder: string;
  priority: 'High' | 'Medium' | 'Low';
}

interface ReferenceResource {
  id: number;
  name: string;
  category: string;
  reference: string;
}

interface SystemComponentEntry {
  id: number;
  name: string;
  notes: string;
}

interface AccidentEntry {
  id: number;
  code: string;
  description: string;
}

interface HazardEntry {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string;
}

interface SafetyConstraintEntry {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string;
}

interface ResponsibilityEntry {
  id: number;
  component: string;
  responsibility: string;
  linkedConstraints: string;
}

interface ArtefactEntry {
  id: number;
  name: string;
  purpose: string;
  reference: string;
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

  readonly generalSummaryForm = this.fb.group({
    analysisPurpose: [
      'Model the Insulin Infusion Pump (IIP) iteratively to produce successive refinements of safety artefacts.',
      Validators.required
    ],
    systemDefinition: [
      'The IIP is a safety-critical device that automates basal and bolus insulin delivery to support Type 1 Diabetes management.',
      Validators.required
    ],
    systemBoundary: [
      'From configuration of infusion parameters by the patient to confirmed delivery of the dose through the catheter.'
    ]
  });

  readonly objectiveForm = this.fb.group({
    focus: ['', [Validators.required, Validators.minLength(6)]],
    stakeholder: ['', Validators.required],
    priority: ['High', Validators.required]
  });

  readonly resourceForm = this.fb.group({
    name: ['', Validators.required],
    category: ['Article', Validators.required],
    reference: ['', Validators.required]
  });

  readonly componentForm = this.fb.group({
    name: ['', Validators.required],
    notes: ['', Validators.required]
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
      category: 'Article',
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
      notes: 'Configures infusion parameters and supervises therapy.'
    },
    {
      id: 2,
      name: 'Insulin Pump',
      notes: 'Executes basal/bolus delivery and enforces configuration constraints.'
    },
    {
      id: 3,
      name: 'Infusion Set',
      notes: 'Provides physical channel for insulin delivery; integrity is critical.'
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

  constructor() {
    const prefill = this.route.snapshot.queryParamMap.get('prefill');

    if (prefill === 'empty') {
      this.applyEmptyPrefill();
    }

    if (prefill === 'ai') {
      this.applyAiPrefill();
    }
  }

  private applyEmptyPrefill(): void {
    this.generalSummaryForm.reset({
      analysisPurpose: '',
      systemDefinition: '',
      systemBoundary: ''
    });

    this.objectiveForm.reset({ focus: '', stakeholder: '', priority: 'High' });
    this.resourceForm.reset({ name: '', category: '', reference: '' });
    this.componentForm.reset({ name: '', notes: '' });
    this.accidentForm.reset({ code: '', description: '' });
    this.hazardForm.reset({ code: '', description: '', linkedAccidents: '' });
    this.constraintForm.reset({ code: '', statement: '', linkedHazards: '' });
    this.responsibilityForm.reset({ component: '', responsibility: '', linkedConstraints: '' });
    this.artefactForm.reset({ name: '', purpose: '', reference: '' });

    this.objectives.set([]);
    this.resources.set([]);
    this.systemComponents.set([]);
    this.accidents.set([]);
    this.hazards.set([]);
    this.constraints.set([]);
    this.responsibilities.set([]);
    this.artefacts.set([]);

    this.nextObjectiveId = 0;
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
      analysisPurpose: loremLong,
      systemDefinition: loremLong,
      systemBoundary: loremLong
    });

    this.objectiveForm.setValue({ focus: lorem, stakeholder: lorem, priority: 'High' });
    this.resourceForm.setValue({ name: lorem, category: lorem, reference: lorem });
    this.componentForm.setValue({ name: lorem, notes: lorem });
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

  addResource(): void {
    if (this.resourceForm.invalid) {
      this.resourceForm.markAllAsTouched();
      return;
    }

    const value = this.resourceForm.getRawValue();
    this.resources.update((current) => [
      {
        id: ++this.nextResourceId,
        name: value.name ?? 'Resource name pending',
        category: value.category ?? 'Reference',
        reference: value.reference ?? 'Reference pending'
      },
      ...current
    ]);

    this.resourceForm.reset({ category: 'Article' });
  }

  addComponent(): void {
    if (this.componentForm.invalid) {
      this.componentForm.markAllAsTouched();
      return;
    }

    const value = this.componentForm.getRawValue();
    this.systemComponents.update((current) => [
      {
        id: ++this.nextComponentId,
        name: value.name ?? 'Component',
        notes: value.notes ?? 'Role to be detailed'
      },
      ...current
    ]);

    this.componentForm.reset();
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
