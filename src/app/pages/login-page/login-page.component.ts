import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly appTitle = 'AutoReSafety';
  readonly status = signal<'idle' | 'submitting' | 'success'>('idle');
  readonly errorMessage = signal<string | null>(null);

  readonly loginForm = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true]
  });

  signIn(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { username, password, remember } = this.loginForm.getRawValue();

    this.errorMessage.set(null);
    this.status.set('submitting');

    this.authService
      .signIn(username ?? '', password ?? '', remember ?? true)
      .then(() => {
        this.status.set('success');
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/';
        setTimeout(() => {
          this.router.navigateByUrl(redirectTo);
        }, 500);
      })
      .catch((error: unknown) => {
        this.status.set('idle');
        const message = error instanceof Error ? error.message : 'Invalid credentials.';
        this.errorMessage.set(message || 'Invalid credentials.');
        this.loginForm.controls.password.reset('');
      });
  }
}
