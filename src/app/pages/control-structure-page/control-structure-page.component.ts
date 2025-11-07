import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

interface ControlAction {
  id: number;
  controller: string;
  action: string;
  controlledProcess: string;
  feedback: string;
}

interface FeedbackLoop {
  id: number;
  source: string;
  destination: string;
  signal: string;
  latency: string;
}

@Component({
  selector: 'app-control-structure-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './control-structure-page.component.html',
  styleUrl: './control-structure-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ControlStructurePageComponent {
  private readonly fb = inject(FormBuilder);

  readonly controlActionForm = this.fb.group({
    controller: ['', Validators.required],
    action: ['', Validators.required],
    controlledProcess: ['', Validators.required],
    feedback: ['', Validators.required]
  });

  private actionSeq = 3;

  readonly controlActions = signal<ControlAction[]>([
    {
      id: 1,
      controller: 'Infusion Controller',
      action: 'Set basal rate',
      controlledProcess: 'Insulin Pump Mechanism',
      feedback: 'Reservoir level, flow sensor'
    },
    {
      id: 2,
      controller: 'Caregiver Portal',
      action: 'Approve regimen update',
      controlledProcess: 'Regimen Configuration Service',
      feedback: 'Audit log confirmation'
    },
    {
      id: 3,
      controller: 'Cloud Update Service',
      action: 'Deploy firmware patch',
      controlledProcess: 'Device Firmware Manager',
      feedback: 'Checksum telemetry'
    }
  ]);

  readonly feedbackLoops = signal<FeedbackLoop[]>([
    {
      id: 1,
      source: 'Pump Sensors',
      destination: 'Infusion Controller',
      signal: 'Flow rate & occlusion alarms',
      latency: '< 250 ms'
    },
    {
      id: 2,
      source: 'Infusion Controller',
      destination: 'Caregiver Portal',
      signal: 'Alert notifications via MQTT',
      latency: '< 5 min'
    },
    {
      id: 3,
      source: 'Patient Mobile App',
      destination: 'Caregiver Portal',
      signal: 'Manual override confirmation',
      latency: 'Realtime'
    }
  ]);

  addControlAction(): void {
    if (this.controlActionForm.invalid) {
      this.controlActionForm.markAllAsTouched();
      return;
    }

    const value = this.controlActionForm.getRawValue();
    this.controlActions.update((current) => [
      {
        id: ++this.actionSeq,
        controller: value.controller ?? 'Controller',
        action: value.action ?? 'Control action',
        controlledProcess: value.controlledProcess ?? 'Process',
        feedback: value.feedback ?? 'Feedback'
      },
      ...current
    ]);

    this.controlActionForm.reset();
  }
}
