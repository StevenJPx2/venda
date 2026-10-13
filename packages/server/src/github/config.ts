// Where a deployment's content lives on GitHub. All of it or none: a partial
// setup is refused rather than quietly serving the bundled copy.
import { Schema } from 'effect';

export interface GitHubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly repositoryId: number;
  readonly branch: string;
  /** Repository-relative, without slashes at either end; '' is the root. */
  readonly dir: string;
  readonly clientId: string;
  readonly installationId: number;
  readonly privateKey: string;
  readonly webhookSecret: string;
  readonly authorEmail: string;
  readonly apiUrl: URL;
}

const REQUIRED = [
  'VENDA_GITHUB_REPOSITORY',
  'VENDA_GITHUB_REPOSITORY_ID',
  'VENDA_GITHUB_BRANCH',
  'VENDA_GITHUB_CLIENT_ID',
  'VENDA_GITHUB_INSTALLATION_ID',
  'VENDA_GITHUB_PRIVATE_KEY',
  'VENDA_GITHUB_WEBHOOK_SECRET',
  'VENDA_GITHUB_AUTHOR_EMAIL'
] as const;

const GITHUB_API = 'https://api.github.com/';

const Id = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
);

const decodeId = Schema.decodeUnknownSync(Id);

type GitHubEnv = Readonly<Record<string, string | undefined>>;

/** `owner/name`, as GitHub spells them. */
function repository(value: string) {
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(value);

  if (!match?.[1] || !match[2])
    throw new Error('VENDA_GITHUB_REPOSITORY must be owner/repository');

  return { owner: match[1], repo: match[2] };
}

export function contentDir(value: string | undefined): string {
  const dir = (value ?? 'content').replace(/^\/+|\/+$/g, '');

  if (dir.split('/').some(part => part === '..' || part === '.'))
    throw new Error('VENDA_GITHUB_CONTENT_DIR must stay inside the repository');

  return dir;
}

/** The real API, or a simulator on this machine for tests and `pnpm try`. */
export function apiUrl(value: string | undefined): URL {
  const url = new URL(value ?? GITHUB_API);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

  if (url.href !== GITHUB_API && !(url.protocol === 'http:' && loopback))
    throw new Error(
      'VENDA_GITHUB_API_URL may only point at a simulator on this machine'
    );

  return url;
}

/** The GitHub source, if one is configured; undefined when none of it is. */
export function githubConfig(env: GitHubEnv): GitHubConfig | undefined {
  const missing = REQUIRED.filter(key => !env[key]);

  if (missing.length === REQUIRED.length) return undefined;

  if (missing.length > 0)
    throw new Error(
      `GitHub content is half configured: set ${missing.join(', ')}`
    );

  return {
    ...repository(env.VENDA_GITHUB_REPOSITORY ?? ''),
    repositoryId: decodeId(env.VENDA_GITHUB_REPOSITORY_ID),
    branch: env.VENDA_GITHUB_BRANCH ?? '',
    dir: contentDir(env.VENDA_GITHUB_CONTENT_DIR),
    clientId: env.VENDA_GITHUB_CLIENT_ID ?? '',
    installationId: decodeId(env.VENDA_GITHUB_INSTALLATION_ID),
    privateKey: env.VENDA_GITHUB_PRIVATE_KEY ?? '',
    webhookSecret: env.VENDA_GITHUB_WEBHOOK_SECRET ?? '',
    authorEmail: env.VENDA_GITHUB_AUTHOR_EMAIL ?? '',
    apiUrl: apiUrl(env.VENDA_GITHUB_API_URL)
  };
}
