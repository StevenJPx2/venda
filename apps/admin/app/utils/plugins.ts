import { registerPlugins } from '@venda/admin';
import preset from '@venda/preset-default';

// This is the build-time choice of plugins: their pages, views and editors.
// No screen loads until it is shown. A site plugin listed after the preset
// replaces the preset's view or editor for the kinds it serves.
export const registry = registerPlugins(preset);
