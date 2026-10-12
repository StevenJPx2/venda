<script setup lang="ts">
import {
  AdminRegistryKey,
  AdminRuntimeKey,
  createAdminRuntime,
  resolvePage
} from '@venda/admin';
import { registry } from '~/utils/plugins';
import { provide } from 'vue';

const router = useRouter();
const admin = await createAdminRuntime(window.location.origin, async path => {
  await router.push(path);
});
const removeGuard = router.beforeEach(
  async (to, from) =>
    to.fullPath === from.fullPath || (await admin.prepareNavigation())
);

onBeforeUnmount(removeGuard);
provide(AdminRuntimeKey, admin);
provide(AdminRegistryKey, registry);
const route = useRoute();
const ready = ref(false);
const error = ref('');
const publicPage = computed(
  () => resolvePage(registry.pages, route.path)?.page.access === 'public'
);

async function identify() {
  error.value = '';

  try {
    await Promise.all([admin.refreshIdentity(), admin.refreshSite()]);
    ready.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to connect.';
  }
}

await identify();
</script>

<template>
  <div v-if="!ready" class="auth-screen">
    <AdminFeedback :error="error" :busy="!error" @retry="identify" />
  </div>

  <main v-else-if="publicPage" class="auth-screen">
    <NuxtPage />
  </main>

  <AdminSignIn v-else-if="!admin.user.value" />

  <AdminShell v-else :pages="registry.pages">
    <NuxtPage />
  </AdminShell>
</template>
