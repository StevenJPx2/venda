<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { listed, useAdmin, useAdminAction, type AdminPage } from '@venda/admin';

const props = defineProps<{ pages: ReadonlyArray<AdminPage> }>();
const admin = useAdmin();
const { error, perform } = useAdminAction();

const name = computed(
  () => admin.user.value?.name || admin.user.value?.email || ''
);

// Who you are stays collapsed into one button; your account and signing out
// open from it, upwards, since it sits at the foot of the navigation.
const items = computed<DropdownMenuItem[][]>(() => [
  listed(props.pages, 'account', admin.user.value?.role).flatMap(page =>
    page.nav
      ? [{ label: page.nav.label, icon: page.nav.icon, to: `/${page.path}` }]
      : []
  ),
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }]
]);

async function signOut() {
  await perform(async () => {
    await admin.request(admin.api.auth.signOut());
    admin.user.value = null;
    await navigateTo('/');
  });
}
</script>

<template>
  <div class="admin-identity">
    <UDropdownMenu
      :items="items"
      :content="{ side: 'top', align: 'start' }"
      :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <button type="button" class="account-button">
        <!-- Decorative: the name beside it already says who this is. -->
        <UAvatar :alt="name" size="sm" aria-hidden="true" />

        <span class="min-w-0 flex-1 text-left">
          <span class="block truncate text-sm font-medium text-highlighted">{{
            name
          }}</span>

          <span class="block truncate text-xs text-muted capitalize">{{
            admin.user.value?.role
          }}</span>
        </span>

        <UIcon
          name="i-lucide-chevrons-up-down"
          class="size-4 shrink-0 text-dimmed"
        />
      </button>
    </UDropdownMenu>

    <p v-if="error" role="alert" class="mt-2 px-2 text-xs text-error">
      {{ error }}
    </p>
  </div>
</template>
