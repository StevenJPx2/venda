import { platform } from '#venda/platform';
import { appLoader } from '../src/app';

/** The app for this isolate; shared by the request entry and the tick plugin. */
export const loadApp = appLoader(platform, () => process.env);
