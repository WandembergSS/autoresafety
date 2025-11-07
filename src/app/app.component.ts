import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly appTitle = 'SafeSecRETS Studio';
  readonly appSubtitle = 'SafeSecIoT Canvas + 7-Step RESafety Workflow';
  readonly navOpen = signal(false);

  readonly navSections = [
    {
      heading: 'Workspace',
      links: [
        {
          path: '/',
          label: 'Home Dashboard',
          description: 'Portfolio of safety analyses and SafeSecIoT canvas setup'
        }
      ]
    },
    {
      heading: 'RESafety Workflow',
      links: [
        {
          path: '/scope',
          label: 'Step 1 · Define SCS Scope',
          description: 'SafeSecIoT Canvas · Mission, hazards, and baseline constraints'
        },
        {
          path: '/istar-models',
          label: 'Step 2 · iStar4Safety Models',
          description: 'Map actors, responsibilities, and safety goals'
        },
        {
          path: '/control-structure',
          label: 'Step 3 · Control Structure',
          description: 'Translate goals into STPA control loops'
        },
        {
          path: '/ucas',
          label: 'Step 4 · Unsafe Control Actions',
          description: 'Evaluate STPA contexts for each control action'
        },
        {
          path: '/controller-constraints',
          label: 'Step 5 · Controller Constraints',
          description: 'Invert UCAs into enforceable controller behaviour'
        },
        {
          path: '/loss-scenarios',
          label: 'Step 6 · Loss Scenarios & Safety Requirements',
          description: 'Assess causal scenarios and derive mitigations'
        },
        {
          path: '/model-update',
          label: 'Step 7 · Update iStar4Safety Models',
          description: 'Close the loop by syncing models and evidence'
        }
      ]
    }
  ];

  toggleNav(): void {
    this.navOpen.update((value) => !value);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }
}
