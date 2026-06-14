import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ModelUpdatePageComponent } from './model-update-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService, StepSixProjectInformation } from '../../services/project.service';

describe('ModelUpdatePageComponent', () => {
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
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', ['updateStepSixInformation']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ModelUpdatePageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('keeps the Step 6 structured AI flow, verification, loading button, and summary snackbar working', () => {
    const fixture = TestBed.createComponent(ModelUpdatePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    const getAiButton = () => fixture.nativeElement.querySelector('.page-header .button--ai') as HTMLButtonElement | null;

    fixture.detectChanges();
    component.responsibilities.set([{ id: 'R-01', name: 'Maintain braking stability' } as never]);
    component.unsafeBehaviors.set([{ id: 'UCA-01', responsibilityId: 'R-01', title: 'Omitted braking command' } as never]);
    component.lossScenarios.set([{ id: 'LS-01', unsafeBehaviorIds: ['UCA-01'], title: 'Slip event remains unmanaged' } as never]);
    component.safetyRequirements.set([
      { id: 'SR-01', lossScenarioIds: ['LS-01'], title: 'Issue braking support within the slip window' } as never
    ]);
    fixture.detectChanges();

    component.generateStepSixWithAi();
    fixture.detectChanges();

    expect(component.isGeneratingStepSixAi()).toBeTrue();
    expect(getAiButton()?.textContent).toContain('Generating...');
    expect(getAiButton()?.querySelector('.button__spinner')).not.toBeNull();

    response$.next({
      payload: {
        injectedUnsafeBehaviors: [{ responsibilityId: 'R-01', unsafeBehaviorId: 'UCA-01' }],
        injectedLossScenarios: [{ targetUnsafeBehaviorId: 'UCA-01', lossScenarioId: 'LS-01' }],
        injectedSafetyRequirements: [
          {
            targetLossScenarioId: 'LS-01',
            safetyRequirementId: 'SR-01',
            relationshipType: 'AND'
          }
        ],
        currentView: 'SD'
      },
      summary: 'Injects the Step 6 traceability chain into the model update view.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.injectedUnsafeBehaviors().length).toBe(1);
    expect(component.injectedLossScenarios().length).toBe(1);
    expect(component.injectedSafetyRequirements().length).toBe(1);
    expect(component.currentView()).toBe('SD');
    expect(component.verificationResult()?.passed).toBeTrue();
    expect(component.stepSixSaveMessage()).toBe('AI proposal applied to Step 6. Review and save when ready.');
    expect(aiFeedback.showSummary).toHaveBeenCalledWith(
      'Injects the Step 6 traceability chain into the model update view.'
    );
    expect(aiFeedback.showError).not.toHaveBeenCalled();
    expect(component.isGeneratingStepSixAi()).toBeFalse();
    expect(getAiButton()?.textContent).toContain('Generate with AI');
    expect(getAiButton()?.querySelector('.button__spinner')).toBeNull();
  });

  it('shows a success snackbar after Step 6 save succeeds', () => {
    const fixture = TestBed.createComponent(ModelUpdatePageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepSixInformation.and.returnValue(of({} as unknown as StepSixProjectInformation));
    spyOn<any>(component, 'hydrateFromStepSixInformation');

    fixture.detectChanges();
    component.currentProjectId.set(6);
    component.saveStepSix();

    expect(projectService.updateStepSixInformation).toHaveBeenCalled();
    expect(component.stepSixSaveMessage()).toBe('Step 6 saved successfully.');
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 6 saved successfully.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});