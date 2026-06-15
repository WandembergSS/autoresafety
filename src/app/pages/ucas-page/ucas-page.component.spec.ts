import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { UcasPageComponent } from './ucas-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService, StepFourProjectInformation } from '../../services/project.service';

describe('UcasPageComponent', () => {
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
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', ['updateStepFourInformation']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [UcasPageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('keeps the Step 4 structured AI flow, loading button, and summary snackbar working', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    const getAiButton = () =>
      fixture.nativeElement.querySelector('.page__header .button--ai') as HTMLButtonElement | null;

    fixture.detectChanges();
    component.controlActionCatalog.set([
      {
        ref: 'CA-01',
        sourceActor: 'Brake Controller',
        targetActor: 'Brake Actuator',
        controller: 'Brake Controller',
        controlAction: 'Send braking command',
        controlledProcess: 'Brake Actuator'
      } as never
    ]);
    component.availableHazards.set([{ code: 'H-01', label: 'Loss of braking stability' } as never]);
    component.availableResponsibilities.set([
      {
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibilityLabel: 'Maintain braking stability',
        safetyConstraintLabel: 'Prevent unsafe braking commands'
      } as never
    ]);
    fixture.detectChanges();

    component.generateStepFourWithAi();
    fixture.detectChanges();

    expect(component.isGeneratingStepFourAi()).toBeTrue();
    expect(getAiButton()?.textContent).toContain('Generating...');
    expect(getAiButton()?.querySelector('.button__spinner')).not.toBeNull();

    response$.next({
      payload: {
        unsafeControlActions: [
          {
            controlActionRef: 'CA-01',
            hazards: ['Loss of braking stability'],
            responsibility: 'Maintain braking stability',
            category: 'Provided',
            context: 'The controller fails to send the braking command during wheel slip.',
            consequence: 'The vehicle remains unstable while braking support is withheld.',
            rationale: 'Delayed intervention allows the hazard to escalate.'
          }
        ],
        hazardousConditions: [
          {
            responsibility: 'Maintain braking stability',
            description: 'Braking stability remains unmanaged during severe slip conditions.',
            linkedHazards: ['Loss of braking stability'],
            coverageGap: 'The hazardous condition is not fully covered when the command is omitted.'
          }
        ]
      },
      summary: 'Adds one unsafe control action and one hazardous condition.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.ucas().length).toBe(1);
    expect(component.ucas()[0]?.ref).toBe('UCA-01');
    expect(component.hazardousConditions().length).toBe(1);
    expect(component.hazardousConditions()[0]?.ref).toBe('HC-01');
    expect(component.controllerConstraints().length).toBe(2);
    expect(component.stepFourSaveMessage()).toBe('AI proposal applied to Step 4. Review and save when ready.');
    expect(aiFeedback.showSummary).toHaveBeenCalledWith(
      'Adds one unsafe control action and one hazardous condition.'
    );
    expect(aiFeedback.showError).not.toHaveBeenCalled();
    expect(component.isGeneratingStepFourAi()).toBeFalse();
    expect(getAiButton()?.textContent).toContain('Generate with AI');
    expect(getAiButton()?.querySelector('.button__spinner')).toBeNull();
  });

  it('shows a success snackbar after Step 4 save succeeds', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepFourInformation.and.returnValue(of({} as unknown as StepFourProjectInformation));
    spyOn<any>(component, 'hydrateFromStepFourInformation');

    fixture.detectChanges();
    component.currentProjectId.set(4);
    component.saveStepFour();

    expect(projectService.updateStepFourInformation).toHaveBeenCalled();
    expect(component.stepFourSaveMessage()).toBe('Step 4 saved successfully.');
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 4 saved successfully.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens the Step 4 AI config modal and sends a prompt that reflects the configured ranges', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    component.controlActionCatalog.set([
      {
        ref: 'CA-01',
        sourceActor: 'Brake Controller',
        targetActor: 'Brake Actuator',
        controller: 'Brake Controller',
        controlAction: 'Send braking command',
        controlledProcess: 'Brake Actuator'
      } as never
    ]);
    component.availableHazards.set([{ code: 'H-01', label: 'Loss of braking stability' } as never]);
    component.availableResponsibilities.set([
      {
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibilityLabel: 'Maintain braking stability',
        safetyConstraintLabel: 'Prevent unsafe braking commands'
      } as never
    ]);
    fixture.detectChanges();

    component.openStepFourAiModal();
    fixture.detectChanges();

    expect(component.isStepFourAiModalOpen()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.modal--ai')).not.toBeNull();
    expect(aiAssistant.askWithSummary).not.toHaveBeenCalled();

    component.stepFourAiConfigForm.setValue({
      minUcas: 1,
      maxUcas: 2,
      minHazardousConditions: 0,
      maxHazardousConditions: 1,
      minControllerConstraints: 1,
      maxControllerConstraints: 1,
      promptInstructions: 'Focus on timing.'
    });
    component.submitStepFourAiRequest();
    fixture.detectChanges();

    expect(aiAssistant.askWithSummary).toHaveBeenCalledTimes(1);
    const question = aiAssistant.askWithSummary.calls.mostRecent().args[0].question as string;
    expect(question).toContain('between 1 and 2 NEW unsafe control actions');
    expect(question).toContain('between 0 and 1 NEW hazardous conditions');
    expect(question).toContain('between 1 and 1 NEW controller constraints');
    expect(question).toContain('Focus on timing.');

    response$.next({
      payload: {
        unsafeControlActions: [
          {
            controlActionRef: 'CA-01',
            hazards: ['Loss of braking stability'],
            responsibility: 'Maintain braking stability',
            category: 'Provided',
            context: 'The controller fails to send the braking command during wheel slip.',
            consequence: 'The vehicle remains unstable while braking support is withheld.',
            rationale: 'Delayed intervention allows the hazard to escalate.'
          }
        ]
      },
      summary: 'Adds one unsafe control action.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.isStepFourAiModalOpen()).toBeFalse();
    expect(component.ucas().length).toBe(1);
  });

  it('preserves existing Step 4 data when applying an AI proposal (additive merge)', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    component.controlActionCatalog.set([
      {
        ref: 'CA-01',
        sourceActor: 'Brake Controller',
        targetActor: 'Brake Actuator',
        controller: 'Brake Controller',
        controlAction: 'Send braking command',
        controlledProcess: 'Brake Actuator'
      } as never
    ]);
    component.availableHazards.set([{ code: 'H-01', label: 'Loss of braking stability' } as never]);
    component.availableResponsibilities.set([
      {
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibilityLabel: 'Maintain braking stability',
        safetyConstraintLabel: 'Prevent unsafe braking commands'
      } as never
    ]);

    component.ucas.set([
      {
        id: 1,
        ref: 'UCA-01',
        controlActionRef: 'CA-01',
        sourceActor: 'Brake Controller',
        targetActor: 'Brake Actuator',
        controller: 'Brake Controller',
        controlAction: 'Send braking command',
        controlledProcess: 'Brake Actuator',
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibility: 'Maintain braking stability',
        safetyConstraint: 'Prevent unsafe braking commands',
        hazard: ['Loss of braking stability'],
        category: 'Provided',
        context: 'Existing UCA context.',
        consequence: 'Existing consequence.',
        rationale: 'Existing rationale.'
      }
    ] as never);
    component.hazardousConditions.set([
      {
        id: 1,
        ref: 'HC-01',
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibility: 'Maintain braking stability',
        safetyConstraint: 'Prevent unsafe braking commands',
        description: 'Existing hazardous condition.',
        linkedHazards: ['Loss of braking stability'],
        coverageGap: 'Existing gap.'
      }
    ] as never);
    component.controllerConstraints.set([
      {
        id: 1,
        constraintId: 'CC-01',
        sourceRef: 'UCA-01',
        hazardLinkage: 'Loss of braking stability',
        responsibilityChain: 'Maintain braking stability',
        constraint: 'Existing controller constraint.',
        enforcementMechanism: 'Existing enforcement.',
        status: 'Draft'
      }
    ] as never);
    fixture.detectChanges();

    component.generateStepFourWithAi();
    response$.next({
      payload: {
        unsafeControlActions: [
          {
            controlActionRef: 'CA-01',
            hazards: ['Loss of braking stability'],
            responsibility: 'Maintain braking stability',
            category: 'Provided',
            context: 'Existing UCA context.',
            consequence: 'Duplicate consequence.',
            rationale: 'Duplicate rationale.'
          },
          {
            controlActionRef: 'CA-01',
            hazards: ['Loss of braking stability'],
            responsibility: 'Maintain braking stability',
            category: 'Incorrect timing',
            context: 'A brand new unsafe context.',
            consequence: 'New consequence.',
            rationale: 'New rationale.'
          }
        ],
        hazardousConditions: [
          {
            responsibility: 'Maintain braking stability',
            description: 'A brand new hazardous condition.',
            linkedHazards: ['Loss of braking stability'],
            coverageGap: 'New gap.'
          }
        ],
        controllerConstraints: [
          {
            sourceRef: 'UCA-02',
            constraint: 'A brand new controller constraint.',
            enforcementMechanism: 'New enforcement.',
            status: 'Draft'
          }
        ]
      },
      summary: 'Adds new UCA, hazardous condition, and constraint.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.ucas().length).toBe(2);
    expect(component.ucas()[0]?.ref).toBe('UCA-01');
    expect(component.ucas()[0]?.context).toBe('Existing UCA context.');
    expect(component.ucas()[1]?.ref).toBe('UCA-02');
    expect(component.ucas()[1]?.context).toBe('A brand new unsafe context.');

    expect(component.hazardousConditions().length).toBe(2);
    expect(component.hazardousConditions()[0]?.description).toBe('Existing hazardous condition.');
    expect(component.hazardousConditions()[1]?.description).toBe('A brand new hazardous condition.');

    expect(component.controllerConstraints().length).toBe(2);
    expect(component.controllerConstraints()[0]?.constraint).toBe('Existing controller constraint.');
    expect(component.controllerConstraints()[1]?.constraint).toBe('A brand new controller constraint.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();
  });

  it('applies UCAs when AI payload is wrapped in answer.content JSON string', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    component.controlActionCatalog.set([
      {
        ref: 'CA-01',
        sourceActor: 'Brake Controller',
        targetActor: 'Brake Actuator',
        controller: 'Brake Controller',
        controlAction: 'Send braking command',
        controlledProcess: 'Brake Actuator'
      } as never
    ]);
    component.availableHazards.set([{ code: 'H-01', label: 'Loss of braking stability' } as never]);
    component.availableResponsibilities.set([
      {
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibilityLabel: 'Maintain braking stability',
        safetyConstraintLabel: 'Prevent unsafe braking commands'
      } as never
    ]);

    component.generateStepFourWithAi();
    response$.next({
      payload: {
        answer: JSON.stringify({
          content: {
            unsafeControlActions: [
              {
                controlActionRef: 'CA-01',
                hazards: ['Loss of braking stability'],
                responsibility: 'Maintain braking stability',
                category: 'Incorrect timing',
                context: 'Wrapped payload context.',
                consequence: 'Wrapped payload consequence.',
                rationale: 'Wrapped payload rationale.'
              }
            ]
          },
          summary: 'Wrapped payload summary'
        })
      },
      summary: 'Outer summary from askWithSummary'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.ucas().length).toBe(1);
    expect(component.ucas()[0]?.category).toBe('Incorrect timing');
    expect(component.ucas()[0]?.context).toBe('Wrapped payload context.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();
  });

  it('adds new UCAs after clicking the Step 4 AI button and submitting the modal (live-style)', () => {
    const fixture = TestBed.createComponent(UcasPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    // Catalogs that match the AI payload references (CA-01/CA-02, H1/H2, R1/R2).
    component.controlActionCatalog.set([
      {
        ref: 'CA-01',
        sourceActor: 'Driver',
        targetActor: 'Brake Actuator',
        controller: 'Emergency Braking System',
        controlAction: 'Apply emergency braking',
        controlledProcess: 'Brake Actuator'
      } as never,
      {
        ref: 'CA-02',
        sourceActor: 'Motion Controller',
        targetActor: 'Powertrain',
        controller: 'Motion Controller',
        controlAction: 'Apply acceleration',
        controlledProcess: 'Powertrain'
      } as never
    ]);
    component.availableHazards.set([
      { code: 'H1', label: 'H1 - Collision with external objects' } as never,
      { code: 'H2', label: 'H2 - Vehicle instability' } as never
    ]);
    component.availableResponsibilities.set([
      {
        responsibilityId: 'R-01',
        safetyConstraintId: 'SC-01',
        responsibilityLabel: 'R1 - Emergency Braking System',
        safetyConstraintLabel: 'Prevent unsafe braking commands'
      } as never,
      {
        responsibilityId: 'R-02',
        safetyConstraintId: 'SC-02',
        responsibilityLabel: 'R2 - Motion Controller',
        safetyConstraintLabel: 'Prevent unsafe acceleration commands'
      } as never
    ]);
    fixture.detectChanges();

    expect(component.ucas().length).toBe(0);

    // 1) Click the header "Generate with AI" button to open the config modal.
    const headerAiButton = fixture.nativeElement.querySelector(
      '.page__header .button--ai'
    ) as HTMLButtonElement;
    headerAiButton.click();
    fixture.detectChanges();

    expect(component.isStepFourAiModalOpen()).toBeTrue();

    // 2) Submit the modal (the real "Generate" submit button) to trigger the AI request.
    const modalForm = fixture.nativeElement.querySelector(
      '.modal--ai form'
    ) as HTMLFormElement;
    modalForm.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(component.isGeneratingStepFourAi()).toBeTrue();
    expect(aiAssistant.askWithSummary).toHaveBeenCalledTimes(1);

    // 3) Return the exact wrapped payload shape from the AI backend (answer => JSON => content).
    response$.next({
      payload: {
        answer: JSON.stringify({
          content: {
            unsafeControlActions: [
              {
                controlActionRef: 'CA-01',
                category: 'Not provided',
                context: 'Obstacle detected in path',
                consequence: 'Collision with obstacle',
                rationale: 'System failed to trigger emergency braking despite sensor input.',
                hazards: ['H1 - Collision with external objects'],
                responsibility: 'R1 - Emergency Braking System'
              },
              {
                controlActionRef: 'CA-01',
                category: 'Incorrect timing',
                context: 'Vehicle approaching stop line at high speed',
                consequence: 'Vehicle overshoots safe stopping distance',
                rationale: 'Braking initiated too late to satisfy the required deceleration curve.',
                hazards: ['H1 - Collision with external objects'],
                responsibility: 'R1 - Emergency Braking System'
              },
              {
                controlActionRef: 'CA-02',
                category: 'Provided',
                context: 'Emergency brake (CA-01) is currently active',
                consequence: 'Increased stopping distance and mechanical strain',
                rationale: 'Applying acceleration while braking is engaged leads to system instability.',
                hazards: ['H2 - Vehicle instability'],
                responsibility: 'R2 - Motion Controller'
              },
              {
                controlActionRef: 'CA-02',
                category: 'Incorrect duration',
                context: 'Lane change maneuver in progress',
                consequence: 'Vehicle leaves intended lane bounds',
                rationale: 'Acceleration held for too long causes the vehicle to exceed lateral safety limits.',
                hazards: ['H2 - Vehicle instability'],
                responsibility: 'R2 - Motion Controller'
              }
            ],
            hazardousConditions: [],
            controllerConstraints: []
          },
          summary: 'Adds four new unsafe control actions.'
        })
      },
      summary: 'Adds four new unsafe control actions.'
    });
    response$.complete();
    fixture.detectChanges();

    // 4) Verify the new UCAs were added to the register.
    expect(component.ucas().length).toBe(4);
    expect(component.ucas().map((item) => item.ref)).toEqual(['UCA-01', 'UCA-02', 'UCA-03', 'UCA-04']);
    expect(component.ucas().map((item) => item.category)).toEqual([
      'Not provided',
      'Incorrect timing',
      'Provided',
      'Incorrect duration'
    ]);
    expect(component.isStepFourAiModalOpen()).toBeFalse();
    expect(component.isGeneratingStepFourAi()).toBeFalse();
    expect(component.stepFourSaveMessage()).toBe('AI proposal applied to Step 4. Review and save when ready.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();

    // The newly added UCAs are rendered in the register table.
    const renderedRefs = Array.from(
      fixture.nativeElement.querySelectorAll('.page')
    ).length;
    expect(renderedRefs).toBeGreaterThan(0);
  });
});