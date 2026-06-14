import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { IstarModelsPageComponent } from './istar-models-page.component';
import { AiAssistantService } from '../../services/ai-assistant.service';
import { AiFeedbackService } from '../../services/ai-feedback.service';
import { ProjectService } from '../../services/project.service';

describe('IstarModelsPageComponent', () => {
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
    projectService = jasmine.createSpyObj<ProjectService>('ProjectService', ['updateStepTwoInformation']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [IstarModelsPageComponent],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistant },
        { provide: AiFeedbackService, useValue: aiFeedback },
        { provide: ProjectService, useValue: projectService },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  it('keeps the Step 2 add actors AI submit flow, loading states, and summary snackbar working', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const response$ = new Subject<{ payload: unknown; summary: string }>();
    aiAssistant.askWithSummary.and.returnValue(response$.asObservable());
    spyOn<any>(component, 'applyModelObjectToPistar');

    const getToolbarButton = () =>
      fixture.nativeElement.querySelector('.modeller__ai-action') as HTMLButtonElement | null;
    const getSubmitButton = () =>
      fixture.nativeElement.querySelector('.ai-modal__actions .button--ai') as HTMLButtonElement | null;

    fixture.detectChanges();
    component.openAddActorsAiModal();
    fixture.detectChanges();

    expect(getToolbarButton()?.textContent).toContain('Add Actors');
    expect(getSubmitButton()?.textContent).toContain('Continue');

    component.submitAddActorsAiRequest();
    fixture.detectChanges();

    expect(component.isAddActorsAiRunning()).toBeTrue();
    expect(getToolbarButton()?.textContent).toContain('Adding Actors...');
    expect(getSubmitButton()?.textContent).toContain('Running...');
    expect(getSubmitButton()?.querySelector('.button__spinner')).not.toBeNull();

    response$.next({
      payload: {
        actors: [
          {
            id: 'actor_001',
            text: 'Brake Controller',
            type: 'istar.Actor',
            x: 160,
            y: 120,
            customProperties: {},
            nodes: []
          }
        ],
        links: [],
        display: {},
        diagram: { name: 'project' }
      },
      summary: 'Adds one controller actor to the Step 2 model.'
    });
    response$.complete();
    fixture.detectChanges();

    expect(component.actors().length).toBe(1);
    expect(component.actors()[0]?.name).toBe('Brake Controller');
    expect(component.stepTwoSaveMessage()).toBe('AI actor proposal applied to the Step 2 model.');
    expect(component.isAddActorsAiModalOpen()).toBeFalse();
    expect(aiFeedback.showSummary).toHaveBeenCalledWith('Adds one controller actor to the Step 2 model.');
    expect(aiFeedback.showError).not.toHaveBeenCalled();
    expect(component.isAddActorsAiRunning()).toBeFalse();
    expect(getToolbarButton()?.textContent).toContain('Add Actors');
    expect(getSubmitButton()).toBeNull();
  });

  it('shows a success snackbar after Step 2 save succeeds', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepTwoInformation.and.returnValue(of({} as Record<string, unknown>));
    spyOn<any>(component, 'pullModelFromPistar');
    spyOn<any>(component, 'validateModelDefinition').and.returnValue([]);
    spyOn<any>(component, 'buildStepTwoInformationPayload').and.returnValue({
      modelName: 'project',
      actors: [],
      dependencies: []
    });
    spyOn<any>(component, 'extractStepTwoInformationFromApiResponse').and.returnValue({} as Record<string, unknown>);
    spyOn<any>(component, 'hydrateFromStepTwoInformation');

    fixture.detectChanges();
    component.currentProjectId.set(2);
    component.saveStepTwo();

    expect(projectService.updateStepTwoInformation).toHaveBeenCalled();
    expect(component.stepTwoSaveMessage()).toBe('Step 2 saved successfully.');
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 2 saved successfully.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});