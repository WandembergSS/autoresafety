import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Project } from '../../models/project.model';
import { ProjectService } from '../../services/project.service';

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
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(120)]],
    domain: ['', [Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(500)],
    owner: ['', Validators.maxLength(120)]
  });

  readonly projects = signal<HomeProject[]>([]);

  constructor() {
    this.refreshOpenProjects();
  }

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
    const name = (raw.name ?? '').trim();
    const domain = (raw.domain ?? '').trim();
    const owner = (raw.owner ?? '').trim();
    const description = (raw.description ?? '').trim();

    if (!name) {
      this.projectForm.controls.name.setErrors({ required: true });
      this.projectForm.controls.name.markAsTouched();
      return;
    }

    const payload: {
      name: string;
      currentStep: number;
      domain?: string;
      owner?: string;
      description?: string;
    } = { name, currentStep: 1 };

    if (domain) payload.domain = domain;
    if (owner) payload.owner = owner;
    if (description) payload.description = description;

    this.projectService
      .createMinimal(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.projectForm.reset();
          this.refreshOpenProjects();
        },
        error: (error) => {
          console.error('Failed to create project via POST /api/projects/minimal', error);
        }
      });
  }

  private refreshOpenProjects(): void {
    this.projectService
      .listOpenResumes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const mapped = (items ?? []).map((project) => this.toHomeProject(project));
          this.projects.set(mapped);
        },
        error: (error) => {
          console.error('Failed to load open projects from /api/project-resume', error);
          this.projects.set([]);
        }
      });
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

  startProject(project: HomeProject): void {
    if (!project.id) {
      return;
    }

    if (project.status === 'pending') {
      this.updateStatus(project.id, 'in-progress');
    }

    const step = project.currentStep ?? 1;
    this.router.navigate([this.routeForStep(step)], {
      queryParams: { projectId: project.id }
    });
  }

  continueProject(project: HomeProject): void {
    if (!project.id) {
      return;
    }

    const step = project.currentStep ?? 1;
    this.router.navigate([this.routeForStep(step)], {
      queryParams: { projectId: project.id }
    });
  }

  private routeForStep(step: number): string {
    const mapping: Record<number, string> = {
      1: '/scope',
      2: '/istar-models',
      3: '/control-structure',
      4: '/ucas',
      5: '/controller-constraints',
      6: '/loss-scenarios',
      7: '/model-update'
    };

    return mapping[step] ?? '/';
  }

  private deriveNextStep(
    status: 'pending' | 'in-progress' | 'complete',
    currentStep: number | undefined
  ): string {
    if (status === 'pending') {
      return 'Kick-off Step 1 · Define SCS Scope';
    }

    if (status === 'in-progress') {
      const step = currentStep && currentStep >= 1 && currentStep <= 7 ? currentStep : 1;
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
      return currentStep && currentStep >= 1 && currentStep <= 7 ? currentStep : 1;
    }

    if (status === 'complete') {
      return 7;
    }

    return currentStep;
  }

  private toHomeProject(project: Project): HomeProject {
    const status = (project.status ?? 'pending').toLowerCase();
    const step =
      typeof project.currentStep === 'number' && project.currentStep >= 1 && project.currentStep <= 7
        ? project.currentStep
        : status === 'pending'
          ? 1
          : undefined;

    const derivedStatus = (['pending', 'in-progress', 'complete'].includes(status)
      ? status
      : 'pending') as 'pending' | 'in-progress' | 'complete';

    return {
      id: project.id,
      name: project.name,
      domain: project.domain ?? undefined,
      owner: project.owner ?? undefined,
      description: project.description ?? undefined,
      status: derivedStatus,
      currentStep: step,
      nextStep: this.deriveNextStep(derivedStatus, step)
    };
  }
}
