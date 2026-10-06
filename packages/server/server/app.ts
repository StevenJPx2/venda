import { useStorage } from 'nitro/storage';
import { appLoader } from '../src/app';
import { target } from '../src/cloudflare';

/** The app for this isolate. */
export const venda = appLoader(
  target,
  () => ({
    migrations: useStorage('assets:migrations'),
    keyValue: useStorage('kv')
  }),
  () => process.env
);
