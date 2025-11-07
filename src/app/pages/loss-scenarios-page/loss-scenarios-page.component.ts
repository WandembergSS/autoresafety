import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type ScenarioStatus = 'open' | 'mitigated' | 'accepted';
type SeverityLevel = 'minor' | 'moderate' | 'major' | 'catastrophic';
type RequirementStatus = 'draft' | 'in-review' | 'implemented';

interface LossScenario {
  id: number;
  uca: string;
  hazard: string;
  outcome: string;
  severity: SeverityLevel;
  mitigations: string[];
  status: ScenarioStatus;
}

interface SafetyRequirement {
  id: number;
  title: string;
  linkedScenario: number;
  category: string;
  owner: string;
  dueDate: string;
  status: RequirementStatus;
}

@Component({
  selector: 'app-loss-scenarios-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './loss-scenarios-page.component.html',
  styleUrl: './loss-scenarios-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LossScenariosPageComponent {
  private readonly fb = inject(FormBuilder);

  readonly scenarioForm = this.fb.group({
    uca: ['', [Validators.required, Validators.maxLength(220)]],
    hazard: ['', [Validators.required, Validators.maxLength(220)]],
    outcome: ['', [Validators.required, Validators.maxLength(320)]],
    severity: ['major' as SeverityLevel, Validators.required],
    mitigations: ['', Validators.maxLength(320)]
  });

  readonly lossScenarios = signal<LossScenario[]>([
    {
      id: 31,
      uca: 'UCA-12: Increase throttle while obstacle detected',
      hazard: 'H-3: Collision with pedestrian at mid-block crossing',
      outcome: 'Vehicle acceleration overrides braking request when lidar misclassifies stroller.',
      severity: 'catastrophic',
      mitigations: ['Dual-sensor voting', 'Predictive braking override'],
      status: 'open'
    },
    {
      id: 32,
      uca: 'UCA-22: Defer pilot alert beyond 8 seconds',
      hazard: 'H-8: Flight crew loses situational awareness of automation state',
      outcome: 'Late alert prevents timely handover on approach in low visibility.',
      severity: 'major',
      mitigations: ['Cockpit callouts', 'Alert escalation ladder'],
      status: 'mitigated'
    },
    {
      id: 33,
      uca: 'UCA-05: Disable cooling loop during maintenance mode',
      hazard: 'H-14: Battery thermal runaway in charging depot',
      outcome: 'Manual override disables coolant circulation for more than 4 minutes.',
      severity: 'moderate',
      mitigations: ['Maintenance checklist update'],
      status: 'accepted'
    }
  ]);

  readonly safetyRequirements = signal<SafetyRequirement[]>([
    {
      id: 501,
      title: 'Implement redundant obstacle detection fusion controller',
      linkedScenario: 31,
      category: 'Control Logic',
      owner: 'Dana Ortiz',
      dueDate: '2025-01-15',
      status: 'in-review'
    },
    {
      id: 502,
      title: 'Add progressive pilot alert ladder with tactile cue',
      linkedScenario: 32,
      category: 'Human Factors',
      owner: 'Milan Petrov',
      dueDate: '2024-12-12',
      status: 'draft'
    },
    {
      id: 503,
      title: 'Mandate coolant bypass interlock in maintenance tooling',
      linkedScenario: 33,
      category: 'Procedural',
      owner: 'Keira Osei',
      dueDate: '2025-02-05',
      status: 'implemented'
    }
  ]);

  readonly scenarioSummary = computed(() => {
    const totals: Record<ScenarioStatus, number> = { open: 0, mitigated: 0, accepted: 0 };
    const bySeverity: Record<SeverityLevel, number> = {
      minor: 0,
      moderate: 0,
      major: 0,
      catastrophic: 0
    };

    for (const scenario of this.lossScenarios()) {
      totals[scenario.status] += 1;
      bySeverity[scenario.severity] += 1;
    }

    return {
      totals: [
        { label: 'Open Scenarios', value: totals.open, tone: 'warning' },
        { label: 'Mitigated', value: totals.mitigated, tone: 'success' },
        { label: 'Accepted', value: totals.accepted, tone: 'info' }
      ],
      severity: [
        { label: 'Catastrophic', value: bySeverity.catastrophic, tone: 'danger' },
        { label: 'Major', value: bySeverity.major, tone: 'warning' },
        { label: 'Moderate', value: bySeverity.moderate, tone: 'info' },
        { label: 'Minor', value: bySeverity.minor, tone: 'muted' }
      ]
    };
  });

  readonly upcomingReviews = computed(() =>
    this.safetyRequirements()
      .filter((item) => item.status !== 'implemented')
      .slice(0, 3)
  );

  addScenario(): void {
    if (this.scenarioForm.invalid) {
      this.scenarioForm.markAllAsTouched();
      return;
    }

    const raw = this.scenarioForm.getRawValue();
    const nextId = Math.max(0, ...this.lossScenarios().map((scenario) => scenario.id)) + 1;
    const mitigations = (raw.mitigations ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    this.lossScenarios.update((current) => [
      {
        id: nextId,
        uca: raw.uca ?? 'New UCA',
        hazard: raw.hazard ?? 'New hazard',
        outcome: raw.outcome ?? 'Outcome pending analysis',
        severity: (raw.severity as SeverityLevel) ?? 'major',
        mitigations,
        status: 'open'
      },
      ...current
    ]);

    this.scenarioForm.reset({ severity: 'major' });
  }

  changeScenarioStatus(id: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ScenarioStatus;

    this.lossScenarios.update((current) =>
      current.map((scenario) =>
        scenario.id === id ? { ...scenario, status: value } : scenario
      )
    );
  }

  changeRequirementStatus(id: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as RequirementStatus;

    this.safetyRequirements.update((current) =>
      current.map((requirement) =>
        requirement.id === id ? { ...requirement, status: value } : requirement
      )
    );
  }

  statusClass(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  severityClass(value: string): string {
    return `severity-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }
}
