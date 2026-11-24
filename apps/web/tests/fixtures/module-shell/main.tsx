import { createRoot } from 'react-dom/client';
import App from '../../../src/app';
import { loadMessages } from '../../../src/i18n';
import { registerModule } from '../../../src/module-registry';
import '../../../src/styles.css';
import { trace } from './control';

Reflect.set(window, 'darsModuleShellTest', trace);
const modules = [
  registerModule({
    id: 'note-fixture',
    describe: () => ({ title: 'Note fixture', description: 'A synthetic text module.' }),
    load: () => import('./note-fixture'),
  }),
  registerModule({
    id: 'chart-fixture',
    describe: () => ({ title: 'Chart fixture', description: 'A synthetic chart module.' }),
    load: () => import('./chart-fixture'),
  }),
];

const container = document.getElementById('app');
if (!container) throw new Error('The module fixture requires a container.');
void loadMessages('en').then((initialLanguage) => {
  createRoot(container).render(<App initialLanguage={initialLanguage} modules={modules} moduleOptions={{ startupMs: 600 }} />);
});
