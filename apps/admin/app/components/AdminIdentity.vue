<script setup lang="ts">
import { useAdmin, useAdminAction } from '@venda/admin';

const admin = useAdmin();
const { error, perform } = useAdminAction();

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
    <p class="truncate text-sm font-medium text-highlighted">
      {{ admin.user.value?.name || admin.user.value?.email }}
    </p>

    <p class="truncate text-xs text-muted mt-1 capitalize">
      {{ admin.user.value?.role }}
    </p>

    <p v-if="error" role="alert" class="text-xs text-error mt-2">{{ error }}</p>

    <UButton
      label="Sign out"
      icon="i-lucide-log-out"
      variant="ghost"
      color="neutral"
      size="sm"
      class="mt-3 -ml-2"
      @click="signOut"
    />
  </div>
</template>
