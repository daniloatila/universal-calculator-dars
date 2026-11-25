import { useEffect, useRef } from 'react';
import type { AdaptivePolicy } from './adaptive';
import { createModuleFrames } from './module-frames';
import type { FrameDetail } from './module-frames';
import type { ModuleActivation } from './module-manager';
import type { Operation } from './tool-geometry-input';

type Point = readonly [number, number];
type Shape = Pick<ModuleActivation<unknown>, 'signal' | 'reportFailure' | 'resources'>;
type FramePolicy = Pick<AdaptivePolicy, 'graphicsFrameIntervalMs'>;
const width = 480;
const height = 238;
const strokeWidth = 2.6;

function scalar(value: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\/[+-]?\d+)?$/iu.test(value)) return NaN;
  const [top, bottom] = value.split('/');
  return Number(top) / Number(bottom ?? '1');
}

function coordinates(value: string): Point[] {
  const rows = value.trim().split(/[;\n|]/u);
  if (rows.length < 2 || rows.length > 33) return [];
  const points: Point[] = [];
  for (const row of rows) {
    const [x, y, z, ...extra] = row.trim().split(/\s+/u);
    if (!x || !y || extra.length) return [];
    const px = scalar(x);
    const py = scalar(y);
    if (![px, py, ...(z ? [scalar(z)] : [])].every((cell) => Number.isFinite(cell) && Math.abs(cell) <= 1e9)) return [];
    points.push([px, py]);
  }
  return points;
}

function pen(ctx: CanvasRenderingContext2D, points: readonly Point[], close = false, fill = false) {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(...first);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  if (close) ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill = false) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) ctx.fill();
  ctx.stroke();
}

function dots(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  const old = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = old;
}

function prism(ctx: CanvasRenderingContext2D, base: readonly Point[], paint: boolean) {
  const lifted: Point[] = base.map(([x, y]) => [x + 16, y - 23]);
  pen(ctx, lifted, true, paint);
  base.forEach(([x, y], index) => pen(ctx, [[x, y], lifted[index]!]));
  pen(ctx, base, true, paint);
}

function shape(ctx: CanvasRenderingContext2D, operation: Operation, full: boolean) {
  const box: Point[] = [[118, 55], [362, 55], [362, 180], [118, 180]];
  const corners: Point[] = [[119, 180], [336, 180], [169, 50]];
  switch (operation) {
    case 'rectangle': pen(ctx, box, true, full); break;
    case 'triangle': pen(ctx, corners, true, full); break;
    case 'circle':
    case 'sphere':
      oval(ctx, 240, 118, 79, 79, full);
      if (operation === 'sphere') oval(ctx, 240, 118, 79, 29);
      else {
        pen(ctx, [[240, 118], [319, 118]]);
        dots(ctx, [[240, 118]]);
      }
      break;
    case 'cylinder':
      oval(ctx, 240, 65, 89, 24, full);
      oval(ctx, 240, 172, 89, 24, full);
      pen(ctx, [[151, 65], [151, 172]]);
      pen(ctx, [[329, 65], [329, 172]]);
      break;
    case 'cone':
      oval(ctx, 240, 169, 95, 24, full);
      pen(ctx, [[145, 169], [240, 42], [335, 169]]);
      break;
    case 'prism': prism(ctx, corners, full); break;
    case 'polygon': pen(ctx, [[100, 111], [181, 52], [323, 62], [365, 148], [242, 189], [144, 164]], true, full); break;
    case 'distance': {
      const ends: Point[] = [[130, 172], [340, 64]];
      pen(ctx, ends);
      dots(ctx, ends);
      break;
    }
    case 'angle': {
      const vertices: Point[] = [[155, 56], [153, 172], [366, 160]];
      pen(ctx, vertices);
      dots(ctx, vertices);
      break;
    }
    case 'segments':
      pen(ctx, [[121, 173], [362, 59]]);
      pen(ctx, [[132, 59], [350, 173]]);
  }
}

function draw(canvas: HTMLCanvasElement, operation: Operation, text: string, detail: FrameDetail) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const full = detail === 'full';
  const ratio = full ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.dataset.detail = detail;
  canvas.dataset.draws = String(Number(canvas.dataset.draws ?? 0) + 1);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const style = getComputedStyle(canvas);
  const accent = style.getPropertyValue('--accent').trim() || '#87c6ff';
  const grid = style.getPropertyValue('--line').trim() || '#334764';
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  if (full) {
    for (let x = 24; x < width; x += 24) pen(ctx, [[x, 0], [x, height]]);
    for (let y = 24; y < height; y += 24) pen(ctx, [[0, y], [width, y]]);
  }
  ctx.strokeStyle = accent;
  ctx.fillStyle = style.getPropertyValue('--tint').trim() || '#213952';
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const points = coordinates(text);
  const minimum = operation === 'segments' ? 4 : operation === 'distance' ? 2 : 3;
  const usable = operation === 'prism' || operation === 'polygon' ? points.length >= minimum : points.length === minimum;
  if (!usable) {
    shape(ctx, operation, full);
    return;
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const spanX = Math.max(...xs) - x0;
  const spanY = Math.max(...ys) - y0;
  const scale = Math.min((width - 106) / (spanX || 1), (height - 88) / (spanY || 1));
  if (!Number.isFinite(scale)) {
    shape(ctx, operation, full);
    return;
  }
  const screen = points.map(([x, y]): Point => [
    width / 2 + (x - x0 - spanX / 2) * scale,
    height / 2 - (y - y0 - spanY / 2) * scale,
  ]);
  if (operation === 'prism') prism(ctx, screen, full);
  else if (operation === 'segments') {
    pen(ctx, screen.slice(0, 2));
    ctx.setLineDash([8, 5]);
    pen(ctx, screen.slice(2, 4));
    ctx.setLineDash([]);
  } else pen(ctx, screen, operation === 'polygon', full && operation === 'polygon');
  dots(ctx, screen);
  if (full && screen.length <= 4 && operation !== 'polygon' && operation !== 'prism') {
    ctx.fillStyle = accent;
    ctx.font = '17px system-ui';
    screen.forEach(([x, y], index) => ctx.fillText(String.fromCharCode(65 + index), x + 9, y - 5));
  }
}

export function GeometryDiagram({ scope, policy, operation, coordinateText, title, caption }: {
  scope: Shape;
  policy: FramePolicy;
  operation: Operation;
  coordinateText: string;
  title: string;
  caption: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = useRef<ReturnType<typeof createModuleFrames> | null>(null);
  const input = useRef({ operation, coordinateText, policy });
  useEffect(() => {
    const view = canvas.current;
    if (!view) return;
    const scheduler = createModuleFrames(scope, input.current.policy, (_, detail) =>
      draw(view, input.current.operation, input.current.coordinateText, detail));
    frames.current = scheduler;
    const theme = new MutationObserver(() => scheduler.invalidate());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    systemTheme.addEventListener('change', scheduler.invalidate);
    scheduler.invalidate();
    return scope.resources.own('graphics', () => {
      theme.disconnect();
      systemTheme.removeEventListener('change', scheduler.invalidate);
      scheduler.close();
      frames.current = null;
      view.width = 0;
      view.height = 0;
    });
  }, [scope]);
  useEffect(() => {
    input.current = { operation, coordinateText, policy };
    frames.current?.setPolicy(policy);
    frames.current?.invalidate();
  }, [operation, coordinateText, policy]);
  return <figure className="geometry-diagram">
    <canvas ref={canvas} width={width} height={height} role="img" aria-label={title}>{title}</canvas>
    <figcaption>{caption}</figcaption>
  </figure>;
}
