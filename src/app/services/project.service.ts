import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Project } from '../models/project.model';

export type StepThreeEntityRole =
  | 'Controller'
  | 'Controlled Process'
  | 'Passive Entity'
  | 'Dependency/Restriction';

export type StepThreeOptionalElementType =
  | 'Feedback'
  | 'Process Model'
  | 'Control Algorithm'
  | 'Actuator'
  | 'Sensor'
  | 'External Input';

export interface StepThreeEntityCandidate {
  id: string;
  name: string;
  sourceType: 'systemComponent' | 'srActor';
  sourceStep: '1.1.5' | '2.2';
  sourceRefId: string;
}

export interface StepThreeResponsibility {
  id: string;
  code: string;
  text: string;
  label: string;
}

export interface StepThreeExternalSource {
  id: string;
  label: string;
}

export interface StepThreeEntityRecord {
  id: string;
  entityCandidateId: string;
  name: string;
  roles: StepThreeEntityRole[];
}

export interface StepThreeControlActionRecord {
  id: string;
  ref: string;
  action: string;
  sourceEntityId: string;
  targetEntityId: string;
  responsibilityId: string;
}

export interface StepThreeOptionalElementRecord {
  id: string;
  type: StepThreeOptionalElementType;
  name: string;
  sourceKind: 'entity' | 'external';
  sourceEntityId: string | null;
  sourceExternalId: string | null;
  destinationKind: 'entity' | 'external';
  destinationEntityId: string | null;
  destinationExternalId: string | null;
  responsibilityId: string;
}

export interface StepThreeProjectInformation {
  projectId: number;
  step: number;
  availableInputs: {
    entityCandidates: StepThreeEntityCandidate[];
    responsibilities: StepThreeResponsibility[];
    entityRoles: StepThreeEntityRole[];
    optionalElementTypes: StepThreeOptionalElementType[];
    externalSources: StepThreeExternalSource[];
  };
  currentData: {
    entities: StepThreeEntityRecord[];
    controlActions: StepThreeControlActionRecord[];
    optionalElements: StepThreeOptionalElementRecord[];
  };
  defaults: {
    nextControlActionRef: string;
    defaultOptionalElementType: StepThreeOptionalElementType;
  };
}

export interface StepFourControlActionCatalogItem {
  ref: string;
  sourceActor: string;
  targetActor: string;
  controller: string;
  controlAction: string;
  controlledProcess: string;
}

export interface StepFourHazardCatalogItem {
  id: string;
  code: string;
  description: string;
  label: string;
}

export interface StepFourResponsibilityCatalogItem {
  responsibilityId: string;
  responsibilityCode: string;
  responsibilityText: string;
  responsibilityLabel: string;
  safetyConstraintId: string;
  safetyConstraintCode: string;
  safetyConstraintText: string;
  safetyConstraintLabel: string;
}

export interface StepFourUnsafeControlActionRecord {
  id: number;
  ref: string;
  controlActionRef: string;
  sourceActor: string;
  targetActor: string;
  controller: string;
  controlAction: string;
  controlledProcess: string;
  category: 'Not provided' | 'Provided incorrectly' | 'Incorrect timing' | 'Stopped too soon / applied too long';
  context: string;
  consequence: string;
  rationale: string;
  hazardRefs: string[];
  responsibilityId: string;
  safetyConstraintId: string;
}

export interface StepFourHazardousConditionRecord {
  id: number;
  ref: string;
  description: string;
  linkedHazardRefs: string[];
  responsibilityId: string;
  safetyConstraintId: string;
  coverageGap: string;
}

export interface StepFourControllerConstraintRecord {
  id: number;
  constraintId: string;
  sourceRef: string;
  hazardLinkage: string;
  responsibilityChain: string;
  constraint: string;
  enforcementMechanism: string;
  status: 'Draft' | 'Approved' | 'Pending Review';
}

export interface StepFourProjectInformation {
  projectId: number;
  step: number;
  catalogs: {
    controlActions: StepFourControlActionCatalogItem[];
    hazards: StepFourHazardCatalogItem[];
    responsibilities: StepFourResponsibilityCatalogItem[];
  };
  currentData: {
    unsafeControlActions: StepFourUnsafeControlActionRecord[];
    hazardousConditions: StepFourHazardousConditionRecord[];
    controllerConstraints: StepFourControllerConstraintRecord[];
  };
  defaults: {
    nextUcaRef: string;
    nextHcRef: string;
    nextConstraintId: string;
  };
}

export interface StepFiveUnsafeBehavior {
  id: string;
  type: 'UCA' | 'HC';
  title: string;
  description: string | null;
  hazards: string[];
}

export interface StepFiveLossScenario {
  id: string;
  description: string | null;
  associatedUnsafeBehaviorIds: string[];
  sourceRationale: string | null;
}

export interface StepFiveSafetyRequirement {
  id: string;
  description: string | null;
  addressedLossScenarioIds: string[];
}

export interface StepFiveProjectInformation {
  projectId: number;
  step: 5;
  availableInputs: {
    unsafeBehaviors: StepFiveUnsafeBehavior[];
  };
  currentData: {
    lossScenarios: StepFiveLossScenario[];
    safetyRequirements: StepFiveSafetyRequirement[];
  };
  defaults: {
    nextLossScenarioId: string;
    nextSafetyRequirementId: string;
  };
}

export interface StepSixResponsibilityOption {
  id: string;
  actor: string;
  name: string;
}

export interface StepSixUnsafeBehaviorOption {
  id: string;
  type: 'UCA' | 'HC';
  responsibilityId: string;
  description: string;
}

export interface StepSixLossScenarioOption {
  id: string;
  description: string;
  unsafeBehaviorIds: string[];
}

export interface StepSixSafetyRequirementOption {
  id: string;
  description: string;
  lossScenarioIds: string[];
}

export interface StepSixInjectedUnsafeBehavior {
  responsibilityId: string;
  unsafeBehaviorId: string;
  elementType: 'SafetyTask';
  obstructsLinked: boolean;
}

export interface StepSixInjectedLossScenario {
  targetUnsafeBehaviorId: string;
  lossScenarioId: string;
  elementType: 'Hazard';
  triggerLinked: boolean;
}

export interface StepSixInjectedSafetyRequirement {
  targetLossScenarioId: string;
  safetyRequirementId: string;
  elementType: 'SafetyTask';
  relationshipType: 'OR' | 'AND';
}

export interface StepSixVerificationResult {
  ranAt: string;
  passed: boolean;
  checks: string[];
  errors: string[];
}

export interface StepSixProjectInformation {
  responsibilities: StepSixResponsibilityOption[];
  unsafeBehaviors: StepSixUnsafeBehaviorOption[];
  lossScenarios: StepSixLossScenarioOption[];
  safetyRequirements: StepSixSafetyRequirementOption[];
  injectedUnsafeBehaviors: StepSixInjectedUnsafeBehavior[];
  injectedLossScenarios: StepSixInjectedLossScenario[];
  injectedSafetyRequirements: StepSixInjectedSafetyRequirement[];
  currentView: 'SR' | 'SD';
  verificationResult: StepSixVerificationResult | null;
}

export interface StepTwoProjectUpdatePayload {
  id: number;
  step2Information: {
    modelName: string | null;
    actors: unknown[];
    dependencies: unknown[];
  };
}

export interface StepThreeProjectUpdatePayload {
  id: number;
  step3Information: {
    entities: StepThreeEntityRecord[];
    controlActions: StepThreeControlActionRecord[];
    optionalElements: StepThreeOptionalElementRecord[];
  };
}

export interface StepFourProjectUpdatePayload {
  id: number;
  step4Information: {
    unsafeControlActions: StepFourUnsafeControlActionRecord[];
    hazardousConditions: StepFourHazardousConditionRecord[];
    controllerConstraints: StepFourControllerConstraintRecord[];
  };
}

export interface StepFiveProjectUpdatePayload {
  id: number;
  step5Information: {
    lossScenarios: StepFiveLossScenario[];
    safetyRequirements: StepFiveSafetyRequirement[];
  };
}

export interface StepSixProjectUpdatePayload {
  id: number;
  step6Information: {
    injectedUnsafeBehaviors: StepSixInjectedUnsafeBehavior[];
    injectedLossScenarios: StepSixInjectedLossScenario[];
    injectedSafetyRequirements: StepSixInjectedSafetyRequirement[];
  };
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.backendApiUrl}/projects`;
  private readonly resumeUrl = `${environment.backendApiUrl}/project-resume`;
  private readonly minimalCreateUrl = `${environment.backendApiUrl}/projects/minimal-project-creation`;
  private readonly minimalUpdateUrl = `${environment.backendApiUrl}/projects/minimal-project-update`;
  private readonly stepOneInfoUrl = `${environment.backendApiUrl}/projects/step_one_project_information`;
  private readonly stepOneUpdateUrl = `${environment.backendApiUrl}/projects/step_one_project_update`;
  private readonly stepTwoInfoUrl = `${environment.backendApiUrl}/projects/step_two_project_information`;
  private readonly stepTwoUpdateUrl = `${environment.backendApiUrl}/projects/step_two_project_update`;
  private readonly stepThreeInfoUrl = `${environment.backendApiUrl}/projects/step_three_project_information`;
  private readonly stepThreeUpdateUrl = `${environment.backendApiUrl}/projects/step_three_project_update`;
  private readonly stepFourInfoUrl = `${environment.backendApiUrl}/projects/step_four_project_information`;
  private readonly stepFourUpdateUrl = `${environment.backendApiUrl}/projects/step_four_project_update`;
  private readonly stepFiveInfoUrl = `${environment.backendApiUrl}/projects/step_five_project_information`;
  private readonly stepFiveUpdateUrl = `${environment.backendApiUrl}/projects/step_five_project_update`;
  private readonly stepSixInfoUrl = `${environment.backendApiUrl}/projects/step_six_project_information`;
  private readonly stepSixUpdateUrl = `${environment.backendApiUrl}/projects/step_six_project_update`;

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

  /**
   * Returns Step 1 (Scope) data for a project document.
   * GET /api/projects/step_one_project_information/{id}
   */
  getStepOneScope(projectId: number): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.stepOneInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Updates Step 1 (Scope) data for a project document.
   * POST /api/projects/step_one_project_update
   */
  updateStepOneScope(payload: object): Observable<void> {
    return this.http.post<void>(this.stepOneUpdateUrl, payload);
  }

  /**
   * Returns Step 2 (iStar4Safety model) data for a project document.
   * GET /api/projects/step_two_project_information/{id}
   */
  getStepTwoInformation(projectId: number): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.stepTwoInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Returns Step 3 (Control Structure) data for a project document.
   * GET /api/projects/step_three_project_information/{id}
   */
  getStepThreeInformation(projectId: number): Observable<StepThreeProjectInformation> {
    return this.http.get<StepThreeProjectInformation>(`${this.stepThreeInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Returns Step 4 (UCA and hazardous condition) data for a project document.
   * GET /api/projects/step_four_project_information/{id}
   */
  getStepFourInformation(projectId: number): Observable<StepFourProjectInformation> {
    return this.http.get<StepFourProjectInformation>(`${this.stepFourInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Returns Step 5 (Loss scenarios and safety requirements) data for a project document.
   * GET /api/projects/step_five_project_information/{id}
   */
  getStepFiveInformation(projectId: number): Observable<StepFiveProjectInformation> {
    return this.http.get<StepFiveProjectInformation>(`${this.stepFiveInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Returns Step 6 (model update) data for a project document.
   * GET /api/projects/step_six_project_information/{id}
   */
  getStepSixInformation(projectId: number): Observable<StepSixProjectInformation> {
    return this.http.get<StepSixProjectInformation>(`${this.stepSixInfoUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Updates Step 2 (iStar4Safety model) data for a project document.
   * POST /api/projects/step_two_project_update
   */
  updateStepTwoInformation(payload: StepTwoProjectUpdatePayload): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(this.stepTwoUpdateUrl, payload);
  }

  /**
   * Updates Step 3 (Control Structure) data for a project document.
   * POST /api/projects/step_three_project_update
   */
  updateStepThreeInformation(payload: StepThreeProjectUpdatePayload): Observable<StepThreeProjectInformation> {
    return this.http.post<StepThreeProjectInformation>(this.stepThreeUpdateUrl, payload);
  }

  /**
   * Updates Step 4 (UCAs and controller constraints) data for a project document.
   * POST /api/projects/step_four_project_update
   */
  updateStepFourInformation(payload: StepFourProjectUpdatePayload): Observable<StepFourProjectInformation> {
    return this.http.post<StepFourProjectInformation>(this.stepFourUpdateUrl, payload);
  }

  /**
   * Updates Step 5 (Loss scenarios and safety requirements) data for a project document.
   * POST /api/projects/step_five_project_update
   */
  updateStepFiveInformation(payload: StepFiveProjectUpdatePayload): Observable<StepFiveProjectInformation> {
    return this.http.post<StepFiveProjectInformation>(this.stepFiveUpdateUrl, payload);
  }

  /**
   * Updates Step 6 (model update) data for a project document.
   * POST /api/projects/step_six_project_update
   */
  updateStepSixInformation(payload: StepSixProjectUpdatePayload): Observable<StepSixProjectInformation> {
    return this.http.post<StepSixProjectInformation>(this.stepSixUpdateUrl, payload);
  }

  /**
   * Returns the complete persisted project payload.
   * GET /api/projects/{id}
   */
  getProjectInformation(projectId: number): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/${projectId}`, {
      transferCache: false
    });
  }

  /**
   * Returns the full project document payload including all step blocks.
   * GET /api/projects/{id}/full
   */
  getFullProjectInformation(projectId: number): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/${projectId}/full`, {
      transferCache: false
    });
  }

  create(payload: Pick<Project, 'name' | 'description' | 'status'>): Observable<Project> {
    return this.http.post<Project>(this.baseUrl, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
