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

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.backendApiUrl}/assistant`;

  generate(request: GenerationRequest): Observable<GenerationResponse> {
    return this.http.post<GenerationResponse>(`${this.baseUrl}/generate`, request);
  }
}
