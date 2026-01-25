import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HTTP_INTERCEPTORS
} from '@angular/common/http';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly authService: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Public endpoints that must not receive Authorization headers.
    // Some backends will reject requests if an unexpected/invalid Bearer token is present,
    // even when the endpoint itself is permit-all.
    const requestPath = this.getRequestPath(req.url);
    const isPublicEndpoint =
      requestPath === '/api/project-resume' ||
      requestPath.startsWith('/api/project-resume/') ||
      requestPath === '/api/projects/minimal-project-creation';
    if (isPublicEndpoint) {
      return next.handle(req);
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      return next.handle(req);
    }

    const apiBase = environment.backendApiUrl;

    // If backendApiUrl is relative (e.g. "/api"), avoid attaching the token to *all* relative
    // requests like assets. Only attach to backend routes.
    if (apiBase.startsWith('/')) {
      const isBackendRoute = req.url.startsWith('/api/') || req.url === '/api' || req.url.startsWith('/auth/');
      if (!isBackendRoute) {
        return next.handle(req);
      }
    } else {
      // Absolute base (e.g. "http://localhost:8080/api"): attach to /api/** and /auth/** on that host.
      const backendRoot = apiBase.replace(/\/api\/?$/, '');
      const isBackendRequest =
        req.url.startsWith(apiBase) || req.url.startsWith(`${backendRoot}/auth/`) || req.url === `${backendRoot}/auth`;
      if (!isBackendRequest) {
        return next.handle(req);
      }
    }

    return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }

  private getRequestPath(url: string): string {
    // Absolute URL: https://host/api/...
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        return new URL(url).pathname;
      } catch {
        // Fall through to basic parsing.
      }
    }

    // Relative URL: /api/...
    const withoutQuery = url.split('?')[0] ?? url;
    return withoutQuery;
  }
}

export const AUTH_INTERCEPTOR_PROVIDER = {
  provide: HTTP_INTERCEPTORS,
  useClass: AuthInterceptor,
  multi: true
};
