import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Project } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.backendApiUrl}/projects`;
  private readonly resumeUrl = `${environment.backendApiUrl}/project-resume`;
  private readonly minimalCreateUrl = `${environment.backendApiUrl}/projects/minimal-project-creation`;
  private readonly minimalUpdateUrl = `${environment.backendApiUrl}/projects/minimal-project-update`;

  /**
   * Returns only non-complete projects with basic fields (Quarkus: GET /api/project-resume).
   */
  listOpenResumes(): Observable<Project[]> {
    return this.http.get<Project[]>(this.resumeUrl);
  }

  list(): Observable<Project[]> {
    return this.http.get<Project[]>(this.baseUrl);
  }

  /**
   * Creates a project charter with minimal required data (Quarkus: POST /api/projects/minimal-project-creation).
   * Backend contract guarantees at least `name` is required.
   */
  createMinimal(payload: {
    name: string;
    currentStep?: number;
    domain?: string;
    owner?: string;
    description?: string;
  }): Observable<Project> {
    return this.http.post<Project>(this.minimalCreateUrl, payload);
  }

  /**
   * Updates only the project status (Quarkus: POST /api/projects/minimal-project-update).
   */
  updateMinimalStatus(payload: { id: number; status: string }): Observable<Project> {
    return this.http.post<Project>(this.minimalUpdateUrl, payload);
  }

  create(payload: Pick<Project, 'name' | 'description' | 'status'>): Observable<Project> {
    return this.http.post<Project>(this.baseUrl, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
