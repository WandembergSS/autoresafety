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

interface TraceabilityDetail {
  requirementId: number;
  code: string;
  statement: string;
  uca: { id: string; description: string };
  hazards: string[];
  losses: string[];
  constraints: string[];
  controlActions: string[];
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
      id: 101,
      uca: 'UCA-Saf-1: Control app releases insulin without satisfying authentication',
      hazard: 'H-2: Unauthorized insulin delivery during high glucose',
      outcome:
        'Control application issues a bolus command before the CGM confirms glucose is within the safe range.',
      severity: 'catastrophic',
      mitigations: ['R-Saf-1 · Enforce authentication before insulin release'],
      status: 'open'
    },
    {
      id: 102,
      uca: 'UCA-Saf-6: CGM provides delayed glucose sample',
      hazard: 'H-5: Control application acts on stale glucose data',
      outcome:
        'Sensor latency hides a sudden glucose drop, delaying the controller response and triggering hypoglycemia.',
      severity: 'major',
      mitigations: ['R-Saf-6 · Guard against delayed samples', 'R-Saf-7 · Require pump behaviour check'],
      status: 'mitigated'
    },
    {
      id: 103,
      uca: 'UCA-Saf-9: Pump stops infusion before delivering prescribed dose',
      hazard: 'H-3: Patient receives insufficient insulin',
      outcome:
        'Pump firmware aborts infusion early after a communications glitch, leaving the patient under-dosed.',
      severity: 'moderate',
      mitigations: ['R-Saf-8 · Monitor pump actuation timing'],
      status: 'accepted'
    }
  ]);

  readonly safetyRequirements = signal<SafetyRequirement[]>([
    {
      id: 601,
      title: 'R-Saf-1 · Require authentication before insulin release commands',
      linkedScenario: 101,
      category: 'Control Logic',
      owner: 'Nia Marques',
      dueDate: '2025-01-15',
      status: 'in-review'
    },
    {
      id: 602,
      title: 'R-Saf-6 · Reject CGM samples that exceed age threshold',
      linkedScenario: 102,
      category: 'Sensing',
      owner: 'Miguel Santos',
      dueDate: '2024-12-12',
      status: 'draft'
    },
    {
      id: 603,
      title: 'R-Saf-8 · Monitor pump actuation completion feedback',
      linkedScenario: 103,
      category: 'Device Firmware',
      owner: 'Laura Chen',
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

  private readonly traceabilityCatalog: Record<number, TraceabilityDetail> = {
    601: {
      requirementId: 601,
      code: 'R-Saf-1',
      statement:
        'The system must not provide the control application with the ability to release insulin without first satisfying proper authentication.',
      uca: {
        id: 'UCA-Saf-1',
        description: 'Control application releases insulin without performing authentication.'
      },
      hazards: ['H-2 · Release insulin when glucose is high', 'H-4 · Control app bypasses security constraint'],
      losses: ['L-1 · Patient experiences severe hypoglycemia or hyperglycemia', 'L-4 · Loss of trust in the AID system'],
      constraints: ['SC-Sec-4 · Implement robust authentication and access control mechanisms'],
      controlActions: ['CA-1 · Release insulin delivery']
    },
    602: {
      requirementId: 602,
      code: 'R-Saf-6',
      statement:
        'The system must provide the CGM with the ability to deliver timely glucose readings after each sensor capture.',
      uca: {
        id: 'UCA-Saf-6',
        description: 'CGM provides a measure of glucose level too late after performing the sensor reading.'
      },
      hazards: ['H-5 · Use of stale glucose data', 'H-6 · Delayed therapy adjustments'],
      losses: ['L-2 · Patient suffers harm due to delayed insulin delivery'],
      constraints: ['SC-Saf-6 · CGM must publish samples within defined latency bounds'],
      controlActions: ['CA-2 · Measure glucose level']
    },
    603: {
      requirementId: 603,
      code: 'R-Saf-8',
      statement:
        'The system must ensure the insulin pump delivers insulin promptly upon release by the control application.',
      uca: {
        id: 'UCA-Saf-8',
        description: 'Insulin pump provides insulin delivery too late after release by the control application.'
      },
      hazards: ['H-1 · Patient receives incorrect insulin dosage', 'H-3 · Pump stops delivering before dosage is complete'],
      losses: ['L-1 · Patient experiences severe hypo/hyperglycemia'],
      constraints: ['SC-Saf-5 · Pump must confirm actuation timings'],
      controlActions: ['CA-5 · Deliver insulin']
    }
  };

  readonly traceability = signal<TraceabilityDetail | null>(null);

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

  openTraceability(requirementId: number): void {
    const detail = this.traceabilityCatalog[requirementId] ?? null;
    this.traceability.set(detail);
  }

  closeTraceability(): void {
    this.traceability.set(null);
  }
}
