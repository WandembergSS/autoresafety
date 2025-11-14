import { Injectable, signal } from '@angular/core';

interface Credentials {
  email: string;
  password: string;
}

const MOCK_USER: Credentials = {
  email: 'analyst@resafety.ai',
  password: 'resafety123'
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authenticated = signal(false);

  /** Signal that emits the current authentication state. */
  readonly authState = this.authenticated.asReadonly();

  /** Check the current authentication state synchronously. */
  isAuthenticated(): boolean {
    return this.authenticated();
  }

  /**
   * Mock sign-in routine. Accepts a fixed set of credentials and resolves after a short delay
   * to imitate a network round trip.
   */
  signIn(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const isValid = email.toLowerCase() === MOCK_USER.email && password === MOCK_USER.password;

        if (isValid) {
          this.authenticated.set(true);
          resolve();
        } else {
          reject(new Error('Invalid credentials'));
        }
      }, 600);
    });
  }

  /** Clear authentication state and return to the login screen. */
  signOut(): void {
    this.authenticated.set(false);
  }
}
