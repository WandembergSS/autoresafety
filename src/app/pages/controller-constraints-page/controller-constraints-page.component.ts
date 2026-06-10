import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
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
    sourceRef: ['', Validators.required],
    constraintId: ['C-01', Validators.required],
    constraint: ['', Validators.required]
  });

  readonly constraints = signal<ControllerConstraint[]>([]);
  readonly constraintModalMode = signal<'create' | 'edit' | null>(null);
  readonly editingConstraintId = signal<number | null>(null);
  readonly constraintModalTitle = computed(() =>
    this.constraintModalMode() === 'create' ? 'Create controller constraint' : 'Edit controller constraint'
  );
  readonly constraintModalSubmitLabel = computed(() =>
    this.constraintModalMode() === 'create' ? 'Create constraint' : 'Save changes'
  );

  constructor() {
    effect(() => {
      const initialConstraints = [...this.initialConstraints()];

      this.constraints.set(initialConstraints);
      this.sequence = initialConstraints.reduce((maxId, item) => Math.max(maxId, item.id), 0);

      if (!this.isConstraintModalOpen()) {
        this.resetConstraintForm();
      }
    });

    effect(() => {
      this.constraintsChange.emit(this.constraints());
    });
  }

  approvedCount(): number {
    return this.constraints().filter((item) => item.status === 'Approved').length;
  }

  pendingReviewCount(): number {
    return this.constraints().filter((item) => item.status === 'Pending Review').length;
  }

  nextConstraintId(): string {
    return this.buildNextConstraintId();
  }

  isConstraintModalOpen(): boolean {
    return this.constraintModalMode() !== null;
  }

  openNewConstraintModal(): void {
    this.constraintModalMode.set('create');
    this.editingConstraintId.set(null);
    this.resetConstraintForm();
  }

  openEditConstraint(constraint: ControllerConstraint): void {
    this.constraintModalMode.set('edit');
    this.editingConstraintId.set(constraint.id);
    this.constraintForm.reset({
      sourceRef: constraint.sourceRef,
      constraintId: constraint.constraintId,
      constraint: constraint.constraint
    });
  }

  closeConstraintModal(): void {
    this.constraintModalMode.set(null);
    this.editingConstraintId.set(null);
    this.resetConstraintForm();
  }

  removeConstraint(constraintId: number): void {
    if (this.editingConstraintId() === constraintId) {
      this.closeConstraintModal();
    }

    this.constraints.update((current) => current.filter((item) => item.id !== constraintId));
  }

  saveConstraint(): void {
    if (this.constraintForm.invalid) {
      this.constraintForm.markAllAsTouched();
      return;
    }

    if (this.constraintModalMode() === 'edit') {
      this.updateConstraint();
    } else {
      this.createConstraint();
    }

    this.closeConstraintModal();
  }

  private createConstraint(): void {
    const value = this.constraintForm.getRawValue();
    const selectedSource = this.findAnalysisSource(value.sourceRef ?? '');

    this.constraints.update((current) => [
      {
        id: ++this.sequence,
        constraintId: value.constraintId ?? this.nextConstraintId(),
        sourceRef: value.sourceRef ?? '',
        hazardLinkage: selectedSource?.hazardLinkage ?? 'Hazard linkage pending refinement',
        responsibilityChain: selectedSource?.responsibilityChain ?? 'Responsibility chain pending refinement',
        constraint: value.constraint ?? 'Constraint pending refinement',
        enforcementMechanism: 'Not specified',
        status: 'Draft'
      },
      ...current
    ]);
  }

  private updateConstraint(): void {
    const constraintId = this.editingConstraintId();
    if (!constraintId) {
      return;
    }

    const value = this.constraintForm.getRawValue();
    const selectedSource = this.findAnalysisSource(value.sourceRef ?? '');

    this.constraints.update((current) =>
      current.map((item) =>
        item.id === constraintId
          ? {
              ...item,
              constraintId: value.constraintId ?? item.constraintId,
              sourceRef: value.sourceRef ?? item.sourceRef,
              hazardLinkage: selectedSource?.hazardLinkage ?? item.hazardLinkage,
              responsibilityChain: selectedSource?.responsibilityChain ?? item.responsibilityChain,
              constraint: value.constraint ?? item.constraint
            }
          : item
      )
    );
  }

  private findAnalysisSource(sourceRef: string): ConstraintSourceOption | undefined {
    return this.analysisSources().find((item) => item.ref === sourceRef);
  }

  private resetConstraintForm(): void {
    this.constraintForm.reset({
      sourceRef: '',
      constraintId: this.nextConstraintId(),
      constraint: ''
    });
  }

  private buildNextConstraintId(): string {
    const seededValue = this.parseConstraintId(this.initialNextConstraintId());

    if (this.constraints().length === 0) {
      return seededValue > 0 ? this.formatConstraintId(seededValue) : this.formatConstraintId(1);
    }

    const currentMax = this.constraints().reduce(
      (maxValue, item) => Math.max(maxValue, this.parseConstraintId(item.constraintId)),
      0
    );

    return this.formatConstraintId(Math.max(currentMax + 1, seededValue || 1));
  }

  private parseConstraintId(value: string | null | undefined): number {
    const match = (value ?? '').match(/(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  private formatConstraintId(id: number): string {
    return `C-${String(id).padStart(2, '0')}`;
  }
}
