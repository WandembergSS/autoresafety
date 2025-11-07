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
  readonly appTitle = 'AutoRESafety Workbench';
  readonly navOpen = signal(false);

  readonly steps = [
    { path: '/scope', label: '1. Scope Definition' },
    { path: '/istar-models', label: '2. iStar4Safety Models' },
    { path: '/control-structure', label: '3. Control Structure' },
    { path: '/ucas', label: '4. Unsafe Control Actions' },
    { path: '/controller-constraints', label: '5. Controller Constraints' },
    { path: '/loss-scenarios', label: '6. Loss Scenarios & Safety Requirements' },
    { path: '/model-update', label: '7. Update iStar4Safety' }
  ];

  toggleNav(): void {
    this.navOpen.update((value) => !value);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }
}
