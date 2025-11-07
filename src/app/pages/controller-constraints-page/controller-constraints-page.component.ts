import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

interface ControllerConstraint {
  id: number;
  ucaRef: string;
  constraint: string;
  enforcementMechanism: string;
  status: 'Draft' | 'Approved' | 'Pending Review';
}

@Component({
  selector: 'app-controller-constraints-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './controller-constraints-page.component.html',
  styleUrl: './controller-constraints-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControllerConstraintsPageComponent {
  private readonly fb = inject(FormBuilder);

  readonly constraintForm = this.fb.group({
    ucaRef: ['', Validators.required],
    constraint: ['', [Validators.required, Validators.minLength(10)]],
    enforcementMechanism: ['', Validators.required],
    status: ['Draft' as ControllerConstraint['status'], Validators.required]
  });

  private sequence = 3;

  readonly constraints = signal<ControllerConstraint[]>([
    {
      id: 1,
      ucaRef: 'UCA-01',
      constraint: 'The controller shall verify current glucose value < 80 mg/dL before commanding an increase in basal rate.',
      enforcementMechanism: 'Runtime guard inside dosing loop',
      status: 'Approved'
    },
    {
      id: 2,
      ucaRef: 'UCA-02',
      constraint: 'Configuration updates shall require dual caregiver approval before activation on the device.',
      enforcementMechanism: 'Workflow enforced inside caregiver portal',
      status: 'Pending Review'
    },
    {
      id: 3,
      ucaRef: 'UCA-03',
      constraint: 'Firmware deployment shall be deferred if the device reports active infusion session.',
      enforcementMechanism: 'Cloud deployment pipeline gate',
      status: 'Draft'
    }
  ]);

  addConstraint(): void {
    if (this.constraintForm.invalid) {
      this.constraintForm.markAllAsTouched();
      return;
    }

    const value = this.constraintForm.getRawValue();
    this.constraints.update((current) => [
      {
        id: ++this.sequence,
        ucaRef: value.ucaRef ?? 'UCA-XX',
        constraint: value.constraint ?? 'Constraint pending refinement',
        enforcementMechanism: value.enforcementMechanism ?? 'Mechanism TBD',
        status: (value.status as ControllerConstraint['status']) ?? 'Draft'
      },
      ...current
    ]);

    this.constraintForm.reset({ status: 'Draft' });
  }

  statusClass(status: ControllerConstraint['status']): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }
}
