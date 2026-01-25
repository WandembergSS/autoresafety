import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
}

const ACCESS_TOKEN_KEY = 'auth.accessToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authenticated = signal(false);

  constructor() {
    // During SSR there is no browser storage.
    this.authenticated.set(Boolean(this.getAccessToken()));
  }

  /** Signal that emits the current authentication state. */
  readonly authState = this.authenticated.asReadonly();

  /** Check the current authentication state synchronously. */
  isAuthenticated(): boolean {
    return this.authenticated();
  }

  getAccessToken(): string | null {
    return (
      this.safeGetItem(this.getPersistentStorage(), ACCESS_TOKEN_KEY) ??
      this.safeGetItem(this.getSessionStorage(), ACCESS_TOKEN_KEY)
    );
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private getPersistentStorage(): Storage | null {
    return this.isBrowser() ? window.localStorage : null;
  }

  private getSessionStorage(): Storage | null {
    return this.isBrowser() ? window.sessionStorage : null;
  }

  private safeGetItem(storage: Storage | null, key: string): string | null {
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSetItem(storage: Storage | null, key: string, value: string): void {
    if (!storage) {
      return;
    }

    try {
      storage.setItem(key, value);
    } catch {
      // ignore (e.g. storage blocked)
    }
  }

  private safeRemoveItem(storage: Storage | null, key: string): void {
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }

  private getBackendRootUrl(): string {
    // Project API base is configured as `${host}/api`, but login lives at `${host}/auth/login`.
    return environment.backendApiUrl.replace(/\/api\/?$/, '');
  }

  /**
   * Sign in via the Quarkus backend. Expects a token response and persists it.
   *
   * Note: The backend contract uses `username` + `password`; the UI can still collect an email
   * and send it as the username.
   */
  async signIn(username: string, password: string, remember = true): Promise<void> {
    const payload: LoginRequest = { username, password };
    const loginUrl = `${this.getBackendRootUrl()}/auth/login`;

    const response = await firstValueFrom(this.http.post<LoginResponse>(loginUrl, payload));

    if (!response?.accessToken) {
      throw new Error('Login failed');
    }

    const persistentStorage = this.getPersistentStorage();
    const sessionStorage = this.getSessionStorage();
    const chosenStorage = remember ? persistentStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : persistentStorage;

    this.safeSetItem(chosenStorage, ACCESS_TOKEN_KEY, response.accessToken);
    // Ensure we don't keep a stale token in the other storage.
    this.safeRemoveItem(otherStorage, ACCESS_TOKEN_KEY);

    this.authenticated.set(true);
  }

  /** Clear authentication state and return to the login screen. */
  signOut(): void {
    this.safeRemoveItem(this.getPersistentStorage(), ACCESS_TOKEN_KEY);
    this.safeRemoveItem(this.getSessionStorage(), ACCESS_TOKEN_KEY);
    this.authenticated.set(false);
  }
}
