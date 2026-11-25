import { LOCALES } from './i18n';
import type { Locale, Messages } from './i18n';
import { localizedDecimal } from './locale-format';

export default function InputNotation({ origin, locale, messages, id }: {
  origin?: Locale | readonly Locale[];
  locale: Locale;
  messages: Messages;
  id: string;
}) {
  const sources = [...new Set(typeof origin === 'string' ? [origin] : origin ?? [])]
    .filter((source) => source !== locale);
  if (!sources.length) return null;
  const [prefix, suffix] = messages.inputNotation.retained.split('{language}');
  return <small className="input-notation" id={id}>
    {sources.map((source, index) => <span key={source}>
      {index > 0 && ' '}
      {prefix}
      <bdi>{LOCALES[source].name}</bdi>
      {suffix?.replace('{decimal}', localizedDecimal(source))}
    </span>)}
  </small>;
}
