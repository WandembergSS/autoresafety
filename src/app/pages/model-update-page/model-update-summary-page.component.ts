import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap, tap } from 'rxjs';

import { ProjectService } from '../../services/project.service';
import { ResafetyArtifactsPageComponent } from '../resafety-artifacts-page/resafety-artifacts-page.component';

interface FullProjectDocumentPayload {
  project?: Record<string, unknown> | null;
  step1Scope?: Record<string, unknown> | null;
  step2Istar?: Record<string, unknown> | null;
  step3ControlStructure?: Record<string, unknown> | null;
  step4Ucas?: Record<string, unknown> | null;
  step5ControllerConstraints?: Record<string, unknown> | null;
  step6LossScenarios?: Record<string, unknown> | null;
}

interface StepSummary {
  number: number;
  title: string;
  route: string;
  description: string;
  metrics: string[];
}

@Component({
  selector: 'app-model-update-summary-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ResafetyArtifactsPageComponent],
  templateUrl: './model-update-summary-page.component.html',
  styleUrl: './model-update-summary-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelUpdateSummaryPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentProjectId = signal<number | null>(null);
  readonly projectPayload = signal<Record<string, unknown> | null>(null);
  readonly projectName = signal('project');
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly projectQueryParams = computed(() => {
    const projectId = this.currentProjectId();
    return projectId ? { projectId } : null;
  });

  readonly overviewCards = computed(() => [
    { label: 'Reviewed steps', value: '5' },
    { label: 'Return links', value: '5' },
    { label: 'Artifacts', value: this.projectPayload() ? '6' : '0' },
    { label: 'Project', value: this.projectName() }
  ]);

  readonly previousStepSummaries = computed<StepSummary[]>(() => {
    const payload = this.projectPayload() as FullProjectDocumentPayload | null;
    const step1 = payload?.step1Scope ?? null;
    const step2 = payload?.step2Istar ?? null;
    const step3 = payload?.step3ControlStructure ?? null;
    const step4 = payload?.step4Ucas ?? null;
    const step4Constraints = payload?.step5ControllerConstraints ?? null;
    const step5 = payload?.step6LossScenarios ?? null;

    return [
      {
        number: 1,
        title: 'Define SCS Scope',
        route: '/scope',
        description: this.summarizeText(
          this.pickText(step1, ['generalSummary.systemDefinition', 'systemDefinition', 'objectives'], 'Scope information has not been filled yet.')
        ),
        metrics: [
          this.formatCount(this.countEntries(step1, ['resources']), 'resource'),
          this.formatCount(this.countEntries(step1, ['systemComponents', 'components']), 'system component'),
          this.formatCount(this.countEntries(step1, ['hazards']), 'hazard'),
          this.formatCount(this.countEntries(step1, ['safetyConstraints', 'constraints']), 'safety constraint'),
          this.formatCount(this.countEntries(step1, ['componentResponsibilities', 'responsibilities']), 'responsibility')
        ]
      },
      {
        number: 2,
        title: 'iStar4Safety Models',
        route: '/istar-models',
        description: 'Initial iStar4Safety actors, dependencies, and rationale links prepared for the safety analysis.',
        metrics: [
          this.formatCount(this.countEntries(step2, ['actors']), 'actor'),
          this.formatCount(this.countEntries(step2, ['goalLinks', 'dependencies']), 'dependency link')
        ]
      },
      {
        number: 3,
        title: 'Control Structure',
        route: '/control-structure',
        description: 'Controllers, controlled processes, control actions, and feedback paths prepared for STPA reasoning.',
        metrics: [
          this.formatCount(this.countEntries(step3, ['entities', 'controllers', 'controlledProcesses']), 'entity'),
          this.formatCount(this.countEntries(step3, ['controlActions']), 'control action'),
          this.formatCount(this.countEntries(step3, ['feedbackLoops', 'feedbacks', 'optionalElements']), 'supporting element')
        ]
      },
      {
        number: 4,
        title: 'Unsafe Control Actions and Hazardous Conditions',
        route: '/ucas',
        description: 'Unsafe behaviors and controller constraints consolidated to keep hazard traceability explicit.',
        metrics: [
          this.formatCount(this.countEntries(step4, ['unsafeControlActions', 'ucas']), 'UCA'),
          this.formatCount(this.countEntries(step4, ['hazardousConditions', 'hcs']), 'hazardous condition'),
          this.formatCount(this.countEntries(step4Constraints, ['controllerConstraints', 'constraints']), 'controller constraint')
        ]
      },
      {
        number: 5,
        title: 'Loss Scenarios and Safety Requirements',
        route: '/loss-scenarios',
        description: 'Loss scenarios and safety requirements derived from the unsafe behaviors identified in Step 4.',
        metrics: [
          this.formatCount(this.countEntries(step5, ['lossScenarios']), 'loss scenario'),
          this.formatCount(this.countEntries(step5, ['safetyRequirements']), 'safety requirement')
        ]
      }
    ];
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.loadError.set(null);
        }),
        switchMap((params) => {
          const projectIdParam = params.get('projectId');
          const parsedProjectId = projectIdParam ? Number(projectIdParam) : null;
          const projectId = parsedProjectId && !Number.isNaN(parsedProjectId) ? parsedProjectId : null;

          this.currentProjectId.set(projectId);
          this.projectPayload.set(null);
          this.projectName.set(projectId ? `project-${projectId}` : 'project');

          if (!projectId) {
            this.isLoading.set(false);
            this.loadError.set('Open this page with a valid projectId query parameter to review previous steps and generate artifacts.');
            return EMPTY;
          }

          return this.projectService.getFullProjectInformation(projectId).pipe(
            tap((payload) => {
              this.projectPayload.set(payload);
              this.projectName.set(this.extractProjectName(payload, projectId));
            }),
            catchError((error) => {
              console.error(`Failed to load full project payload from GET /api/projects/${projectId}/full`, error);
              this.loadError.set(
                'Failed to load the full project information from /api/projects/{id}/full. Verify that the backend exposes this endpoint.'
              );
              return EMPTY;
            }),
            finalize(() => this.isLoading.set(false))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private countEntries(source: Record<string, unknown> | null | undefined, keys: string[]): number {
    return this.pickFirstArray(source, keys).length;
  }

  private formatCount(count: number, singular: string): string {
    const plural = singular.endsWith('s') ? singular : `${singular}s`;
    return `${count} ${count === 1 ? singular : plural}`;
  }

  private pickText(
    source: Record<string, unknown> | null | undefined,
    keys: string[],
    fallback: string
  ): string {
    if (!source) {
      return fallback;
    }

    for (const key of keys) {
      const value = this.pickByPath(source, key);
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return fallback;
  }

  private pickByPath(source: Record<string, unknown>, path: string): unknown {
    const segments = path.split('.');
    let current: unknown = source;

    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private pickFirstArray(source: Record<string, unknown> | null | undefined, keys: string[]): unknown[] {
    if (!source) {
      return [];
    }

    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private summarizeText(value: string, maxLength = 170): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 3).trim()}...`;
  }

  private extractProjectName(payload: Record<string, unknown>, projectId: number): string {
    const projectBlock = this.pickFirstObject(payload, ['project']) ?? {};
    const candidates = [
      payload['name'],
      payload['projectName'],
      payload['title'],
      projectBlock['name'],
      projectBlock['projectName'],
      projectBlock['title']
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return `project-${projectId}`;
  }

  private pickFirstObject(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
    for (const key of keys) {
      const value = payload[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }

    return null;
  }
}
