import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface WorkflowStep {
  number: string;
  title: string;
  summary: string;
  highlights: string[];
}

interface HelpTip {
  title: string;
  description: string;
}

@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './help-page.component.html',
  styleUrl: './help-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpPageComponent {
  readonly appTitle = 'AutoReSafety';
  readonly appSubtitle = '6-Step ReSafety Workflow';

  readonly intro =
    'AutoReSafety guides you through the ReSafety method to perform a structured safety analysis of a ' +
    'socio-technical system. You progress through six sequential steps, and each step builds on the ' +
    'artefacts produced in the previous one. AI assistance is available throughout to draft and refine ' +
    'content, which you can always review and edit before saving.';

  readonly steps: WorkflowStep[] = [
    {
      number: '1',
      title: 'Define SCS Scope',
      summary:
        'Establish the foundation of the analysis: clarify the objectives, describe the system and its ' +
        'boundary, then identify losses, hazards, safety constraints, responsibilities, and relevant artefacts.',
      highlights: [
        'Clarify analysis objectives, system definition, and system boundary',
        'Identify losses, system-level hazards, and safety constraints',
        'Define responsibilities and gather supporting resources and artefacts'
      ]
    },
    {
      number: '2',
      title: 'iStar4Safety Models',
      summary:
        'Map the actors, their responsibilities, and the safety goals using the iStar4Safety modelling ' +
        'notation, translating the scope from Step 1 into a goal-oriented model.',
      highlights: [
        'Model actors and their dependencies',
        'Assign responsibilities and safety goals',
        'Connect the model back to losses and hazards'
      ]
    },
    {
      number: '3',
      title: 'Control Structure',
      summary:
        'Translate the goals and responsibilities into an STPA control structure, defining controllers, ' +
        'control actions, and feedback loops between system components.',
      highlights: [
        'Define controllers and controlled processes',
        'Specify control actions and feedback paths',
        'Build the hierarchical control loops used by later steps'
      ]
    },
    {
      number: '4',
      title: 'Unsafe Control Actions & Hazardous Conditions',
      summary:
        'Evaluate each control action across STPA contexts to discover Unsafe Control Actions (UCAs) and ' +
        'hazardous conditions, then trace them back to the hazards from Step 1.',
      highlights: [
        'Assess control actions for the four UCA categories',
        'Capture hazardous conditions and coverage gaps',
        'Derive controller constraints and link them to hazards'
      ]
    },
    {
      number: '5',
      title: 'Loss Scenarios & Safety Requirements',
      summary:
        'Analyse the causal scenarios that can lead to the identified UCAs and losses, and derive the ' +
        'safety requirements and mitigations needed to address them.',
      highlights: [
        'Investigate causal factors behind each scenario',
        'Formulate mitigation strategies',
        'Register safety requirements with full traceability'
      ]
    },
    {
      number: '6',
      title: 'Update iStar4Safety Models',
      summary:
        'Review the completed steps, fold the new safety reasoning back into the iStar4Safety models, and ' +
        'generate the consolidated ReSafety artefacts for the iteration.',
      highlights: [
        'Update the models with scenarios and requirements',
        'Verify consistency and traceability across all steps',
        'Generate the final ReSafety artefacts for the iteration'
      ]
    }
  ];

  readonly tips: HelpTip[] = [
    {
      title: 'Work step by step',
      description:
        'Steps are sequential. Complete and save each step before moving on so that later steps have the ' +
        'data they depend on.'
    },
    {
      title: 'Use the side navigation',
      description:
        'Once inside a project, the left-hand navigation lets you jump between steps and return to the ' +
        'Home Dashboard at any time.'
    },
    {
      title: 'AI is a draft, you decide',
      description:
        'AI suggestions are starting points. Always review, edit, and confirm the generated content before ' +
        'saving it to your project.'
    },
    {
      title: 'Manage projects from Home',
      description:
        'The Home Dashboard is where you create new analyses, resume open ones, and track their progress.'
    }
  ];
}
