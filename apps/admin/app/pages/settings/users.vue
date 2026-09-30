<script setup lang="ts">
import { ROLE_LABELS, ROLES, type Invitation, type Role, type User } from '~/types';

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();

const ready = shallowRef(false);
const users = shallowRef<User[]>([]);
const invitations = shallowRef<Invitation[]>([]);
const invite = reactive({ email: '', role: 'author' as Role });
const inviting = shallowRef(false);
const inviteLink = shallowRef('');
const busyId = shallowRef<string | null>(null);

const roleItems = ROLES.map(role => ({ label: ROLE_LABELS[role].label, value: role, description: ROLE_LABELS[role].description }));
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } }).data?.error ?? fallback;
}

async function load(): Promise<void> {
  [users.value, invitations.value] = await Promise.all([api<User[]>('/users'), api<Invitation[]>('/invitations')]);
}

onMounted(async () => {
  if (!(await session.ensure())) return;
  if (!session.can('users:manage')) return navigateTo('/settings/profile');
  await load();
  ready.value = true;
});

async function sendInvite(): Promise<void> {
  inviting.value = true;
  inviteLink.value = '';
  try {
    const { token } = await api<{ token: string }>('/invitations', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(invite) });
    // The admin SPA hosts the acceptance page, so the link uses this origin.
    inviteLink.value = new URL(`/invite/${token}`, window.location.origin).toString();
    invite.email = '';
    await load();
  } catch (error) {
    toast.add({ title: 'Invitation not created', description: apiMessage(error, 'Try again.'), color: 'error' });
  } finally {
    inviting.value = false;
  }
}

async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(inviteLink.value);
  toast.add({ title: 'Link copied', color: 'success', icon: 'i-lucide-copy-check' });
}

async function updateUser(user: User, change: Partial<Pick<User, 'role' | 'status'>>): Promise<void> {
  busyId.value = user.id;
  try {
    const updated = await api<User>(`/users/${user.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(change) });
    users.value = users.value.map(u => (u.id === user.id ? updated : u));
    toast.add({ title: 'User updated', description: 'Their sessions were signed out so the change applies now.', color: 'success' });
  } catch (error) {
    toast.add({ title: 'Not updated', description: apiMessage(error, 'Try again.'), color: 'error' });
  } finally {
    busyId.value = null;
  }
}

async function removeUser(user: User): Promise<void> {
  if (!window.confirm(`Delete ${user.email}? Their entries are kept.`)) return;
  busyId.value = user.id;
  try {
    await api(`/users/${user.id}`, { method: 'DELETE' });
    users.value = users.value.filter(u => u.id !== user.id);
  } catch (error) {
    toast.add({ title: 'Not deleted', description: apiMessage(error, 'Try again.'), color: 'error' });
  } finally {
    busyId.value = null;
  }
}

async function revoke(invitation: Invitation): Promise<void> {
  await api(`/invitations/${invitation.id}`, { method: 'DELETE' });
  invitations.value = invitations.value.filter(i => i.id !== invitation.id);
}
</script>

<template>
  <VendaSettingsShell title="Users" description="Invite your team and choose what each person can do.">
    <div v-if="!ready" class="flex justify-center py-16"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>

    <template v-else>
      <UCard>
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">Invite someone</h2>
          <p class="mt-1 text-xs text-muted">They get a link to choose a password. Links expire after 7 days.</p>
        </template>
        <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="sendInvite">
          <UFormField label="Email" name="invite-email" class="flex-1">
            <UInput v-model="invite.email" type="email" autocomplete="off" spellcheck="false" placeholder="teammate@example.com…" required class="w-full" />
          </UFormField>
          <UFormField label="Role" name="invite-role" class="sm:w-56">
            <USelect v-model="invite.role" :items="roleItems" value-key="value" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Create invite" icon="i-lucide-send" :loading="inviting" />
        </form>
        <div v-if="inviteLink" class="mt-4 flex items-center gap-2 rounded-lg border border-default bg-elevated/40 p-3" aria-live="polite">
          <UIcon name="i-lucide-link" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <code class="min-w-0 flex-1 truncate text-xs">{{ inviteLink }}</code>
          <UButton label="Copy" icon="i-lucide-copy" size="xs" color="neutral" variant="outline" @click="copyLink" />
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header><h2 class="text-sm font-semibold text-highlighted">Team · {{ users.length }}</h2></template>
        <ul class="divide-y divide-default">
          <li v-for="user in users" :key="user.id" class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ user.name || user.email }}
                <span v-if="user.id === session.user.value?.id" class="text-xs font-normal text-muted">(you)</span>
              </p>
              <p class="truncate text-xs text-muted">{{ user.email }} · {{ user.lastLoginAt ? `Last seen ${new Date(user.lastLoginAt).toLocaleDateString()}` : 'Never signed in' }}</p>
            </div>
            <UBadge v-if="user.status === 'disabled'" color="warning" variant="subtle" label="Disabled" />
            <USelect :model-value="user.role" :items="roleItems" value-key="value" size="sm" class="w-44" :disabled="busyId === user.id" :aria-label="`Role for ${user.email}`" @update:model-value="(role: Role) => updateUser(user, { role })" />
            <UButton :label="user.status === 'active' ? 'Disable' : 'Enable'" size="sm" color="neutral" variant="ghost" :disabled="busyId === user.id || user.id === session.user.value?.id" @click="updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })" />
            <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" :aria-label="`Delete ${user.email}`" :disabled="busyId === user.id || user.id === session.user.value?.id" @click="removeUser(user)" />
          </li>
        </ul>
      </UCard>

      <UCard v-if="invitations.length" :ui="{ body: 'p-0 sm:p-0' }">
        <template #header><h2 class="text-sm font-semibold text-highlighted">Pending invitations</h2></template>
        <ul class="divide-y divide-default">
          <li v-for="invitation in invitations" :key="invitation.id" class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-highlighted">{{ invitation.email }}</p>
              <p class="text-xs text-muted">{{ ROLE_LABELS[invitation.role].label }} · expires {{ new Date(invitation.expiresAt).toLocaleDateString() }}</p>
            </div>
            <UButton label="Revoke" size="sm" color="neutral" variant="ghost" @click="revoke(invitation)" />
          </li>
        </ul>
      </UCard>
    </template>
  </VendaSettingsShell>
</template>
