import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly appTitle = 'SafeSecRETS Studio';
  readonly appSubtitle = '7-Step ReSafety Workflow';
  readonly navOpen = signal(false);

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isAuthenticated = this.authService.authState;

  readonly navSections = [
    {
      heading: 'Workspace',
      links: [
        {
          path: '/',
          label: 'Home Dashboard',
          description: 'Portfolio of safety analyses and setup'
        }
      ]
    },
    {
      heading: 'RESafety Workflow',
      links: [
        {
          path: '/scope',
          label: 'Step 1 · Define SCS Scope',
          description: 'Define mission, hazards, and baseline constraints'
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

  logout(): void {
    this.authService.signOut();
    this.closeNav();
    this.router.navigate(['/login']);
  }
}
