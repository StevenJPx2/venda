import type { ComputedRef, InjectionKey } from 'vue';

/** The screen being shown, so its header can describe it in the site's words. */
export interface Screen {
  readonly id: string;
  readonly description?: string | undefined;
}

export const ScreenKey: InjectionKey<ComputedRef<Screen | undefined>> =
  Symbol('venda/admin/screen');
