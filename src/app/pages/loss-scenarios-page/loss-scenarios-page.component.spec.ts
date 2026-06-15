import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { LossScenariosPageComponent } from './loss-scenarios-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService, StepFiveProjectInformation } from '../../services/project.service';

describe('LossScenariosPageComponent', () => {
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
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', ['updateStepFiveInformation']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LossScenariosPageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('keeps the Step 5 structured AI flow, loading button, and summary snackbar working', () => {
    const fixture = TestBed.createComponent(LossScenariosPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    const getAiButton = () => fixture.nativeElement.querySelector('.page-header .button--ai') as HTMLButtonElement | null;

    fixture.detectChanges();
    component.unsafeBehaviorCatalog.set([
      {
        id: 'UCA-01',
        type: 'UCA',
        title: 'Brake command omitted',
        description: 'The braking command is omitted during wheel slip.',
        hazards: ['Loss of braking stability']
      } as never
    ]);
    fixture.detectChanges();

    component.generateStepFiveWithAi();
    fixture.detectChanges();

    expect(component.isGeneratingStepFiveAi()).toBeTrue();
    expect(getAiButton()?.textContent).toContain('Generating...');
    expect(getAiButton()?.querySelector('.button__spinner')).not.toBeNull();

    response$.next({
      payload: {
        lossScenarios: [
          {
            description: 'Brake support is not issued during a slip event, allowing instability to grow unchecked.',
            associatedUnsafeBehaviorIds: ['UCA-01'],
            sourceRationale: 'Sensor latency and controller overload delay the braking response.'
          }
        ],
        safetyRequirements: [
          {
            description: 'The controller shall issue braking support within the safe slip window.',
            addressedLossScenarioIds: ['LS-01']
          }
        ]
      },
      summary: 'Adds one loss scenario and one safety requirement.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.lossScenarios().length).toBe(1);
    expect(component.lossScenarios()[0]?.id).toBe('LS-01');
    expect(component.safetyRequirements().length).toBe(1);
    expect(component.safetyRequirements()[0]?.addressedLossScenarioIds).toEqual(['LS-01']);
    expect(component.stepFiveSaveMessage()).toBe('AI proposal applied to Step 5. Review and save when ready.');
    expect(aiFeedback.showSummary).toHaveBeenCalledWith('Adds one loss scenario and one safety requirement.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();
    expect(component.isGeneratingStepFiveAi()).toBeFalse();
    expect(getAiButton()?.textContent).toContain('Generate with AI');
    expect(getAiButton()?.querySelector('.button__spinner')).toBeNull();
  });

  it('shows a success snackbar after Step 5 save and continue succeeds', () => {
    const fixture = TestBed.createComponent(LossScenariosPageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepFiveInformation.and.returnValue(of({} as unknown as StepFiveProjectInformation));
    spyOn<any>(component, 'hydrateFromStepFiveInformation');

    fixture.detectChanges();
    component.currentProjectId.set(5);
    component.saveStepFive(true);

    expect(projectService.updateStepFiveInformation).toHaveBeenCalled();
    expect(component.stepFiveSaveMessage()).toBe('Step 5 saved. Opening the next step.');
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 5 saved. Opening the next step.');
    expect(router.navigate).toHaveBeenCalledWith(['/model-update'], { queryParams: { projectId: 5 } });
  });

  it('opens the Step 5 AI config modal and sends a prompt that reflects the configured ranges', () => {
    const fixture = TestBed.createComponent(LossScenariosPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    component.unsafeBehaviorCatalog.set([
      {
        id: 'UCA-01',
        type: 'UCA',
        title: 'Brake command omitted',
        description: 'The braking command is omitted during wheel slip.',
        hazards: ['Loss of braking stability']
      } as never
    ]);
    fixture.detectChanges();

    component.openStepFiveAiModal();
    fixture.detectChanges();

    expect(component.isStepFiveAiModalOpen()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.modal--ai')).not.toBeNull();
    expect(aiAssistant.askWithSummary).not.toHaveBeenCalled();

    component.stepFiveAiConfigForm.setValue({
      minLossScenarios: 1,
      maxLossScenarios: 2,
      minSafetyRequirements: 0,
      maxSafetyRequirements: 1,
      promptInstructions: 'Highlight latency.'
    });
    component.submitStepFiveAiRequest();
    fixture.detectChanges();

    expect(aiAssistant.askWithSummary).toHaveBeenCalledTimes(1);
    const question = aiAssistant.askWithSummary.calls.mostRecent().args[0].question as string;
    expect(question).toContain('between 1 and 2 NEW loss scenarios');
    expect(question).toContain('between 0 and 1 NEW safety requirements');
    expect(question).toContain('Highlight latency.');

    response$.next({
      payload: {
        lossScenarios: [
          {
            description: 'Brake support is not issued during a slip event, allowing instability to grow unchecked.',
            associatedUnsafeBehaviorIds: ['UCA-01'],
            sourceRationale: 'Sensor latency delays the braking response.'
          }
        ]
      },
      summary: 'Adds one loss scenario.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.isStepFiveAiModalOpen()).toBeFalse();
    expect(component.lossScenarios().length).toBe(1);
  });

  it('preserves existing Step 5 data and remaps AI ids when applying a proposal (additive merge)', () => {
    const fixture = TestBed.createComponent(LossScenariosPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    fixture.detectChanges();
    component.unsafeBehaviorCatalog.set([
      {
        id: 'UCA-01',
        type: 'UCA',
        title: 'Brake command omitted',
        description: 'The braking command is omitted during wheel slip.',
        hazards: ['Loss of braking stability']
      } as never
    ]);
    component.lossScenarios.set([
      {
        id: 'LS-01',
        description: 'Existing loss scenario describing an unmitigated slip event.',
        associatedUnsafeBehaviorIds: ['UCA-01'],
        sourceRationale: 'Existing rationale.'
      }
    ] as never);
    component.safetyRequirements.set([
      {
        id: 'SR-01',
        description: 'Existing safety requirement covering the slip event.',
        addressedLossScenarioIds: ['LS-01']
      }
    ] as never);
    fixture.detectChanges();

    component.generateStepFiveWithAi();
    response$.next({
      payload: {
        lossScenarios: [
          {
            id: 'LS-01',
            description: 'Existing loss scenario describing an unmitigated slip event.',
            associatedUnsafeBehaviorIds: ['UCA-01'],
            sourceRationale: 'Duplicate rationale.'
          },
          {
            id: 'LS-99',
            description: 'A brand new loss scenario describing a delayed actuator response.',
            associatedUnsafeBehaviorIds: ['UCA-01'],
            sourceRationale: 'New rationale.'
          }
        ],
        safetyRequirements: [
          {
            id: 'SR-99',
            description: 'A brand new safety requirement addressing the delayed actuator response.',
            addressedLossScenarioIds: ['LS-99', 'LS-01']
          }
        ]
      },
      summary: 'Adds one loss scenario and one safety requirement.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.lossScenarios().length).toBe(2);
    expect(component.lossScenarios()[0]?.id).toBe('LS-01');
    expect(component.lossScenarios()[0]?.description).toBe('Existing loss scenario describing an unmitigated slip event.');
    expect(component.lossScenarios()[1]?.id).toBe('LS-02');
    expect(component.lossScenarios()[1]?.description).toBe(
      'A brand new loss scenario describing a delayed actuator response.'
    );

    expect(component.safetyRequirements().length).toBe(2);
    expect(component.safetyRequirements()[0]?.id).toBe('SR-01');
    expect(component.safetyRequirements()[1]?.id).toBe('SR-02');
    expect(component.safetyRequirements()[1]?.addressedLossScenarioIds).toEqual(['LS-02', 'LS-01']);
    expect(aiFeedback.showError).not.toHaveBeenCalled();
  });
});