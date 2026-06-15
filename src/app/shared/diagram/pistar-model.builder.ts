/**
 * Converts the backend Step 2 payload (iStar4Safety information DTO) into a piStar-loadable
 * model JSON. This mirrors the conversion performed by the Step 2 editor
 * (`buildPistarModelFromForms`) so the saved model can be re-rendered with the real
 * iStar4Safety engine outside of the editor page (e.g. for document artifact diagrams).
 */

interface PistarNode {
  id: string;
  text: string;
  type: string;
  x: number;
  y: number;
  customProperties?: Record<string, unknown>;
  nodes?: PistarNode[];
  source?: string;
  target?: string;
}

interface PistarLink {
  id: string;
  type: string;
  source: string;
  target: string;
  label?: string;
}

export interface PistarModel {
  actors: PistarNode[];
  dependencies: PistarNode[];
  links: PistarLink[];
  display: Record<string, unknown>;
  tool: string;
  istar: string;
  saveDate: string;
  diagram: {
    width: number;
    height: number;
    name: string;
    customProperties?: Record<string, unknown>;
  };
}

export interface PistarBuildResult {
  model: PistarModel;
  actorCount: number;
  nodeCount: number;
}

const SAFETY_ELEMENT_TYPES = new Set(['SafetyGoal', 'Hazard', 'SafetyTask', 'SafetyResource']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => !!asRecord(item));
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : typeof item === 'number' ? String(item) : ''))
    .filter((item) => item.length > 0);
}

function coordinate(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPistarType(rawType: string, prefixFallback = 'Goal'): string {
  const type = rawType.trim() || prefixFallback;
  return type.startsWith('istar.') ? type : `istar.${type}`;
}

function mapActorType(rawType: string): string {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === 'role' || normalized === 'istar.role') {
    return 'istar.Role';
  }
  if (normalized === 'agent' || normalized === 'istar.agent') {
    return 'istar.Agent';
  }
  return 'istar.Actor';
}

/**
 * Extracts the Step 2 information block from a variety of payload shapes
 * (`step2Istar`, `step2Information`, or a bare information object).
 */
function resolveStepTwoInformation(step2: Record<string, unknown> | null | undefined): {
  modelName: string;
  actors: Record<string, unknown>[];
  dependencies: Record<string, unknown>[];
} | null {
  const root = asRecord(step2);
  if (!root) {
    return null;
  }

  const nested = asRecord(root['step2Information']) ?? asRecord(root['information']) ?? root;
  const actors = asArray(nested['actors']);
  if (actors.length === 0) {
    return null;
  }

  const dependencies = asArray(nested['dependencies']);
  const modelName = readString(nested, ['modelName', 'name', 'title']) || 'iStar4Safety Model';
  return { modelName, actors, dependencies };
}

export function buildPistarModelFromStepTwoPayload(
  step2: Record<string, unknown> | null | undefined
): PistarBuildResult | null {
  const information = resolveStepTwoInformation(step2);
  if (!information) {
    return null;
  }

  const actorIds = new Set<string>();
  const validEndpointIds = new Set<string>();
  const pistarActors: PistarNode[] = [];
  const links: PistarLink[] = [];

  information.actors.forEach((actor, actorIndex) => {
    const actorId = readString(actor, ['id']);
    if (!actorId) {
      return;
    }

    actorIds.add(actorId);
    validEndpointIds.add(actorId);

    const elements = asArray(actor['intentionalElements']);
    const nodes: PistarNode[] = elements
      .map((element, elementIndex): PistarNode | null => {
        const elementId = readString(element, ['id']);
        if (!elementId) {
          return null;
        }
        validEndpointIds.add(elementId);

        const rawType = readString(element, ['type']) || 'Goal';
        const isSafety = SAFETY_ELEMENT_TYPES.has(rawType);

        return {
          id: elementId,
          text: readString(element, ['name', 'text', 'label']) || elementId,
          type: toPistarType(rawType),
          x: coordinate(element['x'], 80 + actorIndex * 300),
          y: coordinate(element['y'], 120 + elementIndex * 90),
          customProperties: {
            safetyType: isSafety ? rawType : null,
            accidentLevel: element['accidentLevel'] ?? null,
            safetyGoalKind: element['safetyGoalKind'] ?? null
          }
        };
      })
      .filter((node): node is PistarNode => node !== null);

    pistarActors.push({
      id: actorId,
      text: readString(actor, ['name', 'text', 'label']) || actorId,
      type: mapActorType(readString(actor, ['type'])),
      x: coordinate(actor['x'], 40 + actorIndex * 320),
      y: coordinate(actor['y'], 20),
      customProperties: {},
      nodes
    });

    for (const targetActorId of readStringArray(actor, 'isA')) {
      links.push({
        id: `isa-${actorId}-${targetActorId}`,
        type: 'istar.IsALink',
        source: actorId,
        target: targetActorId
      });
    }

    for (const targetActorId of readStringArray(actor, 'participatesIn')) {
      links.push({
        id: `participates-${actorId}-${targetActorId}`,
        type: 'istar.ParticipatesInLink',
        source: actorId,
        target: targetActorId
      });
    }

    const internalLinks = asRecord(actor['internalLinks']);
    if (internalLinks) {
      for (const refinement of asArray(internalLinks['refinements'])) {
        const parent = readString(refinement, ['parent', 'target']);
        const refinementId = readString(refinement, ['id']) || `refinement-${parent}`;
        const refinementType =
          readString(refinement, ['type']).toUpperCase() === 'OR'
            ? 'istar.OrRefinementLink'
            : 'istar.AndRefinementLink';
        for (const child of readStringArray(refinement, 'children')) {
          links.push({
            id: `${refinementId}-${child}`,
            type: refinementType,
            source: child,
            target: parent
          });
        }
      }

      for (const contribution of asArray(internalLinks['contributions'])) {
        const source = readString(contribution, ['source']);
        const target = readString(contribution, ['target']);
        if (!source || !target) {
          continue;
        }
        links.push({
          id: readString(contribution, ['id']) || `contribution-${source}-${target}`,
          type: 'istar.ContributionLink',
          source,
          target,
          label: (readString(contribution, ['metric']) || 'help').toLowerCase()
        });
      }

      for (const neededBy of asArray(internalLinks['neededBy'])) {
        const source = readString(neededBy, ['source']);
        const target = readString(neededBy, ['target']);
        if (!source || !target) {
          continue;
        }
        links.push({
          id: readString(neededBy, ['id']) || `needed-by-${source}-${target}`,
          type: 'istar.NeededByLink',
          source,
          target
        });
      }
    }
  });

  const dependencies: PistarNode[] = [];
  information.dependencies.forEach((dependency, index) => {
    const dependencyId = readString(dependency, ['id']) || `dependency-${index + 1}`;
    const dependum = asRecord(dependency['dependum']) ?? {};

    const dependerElement = readString(dependency, ['dependerElement']);
    const dependeeElement = readString(dependency, ['dependeeElement']);
    const sourceId = dependerElement || readString(dependency, ['depender', 'dependerActorId', 'fromActor']);
    const targetId = dependeeElement || readString(dependency, ['dependee', 'dependeeActorId', 'toActor']);

    if (!sourceId || !targetId || !validEndpointIds.has(sourceId) || !validEndpointIds.has(targetId)) {
      return;
    }

    links.push(
      { id: `${dependencyId}-in`, type: 'istar.DependencyLink', source: sourceId, target: dependencyId },
      { id: `${dependencyId}-out`, type: 'istar.DependencyLink', source: dependencyId, target: targetId }
    );

    dependencies.push({
      id: dependencyId,
      text: readString(dependum, ['name', 'text']) || readString(dependency, ['goal']) || 'Dependum',
      type: toPistarType(readString(dependum, ['type']) || readString(dependency, ['dependumType']) || 'Goal'),
      x: coordinate(dependency['x'], 180 + index * 180),
      y: coordinate(dependency['y'], 520),
      customProperties: {},
      source: sourceId,
      target: targetId
    });
  });

  // Drop links whose endpoints are not present in the model, so the piStar importer does not reject it.
  const dependencyIds = new Set(dependencies.map((dependency) => dependency.id));
  const sanitizedLinks = links.filter(
    (link) =>
      (validEndpointIds.has(link.source) || dependencyIds.has(link.source)) &&
      (validEndpointIds.has(link.target) || dependencyIds.has(link.target))
  );

  const nodeCount = pistarActors.reduce((total, actor) => total + (actor.nodes?.length ?? 0), 0);

  return {
    model: {
      actors: pistarActors,
      dependencies,
      links: sanitizedLinks,
      display: {},
      tool: 'pistar.2.1.0',
      istar: '2.0',
      saveDate: new Date().toUTCString(),
      diagram: {
        width: 2000,
        height: 1200,
        name: information.modelName,
        customProperties: {
          Description: 'Rendered from saved Step 2 iStar4Safety information'
        }
      }
    },
    actorCount: pistarActors.length,
    nodeCount
  };
}
