import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnChanges, SimpleChanges, computed, inject, input, output, signal } from '@angular/core';
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
export class ControllerConstraintsPageComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  readonly embedded = input(false);
  readonly analysisSources = input<ReadonlyArray<ConstraintSourceOption>>([]);
  readonly initialConstraints = input<ReadonlyArray<ControllerConstraint>>([]);
  readonly initialNextConstraintId = input('CC-01');
  readonly constraintsChange = output<ControllerConstraint[]>();

  private sequence = 0;

  readonly constraintForm = this.fb.group({
    sourceRef: ['', Validators.required],
    constraintId: ['CC-01', Validators.required],
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

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialConstraints'] && !changes['initialNextConstraintId']) {
      return;
    }

    if (this.isConstraintModalOpen()) {
      return;
    }

    const initialConstraints = [...this.initialConstraints()];
    this.constraints.set(initialConstraints);
    this.sequence = initialConstraints.reduce((maxId, item) => Math.max(maxId, item.id), 0);
    this.resetConstraintForm();
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
    this.emitConstraintsChange();
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

    this.emitConstraintsChange();
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

    this.emitConstraintsChange();
  }

  private emitConstraintsChange(): void {
    this.constraintsChange.emit(this.constraints());
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
    const prefix = this.extractConstraintIdPrefix(this.initialNextConstraintId(), this.constraints().map((item) => item.constraintId));

    if (this.constraints().length === 0) {
      return seededValue > 0 ? this.formatConstraintId(seededValue, prefix) : this.formatConstraintId(1, prefix);
    }

    const currentMax = this.constraints().reduce(
      (maxValue, item) => Math.max(maxValue, this.parseConstraintId(item.constraintId)),
      0
    );

    return this.formatConstraintId(Math.max(currentMax + 1, seededValue || 1), prefix);
  }

  private parseConstraintId(value: string | null | undefined): number {
    const match = (value ?? '').match(/(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  private extractConstraintIdPrefix(seedValue: string | null | undefined, existingValues: string[]): string {
    const match = [seedValue ?? '', ...existingValues]
      .map((value) => value.trim())
      .find((value) => /\d+/.test(value))
      ?.match(/^([^\d]*?)(\d+)$/);

    return match?.[1] || 'CC-';
  }

  private formatConstraintId(id: number, prefix: string): string {
    return `${prefix}${String(id).padStart(2, '0')}`;
  }
}
