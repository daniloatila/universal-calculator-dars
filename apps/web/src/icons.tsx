import type { ReactNode } from 'react';

const paths = {
  gear: <><circle cx="12" cy="12" r="3"/><path d="M9.2 3.6h5.6l.6 2.4 2 .9 2.2-1.1 2 3.5-1.7 1.8v2l1.7 1.8-2 3.5-2.3-1-2 .9-.5 2.1H9.2l-.6-2.1-2-.9-2.2 1-2-3.5 1.7-1.8v-2L2.4 9.3l2-3.5 2.2 1.1 2-.9.6-2.4Z"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.5 2"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 5V4H4v12h1"/></>,
  undo: <path d="m9 5-4 4 4 4M5 9h8a5 5 0 0 1 0 10H9"/>,
  redo: <path d="m15 5 4 4-4 4m4-4h-8a5 5 0 0 0 0 10h4"/>,
  backspace: <path d="M21 6H9l-6 6 6 6h12V6Zm-9 3 6 6m0-6-6 6"/>,
  trash: <><path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 3v7m4-7v7"/></>,
  arrow: <path d="M7 17 17 7M7 7h10v10"/>,
  lock: <><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10m-3.5 4v2"/></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[name]}
  </svg>;
}
