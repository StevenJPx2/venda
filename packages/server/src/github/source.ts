// A GitHub repository as the app's content source. Webhook deliveries and
// the scheduled check of the branch's head ask for a sync; the app runs it in
// the background, one pass at a time across isolates.
import type { ContentSource } from '../target';
import { gitHubApi } from './api';
import type { GitHubConfig } from './config';
import { branchHead, githubStore } from './store';
import { readDelivery } from './webhook';

export function githubContent(config: GitHubConfig): ContentSource {
  const api = gitHubApi(config);

  return {
    store: githubStore(config, api),
    updates: {
      kind: 'pushed',
      head: () => branchHead(config, api),
      delivery: request => readDelivery(config, request)
    }
  };
}
