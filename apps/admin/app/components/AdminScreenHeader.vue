<script setup lang="ts">
import { screenDescription, useAdmin } from '@venda/admin';
import { ScreenKey } from '~/utils/screen';

// `pending` holds the title's space blank until the real one arrives, instead of swapping a placeholder for it.
// Without a description of its own, the header describes the screen it opens, in the site's words.
const props = defineProps<{
  title: string;
  description?: string | undefined;
  back?: { to: string; label: string } | undefined;
  pending?: boolean;
}>();
const route = useRoute();
const admin = useAdmin();
const screen = inject(ScreenKey, undefined);

const shownDescription = computed(
  () =>
    props.description ??
    (screen?.value
      ? screenDescription(
          admin.site.value,
          screen.value.id,
          screen.value.description
        )
      : undefined)
);

// Every settings section leads back to Settings, unless the screen names
// another way back. The static build serves pages with a trailing slash, so
// Settings itself can be `/settings/`; it has no way back to itself.
const inSettingsSection = (path: string) => /^\/settings\/[^/]+/.test(path);

const way = computed(
  () =>
    props.back ??
    (inSettingsSection(route.path)
      ? { to: '/settings', label: 'Settings' }
      : undefined)
);
</script>

<template>
  <header class="screen-heading">
    <div class="min-w-0">
      <NuxtLink v-if="way" :to="way.to" class="back-link">
        <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />{{
          way.label
        }}
      </NuxtLink>

      <h1 class="screen-title" :class="{ invisible: pending }">{{ title }}</h1>

      <p v-if="shownDescription" class="mt-2 text-muted text-sm max-w-xl">
        {{ shownDescription }}
      </p>
    </div>

    <div v-if="$slots.default" class="flex items-center gap-2 shrink-0">
      <slot />
    </div>
  </header>
</template>
