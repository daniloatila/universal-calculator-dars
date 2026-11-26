import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { AdaptivePolicy } from './adaptive';
import { LOCALES } from './i18n';
import type { Locale } from './i18n';
import { createModuleFrames } from './module-frames';
import type { FrameDetail } from './module-frames';
import type { ModuleActivation } from './module-manager';

type Data = Record<string, unknown>;
type Point = [number, number, number?];
type Point2 = [number, number, number];
type Line = { label: string; points: (Point | null)[] };
type Bin = { lower: number; upper: number; count: number };
type Chart = { lines: Line[]; mesh: (Point | null)[][]; bars: boolean; bins?: Bin[]; axis: string };
type Camera = { scale: number; x: number; y: number; yaw: number; pitch: number };
type Scope = Pick<ModuleActivation<unknown>, 'signal' | 'reportFailure' | 'resources'>;
type Policy = Pick<AdaptivePolicy, 'graphicsFrameIntervalMs'>;
const home: Camera = { scale: 1, x: 0, y: 0, yaw: -0.62, pitch: 0.63 };
const W = 720;
const H = 420;
const colors = ['#55a8ec', '#df784e', '#1caf93', '#b87ed6', '#b48a26', '#e36e9e'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Data => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const point = (value: unknown): Point | null => Array.isArray(value) && value.length >= 2 && value.length <= 3
  && value.every(finite) ? value as Point : null;

function chartData(result: Data): Chart {
  const lines: Line[] = [];
  const mesh: Chart['mesh'] = [];
  if (Array.isArray(result.series)) {
    for (const entry of result.series) {
      if (object(entry) && Array.isArray(entry.points)) {
        lines.push({ label: String(entry.label), points: entry.points.map(point) });
      }
    }
  }
  if (object(result.grid) && Array.isArray(result.grid.x) && Array.isArray(result.grid.y) && Array.isArray(result.grid.z)) {
    const { x, y, z } = result.grid;
    z.forEach((row, j) => {
      if (Array.isArray(row)) mesh.push(row.map((value, i) =>
        finite(x[i]) && finite(y[j]) && finite(value) ? [x[i], y[j], value] : null));
    });
  }
  if (object(result.plot) && Array.isArray(result.plot.points)) {
    lines.push({ label: String(result.plot.kind), points: result.plot.points.map((entry) =>
      object(entry) && finite(entry.x) && finite(entry.y) ? [entry.x, entry.y] : null) });
    return { lines, mesh, bars: result.plot.kind === 'mass',
      axis: result.plot.kind === 'density' ? 'density_probability' : 'mass' };
  }
  if (object(result.histogram) && Array.isArray(result.histogram.edges) && Array.isArray(result.histogram.counts)) {
    const { counts, edges } = result.histogram;
    const bins = counts.flatMap((count,index) => {
      const lower = edges[index];
      const upper = edges[index + 1];
      return finite(lower) && finite(upper) && finite(count) ? [{ lower, upper, count }] : [];
    });
    lines.push({ label: 'histogram', points: bins.map(({ lower, upper, count }) => [(lower + upper) / 2, count]) });
    return { lines, mesh, bars: true, bins, axis: 'frequency' };
  }
  return { lines, mesh, bars: false, axis: 'y' };
}

function range(points: Point[], dimension: 0 | 1 | 2, minimum = false) {
  let low = minimum ? 0 : Infinity;
  let high = minimum ? 0 : -Infinity;
  for (const p of points) {
    const value = p[dimension] ?? 0;
    low = Math.min(value, low);
    high = Math.max(value, high);
  }
  return !Number.isFinite(low) || !Number.isFinite(high) ? [-1, 1] as const : [low, high] as const;
}

function path(ctx: CanvasRenderingContext2D, points: readonly (Point2 | null)[]) {
  let skip = true;
  ctx.beginPath();
  for (const entry of points) {
    if (!entry) { skip = true; continue; }
    const [x,y] = entry;
    if (skip) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
    skip = false;
  }
  ctx.stroke();
}

function render(canvas: HTMLCanvasElement, chart: Chart, camera: Camera, points: Point[], dimension: boolean,
  detail: FrameDetail, surface: boolean, equal: boolean, selected: Point | undefined, locale: Locale, axis: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx || ctx.isContextLost()) return [];
  const ratio = detail === 'full' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  if (canvas.width !== Math.round(W * ratio) || canvas.height !== Math.round(H * ratio)) {
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const [x0,x1] = chart.bins?.length ? [chart.bins[0]!.lower, chart.bins.at(-1)!.upper] : range(points, 0);
  const [y0,y1] = range(points, 1, chart.bars);
  const [z0,z1] = range(points, 2);
  const xmid = (x0 + x1) / 2;
  const ymid = (y0 + y1) / 2;
  const zmid = (z0 + z1) / 2;
  const dx = x1 - x0 || 2;
  const dy = y1 - y0 || 2;
  const dz = z1 - z0 || 2;
  const horizontal = camera.scale * (W - 124) / dx;
  const vertical = camera.scale * (H - 110) / dy;
  const xScale = equal ? Math.min(horizontal, vertical) : horizontal;
  const yScale = equal ? xScale : vertical;
  const spaceScale = camera.scale * (H - 105) / Math.max(dx,dy,dz);
  const [cx, sx] = [Math.cos(camera.yaw), Math.sin(camera.yaw)];
  const [cy, sy] = [Math.cos(camera.pitch), Math.sin(camera.pitch)];
  const project = ([x,y,z = 0]: Point): Point2 => {
    if (!dimension) return [W / 2 + camera.x + (x - xmid) * xScale, H / 2 + camera.y - (y - ymid) * yScale, 0];
    const u = x - xmid;
    const v = y - ymid;
    const p = z - zmid;
    const q = sx * u + cx * v;
    return [W / 2 + camera.x + (u * cx - v * sx) * spaceScale,
      H / 2 + camera.y - (q * sy + p * cy) * spaceScale, q * cy - p * sy];
  };
  const style = getComputedStyle(canvas);
  const grid = style.getPropertyValue('--line').trim() || '#43546b';
  const text = style.getPropertyValue('--muted').trim() || '#859cbc';
  const accent = style.getPropertyValue('--accent').trim() || '#55a8ec';
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  ctx.strokeStyle = grid;
  ctx.fillStyle = text;
  ctx.font = '15px system-ui';
  const format = new Intl.NumberFormat(LOCALES[locale].format, { maximumSignificantDigits: 4 });
  if (!dimension) {
    const steps = detail === 'full' ? 8 : 4;
    for (let i = 0; i <= steps; i++) {
      const x = xmid + (i / steps - 0.5) * dx / camera.scale;
      const y = ymid + (i / steps - 0.5) * dy / camera.scale;
      const [px,py] = project([x,y]);
      if (px > 42 && px < W - 37) {
        path(ctx, [[px,26,0],[px,H-37,0]]);
        ctx.fillText(format.format(x), px - 14, H - 14);
      }
      if (py > 23 && py < H - 36) {
        path(ctx, [[40,py,0],[W-27,py,0]]);
        ctx.fillText(format.format(y), 5, py - 4);
      }
    }
    ctx.fillText('x', W - 24, H - 15);
    ctx.fillText(axis, 24, 18);
    ctx.strokeStyle = text;
    const [zx, zy] = project([0,0]);
    if (zx > 39 && zx < W - 26) path(ctx, [[zx,26,0],[zx,H-37,0]]);
    if (zy > 25 && zy < H - 35) path(ctx, [[40,zy,0],[W-27,zy,0]]);
  } else {
    const origin: Point = [x0,y0,z0];
    [[x1,y0,z0],[x0,y1,z0],[x0,y0,z1]].forEach((end, i) => {
      const p = project(end as Point);
      path(ctx, [project(origin), p]);
      ctx.fillText('xyz'[i]!, p[0] + 5, p[1] - 5);
    });
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(38, 22, W - 65, H - 56);
  ctx.clip();
  if (chart.mesh.length) {
    const rows = chart.mesh.map((row) => row.map((p) => p && project(p)));
    if (surface && detail === 'full') {
      const faces: Point2[][] = [];
      for (let j = 1; j < rows.length; j++) {
        for (let i = 1; i < rows[j]!.length; i++) {
          const face = [rows[j-1]?.[i-1],rows[j-1]?.[i],rows[j]?.[i],rows[j]?.[i-1]];
          if (face.every((p) => p != null)) faces.push(face as Point2[]);
        }
      }
      const depth = (face: Point2[]) => face.reduce((sum,p) => sum + p[2],0);
      faces.sort((a,b) => depth(a) - depth(b));
      ctx.fillStyle = style.getPropertyValue('--tint').trim() || '#294a67';
      ctx.strokeStyle = grid;
      for (const face of faces) {
        path(ctx, [...face,face[0]!]);
        ctx.fill();
      }
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = detail === 'full' ? 1 : 0.85;
    const stride = detail === 'full' ? 1 : 2;
    rows.forEach((row,index) => { if (index % stride === 0) path(ctx, row); });
    const columns = rows[0]?.length ?? 0;
    for (let i = 0; i < columns; i += stride) path(ctx, rows.map((row) => row[i] ?? null));
  }
  chart.lines.forEach((line, index) => {
    ctx.strokeStyle = ctx.fillStyle = colors[index % colors.length] ?? accent;
    ctx.lineWidth = 2.3;
    if (chart.bins) {
      const baseline = project([0,0])[1];
      for (const { lower, upper, count } of chart.bins) {
        const [x,y] = project([lower, count]);
        const width = (upper - lower) * xScale;
        ctx.fillRect(width < 2 ? x - 2 : x + 0.5, y, Math.max(4, width - 1), baseline - y);
      }
    } else if (chart.bars) {
      const xs = line.points.flatMap((p) => p ? [project(p)[0]] : []);
      const barWidth = Math.max(2, Math.min(22, xs.length > 1 ? Math.abs(xs[1]! - xs[0]!) * 0.66 : 16));
      const baseline = project([0,0])[1];
      for (const p of line.points) {
        if (!p) continue;
        const [x,y] = project(p);
        ctx.fillRect(x - barWidth / 2, y, barWidth, baseline - y);
      }
    } else path(ctx, line.points.map((p) => p && project(p)));
  });
  if (selected) {
    const [x,y] = project(selected);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  canvas.dataset.detail = detail;
  canvas.dataset.draws = String(Number(canvas.dataset.draws ?? 0) + 1);
  return points.map(project);
}

function download(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  try { link.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(link.href), 0); }
}

export default function ScienceChart({ scope, policy, result, label, title, locale }: {
  scope: Scope; policy: Policy; result: Data; label(key: string): string; title: string; locale: Locale;
}) {
  const view = useRef<HTMLCanvasElement>(null);
  const frames = useRef<ReturnType<typeof createModuleFrames> | null>(null);
  const projected = useRef<Point2[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [camera, setCamera] = useState(home);
  const [cursor, setCursor] = useState(0);
  const [surface, setSurface] = useState(true);
  const [equal, setEqual] = useState(() => ['parametric', 'polar', 'implicit'].some((kind) => kind === result.kind));
  const [contextLost, setContextLost] = useState(false);
  const chart = useMemo(() => chartData(result), [result]);
  const points = useMemo(() => [...chart.lines.flatMap((line) => line.points), ...chart.mesh.flat()]
    .filter((p): p is Point => p !== null), [chart]);
  const dimension = points.some((p) => p.length === 3);
  const selected = points[Math.min(cursor, Math.max(0, points.length - 1))];
  const state = useRef({ chart, camera, points, dimension, surface, equal, selected, locale, axis: label(chart.axis) });
  const formatter = new Intl.NumberFormat(LOCALES[locale].format, { maximumSignificantDigits: 9 });
  useEffect(() => {
    const canvas = view.current;
    if (!canvas) return;
    const scheduler = createModuleFrames(scope, policy, (_, detail) => {
      const input = state.current;
      projected.current = render(canvas, input.chart, input.camera, input.points, input.dimension, detail, input.surface,
        input.equal, input.selected, input.locale, input.axis);
    });
    frames.current = scheduler;
    const theme = new MutationObserver(scheduler.invalidate);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    systemTheme.addEventListener('change', scheduler.invalidate);
    const contextlost = () => setContextLost(true);
    const contextrestored = () => { setContextLost(false); scheduler.invalidate(); };
    canvas.addEventListener('contextlost', contextlost);
    canvas.addEventListener('contextrestored', contextrestored);
    scheduler.invalidate();
    return scope.resources.own('graphics', () => {
      frames.current = null;
      scheduler.close();
      theme.disconnect();
      systemTheme.removeEventListener('change', scheduler.invalidate);
      projected.current = [];
      canvas.removeEventListener('contextlost', contextlost);
      canvas.removeEventListener('contextrestored', contextrestored);
      canvas.width = 0;
      canvas.height = 0;
    });
  }, [scope]);
  const axis = label(chart.axis);
  useEffect(() => {
    state.current = { chart, camera, points, dimension, surface, equal, selected, locale, axis };
    frames.current?.setPolicy(policy);
    frames.current?.invalidate();
  }, [policy, chart, camera, points, dimension, surface, equal, selected, locale, axis]);
  function zoom(multiplier: number) {
    setCamera((old) => ({ ...old, scale: Math.min(16, Math.max(0.2, old.scale * multiplier)) }));
  }
  function move(x: number, y: number, rotate: boolean) {
    setCamera((old) => rotate
      ? { ...old, yaw: old.yaw + x / 155, pitch: Math.min(1.48, Math.max(-1.48, old.pitch + y / 155)) }
      : { ...old, x: old.x + x, y: old.y + y });
  }
  function locate(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.moved) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * W;
    const y = (event.clientY - box.top) / box.height * H;
    let best = Infinity;
    let closest = 0;
    projected.current.forEach(([px,py], index) => {
      const distance = (x-px)**2 + (y-py)**2;
      if (distance < best) { best = distance; closest = index; }
    });
    setCursor(closest);
  }
  function exportData() {
    if (chart.bins) {
      const csv = ['lower,upper,count', ...chart.bins.map(({ lower, upper, count }) => [lower, upper, count].join(','))];
      download(new Blob([csv.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), 'dars-graph-data.csv');
      return;
    }
    const records = ['series,segment,x,y,z'];
    chart.lines.forEach((line, index) => {
      let segment = 1;
      for (const p of line.points) {
        if (p) records.push([index+1,segment,p[0],p[1],p[2] ?? ''].join(','));
        else segment++;
      }
    });
    chart.mesh.forEach((row,index) => row.forEach((p) => {
      if (p) records.push([chart.lines.length + 1,index+1,...p].join(','));
    }));
    download(new Blob([records.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), 'dars-graph-data.csv');
  }
  return <figure className="science-chart" data-testid="science-chart">
    <canvas width={W} height={H} ref={view} role="img" aria-label={title} data-testid="science-canvas"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX,y: event.clientY,moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const x = event.clientX - drag.current.x;
        const y = event.clientY - drag.current.y;
        if (Math.abs(x) + Math.abs(y) < 2) return;
        drag.current = { x: event.clientX,y: event.clientY,moved: true };
        move(x * 1.25,y * 1.25,dimension && !event.shiftKey);
      }}
      onPointerUp={(event) => { locate(event); drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      {title}
    </canvas>
    <figcaption>{label(contextLost ? 'context_lost' : points.length ? 'inspect_hint' : 'no_plot_data')}</figcaption>
    {chart.lines.length > 0 && <ul className="science-legend" aria-label={label('legend')}>
      {chart.lines.map((line,index) => <li key={index}><i aria-hidden="true" style={{ backgroundColor: colors[index % colors.length] }} />
        <bdi>{line.label === 'density' ? label('density_probability') : label(line.label)}</bdi></li>)}
    </ul>}
    <div role="group" aria-label={label('view_controls')} className="science-actions">
      <button type="button" onClick={() => zoom(1.25)} aria-label={label('zoom_in')}>+</button>
      <button type="button" onClick={() => zoom(0.8)} aria-label={label('zoom_out')}>−</button>
      <button type="button" onClick={() => move(-32,0,false)} aria-label={label('pan_left')}>←</button>
      <button type="button" onClick={() => move(32,0,false)} aria-label={label('pan_right')}>→</button>
      <button type="button" onClick={() => move(0,-32,false)} aria-label={label('pan_up')}>↑</button>
      <button type="button" onClick={() => move(0,32,false)} aria-label={label('pan_down')}>↓</button>
      {dimension && <button type="button" onClick={() => move(60,0,true)}>{label('rotate')}</button>}
      {dimension && <button type="button" onClick={() => move(0,32,true)}>{label('tilt')}</button>}
      {!dimension && !chart.bars && <button type="button" aria-pressed={equal} onClick={() => setEqual(!equal)}>{label('equal_axes')}</button>}
      {chart.mesh.length > 0 && <button type="button" aria-pressed={surface} onClick={() => setSurface(!surface)}>{label('surface')}</button>}
      <button type="button" onClick={() => setCamera(home)}>{label('reset_view')}</button>
    </div>
    {selected && <label className="science-inspector">
      <span>{label('plot_point')}</span>
      <input type="range" min={0} max={points.length - 1} value={Math.min(cursor,points.length-1)}
        onChange={(event) => setCursor(Number(event.currentTarget.value))} />
      <output dir="ltr">{selected.map((value,index) => 'xyz'[index] + ' ' + formatter.format(value ?? 0)).join(' · ')}</output>
    </label>}
    <div className="science-actions">
      <button type="button" disabled={contextLost || !points.length} onClick={() => view.current?.toBlob((blob) => {
        if (blob && !scope.signal.aborted) download(blob, 'dars-graph.png');
      })}>{label('export_png')}</button>
      <button type="button" disabled={!points.length} onClick={exportData}>{label('export_graph_csv')}</button>
    </div>
  </figure>;
}
