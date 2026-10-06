<script setup lang="ts">
import { AdminRuntimeKey, createAdminRuntime, resolvePage } from '@venda/admin';
import { adminPages } from '~/utils/plugins';
import { provide } from 'vue';

const admin = await createAdminRuntime(window.location.origin);
provide(AdminRuntimeKey, admin);
const route = useRoute();
const ready = ref(false);
const error = ref('');
const publicPage = computed(() => resolvePage(adminPages, route.path)?.page.access === 'public');
const prototype = computed(() => route.path.startsWith('/prototypes/'));

async function identify() {
  error.value = '';

  try {
    await admin.refreshIdentity();
    ready.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to connect.';
  }
}

await identify();
</script>

<template>
  <NuxtPage v-if="prototype" />

  <div v-else-if="!ready" class="auth-screen">
    <AdminFeedback :error="error" :busy="!error" @retry="identify" />
  </div>

  <main v-else-if="publicPage" class="auth-screen">
    <NuxtPage />
  </main>

  <AdminSignIn v-else-if="!admin.user.value" />

  <AdminShell v-else :pages="adminPages">
    <NuxtPage />
  </AdminShell>
</template>
