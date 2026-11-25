export const operations = ['difference', 'age', 'period', 'calendar', 'business_days', 'deadline', 'timezone', 'duration'] as const;
export type Operation = typeof operations[number];
export type Field = 'start' | 'end' | 'birth' | 'asOf' | 'date' | 'instantStart' | 'instantEnd'
  | 'local' | 'years' | 'months' | 'weeks' | 'days' | 'count';
export type Values = Partial<Record<Field, string>>;
export type Disambiguation = 'reject' | 'earlier' | 'later';
export type Draft = {
  values: Values;
  overflow?: 'clamp' | 'reject';
  basis?: 'business' | 'civil';
  from?: string;
  to?: string;
  disambiguation?: Disambiguation;
};

export const fields: Readonly<Record<Operation, readonly Field[]>> = {
  difference: ['start', 'end'], age: ['birth', 'asOf'], period: ['date'], calendar: ['date'],
  business_days: ['start', 'end'], deadline: ['date'], timezone: ['local'], duration: ['instantStart', 'instantEnd'],
};
export const periodFields = ['years', 'months', 'weeks', 'days'] as const;
export const defaultWeekdays = [1, 2, 3, 4, 5] as const;
export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
export const zones = [
  'UTC', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Africa/Cairo', 'Asia/Kolkata',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
] as const;
export const fromDefault = 'America/New_York';
export const toDefault = 'UTC';
export const exampleDrafts: Readonly<Record<Operation, Draft>> = {
  difference: { values: { start: '2024-02-28', end: '2024-03-01' } },
  age: { values: { birth: '2000-02-29', asOf: '2024-03-01' } },
  period: { values: { date: '2024-01-31', months: '1' }, overflow: 'clamp' },
  calendar: { values: { date: '2024-02-29' } },
  business_days: { values: { start: '2024-01-08', end: '2024-01-15' } },
  deadline: { values: { date: '2024-01-08', count: '5' }, basis: 'business' },
  timezone: { values: { local: '2024-11-03T01:30:00' }, from: fromDefault, to: toDefault, disambiguation: 'earlier' },
  duration: { values: { instantStart: '2024-03-10T01:30:00-05:00', instantEnd: '2024-03-10T03:30:00-04:00' } },
};

export function placeholder(field: Field) {
  if (field === 'local') return 'YYYY-MM-DDTHH:MM:SS';
  if (field === 'instantStart' || field === 'instantEnd') return 'YYYY-MM-DDTHH:MM:SSZ';
  if (field === 'years' || field === 'months' || field === 'weeks' || field === 'days' || field === 'count') return '0';
  return 'YYYY-MM-DD';
}
