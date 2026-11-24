import { useState } from 'react';
import type { ModuleActivation } from '../../../src/module-manager';
import type { PrimaryModule } from '../../../src/module-registry';
import { trace } from './control';

type NoteState = { draft: string };
trace.imported.push('note');

export function activate(scope: ModuleActivation<NoteState>): PrimaryModule<NoteState> {
  let draft = scope.previousState?.draft ?? '';
  return {
    Workspace() {
      const [value, setValue] = useState(draft);
      return <label>Fixture note{' '}
        <input value={value} onChange={(event) => {
          draft = event.target.value;
          setValue(draft);
        }} />
      </label>;
    },
    snapshot: () => ({ draft }),
  };
}
