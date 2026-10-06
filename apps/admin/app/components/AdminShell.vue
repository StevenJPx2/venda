<script setup lang="ts">
import type { AdminPage } from '@venda/admin';

defineProps<{ pages: ReadonlyArray<AdminPage> }>();
const route = useRoute();
const open = ref(false);
const scrolled = ref(false);

// The bar's hairline appears only once content scrolls beneath it.
const onScroll = () => { scrolled.value = window.scrollY > 0; };

watch(() => route.fullPath, () => { open.value = false; });

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
      <UButton icon="i-lucide-menu" aria-label="Open navigation" color="neutral" variant="ghost" @click="open = true" />
      <NuxtLink to="/content" class="brand-mark">venda<span>.</span></NuxtLink>
    </header>

    <aside class="admin-sidebar">
      <NuxtLink to="/content" class="brand-mark px-3 py-5">venda<span>.</span></NuxtLink>
      <AdminNav :pages="pages" label="Main navigation" class="flex-1" />
      <AdminIdentity class="sidebar-account" />
    </aside>

    <USlideover v-model:open="open" side="left" title="Navigation" description="Your content and settings" :ui="{ content: 'max-w-xs' }">
      <template #body>
        <AdminNav :pages="pages" label="Mobile navigation" />
        <AdminIdentity class="sidebar-account mt-6" />
      </template>
    </USlideover>

    <main id="main-content" class="admin-main">
      <div class="admin-page">
        <slot />
      </div>
    </main>
  </div>
</template>
