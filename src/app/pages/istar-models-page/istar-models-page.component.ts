import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

interface Actor {
  id: number;
  name: string;
  type: 'Controller' | 'Sensor' | 'Environment' | 'Stakeholder';
  responsibilities: string[];
}

interface GoalLink {
  id: number;
  fromActor: string;
  goal: string;
  linkType: 'achieves' | 'depends-on' | 'obstructs' | 'satisfies';
}

@Component({
  selector: 'app-istar-models-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './istar-models-page.component.html',
  styleUrl: './istar-models-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IstarModelsPageComponent {
  private readonly fb = inject(FormBuilder);

  readonly actorForm = this.fb.group({
    name: ['', Validators.required],
    type: ['Controller' as Actor['type'], Validators.required],
    responsibility: ['', Validators.required]
  });

  readonly goalForm = this.fb.group({
    fromActor: ['', Validators.required],
    goal: ['', Validators.required],
    linkType: ['achieves' as GoalLink['linkType'], Validators.required]
  });

  private actorSeq = 4;
  private goalSeq = 4;

  readonly actors = signal<Actor[]>([
    {
      id: 1,
      name: 'Infusion Controller',
      type: 'Controller',
      responsibilities: ['Deliver basal rate', 'Validate configuration download', 'Monitor pump telemetry']
    },
    {
      id: 2,
      name: 'Human Caregiver',
      type: 'Stakeholder',
      responsibilities: ['Approve regimen updates', 'Respond to abnormal alerts', 'Provide patient context']
    },
    {
      id: 3,
      name: 'Device Sensors',
      type: 'Sensor',
      responsibilities: ['Report reservoir levels', 'Detect occlusions', 'Measure ambient temperature']
    }
  ]);

  readonly goalLinks = signal<GoalLink[]>([
    {
      id: 1,
      fromActor: 'Infusion Controller',
      goal: 'Maintain commanded basal insulin delivery',
      linkType: 'achieves'
    },
    {
      id: 2,
      fromActor: 'Human Caregiver',
      goal: 'Approve configuration change',
      linkType: 'depends-on'
    },
    {
      id: 3,
      fromActor: 'Device Sensors',
      goal: 'Obstruct hazard: undetected occlusion',
      linkType: 'obstructs'
    }
  ]);

  addActor(): void {
    if (this.actorForm.invalid) {
      this.actorForm.markAllAsTouched();
      return;
    }

    const { name, type, responsibility } = this.actorForm.getRawValue();
    this.actors.update((current) => [
      {
        id: ++this.actorSeq,
        name: name ?? 'New Actor',
        type: (type as Actor['type']) ?? 'Controller',
        responsibilities: responsibility ? [responsibility] : []
      },
      ...current
    ]);

    this.actorForm.reset({ type: 'Controller' });
  }

  addGoalLink(): void {
    if (this.goalForm.invalid) {
      this.goalForm.markAllAsTouched();
      return;
    }

    const { fromActor, goal, linkType } = this.goalForm.getRawValue();
    this.goalLinks.update((current) => [
      {
        id: ++this.goalSeq,
        fromActor: fromActor ?? 'Actor',
        goal: goal ?? 'Goal',
        linkType: (linkType as GoalLink['linkType']) ?? 'achieves'
      },
      ...current
    ]);

    this.goalForm.reset({ linkType: 'achieves' });
  }
}
