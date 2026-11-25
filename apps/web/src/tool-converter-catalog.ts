const storage = ['bit', 'B', 'kbit', 'Mbit', 'Gbit', 'Tbit', 'kB', 'MB', 'GB', 'TB', 'Kibit', 'Mibit', 'Gibit', 'Tibit', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

export const catalog = {
  length: ['nm', 'um', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi', 'nmi'],
  area: ['mm^2', 'cm^2', 'm^2', 'km^2', 'in^2', 'ft^2', 'yd^2', 'mi^2', 'ha', 'acre'],
  volume: ['mL', 'cL', 'dL', 'L', 'cm^3', 'm^3', 'in^3', 'ft^3', 'gal_us', 'gal_imp', 'qt_us', 'pt_us', 'fl_oz_us'],
  mass: ['mg', 'g', 'kg', 't', 'oz', 'lb', 'st'],
  time: ['ns', 'us', 'ms', 's', 'min', 'h', 'd', 'wk'],
  temperature: ['K', 'degC', 'degF', 'degR'],
  temperature_delta: ['delta_K', 'delta_degC', 'delta_degF', 'delta_degR'],
  speed: ['m/s', 'km/h', 'cm/s', 'ft/s', 'mph', 'kn'],
  acceleration: ['m/s^2', 'cm/s^2', 'ft/s^2', 'g0'],
  pressure: ['Pa', 'kPa', 'MPa', 'bar', 'mbar', 'atm', 'psi', 'Torr', 'mmHg'],
  energy: ['J', 'kJ', 'MJ', 'Wh', 'kWh', 'cal_th', 'kcal_th', 'eV', 'BTU_IT'],
  power: ['W', 'kW', 'MW', 'hp_mech', 'hp_metric'],
  force: ['N', 'kN', 'MN', 'dyn', 'kgf', 'lbf'],
  angle: ['rad', 'deg', 'grad', 'turn', 'arcmin', 'arcsec'],
  storage,
  transfer: storage.map((unit) => `${unit}/s`),
  fuel: ['km/L', 'mpg_us', 'mpg_imp', 'L/100km', 'L/km'],
} satisfies Readonly<Record<string, readonly string[]>>;

export type Category = keyof typeof catalog;
export type Pair = { from: string; to: string };
export const categoryList = Object.keys(catalog) as Category[];
export const defaultPairs: Readonly<Record<Category, Pair>> = {
  length: { from: 'm', to: 'cm' }, area: { from: 'ha', to: 'm^2' }, volume: { from: 'L', to: 'mL' },
  mass: { from: 'kg', to: 'g' }, time: { from: 'h', to: 'min' }, temperature: { from: 'degC', to: 'degF' },
  temperature_delta: { from: 'delta_degC', to: 'delta_degF' }, speed: { from: 'm/s', to: 'km/h' },
  acceleration: { from: 'g0', to: 'm/s^2' }, pressure: { from: 'atm', to: 'kPa' },
  energy: { from: 'kWh', to: 'J' }, power: { from: 'kW', to: 'W' }, force: { from: 'N', to: 'kN' },
  angle: { from: 'deg', to: 'rad' }, storage: { from: 'MB', to: 'MiB' }, transfer: { from: 'Mbit/s', to: 'MB/s' },
  fuel: { from: 'mpg_us', to: 'L/100km' },
};

export const currencies = ['USD', 'EUR', 'BRL', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'ARS', 'MXN', 'INR', 'KRW', 'NZD', 'ZAR', 'PLN'] as const;

export function unitSymbol(id: string) {
  const symbols: Readonly<Record<string, string>> = {
    um: 'µm', us: 'µs', deg: '°', degC: '°C', degF: '°F', degR: '°R',
    delta_K: 'ΔK', delta_degC: 'Δ°C', delta_degF: 'Δ°F', delta_degR: 'Δ°R',
    gal_us: 'US gal', gal_imp: 'imp gal', qt_us: 'US qt', pt_us: 'US pt', fl_oz_us: 'US fl oz',
    cal_th: 'calₜₕ', kcal_th: 'kcalₜₕ', BTU_IT: 'BTUᵢₜ', hp_mech: 'hp', hp_metric: 'PS',
    g0: 'g₀', mpg_us: 'US mpg', mpg_imp: 'imp mpg', arcmin: '′', arcsec: '″',
  };
  if (Object.hasOwn(symbols, id)) return symbols[id] ?? id;
  return id.replaceAll('^2', '²').replaceAll('^3', '³').replace('L/100km', 'L/100 km');
}
