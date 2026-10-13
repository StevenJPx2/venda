// A Venda site in memory, as `fetch` sees it: the files API with its rule
// that a write from a stale SHA is refused whole, the site settings and the
// signed-in person, so the CLI runs through the real contract client.
import { Conflict, FileNotFound, Unauthenticated } from '@venda/contract';
import { textSha } from '@venda/content';
import { Schema } from 'effect';

const Change = Schema.Struct({
  path: Schema.String,
  text: Schema.NullOr(Schema.String),
  baseSha: Schema.NullOr(Schema.String)
});

type Change = typeof Change.Type;

const decodeWrite = Schema.decodeUnknownSync(
  Schema.Struct({ message: Schema.String, changes: Schema.Array(Change) })
);

const decodeImport = Schema.decodeUnknownSync(
  Schema.Struct({
    files: Schema.Array(
      Schema.Struct({ path: Schema.String, text: Schema.String })
    )
  })
);

const Settings = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  screens: Schema.Record(Schema.String, Schema.String)
});

const decodeSite = Schema.decodeUnknownSync(
  Schema.Struct({ ...Settings.fields, baseSha: Schema.NullOr(Schema.String) })
);

const answer = (status: number, body: Schema.Json) =>
  Response.json(body, { status });

const conflict = (path: string, sha: string | null) =>
  answer(409, Schema.encodeSync(Conflict)(new Conflict({ path, sha })));

const notFound = (path: string) =>
  answer(404, Schema.encodeSync(FileNotFound)(new FileNotFound({ path })));

const AT = '2026-10-13T08:00:00Z';

const ANN = {
  id: 'ann',
  email: 'ann@site.test',
  name: 'Ann Lee',
  role: 'editor',
  status: 'active',
  createdAt: AT
};

interface Version extends Change {
  readonly id: number;
  readonly sha: string | null;
  readonly message: string;
}

class FakeSite {
  readonly files = new Map<string, { text: string; sha: string }>();
  readonly versions: Version[] = [];
  private settings: typeof Settings.Type = {
    name: null,
    url: null,
    screens: {}
  };
  private settingsSha: string | null = null;

  constructor(private readonly token: string) {}

  /** Someone else writing a file on the site; null deletes it. */
  put(path: string, text: string | null) {
    return this.write('Someone else', [
      { path, text, baseSha: this.files.get(path)?.sha ?? null }
    ]);
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);

    if (request.headers.get('authorization') !== `Bearer ${this.token}`)
      return answer(
        401,
        Schema.encodeSync(Unauthenticated)(new Unauthenticated())
      );

    return this.route(request, new URL(request.url));
  };

  private readonly routes = new Map<
    string,
    (request: Request, path: string, url: URL) => Promise<Response> | Response
  >([
    ['GET /api/auth/me', () => answer(200, ANN)],
    ['GET /api/admin/files', () => answer(200, this.listing())],
    [
      'GET /api/admin/files/read',
      (_request, path) => this.fileAnswer(path, this.files.get(path))
    ],
    [
      'GET /api/admin/files/revisions',
      (_request, path) => answer(200, this.history(path))
    ],
    [
      'GET /api/admin/files/revision',
      (_request, path, url) =>
        this.fileAnswer(path, this.version(path, url.searchParams.get('sha')))
    ],
    ['POST /api/admin/files', request => this.writeRequest(request)],
    ['POST /api/admin/import', request => this.import(request)],
    [
      'GET /api/admin/site',
      () => answer(200, { settings: this.settings, sha: this.settingsSha })
    ],
    ['PUT /api/admin/site', request => this.saveSite(request)]
  ]);

  private route(request: Request, url: URL) {
    const handle = this.routes.get(`${request.method} ${url.pathname}`);

    return handle
      ? handle(request, url.searchParams.get('path') ?? '', url)
      : new Response(null, { status: 404 });
  }

  private async writeRequest(request: Request) {
    const input = decodeWrite(await request.json());

    return this.write(input.message, input.changes);
  }

  private async write(message: string, changes: ReadonlyArray<Change>) {
    for (const change of changes) {
      const now = this.files.get(change.path)?.sha ?? null;

      if (now !== change.baseSha) return conflict(change.path, now);
    }

    const written = [];

    for (const change of changes) {
      const sha = change.text === null ? null : await textSha(change.text);

      this.versions.push({
        ...change,
        id: this.versions.length + 1,
        sha,
        message
      });

      if (change.text === null || sha === null) this.files.delete(change.path);
      else this.files.set(change.path, { text: change.text, sha });

      written.push({ path: change.path, sha });
    }

    return answer(200, { files: written });
  }

  private listing() {
    return [...this.files].map(([path, file]) => ({
      path,
      sha: file.sha,
      size: file.text.length,
      updatedAt: AT
    }));
  }

  private history(path: string) {
    return this.versions
      .filter(each => each.path === path)
      .reverse()
      .map(each => ({
        id: each.id,
        sha: each.sha,
        parentSha: each.baseSha,
        message: each.message,
        authorName: ANN.name,
        createdAt: AT
      }));
  }

  private version(path: string, sha: string | null) {
    const found = this.versions.find(
      each => each.path === path && each.sha === sha
    );

    return found?.text && found.sha
      ? { text: found.text, sha: found.sha }
      : undefined;
  }

  private fileAnswer(path: string, file?: { text: string; sha: string }) {
    return file ? answer(200, { path, ...file }) : notFound(path);
  }

  private async import(request: Request) {
    const input = decodeImport(await request.json());

    for (const file of input.files) await this.put(file.path, file.text);

    return answer(200, { imported: input.files.length, unchanged: 0 });
  }

  private async saveSite(request: Request) {
    const { baseSha, ...settings } = decodeSite(await request.json());

    if (baseSha !== this.settingsSha)
      return conflict('site.ts', this.settingsSha);

    this.settings = settings;
    this.settingsSha = await textSha(JSON.stringify(settings));

    return answer(200, { settings, sha: this.settingsSha });
  }
}

export const fakeSite = (token: string) => new FakeSite(token);
