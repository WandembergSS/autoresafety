/**
 * Browser-only helpers for turning diagrams into raster images that can be embedded into the
 * PDF / DOCX artifacts.
 *
 * - `rasterizeSvgToPng` converts an SVG string into a PNG data URL using an offscreen canvas.
 * - `captureIstarModelPng` renders a saved piStar model with the real iStar4Safety engine inside a
 *   hidden iframe and exports the resulting diagram as a PNG.
 */

export interface DiagramImage {
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_RASTER_WIDTH = 2200;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSvgDataUrl(svg: string): string {
  if (svg.startsWith('data:')) {
    return svg;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Rasterizes an SVG (string markup or `data:` URL) to a PNG data URL on a white background.
 */
export async function rasterizeSvgToPng(
  svg: string,
  options: { width: number; height: number; scale?: number; background?: string }
): Promise<DiagramImage> {
  if (!isBrowser()) {
    throw new Error('SVG rasterization is only available in the browser runtime.');
  }

  const { width, height } = options;
  const background = options.background ?? '#ffffff';
  const requestedScale = options.scale ?? 2;
  const safeWidth = Math.max(1, width);
  const cappedScale = Math.min(requestedScale, MAX_RASTER_WIDTH / safeWidth);
  const scale = Math.max(1, cappedScale);

  const image = new Image();
  image.crossOrigin = 'anonymous';

  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load SVG for rasterization.'));
  });

  image.src = toSvgDataUrl(svg);
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(safeWidth * scale);
  canvas.height = Math.round(Math.max(1, height) * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to acquire a 2D canvas context for rasterization.');
  }

  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height
  };
}

interface PistarFrameWindow extends Window {
  pistarLoadModelFromText?: (value: string) => void;
  istar?: {
    paper?: {
      fitToContent?: (options: Record<string, unknown>) => void;
      getArea?: () => { width: number; height: number };
    };
    graph?: { getCells?: () => unknown[] };
    fileManager?: { saveSvg?: (paper: unknown) => string };
  };
}

async function waitForPistarReady(frameWindow: PistarFrameWindow, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof frameWindow.pistarLoadModelFromText === 'function' && frameWindow.istar?.fileManager?.saveSvg) {
      return true;
    }
    await delay(120);
  }
  return false;
}

async function waitForModelRender(frameWindow: PistarFrameWindow, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cellCount = frameWindow.istar?.graph?.getCells?.()?.length ?? 0;
    if (cellCount > 0) {
      // Give JointJS a brief moment to finish positioning/links after cells appear.
      await delay(350);
      return;
    }
    await delay(120);
  }
}

/**
 * Renders a saved piStar model inside a hidden iframe and returns a PNG of the diagram.
 * Returns `null` when the engine cannot be reached or the model fails to render.
 */
export async function captureIstarModelPng(
  modelJson: string,
  options?: { pistarUrl?: string; scale?: number }
): Promise<DiagramImage | null> {
  if (!isBrowser()) {
    return null;
  }

  const pistarUrl = options?.pistarUrl ?? '/assets/pistar/iStar4Safety.html';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1600px';
  iframe.style.height = '1200px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  iframe.src = pistarUrl;

  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out loading the iStar4Safety engine.')), 15000);
      iframe.addEventListener(
        'load',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });

    const frameWindow = iframe.contentWindow as PistarFrameWindow | null;
    if (!frameWindow) {
      return null;
    }

    const ready = await waitForPistarReady(frameWindow, 12000);
    if (!ready || typeof frameWindow.pistarLoadModelFromText !== 'function') {
      return null;
    }

    frameWindow.pistarLoadModelFromText(modelJson);
    await waitForModelRender(frameWindow, 6000);

    const paper = frameWindow.istar?.paper;
    paper?.fitToContent?.({ padding: 24, allowNewOrigin: 'any', minWidth: 200, minHeight: 200 });
    await delay(150);

    const saveSvg = frameWindow.istar?.fileManager?.saveSvg;
    if (typeof saveSvg !== 'function' || !paper) {
      return null;
    }

    const svgDataUrl = saveSvg(paper);
    if (!svgDataUrl || typeof svgDataUrl !== 'string') {
      return null;
    }

    const area = paper.getArea?.() ?? { width: 1200, height: 900 };
    const width = Math.max(200, Math.round(area.width));
    const height = Math.max(200, Math.round(area.height));

    return await rasterizeSvgToPng(svgDataUrl, { width, height, scale: options?.scale ?? 2 });
  } catch (error) {
    console.error('Failed to capture the iStar4Safety model image.', error);
    return null;
  } finally {
    iframe.remove();
  }
}
