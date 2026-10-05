// Every minute: scheduled publishing, trash purging and search backfill.
import { platform } from '#venda/platform';
import { definePlugin } from 'nitro';
import { loadApp } from '../app';

export default definePlugin((nitroApp) => {
  platform.schedule(nitroApp.hooks, async () => (await loadApp()).scheduled());
});
