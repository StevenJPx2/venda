<script setup lang="ts">
import { useAdmin, type AdminPage } from '@venda/admin';

defineProps<{ pages: ReadonlyArray<AdminPage> }>();
const route = useRoute();
const admin = useAdmin();
const open = ref(false);
const scrolled = ref(false);
const siteName = computed(() => admin.site.value?.name);

// The bar's hairline appears only once content scrolls beneath it.
const onScroll = () => {
  scrolled.value = window.scrollY > 0;
};

watch(
  () => route.fullPath,
  () => {
    open.value = false;

    // site.ts may have changed since; like the sidebar, read it again.
    void admin.refreshSite();
  }
);

onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});

onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <div class="admin-shell">
    <!-- The trigger sits on the edge the navigation sheet slides in from. -->
    <header class="mobile-bar" :data-scrolled="scrolled">
      <UButton
        icon="i-lucide-menu"
        aria-label="Open navigation"
        color="neutral"
        variant="ghost"
        @click="open = true"
      />

      <AdminBrand :name="siteName" />
    </header>

    <aside class="admin-sidebar">
      <AdminBrand :name="siteName" class="px-3 py-5" />

      <AdminNav :pages="pages" label="Main navigation" class="flex-1" />
      <AdminIdentity :pages="pages" />
    </aside>

    <USlideover
      v-model:open="open"
      side="left"
      title="Navigation"
      description="Your content and settings"
      :ui="{ content: 'max-w-xs' }"
    >
      <template #body>
        <AdminNav :pages="pages" label="Mobile navigation" />
        <AdminIdentity :pages="pages" />
      </template>
    </USlideover>

    <main id="main-content" class="admin-main">
      <div class="admin-page">
        <slot />
      </div>
    </main>
  </div>
</template>
