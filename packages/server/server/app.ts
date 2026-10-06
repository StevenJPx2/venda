import { target } from '#venda/target';
import { useStorage } from 'nitro/storage';
import { appLoader } from '../src/app';

/** The app for this isolate or process. */
export const venda = appLoader(target, () => useStorage('assets:migrations'), () => process.env);
