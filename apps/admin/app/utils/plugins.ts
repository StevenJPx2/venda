import { registerPlugins } from '@venda/admin';
import preset from '@venda/preset-default';

// This is the build-time choice of plugins. No screen loads until its route opens.
export const adminPages = registerPlugins(preset);
