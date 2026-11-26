import { verifyToolTargets } from './tool-targets.mjs';

const operationInputs = {
  financial: {
    simple_interest: { principal: '1000.25', rate: '-0.001', periods: 8 },
    compound_interest: { principal: '1000.25', rate: '0.025', periods: 180 },
    annuity_payment: { principal: '1000.25', rate: '0', periods: 3, timing: 'begin' },
    equivalent_rate: { rate: '0.12', from_periods_per_year: 1, to_periods_per_year: 12 },
    irr: { flows: ['-100', '230', '-132'] },
    mirr: { flows: ['-100', '35', '85'], finance_rate: '0.05', reinvest_rate: '0.06' },
    npv: { flows: ['-100', '40', '100'], dates: ['2026-01-01', '2026-03-15', '2027-02-04'], rate: '0.075', day_count: 'act_365f' },
  },
  investment: {
    project: { initial: '12987.06', periods: 120, rate: '0.004', contribution: '50', withdrawal: '5',
      timing: 'end', inflation: '0.001', fee_rate: '0.002', fixed_fee: '1', tax_rate: '0.15', page_size: 20 },
  },
  loans: {
    price: { principal: '100000', rate: '0.0095', periods: 360, start_date: '2026-01-31', page_size: 40 },
    sac: { principal: '1900.50', rate: '0.03', periods: 13, start_date: '2026-01-31',
      extra_policy: 'reduce_payment', extra: [{ period: 4, amount: '55' }], rounding_scope: 'per_row' },
    single_payment: { principal: '1000', rate: '0.02', periods: 3, start_date: '2026-01-31' },
  },
  tax: {
    br_irrf: { date: '2026-11-25', gross: '6000', legal_deductions: '649.60' },
    br_inss: { date: '2026-11-25', gross: '10000' },
    br_payroll: { date: '2026-11-25', gross: '6000' },
    br_irpf: { date: '2026-12-31', gross: '78000' },
    br_investment_tax: { product: 'cdb', purchase_date: '2026-09-01', redemption_date: '2026-09-14', principal: '1000', redemption: '1100' },
    br_iof: { product: 'tesouro', purchase_date: '2026-09-01', redemption_date: '2026-09-14', principal: '1000', redemption: '1100' },
    br_icms: { date: '2026-11-25', gross: '1000' },
    br_ibs_cbs: { date: '2026-11-25', base: '1000', ancillary_obligations_met: true },
  },
  business: {
    price: { unit_cost: '100', markup: '0.25' },
    break_even: { unit_price: '10', variable_unit_cost: '8.03', fixed_accounting: '150', non_cash_fixed: '20' },
    plan: { periods: 40, revenue: '100', revenue_growth: '0.05', cost: '40', expenses: '20', initial_cash: '25',
      cash_receipts: '90', cash_payments: '65', discount_rate: '0.02', initial_investment: '10' },
  },
};
const modules = Object.keys(operationInputs);
function request(module, operation, input, currency = 'BRL') {
  return { schema: 1, module, operation, input: JSON.stringify(input),
    options: { currency, ...(module === 'tax' ? { rounding: 'half_up' } : {}) } };
}

for (const [module, cases] of Object.entries(operationInputs)) {
  const supported = Object.entries(cases).map(([operation, input]) => request(module, operation, input));
  const { operation, input, options } = supported[0];
  const recipe = { operation, input, options };
  const comparator = { ...request(module, 'scenario_compare', { reference: recipe, alternative: recipe }), options: {} };
  const malformed = Object.keys(cases).map((operation) => request(module, operation, { x: '1' }));
  const otherModules = modules.filter((id) => id !== module).map((id) => {
    const [operation, input] = Object.entries(operationInputs[id])[0];
    return request(id, operation, input);
  });
  await verifyToolTargets(module, [...supported, comparator, ...malformed], [supported[0]], otherModules);
}
