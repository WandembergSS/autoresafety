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
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', ['updateStepThreeInformation']);
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
});