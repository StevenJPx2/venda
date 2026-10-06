<script setup lang="ts">
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import type { Invitation, Role } from '@venda/contract';
import { onMounted, ref } from 'vue';

const admin = useAdmin();
const invitations = useAdminResource(() => admin.request(admin.api.invitations.list()));
const create = useAdminAction();
const revoke = useAdminAction();

const open = ref(false);
const email = ref('');
const role = ref<Role>('author');
const link = ref('');

const selected = ref<Invitation | null>(null);
const confirm = ref(false);

onMounted(invitations.reload);

async function invite() {
  await create.perform(async () => {
    const created = await admin.request(admin.api.invitations.create({ payload: { email: email.value, role: role.value } }));

    link.value = new URL(`/admin/join/${encodeURIComponent(created.token)}`, window.location.origin).href;
    open.value = false;
    email.value = '';
    await invitations.reload();
  });
}

async function remove() {
  await revoke.perform(async () => {
    if (!selected.value) return;

    await admin.request(admin.api.invitations.revoke({ params: { id: selected.value.id } }));
    confirm.value = false;
    await invitations.reload();
  });
}
</script>

<template>
  <AdminScreenHeader title="Invitations" description="Invite someone with a private link. Links expire after seven days and can be used once.">
    <UButton label="Invite someone" icon="i-lucide-plus" @click="create.error.value = ''; open = true" />
  </AdminScreenHeader>

  <AdminSecret v-if="link" :value="link" title="Invitation ready" description="Copy this private link and send it to the person you invited. It will not be shown again after you leave this page." />
  <AdminFeedback :busy="invitations.busy.value" :error="invitations.error.value" :empty="invitations.data.value?.length === 0" title="No open invitations" description="Everyone invited has joined, or their link has expired." @retry="invitations.reload" />

  <div class="list-surface">
    <div v-for="invitation in invitations.data.value" :key="invitation.id" class="content-row">
      <div class="min-w-0 flex-1">
        <p class="font-medium break-all">{{ invitation.email }}</p>
        <p class="mt-1 text-xs text-muted">Expires {{ new Date(invitation.expiresAt).toLocaleDateString() }}</p>
      </div>

      <span class="text-xs text-muted capitalize">{{ invitation.role }}</span>

      <UDropdownMenu :items="[{ label: 'Revoke invitation', color: 'error', onSelect: () => { selected = invitation; revoke.error.value = ''; confirm = true; } }]">
        <UButton icon="i-lucide-ellipsis" :aria-label="`Actions for ${invitation.email}`" color="neutral" variant="ghost" />
      </UDropdownMenu>
    </div>
  </div>

  <UModal v-model:open="open" title="Invite someone" description="They will choose their own password when they open the link." :dismissible="!create.busy.value">
    <template #body>
      <form id="invite-person" class="space-y-5" @submit.prevent="invite">
        <UFormField label="Email" required>
          <UInput v-model="email" type="email" name="email" autocomplete="email" required class="w-full" />
        </UFormField>

        <UFormField label="Role">
          <USelect v-model="role" aria-label="Role" :items="['administrator', 'editor', 'author', 'contributor']" class="w-full" />
        </UFormField>

        <p class="text-xs text-muted">Administrators manage people and settings. Editors publish anyone's content. Authors publish their own; contributors write drafts.</p>
        <p v-if="create.error.value" role="alert" class="text-sm text-error">{{ create.error.value }}</p>
      </form>
    </template>

    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" :disabled="create.busy.value" @click="open = false" />
      <UButton label="Create invitation" type="submit" form="invite-person" :loading="create.busy.value" />
    </template>
  </UModal>

  <AdminConfirm v-model:open="confirm" title="Revoke invitation?" :description="`The link sent to ${selected?.email ?? 'this person'} will stop working.`" label="Revoke invitation" :busy="revoke.busy.value" :error="revoke.error.value" @confirm="remove" />
</template>
