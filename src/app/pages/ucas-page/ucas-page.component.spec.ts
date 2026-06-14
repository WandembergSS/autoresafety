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
});