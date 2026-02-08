import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Project } from '../../models/project.model';
import { ProjectService } from '../../services/project.service';

interface HomeProject extends Project {
  domain?: string;
  owner?: string;
  nextStep?: string;
  currentStep?: number;
}

interface TimelineStep {
  id: number;
  title: string;
  description: string;
  substeps: string[];
}

interface TimelineInfo {
  id?: number;
  title: string;
  description: string;
  substeps?: string[];
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(120)]],
    domain: ['', [Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(500)],
    owner: ['', Validators.maxLength(120)]
  });

  readonly projects = signal<HomeProject[]>([]);
  readonly selectedTimelineStep = signal<TimelineInfo | null>(null);
  readonly modalStack = signal<TimelineInfo[]>([]);

  readonly timelineSteps: TimelineStep[] = [
    {
      id: 1,
      title: 'Define the Scope of the Safety Critical System (SCS)',
      description:
        'Define or refine system boundaries and identify safety-relevant parts through General Concerns and Safety Concerns.',
      substeps: ['1.1 - Define General Concerns', '1.2 - Define Safety Concerns']
    },
    {
      id: 2,
      title: 'Define the iStar4Safety Models',
      description:
        'Use GORE to illustrate early requirements through social relationships and internal rationale.',
      substeps: [
        '2.1 - Develop Strategic Dependency (SD) Model: Identify strategic dependencies between actors.',
        '2.2 - Develop Strategic Rationale (SR) Model: Detail internal logic linking responsibilities and safety constraints to goals.'
      ]
    },
    {
      id: 3,
      title: 'Define the Control Structure',
      description:
        'Build a functional model to support hazard identification, distinguishing mandatory and optional elements.',
      substeps: [
        '3.1 - Define Controllers and Controlled Processes',
        '3.2 - Define Control Actions',
        '3.3 - Define Feedbacks (Optional)',
        '3.4 - Define Process Models (Optional)',
        '3.5 - Define Control Algorithms (Optional)',
        '3.6 - Define Actuators (Optional)',
        '3.7 - Define Sensors (Optional)',
        '3.8 - Define External Inputs (Optional)'
      ]
    },
    {
      id: 4,
      title: 'Identify Unsafe Control Actions and Hazardous Conditions',
      description:
        'Identify unsafe control actions, map them to hazards and responsibilities, and model hazardous conditions.',
      substeps: [
        '4.1 - Select Control Action',
        '4.2 - Not Providing',
        '4.3 - Providing Incorrectly',
        '4.4 - Timing and Order',
        '4.5 - Duration',
        '4.6 - Associate UCAs with Hazards',
        '4.7 - Associate UCAs with Responsibilities',
        '4.8 - Model Hazardous Conditions (HC)'
      ]
    },
    {
      id: 5,
      title: 'Derive Safety Constraints',
      description:
        'Analyze UCAs and hazardous conditions to derive safety constraints that prevent accidents.',
      substeps: ['5.1 - Analyze Identified UCAs and HCs', '5.2 - Formulate Constraints']
    },
    {
      id: 6,
      title: 'Identify Loss Scenarios and Safety Requirements',
      description:
        'Develop loss scenarios from UCAs/HCs and derive safety requirements to mitigate them.',
      substeps: [
        '6.1 - Select UCA/HC',
        '6.2 - Identify Potential Loss Scenarios',
        '6.3 - Derive Safety Requirements for Loss Scenarios'
      ]
    },
    {
      id: 7,
      title: 'Update the iStar4Safety Models',
      description:
        'Incorporate findings back into the models to ensure full traceability and safety logic operationalization.',
      substeps: [
        '7.1 - Model UCA or Hazardous Conditions',
        '7.2 - Model Loss Scenarios as Hazard Elements',
        '7.3 - Link UCAs/HCs to Responsibility',
        '7.4 - Model Safety Requirements as Safety Tasks',
        '7.5 - Collapse Actor Boundaries for SD Model',
        '7.6 - Expand Actor Boundaries for SR Model',
        '7.7 - Verify All Models'
      ]
    }
  ];

  readonly timelineExtras: TimelineInfo[] = [
    {
      title: 'System-Theoretic Process Analysis (STPA)',
      description:
        'STPA is a systems-theoretic hazard analysis method that identifies unsafe control actions, causal scenarios, and safety constraints across the full control structure of a socio-technical system.'
    },
    {
      title: 'iStar4Safety',
      description:
        'iStar4Safety models organizational actors, goals, dependencies, and safety responsibilities to trace how safety objectives are delegated and satisfied across the system.'
    }
  ];

  readonly substepDetails: Record<string, TimelineInfo> = {
    'iStar4Safety': {
      title: 'iStar4Safety Modeling Guide',
      description:
        'A structured guide for modeling safety concepts using the iStar4Safety language and validation rules.',
      substeps: [
        '1. Necessity Analysis and Conceptualization',
        '2. Construction of the Strategic Reasoning (SR) Model',
        '3. Application of Validation Rules',
        '4. Tool Support'
      ]
    },
    '1. Necessity Analysis and Conceptualization': {
      title: '1. Necessity Analysis and Conceptualization',
      description:
        'Before drawing, identify which safety domain concepts will be mapped based on the Preliminary Safety Analysis.',
      substeps: ['Identify Key Concepts', 'Define Impact Levels']
    },
    'Identify Key Concepts': {
      title: 'Identify Key Concepts',
      description: 'Determine which of the key safety concepts apply to your system.',
      substeps: ['Accidents and Hazards', 'Causes and Environmental Conditions', 'Safety Strategies']
    },
    'Accidents and Hazards': {
      title: 'Accidents and Hazards',
      description: 'Unplanned events and system states that lead to losses.',
      substeps: []
    },
    'Causes and Environmental Conditions': {
      title: 'Causes and Environmental Conditions',
      description: 'Internal or environmental factors that trigger hazards.',
      substeps: []
    },
    'Safety Strategies': {
      title: 'Safety Strategies',
      description: 'Safety tasks and resources required to mitigate or prevent accidents.',
      substeps: []
    },
    'Define Impact Levels': {
      title: 'Define Impact Levels',
      description: 'Classify the criticality of each Safety Goal on a five-value scale.',
      substeps: [
        '(1) Catastrophic',
        '(2) Very Severe',
        '(3) Considerable',
        '(4) Small',
        '(5) No Effect'
      ]
    },
    '2. Construction of the Strategic Reasoning (SR) Model': {
      title: '2. Construction of the Strategic Reasoning (SR) Model',
      description:
        'Use iStar4Safety stereotypes and colors to represent requirements and hazards in the SR model.',
      substeps: ['2.1 Modeling Goals and Hazards', '2.2 Modeling Safety Strategies']
    },
    '2.1 Modeling Goals and Hazards': {
      title: '2.1 Modeling Goals and Hazards',
      description: 'Define safety goals, hazards, and causal refinements.',
      substeps: [
        'Step A: Define Safety Goals (<<SafetyGoal>>)',
        'Step B: Identify Hazards (<<Hazard>>)',
        'Step C: Refine Hazard Causes'
      ]
    },
    'Step A: Define Safety Goals (<<SafetyGoal>>)': {
      title: 'Step A: Define Safety Goals (<<SafetyGoal>>)',
      description: 'Represent goals as pink rounded rectangles and assign impact levels.',
      substeps: [
        'Represent as pink rounded rectangular nodes.',
        'Assign the accidentImpactLevel property to the goal.'
      ]
    },
    'Step B: Identify Hazards (<<Hazard>>)': {
      title: 'Step B: Identify Hazards (<<Hazard>>)',
      description: 'Represent hazardous states as red nodes and connect them to goals.',
      substeps: [
        'Represent hazardous states as red nodes.',
        'Connect the Hazard to the Safety Goal using the Obstructs link.'
      ]
    },
    'Step C: Refine Hazard Causes': {
      title: 'Step C: Refine Hazard Causes',
      description: 'Use AND/OR refinement links to show how hazards are caused.',
      substeps: ['Refine parent hazards into child hazards using AND/OR links.']
    },
    '2.2 Modeling Safety Strategies': {
      title: '2.2 Modeling Safety Strategies',
      description: 'Define safety tasks and resources that mitigate hazards.',
      substeps: ['Step A: Define Safety Tasks (<<SafetyTask>>)', 'Step B: Identify Safety Resources (<<SafetyResource>>)']
    },
    'Step A: Define Safety Tasks (<<SafetyTask>>)': {
      title: 'Step A: Define Safety Tasks (<<SafetyTask>>)',
      description: 'Create pink hexagonal tasks intended to mitigate hazards.',
      substeps: ['Create tasks intended to mitigate hazards.']
    },
    'Step B: Identify Safety Resources (<<SafetyResource>>)': {
      title: 'Step B: Identify Safety Resources (<<SafetyResource>>)',
      description: 'Represent critical assets as pink rectangles and connect them with neededBy links.',
      substeps: [
        'Represent critical assets as pink rectangles.',
        'Connect the resource to the element that requires it using the neededBy link.'
      ]
    },
    '3. Application of Validation Rules': {
      title: '3. Application of Validation Rules',
      description: 'Verify that the model respects iStar4Safety integrity constraints.',
      substeps: [
        'Connection Constraints',
        'Hierarchy Constraints',
        'Mitigation Requirement',
        'Responsibility Assignment'
      ]
    },
    'Connection Constraints': {
      title: 'Connection Constraints',
      description: 'Check dependency and refinement restrictions.',
      substeps: [
        'Dependum: Extension constructs cannot be used as dependum elements in dependency links between actors.',
        'Goal Refinement: A safety goal can be refined by either safety goals or hazards, but not both simultaneously.'
      ]
    },
    'Hierarchy Constraints': {
      title: 'Hierarchy Constraints',
      description: 'Ensure only correct hazard levels connect to goals and strategies.',
      substeps: [
        'Only root-hazards can be related to safety goals.',
        'Only leaf-hazards can be associated with safety strategies (safety resources and safety tasks).'
      ]
    },
    'Mitigation Requirement': {
      title: 'Mitigation Requirement',
      description: 'Every leaf-hazard must have at least one associated safety strategy.',
      substeps: []
    },
    'Responsibility Assignment': {
      title: 'Responsibility Assignment',
      description: 'Each safety strategy must be tied to the actor that performs it, unless internal.',
      substeps: []
    },
    '4. Tool Support': {
      title: '4. Tool Support',
      description: 'Use tooling to simplify modeling with predefined stereotypes and colors.',
      substeps: ['Use the piStar-4Safety tool for semi-automated support.']
    },
    'System-Theoretic Process Analysis (STPA)': {
      title: 'System-Theoretic Process Analysis (STPA)',
      description:
        'STPA structures hazard analysis by defining losses, modeling control structure, identifying UCAs, and explaining causal scenarios.',
      substeps: [
        'Step 1: Define the Purpose of the Analysis',
        'Step 2: Model the Control Structure',
        'Step 3: Identify Unsafe Control Actions (UCAs)',
        'Step 4: Identify Loss Scenarios'
      ]
    },
    'Step 1: Define the Purpose of the Analysis': {
      title: 'Step 1: Define the Purpose of the Analysis',
      description: 'Determine the scope and goals of the analysis.',
      substeps: [
        'Identify Losses',
        'Identify System-Level Hazards',
        'Identify System-Level Constraints',
        'Refine Hazards (Optional)'
      ]
    },
    'Identify Losses': {
      title: 'Identify Losses',
      description: 'Define what stakeholders value and want to prevent.',
      substeps: [
        'Identify stakeholders',
        'Determine stakeholder values',
        'Translate values into specific losses'
      ]
    },
    'Identify stakeholders': {
      title: 'Identify stakeholders',
      description: 'List users, operators, customers, regulators, and other affected groups.',
      substeps: []
    },
    'Determine stakeholder values': {
      title: 'Determine stakeholder values',
      description: 'Clarify what must be protected (e.g., human life, property, mission success).',
      substeps: []
    },
    'Translate values into specific losses': {
      title: 'Translate values into specific losses',
      description: 'Express values as losses (e.g., L-1: Loss of life, L-2: Loss of mission).',
      substeps: []
    },
    'Identify System-Level Hazards': {
      title: 'Identify System-Level Hazards',
      description:
        'Define system states that, in a worst-case environment, lead to a loss.',
      substeps: [
        'Define the system boundary',
        'Specify unsafe conditions',
        'Ensure hazards are system states'
      ]
    },
    'Define the system boundary': {
      title: 'Define the system boundary',
      description: 'Clarify what the designer can control and what sits outside the system.',
      substeps: []
    },
    'Specify unsafe conditions': {
      title: 'Specify unsafe conditions',
      description:
        'Define hazardous states (e.g., H-1: Aircraft violates minimum separation standards).',
      substeps: []
    },
    'Ensure hazards are system states': {
      title: 'Ensure hazards are system states',
      description:
        'Hazards are system states, not component failures (avoid labels like “brake failure”).',
      substeps: []
    },
    'Identify System-Level Constraints': {
      title: 'Identify System-Level Constraints',
      description: 'Specify behaviors or conditions necessary to prevent hazards.',
      substeps: ['Invert hazards into constraints', 'Trace constraints back to hazards']
    },
    'Invert hazards into constraints': {
      title: 'Invert hazards into constraints',
      description:
        'Turn each hazard into a positive requirement (e.g., SC-1: Aircraft must satisfy minimum separation standards).',
      substeps: []
    },
    'Trace constraints back to hazards': {
      title: 'Trace constraints back to hazards',
      description: 'Ensure each constraint explicitly prevents a defined hazard.',
      substeps: []
    },
    'Refine Hazards': {
      title: 'Refine Hazards (Optional)',
      description: 'Decompose high-level hazards into more specific sub-hazards.',
      substeps: [
        'Identify basic processes needed to prevent the hazard',
        'Create sub-hazards for each process'
      ]
    },
    'Identify basic processes needed to prevent the hazard': {
      title: 'Identify basic processes needed to prevent the hazard',
      description: 'List key processes (e.g., deceleration, steering) that prevent the hazard.',
      substeps: []
    },
    'Create sub-hazards for each process': {
      title: 'Create sub-hazards for each process',
      description: 'Define sub-hazards (e.g., H-4.1: Insufficient deceleration).',
      substeps: []
    },
    'Step 2: Model the Control Structure': {
      title: 'Step 2: Model the Control Structure',
      description: 'Build a functional model of the system as feedback control loops.',
      substeps: [
        'Identify Subsystems and Controllers',
        'Define Control Actions and Feedback',
        'Assign Responsibilities',
        'Iteratively Refine the Model'
      ]
    },
    'Identify Subsystems and Controllers': {
      title: 'Identify Subsystems and Controllers',
      description: 'Determine the key subsystems and the controllers responsible for them.',
      substeps: ['Determine basic subsystems', 'Identify controllers']
    },
    'Determine basic subsystems': {
      title: 'Determine basic subsystems',
      description: 'List subsystems needed to enforce constraints (e.g., Wheel Braking Subsystem).',
      substeps: []
    },
    'Identify controllers': {
      title: 'Identify controllers',
      description:
        'Identify human or automated controllers (e.g., Flight Crew, Brake System Control Unit).',
      substeps: []
    },
    'Define Control Actions and Feedback': {
      title: 'Define Control Actions and Feedback',
      description: 'Specify commands sent downward and feedback sent upward.',
      substeps: [
        'Map downward arrows as control actions',
        'Map upward arrows as feedback',
        'Use functional labels'
      ]
    },
    'Map downward arrows as control actions': {
      title: 'Map downward arrows as control actions',
      description: 'Define controller commands (e.g., “Brake command”).',
      substeps: []
    },
    'Map upward arrows as feedback': {
      title: 'Map upward arrows as feedback',
      description: 'Define status information returned to controllers.',
      substeps: []
    },
    'Use functional labels': {
      title: 'Use functional labels',
      description: 'Prefer functional names over physical representations (e.g., not “digital packet”).',
      substeps: []
    },
    'Assign Responsibilities': {
      title: 'Assign Responsibilities',
      description: 'Specify what each controller must do to enforce constraints.',
      substeps: ['Specify controller duties', 'Trace responsibilities to constraints']
    },
    'Specify controller duties': {
      title: 'Specify controller duties',
      description: 'Document the actions each controller must perform.',
      substeps: []
    },
    'Trace responsibilities to constraints': {
      title: 'Trace responsibilities to constraints',
      description: 'Link responsibilities to the system-level constraints they support.',
      substeps: []
    },
    'Iteratively Refine the Model': {
      title: 'Iteratively Refine the Model',
      description: 'Add detail as the design evolves and analysis needs deepen.',
      substeps: ['Zoom in on specific components', 'Include actuators and sensors when needed']
    },
    'Zoom in on specific components': {
      title: 'Zoom in on specific components',
      description: 'Refine the model by adding internal structure to key components.',
      substeps: []
    },
    'Include actuators and sensors when needed': {
      title: 'Include actuators and sensors when needed',
      description: 'Add them to enable scenario identification later in the analysis.',
      substeps: []
    },
    'Step 3: Identify Unsafe Control Actions (UCAs)': {
      title: 'Step 3: Identify Unsafe Control Actions (UCAs)',
      description: 'Analyze how each control action could lead to hazards.',
      substeps: [
        'Evaluate Control Actions Against Four UCA Categories',
        'Document the Context',
        'Trace UCAs to Hazards',
        'Define Controller Constraints'
      ]
    },
    'Evaluate Control Actions Against Four UCA Categories': {
      title: 'Evaluate Control Actions Against Four UCA Categories',
      description: 'Check how each control action can become unsafe.',
      substeps: [
        'Not providing the control action leads to a hazard',
        'Providing the control action leads to a hazard',
        'Providing the action too early, too late, or in the wrong order',
        'Stopping too soon or lasting too long (for continuous actions)'
      ]
    },
    'Not providing the control action leads to a hazard': {
      title: 'Not providing the control action leads to a hazard',
      description: 'Omission of the action causes or contributes to a hazardous state.',
      substeps: []
    },
    'Providing the control action leads to a hazard': {
      title: 'Providing the control action leads to a hazard',
      description: 'Executing the action creates a hazardous state.',
      substeps: []
    },
    'Providing the action too early, too late, or in the wrong order': {
      title: 'Providing the action too early, too late, or in the wrong order',
      description: 'Timing or ordering of the action makes it unsafe.',
      substeps: []
    },
    'Stopping too soon or lasting too long (for continuous actions)': {
      title: 'Stopping too soon or lasting too long (for continuous actions)',
      description: 'Duration errors create unsafe system states.',
      substeps: []
    },
    'Document the Context': {
      title: 'Document the Context',
      description: 'Capture the conditions that make a control action unsafe.',
      substeps: [
        'Specify the exact state or condition that makes the action unsafe',
        'Ensure the context describes the actual system state'
      ]
    },
    'Specify the exact state or condition that makes the action unsafe': {
      title: 'Specify the exact state or condition that makes the action unsafe',
      description: 'Example: “during a normal takeoff.”',
      substeps: []
    },
    'Ensure the context describes the actual system state': {
      title: 'Ensure the context describes the actual system state',
      description: 'Avoid describing the controller’s belief—describe what is actually happening.',
      substeps: []
    },
    'Trace UCAs to Hazards': {
      title: 'Trace UCAs to Hazards',
      description: 'Link each UCA to the system-level hazards it can cause.',
      substeps: ['Link every UCA to one or more system-level hazards it can cause']
    },
    'Link every UCA to one or more system-level hazards it can cause': {
      title: 'Link every UCA to one or more system-level hazards it can cause',
      description: 'Establish explicit traceability between UCAs and hazards.',
      substeps: []
    },
    'Define Controller Constraints': {
      title: 'Define Controller Constraints',
      description: 'Invert UCAs into required controller behavior.',
      substeps: ['Invert each UCA into a controller constraint']
    },
    'Invert each UCA into a controller constraint': {
      title: 'Invert each UCA into a controller constraint',
      description: 'Example: “The controller must not provide X during Y.”',
      substeps: []
    },
    'Step 4: Identify Loss Scenarios': {
      title: 'Step 4: Identify Loss Scenarios',
      description:
        'Explain why unsafe control actions might occur and how safe actions might be improperly executed.',
      substeps: [
        'Identify Scenarios Leading to UCAs (Type A)',
        'Identify Scenarios for Improperly Executed Safe Actions (Type B)',
        'Refine Scenarios for Security (If applicable)'
      ]
    },
    'Identify Scenarios Leading to UCAs (Type A)': {
      title: 'Identify Scenarios Leading to UCAs (Type A)',
      description: 'Analyze why unsafe control actions occur.',
      substeps: ['Inadequate Process Model', 'Inadequate Control Algorithm', 'Controller Failures']
    },
    'Inadequate Process Model': {
      title: 'Inadequate Process Model',
      description:
        'Controller belief is incorrect due to missing, delayed, or incorrect feedback.',
      substeps: []
    },
    'Inadequate Control Algorithm': {
      title: 'Inadequate Control Algorithm',
      description: 'Decision logic is flawed or becomes inadequate over time.',
      substeps: []
    },
    'Controller Failures': {
      title: 'Controller Failures',
      description: 'Hardware failures, power loss, or other degradation modes.',
      substeps: []
    },
    'Identify Scenarios for Improperly Executed Safe Actions (Type B)': {
      title: 'Identify Scenarios for Improperly Executed Safe Actions (Type B)',
      description: 'Explain how safe commands are mishandled or fail to achieve effects.',
      substeps: ['Control Path Problems', 'Controlled Process Problems']
    },
    'Control Path Problems': {
      title: 'Control Path Problems',
      description: 'Commands are sent but not received or improperly executed by actuators.',
      substeps: []
    },
    'Controlled Process Problems': {
      title: 'Controlled Process Problems',
      description:
        'Commands fail due to component failure, environmental disturbances, or conflicting inputs.',
      substeps: []
    },
    'Refine Scenarios for Security (If applicable)': {
      title: 'Refine Scenarios for Security (If applicable)',
      description: 'Consider how adversaries can exploit control and feedback paths.',
      substeps: ['Consider adversary injection, spoofing, or interception']
    },
    'Consider adversary injection, spoofing, or interception': {
      title: 'Consider adversary injection, spoofing, or interception',
      description: 'Assess how attacks could alter feedback or control actions.',
      substeps: []
    },
    '1.1 - Define General Concerns': {
      title: '1.1 - Define General Concerns',
      description:
        'Establish the analysis foundation by clarifying objectives, system definition, resources, boundaries, and components.',
      substeps: [
        '1.1.1 - Define Analysis Objectives: Establish the purpose of the analysis to guide the process.',
        '1.1.2 - System Definition: Provide a brief introduction and purpose of the system under analysis.',
        '1.1.3 - List Resources Needed: Catalog materials such as manuals, articles, prototypes, and repositories used for the analysis.',
        '1.1.4 - Define System Boundary: Establish the scope where control can be exercised to implement safety strategies.',
        '1.1.5 - Define System Components: Identify basic components to serve as actors in modeling and controllers in the control structure.'
      ]
    },
    '1.1.1 - Define Analysis Objectives': {
      title: '1.1.1 - Define Analysis Objectives',
      description:
        'Explicitly state the purpose of the study to keep the analysis focused and consistent across iterations.',
      substeps: [
        'Purpose: These objectives guide the entire process and help define the depth of the analysis.',
        'Example (IIP System): The objective is to model an Insulin Infusion Pump through the iterative RESafety process to generate successive refinements of safety analysis artifacts.'
      ]
    },
    '1.1.2 - System Definition': {
      title: '1.1.2 - System Definition',
      description: 'Provide a high-level summary of what the system is and why it exists.',
      substeps: [
        'Content: Include a brief introduction to the system and a concise explanation of its primary purpose.',
        'Example (IIP System): The IIP is a safety-critical system designed to support the treatment of Type 1 Diabetes by mimicking physiological insulin responses through bolus and basal doses.'
      ]
    },
    '1.1.3 - List Resources Needed': {
      title: '1.1.3 - List Resources Needed',
      description:
        'Catalog all reference materials to ensure a comprehensive understanding of the system.',
      substeps: [
        'Types of Resources: Repositories, operation manuals, academic articles, prototypes, standards, or images.',
        'Traceability: Identifying resources early ensures safety claims and requirements are grounded in documentation.'
      ]
    },
    '1.1.4 - Define System Boundary': {
      title: '1.1.4 - Define System Boundary',
      description:
        'Establish the scope where control can be exercised to implement safety strategies.',
      substeps: [
        'Focus: The boundary should target parts of the system where control can be applied.',
        'Example (IIP System): The boundary encompasses everything from the patient configuring infusion settings to correct dosage delivery via the catheter.'
      ]
    },
    '1.1.5 - Define System Components': {
      title: '1.1.5 - Define System Components',
      description: 'Identify the fundamental building blocks of the system.',
      substeps: [
        'Downstream Use: Components become actors in iStar4Safety models and controllers/controlled processes in the control structure.',
        'Refinement: Begin with basic components (e.g., Patient, Infusion Pump) and refine into subcomponents over iterations.'
      ]
    },
    '1.2 - Define Safety Concerns': {
      title: '1.2 - Define Safety Concerns',
      description:
        'Identify critical safety elements (accidents, hazards, constraints, responsibilities, and artefacts) to update the Safety Analysis Document [Scope Updated].',
      substeps: [
        '1.2.1 - Identify Accidents: Define unplanned, undesired loss events labeled as Ax and avoid causal/component references.',
        '1.2.2 - Identify System-Level Hazards: Specify hazardous system states labeled as Hx and trace them to accidents.',
        '1.2.3 - Identify Safety Constraints: State high-level system constraints (often hazard negations) traceable to hazards.',
        '1.2.4 - Define Responsibilities: Assign actor/component responsibilities to enforce safety constraints.',
        '1.2.5 - Define Other Relevant Artefacts: Catalog existing safety-related documents, models, or analyses.'
      ]
    },
    '1.2.1 - Identify Accidents': {
      title: '1.2.1 - Identify Accidents',
      description:
        'An accident is an unplanned and undesired event that results in a specific, significant level of loss.',
      substeps: [
        'Labeling: Use the Ax identifier (e.g., A1, A2).',
        'Guideline: Avoid references to individual components or specific causes (e.g., “human error”).',
        'Example (IIP System): A1 - Risk of death.',
        'Example (IIP System): A2 - Risk of injury.'
      ]
    },
    '1.2.2 - Identify System-Level Hazards': {
      title: '1.2.2 - Identify System-Level Hazards',
      description:
        'Hazards are specific system states or conditions that, under worst-case environmental conditions, will lead to an accident.',
      substeps: [
        'Labeling: Use the Hx identifier (e.g., H1, H2).',
        'Traceability: Specify which accidents are associated with each hazard.',
        'Iteration note: Link previously identified UCAs to hazards; if missing, define a new hazard.',
        'Example (IIP System): H1 - Hypoglycemia [A1, A2].'
      ]
    },
    '1.2.3 - Identify Safety Constraints': {
      title: '1.2.3 - Identify Safety Constraints',
      description:
        'High-level constraints the system must not violate to prevent the identified hazards.',
      substeps: [
        'Focus: State what the system must not do (not implementation solutions).',
        'Formulation: Often expressed as negations of hazards and traceable to one or more hazards.',
        'Example (IIP System): SC-01: The system must not administer insulin in excess of the prescribed dose or in unintended circumstances [H1].'
      ]
    },
    '1.2.4 - Define Responsibilities': {
      title: '1.2.4 - Define Responsibilities',
      description:
        'Responsibilities specify what each system actor or component must do to enforce safety constraints.',
      substeps: [
        'Methodology: Review each component against every safety constraint to define its role.',
        'Refinement: Responsibilities refine high-level safety constraints.',
        'Example (IIP System): Insulin Pump responsibility R-02: Administer insulin only according to validated infusion parameters and prevent unauthorized dosages [SC-01].'
      ]
    },
    '1.2.5 - Define Other Relevant Artefacts': {
      title: '1.2.5 - Define Other Relevant Artefacts',
      description: 'Catalog additional materials that relate to system safety.',
      substeps: [
        'Purpose: Reuse existing documentation, models, or prior safety analyses to reduce effort.',
        'Storage: Attach resources directly or reference via external links.',
        'Example (IIP System): Manufacturer user manual of the infusion pump.'
      ]
    },
    '2.1 - Develop Strategic Dependency (SD) Model': {
      title: '2.1 - Develop Strategic Dependency (SD) Model',
      description:
        'Visualize the “who” and “what” of system interactions by mapping social and strategic dependencies between actors.',
      substeps: [
        'Purpose: Identify dependencies between actors to show who depends on whom for goals, tasks, or resources.',
        'Outcome: Provide a high-level view of interactions and responsibilities across the system.',
        'Input requirements: Use the system components list from Step 1.1.5 as the primary reference.',
        'Refinement sources: Existing documentation or prior analyses can help refine the actor list.'
      ]
    },
    '2.2 - Develop Strategic Rationale (SR) Model': {
      title: '2.2 - Develop Strategic Rationale (SR) Model',
      description:
        'Detail the internal logic linking responsibilities and safety constraints to actor goals.',
      substeps: [
        '2.2.1 - Define the Main Goals of the Actors',
        '2.2.2 - Include the Safety Constraints',
        '2.2.3 - Include Actor Responsibilities',
        '2.2.4 - Include Necessary Elements to Complete Logic'
      ]
    },
    '2.2.1 - Define the Main Goals of the Actors': {
      title: '2.2.1 - Define the Main Goals of the Actors',
      description:
        'Establish why each actor exists in the system before modeling safety logic.',
      substeps: [
        'Purpose: The overall goal of each actor anchors all subsequent safety logic.',
        'Guideline: Model safety logic as a direct extension or restriction of the main goal.',
        'Example (IIP System): The main goal for the Patient (Human Controller) is defined as “Use the IIP”.'
      ]
    },
    '2.2.2 - Include the Safety Constraints': {
      title: '2.2.2 - Include the Safety Constraints',
      description: "Bring high-level safety constraints into the actor's internal boundary.",
      substeps: [
        'Modeling Construct: Safety constraints are modeled as Safety Goals within the iStar4Safety language.',
        'Logic: These Safety Goals are linked directly to the actor’s main goal.',
        'Traceability: The link shows the actor can only achieve the main goal safely if constraints are not violated.',
        'Example (IIP System): SC-01 (No excess insulin) and SC-02 (Correct amount/time) are linked as Safety Goals to “Use the IIP”.'
      ]
    },
    '2.2.3 - Include Actor Responsibilities': {
      title: '2.2.3 - Include Actor Responsibilities',
      description:
        'Operationalize safety constraints by adding the actor’s specific duties.',
      substeps: [
        'Modeling Construct: Responsibilities are modeled as Safety Goals.',
        'Logic: Each responsibility is connected to the specific Safety Constraint it fulfills.',
        'Rationale: If a responsibility (R) is not performed, the corresponding Safety Constraint (SC) may fail, leading to Hazard (H) and Accident (A).',
        'Example (IIP System): Responsibility R-01 (“Ensure correct settings”) is connected to SC-01 and SC-02.'
      ]
    },
    '2.2.4 - Include Necessary Elements to Complete Logic': {
      title: '2.2.4 - Include Necessary Elements to Complete Logic',
      description:
        'Ensure the model remains functional and coherent by adding non-safety elements.',
      substeps: [
        'Internal vs. External: Model remaining dependency elements whose fulfillment logic falls within the actor’s scope.',
        'Consistency: These elements support the social structure established in the SD model.',
        'Example (IIP System): For the Patient actor, tasks like “Measure blood glucose” and “Measure insulin” complete the internal rationale supporting the dependency with the Human Body actor.'
      ]
    },
    '3.1 - Define Controllers and Controlled Processes': {
      title: '3.1 - Define Controllers and Controlled Processes',
      description:
        'Identify and classify entities that will form the system control loops, transitioning from social relationships to a functional control view.',
      substeps: [
        '3.1.1 - Identify Entities from SR Models',
        '3.1.2 - Classify Entity Roles',
        '3.1.3 - Address Role Duality',
        '3.1.4 - Manage Passive Entities',
        '3.1.5 - Ensure Responsibility Traceability'
      ]
    },
    '3.1.1 - Identify Entities from SR Models': {
      title: '3.1.1 - Identify Entities from SR Models',
      description:
        'Identify potential entities based on the Actors defined in the updated Strategic Rationale (SR) model from Step 2.2.',
      substeps: []
    },
    '3.1.2 - Classify Entity Roles': {
      title: '3.1.2 - Classify Entity Roles',
      description: 'Categorize each entity into one of two functional roles.',
      substeps: [
        'Controllers: Decision-making components that process information and issue control actions.',
        'Controlled Processes: Components that react to commands and perform physical or logical actions.'
      ]
    },
    '3.1.3 - Address Role Duality': {
      title: '3.1.3 - Address Role Duality',
      description: 'Account for hierarchical architectures where an entity can play both roles.',
      substeps: [
        'Dual role: An entity can be a Controller for one part of the system while acting as a Controlled Process for another.',
        'Example (IIP System): The Insulin Pump is a controlled process relative to the Patient, but a controller for the Infusion Set.'
      ]
    },
    '3.1.4 - Manage Passive Entities': {
      title: '3.1.4 - Manage Passive Entities',
      description: 'Handle entities that do not initiate control actions.',
      substeps: [
        'Classification: Passive entities must be modeled exclusively as controlled processes.',
        'Interaction Logic: Dependencies are modeled as feedback (information flow) to the controller rather than control actions.',
        'Example (IIP System): The Patient (Human Body) is modeled as a passive controlled process; blood glucose measurements are feedback to the Patient (Human Controller).'
      ]
    },
    '3.1.5 - Ensure Responsibility Traceability': {
      title: '3.1.5 - Ensure Responsibility Traceability',
      description:
        'Associate Responsibilities from Step 1.2.4 with specific controllers or controlled processes to ensure every safety requirement is assigned.',
      substeps: []
    },
    '3.2 - Define Control Actions': {
      title: '3.2 - Define Control Actions',
      description:
        'Identify the specific commands issued by controllers to controlled processes to enforce safety constraints.',
      substeps: [
        '3.2.1 - Derive Actions from Strategic Dependencies',
        '3.2.2 - Link Actions to Actor Responsibilities',
        '3.2.3 - Handle Passive Entities and Feedback Loops',
        '3.2.4 - Identify External Inputs'
      ]
    },
    '3.2.1 - Derive Actions from Strategic Dependencies': {
      title: '3.2.1 - Derive Actions from Strategic Dependencies',
      description:
        'Use the SD model to map dependencies into control actions and roles.',
      substeps: [
        'Reference: Use the Strategic Dependency (SD) model from Step 2.1 as the foundation.',
        'Role mapping: The depender is the controller; the dependee is the controlled process.',
        'Control action: The dependum (goal, task, or resource) becomes the control action.'
      ]
    },
    '3.2.2 - Link Actions to Actor Responsibilities': {
      title: '3.2.2 - Link Actions to Actor Responsibilities',
      description:
        'Ensure each control action supports a defined responsibility.',
      substeps: [
        'Traceability: Link every control action to the responsibilities it supports or implements.',
        'Purpose: Operationalizes the high-level safety goals from Step 1.2.4.',
        'Example (IIP System): Responsibility R-1 (“Ensure correct settings”) is implemented via the control action “Program insulin dosage”.'
      ]
    },
    '3.2.3 - Handle Passive Entities and Feedback Loops': {
      title: '3.2.3 - Handle Passive Entities and Feedback Loops',
      description:
        'Represent passive entities through feedback rather than control actions.',
      substeps: [
        'Passive entities: Model them exclusively as controlled processes.',
        'Feedback: Dependencies become feedback (information flow) instead of control actions.',
        'Example (IIP System): The Human Body (E4) is passive, so “Take blood glucose measurement” is feedback to the Human Controller (E1).'
      ]
    },
    '3.2.4 - Identify External Inputs': {
      title: '3.2.4 - Identify External Inputs',
      description:
        'Capture influences outside the system boundary that affect behavior or safety.',
      substeps: [
        'Scope: Identify external inputs that are essential for fulfilling responsibilities.',
        'Example (IIP System): A “Medical prescription” informs the “Program insulin dosage” control action.'
      ]
    },
    '3.3 - Define Feedbacks': {
      title: '3.3 - Define Feedbacks',
      description: 'Identify the mechanisms used by controllers to observe the system state.',
      substeps: [
        'Purpose: Feedbacks allow the controller to verify if a control action was successful or if the controlled process has changed state.',
        'Modeling Logic: For passive entities, task dependencies from the SD model are represented exclusively as feedback.',
        'IIP Example: “Blood glucose measurement” and “Insulin measurement” are feedbacks sent from the Patient (Human Body) to the Patient (Human Controller).'
      ]
    },
    '3.4 - Define Process Models': {
      title: '3.4 - Define Process Models',
      description: 'Represent the controller’s internal map of the system.',
      substeps: [
        'Purpose: Process models help detect mismatches between what the controller believes and what is actually happening.',
        'Safety Criticality: Accidents often occur when the controller’s process model is incorrect (e.g., assumes a valve is closed when it is open).'
      ]
    },
    '3.5 - Define Control Algorithms': {
      title: '3.5 - Define Control Algorithms',
      description: 'Define the logic used by the controller to select actions.',
      substeps: [
        'Composition: May include if-then rules, logic-based routines, or complex algorithmic behaviors.',
        'Role: Translates process model data and goals into a chosen Control Action.'
      ]
    },
    '3.6 - Define Actuators': {
      title: '3.6 - Define Actuators',
      description: 'Identify the physical or logical “muscles” of the control loop.',
      substeps: [
        'Function: Components responsible for implementing the control action issued by the controller.',
        'IIP Example: The stepper motor and its driver can be modeled as actuators that implement the “deliver insulin” command.'
      ]
    },
    '3.7 - Define Sensors': {
      title: '3.7 - Define Sensors',
      description: 'Identify the probes that collect data from the controlled process.',
      substeps: [
        'Function: Sensors transmit raw process data back to the controller, completing the feedback loop.',
        'Refinement: This step identifies the specific hardware or software probes doing the collection.'
      ]
    },
    '3.8 - Define External Inputs': {
      title: '3.8 - Define External Inputs',
      description: 'Model influences outside the system boundary that affect behavior.',
      substeps: [
        'Scope: Includes user commands, environmental conditions, or data from external actors that affect behavior.',
        'IIP Example: A “Medical prescription” issued by a physician impacts the responsibility of configuring infusion settings.'
      ]
    },
    '4.1 - Select Control Action': {
      title: '4.1 - Select Control Action',
      description:
        'Choose a specific control action to start the Unsafe Control Actions (UCA) analysis.',
      substeps: [
        'Prerequisites:',
        'Objective:',
        'Substep Details (Workflow Logic):',
        'Illustrative Example: IIP System'
      ]
    },
    'Prerequisites': {
      title: 'Prerequisites',
      description: 'Required inputs before selecting a control action.',
      substeps: [
        'Control Structure Model: The analyst must have the updated control structure (from Step 3.2) showing all controllers, controlled processes, and the actions connecting them.',
        'Mandatory Nature: Selecting and analyzing control actions is a mandatory requirement for the process to proceed to the hazard analysis stage.'
      ]
    },
    'Objective': {
      title: 'Objective',
      description: 'What the analyst aims to achieve in Step 4.1.',
      substeps: [
        'Goal: Isolate one action at a time to systematically determine if it could lead to hazardous behavior under specific conditions.',
        'Coverage: This systematic approach ensures that no critical system interaction is overlooked.'
      ]
    },
    'Substep Details (Workflow Logic)': {
      title: 'Substep Details (Workflow Logic)',
      description: 'Workflow steps for selecting a control action.',
      substeps: [
        'Identify the Source and Destination: Determine which entity (the Controller) is sending the action and which entity (the Controlled Process) is receiving it.',
        'Reference Responsibilities: Identify the specific actor responsibility (e.g., R-01) that this control action is intended to fulfill.',
        'Prepare for UCA Evaluation: Pass the selected action into the next four analysis conditions (Steps 4.2 through 4.5).'
      ]
    },
    'Illustrative Example: IIP System': {
      title: 'Illustrative Example: IIP System',
      description: 'Example for Step 4.1 using the Insulin Infusion Pump scenario.',
      substeps: [
        'Selected Control Action: “Program insulin dosage (R-1)”.',
        'Controller (From): E1 - Patient (Human Controller).',
        'Controlled Process (To): E2 - Infusion Pump.',
        'Associated Responsibility: R-1 (“Ensure that infusion settings are correctly configured...”).'
      ]
    },
    '4.2 - Not Providing': {
      title: '4.2 - Not Providing',
      description:
        'Assess the safety impact if the controller fails to issue a required command.',
      substeps: [
        'Analysis Question: If this action is required for safety or operation but is not carried out, does it lead to an accident?.',
        'IIP System Example: If the patient fails to program the infusion pump when insulin is required (UCA-01), the pump will not deliver insulin, potentially leading to Hypoglycemia (H1).'
      ]
    },
    '4.3 - Providing Incorrectly': {
      title: '4.3 - Providing Incorrectly',
      description:
        'Evaluate the safety impact of issuing a wrong or inappropriate command.',
      substeps: [
        'Analysis Question: If the control action is carried out, but with incorrect parameters or values, does it lead to an accident?.',
        'IIP System Example: A higher-than-prescribed dosage (UCA-02) may trigger overdose (H2); a lower-than-prescribed dosage (UCA-03) may lead to underdose (H1).'
      ]
    },
    '4.4 - Timing and Order': {
      title: '4.4 - Timing and Order',
      description:
        'Examine timing and sequencing issues for the control action.',
      substeps: [
        'Analysis Question: If the command is correct but provided too early, too late, or in the wrong sequence, does it lead to an accident?.',
        'IIP System Example: Too late (UCA-04) may result in Hyperglycemia (H1); too early (UCA-05) before a meal may result in Hypoglycemia (H2).'
      ]
    },
    '4.5 - Duration': {
      title: '4.5 - Duration',
      description:
        'Focus on how long the command is applied.',
      substeps: [
        'Analysis Question: If the action is provided for too long or too short a duration, or stopped too soon, does it lead to an accident?.',
        'IIP System Example: For “Program insulin dosage”, this condition is noted as “Not applicable” because duration is not a relevant safety concern in this context.'
      ]
    },
    '4.6 - Associate UCAs with Hazards': {
      title: '4.6 - Associate UCAs with Hazards',
      description:
        'Ensure each Unsafe Control Action (UCA) is linked to at least one system-level hazard (Hx).',
      substeps: [
        'Ensuring Traceability',
        'Defining the Cause',
        'Structural Reasoning',
        'IIP System Example'
      ]
    },
    'Ensuring Traceability': {
      title: 'Ensuring Traceability',
      description:
        'Maintain a clear logical path between unsafe behavior and system hazards.',
      substeps: [
        'Association: Each identified UCA must be formally linked to at least one hazard (Hx) from Step 1.2.2.',
        'Purpose: This preserves traceability from behavioral safety issues to system-level dangers.'
      ]
    },
    'Defining the Cause': {
      title: 'Defining the Cause',
      description:
        'UCAs are treated as causes of hazards in RESafety logic.',
      substeps: [
        'Causal logic: UCAs are viewed as the causes of hazards.',
        'Gap handling: If a UCA does not fit an existing hazard, define a new hazard to accommodate it.'
      ]
    },
    'Structural Reasoning': {
      title: 'Structural Reasoning',
      description:
        'Use a structured reasoning path to link UCAs to hazards.',
      substeps: [
        'Start with the UCA.',
        'Identify the Responsibility it impacts.',
        'Determine the Safety Constraint associated with that responsibility.',
        'Trace that constraint back to the corresponding System-level Hazard.'
      ]
    },
    'IIP System Example': {
      title: 'IIP System Example',
      description:
        'Mapping UCAs for “Program insulin dosage” to hazards.',
      substeps: [
        'UCA-01: Patient does not provide dosage when required → H1 (Hypoglycemia/Underdose).',
        'UCA-02: Dosage provided is higher than prescribed → H2 (Overdose).',
        'UCA-03: Dosage provided is lower than prescribed → H1 (Underdose).',
        'UCA-04: Dosage provided too late → H1 (Hyperglycemia).',
        'UCA-05: Dosage provided too early → H2 (Hypoglycemia).'
      ]
    },
    '4.7 - Associate UCAs with Responsibilities': {
      title: '4.7 - Associate UCAs with Responsibilities',
      description:
        'Link each UCA to the responsibility and safety constraint it violates, reinforcing traceability.',
      substeps: [
        'Core Objectives',
        'The Structured Reasoning Path',
        'Special Considerations: Responsibilities Without UCAs',
        'Output'
      ]
    },
    '4.8 - Model Hazardous Conditions (HC)': {
      title: '4.8 - Model Hazardous Conditions (HC)',
      description:
        'Decision point: determine whether to model HCs for responsibilities without UCAs or add more HCs to capture unsafe states outside control actions.',
      substeps: [
        'Yes: Model HCs for responsibilities without associated control actions or add more hazards.',
        'No: Conclude the UCA identification subprocess.',
        'Tracing HCs to Hazards'
      ]
    },
    'Core Objectives': {
      title: 'Core Objectives',
      description: 'How this substep refines and aligns the analysis.',
      substeps: [
        'Refinement: Link each UCA to the functional responsibility and its corresponding Safety Constraint (SC).',
        'Functional Alignment: Reinforce the link between behavioral safety issues and modeled responsibilities.',
        'Gap Detection: Identify responsibilities that do not lead to UCAs (e.g., passive feedback or external inputs).'
      ]
    },
    'The Structured Reasoning Path': {
      title: 'The Structured Reasoning Path',
      description: 'Recommended traceability logic for each UCA.',
      substeps: [
        'Identify the Responsibility: Locate the responsibility associated with the UCA in the originating control action.',
        'Determine the Safety Constraint (SC): Pinpoint the constraint associated with that responsibility.',
        'Trace to the Hazard: Trace the safety constraint back to its system-level Hazard (Hx).'
      ]
    },
    'Special Considerations: Responsibilities Without UCAs': {
      title: 'Special Considerations: Responsibilities Without UCAs',
      description: 'Cases where responsibilities do not generate UCAs.',
      substeps: [
        'Passive Mechanisms: Responsibilities fulfilled exclusively through feedback mechanisms do not involve control actions, so no UCA is generated.',
        'Example: In the IIP system, R-06 (“Ensure correct and timely delivery of insulin”) is fulfilled via feedback from Human Body (E4) to Human Controller (E1), so no UCA exists.',
        'Safety Impact: Even without a UCA, the safety impact must be considered, leading to Hazardous Conditions (HCs) in the next step.'
      ]
    },
    'Output': {
      title: 'Output',
      description: 'Expected result of Step 4.7.',
      substeps: [
        'Updated UCA Table: Each entry includes its associated Responsibility, Safety Constraint, and Hazard IDs.'
      ]
    },
    'Yes: Model HCs for responsibilities without associated control actions or add more hazards.': {
      title: 'Yes: Model HCs for responsibilities without associated control actions or add more hazards.',
      description:
        'Model Hazardous Conditions (HCs) when unsafe states arise without an active control action.',
      substeps: [
        'HCs for Responsibilities Without UCAs: Covers responsibilities fulfilled via passive feedback or external inputs rather than control actions.',
        'IIP Example: Responsibility R-06 (“Ensure correct delivery”) is fulfilled by blood glucose and insulin measurements (feedback). Missing or wrong feedback creates an HC.',
        'Adding More Hazards: Include dangerous states not covered by existing UCAs, even if responsibilities already have control actions.',
        'IIP Example: HC-01: “The pump is misplaced or inaccessible to the patient.”'
      ]
    },
    'No: Conclude the UCA identification subprocess.': {
      title: 'No: Conclude the UCA identification subprocess.',
      description:
        'Conclude UCA identification when all responsibilities are adequately covered by UCAs and no additional passive or environmental hazards exist.',
      substeps: [
        'Decision: Proceed to conclude the UCA identification phase and move forward in the workflow.'
      ]
    },
    'Tracing HCs to Hazards': {
      title: 'Tracing HCs to Hazards',
      description:
        'Apply the same rigor to HCs as to UCAs by ensuring hazard traceability.',
      substeps: [
        'Traceability Requirement: Every HC identified must be associated with at least one system-level hazard.',
        'Defining New Hazards: If the current model does not have a hazard that fits the HC, the analyst must create a new one.'
      ]
    },
    '5.1 - Analyze Identified UCAs and HCs': {
      title: '5.1 - Analyze Identified UCAs and HCs',
      description:
        'Transition from unsafe behaviors to the positive requirements needed for controller constraints.',
      substeps: [
        'Review UCA Table',
        'Review Additional Hazardous Conditions Table',
        'Derive Safe Operating Conditions',
        'Traceability and Purpose'
      ]
    },
    'Review UCA Table': {
      title: 'Review UCA Table',
      description: 'Examine each UCA to identify unsafe control behavior to prevent.',
      substeps: [
        'Review: Analyze each Unsafe Control Action (UCA) recorded in the table.',
        'Purpose: Identify the specific unsafe control behavior that must be prevented.',
        'IIP Example: For UCA-02, the behavior “Patient provides a value higher than prescribed” must be explicitly restricted.'
      ]
    },
    'Review Additional Hazardous Conditions Table': {
      title: 'Review Additional Hazardous Conditions Table',
      description: 'Account for hazardous conditions not captured via UCAs.',
      substeps: [
        'Review: Examine each Hazardous Condition (HC) indicating a compromised safety-critical responsibility.',
        'Coverage: Ensures safety logic includes environmental or passive states, not only command failures.',
        'IIP Example: HC-01 describes “The pump is misplaced or inaccessible to the patient”.'
      ]
    },
    'Derive Safe Operating Conditions': {
      title: 'Derive Safe Operating Conditions',
      description: 'Derive behavioral conditions required to keep the system safe.',
      substeps: [
        'Derivation: Convert UCA/HC analysis into conditions that define safe behavior.',
        'Drafting: These conditions form the draft for formal constraints in the next substep.',
        'IIP Example: From UCA-04 (dosage provided too late), derive a required “administration window”.'
      ]
    },
    'Traceability and Purpose': {
      title: 'Traceability and Purpose',
      description: 'Operationalize safety by tying unsafe behavior to constraints.',
      substeps: [
        'Purpose: Ensures every unsafe behavior leads directly to a defined constraint for implementation or verification.'
      ]
    },
    '5.2 - Formulate Constraints': {
      title: '5.2 - Formulate Constraints',
      description:
        'Translate the analyzed conditions from Step 5.1 into explicit controller requirements.',
      substeps: [
        'Specify Required Controller Behavior',
        'Specify Prohibited Controller Behavior',
        'Establish Traceability Links',
        'Update the Controller Constraints List',
        'Example: IIP System Controller Constraints Table'
      ]
    },
    'Specify Required Controller Behavior': {
      title: 'Specify Required Controller Behavior',
      description: 'Define the positive actions a controller must take to ensure safety.',
      substeps: [
        'IIP Example: “The patient must program the insulin dosage whenever insulin is required, according to clinical guidance”.'
      ]
    },
    'Specify Prohibited Controller Behavior': {
      title: 'Specify Prohibited Controller Behavior',
      description: 'Define actions or states a controller must avoid to prevent hazards.',
      substeps: [
        'IIP Example: “The patient must not program the insulin dosage before the appropriate physiological or dietary condition occurs”.'
      ]
    },
    'Establish Traceability Links': {
      title: 'Establish Traceability Links',
      description: 'Link each new constraint to the specific UCA or HC it addresses.',
      substeps: [
        'IIP Example: Constraint C-02 (“dosage does not exceed the value prescribed”) is linked to UCA-02 (“Patient provides a value higher than prescribed”).'
      ]
    },
    'Update the Controller Constraints List': {
      title: 'Update the Controller Constraints List',
      description: 'Record finalized constraints in the safety analysis document.',
      substeps: [
        'Purpose: The updated list supports Step 6 and future verification/validation activities.'
      ]
    },
    'Example: IIP System Controller Constraints Table': {
      title: 'Example: IIP System Controller Constraints Table',
      description: 'Formal translation for the “Program insulin dosage” action.',
      substeps: [
        'UCA-01: Patient does not program dosage when required → C-01: Patient must program dosage whenever required.',
        'UCA-02: Dosage provided is higher than prescribed → C-02: Patient must ensure dosage does not exceed prescribed value.',
        'UCA-04: Dosage provided too late → C-04: Patient must program dosage in a timely manner.',
        'HC-01: Pump is misplaced or inaccessible → C-06: Pump must be in an accessible and known location.'
      ]
    },
    '6.1 - Select UCA/HC': {
      title: '6.1 - Select UCA/HC',
      description:
        'Entry point for loss-based reasoning: select one UCA or HC to investigate how and why it happens.',
      substeps: [
        'Access Source Artifacts',
        'Individual Item Evaluation',
        'Establish the Reasoning Anchor',
        'Illustrative Example: IIP System Selection'
      ]
    },
    'Access Source Artifacts': {
      title: 'Access Source Artifacts',
      description: 'Primary inputs required before selection.',
      substeps: [
        'Inputs: UCA Table and Additional Hazard Cause Table (HCs) must be available.'
      ]
    },
    'Individual Item Evaluation': {
      title: 'Individual Item Evaluation',
      description: 'Select each item for systematic examination.',
      substeps: [
        'Method: Evaluate each UCA/HC individually to ensure a thorough causal analysis.'
      ]
    },
    'Establish the Reasoning Anchor': {
      title: 'Establish the Reasoning Anchor',
      description: 'Define the item that anchors the loss-scenario investigation.',
      substeps: [
        'Anchor: The selected UCA or HC serves as the anchor for investigating causal factors, known as Loss Scenarios (LS).'
      ]
    },
    'Illustrative Example: IIP System Selection': {
      title: 'Illustrative Example: IIP System Selection',
      description: 'Example selections from the IIP case study.',
      substeps: [
        'Selected UCA: UCA-01 — “Patient does not provide Program insulin dosage when insulin is required, leading to underdose [H1]”.',
        'Selected HC: HC-01 — “The pump is misplaced or inaccessible to the patient”.'
      ]
    },
    '6.2 - Identify Potential Loss Scenarios': {
      title: '6.2 - Identify Potential Loss Scenarios',
      description:
        'Investigate causal factors that could transform an unsafe behavior into a system-level hazard.',
      substeps: [
        'Investigate Causal Paths',
        'Identify Contributing Factors',
        'Register Unique Scenarios',
        'Document and Maintain Traceability',
        'Illustrative Example (IIP System)'
      ]
    },
    'Investigate Causal Paths': {
      title: 'Investigate Causal Paths',
      description: 'Explore paths leading from the UCA/HC to a hazard.',
      substeps: []
    },
    'Identify Contributing Factors': {
      title: 'Identify Contributing Factors',
      description: 'Consider environmental conditions, human factors, and technical failures.',
      substeps: []
    },
    'Register Unique Scenarios': {
      title: 'Register Unique Scenarios',
      description: 'Each unique combination of factors becomes a distinct Loss Scenario (LS).',
      substeps: []
    },
    'Document and Maintain Traceability': {
      title: 'Document and Maintain Traceability',
      description: 'Record LS entries and link each to its UCA/HC.',
      substeps: []
    },
    'Illustrative Example (IIP System)': {
      title: 'Illustrative Example (IIP System)',
      description: 'Loss scenarios derived from UCAs/HCs for “Program insulin dosage”.',
      substeps: [
        'UCA-01: Patient does not provide dosage when required → LS-01: Patient forgets to program the dose after a meal.',
        'UCA-01: Patient does not provide dosage when required → LS-02: System does not issue a reminder after detecting a meal.',
        'UCA-02: Dosage provided is higher than prescribed → LS-04: Patient misinterprets the prescribed dose and enters a higher value.',
        'UCA-04: Dosage provided too late → LS-07: Patient delays programming due to being busy or distracted.',
        'HC-01: Pump is misplaced or inaccessible → LS-11: Patient in critical condition cannot remember where the pump was placed.'
      ]
    },
    '6.3 - Derive Safety Requirements for Loss Scenarios': {
      title: '6.3 - Derive Safety Requirements for Loss Scenarios',
      description:
        'Transform Loss Scenarios (LS) into concrete, actionable Safety Requirements (SR).',
      substeps: [
        'Core Objectives',
        'Analyze LS Causal Factors',
        'Formulate Mitigation Strategies',
        'Register Safety Requirements',
        'Establish Traceability Links',
        'Illustrative Example: IIP System (Step 6.3)'
      ]
    },
    'Core Objectives (Step 6.3)': {
      title: 'Core Objectives (Step 6.3)',
      description: 'Key goals when deriving safety requirements.',
      substeps: [
        'Preventing Manifestation: Design measures that stop a loss scenario from occurring.',
        'Mitigation and Detection: Reduce impact or enable detection/reaction if a scenario occurs.',
        'Operationalizing Safety: Address potential failure modes identified in the analysis.'
      ]
    },
    'Analyze LS Causal Factors': {
      title: 'Analyze LS Causal Factors',
      description: 'Review conditions or operational errors recorded for each LS.',
      substeps: []
    },
    'Formulate Mitigation Strategies': {
      title: 'Formulate Mitigation Strategies',
      description: 'Define strategies to eliminate causal factors (e.g., alerts, cross-checks).',
      substeps: []
    },
    'Register Safety Requirements': {
      title: 'Register Safety Requirements',
      description: 'Record each derived SR in a dedicated list.',
      substeps: []
    },
    'Establish Traceability Links (Step 6.3)': {
      title: 'Establish Traceability Links (Step 6.3)',
      description: 'Link each SR to one or more Loss Scenarios.',
      substeps: []
    },
    'Illustrative Example: IIP System (Step 6.3)': {
      title: 'Illustrative Example: IIP System (Step 6.3)',
      description: 'Examples of LS-to-SR derivations in the IIP case study.',
      substeps: [
        'LS-01: Patient forgets to program the dose after a meal → SR-01: System shall generate an alert if insulin is not programmed within 15 minutes after a meal is detected.',
        'LS-04: Patient misinterprets prescribed dose → SR-04: System shall cross-check manual input with prescription data and alert if excess dosage is detected.',
        'LS-08: System accepts bolus entry after blood glucose spike → SR-07: System must block ineffective post-prandial bolus entries unless physician override.',
        'LS-11: Patient cannot remember pump location → SR-10: Pump must support a “locate pump” mobile alert with audible alarm.'
      ]
    },
    '7.1 - Model UCA or Hazardous Conditions': {
      title: '7.1 - Model UCA or Hazardous Conditions',
      description:
        'Bring UCAs and HCs back into the iStar4Safety SR model as safety tasks for the next iteration.',
      substeps: [
        'Orientation for Step 7.1',
        'Modeling Construct',
        'Logical Placement',
        'ID Mapping',
        'Functional Connection',
        'IIP System Example (Step 7.1)'
      ]
    },
    'Orientation for Step 7.1': {
      title: 'Orientation for Step 7.1',
      description:
        'Incorporate every UCA and HC into the internal reasoning structure of system actors.',
      substeps: []
    },
    'Modeling Construct': {
      title: 'Modeling Construct',
      description:
        'UCAs and HCs are represented as Safety Task intentional elements in the SR model.',
      substeps: []
    },
    'Logical Placement': {
      title: 'Logical Placement',
      description:
        'Place safety tasks within the boundary of the actor responsible for the control action or safety-critical state.',
      substeps: []
    },
    'ID Mapping': {
      title: 'ID Mapping',
      description:
        'Label each safety task with its corresponding UCA/HC ID (e.g., UCA-01, HC-01) for traceability.',
      substeps: []
    },
    'Functional Connection': {
      title: 'Functional Connection',
      description:
        'Prepare safety tasks for linking to actor responsibilities in subsequent substeps.',
      substeps: []
    },
    'IIP System Example (Step 7.1)': {
      title: 'IIP System Example (Step 7.1)',
      description: 'Example modeling for the Insulin Infusion Pump scenario.',
      substeps: [
        'UCA-01 through UCA-05 are added as Safety Tasks within the E1 - Patient (Human Controller) boundary.',
        'HC-01 (“Pump is misplaced”) is added as a Safety Task (or Hazard element) within the same boundary.'
      ]
    },
    '7.2 - Model Loss Scenarios as Hazard Elements': {
      title: '7.2 - Model Loss Scenarios as Hazard Elements',
      description:
        'Transform Loss Scenarios into explicit Hazard elements so the SR model captures how unsafe behavior emerges in context.',
      substeps: [
        'Treatment of Scenarios',
        'Modeling Construct (Step 7.2)',
        'Establishing Links (Step 7.2)',
        'Traceability (Step 7.2)',
        'IIP System Example (Step 7.2)'
      ]
    },
    'Treatment of Scenarios': {
      title: 'Treatment of Scenarios',
      description:
        'Loss Scenarios are treated as “hazard causes” that trigger an Unsafe Control Action (UCA) or Hazardous Condition (HC).',
      substeps: []
    },
    'Modeling Construct (Step 7.2)': {
      title: 'Modeling Construct (Step 7.2)',
      description:
        'Each scenario is modeled as a Hazard element (typically shown as a red, jagged, or distinctively colored bubble) in the SR model.',
      substeps: []
    },
    'Establishing Links (Step 7.2)': {
      title: 'Establishing Links (Step 7.2)',
      description:
        'Every modeled Loss Scenario is explicitly linked to the specific UCA or HC it contributes to.',
      substeps: []
    },
    'Traceability (Step 7.2)': {
      title: 'Traceability (Step 7.2)',
      description:
        'Maintains a rigorous paper trail from high-level accidents down to the causal trigger in the model.',
      substeps: []
    },
    'IIP System Example (Step 7.2)': {
      title: 'IIP System Example (Step 7.2)',
      description:
        'The model becomes the bridge between unsafe behavior and environmental triggers in the Insulin Infusion Pump case.',
      substeps: [
        'The Chain of Logic: For “Program insulin dosage,” model LS-01 (patient forgets to program dose after meal) and LS-02 (system fails to issue reminder).',
        'Visual Association: LS-01 and LS-02 appear as Hazard elements that point directly to UCA-01 (“Patient does not provide dosage”).',
        'Identifying Gaps: This makes it visually obvious why Responsibility R-01 is at risk of being obstructed.'
      ]
    },
    '7.3 - Link UCAs/HCs to Responsibility': {
      title: '7.3 - Link UCAs/HCs to Responsibility',
      description:
        'Connect unsafe behaviors back to the safety responsibilities they jeopardize within the SR model.',
      substeps: [
        'Mechanism (Step 7.3)',
        'Logic (Step 7.3)',
        'Traceability (Step 7.3)',
        'IIP System Example (Step 7.3)'
      ]
    },
    'Mechanism (Step 7.3)': {
      title: 'Mechanism (Step 7.3)',
      description:
        'Use the iStar4Safety “Obstructs” link to connect a UCA/HC (Safety Task) to the Responsibility (Safety Goal) it endangers.',
      substeps: []
    },
    'Logic (Step 7.3)': {
      title: 'Logic (Step 7.3)',
      description:
        'The link shows how unsafe control actions or hazardous conditions prevent an actor from fulfilling safety-critical duties.',
      substeps: []
    },
    'Traceability (Step 7.3)': {
      title: 'Traceability (Step 7.3)',
      description:
        'Captures the refinement of safety constraints by pinpointing exactly where responsibilities are obstructed.',
      substeps: []
    },
    'IIP System Example (Step 7.3)': {
      title: 'IIP System Example (Step 7.3)',
      description:
        '“Obstructs” links for the E1 - Patient (Human Controller) responsibilities.',
      substeps: [
        'UCA-01 (Patient does not provide dosage) → R-01 (Ensure configured settings correspond to prescription).',
        'UCA-02 (Dosage higher than prescribed) → R-01 (Ensure configured settings correspond to prescription).',
        'UCA-03 (Dosage lower than prescribed) → R-01 (Ensure configured settings correspond to prescription).',
        'UCA-04 (Dosage provided too late) → R-01 (Ensure configured settings correspond to prescription).',
        'UCA-05 (Dosage provided too early) → R-01 (Ensure configured settings correspond to prescription).',
        'HC-01 (Pump misplaced/inaccessible) → R-01 (Ensure configured settings correspond to prescription).'
      ]
    },
    '7.4 - Model Safety Requirements as Safety Tasks': {
      title: '7.4 - Model Safety Requirements as Safety Tasks',
      description:
        'Integrate Safety Requirements into the SR model as Safety Task elements to complete the safety logic.',
      substeps: [
        'Orientation for Step 7.4',
        'Modeling Construct (Step 7.4)',
        'Mitigation Logic (Step 7.4)',
        'OR Relationship (Step 7.4)',
        'Labeling for Traceability (Step 7.4)',
        'IIP System Example (Step 7.4)',
        'Full Safety Reasoning Structure (Step 7.4)'
      ]
    },
    'Orientation for Step 7.4': {
      title: 'Orientation for Step 7.4',
      description:
        'Add each Safety Requirement (SR) derived in Step 6 as a Safety Task in the SR model.',
      substeps: []
    },
    'Modeling Construct (Step 7.4)': {
      title: 'Modeling Construct (Step 7.4)',
      description:
        'Safety requirements are represented as Safety Task elements in iStar4Safety.',
      substeps: []
    },
    'Mitigation Logic (Step 7.4)': {
      title: 'Mitigation Logic (Step 7.4)',
      description:
        'Each Safety Task must be explicitly linked to the Loss Scenarios (LS) it mitigates.',
      substeps: []
    },
    'OR Relationship (Step 7.4)': {
      title: 'OR Relationship (Step 7.4)',
      description:
        'When multiple SRs address the same LS, connect them with an OR relationship to show any one is sufficient.',
      substeps: []
    },
    'Labeling for Traceability (Step 7.4)': {
      title: 'Labeling for Traceability (Step 7.4)',
      description:
        'Label each SR with its unique ID (e.g., SR-01, SR-02) and keep detailed descriptions in documentation or tool fields.',
      substeps: []
    },
    'IIP System Example (Step 7.4)': {
      title: 'IIP System Example (Step 7.4)',
      description:
        'Defensive safety layer modeling for the Insulin Infusion Pump case study.',
      substeps: [
        'LS-01 and LS-02 both point to UCA-01 (Action not provided).',
        'SR-01: System shall generate an alert if insulin is not programmed within 15 minutes after a meal is detected (mitigates LS-01).',
        'SR-02: Interface must maintain a visible warning if no insulin programming is detected post-meal (mitigates LS-02).',
        'SR-01 and SR-02 are linked to LS-01 and LS-02 Hazard elements, completing traceability back to UCA-01.'
      ]
    },
    'Full Safety Reasoning Structure (Step 7.4)': {
      title: 'Full Safety Reasoning Structure (Step 7.4)',
      description:
        'A safety element is complete only when the full logic chain is present.',
      substeps: [
        'Safety Goal: The Responsibility (e.g., R-01).',
        'Obstruction: The UCA/HC that hinders the Responsibility (e.g., UCA-01).',
        'Cause: The Loss Scenario that triggers the UCA (e.g., LS-01).',
        'Mitigation: The Safety Task that addresses the LS (e.g., SR-01).'
      ]
    },
    '7.5 - Collapse Actor Boundaries for SD Model': {
      title: '7.5 - Collapse Actor Boundaries for SD Model',
      description:
        'Summarize the system’s social and strategic interactions by collapsing SR internals into a high-level SD view.',
      substeps: [
        'Orientation for Step 7.5',
        'Boundary Collapsing (Step 7.5)',
        'External View (Step 7.5)',
        'Exclusion of Safety Elements (Step 7.5)',
        'Logic (Step 7.5)',
        'Refinement (Step 7.5)',
        'Why Behind Step 7.5',
        'Model View Comparison (Step 7.5)'
      ]
    },
    'Orientation for Step 7.5': {
      title: 'Orientation for Step 7.5',
      description:
        'Provide a clean, high-level summary of social and strategic interactions without internal safety reasoning details.',
      substeps: []
    },
    'Boundary Collapsing (Step 7.5)': {
      title: 'Boundary Collapsing (Step 7.5)',
      description:
        'Hide or collapse the internal actor boundaries that were expanded in Step 7.1.',
      substeps: []
    },
    'External View (Step 7.5)': {
      title: 'External View (Step 7.5)',
      description:
        'Show only actors and dependencies (Goals, Tasks, Resources) between them.',
      substeps: []
    },
    'Exclusion of Safety Elements (Step 7.5)': {
      title: 'Exclusion of Safety Elements (Step 7.5)',
      description:
        'Do not include UCAs, Loss Scenarios, or Safety Requirements in the SD model.',
      substeps: []
    },
    'Logic (Step 7.5)': {
      title: 'Logic (Step 7.5)',
      description:
        'Safety elements require the full Goal → Hazard → Mitigation reasoning chain, which is too complex for the SD view.',
      substeps: []
    },
    'Refinement (Step 7.5)': {
      title: 'Refinement (Step 7.5)',
      description:
        'Reflect any new actors or updated dependencies discovered during the SR analysis.',
      substeps: []
    },
    'Why Behind Step 7.5': {
      title: 'Why Behind Step 7.5',
      description:
        'The collapsed SD model answers “Who is responsible for what?” for stakeholders without deep causal chains.',
      substeps: []
    },
    'Model View Comparison (Step 7.5)': {
      title: 'Model View Comparison (Step 7.5)',
      description:
        'Compare SR vs SD views after collapsing actor boundaries.',
      substeps: [
        'SR (Step 7.6) — Expanded: Internal goals, UCAs, HCs, Loss Scenarios, SRs → Detailed safety logic and traceability.',
        'SD (Step 7.5) — Collapsed: Only external dependencies (Goals, Tasks, Resources) → High-level social and strategic overview.'
      ]
    },
    '7.6 - Expand Actor Boundaries for SR Model': {
      title: '7.6 - Expand Actor Boundaries for SR Model',
      description:
        'Expand actor boundaries to expose the full internal safety reasoning and traceability structure.',
      substeps: [
        'Objective (Step 7.6)',
        'Internal Reasoning Elements (Step 7.6)',
        'Traceability Visualization (Step 7.6)',
        'Safety Element Classification (Step 7.6)',
        'IIP System Example (Step 7.6)',
        'Final Consistency Check (Step 7.7)'
      ]
    },
    'Objective (Step 7.6)': {
      title: 'Objective (Step 7.6)',
      description:
        'Show the internal reasoning and safety logic that governs how each actor fulfills responsibilities while mitigating hazards.',
      substeps: []
    },
    'Internal Reasoning Elements (Step 7.6)': {
      title: 'Internal Reasoning Elements (Step 7.6)',
      description:
        'Expanded boundaries reveal goals, hazards (UCAs/HCs), and safety tasks that mitigate them.',
      substeps: []
    },
    'Traceability Visualization (Step 7.6)': {
      title: 'Traceability Visualization (Step 7.6)',
      description:
        'Enables tracing safety requirements back through loss scenarios and UCAs to the safety goals they protect.',
      substeps: []
    },
    'Safety Element Classification (Step 7.6)': {
      title: 'Safety Element Classification (Step 7.6)',
      description:
        'An element is only part of the safety analysis if the full Safety Goal → Hazard (Obstruction) → Mitigation Task chain is visible.',
      substeps: []
    },
    'IIP System Example (Step 7.6)': {
      title: 'IIP System Example (Step 7.6)',
      description:
        'Expanded E1 - Patient boundary with full internal safety logic in the Insulin Infusion Pump case.',
      substeps: [
        'Goals & Responsibilities: Main goal “Use the IIP”; Responsibility R-01 (Ensure correct settings).',
        'Obstructions (Hazards): UCA-01 to UCA-05 and HC-01 linked to R-01 via “Obstructs”.',
        'Causal Triggers: Loss Scenarios LS-01 through LS-11 modeled as hazard elements triggering the UCAs/HCs.',
        'Mitigation (Requirements): Safety Requirements SR-01 through SR-10 modeled as safety tasks linked to the loss scenarios they resolve.'
      ]
    },
    'Final Consistency Check (Step 7.7)': {
      title: 'Final Consistency Check (Step 7.7)',
      description:
        'After expanding boundaries, proceed to Step 7.7 to verify models are aligned, well-formed, and consistent.',
      substeps: []
    },
    '7.7 - Verify All Models': {
      title: '7.7 - Verify All Models',
      description:
        'Perform a final quality check to ensure SD and SR models are aligned and logically consistent.',
      substeps: [
        'Orientation for Step 7.7',
        'Core Objectives (Step 7.7)',
        'Verification Criteria (Step 7.7)',
        'Final Output of the Iteration (Step 7.7)'
      ]
    },
    'Orientation for Step 7.7': {
      title: 'Orientation for Step 7.7',
      description:
        'Review SD and SR models to confirm they are aligned, well-formed, and reflect safety analysis outcomes.',
      substeps: []
    },
    'Core Objectives (Step 7.7)': {
      title: 'Core Objectives (Step 7.7)',
      description: 'Key checks for the final model verification.',
      substeps: [
        'Consistency Check: Ensure expanded SR safety logic aligns with SD social dependencies.',
        'Correctness: Validate the proper use of Safety Goals, Safety Tasks, Hazards, and Obstructs links.',
        'Final Alignment: Confirm every UCA, HC, Loss Scenario, and Safety Requirement is represented and traceable.'
      ]
    },
    'Verification Criteria (Step 7.7)': {
      title: 'Verification Criteria (Step 7.7)',
      description: 'Conditions for models to be considered well-formed and consistent.',
      substeps: [
        'Full Safety Reasoning Structure: Safety Goal → Hazard (Obstruction) → Mitigation Task.',
        'Traceability Mapping: IDs for UCAs, HCs, LSs, and SRs are consistently labeled.',
        'Boundary Integrity: SR shows internal reasoning; SD shows collapsed boundaries at the right abstraction.'
      ]
    },
    'Final Output of the Iteration (Step 7.7)': {
      title: 'Final Output of the Iteration (Step 7.7)',
      description:
        'Decide whether to iterate or conclude after successful verification.',
      substeps: [
        'New Iteration: Restart from Step 1 if new features or components alter the context.',
        'Conclusion: If no further refinements are needed, finalize the Safety Analysis Document.'
      ]
    }
  };

  constructor() {
    this.refreshOpenProjects();
  }

  readonly pendingProjects = computed(() =>
    this.projects().filter((project) => {
      const status = project.status?.toLowerCase?.() ?? '';
      return status !== 'completed' && status !== 'cancelled' && status !== 'canceled' && status !== 'removed';
    })
  );

  readonly completedProjects = computed(() =>
    this.projects().filter((project) => {
      const status = project.status?.toLowerCase?.() ?? '';
      return status === 'completed' || status === 'cancelled' || status === 'canceled';
    })
  );

  createProject(): void {
    this.submitProject('empty');
  }

  createProjectWithAi(): void {
    this.submitProject('ai');
  }

  openTimelineStep(step: TimelineInfo): void {
    this.modalStack.set([]);
    const detail = this.substepDetails[step.title];
    this.selectedTimelineStep.set(detail ?? step);
  }

  closeTimelineModal(): void {
    const stack = this.modalStack();
    if (stack.length > 0) {
      const previous = stack[stack.length - 1];
      this.modalStack.set(stack.slice(0, -1));
      this.selectedTimelineStep.set(previous);
      return;
    }
    this.selectedTimelineStep.set(null);
  }

  closeTimelineModalFromBackdrop(): void {
    this.modalStack.set([]);
    this.selectedTimelineStep.set(null);
  }

  openSubstepDetail(label: string): void {
    const key = this.getSubstepTitle(label);
    const detail = this.substepDetails[key];
    if (!detail) {
      return;
    }
    const current = this.selectedTimelineStep();
    if (current) {
      this.modalStack.set([...this.modalStack(), current]);
    }
    this.selectedTimelineStep.set(detail);
  }

  hasSubstepDetail(label: string): boolean {
    const key = this.getSubstepTitle(label);
    return Boolean(this.substepDetails[key]);
  }

  getSubstepTitle(item: string): string {
    const raw = item.trim();
    const cleaned = raw
      .replace(/\s*\(Optional\)\s*$/, '')
      .replace(/\s*\(Evaluate Safety Conditions\)\s*$/, '')
      .trim();
    if (this.substepDetails[cleaned]) {
      return cleaned;
    }
    const [title] = cleaned.split(':');
    return title.trim();
  }

  getSubstepDisplayTitle(item: string): string {
    const [title] = item.split(':');
    return title.trim();
  }

  getSubstepDescription(item: string): string {
    const parts = item.split(':');
    if (parts.length < 2) {
      return '';
    }
    return parts.slice(1).join(':').trim();
  }

  shouldShowSubstepIndex(): boolean {
    const step = this.selectedTimelineStep();
    if (!step) {
      return false;
    }
    if (step.id) {
      return true;
    }
    return (
      step.title.startsWith('1.1 -') ||
      step.title.startsWith('1.2 -') ||
      step.title.startsWith('2.2 -') ||
      step.title.startsWith('3.1 -') ||
      step.title.startsWith('3.2 -') ||
      step.title.startsWith('4.1 -') ||
      step.title.startsWith('4.8 -') ||
      step.title.startsWith('5.1 -') ||
      step.title.startsWith('5.2 -') ||
      step.title.startsWith('6.1 -') ||
      step.title.startsWith('6.2 -') ||
      step.title.startsWith('6.3 -') ||
      step.title.startsWith('7.1 -') ||
      step.title.startsWith('7.2 -') ||
      step.title.startsWith('7.3 -') ||
      step.title.startsWith('7.4 -') ||
      step.title.startsWith('7.5 -') ||
      step.title.startsWith('7.6 -') ||
      step.title.startsWith('7.7 -') ||
      step.title.startsWith('Step 1:') ||
      step.title.startsWith('Step 2:') ||
      step.title.startsWith('Step 3:') ||
      step.title.startsWith('Step 4:') ||
      step.title.startsWith('1. Necessity Analysis') ||
      step.title.startsWith('2. Construction of the Strategic Reasoning') ||
      step.title.startsWith('3. Application of Validation Rules') ||
      step.title.startsWith('4. Tool Support')
    );
  }

  isDeepDetailModal(): boolean {
    const step = this.selectedTimelineStep();
    if (!step || step.id) {
      return false;
    }
    const title = step.title.trim();
    return (
      /^\d+\.\d+\.\d+/.test(title) ||
      title.startsWith('2.1 -') ||
      title.startsWith('3.3 -') ||
      title.startsWith('3.4 -') ||
      title.startsWith('3.5 -') ||
      title.startsWith('3.6 -') ||
      title.startsWith('3.7 -') ||
      title.startsWith('3.8 -') ||
      title.startsWith('4.2 -') ||
      title.startsWith('4.3 -') ||
      title.startsWith('4.4 -') ||
      title.startsWith('4.5 -') ||
      title === 'Ensuring Traceability' ||
      title === 'Defining the Cause' ||
      title === 'Structural Reasoning' ||
      title === 'IIP System Example' ||
      title === 'Core Objectives' ||
      title === 'The Structured Reasoning Path' ||
      title === 'Special Considerations: Responsibilities Without UCAs' ||
      title === 'Output' ||
      title.startsWith('Yes: Model HCs') ||
      title.startsWith('No: Conclude the UCA identification subprocess') ||
      title === 'Tracing HCs to Hazards' ||
      title === 'Review UCA Table' ||
      title === 'Review Additional Hazardous Conditions Table' ||
      title === 'Derive Safe Operating Conditions' ||
      title === 'Traceability and Purpose' ||
      title === 'Specify Required Controller Behavior' ||
      title === 'Specify Prohibited Controller Behavior' ||
      title === 'Establish Traceability Links' ||
      title === 'Update the Controller Constraints List' ||
      title === 'Example: IIP System Controller Constraints Table' ||
      title === 'Access Source Artifacts' ||
      title === 'Individual Item Evaluation' ||
      title === 'Establish the Reasoning Anchor' ||
      title === 'Illustrative Example: IIP System Selection' ||
      title === 'Investigate Causal Paths' ||
      title === 'Identify Contributing Factors' ||
      title === 'Register Unique Scenarios' ||
      title === 'Document and Maintain Traceability' ||
      title === 'Illustrative Example (IIP System)' ||
      title === 'Core Objectives (Step 6.3)' ||
      title === 'Analyze LS Causal Factors' ||
      title === 'Formulate Mitigation Strategies' ||
      title === 'Register Safety Requirements' ||
      title === 'Establish Traceability Links (Step 6.3)' ||
      title === 'Illustrative Example: IIP System (Step 6.3)' ||
      title === 'Prerequisites' ||
      title === 'Objective' ||
      title === 'Substep Details (Workflow Logic)' ||
      title === 'Illustrative Example: IIP System' ||
      title === 'Orientation for Step 7.1' ||
      title === 'Modeling Construct' ||
      title === 'Logical Placement' ||
      title === 'ID Mapping' ||
      title === 'Functional Connection' ||
      title === 'IIP System Example (Step 7.1)' ||
      title === 'Treatment of Scenarios' ||
      title === 'Modeling Construct (Step 7.2)' ||
      title === 'Establishing Links (Step 7.2)' ||
      title === 'Traceability (Step 7.2)' ||
      title === 'IIP System Example (Step 7.2)' ||
      title === 'Mechanism (Step 7.3)' ||
      title === 'Logic (Step 7.3)' ||
      title === 'Traceability (Step 7.3)' ||
      title === 'IIP System Example (Step 7.3)' ||
      title === 'Orientation for Step 7.4' ||
      title === 'Modeling Construct (Step 7.4)' ||
      title === 'Mitigation Logic (Step 7.4)' ||
      title === 'OR Relationship (Step 7.4)' ||
      title === 'Labeling for Traceability (Step 7.4)' ||
      title === 'IIP System Example (Step 7.4)' ||
      title === 'Full Safety Reasoning Structure (Step 7.4)' ||
      title === 'Orientation for Step 7.5' ||
      title === 'Boundary Collapsing (Step 7.5)' ||
      title === 'External View (Step 7.5)' ||
      title === 'Exclusion of Safety Elements (Step 7.5)' ||
      title === 'Logic (Step 7.5)' ||
      title === 'Refinement (Step 7.5)' ||
      title === 'Why Behind Step 7.5' ||
      title === 'Model View Comparison (Step 7.5)' ||
      title === 'Objective (Step 7.6)' ||
      title === 'Internal Reasoning Elements (Step 7.6)' ||
      title === 'Traceability Visualization (Step 7.6)' ||
      title === 'Safety Element Classification (Step 7.6)' ||
      title === 'IIP System Example (Step 7.6)' ||
      title === 'Final Consistency Check (Step 7.7)' ||
      title === 'Orientation for Step 7.7' ||
      title === 'Core Objectives (Step 7.7)' ||
      title === 'Verification Criteria (Step 7.7)' ||
      title === 'Final Output of the Iteration (Step 7.7)' ||
      title === 'Define Impact Levels' ||
      title === 'Step A: Define Safety Goals (<<SafetyGoal>>)' ||
      title === 'Step B: Identify Hazards (<<Hazard>>)' ||
      title === 'Step C: Refine Hazard Causes' ||
      title === 'Step A: Define Safety Tasks (<<SafetyTask>>)' ||
      title === 'Step B: Identify Safety Resources (<<SafetyResource>>)' ||
      title === 'Connection Constraints' ||
      title === 'Hierarchy Constraints' ||
      title === 'Mitigation Requirement' ||
      title === 'Responsibility Assignment' ||
      title === '4. Tool Support'
    );
  }

  getDetailLabel(item: string): string {
    const index = item.indexOf(':');
    if (index === -1) {
      return '';
    }
    return item.slice(0, index + 1).trim();
  }

  getDetailText(item: string): string {
    const index = item.indexOf(':');
    if (index === -1) {
      return item;
    }
    return item.slice(index + 1).trim();
  }

  private submitProject(prefill: 'empty' | 'ai'): void {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const raw = this.projectForm.getRawValue();
    const name = (raw.name ?? '').trim();
    const domain = (raw.domain ?? '').trim();
    const owner = (raw.owner ?? '').trim();
    const description = (raw.description ?? '').trim();

    if (!name) {
      this.projectForm.controls.name.setErrors({ required: true });
      this.projectForm.controls.name.markAsTouched();
      return;
    }

    const payload: {
      name: string;
      currentStep: number;
      domain?: string;
      owner?: string;
      description?: string;
    } = { name, currentStep: 1 };

    if (domain) payload.domain = domain;
    if (owner) payload.owner = owner;
    if (description) payload.description = description;

    this.projectService
      .createMinimal(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (createdProject) => {
          this.projectForm.reset();
          this.refreshOpenProjects();
          const queryParams: Record<string, string | number> = { prefill };
          if (createdProject?.id) {
            queryParams['projectId'] = createdProject.id;
          }
          this.router.navigate(['/scope'], { queryParams });
        },
        error: (error) => {
          console.error('Failed to create project via POST /api/projects/minimal-project-creation', error);
        }
      });
  }

  private refreshOpenProjects(): void {
    this.projectService
      .listOpenResumes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const mapped = (items ?? []).map((project) => this.toHomeProject(project));
          this.projects.set(mapped);
        },
        error: (error) => {
          console.error('Failed to load open projects from /api/project-resume', error);
          this.projects.set([]);
        }
      });
  }

  updateStatus(
    projectId: number | undefined,
    status: 'PENDING' | 'COMPLETED' | 'CANCELED' | 'CANCELLED' | 'REOPENED' | 'REMOVED'
  ): void {
    if (!projectId) {
      return;
    }

    this.projectService
      .updateMinimalStatus({ id: projectId, status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshOpenProjects();
        },
        error: (error) => {
          console.error('Failed to update project status via POST /api/projects/minimal-project-update', error);
        }
      });
  }

  removeProject(projectId: number | undefined): void {
    if (!projectId) {
      return;
    }

    this.updateStatus(projectId, 'REMOVED');
  }

  startProject(project: HomeProject): void {
    if (!project.id) {
      return;
    }

    const step = project.currentStep ?? 1;
    this.router.navigate([this.routeForStep(step)], {
      queryParams: { projectId: project.id }
    });
  }

  continueProject(project: HomeProject): void {
    if (!project.id) {
      return;
    }

    const step = project.currentStep ?? 1;
    this.router.navigate([this.routeForStep(step)], {
      queryParams: { projectId: project.id }
    });
  }

  private routeForStep(step: number): string {
    const mapping: Record<number, string> = {
      1: '/scope',
      2: '/istar-models',
      3: '/control-structure',
      4: '/ucas',
      5: '/controller-constraints',
      6: '/loss-scenarios',
      7: '/model-update'
    };

    return mapping[step] ?? '/';
  }

  private deriveNextStep(
    status: 'pending' | 'in-progress' | 'completed' | 'canceled' | 'cancelled' | 'removed',
    currentStep: number | undefined
  ): string {
    if (status === 'pending') {
      return 'Kick-off Step 1 · Define SCS Scope';
    }

    if (status === 'canceled' || status === 'cancelled' || status === 'removed') {
      return 'Canceled project (no next step)';
    }

    if (status === 'in-progress') {
      const step = currentStep && currentStep >= 1 && currentStep <= 7 ? currentStep : 1;
      const labels: Record<number, string> = {
        1: 'Scope Definition',
        2: 'iStar4Safety Models',
        3: 'Control Structure',
        4: 'Unsafe Control Actions',
        5: 'Controller Constraints',
        6: 'Loss Scenarios & Safety Requirements',
        7: 'Update iStar4Safety Models'
      };
      return `Resume Step ${step} · ${labels[step]}`;
    }

    if (status === 'completed') {
      return 'Archive evidence & publish traceability report';
    }

    return 'Next activity to be defined';
  }

  private deriveStep(
    status: 'pending' | 'in-progress' | 'completed' | 'canceled' | 'cancelled' | 'removed',
    currentStep: number | undefined
  ): number | undefined {
    if (status === 'pending') {
      return 1;
    }

    if (status === 'canceled' || status === 'cancelled' || status === 'removed') {
      return undefined;
    }

    if (status === 'in-progress') {
      return currentStep && currentStep >= 1 && currentStep <= 7 ? currentStep : 1;
    }

    if (status === 'completed') {
      return 7;
    }

    return currentStep;
  }

  private toHomeProject(project: Project): HomeProject {
    const rawStatus = project.status ?? 'PENDING';
    const status = rawStatus.toLowerCase();
    const step =
      typeof project.currentStep === 'number' && project.currentStep >= 1 && project.currentStep <= 7
        ? project.currentStep
        : status === 'pending'
          ? 1
          : undefined;

    const derivedStatus = (['pending', 'in-progress', 'completed', 'canceled', 'cancelled', 'removed'].includes(status)
      ? status
      : status === 'reopened'
        ? 'in-progress'
        : 'pending') as
      | 'pending'
      | 'in-progress'
      | 'completed'
      | 'canceled'
      | 'cancelled'
      | 'removed';

    return {
      id: project.id,
      name: project.name,
      domain: project.domain ?? undefined,
      owner: project.owner ?? undefined,
      description: project.description ?? undefined,
      status: rawStatus,
      currentStep: step,
      nextStep: this.deriveNextStep(derivedStatus, step)
    };
  }
}
