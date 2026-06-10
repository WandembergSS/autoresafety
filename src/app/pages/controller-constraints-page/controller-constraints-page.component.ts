import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface ConstraintSourceOption {
  ref: string;
  summary: string;
  hazardLinkage: string;
  responsibilityChain: string;
}

export interface ControllerConstraint {
  id: number;
  constraintId: string;
  sourceRef: string;
  hazardLinkage: string;
  responsibilityChain: string;
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
  readonly embedded = input(false);
  readonly analysisSources = input<ReadonlyArray<ConstraintSourceOption>>([]);
  readonly initialConstraints = input<ReadonlyArray<ControllerConstraint>>([]);
  readonly initialNextConstraintId = input('C-01');
  readonly constraintsChange = output<ControllerConstraint[]>();

  private sequence = 0;

  readonly constraintForm = this.fb.group({
    analysisCompleted: [false, Validators.requiredTrue],
    sourceRef: ['', Validators.required],
    constraintId: ['C-01', Validators.required],
    hazardLinkage: ['', Validators.required],
    responsibilityChain: ['', [Validators.required, Validators.minLength(12)]],
    constraint: ['', [Validators.required, Validators.minLength(10)]],
    enforcementMechanism: ['', Validators.required],
    status: ['Draft' as ControllerConstraint['status'], Validators.required]
  });

  readonly constraints = signal<ControllerConstraint[]>([]);

  constructor() {
    effect(() => {
      const initialConstraints = [...this.initialConstraints()];
      const nextConstraintId = this.initialNextConstraintId() || 'C-01';

      this.constraints.set(initialConstraints);
      this.sequence = initialConstraints.reduce((maxId, item) => Math.max(maxId, item.id), 0);

      this.constraintForm.patchValue({
        constraintId: nextConstraintId
      });
    });

    effect(() => {
      this.constraintsChange.emit(this.constraints());
    });
  }

  isAnalysisCompleted(): boolean {
    return this.constraintForm.controls.analysisCompleted.value ?? false;
  }

  approvedCount(): number {
    return this.constraints().filter((item) => item.status === 'Approved').length;
  }

  pendingReviewCount(): number {
    return this.constraints().filter((item) => item.status === 'Pending Review').length;
  }

  nextConstraintId(): string {
    return this.constraintForm.controls.constraintId.value || this.initialNextConstraintId() || this.formatConstraintId(this.sequence + 1);
  }

  selectedSourceSummary(): string {
    const ref = this.constraintForm.controls.sourceRef.value ?? '';
    return this.analysisSources().find((item) => item.ref === ref)?.summary ?? 'Select a UCA or HC to load its diagnostic summary.';
  }

  onSourceRefChange(sourceRef: string): void {
    const selectedSource = this.analysisSources().find((item) => item.ref === sourceRef);
    if (!selectedSource) {
      return;
    }

    this.constraintForm.patchValue({
      sourceRef,
      hazardLinkage: selectedSource.hazardLinkage,
      responsibilityChain: selectedSource.responsibilityChain,
      constraintId: this.constraintForm.controls.constraintId.value || this.nextConstraintId()
    });
  }

  addConstraint(): void {
    if (this.constraintForm.invalid) {
      this.constraintForm.markAllAsTouched();
      return;
    }

    const value = this.constraintForm.getRawValue();
    this.constraints.update((current) => [
      {
        id: ++this.sequence,
        constraintId: value.constraintId ?? this.formatConstraintId(this.sequence),
        sourceRef: value.sourceRef ?? 'UCA-XX',
        hazardLinkage: value.hazardLinkage ?? 'Hazard linkage pending refinement',
        responsibilityChain: value.responsibilityChain ?? 'Responsibility chain pending refinement',
        constraint: value.constraint ?? 'Constraint pending refinement',
        enforcementMechanism: value.enforcementMechanism ?? 'Mechanism TBD',
        status: (value.status as ControllerConstraint['status']) ?? 'Draft'
      },
      ...current
    ]);

    this.constraintForm.reset({
      analysisCompleted: false,
      sourceRef: '',
      constraintId: this.formatConstraintId(this.sequence + 1),
      hazardLinkage: '',
      responsibilityChain: '',
      constraint: '',
      enforcementMechanism: '',
      status: 'Draft'
    });
  }

  statusClass(status: ControllerConstraint['status']): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  private formatConstraintId(id: number): string {
    return `C-${String(id).padStart(2, '0')}`;
  }
}
