import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';

import { ProjectService } from '../../services/project.service';

interface ArtifactDocumentSection {
  key: string;
  title: string;
  description: string;
  fileBaseName: string;
  markdown: string;
}

type RenderLineKind = 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'paragraph' | 'blank';

interface RenderLine {
  kind: RenderLineKind;
  text: string;
}

interface Step1Resource {
  id: number;
  name: string;
  category: string;
  reference: string;
  sourceType: string;
}

interface Step1SystemComponent {
  id: number;
  name: string;
  description: string;
}

interface Step1Accident {
  id: number;
  code: string;
  description: string;
}

interface Step1Hazard {
  id: number;
  code: string;
  description: string;
  linkedAccidents: string[];
}

interface Step1SafetyConstraint {
  id: number;
  code: string;
  statement: string;
  linkedHazards: string[];
}

interface Step1ComponentResponsibility {
  id: number;
  component: string;
  responsibility: string;
  linkedConstraints: string[];
}

interface Step1ScopeData {
  lastUpdatedBy: string;
  objectives: string;
  systemDefinition: string;
  systemBoundary: string;
  assumptions: string;
  outOfScope: string;
  resources: Step1Resource[];
  systemComponents: Step1SystemComponent[];
  accidents: Step1Accident[];
  hazards: Step1Hazard[];
  safetyConstraints: Step1SafetyConstraint[];
  componentResponsibilities: Step1ComponentResponsibility[];
}

interface Step2Data {
  actors: Record<string, unknown>[];
  goalLinks: Record<string, unknown>[];
}

interface Step3Data {
  entities: Record<string, unknown>[];
  controlActions: Record<string, unknown>[];
  feedbackLoops: Record<string, unknown>[];
}

interface Step4Data {
  ucas: Record<string, unknown>[];
  hazardousConditions: Record<string, unknown>[];
}

interface Step5Data {
  constraints: Record<string, unknown>[];
}

interface Step6Data {
  lossScenarios: Record<string, unknown>[];
  safetyRequirements: Record<string, unknown>[];
}

interface Step7Data {
  modelChanges: Record<string, unknown>[];
  validationTasks: Record<string, unknown>[];
  integrationNotes: string;
}

interface FullProjectDocumentPayload {
  project?: Record<string, unknown> | null;
  step1Scope?: Record<string, unknown> | null;
  step2Istar?: Record<string, unknown> | null;
  step3ControlStructure?: Record<string, unknown> | null;
  step4Ucas?: Record<string, unknown> | null;
  step5ControllerConstraints?: Record<string, unknown> | null;
  step6LossScenarios?: Record<string, unknown> | null;
  step7ModelUpdate?: Record<string, unknown> | null;
}

@Component({
  selector: 'app-resafety-artifacts-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resafety-artifacts-page.component.html',
  styleUrl: './resafety-artifacts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResafetyArtifactsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentProjectId = signal<number | null>(null);
  readonly projectPayload = signal<Record<string, unknown> | null>(null);
  readonly projectName = signal('project');
  readonly isLoading = signal(false);
  readonly isExporting = signal(false);
  readonly exportingKey = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly artifactSections = computed<ArtifactDocumentSection[]>(() => {
    const payload = this.projectPayload();
    const projectId = this.currentProjectId();

    if (!payload || !projectId) {
      return [];
    }

    const projectSlug = this.sanitizeFileName(this.projectName() || `project-${projectId}`);
    return this.buildArtifactSections(payload, projectSlug);
  });

  readonly payloadPreview = computed(() => {
    const payload = this.projectPayload();
    return payload ? JSON.stringify(payload, null, 2) : '';
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((params) => {
          const projectIdParam = params.get('projectId');
          const parsedProjectId = projectIdParam ? Number(projectIdParam) : null;
          return parsedProjectId && !Number.isNaN(parsedProjectId) ? parsedProjectId : null;
        }),
        tap((projectId) => {
          this.currentProjectId.set(projectId);
          this.errorMessage.set(null);
          this.projectPayload.set(null);
          this.projectName.set(projectId ? `project-${projectId}` : 'project');
        }),
        switchMap((projectId) => {
          if (!projectId) {
            return of(null);
          }

          this.isLoading.set(true);

          return this.projectService.getFullProjectInformation(projectId).pipe(
            tap((payload) => {
              this.projectPayload.set(payload);
              this.projectName.set(this.extractProjectName(payload, projectId));
            }),
            catchError((error) => {
              console.error(`Failed to load full project payload from GET /api/projects/${projectId}/full`, error);
              this.errorMessage.set(
                'Failed to load the full project information from /api/projects/{id}/full. Verify that the backend exposes this endpoint.'
              );
              return of(null);
            }),
            tap(() => this.isLoading.set(false))
          );
        })
      )
      .subscribe({
        next: (payload) => {
          if (!this.currentProjectId()) {
            this.errorMessage.set('Open this page with a valid projectId query parameter to generate ReSafety document exports.');
          }

          if (!payload && this.currentProjectId() && !this.errorMessage()) {
            this.errorMessage.set('The backend returned no project payload for this project.');
          }

          if (!this.currentProjectId()) {
            this.isLoading.set(false);
          }
        }
      });
  }

  async downloadPdf(section: ArtifactDocumentSection): Promise<void> {
    await this.runExport(`${section.key}-pdf`, async () => {
      const module = await import('jspdf');
      const { jsPDF } = module;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const lineHeight = 15;
      let y = margin;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(section.title, margin, y);
      y += 24;

      const renderedLines = this.renderMarkdownToLines(section.markdown);

      for (const renderedLine of renderedLines) {
        if (renderedLine.kind === 'blank') {
          y += lineHeight * 0.5;
          continue;
        }

        const style = this.getPdfLineStyle(renderedLine.kind);
        const indent = renderedLine.kind === 'bullet' || renderedLine.kind === 'numbered' ? 16 : 0;
        const content = renderedLine.kind === 'bullet' ? `• ${renderedLine.text}` : renderedLine.text;
        const wrappedLines = doc.splitTextToSize(content, pageWidth - margin * 2 - indent) as string[];

        doc.setFont('helvetica', style.bold ? 'bold' : 'normal');
        doc.setFontSize(style.size);

        for (const wrappedLine of wrappedLines) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(wrappedLine, margin + indent, y);
          y += style.lineHeight;
        }

        y += style.afterSpacing;
      }

      doc.save(`${section.fileBaseName}.pdf`);
    });
  }

  async downloadDocx(section: ArtifactDocumentSection): Promise<void> {
    await this.runExport(`${section.key}-docx`, async () => {
      if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        throw new Error('DOCX export is only available in the browser runtime.');
      }

      const [{ marked }, docxModule] = await Promise.all([import('marked'), import('docx')]);
      const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } =
        docxModule;
      const htmlContent = await marked.parse(section.markdown);
      const parser = new DOMParser();
      const htmlDocument = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
      const container = htmlDocument.body.firstElementChild;
      const children = this.buildDocxChildrenFromHtml(
        container,
        {
          AlignmentType,
          HeadingLevel,
          Paragraph,
          Table,
          TableCell,
          TableRow,
          TextRun,
          WidthType
        }
      );

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  right: 1440,
                  bottom: 1440,
                  left: 1440
                }
              }
            },
            children: children as any
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      this.saveBlob(blob, `${section.fileBaseName}.docx`);
    });
  }

  private buildDocxChildrenFromHtml(
    container: Element | null,
    docx: any
  ): any[] {
    if (!container) {
      return [this.createDocxParagraph(docx, 'No content available.', 'paragraph')];
    }

    const blocks: unknown[] = [];
    const elements = Array.from(container.children);

    for (const element of elements) {
      const tag = element.tagName.toLowerCase();

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const text = element.textContent?.trim() ?? '';
        const kind = tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3';
        blocks.push(this.createDocxParagraph(docx, text, kind));
        continue;
      }

      if (tag === 'p') {
        blocks.push(this.createDocxParagraph(docx, element.textContent?.trim() ?? '', 'paragraph'));
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const listItems = Array.from(element.querySelectorAll(':scope > li'));
        listItems.forEach((item, index) => {
          const itemText = item.textContent?.trim() ?? '';
          if (tag === 'ul') {
            blocks.push(this.createDocxParagraph(docx, itemText, 'bullet'));
          } else {
            blocks.push(this.createDocxParagraph(docx, `${index + 1}. ${itemText}`, 'numbered'));
          }
        });
        continue;
      }

      if (tag === 'table') {
        const rows = Array.from(element.querySelectorAll('tr'));
        const tableRows = rows.map((row, rowIndex) => {
          const cells = Array.from(row.children).map((cell) =>
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [
                    new docx.TextRun({
                      text: cell.textContent?.trim() ?? '',
                      bold: rowIndex === 0,
                      size: 22,
                      font: 'Arial',
                      color: rowIndex === 0 ? '2F2A24' : '333333'
                    })
                  ],
                  spacing: { before: 20, after: 20 }
                })
              ],
              shading: rowIndex === 0 ? { fill: 'EFE7DD' } : undefined,
              margins: { top: 90, bottom: 90, left: 110, right: 110 }
            })
          );

          return new docx.TableRow({ children: cells });
        });

        blocks.push(
          new docx.Table({
            width: { size: 100, type: docx.WidthType['PERCENTAGE'] },
            rows: tableRows,
            margins: { top: 40, bottom: 120, left: 0, right: 0 }
          })
        );
        continue;
      }

      blocks.push(this.createDocxParagraph(docx, element.textContent?.trim() ?? '', 'paragraph'));
    }

    return blocks;
  }

  private createDocxParagraph(
    docx: any,
    text: string,
    kind: 'h1' | 'h2' | 'h3' | 'paragraph' | 'bullet' | 'numbered'
  ): any {
    const safeText = text || ' ';

    if (kind === 'h1') {
      return new docx.Paragraph({
        heading: docx.HeadingLevel['HEADING_1'],
        children: [new docx.TextRun({ text: safeText, bold: true, size: 42, font: 'Arial', color: '2E241A' })],
        spacing: { before: 120, after: 260 },
        border: {
          bottom: { color: 'C6B8A6', space: 1, size: 6 }
        }
      });
    }

    if (kind === 'h2') {
      return new docx.Paragraph({
        heading: docx.HeadingLevel['HEADING_2'],
        children: [new docx.TextRun({ text: safeText, bold: true, size: 30, font: 'Arial', color: '2F2A24' })],
        spacing: { before: 260, after: 140 },
        shading: { fill: 'EFE7DD' },
        indent: { left: 90, right: 90 }
      });
    }

    if (kind === 'h3') {
      return new docx.Paragraph({
        heading: docx.HeadingLevel['HEADING_3'],
        children: [new docx.TextRun({ text: safeText, bold: true, size: 25, font: 'Arial', color: '3F372F' })],
        spacing: { before: 180, after: 80 }
      });
    }

    if (kind === 'bullet') {
      return new docx.Paragraph({
        children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: '333333' })],
        bullet: { level: 0 },
        spacing: { before: 30, after: 50 }
      });
    }

    if (kind === 'numbered') {
      return new docx.Paragraph({
        children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: '333333' })],
        spacing: { before: 30, after: 50 },
        indent: { left: 180 },
        alignment: docx.AlignmentType['LEFT']
      });
    }

    return new docx.Paragraph({
      children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: '333333' })],
      spacing: { before: 30, after: 100 }
    });
  }

  private buildArtifactSections(payload: Record<string, unknown>, projectSlug: string): ArtifactDocumentSection[] {
    const fullPayload = payload as FullProjectDocumentPayload;
    const scope = fullPayload.step1Scope ?? null;
    const initialModels = fullPayload.step2Istar ?? null;
    const controlStructure = fullPayload.step3ControlStructure ?? null;
    const ucas = fullPayload.step4Ucas ?? null;
    const controllerConstraints = fullPayload.step5ControllerConstraints ?? null;
    const lossScenarios = fullPayload.step6LossScenarios ?? null;
    const finalModels = fullPayload.step7ModelUpdate ?? null;

    return [
      {
        key: '01-system-scope-safety-concerns',
        title: '1. System Scope and Safety Concerns',
        description: 'General concerns and safety concerns from the project scope data.',
        fileBaseName: `${projectSlug}-01-system-scope-safety-concerns`,
        markdown: this.buildScopeDocument(scope)
      },
      {
        key: '02-initial-istar4safety-models',
        title: '2. Initial iStar4Safety Models (SD and SR)',
        description: 'Initial strategic dependency and rationale model content.',
        fileBaseName: `${projectSlug}-02-initial-istar4safety-models`,
        markdown: this.buildInitialModelsDocument(initialModels)
      },
      {
        key: '03-system-safety-control-structure',
        title: '3. System Safety Control Structure',
        description: 'Controllers, controlled processes, and control actions.',
        fileBaseName: `${projectSlug}-03-system-safety-control-structure`,
        markdown: this.buildControlStructureDocument(controlStructure)
      },
      {
        key: '04-ucas-hcs-controller-constraints',
        title: '4. UCAs, HCs, and Controller Constraints',
        description: 'Unsafe control actions, hazardous conditions, and controller constraints.',
        fileBaseName: `${projectSlug}-04-ucas-hcs-controller-constraints`,
        markdown: this.buildUcaConstraintsDocument(ucas, controllerConstraints)
      },
      {
        key: '05-loss-scenarios-safety-requirements',
        title: '5. Loss Scenarios and Safety Requirements',
        description: 'Loss scenario analysis and resulting safety requirements.',
        fileBaseName: `${projectSlug}-05-loss-scenarios-safety-requirements`,
        markdown: this.buildLossScenariosDocument(lossScenarios)
      },
      {
        key: '06-final-istar4safety-models',
        title: '6. Final iStar4Safety Models (Iteration X)',
        description: 'Final SD and SR model updates with integrated safety logic.',
        fileBaseName: `${projectSlug}-06-final-istar4safety-models`,
        markdown: this.buildFinalModelsDocument(finalModels)
      }
    ];
  }

  private buildScopeDocument(scope: Record<string, unknown> | null): string {
    const step1 = this.normalizeStep1Data(scope);
    const objectivesList = this.buildNumberedTemplate(this.toListItems(step1.objectives), 3);
    const resourcesTable = this.buildMarkdownTable(
      ['Reference', 'Name', 'Category', 'Source Type'],
      step1.resources.map((resource) => [resource.reference, resource.name, resource.category, resource.sourceType]),
      'No resources informed.'
    );
    const componentsTable = this.buildMarkdownTable(
      ['ID', 'Component Name', 'Description'],
      step1.systemComponents.map((component) => [String(component.id), component.name, component.description]),
      'No components informed.'
    );
    const accidentsTable = this.buildMarkdownTable(
      ['Code', 'Description'],
      step1.accidents.map((accident) => [accident.code, accident.description]),
      'No accidents informed.'
    );
    const hazardsTable = this.buildMarkdownTable(
      ['Code', 'Description', 'Linked Accidents'],
      step1.hazards.map((hazard) => [hazard.code, hazard.description, this.joinCodes(hazard.linkedAccidents)]),
      'No hazards informed.'
    );
    const constraintsTable = this.buildMarkdownTable(
      ['Code', 'Statement', 'Linked Hazards'],
      step1.safetyConstraints.map((constraint) => [constraint.code, constraint.statement, this.joinCodes(constraint.linkedHazards)]),
      'No safety constraints informed.'
    );
    const responsibilitiesTable = this.buildMarkdownTable(
      ['Component', 'Responsibility', 'Addressed Constraints'],
      step1.componentResponsibilities.map((responsibility) => [
        responsibility.component,
        responsibility.responsibility,
        this.joinCodes(responsibility.linkedConstraints)
      ]),
      'No component responsibilities informed.'
    );

    return [
      '# MODELO DE DOCUMENTO - ETAPA 1',
      '',
      `Projeto: ${this.pickText(scope, ['projectName', 'name', 'title'], this.projectName())}`,
      `Document Last Updated By: ${step1.lastUpdatedBy}`,
      '',
      '## 1. Introducao',
      '',
      `- Breve visao geral do projeto: ${step1.systemDefinition}`,
      '',
      `- Delimitacao do sistema analisado: ${step1.systemBoundary}`,
      '',
      `- Premissas para a etapa: ${step1.assumptions}`,
      '',
      `- Fora do escopo: ${step1.outOfScope}`,
      '',
      '## 2. Objetivos Principais',
      objectivesList,
      '',
      '## 3. Mapa de Evidencias',
      '- Breve visao geral do material que sustenta as decisoes da Etapa 1.',
      '',
      '### Recursos de apoio',
      resourcesTable,
      '',
      '### Componentes do sistema',
      componentsTable,
      '',
      '### Perdas / acidentes do sistema',
      accidentsTable,
      '',
      '### Perigos identificados',
      hazardsTable,
      '',
      '### Restricoes de seguranca',
      constraintsTable,
      '',
      '### Responsabilidades por componente',
      responsibilitiesTable
    ].join('\n');
  }

  private normalizeStep1Data(scope: Record<string, unknown> | null): Step1ScopeData {
    const safeScope = scope ?? {};
    const resourcesRaw = this.pickFirstArray(safeScope, ['resources']) ?? [];
    const componentsRaw = this.pickFirstArray(safeScope, ['systemComponents', 'components']) ?? [];
    const accidentsRaw = this.pickFirstArray(safeScope, ['accidents', 'losses']) ?? [];
    const hazardsRaw = this.pickFirstArray(safeScope, ['hazards']) ?? [];
    const constraintsRaw = this.pickFirstArray(safeScope, ['safetyConstraints', 'constraints']) ?? [];
    const responsibilitiesRaw = this.pickFirstArray(safeScope, ['componentResponsibilities', 'responsibilities']) ?? [];

    return {
      lastUpdatedBy: this.pickText(scope, ['lastUpdatedBy'], 'Not informed in the endpoint payload.'),
      objectives: this.pickText(scope, ['objectives', 'analysisObjectives'], 'Not informed in the endpoint payload.'),
      systemDefinition: this.pickText(
        scope,
        ['generalSummary.systemDefinition', 'systemDefinition'],
        'Not informed in the endpoint payload.'
      ),
      systemBoundary: this.pickText(
        scope,
        ['generalSummary.systemBoundary', 'systemBoundary'],
        'Not informed in the endpoint payload.'
      ),
      assumptions: this.pickText(scope, ['assumptions'], 'Not informed in the endpoint payload.'),
      outOfScope: this.pickText(scope, ['outOfScope'], 'Not informed in the endpoint payload.'),
      resources: resourcesRaw.map((resource, index) => this.normalizeStep1Resource(resource, index)),
      systemComponents: componentsRaw.map((component, index) => this.normalizeStep1Component(component, index)),
      accidents: accidentsRaw.map((accident, index) => this.normalizeStep1Accident(accident, index)),
      hazards: hazardsRaw.map((hazard, index) => this.normalizeStep1Hazard(hazard, index)),
      safetyConstraints: constraintsRaw.map((constraint, index) => this.normalizeStep1Constraint(constraint, index)),
      componentResponsibilities: responsibilitiesRaw.map((responsibility, index) =>
        this.normalizeStep1Responsibility(responsibility, index)
      )
    };
  }

  private renderMarkdownToLines(markdown: string): RenderLine[] {
    const lines = markdown.split('\n');
    const rendered: RenderLine[] = [];

    let index = 0;
    while (index < lines.length) {
      const currentLine = lines[index].trim();

      if (!currentLine) {
        rendered.push({ kind: 'blank', text: '' });
        index += 1;
        continue;
      }

      if (currentLine.startsWith('|')) {
        const tableLines: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          tableLines.push(lines[index]);
          index += 1;
        }
        rendered.push(...this.renderMarkdownTable(tableLines));
        continue;
      }

      const headingMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        rendered.push({
          kind: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
          text
        });
        index += 1;
        continue;
      }

      const bulletMatch = currentLine.match(/^-\s+(.+)$/);
      if (bulletMatch) {
        rendered.push({ kind: 'bullet', text: bulletMatch[1].trim() });
        index += 1;
        continue;
      }

      const numberedMatch = currentLine.match(/^(\d+\.)\s+(.+)$/);
      if (numberedMatch) {
        rendered.push({ kind: 'numbered', text: `${numberedMatch[1]} ${numberedMatch[2].trim()}` });
        index += 1;
        continue;
      }

      rendered.push({ kind: 'paragraph', text: currentLine });
      index += 1;
    }

    return rendered;
  }

  private renderMarkdownTable(tableLines: string[]): RenderLine[] {
    if (!tableLines.length) {
      return [];
    }

    const rows = tableLines.map((line) => this.parseMarkdownTableRow(line));
    if (!rows.length) {
      return [];
    }

    const headers = rows[0];
    const hasSeparator =
      rows.length > 1 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
    const dataRows = rows.slice(hasSeparator ? 2 : 1);

    const rendered: RenderLine[] = [];
    rendered.push({ kind: 'h3', text: headers.join(' | ') });

    if (!dataRows.length) {
      rendered.push({ kind: 'paragraph', text: 'No entries informed.' });
      return rendered;
    }

    for (const row of dataRows) {
      const rowText = headers
        .map((header, idx) => `${header}: ${row[idx] && row[idx].trim() ? row[idx].trim() : '-'}`)
        .join(' | ');
      rendered.push({ kind: 'bullet', text: rowText });
    }

    return rendered;
  }

  private parseMarkdownTableRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.replace(/\\\|/g, '|').trim());
  }

  private getPdfLineStyle(kind: RenderLineKind): { size: number; bold: boolean; lineHeight: number; afterSpacing: number } {
    if (kind === 'h1') {
      return { size: 15, bold: true, lineHeight: 18, afterSpacing: 6 };
    }

    if (kind === 'h2') {
      return { size: 13, bold: true, lineHeight: 16, afterSpacing: 4 };
    }

    if (kind === 'h3') {
      return { size: 12, bold: true, lineHeight: 15, afterSpacing: 2 };
    }

    return { size: 11, bold: false, lineHeight: 14, afterSpacing: 1 };
  }

  private normalizeStep1Resource(resource: unknown, index: number): Step1Resource {
    const value = this.toObject(resource);
    return {
      id: this.toNumber(value['id'], index + 1),
      name: this.toText(value['name'], `Resource ${index + 1}`),
      category: this.toText(value['category'], '-'),
      reference: this.toText(value['reference'], '-'),
      sourceType: this.toText(value['sourceType'], 'manual')
    };
  }

  private normalizeStep1Component(component: unknown, index: number): Step1SystemComponent {
    const value = this.toObject(component);
    return {
      id: this.toNumber(value['id'], index + 1),
      name: this.toText(value['name'], `Component ${index + 1}`),
      description: this.toText(value['description'], '-')
    };
  }

  private normalizeStep1Accident(accident: unknown, index: number): Step1Accident {
    const value = this.toObject(accident);
    return {
      id: this.toNumber(value['id'], index + 1),
      code: this.toText(value['code'], `A-${index + 1}`),
      description: this.toText(value['description'], '-')
    };
  }

  private normalizeStep1Hazard(hazard: unknown, index: number): Step1Hazard {
    const value = this.toObject(hazard);
    return {
      id: this.toNumber(value['id'], index + 1),
      code: this.toText(value['code'], `H-${index + 1}`),
      description: this.toText(value['description'], '-'),
      linkedAccidents: this.toStringArray(value['linkedAccidents'])
    };
  }

  private normalizeStep1Constraint(constraint: unknown, index: number): Step1SafetyConstraint {
    const value = this.toObject(constraint);
    return {
      id: this.toNumber(value['id'], index + 1),
      code: this.toText(value['code'], `SC-${index + 1}`),
      statement: this.toText(value['statement'], this.toText(value['constraint'], '-')),
      linkedHazards: this.toStringArray(value['linkedHazards'])
    };
  }

  private normalizeStep1Responsibility(responsibility: unknown, index: number): Step1ComponentResponsibility {
    const value = this.toObject(responsibility);
    return {
      id: this.toNumber(value['id'], index + 1),
      component: this.toText(value['component'], this.toText(value['actor'], `Component ${index + 1}`)),
      responsibility: this.toText(value['responsibility'], '-'),
      linkedConstraints: this.toStringArray(value['linkedConstraints'])
    };
  }

  private buildMarkdownTable(headers: string[], rows: string[][], emptyMessage: string): string {
    const escapedHeaders = headers.map((header) => this.escapeMarkdownCell(header));
    const renderedRows = rows.length
      ? rows.map((row) => `| ${row.map((cell) => this.escapeMarkdownCell(cell)).join(' | ')} |`)
      : [`| ${this.escapeMarkdownCell(emptyMessage)} | ${headers.slice(1).map(() => '-').join(' | ')} |`];

    return [`| ${escapedHeaders.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...renderedRows].join('\n');
  }

  private escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  private joinCodes(values: string[]): string {
    return values.length ? values.join(', ') : '-';
  }

  private buildNumberedTemplate(items: string[], minRows: number): string {
    const placeholder = '________________________________________';
    const totalRows = Math.max(minRows, items.length || 1);
    const lines: string[] = [];

    for (let index = 0; index < totalRows; index += 1) {
      lines.push(`${index + 1}. ${items[index] ?? placeholder}`);
    }

    return lines.join('\n');
  }

  private toListItems(value: string): string[] {
    if (!value || value === 'Not informed in the endpoint payload.') {
      return [];
    }

    const byLinesAndSemicolons = value
      .replace(/\r/g, '\n')
      .split(/\n|;/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (byLinesAndSemicolons.length > 1) {
      return byLinesAndSemicolons;
    }

    return value
      .split(/\.\s+/)
      .map((part) => part.trim().replace(/\.$/, ''))
      .filter((part) => part.length > 0);
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private toText(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return fallback;
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => this.toText(entry, ''))
      .filter((entry) => entry.length > 0);
  }

  private toObjectArray(values: unknown[]): Record<string, unknown>[] {
    return values.map((value) => this.toObject(value));
  }

  private readObjectText(source: Record<string, unknown>, keys: string[], fallback = '-'): string {
    for (const key of keys) {
      const value = source[key];
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }

      if (Array.isArray(value)) {
        const flattened = value
          .map((entry) => this.toText(entry, ''))
          .filter((entry) => entry.length > 0)
          .join(', ');
        return flattened || fallback;
      }

      if (typeof value === 'object') {
        return this.stringifyValue(value);
      }
    }

    return fallback;
  }

  private normalizeStep2Data(step2: Record<string, unknown> | null): Step2Data {
    const safeStep2 = step2 ?? {};
    return {
      actors: this.toObjectArray(this.pickFirstArray(safeStep2, ['actors']) ?? []),
      goalLinks: this.toObjectArray(this.pickFirstArray(safeStep2, ['goalLinks', 'dependencies']) ?? [])
    };
  }

  private normalizeStep3Data(step3: Record<string, unknown> | null): Step3Data {
    const safeStep3 = step3 ?? {};
    return {
      entities: this.toObjectArray(this.pickFirstArray(safeStep3, ['entities', 'controllers', 'controlledProcesses']) ?? []),
      controlActions: this.toObjectArray(this.pickFirstArray(safeStep3, ['controlActions']) ?? []),
      feedbackLoops: this.toObjectArray(this.pickFirstArray(safeStep3, ['feedbackLoops', 'feedbacks']) ?? [])
    };
  }

  private normalizeStep4Data(step4: Record<string, unknown> | null): Step4Data {
    const safeStep4 = step4 ?? {};
    return {
      ucas: this.toObjectArray(this.pickFirstArray(safeStep4, ['ucas', 'unsafeControlActions']) ?? []),
      hazardousConditions: this.toObjectArray(this.pickFirstArray(safeStep4, ['hazardousConditions', 'hcs']) ?? [])
    };
  }

  private normalizeStep5Data(step5: Record<string, unknown> | null): Step5Data {
    const safeStep5 = step5 ?? {};
    return {
      constraints: this.toObjectArray(this.pickFirstArray(safeStep5, ['constraints', 'controllerConstraints']) ?? [])
    };
  }

  private normalizeStep6Data(step6: Record<string, unknown> | null): Step6Data {
    const safeStep6 = step6 ?? {};
    return {
      lossScenarios: this.toObjectArray(this.pickFirstArray(safeStep6, ['lossScenarios']) ?? []),
      safetyRequirements: this.toObjectArray(this.pickFirstArray(safeStep6, ['safetyRequirements']) ?? [])
    };
  }

  private normalizeStep7Data(step7: Record<string, unknown> | null): Step7Data {
    return {
      modelChanges: this.toObjectArray(this.pickFirstArray(step7 ?? {}, ['modelChanges']) ?? []),
      validationTasks: this.toObjectArray(this.pickFirstArray(step7 ?? {}, ['validationTasks']) ?? []),
      integrationNotes: this.pickText(step7, ['integrationNotes'], 'Not informed in the endpoint payload.')
    };
  }

  private buildInitialModelsDocument(initialModels: Record<string, unknown> | null): string {
    const step2 = this.normalizeStep2Data(initialModels);
    const actorsTable = this.buildMarkdownTable(
      ['ID', 'Actor', 'Type', 'Description', 'Responsibilities'],
      step2.actors.map((actor) => [
        this.readObjectText(actor, ['id']),
        this.readObjectText(actor, ['name', 'actorName', 'label']),
        this.readObjectText(actor, ['type', 'actorType']),
        this.readObjectText(actor, ['description', 'details']),
        this.readObjectText(actor, ['responsibilities', 'responsibilityRefs'])
      ]),
      'No actors informed.'
    );
    const goalLinksTable = this.buildMarkdownTable(
      ['ID', 'Source', 'Target', 'Link Type', 'Details'],
      step2.goalLinks.map((link) => [
        this.readObjectText(link, ['id', 'ref']),
        this.readObjectText(link, ['source', 'sourceActor', 'from']),
        this.readObjectText(link, ['target', 'targetActor', 'to']),
        this.readObjectText(link, ['type', 'linkType', 'value']),
        this.readObjectText(link, ['description', 'details'])
      ]),
      'No goal links informed.'
    );

    return [
      '# 2. Initial iStar4Safety Models',
      '',
      '## 2.1 Strategic Dependency (SD) Model',
      '- Model Context: High-level view showing who depends on whom.',
      '',
      '### Actors Identified',
      actorsTable,
      '- Diagram: Export from iStar4Safety tool if available.',
      '',
      '## 2.2 Strategic Rationale (SR) Model (Initial)',
      '- Model Context: Internal rationale for actors, goals, and safety responsibilities.',
      '',
      '### Goal / Dependency Mapping',
      goalLinksTable,
      '- Diagram: Export from iStar4Safety tool if available.',
    ].join('\n');
  }

  private buildControlStructureDocument(controlStructure: Record<string, unknown> | null): string {
    const step3 = this.normalizeStep3Data(controlStructure);
    const entitiesTable = this.buildMarkdownTable(
      ['ID', 'Entity', 'Role(s)'],
      step3.entities.map((entity) => [
        this.readObjectText(entity, ['id']),
        this.readObjectText(entity, ['name', 'entityName', 'label']),
        this.readObjectText(entity, ['roles', 'role', 'entityRole'])
      ]),
      'No entities informed.'
    );
    const actionsTable = this.buildMarkdownTable(
      ['ID/Ref', 'Control Action', 'Source', 'Target', 'Responsibility'],
      step3.controlActions.map((action) => [
        this.readObjectText(action, ['id', 'ref']),
        this.readObjectText(action, ['action', 'controlAction', 'name']),
        this.readObjectText(action, ['source', 'sourceEntityId', 'sourceActor']),
        this.readObjectText(action, ['target', 'targetEntityId', 'targetActor']),
        this.readObjectText(action, ['responsibilityId', 'responsibility'])
      ]),
      'No control actions informed.'
    );
    const feedbackTable = this.buildMarkdownTable(
      ['ID/Ref', 'Feedback', 'Source', 'Target', 'Details'],
      step3.feedbackLoops.map((feedback) => [
        this.readObjectText(feedback, ['id', 'ref']),
        this.readObjectText(feedback, ['feedback', 'name', 'action']),
        this.readObjectText(feedback, ['source', 'sourceEntityId', 'sourceActor']),
        this.readObjectText(feedback, ['target', 'targetEntityId', 'targetActor']),
        this.readObjectText(feedback, ['description', 'details'])
      ]),
      'No feedback loops informed.'
    );

    return [
      '# 3. System Safety Control Structure',
      '',
      '## 3.1 Entities',
      entitiesTable,
      '',
      '## 3.2 Control Actions and Feedbacks',
      '',
      '### Control Actions',
      actionsTable,
      '',
      '### Feedback Loops',
      feedbackTable,
      '',
      '## 3.3 Control Structure Diagram',
      '- Diagram: Export image or JSON from control structure editor.'
    ].join('\n');
  }

  private buildUcaConstraintsDocument(
    ucas: Record<string, unknown> | null,
    controllerConstraints: Record<string, unknown> | null
  ): string {
    const step4 = this.normalizeStep4Data(ucas);
    const step5 = this.normalizeStep5Data(controllerConstraints);
    const ucaTable = this.buildMarkdownTable(
      ['Ref', 'Control Action', 'Category', 'Consequence', 'Hazards'],
      step4.ucas.map((uca) => [
        this.readObjectText(uca, ['ref', 'id', 'code']),
        this.readObjectText(uca, ['controlAction', 'action', 'title']),
        this.readObjectText(uca, ['category', 'type']),
        this.readObjectText(uca, ['consequence', 'description', 'rationale']),
        this.readObjectText(uca, ['hazardRefs', 'linkedHazards'])
      ]),
      'No UCAs informed.'
    );
    const hazardousConditionsTable = this.buildMarkdownTable(
      ['Ref', 'Description', 'Linked Hazards', 'Coverage Gap'],
      step4.hazardousConditions.map((condition) => [
        this.readObjectText(condition, ['ref', 'id', 'code']),
        this.readObjectText(condition, ['description']),
        this.readObjectText(condition, ['linkedHazardRefs', 'linkedHazards']),
        this.readObjectText(condition, ['coverageGap'])
      ]),
      'No hazardous conditions informed.'
    );
    const constraintsTable = this.buildMarkdownTable(
      ['ID', 'Source', 'Constraint', 'Status'],
      step5.constraints.map((constraint) => [
        this.readObjectText(constraint, ['constraintId', 'id', 'code']),
        this.readObjectText(constraint, ['sourceRef', 'source']),
        this.readObjectText(constraint, ['constraint', 'statement', 'description']),
        this.readObjectText(constraint, ['status'])
      ]),
      'No controller constraints informed.'
    );

    return [
      '# 4. UCAs, HCs, and Controller Constraints',
      '',
      '## 4.1 Unsafe Control Actions (UCA) Analysis',
      ucaTable,
      '',
      '## 4.2 Hazardous Conditions (HC)',
      hazardousConditionsTable,
      '',
      '## 4.3 Controller Constraints',
      constraintsTable
    ].join('\n');
  }

  private buildLossScenariosDocument(lossScenarios: Record<string, unknown> | null): string {
    const step6 = this.normalizeStep6Data(lossScenarios);
    const lossScenariosTable = this.buildMarkdownTable(
      ['ID', 'Originating UCA/HC', 'Loss Scenario'],
      step6.lossScenarios.map((scenario) => [
        this.readObjectText(scenario, ['id', 'ref', 'code']),
        this.readObjectText(scenario, ['originatingRef', 'associatedUnsafeBehaviorIds', 'unsafeBehaviorIds']),
        this.readObjectText(scenario, ['description', 'scenario'])
      ]),
      'No loss scenarios informed.'
    );
    const safetyRequirementsTable = this.buildMarkdownTable(
      ['ID', 'Addressed Loss Scenario(s)', 'Safety Requirement'],
      step6.safetyRequirements.map((requirement) => [
        this.readObjectText(requirement, ['id', 'ref', 'code']),
        this.readObjectText(requirement, ['addressedLossScenarioIds', 'lossScenarioIds']),
        this.readObjectText(requirement, ['description', 'requirement'])
      ]),
      'No safety requirements informed.'
    );

    return [
      '# 5. Loss Scenarios and Safety Requirements',
      '',
      '## 5.1 Loss Scenarios',
      lossScenariosTable,
      '',
      '## 5.2 Safety Requirements',
      safetyRequirementsTable
    ].join('\n');
  }

  private buildFinalModelsDocument(finalModels: Record<string, unknown> | null): string {
    const step7 = this.normalizeStep7Data(finalModels);
    const modelChangesTable = this.buildMarkdownTable(
      ['ID', 'Change', 'Target', 'Details'],
      step7.modelChanges.map((change) => [
        this.readObjectText(change, ['id', 'ref', 'code']),
        this.readObjectText(change, ['changeType', 'type', 'name']),
        this.readObjectText(change, ['target', 'targetElement']),
        this.readObjectText(change, ['description', 'details'])
      ]),
      'No model changes informed.'
    );
    const validationTasksTable = this.buildMarkdownTable(
      ['ID', 'Task', 'Status', 'Notes'],
      step7.validationTasks.map((task) => [
        this.readObjectText(task, ['id', 'ref', 'code']),
        this.readObjectText(task, ['task', 'name', 'description']),
        this.readObjectText(task, ['status']),
        this.readObjectText(task, ['notes', 'details'])
      ]),
      'No validation tasks informed.'
    );

    return [
      '# 6. Final iStar4Safety Models (Iteration X)',
      '',
      '## 6.1 Updated Strategic Dependency (SD) Model',
      '- Model Context: High-level social view with updated safety traceability.',
      '- Diagram: Export final SD view from iStar4Safety tool if available.',
      '',
      '## 6.2 Updated Strategic Rationale (SR) Model',
      '- Model Context: Expanded internal reasoning with hazards, safety tasks, and mitigations.',
      '- Diagram: Export final SR view from iStar4Safety tool if available.',
      '',
      '## 6.3 Model Changes',
      modelChangesTable,
      '',
      '## 6.4 Validation Tasks',
      validationTasksTable,
      '',
      '## 6.5 Integration Notes',
      step7.integrationNotes
    ].join('\n');
  }

  private async runExport(key: string, operation: () => Promise<void>): Promise<void> {
    if (this.isExporting()) {
      return;
    }

    this.isExporting.set(true);
    this.exportingKey.set(key);

    try {
      await operation();
    } finally {
      this.isExporting.set(false);
      this.exportingKey.set(null);
    }
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private pickText(source: Record<string, unknown> | null, keys: string[], fallback: string): string {
    if (!source) {
      return fallback;
    }

    for (const key of keys) {
      const value = this.pickByPath(source, key);
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        return this.stringifyValue(value);
      }
    }

    return fallback;
  }

  private pickByPath(source: Record<string, unknown>, path: string): unknown {
    const segments = path.split('.');
    let current: unknown = source;

    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value === null || value === undefined) {
      return 'Not informed in the endpoint payload.';
    }

    return JSON.stringify(value, null, 2);
  }

  private extractProjectName(payload: Record<string, unknown>, projectId: number): string {
    const projectBlock = this.pickFirstObject(payload, ['project']) ?? {};
    const candidates = [
      payload['name'],
      payload['projectName'],
      payload['title'],
      projectBlock['name'],
      projectBlock['projectName'],
      projectBlock['title']
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return `project-${projectId}`;
  }

  private pickFirstObject(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
    for (const key of keys) {
      const value = payload[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }

    return null;
  }

  private pickFirstArray(payload: Record<string, unknown>, keys: string[]): unknown[] | null {
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    const nestedStepOne = this.pickFirstObject(payload, ['step1Information', 'stepOneInformation', 'scope', 'stepOneScope']);
    if (!nestedStepOne) {
      return null;
    }

    for (const key of keys) {
      const value = nestedStepOne[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return null;
  }

  private sanitizeFileName(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'project';
  }
}