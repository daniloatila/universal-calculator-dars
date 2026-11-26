import type { Locale } from './i18n';
import { draftDecimal, localizedDecimal, localizeExpression, normalizeExpression, normalizeSignedDigits } from './locale-format';
import type { LocalizedDraft } from './locale-format';
import type { CalculationScienceModule } from './science-modules';

export type Draft = Record<string, LocalizedDraft>;
type Kind = 'decimal' | 'integer' | 'formula' | 'formulas' | 'series' | 'matrix' | 'constraints' | 'text' | 'choice' | 'boolean';
export type Field = {
  key: string;
  kind: Kind;
  example: string;
  choices?: readonly string[];
  place?: 'options' | 'parameters' | 'units';
  optional?: boolean;
  advanced?: boolean;
};
export type Operation = { id: string; fields: readonly Field[]; group?: string };
type Option = string | boolean | number;

const field = (key: string, kind: Kind, example: string, config: Partial<Field> = {}): Field => ({ key, kind, example, ...config });
const decimal = (key: string, example = '1', config?: Partial<Field>) => field(key, 'decimal', example, config);
const integer = (key: string, example = '1', config?: Partial<Field>) => field(key, 'integer', example, config);
const choice = (key: string, choices: readonly string[], config?: Partial<Field>) => field(key, 'choice', choices[0]!, { choices, ...config });
const toggle = (key: string, config?: Partial<Field>) => field(key, 'boolean', 'false', config);
const formula = (key: string, example: string) => field(key, 'formula', example);
const series = (key: string, example = '1 2 3 4 5', config?: Partial<Field>) => field(key, 'series', example, config);
const matrix = (key: string, example: string) => field(key, 'matrix', example);
const op = (id: string, ...fields: Field[]): Operation => ({ id, fields });
const advanced = { advanced: true, optional: true } as const;
const option = { place: 'options' } as const;
const optionalOption = { ...option, ...advanced };
const measure = [choice('missing', ['reject', 'omit'], optionalOption)];
const significance = [decimal('alpha', '0.05', optionalOption),
  choice('alternative', ['two_sided', 'less', 'greater'], optionalOption)];
const inference = [...measure, ...significance];
const x = series('x', '1 2 3 4 5');
const y = series('y', '2 4 5 8 9');
const distribution = (id: string, parameters: Record<string, string>) =>
  [id, Object.entries(parameters).map(([name, value]) => decimal(name, value, { place: 'parameters' }))] as const;
export const distributions: Readonly<Record<string, readonly Field[]>> = Object.fromEntries([
  distribution('normal', { mean: '0', sd: '1' }), distribution('bernoulli', { p: '0.5' }),
  distribution('binomial', { n: '10', p: '0.5' }), distribution('negative_binomial', { r: '4', p: '0.5' }),
  distribution('geometric', { p: '0.5' }), distribution('poisson', { lambda: '3' }),
  distribution('hypergeometric', { population: '20', successes: '8', draws: '5' }),
  distribution('discrete_uniform', { minimum: '1', maximum: '6' }), distribution('uniform', { minimum: '0', maximum: '1' }),
  distribution('lognormal', { log_mean: '0', log_sd: '1' }), distribution('exponential', { rate: '1' }),
  distribution('gamma', { shape: '2', rate: '1' }), distribution('beta', { alpha: '2', beta: '3' }),
  distribution('weibull', { shape: '2', scale: '1' }), distribution('student_t', { df: '10' }),
  distribution('chi_squared', { df: '4' }), distribution('fisher_f', { df1: '5', df2: '10' }),
]);
const distributionChoice = choice('distribution', Object.keys(distributions));
const probabilityQueries = [
  decimal('x', '0', { optional: true }), decimal('lower', '-1', advanced), decimal('upper', '1', advanced),
  decimal('probability', '0.975', advanced), integer('sample_count', '', advanced), field('seed', 'text', '', advanced),
  integer('plot_points', '65', advanced),
];
const models = ['distribution', 'random_walk', 'finance', 'historical_risk'] as const;
const simulationShared = [
  field('seed', 'text', '42'), integer('samples', '10000'), decimal('threshold', '0', advanced),
  integer('bins', '20', advanced), decimal('confidence_level', '0.95', advanced),
];
const simFields: Readonly<Record<string, readonly Field[]>> = {
  random_walk: [decimal('start', '0'), decimal('drift', '0.01'), decimal('sd'), integer('steps', '12'),
    decimal('shock', '', advanced)],
  finance: [decimal('initial', '1000'), decimal('contribution', '100'), decimal('drift', '0.01'),
    decimal('volatility', '0.05'), integer('steps', '12'), decimal('risk_level', '0.95', advanced),
    field('currency', 'text', 'BRL', advanced), decimal('shock', '', advanced)],
  historical_risk: [series('losses', '1 2 3 4 5'), decimal('risk_level', '0.95')],
};
const root = formula('expression', 'x^2-2');
const minimum = formula('expression', '(x-3)^2+2');
const rootBounds = [decimal('lower', '0', option), decimal('upper', '2', option)];
const minimumBounds = [decimal('lower', '-5', option), decimal('upper', '7', option)];
const optimizationTuning = [decimal('tolerance', '0.00000001', optionalOption), integer('max_iterations', '400', optionalOption)];
const multidim = [formula('expression', '(1-x)^2+100*(y-x^2)^2'), integer('dimensions', '2', optionalOption),
  decimal('initial', '-1.2', option), decimal('initial_y', '1', option), decimal('initial_z', '', optionalOption),
  ...['lower', 'upper', 'y_lower', 'y_upper', 'z_lower', 'z_upper'].map((key) => decimal(key, '', optionalOption)),
  ...optimizationTuning,
];
const graphWindow = (lower: string, upper: string, samples: string) => [
  decimal('lower', lower, option), decimal('upper', upper, option), integer('samples', samples, option),
  ...['a', 'b', 'c'].map((key, index) => decimal(key, index === 0 ? '1' : '0', optionalOption)),
];
const graphSurface = [...graphWindow('-3', '3', '20'), decimal('y_lower', '-3', optionalOption), decimal('y_upper', '3', optionalOption)];

function physical(group: string, id: string, values: Record<string, string>): Operation {
  return { group, id, fields: Object.entries(values).flatMap(([key, value]) => [
    value.includes(' ') ? series(key, value) : decimal(key, value),
    field(key, 'text', '', { place: 'units', ...advanced }),
  ]) };
}

export const scienceOperations: Record<CalculationScienceModule, readonly Operation[]> = {
  statistics: [
    op('descriptive', series('values'), choice('population', ['false', 'true'], option), choice('quantile', ['type7', 'type1'], optionalOption),
      choice('kurtosis', ['excess', 'pearson'], optionalOption), series('weights', '', advanced),
      series('percentiles', '0.1 0.9', advanced), ...measure),
    op('relationship', x, y, choice('population', ['false', 'true'], option), ...measure),
    op('regression', matrix('predictors', '1 2\n2 1\n3 4\n4 1\n5 3'), series('response', '5 5 11 9 13'), ...measure),
    op('mean_test', series('values'), decimal('null_mean', '0'), decimal('known_sd', '', advanced), ...inference),
    op('difference_test', x, y, toggle('paired'), decimal('null_difference', '0', advanced), ...inference),
    op('proportion_test', integer('successes', '12'), integer('trials', '20'), decimal('p0', '0.5'), ...significance),
    op('chi_square', series('observed', '25 10 15'), series('expected', '20 15 15'), decimal('alpha', '0.05', optionalOption)),
    op('chi_square_independence', matrix('table', '15 25\n30 20'), decimal('alpha', '0.05', optionalOption)),
    op('anova', matrix('groups', '3 4 5\n5 6 7\n6 7 9'), decimal('alpha', '0.05', optionalOption), ...measure),
    op('rank_test', x, y, ...inference),
    op('sign_test', x, y, decimal('null_difference', '0', advanced), ...inference),
  ],
  probability: [
    op('distribution', distributionChoice, ...probabilityQueries),
    op('events', decimal('p_a', '0.6'), decimal('p_b', '0.5'), decimal('p_ab', '0.3')),
  ],
  simulation: [op('monte_carlo', choice('model', models), ...simulationShared)],
  optimization: [
    op('bisection', root, ...rootBounds, ...optimizationTuning),
    op('newton', root, decimal('initial', '1', option), ...optimizationTuning),
    op('secant', root, decimal('initial', '1', option), decimal('second', '2', option), ...optimizationTuning),
    op('hybrid', root, ...rootBounds, ...optimizationTuning),
    op('minimize_univariate', minimum, ...minimumBounds, ...optimizationTuning),
    op('maximize_univariate', formula('expression', '2-(x-3)^2'), ...minimumBounds, ...optimizationTuning),
    op('gradient_descent', ...multidim), op('bfgs', ...multidim), op('nelder_mead', ...multidim),
    op('linear_program', choice('sense', ['maximize', 'minimize']), series('objective', '1 2'),
      field('constraints', 'constraints', '1 1 <= 4\n0 1 <= 2')),
  ],
  'physics-engineering': [
    physical('electricity', 'ohm', { voltage: '12', resistance: '6' }),
    physical('mechanics', 'uniform_motion', { initial_position: '0', velocity: '3', time: '10' }),
    physical('mechanics', 'accelerated_motion', { initial_position: '0', initial_velocity: '3', acceleration: '2', time: '10' }),
    physical('mechanics', 'force', { mass: '5', acceleration: '3' }),
    physical('mechanics', 'work', { force: '5', displacement: '3' }),
    physical('mechanics', 'energy', { mass: '5', speed: '3', height: '10' }),
    physical('mechanics', 'power', { work: '50', time: '5' }),
    physical('mechanics', 'momentum', { mass: '5', velocity: '3' }),
    physical('mechanics', 'impulse', { force: '5', time: '3' }),
    physical('mechanics', 'circular_motion', { mass: '5', speed: '3', radius: '2' }),
    physical('mechanics', 'gravitation', { mass_a: '1000000', mass_b: '5', distance: '10' }),
    physical('electricity', 'electrical_power', { voltage: '12', current: '2' }),
    physical('electricity', 'electrical_energy', { power: '24', time: '60' }),
    physical('electricity', 'resistors_series', { resistances: '3 6 9' }),
    physical('electricity', 'resistors_parallel', { resistances: '3 6 9' }),
    physical('electricity', 'capacitance', { capacitance: '0.001', voltage: '12' }),
    physical('electricity', 'inductance', { inductance: '0.1', current: '3' }),
    physical('electricity', 'rlc_series', { resistance: '12', inductance: '0.1', capacitance: '0.01', frequency: '60' }),
    physical('thermodynamics', 'temperature', { temperature: '293.15' }),
    physical('thermodynamics', 'heat', { mass: '2', specific_heat: '4184', temperature_change: '10' }),
    physical('thermodynamics', 'heat_conduction', { conductivity: '2', area: '3', temperature_change: '10', thickness: '0.1' }),
    physical('thermodynamics', 'ideal_gas', { amount: '2', temperature: '293.15', volume: '0.1' }),
    physical('thermodynamics', 'pressure', { force: '50', area: '2' }),
    physical('thermodynamics', 'thermodynamic_work', { pressure: '100000', volume_change: '0.2' }),
    physical('thermodynamics', 'efficiency', { useful_energy: '50', input_energy: '100' }),
    physical('fluids', 'density', { mass: '2', volume: '0.002' }),
    physical('fluids', 'hydrostatic_pressure', { density: '1000', depth: '3' }),
    physical('fluids', 'buoyancy', { density: '1000', volume: '0.5' }),
    physical('fluids', 'flow_rate', { area: '0.2', speed: '3' }),
    physical('fluids', 'continuity', { area_a: '0.2', speed_a: '3', area_b: '0.4' }),
    physical('fluids', 'bernoulli', { density: '1000', pressure_a: '100000', speed_a: '3', height_a: '2', speed_b: '2', height_b: '5' }),
    physical('engineering', 'stress_strain', { force: '1000', area: '0.1', length: '3', length_change: '0.01' }),
    physical('engineering', 'elasticity', { modulus: '200000000000', strain: '0.001' }),
    physical('engineering', 'torque', { force: '30', lever_arm: '0.2' }),
    physical('engineering', 'wave', { wavelength: '0.5', frequency: '20' }),
  ],
  'graph-lab': [
    op('explicit', field('expressions', 'formulas', 'sin(x)\ncos(x)'), ...graphWindow('-6', '6', '128'),
      toggle('find_roots', optionalOption), toggle('find_intersections', optionalOption)),
    op('parametric', formula('x', 'cos(t)'), formula('y', 'sin(t)'), ...graphWindow('0', '6.28', '128')),
    op('polar', formula('r', '1+cos(t)'), ...graphWindow('0', '6.28', '128')),
    op('implicit', formula('expression', 'x^2+y^2-1'), ...graphSurface),
    op('surface', formula('expression', 'sin(x)*cos(y)'), ...graphSurface),
    op('space_curve', formula('x', 'cos(t)'), formula('y', 'sin(t)'), formula('z', 't'), ...graphWindow('-6', '6', '128')),
  ],
};

export const fieldId = (entry: Field) => entry.place ? entry.place + '.' + entry.key : entry.key;

export function visibleFields(module: CalculationScienceModule, operation: Operation, draft: Draft): readonly Field[] {
  if (module === 'probability' && operation.id === 'distribution' || module === 'simulation') {
    if (module === 'simulation') {
      const model = draft.model?.text || 'distribution';
      if (model !== 'distribution') return [operation.fields[0]!, ...(simFields[model] ?? []),
        ...(model === 'historical_risk' ? [] : operation.fields.slice(1))];
    }
    const selected = draft.distribution?.text || 'normal';
    return module === 'simulation'
      ? [operation.fields[0]!, distributionChoice, ...distributions[selected] ?? [], ...operation.fields.slice(1)]
      : [operation.fields[0]!, ...distributions[selected] ?? [], ...operation.fields.slice(1)];
  }
  return operation.fields;
}

export function exampleField(entry: Field, locale: Locale): LocalizedDraft {
  return { text: ['decimal', 'series', 'matrix', 'formula', 'formulas', 'constraints'].includes(entry.kind)
    ? localizeExpression(entry.example, localizedDecimal(locale)) : entry.example, locale };
}

function numeric(text: string, decimalSeparator: string): string {
  if (decimalSeparator !== '.' && text.includes('.')) throw new TypeError('invalid_input');
  const canonical = normalizeSignedDigits(text).replaceAll(decimalSeparator, '.');
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?(?:\/[+-]?[0-9]+)?$/u.test(canonical)) {
    throw new TypeError('invalid_input');
  }
  return canonical;
}

function readField(entry: Field, draft: LocalizedDraft): unknown {
  const text = draft.text.trim();
  const separator = draftDecimal(draft);
  const readSeries = (line: string) => line.trim().split(/[\s;؛]+/u)
    .map((item) => /^(_|null)$/u.test(item) ? null : numeric(item, separator));
  switch (entry.kind) {
    case 'decimal': return numeric(text, separator);
    case 'integer': {
      const canonical = normalizeSignedDigits(text);
      if (!/^[+-]?[0-9]+$/u.test(canonical) || !Number.isSafeInteger(Number(canonical))) throw new TypeError('invalid_input');
      return Number(canonical);
    }
    case 'formula': return normalizeExpression(text, separator);
    case 'formulas': return text.split(/\r?\n/u).map((line) => normalizeExpression(line.trim(), separator)).filter(Boolean);
    case 'series': return readSeries(text);
    case 'matrix': return text.split(/\r?\n/u).filter((line) => line.trim()).map(readSeries);
    case 'constraints': return text.split(/\r?\n/u).filter((line) => line.trim()).map((line) => {
      const parts = /^(.+?)\s*(<=|>=|=)\s*(\S+)$/u.exec(line.trim());
      if (!parts) throw new TypeError('invalid_input');
      return { coefficients: readSeries(parts[1]!), relation: parts[2], rhs: numeric(parts[3]!, separator) };
    });
    case 'boolean': return text === 'true';
    case 'choice': return text === 'true' ? true : text === 'false' ? false : text;
    case 'text': return entry.key === 'seed' ? normalizeSignedDigits(text) : text;
  }
}

export function scienceRequest(module: CalculationScienceModule, operation: Operation, entries: readonly Field[], draft: Draft) {
  const canonical: Record<string, unknown> = {};
  const original: Record<string, unknown> = {};
  const options: Record<string, Option> = {};
  const origins = new Set<Locale>();
  for (const entry of entries) {
    const cell = draft[fieldId(entry)];
    if (!cell?.text.trim()) {
      if (entry.optional) continue;
      throw new TypeError('invalid_input');
    }
    const value = readField(entry, cell);
    if (!['choice', 'boolean', 'text'].includes(entry.kind)) origins.add(cell.locale);
    if (entry.place === 'options') {
      if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') throw new TypeError('invalid_input');
      options[entry.key] = value;
    } else if (entry.place) {
      ((canonical[entry.place] ??= {}) as Record<string, unknown>)[entry.key] = value;
      ((original[entry.place] ??= {}) as Record<string, unknown>)[entry.key] = cell.text;
    } else {
      canonical[entry.key] = value;
      original[entry.key] = cell.text;
    }
  }
  const onlyExpression = module === 'optimization' && operation.id !== 'linear_program';
  return {
    input: onlyExpression ? String(canonical.expression) : JSON.stringify(canonical),
    original_input: onlyExpression ? String(original.expression) : JSON.stringify(original),
    options, origin: origins.size === 1 ? origins.values().next().value : undefined,
  };
}
