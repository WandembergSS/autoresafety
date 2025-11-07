import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Project } from '../../models/project.model';

interface HomeProject extends Project {
  domain?: string;
  owner?: string;
  nextStep?: string;
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
      name: 'Autonomous Shuttle Pilot',
      domain: 'Urban Mobility',
      description: 'Pilot deployment for level-4 autonomous shuttles in a university campus.',
      status: 'pending',
      owner: 'Priya Banerjee',
      nextStep: 'Define Scope'
    },
    {
      id: 2,
      name: 'Infusion Pump Safety Refresh',
      domain: 'Healthcare Devices',
      description: 'Retrofit safety case for smart insulin infusion pumps with wireless updates.',
      status: 'in-progress',
      owner: 'Miguel Santos',
      nextStep: 'Identify UCAs'
    },
    {
      id: 3,
      name: 'Runway Lighting Control',
      domain: 'Aviation',
      description: 'Evaluate fail-operational constraints for runway lighting automation.',
      status: 'complete',
      owner: 'Laura Chen',
      nextStep: 'Review Safety Requirements'
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
      nextStep: 'Define Scope'
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
          ? { ...project, status, nextStep: this.deriveNextStep(status) }
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

  private deriveNextStep(status: 'pending' | 'in-progress' | 'complete'): string {
    switch (status) {
      case 'pending':
        return 'Define Scope';
      case 'in-progress':
        return 'Continue RESafety workflow';
      case 'complete':
        return 'Archive & report';
      default:
        return 'Unassigned';
    }
  }
}
