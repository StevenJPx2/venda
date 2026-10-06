<script setup lang="ts">
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import type { Role, User } from '@venda/contract';
import { onMounted, ref } from 'vue';

const admin = useAdmin();
const people = useAdminResource(() => admin.request(admin.api.users.list()));
const { busy, error, perform } = useAdminAction();

const selected = ref<User | null>(null);
const open = ref(false);

const name = ref('');
const role = ref<Role>('author');
const status = ref<'active' | 'disabled'>('active');
const roles = ['administrator', 'editor', 'author', 'contributor'];

onMounted(people.reload);

function edit(user: User) {
  selected.value = user;
  name.value = user.name;
  role.value = user.role;
  status.value = user.status;
  error.value = '';
  open.value = true;
}

/** Only the fields that changed, so the server keeps the rest untouched. */
function changedFields(person: User) {
  return {
    name: name.value,
    role: role.value === person.role ? undefined : role.value,
    status: status.value === person.status ? undefined : status.value
  };
}

async function save() {
  const person = selected.value;

  if (!person) return;

  await perform(async () => {
    await admin.request(admin.api.users.update({ params: { id: person.id }, payload: changedFields(person) }));
    open.value = false;
    await people.reload();

    // Changing your own role or status also ends this session.
    if (person.id === admin.user.value?.id) await admin.refreshIdentity();
  });
}
</script>

<template>
  <AdminScreenHeader title="People" description="The people who write and manage this site.">
    <UButton to="/settings/invitations" label="Invite someone" icon="i-lucide-plus" />
  </AdminScreenHeader>

  <AdminFeedback :busy="people.busy.value" :error="people.error.value" @retry="people.reload" />

  <div class="list-surface">
    <div v-for="person in people.data.value" :key="person.id" class="content-row">
      <div class="min-w-0 flex-1">
        <p class="font-medium text-highlighted break-words">{{ person.name || person.email }}<span v-if="person.id === admin.user.value?.id" class="font-normal text-xs text-muted ml-2">you</span></p>
        <p class="mt-1 text-xs text-muted break-all">{{ person.email }}</p>
      </div>

      <span class="text-xs text-muted capitalize">{{ person.status === 'disabled' ? 'Disabled' : person.role }}</span>

      <UDropdownMenu :items="[{ label: 'Edit person', icon: 'i-lucide-pencil', onSelect: () => edit(person) }]">
        <UButton icon="i-lucide-ellipsis" :aria-label="`Actions for ${person.email}`" color="neutral" variant="ghost" />
      </UDropdownMenu>
    </div>
  </div>

  <UModal v-model:open="open" title="Edit person" description="Role and status changes sign this person out on every device." :dismissible="!busy">
    <template #body>
      <form id="edit-person" class="space-y-5" @submit.prevent="save">
        <p class="text-sm text-muted break-all">{{ selected?.email }}</p>

        <UFormField label="Name">
          <UInput v-model="name" name="name" maxlength="120" class="w-full" />
        </UFormField>

        <UFormField label="Role">
          <USelect v-model="role" :items="roles" aria-label="Role" class="w-full" />
        </UFormField>

        <UFormField label="Status">
          <USelect v-model="status" :items="['active', 'disabled']" aria-label="Status" class="w-full" />
        </UFormField>

        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
      </form>
    </template>

    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="open = false" />
      <UButton type="submit" form="edit-person" label="Save changes" :loading="busy" />
    </template>
  </UModal>
</template>
