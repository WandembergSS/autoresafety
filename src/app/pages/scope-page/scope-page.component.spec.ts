import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ScopePageComponent } from './scope-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService } from '../../services/project.service';

describe('ScopePageComponent', () => {
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
      'listOpenResumes',
      'list',
      'getStepOneScope',
      'getStepTwoInformation',
      'updateStepOneScope'
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    projectService.listOpenResumes.and.returnValue(of([]));
    projectService.list.and.returnValue(of([]));
    projectService.getStepOneScope.and.returnValue(of({} as Record<string, unknown>));
    projectService.getStepTwoInformation.and.returnValue(of({} as Record<string, unknown>));
    projectService.updateStepOneScope.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [ScopePageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('fills the system definition AI form and keeps the summary only in the snackbar flow', () => {
    const fixture = TestBed.createComponent(ScopePageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());

    component.analysisObjectiveForm.patchValue({ objectivesText: 'Clarify the braking supervision scope.' });
    fixture.detectChanges();

    component.generateSystemDefinitionWithAi();

    expect(component.isScopeAiActionRunning('systemDefinition')).toBeTrue();

    response$.next({
      payload: { content: 'The system supervises braking commands and actuator feedback during vehicle operation.' },
      summary: 'Defines the supervised braking system scope.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.systemDefinitionAiForm.controls.systemDefinitionText.value).toBe(
      'The system supervises braking commands and actuator feedback during vehicle operation.'
    );
    expect(component.systemDefinitionAiModalForm.controls.systemDefinitionText.value).toBe(
      'The system supervises braking commands and actuator feedback during vehicle operation.'
    );
    expect(component.selectedSystemDefinitionSource()).toBe('ai');
    expect(aiFeedback.showSummary).toHaveBeenCalledWith('Defines the supervised braking system scope.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();
    expect(component.isScopeAiActionRunning('systemDefinition')).toBeFalse();
  });

  it('shows a success snackbar after Step 1 save and continue succeeds', () => {
    const fixture = TestBed.createComponent(ScopePageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    component.currentProjectId.set(1);
    component.saveStepOne(true);

    expect(projectService.updateStepOneScope).toHaveBeenCalled();
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 1 saved. Opening the next step.');
    expect(router.navigate).toHaveBeenCalledWith(['/istar-models'], { queryParams: { projectId: 1 } });
  });
});