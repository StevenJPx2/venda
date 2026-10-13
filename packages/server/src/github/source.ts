// A GitHub repository as the app's content source. Until webhook sync lands,
// a request looks at the branch's head at most every 30 seconds and
// re-indexes when it moved; a publish looks again at once.
import { Predicate } from 'effect';
import type { ContentSource } from '../target';
import { gitHubApi } from './api';
import type { GitHubConfig } from './config';
import { githubStore } from './store';

const CHECK_EVERY_MS = 30_000;

export function githubContent(config: GitHubConfig): ContentSource {
  const api = gitHubApi(config);
  let seen: string | undefined;
  let checkedAt = 0;

  const head = async () => {
    const reply = await api.repo(
      'GET',
      `git/ref/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`
    );
    const object = Predicate.isObject(reply.body) ? reply.body.object : null;

    if (
      reply.status !== 200 ||
      !Predicate.isObject(object) ||
      !Predicate.isString(object.sha)
    )
      throw new Error(`GitHub answered ${reply.status} for the branch`);

    return object.sha;
  };

  return {
    store: githubStore(config, api),
    invalidate: () => {
      checkedAt = 0;
    },
    // GitHub unreachable keeps the last index serving.
    changed: async () => {
      if (Date.now() - checkedAt < CHECK_EVERY_MS) return false;

      checkedAt = Date.now();

      const now = await head().catch((error: Error) => {
        console.error(`[venda] GitHub unreachable: ${error.message}`);

        return seen;
      });

      if (now === seen) return false;

      seen = now;

      return true;
    }
  };
}
