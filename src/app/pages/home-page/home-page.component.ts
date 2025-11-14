import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Project } from '../../models/project.model';

interface HomeProject extends Project {
  domain?: string;
  owner?: string;
  nextStep?: string;
  currentStep?: number;
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  private readonly fb = inject(FormBuilder);

  readonly projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(120)]],
    domain: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', Validators.maxLength(500)],
    owner: ['', Validators.maxLength(120)]
  });

  readonly projects = signal<HomeProject[]>([
    {
      id: 1,
      name: 'Automated Insulin Delivery (AID) System',
      domain: 'Medical IoT',
      description:
  'Co-create the ReSafety stack for an AID system with CGM, control app, and insulin pump.',
      status: 'in-progress',
      owner: 'Priya Banerjee',
      currentStep: 4,
      nextStep: 'Resume Step 4 · Identify Unsafe Control Actions'
    },
    {
      id: 2,
      name: 'Smart Grid Balancing Agent',
      domain: 'Critical Energy',
      description:
        'Assess distributed balancing agents for constraint violations and cascading loss scenarios in the grid.',
      status: 'pending',
      owner: 'Miguel Santos',
      currentStep: 1,
      nextStep: 'Kick-off Step 1 · Define SCS Scope'
    },
    {
      id: 3,
      name: 'Runway Lighting Control',
      domain: 'Aviation',
      description: 'Evaluate fail-operational constraints for runway lighting automation.',
      status: 'complete',
      owner: 'Laura Chen',
      currentStep: 7,
      nextStep: 'Archive evidence & publish traceability report'
    }
  ]);

  readonly pendingProjects = computed(() =>
    this.projects().filter((project) => project.status !== 'complete')
  );

  readonly completedProjects = computed(() =>
    this.projects().filter((project) => project.status === 'complete')
  );

  createProject(): void {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const raw = this.projectForm.getRawValue();
    const nextId = Math.max(0, ...this.projects().map((item) => item.id ?? 0)) + 1;
    const newProject: HomeProject = {
      id: nextId,
      name: raw.name ?? 'Untitled Project',
      domain: raw.domain ?? 'General',
      description: raw.description ?? '',
      status: 'pending',
      owner: raw.owner ?? 'Unassigned',
      currentStep: 1,
      nextStep: 'Kick-off Step 1 · Define SCS Scope'
    };

    this.projects.update((current) => [newProject, ...current]);
    this.projectForm.reset();
  }

  updateStatus(projectId: number | undefined, status: 'pending' | 'in-progress' | 'complete'): void {
    if (!projectId) {
      return;
    }

    this.projects.update((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              status,
              nextStep: this.deriveNextStep(status, project.currentStep),
              currentStep: this.deriveStep(status, project.currentStep)
            }
          : project
      )
    );
  }

  removeProject(projectId: number | undefined): void {
    if (!projectId) {
      return;
    }

    this.projects.update((current) => current.filter((project) => project.id !== projectId));
  }

  private deriveNextStep(
    status: 'pending' | 'in-progress' | 'complete',
    currentStep: number | undefined
  ): string {
    if (status === 'pending') {
      return 'Kick-off Step 1 · Define SCS Scope';
    }

    if (status === 'in-progress') {
      const step = currentStep && currentStep < 7 ? currentStep : 2;
      const labels: Record<number, string> = {
        1: 'Scope Definition',
        2: 'iStar4Safety Models',
        3: 'Control Structure',
        4: 'Unsafe Control Actions',
        5: 'Controller Constraints',
        6: 'Loss Scenarios & Safety Requirements',
        7: 'Update iStar4Safety Models'
      };
      return `Resume Step ${step} · ${labels[step]}`;
    }

    if (status === 'complete') {
      return 'Archive evidence & publish traceability report';
    }

    return 'Next activity to be defined';
  }

  private deriveStep(
    status: 'pending' | 'in-progress' | 'complete',
    currentStep: number | undefined
  ): number | undefined {
    if (status === 'pending') {
      return 1;
    }

    if (status === 'in-progress') {
      return currentStep && currentStep < 7 ? currentStep + 1 : 2;
    }

    if (status === 'complete') {
      return 7;
    }

    return currentStep;
  }
}
