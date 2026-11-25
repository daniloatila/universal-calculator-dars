import { useState } from 'react';
import type { Messages } from './i18n';

const bases = ['binary', 'octal', 'decimal', 'hexadecimal'] as const;
type BaseName = typeof bases[number];
type Word = Readonly<Record<BaseName, string>>;
const pageSize = 64;

export function decodeWord(result: string | undefined): Word | null {
  if (!result) return null;
  const match = /^binary=([01]{1,1024}); octal=([0-7]+); decimal=(-?\d+); hexadecimal=([0-9A-F]+)$/u.exec(result);
  return match?.[1] && match[2] && match[3] && match[4]
    ? { binary: match[1], octal: match[2], decimal: match[3], hexadecimal: match[4] } : null;
}

export function RadixValues({ word, original, labels }: {
  word: Word | null;
  original?: string;
  labels: Messages['programmer']['representations'];
}) {
  if (!word) return original ?? '—';
  return <dl>{bases.map((base) => <div key={base} data-base={base}>
    <dt>{labels[base]}</dt><dd><bdi dir="ltr">{word[base]}</bdi></dd>
  </div>)}</dl>;
}

export function BitPreview({ binary, signed, messages, format }: {
  binary: string;
  signed: boolean;
  messages: Messages['programmer'];
  format: (value: string) => string;
}) {
  const [page, setPage] = useState(0);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, binary.length);
  const word = binary.slice(start, end);
  const chunks = Array.from({ length: Math.ceil(word.length / 8) }, (_, index) => word.slice(index * 8, index * 8 + 8));
  const count = (value: number) => format(String(value));
  const range = (high: number, low: number) => high === low ? count(high) : `${count(high)}–${count(low)}`;
  const sign = binary[0]!;

  return <div className="programmer-bit-preview">
    <div className="programmer-bit-title">
      <strong>{messages.bitPreview}</strong>
      {signed && <span>{messages.signBit} <bdi dir="ltr">{sign}</bdi></span>}
    </div>
    <ul className="programmer-bits" role="list" dir="ltr" aria-label={messages.bitPreview}>
      {chunks.map((chunk, index) => {
        const high = binary.length - 1 - start - index * 8;
        const low = high - chunk.length + 1;
        const position = range(high, low);
        return <li className="programmer-bit-group" key={high}
          aria-label={messages.bitGroup.replace('{range}', position).replace('{bits}', chunk)}>
          <span aria-hidden="true">{position}</span>
          <div className="programmer-bit-cells" aria-hidden="true">
            {Array.from(chunk, (value, bit) => <span key={bit} data-bit={value}
              data-sign-bit={signed && start === 0 && index === 0 && bit === 0 || undefined}>{value}</span>)}
          </div>
        </li>;
      })}
    </ul>
    {binary.length > pageSize && <div className="programmer-pages">
      <button type="button" className="quiet-action" disabled={start === 0} onClick={() => setPage(page - 1)}>{messages.previous}</button>
      <span>{messages.previewRange.replace('{range}', range(binary.length - 1 - start, binary.length - end))}</span>
      <button type="button" className="quiet-action" disabled={end === binary.length} onClick={() => setPage(page + 1)}>{messages.next}</button>
    </div>}
  </div>;
}
