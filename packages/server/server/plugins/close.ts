// Releases the file watcher and the database when the server shuts down.
import { definePlugin } from 'nitro';
import { venda } from '../app';

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('close', () => venda.close());
});
