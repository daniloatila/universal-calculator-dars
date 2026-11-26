import assert from 'node:assert/strict';
import { verifyToolTargets } from './tool-targets.mjs';

const bound = 1e-12;
const quantityNumber = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/u;

function compareTree(wasm, native, path, numericStrings) {
  const numeric = typeof native === 'number' || (numericStrings && typeof native === 'string'
    && typeof wasm === 'string' && quantityNumber.test(native) && quantityNumber.test(wasm));
  if (numeric) {
    const a = Number(wasm);
    const b = Number(native);
    assert.equal(typeof wasm, typeof native, path);
    assert(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= bound*Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: WASM ${wasm}, native ${native}`);
  } else if (native !== null && typeof native === 'object') {
    assert(wasm !== null && typeof wasm === 'object', path);
    assert.equal(Array.isArray(wasm), Array.isArray(native), path);
    assert.deepEqual(Object.keys(wasm).sort(), Object.keys(native).sort(), path);
    for (const key of Object.keys(native)) compareTree(wasm[key], native[key], `${path}.${key}`, numericStrings);
  } else {
    assert.deepEqual(wasm, native, path);
  }
}

function compareScience(wasm, native, source) {
  if (!native.ok || native.proof.exactness !== 'approximate') {
    assert.deepEqual(wasm, native, source);
    return;
  }
  assert.equal(wasm.ok, true, source);
  const { result: wasmResult, variables: wasmVars, ...wasmMetadata } = wasm.proof;
  const { result: nativeResult, variables: nativeVars, ...nativeMetadata } = native.proof;
  assert.deepEqual(wasmMetadata, nativeMetadata, source);
  const { residual: wasmResidual, ...wasmVariables } = wasmVars;
  const { residual: nativeResidual, ...nativeVariables } = nativeVars;
  assert.deepEqual(wasmVariables, nativeVariables, source);
  compareTree(wasmResidual === undefined ? undefined : Number(wasmResidual),
    nativeResidual === undefined ? undefined : Number(nativeResidual), `${source}.proof.variables.residual`, false);
  compareTree(JSON.parse(wasmResult), JSON.parse(nativeResult), `${source}.proof.result`, native.proof.operation === 'rlc_series');
}

const request = (module, operation, data, options = {}, extra = {}) => ({
  schema: 1, module, operation, input: typeof data === 'string' ? data : JSON.stringify(data), options, ...extra,
});
const result = (module) => (operation, data, options, extra) => request(module, operation, data, options, extra);
const optimization = result('optimization');
const physics = result('physics-engineering');
const graph = result('graph-lab');

const bracket = { lower: '0', upper: '2' };
const rosenbrock = '(1-x)^2+100*(y-x^2)^2';
const minimization = { initial: '-1.2', initial_y: '1', tolerance: '1e-8' };
const lp = (rhs) => ({ objective: ['1','2'], constraints: [{ coefficients: ['1','1'], relation: '<=', rhs }], sense: 'maximize' });
const optimizationCases = [
  optimization('bisection','x^2-2',bracket), optimization('hybrid','x^2-2',bracket),
  optimization('newton','cos(x)-x',{ initial: '1' }), optimization('secant','x^2-2',{ initial: '1', second: '2' }),
  optimization('minimize_univariate','(x-3)^2+2',{ lower: '-5', upper: '7' }),
  optimization('maximize_univariate','2-(x-3)^2',{ lower: '-5', upper: '7' }),
  optimization('gradient_descent','x^2+y^2',{ initial: '1.2', initial_y: '0.5' }),
  optimization('bfgs',rosenbrock,minimization), optimization('nelder_mead',rosenbrock,minimization),
  optimization('linear_program',lp('4')), optimization('linear_program',lp('-4')),
  optimization('linear_program',{ ...lp('4'), constraints: [] }),
  optimization('bisection','1/(x-0.123)',bracket), optimization('bisection','x^2-2',{ ...bracket, max_iterations: 1 }),
  optimization('newton','1e16+x-1e16',{ initial: '1' }), optimization('newton','process(x)',{ initial: '1' }),
  optimization('bisection','x^2-2.0',bracket,{ original_input: 'x^2−2,0' }),
];

const physicsCases = [
  physics('ohm',{ voltage:'12', resistance:'6' }),
  physics('ohm',{ voltage:'12000', resistance:'0.006', units:{ voltage:'mV', resistance:'kΩ' } }),
  physics('ohm',{ voltage:'12', resistance:'6', units:{ resistance:'kg' } }),
  physics('accelerated_motion',{ initial_position:'0', initial_velocity:'3', acceleration:'2', time:'10' }),
  physics('gravitation',{ mass_a:'1000000', mass_b:'5', distance:'10' }),
  physics('resistors_parallel',{ resistances:['3','6','9'] }),
  physics('rlc_series',{ resistance:'12', inductance:'0.1', capacitance:'0.01', frequency:'60' }),
  physics('temperature',{ temperature:'32', units:{ temperature:'degF' } }),
  physics('temperature',{ temperature:'-1000' }),
  physics('heat',{ mass:'2', specific_heat:'4184', temperature_change:'18', units:{ temperature_change:'delta_degF' } }),
  physics('ideal_gas',{ amount:'2', temperature:'300', volume:'1' }),
  physics('bernoulli',{ density:'1000', pressure_a:'100000', speed_a:'3', height_a:'2', speed_b:'2', height_b:'5' }),
  physics('stress_strain',{ force:'1000', area:'0.1', length:'3', length_change:'0.01' }),
  physics('wave',{ wavelength:'0.5', frequency:'20' }),
];

const graphCases = [
  graph('explicit',{ expressions:['sin(x)','cos(x)'] },{ samples:96, find_roots:true, find_intersections:true }),
  graph('explicit',{ expressions:['a*sin(x)+b+c*x'] },{ a:'3', b:'2', c:'-0.5' }),
  graph('explicit',{ expressions:['tan(x)'] },{ lower:'1', upper:'2', samples:32, find_roots:true }),
  graph('explicit',{ expressions:['1/(x-0.013)'] },{ find_roots:true }),
  graph('explicit',{ expressions:['sqrt(1-x^2)'] },{ lower:'-2', upper:'2', samples:65 }),
  graph('explicit',{ expressions:['sin(1000*x)'] },{ samples:16 }),
  graph('explicit',{ expressions:['1e16+x-1e16'] },{ find_roots:true }),
  graph('parametric',{ x:'cos(t)', y:'sin(t)' }), graph('polar',{ r:'1+cos(t)' }),
  graph('implicit',{ expression:'x^2+y^2-1' },{ samples:32 }),
  graph('implicit',{ expression:'x*y' },{ lower:'-1', upper:'1', y_lower:'-1', y_upper:'1', samples:16 }),
  graph('surface',{ expression:'sin(x)*cos(y)' },{ samples:32 }),
  graph('surface',{ expression:'1/(x-y)' }), graph('space_curve',{ x:'cos(t)', y:'sin(t)', z:'t' }),
  graph('surface',{ expression:'Math.sin(x)' }), graph('surface',{ expression:'x' },{ samples:33 }),
];

const calculus = request('calculus', 'derivative', 'x^2');
const converter = request('converter', 'convert', '1', { from: 'km', to: 'm' });

await verifyToolTargets('optimization', optimizationCases, [optimizationCases[0], optimizationCases[7], optimizationCases[9]],
  [physicsCases[0], graphCases[0], calculus], compareScience);
await verifyToolTargets('physics-engineering', physicsCases, [physicsCases[0], physicsCases[4], physicsCases[6], physicsCases[10]],
  [optimizationCases[0], graphCases[0], converter], compareScience);
await verifyToolTargets('graph-lab', graphCases, [graphCases[0], graphCases[9], graphCases[11], graphCases[13]],
  [optimizationCases[0], physicsCases[0], calculus], compareScience);
