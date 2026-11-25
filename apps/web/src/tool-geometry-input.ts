export const operations = [
  'rectangle', 'circle', 'triangle', 'polygon', 'sphere', 'cylinder', 'cone', 'prism',
  'distance', 'angle', 'segments',
] as const;
export type Operation = typeof operations[number];
export const units = ['u', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'] as const;
export type Unit = typeof units[number];
export type Dimension = 'width' | 'length' | 'radius' | 'height' | 'sideA' | 'sideB' | 'sideC';
export type Draft = { dimensions: Partial<Record<Dimension, string>>; coordinates?: string };

export const dimensions: Readonly<Record<Operation, readonly Dimension[]>> = {
  rectangle: ['width', 'length'], circle: ['radius'], triangle: ['sideA', 'sideB', 'sideC'], polygon: [],
  sphere: ['radius'], cylinder: ['radius', 'height'], cone: ['radius', 'height'], prism: ['height'],
  distance: [], angle: [], segments: [],
};
export const coordinateOperations = new Set<Operation>(['polygon', 'prism', 'distance', 'angle', 'segments']);
const rightTriangle = '0 0\n3 0\n0 4';
const rectangularBase = '0 0\n4 0\n4 3\n0 3';
export const examples: Readonly<Record<Operation, Draft>> = {
  rectangle: { dimensions: { width: '3', length: '4' } },
  circle: { dimensions: { radius: '2' } },
  triangle: { dimensions: { sideA: '3', sideB: '4', sideC: '5' } },
  polygon: { dimensions: {}, coordinates: rectangularBase },
  sphere: { dimensions: { radius: '3' } },
  cylinder: { dimensions: { radius: '2', height: '3' } },
  cone: { dimensions: { radius: '3', height: '4' } },
  prism: { dimensions: { height: '2' }, coordinates: rightTriangle },
  distance: { dimensions: {}, coordinates: '0 0\n3 4' },
  angle: { dimensions: {}, coordinates: '1 0\n0 0\n0 1' },
  segments: { dimensions: {}, coordinates: '0 0\n4 4\n0 4\n4 0' },
};

export function normalizedRows(text: string, normalize: (value: string) => string): string {
  return text.split(/([;؛；])/u).map((entry, index) => index % 2 ? ';' : normalize(entry)).join('');
}

export function expressionFor(operation: Operation, draft: Draft, normalize?: (value: string) => string): string {
  const scalar = dimensions[operation].map((name) => {
    const value = draft.dimensions[name]?.trim() ?? '';
    return normalize?.(value) ?? value;
  }).join(' ');
  if (!coordinateOperations.has(operation)) return scalar;
  const coordinates = draft.coordinates ?? '';
  const basis = (normalize ? normalizedRows(coordinates, normalize) : coordinates).trim();
  return operation === 'prism' ? `${basis}|${scalar}` : basis;
}
