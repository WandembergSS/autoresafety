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

  it('runs the Step 2 header AI button through the existing AI actions sequentially and keeps the title button pending', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const responses = [
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: []
            },
            {
              id: 'actor-002',
              text: 'Operations Center',
              type: 'istar.Role',
              x: 520,
              y: 140,
              customProperties: {},
              nodes: []
            },
            {
              id: 'actor-003',
              text: 'Roadside Sensor Network',
              type: 'istar.Agent',
              x: 880,
              y: 180,
              customProperties: {},
              nodes: []
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added the main system actor.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'goal-001',
                  text: 'Provide passenger transport',
                  type: 'istar.Goal',
                  x: 220,
                  y: 160,
                  customProperties: {}
                },
                {
                  id: 'goal-002',
                  text: 'Coordinate route execution',
                  type: 'istar.Goal',
                  x: 260,
                  y: 230,
                  customProperties: {}
                },
                {
                  id: 'goal-003',
                  text: 'Maintain timely service',
                  type: 'istar.Goal',
                  x: 300,
                  y: 300,
                  customProperties: {}
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a top-level operational goal.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'quality-001',
                  text: 'Fast service',
                  type: 'istar.Quality',
                  x: 250,
                  y: 210,
                  customProperties: {}
                },
                {
                  id: 'quality-002',
                  text: 'Reliable coordination',
                  type: 'istar.Quality',
                  x: 320,
                  y: 250,
                  customProperties: {}
                },
                {
                  id: 'quality-003',
                  text: 'Predictable availability',
                  type: 'istar.Quality',
                  x: 380,
                  y: 290,
                  customProperties: {}
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a softgoal.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'sg-001',
                  text: 'Prevent collisions',
                  type: 'istar.SafetyGoal',
                  x: 280,
                  y: 260,
                  customProperties: {
                    safetyType: 'SafetyGoal',
                    traceabilityId: 'SC-01',
                    accidentLevel: 'L2',
                    safetyGoalKind: 'Safety Constraint'
                  }
                },
                {
                  id: 'sg-002',
                  text: 'Maintain safe braking distance',
                  type: 'istar.SafetyGoal',
                  x: 340,
                  y: 330,
                  customProperties: {
                    safetyType: 'SafetyGoal',
                    traceabilityId: 'SC-02',
                    accidentLevel: 'L2',
                    safetyGoalKind: 'Safety Constraint'
                  }
                },
                {
                  id: 'sg-003',
                  text: 'Avoid loss of situational awareness',
                  type: 'istar.SafetyGoal',
                  x: 400,
                  y: 390,
                  customProperties: {
                    safetyType: 'SafetyGoal',
                    traceabilityId: 'SC-03',
                    accidentLevel: 'L3',
                    safetyGoalKind: 'Safety Constraint'
                  }
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a safety goal.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'haz-001',
                  text: 'Fails to detect obstacle',
                  type: 'istar.Hazard',
                  x: 340,
                  y: 320,
                  customProperties: {
                    safetyType: 'Hazard',
                    traceabilityId: 'H1',
                    obstructsSafetyGoalIds: ['sg-001']
                  }
                },
                {
                  id: 'haz-002',
                  text: 'Braking issued too late',
                  type: 'istar.Hazard',
                  x: 410,
                  y: 360,
                  customProperties: {
                    safetyType: 'Hazard',
                    traceabilityId: 'H2',
                    obstructsSafetyGoalIds: ['sg-002']
                  }
                },
                {
                  id: 'haz-003',
                  text: 'Telemetry blackout during maneuver',
                  type: 'istar.Hazard',
                  x: 470,
                  y: 420,
                  customProperties: {
                    safetyType: 'Hazard',
                    traceabilityId: 'H3',
                    obstructsSafetyGoalIds: ['sg-003']
                  }
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a hazard.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'st-001',
                  text: 'Trigger emergency braking',
                  type: 'istar.SafetyTask',
                  x: 390,
                  y: 370,
                  customProperties: {
                    safetyType: 'SafetyTask',
                    traceabilityId: 'R-01'
                  }
                },
                {
                  id: 'st-002',
                  text: 'Verify obstacle classification',
                  type: 'istar.SafetyTask',
                  x: 450,
                  y: 430,
                  customProperties: {
                    safetyType: 'SafetyTask',
                    traceabilityId: 'R-02'
                  }
                },
                {
                  id: 'st-003',
                  text: 'Switch to degraded safe mode',
                  type: 'istar.SafetyTask',
                  x: 520,
                  y: 490,
                  customProperties: {
                    safetyType: 'SafetyTask',
                    traceabilityId: 'R-03'
                  }
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a safety task.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'resource-001',
                  text: 'Obstacle map',
                  type: 'istar.Resource',
                  x: 430,
                  y: 220,
                  customProperties: {}
                },
                {
                  id: 'resource-002',
                  text: 'Route schedule',
                  type: 'istar.Resource',
                  x: 500,
                  y: 260,
                  customProperties: {}
                },
                {
                  id: 'resource-003',
                  text: 'Vehicle diagnostics stream',
                  type: 'istar.Resource',
                  x: 560,
                  y: 300,
                  customProperties: {}
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a standard resource.'
      },
      {
        payload: {
          actors: [
            {
              id: 'actor-001',
              text: 'Autonomous Shuttle',
              type: 'istar.Actor',
              x: 120,
              y: 120,
              customProperties: {},
              nodes: [
                {
                  id: 'sr-001',
                  text: 'Redundant proximity sensor data',
                  type: 'istar.SafetyResource',
                  x: 450,
                  y: 420,
                  customProperties: {
                    safetyType: 'SafetyResource',
                    traceabilityId: 'SC-02'
                  }
                },
                {
                  id: 'sr-002',
                  text: 'Certified braking status channel',
                  type: 'istar.SafetyResource',
                  x: 520,
                  y: 470,
                  customProperties: {
                    safetyType: 'SafetyResource',
                    traceabilityId: 'SC-04'
                  }
                },
                {
                  id: 'sr-003',
                  text: 'Fallback safety ruleset',
                  type: 'istar.SafetyResource',
                  x: 590,
                  y: 520,
                  customProperties: {
                    safetyType: 'SafetyResource',
                    traceabilityId: 'SC-05'
                  }
                }
              ]
            }
          ],
          links: [],
          display: {},
          diagram: { name: 'project' }
        },
        summary: 'Added a safety resource.'
      }
    ];

    aiAssistant.askWithSummary.and.returnValues(...responses.map((response) => of(response)));
    spyOn<any>(component, 'applyModelObjectToPistar');

    fixture.detectChanges();

    const headerButton = fixture.nativeElement.querySelector('.page__title-row .button--ai') as HTMLButtonElement;
    expect(headerButton.textContent).toContain('Generate with AI');

    component.generateStepTwoWithAi();
    fixture.detectChanges();

    expect(aiAssistant.askWithSummary).toHaveBeenCalledTimes(8);
    expect(component.isGeneratingStepTwoAi()).toBeFalse();
    expect(component.actors().length).toBe(3);
    expect(component.standardIntentionalElements().filter((element) => element.type === 'Goal').length).toBe(3);
    expect(component.standardIntentionalElements().filter((element) => element.type === 'Quality').length).toBe(3);
    expect(component.standardIntentionalElements().filter((element) => element.type === 'Resource').length).toBe(3);
    expect(component.safetyIntentionalElements().filter((element) => element.type === 'SafetyGoal').length).toBe(3);
    expect(component.safetyIntentionalElements().filter((element) => element.type === 'Hazard').length).toBe(3);
    expect(component.safetyIntentionalElements().filter((element) => element.type === 'SafetyTask').length).toBe(3);
    expect(component.safetyIntentionalElements().filter((element) => element.type === 'SafetyResource').length).toBe(3);
    expect(aiFeedback.showSummary).toHaveBeenCalledTimes(8);
    expect(aiFeedback.showSuccess).toHaveBeenCalledWith('Step 2 AI sequence completed successfully.', 7000);
  });

  it('accepts wrapped hazard AI patches and normalizes safety nodes to piStar safety types', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const applyModelSpy = spyOn<any>(component, 'applyModelObjectToPistar');

    aiAssistant.askWithSummary.and.returnValue(
      of({
        payload: {
          content: {
            actors: [
              {
                id: 'actor-1',
                nodes: [
                  {
                    id: 'haz-1',
                    text: 'Telemetry blackout during navigation',
                    type: 'istar.Quality',
                    x: 220,
                    y: 260,
                    customProperties: {
                      safetyType: 'Hazard',
                      accidentLevel: null,
                      traceabilityId: 'H1',
                      safetyGoalKind: null,
                      obstructsSafetyGoalIds: ['sg-1']
                    }
                  }
                ]
              }
            ],
            dependencies: [],
            links: [],
            display: {},
            diagram: {}
          }
        },
        summary: 'Adds one hazard that obstructs the current safety goal.'
      })
    );

    fixture.detectChanges();

    component.actors.set([
      {
        id: 'actor-1',
        name: 'Operator',
        type: 'Actor',
        associations: []
      }
    ]);
    component.safetyIntentionalElements.set([
      {
        id: 'sg-1',
        actorId: 'actor-1',
        name: 'Maintain situational awareness',
        traceabilityId: 'SC-01',
        type: 'SafetyGoal',
        source: 'safety',
        accidentLevel: 'L2',
        safetyGoalKind: 'Safety Constraint'
      }
    ]);

    component.submitAddHazardAiRequest();

    expect(component.addHazardAiError()).toBeNull();
    expect(component.stepTwoSaveMessage()).toBe('AI hazard proposal applied to the Step 2 model.');
    expect(component.safetyIntentionalElements().some((element) => element.id === 'haz-1' && element.type === 'Hazard')).toBeTrue();
    expect(aiFeedback.showError).not.toHaveBeenCalled();

    const appliedModel = applyModelSpy.calls.mostRecent().args[0] as {
      actors: Array<{ nodes?: Array<{ id: string; type: string }> }>;
    };
    const appliedHazard = appliedModel.actors.flatMap((actor) => actor.nodes ?? []).find((node) => node.id === 'haz-1');
    expect(appliedHazard?.type).toBe('istar.Hazard');
  });

  it('coerces wrapped safety resource AI patches and drops dangling links before applying them to piStar', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const applyModelSpy = spyOn<any>(component, 'applyModelObjectToPistar');

    aiAssistant.askWithSummary.and.returnValue(
      of({
        payload: {
          answer: JSON.stringify({
            actors: [
              {
                id: 'actor-1',
                nodes: [
                  {
                    id: 'sr-1',
                    text: 'Flight Plan',
                    type: 'istar.Resource',
                    x: 220,
                    y: 120,
                    customProperties: {}
                  }
                ]
              }
            ],
            dependencies: [],
            links: [
              {
                id: 'link-valid',
                type: 'istar.NeededByLink',
                source: 'sr-1',
                target: 'task-1'
              },
              {
                id: 'link-missing',
                type: 'istar.NeededByLink',
                source: 'sr-1',
                target: 'missing-task'
              }
            ],
            display: {},
            diagram: {}
          })
        },
        summary: 'Adds one safety resource.'
      })
    );

    fixture.detectChanges();

    component.actors.set([
      {
        id: 'actor-1',
        name: 'Operator',
        type: 'Actor',
        associations: []
      }
    ]);
    component.standardIntentionalElements.set([
      {
        id: 'task-1',
        actorId: 'actor-1',
        name: 'Review telemetry',
        type: 'Task',
        source: 'standard'
      }
    ]);

    component.submitAddSafetyResourceAiRequest();

    expect(component.addSafetyResourceAiError()).toBeNull();
    expect(component.stepTwoSaveMessage()).toBe('AI safety resource proposal applied to the Step 2 model.');
    expect(component.safetyIntentionalElements().some((element) => element.id === 'sr-1' && element.type === 'SafetyResource')).toBeTrue();
    expect(aiFeedback.showError).not.toHaveBeenCalled();

    const appliedModel = applyModelSpy.calls.mostRecent().args[0] as {
      actors: Array<{ nodes?: Array<{ id: string; type: string }> }>;
      links: Array<{ id: string }>;
    };
    const appliedSafetyResource = appliedModel.actors.flatMap((actor) => actor.nodes ?? []).find((node) => node.id === 'sr-1');
    expect(appliedSafetyResource?.type).toBe('istar.SafetyResource');
    expect(appliedModel.links.some((link) => link.id === 'link-valid')).toBeTrue();
    expect(appliedModel.links.some((link) => link.id === 'link-missing')).toBeFalse();
  });

  it('includes the full piStar and iStar4Safety rule set in all eight Step 2 AI prompts', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    const model = component['buildPistarModelFromForms']();
    const prompts = [
      component['buildAddActorsAiPrompt'](model, 1, 2, ''),
      component['buildAddGoalsAiPrompt'](model, 1, 2, ''),
      component['buildAddQualityAiPrompt'](model, 1, 2, ''),
      component['buildAddResourceAiPrompt'](model, 1, 2, ''),
      component['buildAddSafetyGoalAiPrompt'](model, 1, 2, ''),
      component['buildAddHazardAiPrompt'](model, 1, 2, ''),
      component['buildAddSafetyTaskAiPrompt'](model, 1, 2, ''),
      component['buildAddSafetyResourceAiPrompt'](model, 1, 2, '')
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('### Full rule set checked by piStar/iStar4Safety (MUST OBEY)');
      expect(prompt).toContain('QualificationLink: source must be a Quality; target must be Goal, Task, or Resource.');
      expect(prompt).toContain('A Hazard refinement can only use children that are all Hazards or all SafetyTasks/SafetyResources.');
      expect(prompt).toContain('A dependency dependum cannot be Hazard, SafetyGoal, SafetyTask, or SafetyResource.');
    }
  });

  it('combines Angular and embedded piStar validation errors in the Step 2 validation result', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const pistarValidateModelText = jasmine.createSpy('pistarValidateModelText').and.returnValue([
      'piStar says this link is invalid.'
    ]);

    spyOn<any>(component, 'validateModelDefinition').and.returnValue(['Angular says the actor graph is invalid.']);

    fixture.detectChanges();
    (component as unknown as { modellerFrame: unknown }).modellerFrame = {
      nativeElement: {
        contentWindow: {
          pistarValidateModelText
        }
      }
    };
    component.runValidationAndPreview();

    expect(pistarValidateModelText).toHaveBeenCalled();
    expect(component.validationErrors()).toEqual([
      'Angular says the actor graph is invalid.',
      'piStar says this link is invalid.'
    ]);
    expect(component.payloadPreview()).toBe('');
  });

  it('requests and applies a full AI-corrected model when Step 2 validation fails', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    const currentModel = {
      actors: [
        {
          id: 'actor-1',
          text: 'Operator',
          type: 'istar.Actor',
          x: 120,
          y: 120,
          customProperties: {},
          nodes: []
        }
      ],
      dependencies: [],
      links: [],
      display: {},
      tool: 'pistar.2.1.0',
      istar: '2.0',
      saveDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      diagram: {
        width: 1200,
        height: 800,
        name: 'project',
        customProperties: {}
      }
    };
    const correctedModel = {
      actors: [
        {
          id: 'actor-1',
          text: 'Operator',
          type: 'istar.Actor',
          x: 120,
          y: 120,
          customProperties: {},
          nodes: [
            {
              id: 'goal-1',
              text: 'Maintain safe operation',
              type: 'istar.Goal',
              x: 240,
              y: 180,
              customProperties: {}
            }
          ]
        }
      ],
      dependencies: [],
      links: [],
      display: {},
      tool: 'pistar.2.1.0',
      istar: '2.0',
      saveDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      diagram: {
        width: 1200,
        height: 800,
        name: 'project',
        customProperties: {}
      }
    };
    const applyModelSpy = spyOn<any>(component, 'applyModelObjectToPistar');

    aiAssistant.askWithSummary.and.returnValue(
      of({
        payload: { content: correctedModel },
        summary: 'Corrected the Step 2 model.'
      })
    );
    spyOn<any>(component, 'collectCurrentValidationState').and.returnValue({
      model: currentModel,
      errors: ['Every non-Responsibility SafetyGoal must be obstructed by at least one Hazard.']
    });
    spyOn<any>(component, 'sanitizePistarModelForImport').and.callFake((model: unknown) => model);
    spyOn<any>(component, 'validateCandidateModelAgainstAllRules').and.returnValue([]);

    fixture.detectChanges();
    component.runAiModelCorrection();

    expect(aiAssistant.askWithSummary).toHaveBeenCalled();
    expect(aiAssistant.askWithSummary.calls.mostRecent().args[0].context).toBe('Step 2 iStar4Safety model correction');
    expect(aiAssistant.askWithSummary.calls.mostRecent().args[0].question).toContain(
      '### Full rule set checked by piStar/iStar4Safety (MUST OBEY)'
    );
    expect(aiAssistant.askWithSummary.calls.mostRecent().args[0].question).toContain(JSON.stringify(currentModel, null, 2));
    expect(applyModelSpy).toHaveBeenCalledWith(correctedModel);
    expect(component.stepTwoSaveMessage()).toBe('AI corrected model applied to the Step 2 model.');
    expect(component.validationErrors()).toEqual([]);
    expect(component.correctModelAiError()).toBeNull();
    expect(component.isCorrectingModelWithAi()).toBeFalse();
    expect(aiFeedback.showSummary).toHaveBeenCalledWith('Corrected the Step 2 model.');
  });

  it('serializes safety elements using dedicated piStar safety node types', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    component.actors.set([
      {
        id: 'actor-1',
        name: 'Operator',
        type: 'Actor',
        associations: []
      }
    ]);
    component.safetyIntentionalElements.set([
      {
        id: 'sg-1',
        actorId: 'actor-1',
        name: 'Maintain situational awareness',
        traceabilityId: 'SC-01',
        type: 'SafetyGoal',
        source: 'safety',
        accidentLevel: 'L2',
        safetyGoalKind: 'Safety Constraint'
      },
      {
        id: 'haz-1',
        actorId: 'actor-1',
        name: 'Telemetry blackout during navigation',
        traceabilityId: 'H1',
        type: 'Hazard',
        source: 'safety',
        obstructsSafetyGoalIds: ['sg-1']
      },
      {
        id: 'st-1',
        actorId: 'actor-1',
        name: 'Fallback monitoring procedure',
        traceabilityId: 'R-01',
        type: 'SafetyTask',
        source: 'safety'
      },
      {
        id: 'sr-1',
        actorId: 'actor-1',
        name: 'Redundant telemetry channel',
        traceabilityId: 'SC-02',
        type: 'SafetyResource',
        source: 'safety'
      }
    ]);

    const model = component['buildPistarModelFromForms']() as {
      actors: Array<{ nodes?: Array<{ id: string; type: string }> }>;
    };
    const typeByNodeId = new Map((model.actors[0]?.nodes ?? []).map((node) => [node.id, node.type]));

    expect(typeByNodeId.get('sg-1')).toBe('istar.SafetyGoal');
    expect(typeByNodeId.get('haz-1')).toBe('istar.Hazard');
    expect(typeByNodeId.get('st-1')).toBe('istar.SafetyTask');
    expect(typeByNodeId.get('sr-1')).toBe('istar.SafetyResource');
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

  it('asks for confirmation before saving Step 2 when validation errors exist', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;

    spyOn<any>(component, 'pullModelFromPistar');
    spyOn<any>(component, 'validateModelDefinition').and.returnValue(['A safety goal is missing an obstructing hazard.']);

    fixture.detectChanges();
    component.currentProjectId.set(2);
    component.saveStepTwo(true);

    expect(projectService.updateStepTwoInformation).not.toHaveBeenCalled();
    expect(component.isStepTwoSaveConfirmationModalOpen()).toBeTrue();
    expect(component.stepTwoSaveConfirmationErrors()).toEqual(['A safety goal is missing an obstructing hazard.']);
    expect(component.stepTwoSaveContinueAfterConfirm()).toBeTrue();
  });

  it('saves Step 2 after the user confirms saving with validation errors', () => {
    const fixture = TestBed.createComponent(IstarModelsPageComponent);
    const component = fixture.componentInstance;
    projectService.updateStepTwoInformation.and.returnValue(of({} as Record<string, unknown>));

    spyOn<any>(component, 'pullModelFromPistar');
    spyOn<any>(component, 'validateModelDefinition').and.returnValue(['A safety goal is missing an obstructing hazard.']);
    spyOn<any>(component, 'buildStepTwoInformationPayload').and.returnValue({
      modelName: 'project',
      actors: [],
      dependencies: []
    });
    spyOn<any>(component, 'extractStepTwoInformationFromApiResponse').and.returnValue({} as Record<string, unknown>);
    spyOn<any>(component, 'hydrateFromStepTwoInformation');

    fixture.detectChanges();
    component.currentProjectId.set(2);
    component.saveStepTwo(true);
    component.confirmStepTwoSaveDespiteErrors();

    expect(projectService.updateStepTwoInformation).toHaveBeenCalled();
    expect(component.isStepTwoSaveConfirmationModalOpen()).toBeFalse();
    expect(component.stepTwoSaveMessage()).toBe('Step 2 saved. Opening the next step.');
    expect(router.navigate).toHaveBeenCalledWith(['/control-structure'], { queryParams: { projectId: 2 } });
  });
});