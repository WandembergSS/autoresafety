import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ProjectService } from '../../services/project.service';
import { buildControlStructureSketchSvg } from '../../shared/diagram/control-structure-sketch.builder';
import { DiagramImage, captureIstarModelPng, rasterizeSvgToPng } from '../../shared/diagram/diagram-image.util';
import { buildPistarModelFromStepTwoPayload } from '../../shared/diagram/pistar-model.builder';

interface ArtifactDocumentSection {
  key: string;
  title: string;
  description: string;
  fileBaseName: string;
  markdown: string;
}

type DocBlockType = 'h1' | 'h2' | 'h3' | 'paragraph' | 'bullet' | 'numbered' | 'table' | 'image';

interface DocBlock {
  type: DocBlockType;
  text?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  imageKey?: string;
}

interface PdfContext {
  doc: any;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  topY: number;
  bottomY: number;
  y: number;
  section: ArtifactDocumentSection;
}

/** Image placeholder tokens embedded in section markdown, resolved to PNGs at export time. */
const ISTAR_MODEL_IMAGE_KEY = 'istar-model';
const CONTROL_STRUCTURE_IMAGE_KEY = 'control-structure-sketch';
const ISTAR_MODEL_IMAGE_TOKEN = `@@IMAGE:${ISTAR_MODEL_IMAGE_KEY}@@`;
const CONTROL_STRUCTURE_IMAGE_TOKEN = `@@IMAGE:${CONTROL_STRUCTURE_IMAGE_KEY}@@`;
const IMAGE_TOKEN_PATTERN = /^@@IMAGE:([a-z0-9-]+)@@$/i;

/** Branding for the professional report template. */
const REPORT_TITLE = 'ReSafety Safety Analysis Report';
const REPORT_METHODOLOGY = 'iStar4Safety · STPA-Integrated Safety Documentation';
const REPORT_ORGANIZATION = 'Federal University of Pernambuco — UFPE';

/** Deep navy + slate palette (RGB tuples) used by the PDF exporter. */
const PDF_COLORS = {
  navy: [15, 23, 42] as [number, number, number],
  navySoft: [30, 41, 59] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  slateSoft: [100, 116, 139] as [number, number, number],
  mist: [226, 232, 240] as [number, number, number],
  paper: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  accent: [37, 99, 235] as [number, number, number]
};

/** Matching palette (hex, no #) used by the DOCX exporter. */
const DOCX_COLORS = {
  navy: '0F172A',
  navySoft: '1E293B',
  slate: '475569',
  slateSoft: '64748B',
  mist: 'E2E8F0',
  paper: 'F1F5F9',
  accent: '2563EB',
  text: '1F2933',
  white: 'FFFFFF'
};

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
export class ResafetyArtifactsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  readonly embedded = input(false);
  readonly projectPayloadInput = input<Record<string, unknown> | null>(null);
  readonly projectIdInput = input<number | null>(null);
  readonly projectNameInput = input<string | null>(null);

  readonly currentProjectId = signal<number | null>(null);
  readonly projectPayload = signal<Record<string, unknown> | null>(null);
  readonly projectName = signal('project');
  readonly isLoading = signal(false);
  readonly isExporting = signal(false);
  readonly exportingKey = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly resolvedProjectId = computed(() => this.projectIdInput() ?? this.currentProjectId());

  readonly artifactSections = computed<ArtifactDocumentSection[]>(() => {
    const payload = this.projectPayloadInput() ?? this.projectPayload();
    const projectId = this.resolvedProjectId();
    const resolvedProjectName = (this.projectNameInput() ?? '').trim() || this.projectName();

    if (!payload || !projectId) {
      return [];
    }

    const projectSlug = this.sanitizeFileName(resolvedProjectName || `project-${projectId}`);
    return this.buildArtifactSections(payload, projectSlug);
  });

  readonly payloadPreview = computed(() => {
    const payload = this.projectPayloadInput() ?? this.projectPayload();
    return payload ? JSON.stringify(payload, null, 2) : '';
  });

  ngOnInit(): void {
    if (this.embedded()) {
      if (this.projectIdInput()) {
        this.currentProjectId.set(this.projectIdInput());
      }

      const providedProjectName = this.projectNameInput();
      if (providedProjectName && providedProjectName.trim().length > 0) {
        this.projectName.set(providedProjectName.trim());
      }

      return;
    }

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
      const exportSection = await this.prepareSectionForExport(section);
      const images = await this.resolveSectionImages(exportSection);
      const blocks = this.parseDocBlocks(exportSection.markdown);

      const module = await import('jspdf');
      const { jsPDF } = module;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 52;

      const meta = this.buildReportMeta();
      this.drawPdfCover(doc, pageWidth, pageHeight, margin, exportSection, meta);

      const context: PdfContext = {
        doc,
        pageWidth,
        pageHeight,
        margin,
        contentWidth: pageWidth - margin * 2,
        topY: margin + 26,
        bottomY: pageHeight - margin - 18,
        y: margin + 26,
        section: exportSection
      };

      this.startPdfContentPage(context);

      for (const block of blocks) {
        this.renderPdfBlock(context, block, images);
      }

      this.drawPdfFooters(doc, pageWidth, pageHeight, margin, meta);

      doc.save(`${exportSection.fileBaseName}.pdf`);
    });
  }

  private buildReportMeta(): { author: string; generatedAt: string; projectName: string } {
    const author = (this.authService.getCurrentUsername() ?? '').trim() || 'ReSafety Analyst';
    const projectName = (this.projectNameInput() ?? '').trim() || this.projectName();
    return {
      author,
      generatedAt: this.formatExportDate(new Date()),
      projectName: projectName || 'Untitled project'
    };
  }

  private formatExportDate(date: Date): string {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  private drawPdfCover(
    doc: any,
    pageWidth: number,
    pageHeight: number,
    margin: number,
    section: ArtifactDocumentSection,
    meta: { author: string; generatedAt: string; projectName: string }
  ): void {
    const bandHeight = 196;

    // Navy header band.
    doc.setFillColor(...PDF_COLORS.navy);
    doc.rect(0, 0, pageWidth, bandHeight, 'F');
    doc.setFillColor(...PDF_COLORS.navySoft);
    doc.rect(0, bandHeight - 8, pageWidth, 8, 'F');
    doc.setFillColor(...PDF_COLORS.accent);
    doc.rect(0, bandHeight, pageWidth, 4, 'F');

    doc.setTextColor(...PDF_COLORS.mist);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(REPORT_ORGANIZATION.toUpperCase(), margin, 56);

    doc.setTextColor(...PDF_COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    const titleLines = doc.splitTextToSize(REPORT_TITLE, pageWidth - margin * 2) as string[];
    let titleY = 102;
    for (const line of titleLines) {
      doc.text(line, margin, titleY);
      titleY += 34;
    }

    doc.setTextColor(...PDF_COLORS.mist);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(REPORT_METHODOLOGY, margin, Math.min(titleY + 4, bandHeight - 26));

    // Section identity.
    let y = bandHeight + 64;
    doc.setTextColor(...PDF_COLORS.slateSoft);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('REPORT SECTION', margin, y);

    y += 26;
    doc.setTextColor(...PDF_COLORS.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    const sectionLines = doc.splitTextToSize(section.title, pageWidth - margin * 2) as string[];
    for (const line of sectionLines) {
      doc.text(line, margin, y);
      y += 28;
    }

    y += 4;
    doc.setTextColor(...PDF_COLORS.slate);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const descriptionLines = doc.splitTextToSize(section.description, pageWidth - margin * 2) as string[];
    for (const line of descriptionLines) {
      doc.text(line, margin, y);
      y += 17;
    }

    // Metadata card.
    const cardTop = Math.max(y + 28, pageHeight - 320);
    const cardHeight = 196;
    const cardWidth = pageWidth - margin * 2;
    doc.setFillColor(...PDF_COLORS.paper);
    doc.setDrawColor(...PDF_COLORS.mist);
    doc.setLineWidth(1);
    doc.roundedRect(margin, cardTop, cardWidth, cardHeight, 10, 10, 'FD');
    doc.setFillColor(...PDF_COLORS.navy);
    doc.roundedRect(margin, cardTop, 6, cardHeight, 3, 3, 'F');

    const rows: Array<[string, string]> = [
      ['Prepared by', meta.author],
      ['Generated on', meta.generatedAt],
      ['Project', meta.projectName],
      ['Methodology', 'RESafety Process'],
      ['Document ID', section.fileBaseName]
    ];

    const labelX = margin + 28;
    const valueX = margin + 168;
    let rowY = cardTop + 34;
    for (const [label, value] of rows) {
      doc.setTextColor(...PDF_COLORS.slateSoft);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(label.toUpperCase(), labelX, rowY);

      doc.setTextColor(...PDF_COLORS.navySoft);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      const valueLines = doc.splitTextToSize(value, cardWidth - (valueX - margin) - 24) as string[];
      doc.text(valueLines[0] ?? '-', valueX, rowY);
      rowY += 30;
    }

    doc.setTextColor(...PDF_COLORS.slateSoft);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(
      'Generated automatically by the ReSafety platform. Review against the source models before distribution.',
      pageWidth / 2,
      pageHeight - margin + 6,
      { align: 'center' }
    );
  }

  private drawPdfHeader(context: PdfContext): void {
    const { doc, pageWidth, margin } = context;
    const headerY = margin - 18;

    doc.setTextColor(...PDF_COLORS.slateSoft);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(REPORT_TITLE.toUpperCase(), margin, headerY);

    const sectionLabel = context.section.title;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_COLORS.slate);
    doc.text(sectionLabel, pageWidth - margin, headerY, { align: 'right' });

    doc.setDrawColor(...PDF_COLORS.mist);
    doc.setLineWidth(0.8);
    doc.line(margin, headerY + 6, pageWidth - margin, headerY + 6);
  }

  private drawPdfFooters(
    doc: any,
    pageWidth: number,
    pageHeight: number,
    margin: number,
    meta: { author: string; generatedAt: string; projectName: string }
  ): void {
    const totalPages = doc.getNumberOfPages();
    const contentPages = totalPages - 1;
    const footerY = pageHeight - margin + 10;

    for (let page = 2; page <= totalPages; page += 1) {
      doc.setPage(page);

      doc.setDrawColor(...PDF_COLORS.mist);
      doc.setLineWidth(0.8);
      doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);

      doc.setTextColor(...PDF_COLORS.slateSoft);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(REPORT_ORGANIZATION, margin, footerY);
      doc.text(`Page ${page - 1} of ${contentPages}`, pageWidth / 2, footerY, { align: 'center' });
      doc.text(meta.generatedAt, pageWidth - margin, footerY, { align: 'right' });
    }
  }

  private startPdfContentPage(context: PdfContext): void {
    context.doc.addPage();
    this.drawPdfHeader(context);
    context.y = context.topY;
  }

  private ensurePdfSpace(context: PdfContext, needed: number): void {
    if (context.y + needed > context.bottomY) {
      this.startPdfContentPage(context);
    }
  }

  private renderPdfBlock(context: PdfContext, block: DocBlock, images: Map<string, DiagramImage>): void {
    switch (block.type) {
      case 'h1':
        this.renderPdfHeading(context, block.text ?? '', 17, 14, true);
        break;
      case 'h2':
        this.renderPdfBandHeading(context, block.text ?? '');
        break;
      case 'h3':
        this.renderPdfHeading(context, block.text ?? '', 12.5, 8, false);
        break;
      case 'bullet':
        this.renderPdfListItem(context, block.text ?? '', '•');
        break;
      case 'numbered':
        this.renderPdfListItem(context, block.text ?? '', null);
        break;
      case 'table':
        this.renderPdfTable(context, block.tableHeaders ?? [], block.tableRows ?? []);
        break;
      case 'image':
        this.renderPdfImage(context, images.get(block.imageKey ?? ''));
        break;
      default:
        this.renderPdfParagraph(context, block.text ?? '');
    }
  }

  private renderPdfHeading(context: PdfContext, text: string, size: number, gapAfter: number, underline: boolean): void {
    const { doc, contentWidth, margin } = context;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    const lineHeight = size + 4;

    this.ensurePdfSpace(context, lineHeight * lines.length + gapAfter + 6);
    context.y += 8;
    doc.setTextColor(...PDF_COLORS.navy);

    for (const line of lines) {
      doc.text(line, margin, context.y);
      context.y += lineHeight;
    }

    if (underline) {
      doc.setDrawColor(...PDF_COLORS.accent);
      doc.setLineWidth(1.4);
      doc.line(margin, context.y - lineHeight + 6, margin + 60, context.y - lineHeight + 6);
    }

    context.y += gapAfter;
  }

  private renderPdfBandHeading(context: PdfContext, text: string): void {
    const { doc, contentWidth, margin } = context;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    const lines = doc.splitTextToSize(text, contentWidth - 28) as string[];
    const lineHeight = 17;
    const bandHeight = lineHeight * lines.length + 16;

    this.ensurePdfSpace(context, bandHeight + 14);
    context.y += 10;

    doc.setFillColor(...PDF_COLORS.paper);
    doc.setDrawColor(...PDF_COLORS.mist);
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, context.y, contentWidth, bandHeight, 6, 6, 'FD');
    doc.setFillColor(...PDF_COLORS.navy);
    doc.rect(margin, context.y, 5, bandHeight, 'F');

    doc.setTextColor(...PDF_COLORS.navy);
    let textY = context.y + 20;
    for (const line of lines) {
      doc.text(line, margin + 18, textY);
      textY += lineHeight;
    }

    context.y += bandHeight + 12;
  }

  private renderPdfParagraph(context: PdfContext, text: string): void {
    if (!text.trim()) {
      context.y += 4;
      return;
    }

    const { doc, contentWidth, margin } = context;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.navySoft);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];

    for (const line of lines) {
      this.ensurePdfSpace(context, 16);
      doc.text(line, margin, context.y);
      context.y += 15;
    }

    context.y += 4;
  }

  private renderPdfListItem(context: PdfContext, text: string, bulletGlyph: string | null): void {
    const { doc, contentWidth, margin } = context;
    const indent = 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];

    lines.forEach((line, index) => {
      this.ensurePdfSpace(context, 16);
      if (index === 0 && bulletGlyph) {
        doc.setTextColor(...PDF_COLORS.accent);
        doc.text(bulletGlyph, margin + 4, context.y);
      }
      doc.setTextColor(...PDF_COLORS.navySoft);
      doc.text(line, margin + indent, context.y);
      context.y += 15;
    });

    context.y += 3;
  }

  private renderPdfTable(context: PdfContext, headers: string[], rows: string[][]): void {
    if (!headers.length) {
      return;
    }

    const { doc, contentWidth, margin } = context;
    const columnWidths = this.computePdfColumnWidths(doc, headers, rows, contentWidth);
    const cellPadding = 6;
    const headerFontSize = 9.5;
    const bodyFontSize = 9.5;
    const lineHeight = 12;

    context.y += 10;

    const drawHeaderRow = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(headerFontSize);
      const wrapped = headers.map((header, index) =>
        doc.splitTextToSize(header, columnWidths[index] - cellPadding * 2) as string[]
      );
      const rowHeight = Math.max(...wrapped.map((cell) => cell.length)) * lineHeight + cellPadding * 2;

      doc.setFillColor(...PDF_COLORS.navy);
      doc.rect(margin, context.y, contentWidth, rowHeight, 'F');

      doc.setTextColor(...PDF_COLORS.white);
      let cellX = margin;
      wrapped.forEach((cell, index) => {
        let textY = context.y + cellPadding + lineHeight - 3;
        for (const line of cell) {
          doc.text(line, cellX + cellPadding, textY);
          textY += lineHeight;
        }
        cellX += columnWidths[index];
      });

      context.y += rowHeight;
    };

    this.ensurePdfSpace(context, 60);
    drawHeaderRow();

    const dataRows = rows.length ? rows : [headers.map(() => '-')];

    dataRows.forEach((row, rowIndex) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFontSize);
      const wrapped = headers.map((_, index) =>
        doc.splitTextToSize((row[index] ?? '-') || '-', columnWidths[index] - cellPadding * 2) as string[]
      );
      const rowHeight = Math.max(...wrapped.map((cell) => cell.length)) * lineHeight + cellPadding * 2;

      if (context.y + rowHeight > context.bottomY) {
        this.startPdfContentPage(context);
        context.y += 10;
        drawHeaderRow();
      }

      doc.setFillColor(...(rowIndex % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.paper));
      doc.rect(margin, context.y, contentWidth, rowHeight, 'F');

      doc.setDrawColor(...PDF_COLORS.mist);
      doc.setLineWidth(0.6);
      doc.line(margin, context.y + rowHeight, margin + contentWidth, context.y + rowHeight);

      doc.setTextColor(...PDF_COLORS.navySoft);
      let cellX = margin;
      wrapped.forEach((cell, index) => {
        let textY = context.y + cellPadding + lineHeight - 3;
        for (const line of cell) {
          doc.text(line, cellX + cellPadding, textY);
          textY += lineHeight;
        }
        cellX += columnWidths[index];
      });

      context.y += rowHeight;
    });

    // Outer border.
    doc.setDrawColor(...PDF_COLORS.slate);
    doc.setLineWidth(0.9);
    doc.rect(margin, context.y, contentWidth, 0, 'S');

    context.y += 12;
  }

  private computePdfColumnWidths(doc: any, headers: string[], rows: string[][], totalWidth: number): number[] {
    const sampleRows = rows.slice(0, 40);
    const weights = headers.map((header, index) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      let maxWidth = doc.getTextWidth(header);
      doc.setFont('helvetica', 'normal');
      for (const row of sampleRows) {
        const value = (row[index] ?? '').toString();
        const sample = value.length > 80 ? value.slice(0, 80) : value;
        maxWidth = Math.max(maxWidth, doc.getTextWidth(sample));
      }
      return Math.min(Math.max(maxWidth + 16, 48), 280);
    });

    const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((weight) => (weight / weightSum) * totalWidth);
  }

  private renderPdfImage(context: PdfContext, image: DiagramImage | undefined): void {
    const { doc, contentWidth, margin } = context;

    if (!image) {
      this.renderPdfParagraph(
        context,
        'Diagram preview is unavailable for this export. Open the model in the editor to capture the latest view.'
      );
      return;
    }

    const aspect = image.height / image.width;
    let drawWidth = contentWidth;
    let drawHeight = drawWidth * aspect;
    const maxHeight = context.bottomY - context.topY - 24;

    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight / aspect;
    }

    const framePadding = 10;
    const frameHeight = drawHeight + framePadding * 2;

    if (context.y + frameHeight > context.bottomY) {
      this.startPdfContentPage(context);
    }

    context.y += 8;
    const frameX = margin + (contentWidth - drawWidth) / 2 - framePadding;
    const imageX = margin + (contentWidth - drawWidth) / 2;

    doc.setFillColor(...PDF_COLORS.white);
    doc.setDrawColor(...PDF_COLORS.mist);
    doc.setLineWidth(0.9);
    doc.roundedRect(frameX, context.y, drawWidth + framePadding * 2, frameHeight, 6, 6, 'FD');

    doc.addImage(image.dataUrl, 'PNG', imageX, context.y + framePadding, drawWidth, drawHeight, undefined, 'FAST');

    context.y += frameHeight + 12;
  }

  private parseDocBlocks(markdown: string): DocBlock[] {
    const lines = markdown.split('\n');
    const blocks: DocBlock[] = [];

    let index = 0;
    while (index < lines.length) {
      const rawLine = lines[index];
      const currentLine = rawLine.trim();

      if (!currentLine) {
        index += 1;
        continue;
      }

      if (currentLine.startsWith('|')) {
        const tableLines: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          tableLines.push(lines[index]);
          index += 1;
        }
        const table = this.toDocTableBlock(tableLines);
        if (table) {
          blocks.push(table);
        }
        continue;
      }

      const imageMatch = currentLine.match(IMAGE_TOKEN_PATTERN);
      if (imageMatch) {
        blocks.push({ type: 'image', imageKey: imageMatch[1].toLowerCase() });
        index += 1;
        continue;
      }

      const headingMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        blocks.push({ type: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', text: headingMatch[2].trim() });
        index += 1;
        continue;
      }

      const bulletMatch = currentLine.match(/^-\s+(.+)$/);
      if (bulletMatch) {
        blocks.push({ type: 'bullet', text: bulletMatch[1].trim() });
        index += 1;
        continue;
      }

      const numberedMatch = currentLine.match(/^(\d+\.)\s+(.+)$/);
      if (numberedMatch) {
        blocks.push({ type: 'numbered', text: `${numberedMatch[1]} ${numberedMatch[2].trim()}` });
        index += 1;
        continue;
      }

      blocks.push({ type: 'paragraph', text: currentLine });
      index += 1;
    }

    return blocks;
  }

  private toDocTableBlock(tableLines: string[]): DocBlock | null {
    if (!tableLines.length) {
      return null;
    }

    const rows = tableLines.map((line) => this.parseMarkdownTableRow(line));
    if (!rows.length) {
      return null;
    }

    const headers = rows[0];
    const hasSeparator =
      rows.length > 1 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
    const dataRows = rows.slice(hasSeparator ? 2 : 1).map((row) => headers.map((_, index) => row[index] ?? ''));

    return { type: 'table', tableHeaders: headers, tableRows: dataRows };
  }

  async downloadDocx(section: ArtifactDocumentSection): Promise<void> {
    await this.runExport(`${section.key}-docx`, async () => {
      if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        throw new Error('DOCX export is only available in the browser runtime.');
      }

      const exportSection = await this.prepareSectionForExport(section);
      const images = await this.resolveSectionImages(exportSection);
      const meta = this.buildReportMeta();

      const [{ marked }, docxModule] = await Promise.all([import('marked'), import('docx')]);
      const docx = docxModule;
      const { Document, Packer } = docxModule;

      const htmlContent = await marked.parse(exportSection.markdown);
      const parser = new DOMParser();
      const htmlDocument = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
      const container = htmlDocument.body.firstElementChild;

      const coverChildren = this.buildDocxCover(docx, exportSection, meta);
      const contentChildren = this.buildDocxChildrenFromHtml(container, docx, images);

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
              }
            },
            children: coverChildren as any
          },
          {
            properties: {
              page: {
                margin: { top: 1440, right: 1134, bottom: 1276, left: 1134 },
                pageNumbers: { start: 1 }
              }
            },
            headers: { default: this.buildDocxHeader(docx, exportSection) },
            footers: { default: this.buildDocxFooter(docx, meta) },
            children: contentChildren as any
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      this.saveBlob(blob, `${exportSection.fileBaseName}.docx`);
    });
  }

  private buildDocxCover(
    docx: any,
    section: ArtifactDocumentSection,
    meta: { author: string; generatedAt: string; projectName: string }
  ): any[] {
    const { AlignmentType, BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;

    const metadataRows: Array<[string, string]> = [
      ['Prepared by', meta.author],
      ['Generated on', meta.generatedAt],
      ['Project', meta.projectName],
      ['Methodology', 'RESafety Process'],
      ['Document ID', section.fileBaseName]
    ];

    const metadataTable = new Table({
      width: { size: 100, type: WidthType['PERCENTAGE'] },
      borders: {
        top: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
        bottom: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
        left: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
        right: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
        insideHorizontal: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
        insideVertical: { style: BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist }
      },
      rows: metadataRows.map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 32, type: WidthType['PERCENTAGE'] },
                shading: { fill: DOCX_COLORS.paper },
                margins: { top: 90, bottom: 90, left: 140, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: label.toUpperCase(),
                        bold: true,
                        size: 18,
                        font: 'Arial',
                        color: DOCX_COLORS.slateSoft
                      })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 68, type: WidthType['PERCENTAGE'] },
                margins: { top: 90, bottom: 90, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: value, size: 22, font: 'Arial', color: DOCX_COLORS.navySoft })]
                  })
                ]
              })
            ]
          })
      )
    });

    return [
      new Paragraph({
        spacing: { before: 480, after: 60 },
        children: [
          new TextRun({ text: REPORT_ORGANIZATION.toUpperCase(), bold: true, size: 20, font: 'Arial', color: DOCX_COLORS.slate })
        ]
      }),
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: REPORT_TITLE, bold: true, size: 56, font: 'Arial', color: DOCX_COLORS.navy })]
      }),
      new Paragraph({
        spacing: { before: 40, after: 220 },
        border: { bottom: { style: BorderStyle['SINGLE'], size: 18, color: DOCX_COLORS.accent, space: 6 } },
        children: [new TextRun({ text: REPORT_METHODOLOGY, size: 24, font: 'Arial', color: DOCX_COLORS.slate })]
      }),
      new Paragraph({
        spacing: { before: 600, after: 80 },
        children: [
          new TextRun({ text: 'REPORT SECTION', bold: true, size: 20, font: 'Arial', color: DOCX_COLORS.slateSoft })
        ]
      }),
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [new TextRun({ text: section.title, bold: true, size: 40, font: 'Arial', color: DOCX_COLORS.navy })]
      }),
      new Paragraph({
        spacing: { before: 20, after: 360 },
        children: [new TextRun({ text: section.description, size: 24, font: 'Arial', color: DOCX_COLORS.slate })]
      }),
      metadataTable,
      new Paragraph({
        spacing: { before: 360 },
        alignment: AlignmentType['CENTER'],
        children: [
          new TextRun({
            text: 'Generated automatically by the ReSafety platform. Review against the source models before distribution.',
            italics: true,
            size: 17,
            font: 'Arial',
            color: DOCX_COLORS.slateSoft
          })
        ]
      })
    ];
  }

  private buildDocxHeader(docx: any, section: ArtifactDocumentSection): any {
    const { AlignmentType, BorderStyle, Header, Paragraph, TabStopType, TextRun } = docx;
    return new Header({
      children: [
        new Paragraph({
          tabStops: [{ type: TabStopType['RIGHT'], position: 9072 }],
          border: { bottom: { style: BorderStyle['SINGLE'], size: 6, color: DOCX_COLORS.mist, space: 4 } },
          children: [
            new TextRun({ text: REPORT_TITLE.toUpperCase(), bold: true, size: 15, font: 'Arial', color: DOCX_COLORS.slateSoft }),
            new TextRun({ text: '\t' }),
            new TextRun({ text: section.title, size: 15, font: 'Arial', color: DOCX_COLORS.slate })
          ],
          alignment: AlignmentType['LEFT']
        })
      ]
    });
  }

  private buildDocxFooter(docx: any, meta: { author: string; generatedAt: string; projectName: string }): any {
    const { BorderStyle, Footer, PageNumber, Paragraph, TabStopType, TextRun } = docx;
    return new Footer({
      children: [
        new Paragraph({
          tabStops: [
            { type: TabStopType['CENTER'], position: 4536 },
            { type: TabStopType['RIGHT'], position: 9072 }
          ],
          border: { top: { style: BorderStyle['SINGLE'], size: 6, color: DOCX_COLORS.mist, space: 4 } },
          children: [
            new TextRun({ text: REPORT_ORGANIZATION, size: 15, font: 'Arial', color: DOCX_COLORS.slateSoft }),
            new TextRun({ text: '\t' }),
            new TextRun({ text: 'Page ', size: 15, font: 'Arial', color: DOCX_COLORS.slateSoft }),
            new TextRun({ children: [PageNumber['CURRENT']], size: 15, font: 'Arial', color: DOCX_COLORS.slateSoft }),
            new TextRun({ text: '\t' }),
            new TextRun({ text: meta.generatedAt, size: 15, font: 'Arial', color: DOCX_COLORS.slateSoft })
          ]
        })
      ]
    });
  }

  private buildDocxChildrenFromHtml(container: Element | null, docx: any, images: Map<string, DiagramImage>): any[] {
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
        const text = element.textContent?.trim() ?? '';
        const imageMatch = text.match(IMAGE_TOKEN_PATTERN);
        if (imageMatch) {
          const image = images.get(imageMatch[1].toLowerCase());
          blocks.push(...this.buildDocxImageBlocks(docx, image));
          continue;
        }
        blocks.push(this.createDocxParagraph(docx, text, 'paragraph'));
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
                      size: 20,
                      font: 'Arial',
                      color: rowIndex === 0 ? DOCX_COLORS.white : DOCX_COLORS.text
                    })
                  ],
                  spacing: { before: 20, after: 20 }
                })
              ],
              shading:
                rowIndex === 0
                  ? { fill: DOCX_COLORS.navy }
                  : rowIndex % 2 === 0
                    ? { fill: DOCX_COLORS.paper }
                    : undefined,
              margins: { top: 80, bottom: 80, left: 110, right: 110 }
            })
          );

          return new docx.TableRow({ children: cells, tableHeader: rowIndex === 0 });
        });

        blocks.push(
          new docx.Table({
            width: { size: 100, type: docx.WidthType['PERCENTAGE'] },
            borders: {
              top: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
              bottom: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
              left: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
              right: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
              insideHorizontal: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist },
              insideVertical: { style: docx.BorderStyle['SINGLE'], size: 4, color: DOCX_COLORS.mist }
            },
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

  private buildDocxImageBlocks(docx: any, image: DiagramImage | undefined): any[] {
    const { AlignmentType, ImageRun, Paragraph, TextRun } = docx;

    if (!image) {
      return [
        new Paragraph({
          spacing: { before: 80, after: 120 },
          children: [
            new TextRun({
              text: 'Diagram preview is unavailable for this export. Open the model in the editor to capture the latest view.',
              italics: true,
              size: 20,
              font: 'Arial',
              color: DOCX_COLORS.slateSoft
            })
          ]
        })
      ];
    }

    const maxWidth = 600;
    const maxHeight = 760;
    const aspect = image.height / image.width;
    let width = Math.min(maxWidth, image.width);
    let height = width * aspect;
    if (height > maxHeight) {
      height = maxHeight;
      width = height / aspect;
    }

    return [
      new Paragraph({
        spacing: { before: 160, after: 200 },
        alignment: AlignmentType['CENTER'],
        children: [
          new ImageRun({
            type: 'png',
            data: this.dataUrlToUint8Array(image.dataUrl),
            transformation: { width: Math.round(width), height: Math.round(height) }
          })
        ]
      })
    ];
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
        children: [new docx.TextRun({ text: safeText, bold: true, size: 36, font: 'Arial', color: DOCX_COLORS.navy })],
        spacing: { before: 160, after: 220 },
        border: {
          bottom: { color: DOCX_COLORS.accent, space: 4, size: 12, style: docx.BorderStyle['SINGLE'] }
        }
      });
    }

    if (kind === 'h2') {
      return new docx.Paragraph({
        heading: docx.HeadingLevel['HEADING_2'],
        children: [new docx.TextRun({ text: safeText, bold: true, size: 28, font: 'Arial', color: DOCX_COLORS.navy })],
        spacing: { before: 260, after: 140 },
        shading: { fill: DOCX_COLORS.paper },
        border: { left: { color: DOCX_COLORS.navy, space: 8, size: 18, style: docx.BorderStyle['SINGLE'] } },
        indent: { left: 120, right: 90 }
      });
    }

    if (kind === 'h3') {
      return new docx.Paragraph({
        heading: docx.HeadingLevel['HEADING_3'],
        children: [new docx.TextRun({ text: safeText, bold: true, size: 24, font: 'Arial', color: DOCX_COLORS.navySoft })],
        spacing: { before: 180, after: 80 }
      });
    }

    if (kind === 'bullet') {
      return new docx.Paragraph({
        children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: DOCX_COLORS.text })],
        bullet: { level: 0 },
        spacing: { before: 30, after: 50 }
      });
    }

    if (kind === 'numbered') {
      return new docx.Paragraph({
        children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: DOCX_COLORS.text })],
        spacing: { before: 30, after: 50 },
        indent: { left: 180 },
        alignment: docx.AlignmentType['LEFT']
      });
    }

    return new docx.Paragraph({
      children: [new docx.TextRun({ text: safeText, size: 22, font: 'Arial', color: DOCX_COLORS.text })],
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
        markdown: this.buildControlStructureDocument(controlStructure, scope)
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

  private parseMarkdownTableRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.replace(/\\\|/g, '|').trim());
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

  private normalizeStep3Data(step3: Record<string, unknown> | null, step1Scope: Record<string, unknown> | null = null): Step3Data {
    const safeStep3 = step3 ?? {};
    const currentData = this.pickFirstObject(safeStep3, ['currentData']) ?? {};
    const availableInputs = this.pickFirstObject(safeStep3, ['availableInputs']) ?? {};
    const step1 = this.normalizeStep1Data(step1Scope);

    const stepThreeEntityCandidates = this.toObjectArray(this.pickFirstArray(availableInputs, ['entityCandidates']) ?? []);
    const stepOneEntityCandidates = step1.systemComponents.map((component, index) => ({
      id: `step1-component-${index + 1}`,
      name: component.name,
      label: component.name,
      sourceType: 'systemComponent',
      sourceStep: '1.1.5',
      sourceRefId: String(component.id)
    }));
    const entityCandidateMap = new Map<string, Record<string, unknown>>();
    for (const candidate of [...stepThreeEntityCandidates, ...stepOneEntityCandidates]) {
      const candidateId = this.readObjectText(candidate, ['id'], '').trim();
      if (candidateId) {
        entityCandidateMap.set(candidateId, candidate);
      }
    }

    const stepThreeResponsibilities = this.toObjectArray(this.pickFirstArray(availableInputs, ['responsibilities']) ?? []);
    const stepOneResponsibilities = step1.componentResponsibilities.map((responsibility, index) => ({
      id: `step1-responsibility-${index + 1}`,
      text: responsibility.responsibility,
      label: [responsibility.component, responsibility.responsibility].filter((item) => item.trim().length > 0).join(' - ')
    }));
    const responsibilityMap = new Map<string, string>();
    for (const responsibility of [...stepThreeResponsibilities, ...stepOneResponsibilities]) {
      const responsibilityId = this.readObjectText(responsibility, ['id'], '').trim();
      if (!responsibilityId) {
        continue;
      }

      const label = this.readObjectText(responsibility, ['label', 'text', 'responsibility', 'name'], '').trim();
      responsibilityMap.set(responsibilityId, label || responsibilityId);
    }

    const externalSources = this.toObjectArray(this.pickFirstArray(availableInputs, ['externalSources']) ?? []);
    const externalSourceMap = new Map<string, string>();
    for (const source of externalSources) {
      const sourceId = this.readObjectText(source, ['id'], '').trim();
      const sourceLabel = this.readObjectText(source, ['label', 'name'], '').trim();
      if (sourceId && sourceLabel) {
        externalSourceMap.set(sourceId, sourceLabel);
      }
    }

    const rawEntities = this.toObjectArray(
      this.pickFirstArray(safeStep3, ['entities', 'controllers', 'controlledProcesses']) ??
        this.pickFirstArray(currentData, ['entities']) ??
        []
    );

    const entities = (rawEntities.length > 0
      ? rawEntities.map((entity, index) => {
          const entityId = this.readObjectText(entity, ['id'], '').trim() || `entity-${index + 1}`;
          const candidateId = this.readObjectText(entity, ['entityCandidateId'], '').trim();
          const candidate = candidateId ? entityCandidateMap.get(candidateId) ?? null : null;
          const name =
            this.readObjectText(entity, ['name', 'entityName', 'label'], '').trim() ||
            this.readObjectText(candidate ?? {}, ['name', 'label'], '').trim() ||
            entityId;

          return {
            ...entity,
            id: entityId,
            entityCandidateId: candidateId || entityId,
            name
          };
        })
      : stepOneEntityCandidates.map((candidate, index) => ({
          id: this.readObjectText(candidate, ['id'], '').trim() || `entity-${index + 1}`,
          entityCandidateId: this.readObjectText(candidate, ['id'], '').trim() || `entity-${index + 1}`,
          name: this.readObjectText(candidate, ['name', 'label'], '').trim() || `Entity ${index + 1}`,
          roles: []
        }))) as Record<string, unknown>[];

    const entityMap = new Map<string, Record<string, unknown>>();
    for (const entity of entities) {
      const entityId = this.readObjectText(entity, ['id'], '').trim();
      if (entityId) {
        entityMap.set(entityId, entity);
      }
    }

    const controlActions = this.toObjectArray(
      this.pickFirstArray(safeStep3, ['controlActions']) ?? this.pickFirstArray(currentData, ['controlActions']) ?? []
    ).map((action, index) => {
      const sourceEntityId = this.readObjectText(action, ['sourceEntityId'], '').trim();
      const targetEntityId = this.readObjectText(action, ['targetEntityId'], '').trim();
      const responsibilityId = this.readObjectText(action, ['responsibilityId'], '').trim();

      return {
        ...action,
        id: this.readObjectText(action, ['id', 'ref'], '').trim() || `control-action-${index + 1}`,
        source:
          this.readObjectText(entityMap.get(sourceEntityId) ?? {}, ['name', 'entityName', 'label'], '').trim() ||
          this.readObjectText(action, ['source', 'sourceActor', 'sourceEntityId'], '-'),
        target:
          this.readObjectText(entityMap.get(targetEntityId) ?? {}, ['name', 'entityName', 'label'], '').trim() ||
          this.readObjectText(action, ['target', 'targetActor', 'targetEntityId'], '-'),
        responsibility: responsibilityMap.get(responsibilityId) || this.readObjectText(action, ['responsibility', 'responsibilityId'], '-')
      };
    });

    const feedbackLoops = this.toObjectArray(
      this.pickFirstArray(safeStep3, ['feedbackLoops', 'feedbacks']) ??
        this.pickFirstArray(currentData, ['feedbackLoops', 'feedbacks', 'optionalElements']) ??
        []
    ).map((feedback, index) => {
      const sourceKind = this.readObjectText(feedback, ['sourceKind'], '').trim();
      const destinationKind = this.readObjectText(feedback, ['destinationKind'], '').trim();
      const sourceEntityId = this.readObjectText(feedback, ['sourceEntityId'], '').trim();
      const destinationEntityId = this.readObjectText(feedback, ['destinationEntityId', 'targetEntityId'], '').trim();
      const sourceExternalId = this.readObjectText(feedback, ['sourceExternalId'], '').trim();
      const destinationExternalId = this.readObjectText(feedback, ['destinationExternalId', 'targetExternalId'], '').trim();
      const responsibilityId = this.readObjectText(feedback, ['responsibilityId'], '').trim();
      const type = this.readObjectText(feedback, ['type'], '').trim();
      const details =
        this.readObjectText(feedback, ['description', 'details'], '').trim() ||
        [type, responsibilityMap.get(responsibilityId) ?? ''].filter((item) => item.trim().length > 0).join(' - ');

      return {
        ...feedback,
        id: this.readObjectText(feedback, ['id', 'ref'], '').trim() || `feedback-${index + 1}`,
        feedback: this.readObjectText(feedback, ['feedback', 'name', 'action'], '').trim() || type || 'Feedback',
        source:
          sourceKind === 'external'
            ? externalSourceMap.get(sourceExternalId) || this.readObjectText(feedback, ['source'], 'External source')
            : this.readObjectText(entityMap.get(sourceEntityId) ?? {}, ['name', 'entityName', 'label'], '').trim() ||
              this.readObjectText(feedback, ['source', 'sourceActor', 'sourceEntityId'], '-'),
        target:
          destinationKind === 'external'
            ? externalSourceMap.get(destinationExternalId) || this.readObjectText(feedback, ['target', 'destination'], 'External destination')
            : this.readObjectText(entityMap.get(destinationEntityId) ?? {}, ['name', 'entityName', 'label'], '').trim() ||
              this.readObjectText(feedback, ['target', 'destination', 'targetActor', 'destinationEntityId'], '-'),
        details: details || '-'
      };
    });

    return {
      entities,
      controlActions,
      feedbackLoops
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
    const currentData = this.pickFirstObject(safeStep6, ['currentData']) ?? {};
    return {
      lossScenarios: this.toObjectArray(
        this.pickFirstArray(safeStep6, ['lossScenarios']) ?? this.pickFirstArray(currentData, ['lossScenarios']) ?? []
      ),
      safetyRequirements: this.toObjectArray(
        this.pickFirstArray(safeStep6, ['safetyRequirements']) ??
          this.pickFirstArray(currentData, ['safetyRequirements']) ??
          []
      )
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
      '',
      '## 2.2 Strategic Rationale (SR) Model (Initial)',
      '- Model Context: Internal rationale for actors, goals, and safety responsibilities.',
      '',
      '### Goal / Dependency Mapping',
      goalLinksTable,
      '',
      '## 2.3 iStar4Safety Model Diagram',
      'Faithful rendering of the saved Step 2 model, generated with the iStar4Safety (piStar) engine.',
      '',
      ISTAR_MODEL_IMAGE_TOKEN
    ].join('\n');
  }

  private buildControlStructureDocument(
    controlStructure: Record<string, unknown> | null,
    step1Scope: Record<string, unknown> | null
  ): string {
    const step3 = this.normalizeStep3Data(controlStructure, step1Scope);
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
      'Hierarchical control-structure sketch derived from the saved Step 3 data: controllers on top, controlled processes below, control actions flowing downward and feedback flowing upward.',
      '',
      CONTROL_STRUCTURE_IMAGE_TOKEN
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

  private async prepareSectionForExport(section: ArtifactDocumentSection): Promise<ArtifactDocumentSection> {
    if (section.key !== '05-loss-scenarios-safety-requirements') {
      return section;
    }

    const payload = this.getFullDocumentPayload();
    const projectId = this.resolvedProjectId();
    if (!payload || !projectId) {
      return section;
    }

    try {
      const stepFiveInformation = await firstValueFrom(this.projectService.getStepFiveInformation(projectId));
      return {
        ...section,
        markdown: this.buildLossScenariosDocument(stepFiveInformation as unknown as Record<string, unknown>)
      };
    } catch (error) {
      console.error(
        `Failed to fetch Step 5 information via GET /api/projects/step_five_project_information/${projectId} for artifact export`,
        error
      );
      return section;
    }
  }

  private async resolveSectionImages(section: ArtifactDocumentSection): Promise<Map<string, DiagramImage>> {
    const images = new Map<string, DiagramImage>();

    if (typeof window === 'undefined') {
      return images;
    }

    const tokens = this.collectImageKeys(section.markdown);
    if (!tokens.size) {
      return images;
    }

    const payload = this.getFullDocumentPayload();
    if (!payload) {
      return images;
    }

    if (tokens.has(ISTAR_MODEL_IMAGE_KEY)) {
      const modelImage = await this.buildIstarModelImage(payload.step2Istar ?? null);
      if (modelImage) {
        images.set(ISTAR_MODEL_IMAGE_KEY, modelImage);
      }
    }

    if (tokens.has(CONTROL_STRUCTURE_IMAGE_KEY)) {
      const sketchImage = await this.buildControlStructureImage(payload.step3ControlStructure ?? null);
      if (sketchImage) {
        images.set(CONTROL_STRUCTURE_IMAGE_KEY, sketchImage);
      }
    }

    return images;
  }

  private collectImageKeys(markdown: string): Set<string> {
    const keys = new Set<string>();
    for (const line of markdown.split('\n')) {
      const match = line.trim().match(IMAGE_TOKEN_PATTERN);
      if (match) {
        keys.add(match[1].toLowerCase());
      }
    }
    return keys;
  }

  private getFullDocumentPayload(): FullProjectDocumentPayload | null {
    const payload = this.projectPayloadInput() ?? this.projectPayload();
    return payload ? (payload as FullProjectDocumentPayload) : null;
  }

  private async buildIstarModelImage(step2: Record<string, unknown> | null): Promise<DiagramImage | null> {
    try {
      const result = buildPistarModelFromStepTwoPayload(step2);
      if (!result) {
        return null;
      }
      const modelJson = JSON.stringify(result.model);
      return await captureIstarModelPng(modelJson);
    } catch (error) {
      console.error('Failed to build the Step 2 iStar4Safety model image.', error);
      return null;
    }
  }

  private async buildControlStructureImage(step3: Record<string, unknown> | null): Promise<DiagramImage | null> {
    try {
      const sketch = buildControlStructureSketchSvg(step3);
      if (!sketch) {
        return null;
      }
      return await rasterizeSvgToPng(sketch.svg, { width: sketch.width, height: sketch.height, scale: 2 });
    } catch (error) {
      console.error('Failed to build the Step 3 control structure image.', error);
      return null;
    }
  }

  private dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1] ?? '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
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