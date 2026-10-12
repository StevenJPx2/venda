<script setup lang="ts">
import { useAdmin, useAdminAction } from '@venda/admin';
import { ref } from 'vue';

const admin = useAdmin();
const { busy, error, perform } = useAdminAction();

const current = ref('');
const next = ref('');
const confirm = ref('');
const saved = ref(false);

async function save() {
  saved.value = false;

  if (next.value !== confirm.value) {
    error.value = 'The new passwords do not match.';

    return;
  }

  await perform(async () => {
    await admin.request(
      admin.api.auth.changePassword({
        payload: { current: current.value, next: next.value }
      })
    );
    current.value = '';
    next.value = '';
    confirm.value = '';
    saved.value = true;
  });
}
</script>

<template>
  <AdminScreenHeader title="Your account" />

  <div class="max-w-md">
    <dl class="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-3 text-sm mb-10">
      <dt class="text-muted">Name</dt>
      <dd class="break-words">{{ admin.user.value?.name }}</dd>
      <dt class="text-muted">Email</dt>
      <dd class="break-all">{{ admin.user.value?.email }}</dd>
      <dt class="text-muted">Role</dt>
      <dd class="capitalize">{{ admin.user.value?.role }}</dd>
    </dl>

    <h2 class="font-semibold text-base text-highlighted">Change password</h2>

    <p class="text-sm text-muted mt-2">
      This signs you out on other devices. Your current device stays signed in.
    </p>

    <form class="space-y-5 mt-6" @submit.prevent="save">
      <UFormField label="Current password" required>
        <UInput
          v-model="current"
          type="password"
          name="current"
          autocomplete="current-password"
          required
          class="w-full"
        />
      </UFormField>

      <UFormField label="New password" help="At least 10 characters." required>
        <UInput
          v-model="next"
          type="password"
          name="next"
          autocomplete="new-password"
          minlength="10"
          maxlength="200"
          required
          class="w-full"
        />
      </UFormField>

      <UFormField label="Confirm new password" required>
        <UInput
          v-model="confirm"
          type="password"
          name="confirm"
          autocomplete="new-password"
          required
          class="w-full"
        />
      </UFormField>

      <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>

      <p v-if="saved" role="status" class="text-sm text-primary">
        Password changed. Your other sessions have ended.
      </p>

      <UButton type="submit" label="Change password" :loading="busy" />
    </form>
  </div>
</template>
