<script setup lang="ts">
import { canOpen, useAdmin, useAdminAction, type AdminPage } from '@venda/admin';

const props = defineProps<{ pages: ReadonlyArray<AdminPage> }>();
const admin = useAdmin();
const { error, perform } = useAdminAction();
const route = useRoute();
const open = ref(false);
const links = computed(() => props.pages.filter(page => page.nav && canOpen(page, admin.user.value?.role) && page.section !== 'public'));
const sections = ['content', 'settings', 'account'] as const;

const isCurrent = (path: string) => route.path === `/${path}` || route.path.startsWith(`/${path}/`);

watch(() => route.fullPath, () => { open.value = false; });

async function signOut() {
  await perform(async () => {
    await admin.request(admin.api.auth.signOut());
    admin.user.value = null;
    await navigateTo('/');
  });
}
</script>

<template>
  <div class="admin-shell">
    <header class="mobile-bar">
      <span class="brand-mark">venda<span>.</span></span>
      <UButton icon="i-lucide-menu" aria-label="Open navigation" color="neutral" variant="ghost" @click="open = true" />
    </header>

    <aside class="admin-sidebar">
      <NuxtLink to="/content" class="brand-mark px-3 py-5">venda<span>.</span></NuxtLink>

      <nav aria-label="Main navigation" class="flex-1">
        <div v-for="section in sections" :key="section" class="nav-section">
          <p v-if="section === 'settings'" class="nav-label">Settings</p>

          <NuxtLink v-for="page in links.filter(item => item.section === section)" :key="page.id" :to="`/${page.path}`" class="nav-link" :class="{ 'nav-current': isCurrent(page.path) }" :aria-current="isCurrent(page.path) ? 'page' : undefined">
            <UIcon :name="page.nav?.icon" class="size-4 shrink-0" />{{ page.nav?.label }}
          </NuxtLink>
        </div>
      </nav>

      <div class="sidebar-account">
        <p class="truncate text-sm font-medium">{{ admin.user.value?.name || admin.user.value?.email }}</p>
        <p class="truncate text-xs text-muted mt-1">{{ admin.user.value?.role }}</p>
        <p v-if="error" role="alert" class="text-xs text-error mt-2">{{ error }}</p>
        <UButton label="Sign out" icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" class="mt-3 -ml-2" @click="signOut" />
      </div>
    </aside>

    <USlideover v-model:open="open" side="left" title="Navigation" description="Your content and settings" :ui="{ content: 'max-w-xs' }">
      <template #body>
        <nav aria-label="Mobile navigation">
          <NuxtLink v-for="page in links" :key="page.id" :to="`/${page.path}`" class="nav-link">
            <UIcon :name="page.nav?.icon" class="size-4" />{{ page.nav?.label }}
          </NuxtLink>
        </nav>

        <UButton label="Sign out" variant="ghost" color="neutral" class="mt-6" @click="signOut" />
      </template>
    </USlideover>

    <main id="main-content" class="admin-main">
      <slot />
    </main>
  </div>
</template>
