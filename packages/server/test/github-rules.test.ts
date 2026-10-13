// The GitHub adapter's pure rules: configuration, encoding, the App's JWT,
// which tree entries are content, conditional writes and read retries.
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GitHubError, renewalTime, retryDelay } from '../src/github/api';
import { apiUrl, contentDir, githubConfig } from '../src/github/config';
import { base64FromText, textFromBase64 } from '../src/github/encoding';
import { appJwt, importPrivateKey, jwtClaims } from '../src/github/jwt';
import {
  afterRefusal,
  contentFiles,
  leadsTo,
  MOVED_TRIES,
  writeDecision
} from '../src/github/tree';
import { pushHere, readDelivery, signed } from '../src/github/webhook';

const FULL = {
  VENDA_GITHUB_REPOSITORY: 'acme/site.web',
  VENDA_GITHUB_REPOSITORY_ID: '42',
  VENDA_GITHUB_BRANCH: 'main',
  VENDA_GITHUB_CLIENT_ID: 'Iv1.test',
  VENDA_GITHUB_INSTALLATION_ID: '7',
  VENDA_GITHUB_PRIVATE_KEY: 'key',
  VENDA_GITHUB_WEBHOOK_SECRET: 'secret',
  VENDA_GITHUB_AUTHOR_EMAIL: 'venda@example.com'
};

const FULL_CONFIG = {
  ...(githubConfig({ ...FULL, VENDA_GITHUB_WEBHOOK_SECRET: 'shh' }) ??
    expect.unreachable()),
  repositoryId: 42,
  branch: 'main'
};

describe('configuration', () => {
  it('is all or nothing', () => {
    expect(githubConfig({})).toBeUndefined();
    expect(() =>
      githubConfig({ VENDA_GITHUB_REPOSITORY: 'acme/site' })
    ).toThrow(/half configured/);
    expect(githubConfig(FULL)).toMatchObject({
      owner: 'acme',
      repo: 'site.web',
      repositoryId: 42,
      installationId: 7,
      dir: 'content'
    });
  });

  it('keeps the content folder inside the repository', () => {
    expect(contentDir('/site/content/')).toBe('site/content');
    expect(contentDir('')).toBe('');
    expect(() => contentDir('../elsewhere')).toThrow();
  });

  it('talks to the real API, or only to a simulator on this machine', () => {
    expect(apiUrl(undefined).href).toBe('https://api.github.com/');
    expect(apiUrl('http://127.0.0.1:9000/').port).toBe('9000');
    expect(() => apiUrl('https://evil.example/')).toThrow();
    expect(() => apiUrl('http://10.0.0.1/')).toThrow();
  });
});

describe('encoding', () => {
  it('round-trips text outside Latin-1, and ignores line wrapping', () => {
    const encoded = base64FromText('Café ☕ 日本');

    expect(textFromBase64(encoded)).toBe('Café ☕ 日本');
    expect(textFromBase64(encoded.replace(/(.{4})/g, '$1\n'))).toBe(
      'Café ☕ 日本'
    );
  });
});

describe('the App JWT', () => {
  it('backdates a minute and expires inside ten', () => {
    expect(jwtClaims('Iv1.x', 1000)).toEqual({
      iat: 940,
      exp: 1540,
      iss: 'Iv1.x'
    });
  });

  it('is an RS256 signature that the public key verifies', async () => {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const token = await appJwt(
      await importPrivateKey(keys.privateKey),
      'Iv1.x'
    );
    const [header, claims, signature] = token.split('.');

    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${claims}`),
        keys.publicKey,
        Buffer.from(signature ?? '', 'base64url')
      )
    ).toBe(true);
  });

  it("explains how to convert GitHub's PKCS#1 key", async () => {
    await expect(
      importPrivateKey(
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'
      )
    ).rejects.toThrow(/openssl pkcs8/);
  });
});

describe('tree entries', () => {
  const entry = (path: string, mode = '100644', type = 'blob') => ({
    path,
    mode,
    type,
    sha: path,
    size: 1
  });

  it('keeps content files of the folder, not symlinks, submodules or images', () => {
    expect(
      contentFiles(
        [
          entry('content/site.ts'),
          entry('content/blog/config.ts'),
          entry('content/blog/a.md'),
          entry('content/blog/b.mdx', '100755'),
          entry('content/blog/link.md', '120000'),
          entry('content/blog/sub', '160000', 'commit'),
          entry('content/blog/photo.jpg'),
          entry('content/blog/deep/c.md'),
          entry('content-other/blog/d.md'),
          entry('README.md')
        ],
        'content'
      ).map(file => file.path)
    ).toEqual(['site.ts', 'blog/config.ts', 'blog/a.md', 'blog/b.mdx']);
  });

  it('reads the repository root when the folder is the root', () => {
    expect(
      contentFiles([entry('blog/a.md'), entry('README.md')], '').map(
        file => file.path
      )
    ).toEqual(['blog/a.md']);
  });

  it('walks only the folders that lead to the content', () => {
    expect(leadsTo('site', 'site/content')).toBe(true);
    expect(leadsTo('site/content/blog', 'site/content')).toBe(true);
    expect(leadsTo('docs', 'site/content')).toBe(false);
    expect(leadsTo('anything', '')).toBe(true);
  });
});

describe('conditional writes', () => {
  it('writes over the base, finishes a retry, and refuses anything else', () => {
    expect(writeDecision('base', 'base', 'new')).toBe('write');
    expect(writeDecision(null, null, 'new')).toBe('write');
    expect(writeDecision('new', 'base', 'new')).toBe('done');
    expect(writeDecision('theirs', 'base', 'new')).toBe('conflict');
    expect(writeDecision('theirs', null, 'new')).toBe('conflict');
    expect(writeDecision(null, 'base', 'new')).toBe('conflict');
  });
});

describe('after a refused write', () => {
  it('finishes when our bytes are there, retries a moved branch, and reports the rest', () => {
    expect(afterRefusal(409, 'done', 1)).toBe('done');
    expect(afterRefusal(422, 'done', 1)).toBe('done');
    expect(afterRefusal(409, 'write', 1)).toBe('retry');
    expect(afterRefusal(409, 'write', MOVED_TRIES)).toBe('refuse');
    expect(afterRefusal(422, 'write', 1)).toBe('refuse');
    expect(afterRefusal(403, null, 1)).toBe('refuse');
  });
});

describe('webhook deliveries', () => {
  const secret = 'shh';
  const push = (ref: string, id = 42): Uint8Array<ArrayBuffer> =>
    new TextEncoder().encode(
      JSON.stringify({ ref, repository: { id }, after: 'abc' })
    );
  const sign = (body: Uint8Array) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accept only a signature made with the secret over these exact bytes', async () => {
    const body = push('refs/heads/main');

    expect(await signed(secret, body, sign(body))).toBe(true);
    expect(await signed('other', body, sign(body))).toBe(false);
    expect(await signed(secret, push('refs/heads/x'), sign(body))).toBe(false);
    expect(await signed(secret, body, null)).toBe(false);
    expect(await signed(secret, body, 'sha256=zz')).toBe(false);
    expect(
      await signed(secret, body, sign(body).replace('sha256', 'sha1'))
    ).toBe(false);
  });

  it('count only a push to the configured repository and branch', () => {
    expect(pushHere(FULL_CONFIG, push('refs/heads/main'))).toBe(true);
    expect(pushHere(FULL_CONFIG, push('refs/heads/feature'))).toBe(false);
    expect(pushHere(FULL_CONFIG, push('refs/tags/main'))).toBe(false);
    expect(pushHere(FULL_CONFIG, push('refs/heads/main', 43))).toBe(false);
    expect(pushHere(FULL_CONFIG, new TextEncoder().encode('not json'))).toBe(
      false
    );
  });

  it('are refused unsigned, ignored when not a push here, and read otherwise', async () => {
    const deliver = (
      body: Uint8Array<ArrayBuffer>,
      event: string,
      signature = sign(body)
    ) =>
      readDelivery(
        FULL_CONFIG,
        new Request('http://venda.test/api/webhooks/github', {
          method: 'POST',
          headers: {
            'x-github-event': event,
            'x-hub-signature-256': signature
          },
          body
        })
      );

    expect(await deliver(push('refs/heads/main'), 'push')).toBe('push');
    expect(await deliver(push('refs/heads/main'), 'ping')).toBe('ignored');
    expect(await deliver(push('refs/heads/other'), 'push')).toBe('ignored');
    expect(await deliver(push('refs/heads/main'), 'push', 'sha256=00')).toBe(
      'refused'
    );
  });
});

describe('token renewal', () => {
  it('renews five minutes early, but never before half a short life', () => {
    expect(renewalTime(0, 3_600_000)).toBe(3_300_000);
    expect(renewalTime(0, 60_000)).toBe(30_000);
  });
});

describe('read retries', () => {
  it('retry outages twice, honouring a short Retry-After only', () => {
    expect(retryDelay(new Error('network'), 0)).toBe(500);
    expect(retryDelay(new GitHubError('x', 502), 1)).toBe(1500);
    expect(retryDelay(new GitHubError('x', 502), 2)).toBeUndefined();
    expect(retryDelay(new GitHubError('x', 429, 2), 0)).toBe(2000);
    expect(retryDelay(new GitHubError('x', 429, 60), 0)).toBeUndefined();
    expect(retryDelay(new GitHubError('x', 404), 0)).toBeUndefined();
  });
});
