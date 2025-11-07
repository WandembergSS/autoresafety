import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

interface ScopeObjective {
  id: number;
  description: string;
  stakeholder: string;
  priority: 'High' | 'Medium' | 'Low';
}

interface ScopeHazard {
  id: number;
  title: string;
  potentialLoss: string;
  severity: 'Catastrophic' | 'Major' | 'Minor';
}

interface ScopeConstraint {
  id: number;
  statement: string;
  rationale: string;
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

  readonly scopeSummaryForm = this.fb.group({
    systemName: ['Infusion Pump Platform', Validators.required],
    mission: ['Maintain safe and accurate insulin delivery in home healthcare contexts.', Validators.required],
    boundary: ['Device hardware, embedded controller, remote monitoring portal, and cloud update service.'],
    assumptions: ['Authenticated caregivers configure dose regimens; wireless connectivity may be intermittent.']
  });

  readonly objectiveForm = this.fb.group({
    description: ['', [Validators.required, Validators.minLength(6)]],
    stakeholder: ['', Validators.required],
    priority: ['High', Validators.required]
  });

  readonly hazardForm = this.fb.group({
    title: ['', Validators.required],
    potentialLoss: ['', Validators.required],
    severity: ['Catastrophic', Validators.required]
  });

  readonly constraintForm = this.fb.group({
    statement: ['', Validators.required],
    rationale: ['', Validators.required]
  });

  private nextObjectiveId = 3;
  private nextHazardId = 3;
  private nextConstraintId = 3;

  readonly objectives = signal<ScopeObjective[]>([
    {
      id: 1,
      description: 'Ensure basal insulin delivery remains within prescribed tolerances.',
      stakeholder: 'Patient',
      priority: 'High'
    },
    {
      id: 2,
      description: 'Log and surface dosing anomalies to clinical portal within five minutes.',
      stakeholder: 'Clinician',
      priority: 'Medium'
    }
  ]);

  readonly hazards = signal<ScopeHazard[]>([
    {
      id: 1,
      title: 'Over-infusion due to incorrect basal rate',
      potentialLoss: 'Hypoglycemia causing patient harm or hospitalization',
      severity: 'Catastrophic'
    },
    {
      id: 2,
      title: 'Delayed caregiver notification',
      potentialLoss: 'Undetected pump occlusion leading to hyperglycemia',
      severity: 'Major'
    }
  ]);

  readonly constraints = signal<ScopeConstraint[]>([
    {
      id: 1,
      statement: 'The controller shall reject configuration updates lacking dual clinician approval.',
      rationale: 'Prevents accidental deployment of unsafe dosage schedules.'
    },
    {
      id: 2,
      statement: 'The system shall default to safe basal rate upon communication loss > 2 minutes.',
      rationale: 'Maintains safe operation when remote supervision lapses.'
    }
  ]);

  readonly hazardCount = computed(() => this.hazards().length);
  readonly objectiveCount = computed(() => this.objectives().length);

  addObjective(): void {
    if (this.objectiveForm.invalid) {
      this.objectiveForm.markAllAsTouched();
      return;
    }

    const value = this.objectiveForm.getRawValue();
    this.objectives.update((current) => [
      {
        id: ++this.nextObjectiveId,
        description: value.description ?? 'Untitled objective',
        stakeholder: value.stakeholder ?? 'Stakeholder',
        priority: (value.priority as ScopeObjective['priority']) ?? 'Medium'
      },
      ...current
    ]);

    this.objectiveForm.reset({ priority: 'Medium' });
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
        title: value.title ?? 'Unnamed hazard',
        potentialLoss: value.potentialLoss ?? 'Potential loss not captured',
        severity: (value.severity as ScopeHazard['severity']) ?? 'Major'
      },
      ...current
    ]);

    this.hazardForm.reset({ severity: 'Major' });
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
        statement: value.statement ?? 'Constraint statement pending refinement',
        rationale: value.rationale ?? 'Rationale to be detailed'
      },
      ...current
    ]);

    this.constraintForm.reset();
  }
}
