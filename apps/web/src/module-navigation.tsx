import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale, Messages } from './i18n';
import type { RegisteredModule } from './module-registry';

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

  return <nav className="module-navigation" aria-label={messages.tools.navigation}>
    <div className="module-navigation-picker">
      {searchable && <label>
        <span>{messages.tools.search}</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
      </label>}
      <label>
        <span>{messages.operations.modulePicker}</span>
        <select value={selectedId ?? ''} onChange={(event) => select(event.currentTarget.value)}>
          {matches.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
        </select>
      </label>
    </div>
    <div className="module-navigation-actions">{children}</div>
  </nav>;
}
