// Calls to GitHub's REST API as the App's installation. One token per isolate,
// renewed before it expires, one renewal at a time. Reads retry briefly on
// outages; writes never retry here (the publish intent decides that).
import { Schema } from 'effect';
import type { GitHubConfig } from './config';
import { appJwt, importPrivateKey } from './jwt';

const API_VERSION = '2026-03-10';

/** Renew this long before GitHub's expiry, so a slow request still has a valid token. */
const RENEW_MS = 5 * 60_000;

/** At most three attempts within ten seconds, waiting between them. */
const BACKOFF_MS = [500, 1_500];

const MAX_WAIT_S = 5;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds GitHub asked us to wait, when it did. */
    readonly retryAfter?: number
  ) {
    super(message);
  }
}

export interface GitHubReply {
  readonly status: number;
  readonly body: unknown;
}

/** The installation token request: this repository, its contents only. */
interface TokenRequest {
  readonly repository_ids: ReadonlyArray<number>;
  readonly permissions: {
    readonly contents: 'write';
    readonly metadata: 'read';
  };
}

/** A file written through the Contents API; `sha` is the blob it replaces. */
export interface FileWrite {
  readonly message: string;
  readonly content: string;
  readonly branch: string;
  readonly author: { readonly name: string; readonly email: string };
  readonly sha?: string;
}

type RequestBody = TokenRequest | FileWrite;

const Token = Schema.Struct({
  token: Schema.String,
  expires_at: Schema.String
});

/** Whether a failed read is worth another attempt, and after how long. */
export function retryDelay(
  failure: GitHubError | Error,
  attempt: number
): number | undefined {
  const wait = BACKOFF_MS[attempt];

  if (wait === undefined) return undefined;
  if (!(failure instanceof GitHubError)) return wait;
  if (failure.retryAfter !== undefined)
    return failure.retryAfter <= MAX_WAIT_S
      ? failure.retryAfter * 1000
      : undefined;

  return failure.status >= 500 ? wait : undefined;
}

/**
 * When to renew a token: five minutes before it expires, but never before
 * half its life, so a short-lived token is not renewed on every request.
 */
export const renewalTime = (issuedAt: number, expiresAt: number) =>
  Math.max(expiresAt - RENEW_MS, issuedAt + (expiresAt - issuedAt) / 2);

const retryAfterOf = (headers: Headers) => {
  const value = Number(headers.get('retry-after'));

  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));

type Send = (
  method: string,
  path: string,
  auth: string,
  body?: RequestBody
) => Promise<GitHubReply>;

/** One request; outages and rate limits are thrown, other answers returned. */
const sender =
  (apiUrl: URL): Send =>
  async (method, path, auth, body) => {
    const headers = new Headers({
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${auth}`,
      'x-github-api-version': API_VERSION,
      'user-agent': 'venda'
    });
    // Workers have no redirect: 'error'; a redirect is refused below, so the
    // token is never sent on to another address.
    const init: RequestInit = { method, redirect: 'manual', headers };

    if (body) {
      headers.set('content-type', 'application/json');
      init.body = JSON.stringify(body);
    }

    const response = await fetch(new URL(path, apiUrl), init);

    if (response.status >= 300 && response.status < 400)
      throw new GitHubError(
        `GitHub redirected ${path}; Venda does not follow redirects`,
        response.status
      );

    const text = await response.text();

    if (response.status >= 500 || response.status === 429)
      throw new GitHubError(
        `GitHub answered ${response.status}`,
        response.status,
        retryAfterOf(response.headers)
      );

    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

export interface GitHubApi {
  /** `path` is relative to the repository: `git/trees/abc`, `contents/x.md`. */
  readonly repo: (
    method: 'GET' | 'PUT',
    path: string,
    body?: FileWrite
  ) => Promise<GitHubReply>;
}

/** The installation token for this isolate, renewed by one request at a time. */
function installationTokens(config: GitHubConfig, send: Send) {
  const key = importPrivateKey(config.privateKey);
  let token: { value: string; renewAt: number } | undefined;
  let renewing: Promise<string> | undefined;

  const renew = async () => {
    const issuedAt = Date.now();
    const reply = await send(
      'POST',
      `app/installations/${config.installationId}/access_tokens`,
      await appJwt(await key, config.clientId),
      {
        repository_ids: [config.repositoryId],
        permissions: { contents: 'write', metadata: 'read' }
      }
    );

    if (reply.status !== 201)
      throw new GitHubError(
        `GitHub refused the App's installation token (${reply.status})`,
        reply.status
      );

    const body = Schema.decodeUnknownSync(Token)(reply.body);

    token = {
      value: body.token,
      renewAt: renewalTime(issuedAt, Date.parse(body.expires_at))
    };

    return body.token;
  };

  return () => {
    if (token && Date.now() < token.renewAt)
      return Promise.resolve(token.value);

    renewing ??= renew().finally(() => {
      renewing = undefined;
    });

    return renewing;
  };
}

const Repository = Schema.Struct({ id: Schema.Number });

/** Checks once that the configured name still is the configured repository. */
async function verifyRepository(
  config: GitHubConfig,
  send: Send,
  auth: string
) {
  const reply = await send('GET', `repos/${config.owner}/${config.repo}`, auth);
  const found =
    reply.status === 200
      ? Schema.decodeUnknownSync(Repository)(reply.body).id
      : undefined;

  if (found !== config.repositoryId)
    throw new GitHubError(
      `${config.owner}/${config.repo} is not repository ${config.repositoryId}, or the App cannot see it`,
      reply.status === 200 ? 409 : reply.status
    );
}

export function gitHubApi(config: GitHubConfig): GitHubApi {
  const send = sender(config.apiUrl);
  const token = installationTokens(config, send);
  let verified = false;

  const once = async (
    method: 'GET' | 'PUT',
    path: string,
    body?: FileWrite
  ) => {
    const auth = await token();

    if (!verified) {
      await verifyRepository(config, send, auth);
      verified = true;
    }

    return send(
      method,
      `repos/${config.owner}/${config.repo}/${path}`,
      auth,
      body
    );
  };

  return {
    repo: async (method, path, body) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(method, path, body);
        } catch (cause) {
          const failure =
            cause instanceof Error ? cause : new Error(String(cause));
          const wait =
            method === 'GET' ? retryDelay(failure, attempt) : undefined;

          if (wait === undefined) throw failure;

          await sleep(wait);
        }
      }
    }
  };
}
