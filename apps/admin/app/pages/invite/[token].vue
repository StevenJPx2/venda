<script setup lang="ts">
import { ROLE_LABELS, type Role } from '~/types';

const { api } = useVendaApi();
const session = useAdminSession();
const token = String(useRoute().params.token);

const invitation = shallowRef<{ email: string; role: Role } | null>(null);
const loading = shallowRef(true);
const invalid = shallowRef(false);
const form = reactive({ name: '', password: '', confirm: '' });
const submitting = shallowRef(false);
const error = shallowRef('');

onMounted(async () => {
  try {
    invitation.value = await api<{ email: string; role: Role }>(`/auth/invitations/${encodeURIComponent(token)}`);
  } catch {
    invalid.value = true;
  } finally {
    loading.value = false;
  }
});

async function accept(): Promise<void> {
  error.value = '';
  if (form.password !== form.confirm) {
    error.value = 'The passwords do not match.';
    return;
  }
  submitting.value = true;
  try {
    await api(`/auth/invitations/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, password: form.password }) });
    await session.refresh();
    await navigateTo('/');
  } catch (caught) {
    error.value = (caught as { data?: { error?: string } }).data?.error ?? 'Your account could not be created.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center bg-elevated/30 p-4">
    <UCard class="w-full max-w-md shadow-xl shadow-primary/5">
      <div v-if="loading" class="flex justify-center py-10"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>

      <UEmpty v-else-if="invalid || !invitation" icon="i-lucide-link-2-off" title="This invitation can’t be used" description="It may have expired or already been accepted. Ask an administrator for a new link." :actions="[{ label: 'Go to sign in', to: '/' }]" />

      <form v-else class="space-y-4" @submit.prevent="accept">
        <div>
          <h1 class="text-lg font-semibold text-highlighted">Join Venda</h1>
          <p class="mt-1 text-sm text-muted">You’ve been invited as {{ ROLE_LABELS[invitation.role].label.toLowerCase() }} with <strong class="text-highlighted">{{ invitation.email }}</strong>.</p>
        </div>
        <UFormField label="Your name" name="name">
          <UInput v-model="form.name" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField label="Password" name="password" description="At least 10 characters." required>
          <UInput v-model="form.password" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField label="Confirm password" name="confirm" required>
          <UInput v-model="form.confirm" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" aria-live="polite" />
        <UButton type="submit" label="Create account" block :loading="submitting" />
      </form>
    </UCard>
  </div>
</template>
