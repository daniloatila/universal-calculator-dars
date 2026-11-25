import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'converter', operation, input, options, ...extra });
const convert = (input, from, to, extra = {}) => build('convert', input, { from, to }, extra);
const quote = {
  from: 'USD', to: 'BRL', rate: '5.25', source: 'Synthetic manual rate',
  as_of: '2026-02-04', valid_until: '2026-02-06', reference_date: '2026-02-05',
};
const cases = [
  convert('1.25', 'm', 'cm'), convert('1', 'mi', 'km'), convert('-1/8', 'in', 'mm'),
  convert('2', 'ha', 'm^2'), convert('1.5', 'm²', 'cm2'),
  convert('1', 'gal_us', 'L'), convert('1', 'gal_imp', 'L'), convert('1000', 'L', 'm^3'),
  convert('1', 'lb', 'kg'), convert('2.5', 'd', 'h'), convert('3001', 'ms', 's'),
  convert('0', 'degC', 'degF'), convert('-459.67', 'degF', 'K'), convert('-459.671', 'degF', 'K'),
  convert('-18', 'delta_degF', 'delta_degC'), convert('10', 'degC', 'delta_degF'),
  convert('1', 'kn', 'km/h'), convert('1', 'g0', 'm/s^2'),
  convert('1', 'Torr', 'Pa'), convert('1', 'mmHg', 'Pa'), convert('760', 'mmHg', 'Torr'),
  convert('1/3', 'kWh', 'J'), convert('1', 'eV', 'J'),
  convert('1', 'hp_mech', 'W'), convert('1', 'lbf', 'N'),
  convert('180', 'deg', 'rad'), convert('1', 'rad', 'deg'), convert('1/2', 'turn', 'deg'),
  convert('1', 'MB', 'MiB'), convert('8', 'Mbit/s', 'MB/s'), convert('1', 'Mbps', 'MiB/s'),
  convert('5', 'L/100km', 'mpg_us'), convert('7', 'km/L', 'mpg_imp'), convert('0', 'mpg_us', 'L/100km'),
  convert('1', 'm', 's'), convert('1', 'unknown_unit', 'm'), convert('globalThis.exit(0)', 'm', 'cm'),
  convert('0.5', 'm', 'cm', { original_input: '0,5' }),
  build('currency', '100', quote),
  build('currency', '-5/3', { ...quote, reference_date: '2026-02-06' }),
  build('currency', '100', { ...quote, reference_date: '2026-02-07' }),
  build('currency', '100', { ...quote, reference_date: '2026-02-03' }),
  build('currency', '100', { ...quote, valid_until: undefined }),
  build('currency', '100', { ...quote, as_of: '2025-02-29' }),
  build('currency', '100', { ...quote, rate: '0' }),
  build('currency', '100', { ...quote, source: '   ' }),
];
const workloads = [cases[0], cases[12], cases[19], cases[31], cases[38]];
await verifyToolTargets('converter', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
  build('derivative', 'x^2', {}, { module: 'calculus' }),
  build('determinant', '1 2;3 4', {}, { module: 'linear_algebra' }),
  build('rectangle', '1 2', {}, { module: 'geometry' }),
  build('prime', '97', {}, { module: 'discrete-mathematics' }),
  build('convert', '15', {}, { module: 'programmer' }),
]);
