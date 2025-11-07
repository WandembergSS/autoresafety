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
      ucaRef: 'UCA-Saf-1',
      constraint:
        'The control application shall not release insulin when the CGM reports glucose above the high threshold.',
      enforcementMechanism: 'Runtime guard within dosing supervisor',
      status: 'Approved'
    },
    {
      id: 2,
      ucaRef: 'UCA-Saf-5',
      constraint:
        'The CGM shall provide a validated glucose sample to the control application within 5 seconds of each reading.',
      enforcementMechanism: 'Sensor firmware timing watchdog',
      status: 'Pending Review'
    },
    {
      id: 3,
      ucaRef: 'UCA-Saf-9',
      constraint:
        'The insulin pump shall complete a commanded infusion before accepting a stop signal from the control application.',
      enforcementMechanism: 'Pump firmware state machine guard',
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
