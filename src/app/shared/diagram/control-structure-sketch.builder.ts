/**
 * Builds a standalone SVG of the Step 3 control-structure "sketch" from the saved Step 3 payload.
 *
 * The geometry mirrors the live sketch rendered by the Control Structure page so the document
 * artifact embeds the same hierarchical layout (controllers on top, controlled processes below,
 * control actions flowing downward and feedback flowing upward). Styles are inlined so the SVG can
 * be rasterized to a PNG outside of the Angular component.
 */

type SketchKind = 'controller' | 'shared' | 'process' | 'external';

interface SketchEntity {
  id: string;
  name: string;
  roles: string[];
}

interface SketchControlActionInput {
  id: string;
  ref: string;
  action: string;
  sourceController: string;
  targetProcess: string;
}

interface SketchOptionalElementInput {
  id: string;
  type: string;
  name: string;
  source: string;
  destination: string;
}

interface SketchNode {
  id: string;
  label: string;
  kind: SketchKind;
  tier: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

interface SketchNodeDraft {
  id: string;
  label: string;
  kind: SketchKind;
  tier: number;
  side?: 'left' | 'right';
  relatedLabels?: string[];
}

interface SketchTierBand {
  id: string;
  label: string;
  kind: 'controller' | 'shared' | 'process';
  y: number;
  height: number;
}

interface SketchEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  kind: 'control' | 'feedback' | 'optional';
}

interface SketchEdgeGeometry {
  id: string;
  label: string;
  path: string;
  labelX: number;
  labelY: number;
  marker: string;
  kind: 'control' | 'feedback' | 'optional';
}

export interface SketchSvgResult {
  svg: string;
  width: number;
  height: number;
}

const CANVAS_WIDTH = 1320;

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

function normalizeRole(rawRole: unknown): string | null {
  if (typeof rawRole !== 'string') {
    return null;
  }
  const value = rawRole.trim().toLowerCase();
  if (value === 'controller') {
    return 'Controller';
  }
  if (value === 'controlled process' || value === 'controlledprocess' || value === 'controlled-process') {
    return 'Controlled Process';
  }
  if (value === 'passive entity' || value === 'passiveentity' || value === 'passive-entity') {
    return 'Passive Entity';
  }
  if (value.startsWith('dependency')) {
    return 'Dependency/Restriction';
  }
  return rawRole.trim();
}

function readRoles(record: Record<string, unknown>): string[] {
  const roles = record['roles'];
  const list = Array.isArray(roles) ? roles : [record['role']];
  const normalized = list
    .map((role) => normalizeRole(role))
    .filter((role): role is string => !!role);
  return Array.from(new Set(normalized));
}

function hasRole(entity: SketchEntity, role: string): boolean {
  return entity.roles.includes(role);
}

function uniqueNames(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item.trim());
  }
  return result;
}

interface NormalizedStepThree {
  entities: SketchEntity[];
  controlActions: SketchControlActionInput[];
  optionalElements: SketchOptionalElementInput[];
}

function normalizeStepThree(step3: Record<string, unknown> | null | undefined): NormalizedStepThree {
  const root = asRecord(step3) ?? {};
  const nested = asRecord(root['step3Information']) ?? root;

  const entityRecords = asArray(nested['entities']);
  const entities: SketchEntity[] = entityRecords
    .map((record) => ({
      id: readString(record, ['id']),
      name: readString(record, ['name', 'entityName', 'label']),
      roles: readRoles(record)
    }))
    .filter((entity) => entity.id || entity.name);

  const entityById = new Map(entities.filter((entity) => entity.id).map((entity) => [entity.id, entity] as const));

  const availableInputs = asRecord(nested['availableInputs']);
  const externalSourceRecords = asArray(
    nested['externalSources'] ?? (availableInputs ? availableInputs['externalSources'] : undefined)
  );
  const externalById = new Map(
    externalSourceRecords.map((record) => [readString(record, ['id']), readString(record, ['label', 'name'])] as const)
  );

  const resolveEntityName = (id: string): string => entityById.get(id)?.name ?? '';

  const controlActions: SketchControlActionInput[] = asArray(nested['controlActions']).map((record, index) => {
    const sourceController =
      readString(record, ['sourceController']) ||
      resolveEntityName(readString(record, ['sourceEntityId', 'source', 'sourceActor'])) ||
      readString(record, ['source', 'sourceActor']);
    const targetProcess =
      readString(record, ['targetProcess']) ||
      resolveEntityName(readString(record, ['targetEntityId', 'target', 'targetActor'])) ||
      readString(record, ['target', 'targetActor']);

    return {
      id: readString(record, ['id', 'ref']) || `control-${index + 1}`,
      ref: readString(record, ['ref', 'code', 'id']) || `CA-${index + 1}`,
      action: readString(record, ['action', 'controlAction', 'name']) || 'Control action',
      sourceController,
      targetProcess
    };
  });

  const resolveEndpoint = (record: Record<string, unknown>, kindKey: string, entityKey: string, externalKey: string, directKeys: string[]): string => {
    const direct = readString(record, directKeys);
    if (direct) {
      return direct;
    }
    const kind = readString(record, [kindKey]).toLowerCase();
    if (kind === 'external') {
      return externalById.get(readString(record, [externalKey])) || readString(record, [externalKey]);
    }
    return resolveEntityName(readString(record, [entityKey]));
  };

  const optionalRecords = asArray(nested['optionalElements'] ?? nested['feedbackLoops'] ?? nested['feedbacks']);
  const optionalElements: SketchOptionalElementInput[] = optionalRecords.map((record, index) => ({
    id: readString(record, ['id', 'ref']) || `optional-${index + 1}`,
    type: readString(record, ['type', 'elementType']) || 'Feedback',
    name: readString(record, ['name', 'feedback', 'action']) || 'Information',
    source: resolveEndpoint(record, 'sourceKind', 'sourceEntityId', 'sourceExternalId', ['source', 'sourceActor', 'from']),
    destination: resolveEndpoint(record, 'destinationKind', 'destinationEntityId', 'destinationExternalId', [
      'destination',
      'target',
      'targetActor',
      'to'
    ])
  }));

  return { entities, controlActions, optionalElements };
}

function wrapSketchLabel(label: string, maxLineLength: number, maxLines = 3): string[] {
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [label];
  }

  const lines: string[] = [];
  let currentLine = '';
  let wordIndex = 0;

  while (wordIndex < words.length) {
    const word = words[wordIndex];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxLineLength || !currentLine) {
      currentLine = candidate;
      wordIndex += 1;
      continue;
    }
    lines.push(currentLine);
    currentLine = '';
    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const remainingWords = currentLine ? [currentLine, ...words.slice(wordIndex)] : words.slice(wordIndex);
  if (remainingWords.length > 0) {
    let finalLine = remainingWords.join(' ');
    if (finalLine.length > maxLineLength) {
      finalLine = `${finalLine.slice(0, Math.max(0, maxLineLength - 3)).trimEnd()}...`;
    }
    lines.push(finalLine);
  }

  return lines.slice(0, maxLines);
}

function sketchKindRank(kind: SketchKind): number {
  switch (kind) {
    case 'controller':
      return 0;
    case 'shared':
      return 1;
    case 'process':
      return 2;
    case 'external':
      return 3;
  }
}

function layoutTierNodes(drafts: SketchNodeDraft[], y: number, minX: number, maxX: number): SketchNode[] {
  if (drafts.length === 0) {
    return [];
  }

  const nodes = drafts.map((draft) => {
    const lines = wrapSketchLabel(draft.label, draft.kind === 'process' ? 19 : 17);
    const width = draft.kind === 'process' ? 270 : draft.kind === 'shared' ? 260 : 245;
    const height = Math.max(draft.kind === 'shared' ? 102 : 92, 44 + lines.length * 20);
    return { ...draft, x: 0, y, width, height, lines } satisfies SketchNode;
  });

  const gap = 34;
  const totalWidth = nodes.reduce((sum, node) => sum + node.width, 0) + Math.max(0, nodes.length - 1) * gap;
  const availableWidth = maxX - minX;
  let cursorX = minX + Math.max(0, (availableWidth - totalWidth) / 2);

  return nodes.map((node) => {
    const positioned = { ...node, x: cursorX };
    cursorX += node.width + gap;
    return positioned;
  });
}

function buildExternalSketchNodeDrafts(
  optionalElements: SketchOptionalElementInput[],
  internalNodeByLabel: Map<string, SketchNode>
): SketchNodeDraft[] {
  const stats = new Map<
    string,
    { label: string; asSourceCount: number; asDestinationCount: number; relatedLabels: string[] }
  >();

  for (const element of optionalElements) {
    const sourceKey = element.source.trim().toLowerCase();
    const destinationKey = element.destination.trim().toLowerCase();
    const sourceIsInternal = internalNodeByLabel.has(sourceKey);
    const destinationIsInternal = internalNodeByLabel.has(destinationKey);

    if (!sourceIsInternal && sourceKey) {
      const entry = stats.get(sourceKey) ?? { label: element.source.trim(), asSourceCount: 0, asDestinationCount: 0, relatedLabels: [] };
      entry.asSourceCount += 1;
      if (destinationIsInternal) {
        entry.relatedLabels.push(element.destination.trim());
      }
      stats.set(sourceKey, entry);
    }

    if (!destinationIsInternal && destinationKey) {
      const entry = stats.get(destinationKey) ?? { label: element.destination.trim(), asSourceCount: 0, asDestinationCount: 0, relatedLabels: [] };
      entry.asDestinationCount += 1;
      if (sourceIsInternal) {
        entry.relatedLabels.push(element.source.trim());
      }
      stats.set(destinationKey, entry);
    }
  }

  return Array.from(stats.entries()).map(([, value], index) => {
    const side: 'left' | 'right' = value.asSourceCount >= value.asDestinationCount ? 'left' : 'right';
    const relatedTiers = uniqueNames(value.relatedLabels)
      .map((label) => internalNodeByLabel.get(label.toLowerCase())?.tier)
      .filter((tier): tier is number => typeof tier === 'number');
    const tier =
      relatedTiers.length > 0 ? Math.round(relatedTiers.reduce((sum, item) => sum + item, 0) / relatedTiers.length) : index;

    return {
      id: `external-${index + 1}`,
      label: value.label,
      kind: 'external' as const,
      tier,
      side,
      relatedLabels: uniqueNames(value.relatedLabels)
    };
  });
}

function layoutExternalNodes(
  drafts: SketchNodeDraft[],
  side: 'left' | 'right',
  internalNodeByLabel: Map<string, SketchNode>
): SketchNode[] {
  if (drafts.length === 0) {
    return [];
  }

  const orderedDrafts = [...drafts].sort((left, right) => {
    if (left.tier !== right.tier) {
      return left.tier - right.tier;
    }
    return left.label.localeCompare(right.label);
  });

  const x = side === 'left' ? 32 : CANVAS_WIDTH - 232;
  let cursorY = 112;

  return orderedDrafts.map((draft) => {
    const lines = wrapSketchLabel(draft.label, 16);
    const width = 200;
    const height = Math.max(86, 42 + lines.length * 18);
    const relatedNodes = (draft.relatedLabels ?? [])
      .map((label) => internalNodeByLabel.get(label.toLowerCase()))
      .filter((node): node is SketchNode => !!node);
    const preferredY =
      relatedNodes.length > 0
        ? relatedNodes.reduce((sum, node) => sum + node.y + node.height / 2, 0) / relatedNodes.length - height / 2
        : cursorY;
    const y = Math.max(cursorY, preferredY);
    cursorY = y + height + 26;

    return { id: draft.id, label: draft.label, kind: 'external', tier: draft.tier, x, y, width, height, lines };
  });
}

function buildSketchNodes(data: NormalizedStepThree): SketchNode[] {
  const relevantEntities = data.entities.filter(
    (entity) => hasRole(entity, 'Controller') || hasRole(entity, 'Controlled Process') || hasRole(entity, 'Passive Entity')
  );

  if (relevantEntities.length === 0) {
    return [];
  }

  const entityByKey = new Map(relevantEntities.map((entity) => [entity.name.trim().toLowerCase(), entity]));
  const incomingControlSources = new Map<string, string[]>();

  for (const action of data.controlActions) {
    const sourceKey = action.sourceController.trim().toLowerCase();
    const targetKey = action.targetProcess.trim().toLowerCase();
    if (!entityByKey.has(sourceKey) || !entityByKey.has(targetKey)) {
      continue;
    }
    const currentSources = incomingControlSources.get(targetKey) ?? [];
    if (!currentSources.includes(sourceKey)) {
      currentSources.push(sourceKey);
      incomingControlSources.set(targetKey, currentSources);
    }
  }

  const tierCache = new Map<string, number>();
  const resolveTier = (entityKey: string, stack = new Set<string>()): number => {
    if (tierCache.has(entityKey)) {
      return tierCache.get(entityKey) ?? 0;
    }
    if (stack.has(entityKey)) {
      return 0;
    }
    stack.add(entityKey);
    const incoming = (incomingControlSources.get(entityKey) ?? []).filter((sourceKey) => {
      const sourceEntity = entityByKey.get(sourceKey);
      return !!sourceEntity && hasRole(sourceEntity, 'Controller');
    });
    const tier = incoming.length === 0 ? 0 : 1 + Math.max(...incoming.map((sourceKey) => resolveTier(sourceKey, new Set(stack))));
    stack.delete(entityKey);
    tierCache.set(entityKey, tier);
    return tier;
  };

  const internalDrafts: SketchNodeDraft[] = relevantEntities.map((entity) => {
    const entityKey = entity.name.trim().toLowerCase();
    const isController = hasRole(entity, 'Controller');
    const isProcess = hasRole(entity, 'Controlled Process') || hasRole(entity, 'Passive Entity');
    const kind: SketchKind = isController && isProcess ? 'shared' : isController ? 'controller' : 'process';

    let tier = 0;
    if (kind === 'controller' || kind === 'shared') {
      tier = resolveTier(entityKey);
    } else {
      const incoming = incomingControlSources.get(entityKey) ?? [];
      tier = incoming.length > 0 ? Math.max(...incoming.map((sourceKey) => resolveTier(sourceKey))) + 1 : 1;
    }

    return { id: entity.id || entity.name, label: entity.name, kind, tier };
  });

  const uniqueTiers = Array.from(new Set(internalDrafts.map((item) => item.tier))).sort((a, b) => a - b);
  const yByTier = new Map(uniqueTiers.map((tier, index) => [tier, 96 + index * 160]));

  const internalNodes = uniqueTiers.flatMap((tier) => {
    const tierDrafts = internalDrafts
      .filter((item) => item.tier === tier)
      .sort((left, right) => {
        const kindDiff = sketchKindRank(left.kind) - sketchKindRank(right.kind);
        return kindDiff !== 0 ? kindDiff : left.label.localeCompare(right.label);
      });
    return layoutTierNodes(tierDrafts, yByTier.get(tier) ?? 96, 200, 1060);
  });

  const internalNodeByLabel = new Map(internalNodes.map((node) => [node.label.trim().toLowerCase(), node]));
  const externalDrafts = buildExternalSketchNodeDrafts(data.optionalElements, internalNodeByLabel);
  const leftExternalDrafts = externalDrafts.filter((item) => item.side === 'left');
  const rightExternalDrafts = externalDrafts.filter((item) => item.side !== 'left');

  const externalNodes = [
    ...layoutExternalNodes(leftExternalDrafts, 'left', internalNodeByLabel),
    ...layoutExternalNodes(rightExternalDrafts, 'right', internalNodeByLabel)
  ];

  return [...internalNodes, ...externalNodes];
}

function buildSketchTierBands(nodes: SketchNode[]): SketchTierBand[] {
  const internalNodes = nodes.filter((node) => node.kind !== 'external');
  const tiers = Array.from(new Set(internalNodes.map((node) => node.tier))).sort((a, b) => a - b);

  return tiers.map((tier) => {
    const tierNodes = internalNodes.filter((node) => node.tier === tier);
    const y = Math.min(...tierNodes.map((node) => node.y)) - 28;
    const height = Math.max(...tierNodes.map((node) => node.y + node.height)) - y + 28;
    const kind: SketchTierBand['kind'] = tierNodes.some((node) => node.kind === 'shared')
      ? 'shared'
      : tierNodes.some((node) => node.kind === 'process')
        ? 'process'
        : 'controller';

    return { id: `tier-${tier}`, label: describeSketchTier(kind, tier, tiers.length), kind, y, height };
  });
}

function describeSketchTier(kind: SketchTierBand['kind'], tier: number, totalTiers: number): string {
  if (kind === 'shared') {
    return 'Controller / controlled process';
  }
  if (kind === 'process') {
    return totalTiers > 1 ? 'Controlled processes' : 'Controlled process';
  }
  return tier === 0 ? 'High-level controllers' : 'Supervisory controllers';
}

function findNodeByName(nodes: SketchNode[], label: string, preferredKinds: SketchKind[]): SketchNode | null {
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedLabel) {
    return null;
  }
  for (const kind of preferredKinds) {
    const node = nodes.find((candidate) => candidate.kind === kind && candidate.label.toLowerCase() === normalizedLabel);
    if (node) {
      return node;
    }
  }
  return null;
}

function buildSketchEdges(data: NormalizedStepThree, nodes: SketchNode[]): SketchEdge[] {
  const edges: SketchEdge[] = [];

  for (const action of data.controlActions) {
    const source = findNodeByName(nodes, action.sourceController, ['controller', 'shared']);
    const destination = findNodeByName(nodes, action.targetProcess, ['shared', 'process']);
    if (!source || !destination) {
      continue;
    }
    edges.push({ id: `control-${action.id}`, fromId: source.id, toId: destination.id, label: `${action.ref}: ${action.action}`, kind: 'control' });
  }

  for (const element of data.optionalElements) {
    const isFeedback = element.type === 'Feedback' || element.type === 'Sensor';
    const sourceKinds: SketchKind[] = isFeedback
      ? ['process', 'shared', 'external', 'controller']
      : ['controller', 'shared', 'process', 'external'];
    const destinationKinds: SketchKind[] = isFeedback
      ? ['shared', 'controller', 'process', 'external']
      : ['shared', 'process', 'controller', 'external'];

    const source = findNodeByName(nodes, element.source, sourceKinds);
    const destination = findNodeByName(nodes, element.destination, destinationKinds);
    if (!source || !destination) {
      continue;
    }
    edges.push({
      id: `optional-${element.id}`,
      fromId: source.id,
      toId: destination.id,
      label: `${element.type}: ${element.name}`,
      kind: isFeedback ? 'feedback' : 'optional'
    });
  }

  return edges;
}

function buildSketchEdgeGeometries(nodes: SketchNode[], edges: SketchEdge[]): SketchEdgeGeometry[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const samePathOffsetCount = new Map<string, number>();

  return edges
    .map((edge) => {
      const source = nodeMap.get(edge.fromId);
      const destination = nodeMap.get(edge.toId);
      if (!source || !destination) {
        return null;
      }

      const pairKey = `${edge.fromId}->${edge.toId}:${edge.kind}`;
      const pairIndex = samePathOffsetCount.get(pairKey) ?? 0;
      samePathOffsetCount.set(pairKey, pairIndex + 1);

      const lateralOffset =
        edge.kind === 'control' ? -26 - pairIndex * 10 : edge.kind === 'feedback' ? 26 + pairIndex * 10 : pairIndex * 12;

      const verticalRelation =
        destination.y > source.y + source.height ? 'down' : destination.y + destination.height < source.y ? 'up' : 'same';

      let path = '';
      let labelX = 0;
      let labelY = 0;

      if (verticalRelation === 'down') {
        const startX = source.x + source.width / 2 + lateralOffset;
        const startY = source.y + source.height;
        const endX = destination.x + destination.width / 2 + lateralOffset;
        const endY = destination.y;
        const midY = (startY + endY) / 2;
        path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        labelX = startX === endX ? startX + 44 : (startX + endX) / 2;
        labelY = midY - 10;
      } else if (verticalRelation === 'up') {
        const startX = source.x + source.width / 2 + lateralOffset;
        const startY = source.y;
        const endX = destination.x + destination.width / 2 + lateralOffset;
        const endY = destination.y + destination.height;
        const midY = (startY + endY) / 2;
        path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        labelX = startX === endX ? startX + 44 : (startX + endX) / 2;
        labelY = midY - 12;
      } else {
        const destinationIsRight = destination.x >= source.x;
        const startX = destinationIsRight ? source.x + source.width : source.x;
        const endX = destinationIsRight ? destination.x : destination.x + destination.width;
        const startY = source.y + source.height / 2 + (edge.kind === 'feedback' ? -12 : 12);
        const endY = destination.y + destination.height / 2 + (edge.kind === 'feedback' ? -12 : 12);
        const direction = destinationIsRight ? 1 : -1;
        const bendY = Math.min(startY, endY) - 36 - pairIndex * 14;
        const entryOffset = 26 * direction;
        path = `M ${startX} ${startY} L ${startX + entryOffset} ${startY} L ${startX + entryOffset} ${bendY} L ${endX - entryOffset} ${bendY} L ${endX - entryOffset} ${endY} L ${endX} ${endY}`;
        labelX = (startX + endX) / 2;
        labelY = bendY - 8;
      }

      const marker = edge.kind === 'control' ? 'url(#arrow-control)' : edge.kind === 'feedback' ? 'url(#arrow-feedback)' : 'url(#arrow-optional)';

      return { id: edge.id, label: edge.label, path, labelX, labelY, marker, kind: edge.kind } satisfies SketchEdgeGeometry;
    })
    .filter((item): item is SketchEdgeGeometry => !!item);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tierBandStyle(kind: SketchTierBand['kind']): string {
  if (kind === 'shared') {
    return 'fill="rgba(254,243,199,0.42)" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="10 8"';
  }
  if (kind === 'process') {
    return 'fill="rgba(238,242,255,0.44)" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 8"';
  }
  return 'fill="rgba(248,250,252,0.88)" stroke="#dbe3ee" stroke-width="1.5" stroke-dasharray="10 8"';
}

function nodeStyle(kind: SketchKind): string {
  if (kind === 'shared') {
    return 'fill="#fffbeb" stroke="#b45309" stroke-width="2.2" stroke-dasharray="8 5"';
  }
  if (kind === 'controller') {
    return 'fill="#f8fafc" stroke="#0f172a" stroke-width="2.2"';
  }
  if (kind === 'external') {
    return 'fill="#ecfeff" stroke="#0891b2" stroke-width="2.2"';
  }
  return 'fill="#eef2ff" stroke="#0f172a" stroke-width="2.2"';
}

function edgeStyle(kind: SketchEdgeGeometry['kind']): string {
  if (kind === 'feedback') {
    return 'stroke="#475569" stroke-width="2.4" stroke-dasharray="8 7"';
  }
  if (kind === 'optional') {
    return 'stroke="#0ea5e9" stroke-width="2.2" stroke-dasharray="4 5"';
  }
  return 'stroke="#0f172a" stroke-width="3"';
}

function serializeSketchSvg(
  nodes: SketchNode[],
  bands: SketchTierBand[],
  edges: SketchEdgeGeometry[],
  width: number,
  height: number
): string {
  const hasExternal = nodes.some((node) => node.kind === 'external');
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`
  );
  parts.push(
    '<defs>' +
      '<marker id="arrow-control" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a"></path></marker>' +
      '<marker id="arrow-feedback" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"></path></marker>' +
      '<marker id="arrow-optional" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9"></path></marker>' +
      '<filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0f172a" flood-opacity="0.12"></feDropShadow></filter>' +
      '</defs>'
  );

  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`);

  for (const band of bands) {
    parts.push(
      `<g><rect x="72" y="${band.y}" width="1088" height="${band.height}" rx="18" ry="18" ${tierBandStyle(band.kind)}></rect>` +
        `<text x="100" y="${band.y + 28}" fill="#334155" font-size="15" font-weight="700">${escapeXml(band.label)}</text></g>`
    );
  }

  if (hasExternal) {
    parts.push('<text x="1035" y="70" fill="#0369a1" font-size="15" font-weight="700">External context / other inputs</text>');
  }

  for (const edge of edges) {
    parts.push(
      `<g><path d="${edge.path}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${edgeStyle(edge.kind)} marker-end="${edge.marker}"></path>` +
        `<text x="${edge.labelX}" y="${edge.labelY}" fill="#0f172a" font-size="12" font-weight="600" text-anchor="middle" paint-order="stroke" stroke="rgba(255,255,255,0.92)" stroke-width="7" stroke-linejoin="round">${escapeXml(edge.label)}</text></g>`
    );
  }

  for (const node of nodes) {
    const centerX = node.x + node.width / 2;
    const baseY = node.y + node.height / 2 - (node.lines.length - 1) * 9 + (node.kind === 'shared' ? 10 : 0);
    const tspans = node.lines
      .map((line, index) => `<tspan x="${centerX}" dy="${index === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`)
      .join('');
    const roleHint =
      node.kind === 'shared'
        ? `<text x="${centerX}" y="${node.y + 18}" fill="#92400e" font-size="11" font-weight="700" letter-spacing="0.9" text-anchor="middle">CONTROLLER / PROCESS</text>`
        : '';

    parts.push(
      `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10" ry="10" filter="url(#soft-shadow)" ${nodeStyle(node.kind)}></rect>` +
        roleHint +
        `<text x="${centerX}" y="${baseY}" fill="#0f172a" font-size="15" font-weight="600" text-anchor="middle">${tspans}</text></g>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Returns a standalone SVG (plus pixel dimensions) for the Step 3 control-structure sketch,
 * or `null` when the payload lacks enough controller/process data to render one.
 */
export function buildControlStructureSketchSvg(step3: Record<string, unknown> | null | undefined): SketchSvgResult | null {
  const data = normalizeStepThree(step3);
  const nodes = buildSketchNodes(data);

  const hasControllerSide = nodes.some((node) => node.kind === 'controller' || node.kind === 'shared');
  const hasProcessSide = nodes.some((node) => node.kind === 'process' || node.kind === 'shared');
  if (!hasControllerSide || !hasProcessSide) {
    return null;
  }

  const bands = buildSketchTierBands(nodes);
  const edges = buildSketchEdgeGeometries(nodes, buildSketchEdges(data, nodes));

  const lowestPoint = Math.max(
    nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0),
    bands.reduce((max, band) => Math.max(max, band.y + band.height), 0),
    560
  );
  const height = lowestPoint + 80;

  return {
    svg: serializeSketchSvg(nodes, bands, edges, CANVAS_WIDTH, height),
    width: CANVAS_WIDTH,
    height
  };
}
