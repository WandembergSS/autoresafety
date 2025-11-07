import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type UpdateStatus = 'planned' | 'in-progress' | 'deployed';
type TaskStatus = 'todo' | 'doing' | 'done';

interface ModelChange {
  id: number;
  area: string;
  change: string;
  driver: string;
  impact: string;
  status: UpdateStatus;
  evidence: string[];
}

interface ValidationTask {
  id: number;
  name: string;
  owner: string;
  dueDate: string;
  channel: string;
  status: TaskStatus;
}

interface IntegrationNote {
  id: number;
  summary: string;
  createdOn: string;
  author: string;
  actionItems: string[];
}

@Component({
  selector: 'app-model-update-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './model-update-page.component.html',
  styleUrl: './model-update-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelUpdatePageComponent {
  private readonly fb = inject(FormBuilder);

  readonly changeForm = this.fb.group({
    area: ['', [Validators.required, Validators.maxLength(80)]],
    change: ['', [Validators.required, Validators.maxLength(240)]],
    driver: ['', [Validators.required, Validators.maxLength(120)]],
    impact: ['', [Validators.required, Validators.maxLength(240)]],
    evidence: ['', Validators.maxLength(240)]
  });

  readonly modelChanges = signal<ModelChange[]>([
    {
      id: 1,
      area: 'Goal refinement',
      change: 'Split "Maintain safe separation" into speed and lateral control sub-goals.',
      driver: 'UCA-12 mitigation',
      impact: 'Clarifies feedback loops for perception latency analysis.',
      status: 'in-progress',
      evidence: ['Updated goal diagram', 'Meeting notes 2024-10-12']
    },
    {
      id: 2,
      area: 'Actor responsibilities',
      change: 'Add maintenance supervisor actor to reflect depot override authority.',
      driver: 'Scenario LS-33',
      impact: 'Ensures maintenance mode interlocks are explicitly modelled.',
      status: 'planned',
      evidence: ['Action from review board']
    },
    {
      id: 3,
      area: 'Resource links',
      change: 'Model redundant sensor voting channel between lidar and radar.',
      driver: 'Requirement SR-501',
      impact: 'Supports traceability to fusion logic constraints.',
      status: 'deployed',
      evidence: ['Git commit #f92a4c', 'Simulation run 2219']
    }
  ]);

  readonly validationTasks = signal<ValidationTask[]>([
    {
      id: 21,
      name: 'Review goal hierarchy with safety board',
      owner: 'Priya Banerjee',
      dueDate: '2024-12-05',
      channel: 'Safety board',
      status: 'doing'
    },
    {
      id: 22,
      name: 'Update change log in safety case',
      owner: 'Miguel Santos',
      dueDate: '2024-11-28',
      channel: 'Safety case',
      status: 'todo'
    },
    {
      id: 23,
      name: 'Run regression of fusion logic scenario set',
      owner: 'Dana Ortiz',
      dueDate: '2024-12-18',
      channel: 'V&V',
      status: 'todo'
    }
  ]);

  readonly integrationNotes = signal<IntegrationNote[]>([
    {
      id: 81,
      summary: 'System engineers aligned on new maintenance supervisor actor responsibilities.',
      createdOn: '2024-11-01',
      author: 'Keira Osei',
      actionItems: ['Draft revised SOP for depot handover', 'Sync with training lead on new role']
    },
    {
      id: 82,
      summary: 'Fusion logic change validated against urban shuttle night route scenarios.',
      createdOn: '2024-10-22',
      author: 'Dana Ortiz',
      actionItems: ['Upload waveform captures', 'Schedule dry-run with ops team']
    }
  ]);

  readonly changeBreakdown = computed(() => {
    const counts: Record<UpdateStatus, number> = {
      planned: 0,
      'in-progress': 0,
      deployed: 0
    };

    for (const change of this.modelChanges()) {
      counts[change.status] += 1;
    }

    return [
      { label: 'Planned updates', value: counts.planned, tone: 'info' },
      { label: 'In progress', value: counts['in-progress'], tone: 'warning' },
      { label: 'Deployed', value: counts.deployed, tone: 'success' }
    ];
  });

  readonly readinessScore = computed(() => {
    const total = this.validationTasks().length;
    const done = this.validationTasks().filter((task) => task.status === 'done').length;
    return total === 0 ? 0 : Math.round((done / total) * 100);
  });

  addChange(): void {
    if (this.changeForm.invalid) {
      this.changeForm.markAllAsTouched();
      return;
    }

    const raw = this.changeForm.getRawValue();
    const evidence = (raw.evidence ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const nextId = Math.max(0, ...this.modelChanges().map((change) => change.id)) + 1;

    this.modelChanges.update((current) => [
      {
        id: nextId,
        area: raw.area ?? 'Model area',
        change: raw.change ?? 'Describe the update',
        driver: raw.driver ?? 'Driver pending',
        impact: raw.impact ?? 'Impact analysis pending',
        status: 'planned',
        evidence
      },
      ...current
    ]);

    this.changeForm.reset();
  }

  updateChangeStatus(id: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as UpdateStatus;
    this.modelChanges.update((current) =>
      current.map((change) => (change.id === id ? { ...change, status: value } : change))
    );
  }

  updateTaskStatus(id: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TaskStatus;
    this.validationTasks.update((current) =>
      current.map((task) => (task.id === id ? { ...task, status: value } : task))
    );
  }

  statusClass(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}
