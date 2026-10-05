<script setup lang="ts">
import { ROLE_LABELS, type User } from '~/types';

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();

const ready = shallowRef(false);
const name = shallowRef('');
const savingName = shallowRef(false);
const passwords = reactive({ current: '', next: '', confirm: '' });
const savingPassword = shallowRef(false);
const passwordError = shallowRef('');

onMounted(async () => {
  if (!(await session.ensure())) return;
  name.value = session.user.value?.name ?? '';
  ready.value = true;
});

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } }).data?.error ?? fallback;
}

async function saveName(): Promise<void> {
  savingName.value = true;

  try {
    const { user } = await api<{ user: User }>('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value }) });
    session.user.value = user;
    toast.add({ title: 'Profile saved', color: 'success', icon: 'i-lucide-circle-check' });
  } catch (error) {
    toast.add({ title: 'Not saved', description: apiMessage(error, 'Try again.'), color: 'error' });
  } finally {
    savingName.value = false;
  }
}

async function changePassword(): Promise<void> {
  passwordError.value = '';

  if (passwords.next !== passwords.confirm) {
    passwordError.value = 'The new passwords do not match.';
    return;
  }

  savingPassword.value = true;

  try {
    await api('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }) });
    Object.assign(passwords, { current: '', next: '', confirm: '' });
    toast.add({ title: 'Password changed', description: 'Other devices have been signed out.', color: 'success', icon: 'i-lucide-shield-check' });
  } catch (error) {
    passwordError.value = apiMessage(error, 'The password could not be changed.');
  } finally {
    savingPassword.value = false;
  }
}
</script>

<template>
  <VendaSettingsShell title="Profile" description="How you appear to your team, and how you sign in.">
    <div v-if="!ready" class="flex justify-center py-16"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>

    <template v-else-if="session.user.value">
      <UCard>
        <form class="space-y-4" @submit.prevent="saveName">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Name" name="name">
              <UInput v-model="name" autocomplete="name" class="w-full" />
            </UFormField>
            <UFormField label="Email" description="Ask an administrator to change it.">
              <UInput :model-value="session.user.value.email" disabled class="w-full" />
            </UFormField>
          </div>
          <div class="flex items-center justify-between gap-3">
            <UBadge color="neutral" variant="subtle" :label="ROLE_LABELS[session.user.value.role].label" />
            <UButton type="submit" label="Save profile" :loading="savingName" />
          </div>
        </form>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">Change password</h2>
          <p class="mt-1 text-xs text-muted">Changing it signs you out everywhere else.</p>
        </template>
        <form class="space-y-4" @submit.prevent="changePassword">
          <UFormField label="Current password" name="current-password" description="Leave empty if you have only signed in with the recovery credentials.">
            <UInput v-model="passwords.current" type="password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="New password" name="new-password" description="At least 10 characters." required>
              <UInput v-model="passwords.next" type="password" autocomplete="new-password" class="w-full" />
            </UFormField>
            <UFormField label="Confirm new password" name="confirm-password" required>
              <UInput v-model="passwords.confirm" type="password" autocomplete="new-password" class="w-full" />
            </UFormField>
          </div>
          <UAlert v-if="passwordError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="passwordError" aria-live="polite" />
          <div class="flex justify-end">
            <UButton type="submit" label="Change password" :loading="savingPassword" :disabled="!passwords.next" />
          </div>
        </form>
      </UCard>
    </template>
  </VendaSettingsShell>
</template>
