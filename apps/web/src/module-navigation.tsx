import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale, Messages } from './i18n';
import type { RegisteredModule } from './module-registry';
import { financeModules } from './finance-modules';
import { scienceModules } from './science-modules';

interface ModuleNavigationProps {
  modules: readonly RegisteredModule[];
  selectedId: string | null;
  locale: Locale;
  messages: Messages;
  select(id: string): void;
  children: ReactNode;
}

export default function ModuleNavigation({ modules, selectedId, locale, messages, select, children }: ModuleNavigationProps) {
  const [search, setSearch] = useState('');
  const searchable = modules.length > 5;
  const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase(locale);
  const query = searchable ? fold(search.trim()) : '';
  const matches = modules.map((module) => ({ id: module.id, ...module.describe(messages) }))
    .filter(({ id, title, description }) => !query || id === selectedId || fold(id + ' ' + title + ' ' + description).includes(query));
  const groups = [
    [messages.science.labels.math_category, matches.filter(({ id }) =>
      !financeModules.some((module) => module === id) && !scienceModules.some((module) => module === id))],
    [messages.science.labels.finance_category, matches.filter(({ id }) => financeModules.some((module) => module === id))],
    [messages.science.labels.science_category, matches.filter(({ id }) => scienceModules.some((module) => module === id))],
  ] as const;

  return <nav className="module-navigation" aria-label={messages.tools.navigation}>
    <div className="module-navigation-picker">
      {searchable && <label>
        <span>{messages.tools.search}</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
      </label>}
      <label>
        <span>{messages.operations.modulePicker}</span>
        <select value={selectedId ?? ''} onChange={(event) => select(event.currentTarget.value)}>
          {searchable ? groups.filter(([, options]) => options.length).map(([group, options]) =>
            <optgroup key={group} label={group}>
              {options.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
            </optgroup>) : matches.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
        </select>
      </label>
    </div>
    <div className="module-navigation-actions">{children}</div>
  </nav>;
}
