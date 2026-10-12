// Prints settings files in one canonical form, which their readers parse back
// to the same data: plain identifiers unquoted, single-quoted strings, two
// spaces of indent. Comments in the file are not kept.
import { Predicate } from 'effect';
import type { Json } from './literal';
import type { SiteSettings } from './site';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const quote = (text: string) =>
  `'${JSON.stringify(text).slice(1, -1).replaceAll("'", "\\'")}'`;

const key = (name: string) => (IDENTIFIER.test(name) ? name : quote(name));

function printValue(value: Json, indent: string): string {
  if (Predicate.isString(value)) return quote(value);

  if (value === null || Predicate.isNumber(value) || Predicate.isBoolean(value))
    return String(value);

  const inner = `${indent}  `;

  if (Array.isArray(value))
    return value.length === 0
      ? '[]'
      : `[\n${value.map(item => inner + printValue(item, inner)).join(',\n')}\n${indent}]`;

  const entries: Array<[string, Json]> = Object.entries(value);

  return entries.length === 0
    ? '{}'
    : `{\n${entries.map(([name, item]) => `${inner}${key(name)}: ${printValue(item, inner)}`).join(',\n')}\n${indent}}`;
}

/** The `site.ts` that declares these settings, leaving out unset ones. */
export function printSiteConfig(settings: SiteSettings): string {
  const defined: Record<string, Json> = {};

  if (settings.name !== undefined) defined.name = settings.name;
  if (settings.url !== undefined) defined.url = settings.url;
  if (settings.screens !== undefined && Object.keys(settings.screens).length)
    defined.screens = { ...settings.screens };

  return `import { defineSite } from 'venda';\n\nexport default defineSite(${printValue(defined, '')});\n`;
}
