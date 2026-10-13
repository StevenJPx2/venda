// The site's settings (site.ts): print them, or change some and save the file
// from the SHA it was read at, as Settings → General does.
import type { SiteSettings } from '@venda/contract';
import { request } from '../client';
import { report, type Context } from '../context';
import { CliFailure } from '../failure';

interface Settings {
  readonly name: string | null;
  readonly url: string | null;
  readonly screens: Readonly<Record<string, string>>;
}

/** `name=…`, `url=…` and `screen.<id>=…` applied to `settings`; an empty name or url removes it. */
export function withChanges(settings: Settings, pairs: ReadonlyArray<string>) {
  let { name, url } = settings;
  const screens = { ...settings.screens };

  for (const pair of pairs) {
    const at = pair.indexOf('=');
    const key = pair.slice(0, at);
    const value = pair.slice(at + 1);

    if (at < 0 || !/^(name|url|screen\..+)$/.test(key))
      throw new CliFailure(
        'BadArgument',
        `${pair}: expected name=…, url=… or screen.<id>=…`
      );

    if (key === 'name') name = value.trim() || null;
    else if (key === 'url') url = value.trim() || null;
    else screens[key.slice('screen.'.length)] = value;
  }

  return { name, url, screens };
}

const describe = (settings: Settings) =>
  [
    `name: ${settings.name ?? '(none)'}`,
    `url: ${settings.url ?? '(none)'}`,
    ...Object.entries(settings.screens).map(
      ([id, words]) => `screen.${id}: ${words || '(hidden)'}`
    )
  ].join('\n');

const settingsReport = (settings: SiteSettings, sha: string | null) =>
  report(describe(settings), {
    name: settings.name,
    url: settings.url,
    screens: settings.screens,
    sha
  });

export async function siteShow(context: Context) {
  const document = await request(context.api.contentWrite.site());

  return settingsReport(document.settings, document.sha);
}

export async function siteSet(context: Context, pairs: ReadonlyArray<string>) {
  if (pairs.length === 0)
    throw new CliFailure(
      'BadArgument',
      'Nothing to set: give name=…, url=… or screen.<id>=…'
    );

  const document = await request(context.api.contentWrite.site());
  const saved = await request(
    context.api.contentWrite.saveSite({
      payload: {
        baseSha: document.sha,
        ...withChanges(document.settings, pairs)
      }
    })
  );

  return settingsReport(saved.settings, saved.sha);
}
