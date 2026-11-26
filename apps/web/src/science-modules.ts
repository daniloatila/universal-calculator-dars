export const scienceModules = [
  'statistics', 'probability', 'simulation', 'optimization', 'physics-engineering', 'graph-lab', 'data-lab',
] as const;

export type ScienceModule = (typeof scienceModules)[number];
export type CalculationScienceModule = Exclude<ScienceModule, 'data-lab'>;
