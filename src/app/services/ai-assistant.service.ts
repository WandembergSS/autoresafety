import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GenerationRequest {
  taskType: string;
  inputs: string[];
  domainContext?: string;
}

export interface GenerationResponse {
  provider: string;
  model?: string;
  suggestions: string[];
}

export interface AskRequest {
  question: string;
  context?: string;
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.backendApiUrl}/assistant`;
  private readonly askUrl = `${environment.backendApiUrl}/ai/ask`;

  generate(request: GenerationRequest): Observable<GenerationResponse> {
    return this.http.post<GenerationResponse>(`${this.baseUrl}/generate`, request);
  }

  ask(request: AskRequest): Observable<unknown> {
    return this.http.post<unknown>(this.askUrl, request);
  }
}
