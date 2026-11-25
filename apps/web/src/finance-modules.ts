export const financeModules = ['financial', 'investment', 'loans', 'tax', 'business'] as const;
export type FinanceModule = (typeof financeModules)[number];
