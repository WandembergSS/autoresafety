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
});