import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ControlStructurePageComponent } from './control-structure-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService, StepThreeProjectInformation } from '../../services/project.service';

describe('ControlStructurePageComponent', () => {
  let aiAssistant: jasmine.SpyObj<AiAssistantService>;
  let aiFeedback: jasmine.SpyObj<AiFeedbackService>;
  let projectService: jasmine.SpyObj<ProjectService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    aiAssistant = jasmine.createSpyObj<AiAssistantService>('AiAssistantService', ['askWithSummary']);
    aiFeedback = jasmine.createSpyObj<AiFeedbackService>('AiFeedbackService', [
      'showSuccess',
      'showSummary',
      'showError',
      'showWarning',
      'showPartial'
    ]);
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', [
      'updateStepThreeInformation',
      'updateStepOneScope'
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ControlStructurePageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('keeps the Step 3 loading button and structured form application working with AI summaries', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    component.availableEntityRoles.set(['Controller', 'Controlled Process']);
    component.optionalElementTypes.set(['Feedback']);
    component.entityCandidates.set([{ id: 'entity-1', label: 'Brake Controller' } as never]);
    component.availableResponsibilities.set([
      {
        label: 'Maintain braking stability'
      } as never
    ]);

    component.entities.set([
      {
        id: 'entity-1',
        name: 'Brake Controller',
        roles: ['Controller']
      },
      {
        id: 'entity-2',
        name: 'Brake Actuator',
        roles: ['Controlled Process']
      }
    ]);

    fixture.detectChanges();
    component.generateStepThreeWithAi();
    fixture.detectChanges();

    const aiButton = fixture.nativeElement.querySelector('button.button--ai') as HTMLButtonElement;
    expect(component.isGeneratingStepThreeAi()).toBeTrue();
    expect(aiButton.textContent).toContain('Generating...');
    expect(aiButton.querySelector('.button__spinner')).not.toBeNull();

    response$.next({
      payload: {
        entities: [
          { name: 'Brake Controller', roles: ['Controller'] },
          { name: 'Brake Actuator', roles: ['Controlled Process'] }
        ],
        controlActions: [
          {
            ref: 'CA-01',
            action: 'Send braking command',
            sourceController: 'Brake Controller',
            targetProcess: 'Brake Actuator',
            responsibility: 'Maintain braking stability'
          }
        ],
        optionalElements: []
      },
      summary: 'Adds the controller, the actuator, and one control action.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.entities().length).toBe(2);
    expect(component.controlActions().length).toBe(1);
    expect(component.stepThreeSaveMessage()).toBe('AI proposal applied to Step 3. Review and save when ready.');
    expect(aiFeedback.showSummary).toHaveBeenCalledWith('Adds the controller, the actuator, and one control action.');
    expect(component.isGeneratingStepThreeAi()).toBeFalse();
    expect(aiButton.textContent).toContain('Generate with AI');
    expect(aiButton.querySelector('.button__spinner')).toBeNull();
  });

  it('opens a Step 3 AI configuration modal before ask and builds the prompt from the selected options', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    aiAssistant.askWithSummary.and.returnValue(
      of({ payload: { entities: [], controlActions: [], optionalElements: [] }, summary: 'No changes.' })
    );

    component.availableEntityRoles.set(['Controller', 'Controlled Process']);
    component.optionalElementTypes.set(['Feedback', 'Sensor']);
    component.entityCandidates.set([
      {
        id: 'entity-1',
        name: 'PLC',
        sourceType: 'systemComponent',
        sourceStep: '1.1.5',
        sourceRefId: '1'
      } as never
    ]);
    component.availableResponsibilities.set([
      {
        id: 'resp-1',
        code: 'R-01',
        text: 'Maintain throughput',
        label: 'R-01 - Maintain throughput'
      } as never
    ]);

    fixture.detectChanges();

    const aiButton = fixture.nativeElement.querySelector('button.button--ai') as HTMLButtonElement;
    aiButton.click();
    fixture.detectChanges();

    expect(component.isStepThreeAiModalOpen()).toBeTrue();
    expect(aiAssistant.askWithSummary).not.toHaveBeenCalled();

    component.stepThreeAiConfigForm.patchValue({
      allowNewControllers: false,
      existingControllersOnly: true,
      minControlActions: 3,
      maxControlActions: 5,
      minOptionalElements: 2,
      maxOptionalElements: 4,
      promptInstructions: 'Prefer actuator and sensor feedback tied to emergency stop behavior.'
    });

    component.submitStepThreeAiRequest();
    fixture.detectChanges();

    expect(aiAssistant.askWithSummary).toHaveBeenCalled();
    const request = aiAssistant.askWithSummary.calls.mostRecent().args[0] as {
      question: string;
      context: string;
    };

    expect(request.question).toContain('Use only controllers that already exist in currentData or in the Step 1.1.5 system components returned through entityCandidates.');
    expect(request.question).toContain('Add between 3 and 5 NEW control actions');
    expect(request.question).toContain('Add between 2 and 4 NEW optional elements');
    expect(request.question).toContain('Prefer actuator and sensor feedback tied to emergency stop behavior.');
  });

  it('stages new controllers for approval, updates Step 1, and then applies the filtered Step 3 AI additions', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());
    projectService.updateStepOneScope.and.returnValue(of(void 0));

    component.availableEntityRoles.set(['Controller', 'Controlled Process']);
    component.optionalElementTypes.set(['Feedback', 'Sensor']);
    component.entityCandidates.set([
      { id: 'entity-1', label: 'Brake Controller' } as never,
      { id: 'entity-2', label: 'Brake Actuator' } as never
    ]);
    component.availableResponsibilities.set([
      {
        id: 'resp-1',
        label: 'Maintain braking stability'
      } as never,
      {
        id: 'resp-2',
        label: 'Monitor actuator state'
      } as never
    ]);

    component.entities.set([
      {
        id: 'entity-1',
        name: 'Brake Controller',
        roles: ['Controller']
      },
      {
        id: 'entity-2',
        name: 'Brake Actuator',
        roles: ['Controlled Process']
      }
    ]);
    component.controlActions.set([
      {
        id: 'action-1',
        ref: 'CA-01',
        action: 'Hold brake pressure',
        sourceController: 'Brake Controller',
        targetProcess: 'Brake Actuator',
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        responsibility: 'Maintain braking stability',
        responsibilityId: 'resp-1'
      }
    ]);
    component.currentProjectId.set(7);
    (component as never as { latestStepOneScope: Record<string, unknown> }).latestStepOneScope = {
      systemComponents: [
        {
          id: 1,
          name: 'Brake Controller',
          description: 'Existing controller'
        },
        {
          id: 2,
          name: 'Brake Actuator',
          description: 'Existing process'
        }
      ]
    };

    fixture.detectChanges();
    component.generateStepThreeWithAi();

    response$.next({
      payload: {
        entities: [
          { name: 'Brake Controller', roles: ['Controller'] },
          { name: 'Brake Actuator', roles: ['Controller', 'Controlled Process'] },
          { name: 'Human Operator', roles: ['Controller'] },
          { name: 'Wheel Speed Sensor', roles: ['Controlled Process'] }
        ],
        controlActions: [
          {
            ref: 'CA-01',
            action: 'Hold brake pressure',
            sourceController: 'Brake Controller',
            targetProcess: 'Brake Actuator',
            responsibility: 'Maintain braking stability'
          },
          {
            ref: 'CA-02',
            action: 'Release brake pressure',
            sourceController: 'Brake Controller',
            targetProcess: 'Brake Actuator',
            responsibility: 'Monitor actuator state'
          },
          {
            ref: 'CA-03',
            action: 'Manual brake override',
            sourceController: 'Human Operator',
            targetProcess: 'Brake Actuator',
            responsibility: 'Provide manual override capability'
          }
        ],
        optionalElements: [
          {
            type: 'Monitoring',
            name: 'Brake pressure feedback',
            source: 'Brake Actuator',
            destination: 'Brake Controller',
            responsibility: 'Monitor actuator state'
          },
          {
            type: 'Sensing',
            name: 'Wheel speed feedback',
            source: 'Wheel Speed Sensor',
            destination: 'Brake Controller',
            responsibility: 'Monitor actuator state'
          }
        ]
      },
      summary: 'Adds two control actions and two feedback elements.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.isControllerApprovalModalOpen()).toBeTrue();
    expect(component.pendingControllerApprovalOptions().map((item) => item.name)).toEqual(['Human Operator']);

    component.applyPendingControllerSelection();
    fixture.detectChanges();

    expect(projectService.updateStepOneScope).toHaveBeenCalled();

    // Existing Step 3.1 entities are protected: Brake Actuator keeps only its original role.
    expect(component.entities()[1].name).toBe('Brake Actuator');
    expect(component.entities()[1].roles).toEqual(['Controlled Process']);

    // Supporting entities required by the new rows are added (and only those).
    expect(component.entities().map((item) => item.name)).toEqual([
      'Brake Controller',
      'Brake Actuator',
      'Human Operator',
      'Wheel Speed Sensor'
    ]);

    // Step 3.2 keeps the existing action and gains 2 new ones, including one whose responsibility
    // is not in the catalog (linked as free text rather than dropped).
    expect(component.controlActions().map((item) => item.action)).toEqual([
      'Hold brake pressure',
      'Release brake pressure',
      'Manual brake override'
    ]);
    expect(component.controlActions()[0].id).toBe('action-1');
    expect(component.controlActions()[2].responsibilityId).toBeUndefined();

    // Steps 3.3-3.8 gain 2 new optional elements.
    expect(component.optionalElements().map((item) => item.name)).toEqual([
      'Brake pressure feedback',
      'Wheel speed feedback'
    ]);
    expect(component.optionalElements().map((item) => item.type)).toEqual(['Feedback', 'Sensor']);
  });

  it('ignores rows that depend on rejected new controllers', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    component.availableEntityRoles.set(['Controller', 'Controlled Process']);
    component.optionalElementTypes.set(['Feedback']);
    component.entityCandidates.set([
      { id: 'entity-1', label: 'Brake Controller' } as never,
      { id: 'entity-2', label: 'Brake Actuator' } as never
    ]);
    component.availableResponsibilities.set([
      {
        id: 'resp-1',
        label: 'Maintain braking stability'
      } as never
    ]);
    component.entities.set([
      {
        id: 'entity-1',
        name: 'Brake Controller',
        roles: ['Controller']
      },
      {
        id: 'entity-2',
        name: 'Brake Actuator',
        roles: ['Controlled Process']
      }
    ]);
    component.currentProjectId.set(7);

    fixture.detectChanges();
    component.generateStepThreeWithAi();

    response$.next({
      payload: {
        entities: [
          { name: 'Brake Controller', roles: ['Controller'] },
          { name: 'Brake Actuator', roles: ['Controlled Process'] },
          { name: 'Human Driver', roles: ['Controller'] }
        ],
        controlActions: [
          {
            ref: 'CA-01',
            action: 'Apply emergency brake',
            sourceController: 'Brake Controller',
            targetProcess: 'Brake Actuator',
            responsibility: 'Maintain braking stability'
          },
          {
            ref: 'CA-02',
            action: 'Manual override',
            sourceController: 'Human Driver',
            targetProcess: 'Brake Actuator',
            responsibility: 'Manual intervention'
          }
        ],
        optionalElements: [
          {
            type: 'Feedback',
            name: 'Brake status feedback',
            source: 'Brake Actuator',
            destination: 'Brake Controller',
            responsibility: 'Maintain braking stability'
          },
          {
            type: 'Feedback',
            name: 'Manual override acknowledgement',
            source: 'Brake Actuator',
            destination: 'Human Driver',
            responsibility: 'Manual intervention'
          }
        ]
      },
      summary: 'Adds one existing-controller action and one new-controller action.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.isControllerApprovalModalOpen()).toBeTrue();
    component.togglePendingController('Human Driver', false);
    component.applyPendingControllerSelection();
    fixture.detectChanges();

    expect(projectService.updateStepOneScope).not.toHaveBeenCalled();
    expect(component.controlActions().map((item) => item.action)).toEqual(['Apply emergency brake']);
    expect(component.optionalElements().map((item) => item.name)).toEqual(['Brake status feedback']);
    expect(component.entities().map((item) => item.name)).toEqual(['Brake Controller', 'Brake Actuator']);
  });

  it('keeps rejected new controllers out of Step 1 and Step 3 when other new controllers are approved', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());
    projectService.updateStepOneScope.and.returnValue(of(void 0));

    component.availableEntityRoles.set(['Controller', 'Controlled Process']);
    component.optionalElementTypes.set(['Feedback']);
    component.entityCandidates.set([
      { id: 'entity-1', label: 'Brake Controller' } as never,
      { id: 'entity-2', label: 'Brake Actuator' } as never
    ]);
    component.availableResponsibilities.set([
      {
        id: 'resp-1',
        label: 'Maintain braking stability'
      } as never
    ]);
    component.entities.set([
      {
        id: 'entity-1',
        name: 'Brake Controller',
        roles: ['Controller']
      },
      {
        id: 'entity-2',
        name: 'Brake Actuator',
        roles: ['Controlled Process']
      }
    ]);
    component.currentProjectId.set(7);
    (component as never as { latestStepOneScope: Record<string, unknown> }).latestStepOneScope = {
      systemComponents: [
        {
          id: 1,
          name: 'Brake Controller',
          description: 'Existing controller'
        },
        {
          id: 2,
          name: 'Brake Actuator',
          description: 'Existing process'
        }
      ]
    };

    fixture.detectChanges();
    component.generateStepThreeWithAi();

    response$.next({
      payload: {
        entities: [
          { name: 'Brake Controller', roles: ['Controller'] },
          { name: 'Brake Actuator', roles: ['Controlled Process'] },
          { name: 'Human Operator', roles: ['Controller'] },
          { name: 'Safety Supervisor', roles: ['Controller', 'Controlled Process'] }
        ],
        controlActions: [
          {
            ref: 'CA-01',
            action: 'Apply emergency brake',
            sourceController: 'Brake Controller',
            targetProcess: 'Brake Actuator',
            responsibility: 'Maintain braking stability'
          },
          {
            ref: 'CA-02',
            action: 'Manual override',
            sourceController: 'Human Operator',
            targetProcess: 'Brake Actuator',
            responsibility: 'Manual intervention'
          },
          {
            ref: 'CA-03',
            action: 'Supervisor override',
            sourceController: 'Safety Supervisor',
            targetProcess: 'Brake Actuator',
            responsibility: 'Manual intervention'
          },
          {
            ref: 'CA-04',
            action: 'Escalate to supervisor',
            sourceController: 'Human Operator',
            targetProcess: 'Safety Supervisor',
            responsibility: 'Manual intervention'
          }
        ],
        optionalElements: [
          {
            type: 'Feedback',
            name: 'Brake status feedback',
            source: 'Brake Actuator',
            destination: 'Brake Controller',
            responsibility: 'Maintain braking stability'
          },
          {
            type: 'Feedback',
            name: 'Supervisor acknowledgement',
            source: 'Brake Actuator',
            destination: 'Safety Supervisor',
            responsibility: 'Manual intervention'
          }
        ]
      },
      summary: 'Adds two new controllers, but only one will be approved.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.isControllerApprovalModalOpen()).toBeTrue();
    expect(component.pendingControllerApprovalOptions().map((item) => item.name)).toEqual([
      'Human Operator',
      'Safety Supervisor'
    ]);

    component.togglePendingController('Safety Supervisor', false);
    component.applyPendingControllerSelection();
    fixture.detectChanges();

    expect(projectService.updateStepOneScope).toHaveBeenCalled();
    const stepOnePayload = projectService.updateStepOneScope.calls.mostRecent().args[0] as {
      systemComponents: Array<{ name: string }>;
    };
    expect(stepOnePayload.systemComponents.map((item) => item.name)).toEqual([
      'Brake Controller',
      'Brake Actuator',
      'Human Operator'
    ]);

    expect(component.entities().map((item) => item.name)).toEqual([
      'Brake Controller',
      'Brake Actuator',
      'Human Operator'
    ]);
    expect(component.controlActions().map((item) => item.action)).toEqual([
      'Apply emergency brake',
      'Manual override'
    ]);
    expect(component.controlActions().some((item) => item.sourceController === 'Safety Supervisor')).toBeFalse();
    expect(component.controlActions().some((item) => item.targetProcess === 'Safety Supervisor')).toBeFalse();
    expect(component.optionalElements().map((item) => item.name)).toEqual(['Brake status feedback']);
  });

  it('shows a success snackbar after Step 3 save and continue succeeds', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepThreeInformation.and.returnValue(of({} as unknown as StepThreeProjectInformation));
    spyOn<any>(component, 'hydrateFromStepThreeInformation');

    fixture.detectChanges();
    component.currentProjectId.set(3);
    component.saveStepThree(true);

    expect(projectService.updateStepThreeInformation).toHaveBeenCalled();
    expect(component.stepThreeSaveMessage()).toBe('Step 3 saved. Opening the next step.');
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 3 saved. Opening the next step.');
    expect(router.navigate).toHaveBeenCalledWith(['/ucas'], { queryParams: { projectId: 3 } });
  });

  it('renders a hierarchical STPA sketch with intermediate shared controller/process tiers', () => {
    const fixture = TestBed.createComponent(ControlStructurePageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    component.entities.set([
      {
        id: 'ent-1',
        name: 'Operations Controller',
        roles: ['Controller']
      },
      {
        id: 'ent-2',
        name: 'Brake System Control Unit',
        roles: ['Controller', 'Controlled Process']
      },
      {
        id: 'ent-3',
        name: 'Physical Wheel Brakes',
        roles: ['Controlled Process']
      }
    ]);

    component.controlActions.set([
      {
        id: 'ca-1',
        ref: 'CA-01',
        action: 'Arm and configure autobrake',
        sourceController: 'Operations Controller',
        targetProcess: 'Brake System Control Unit',
        responsibility: 'R-07'
      },
      {
        id: 'ca-2',
        ref: 'CA-02',
        action: 'Actuate brakes',
        sourceController: 'Brake System Control Unit',
        targetProcess: 'Physical Wheel Brakes',
        responsibility: 'R-02'
      }
    ]);

    component.optionalElements.set([
      {
        id: 'opt-1',
        type: 'Feedback',
        name: 'Wheel speed feedback',
        source: 'Physical Wheel Brakes',
        destination: 'Brake System Control Unit',
        responsibility: 'R-03'
      }
    ]);

    const nodes = component.sketchNodes();
    const bands = component.sketchTierBands();
    const operations = nodes.find((node) => node.label === 'Operations Controller');
    const bscu = nodes.find((node) => node.label === 'Brake System Control Unit');
    const brakes = nodes.find((node) => node.label === 'Physical Wheel Brakes');

    expect(operations?.kind).toBe('controller');
    expect(bscu?.kind).toBe('shared');
    expect(brakes?.kind).toBe('process');
    expect(operations?.y ?? 0).toBeLessThan(bscu?.y ?? 0);
    expect(bscu?.y ?? 0).toBeLessThan(brakes?.y ?? 0);
    expect(bands.length).toBe(3);
  });
});