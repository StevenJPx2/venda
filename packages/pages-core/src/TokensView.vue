<script setup lang="ts">
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import type { ApiToken } from '@venda/contract';
import { onMounted, ref } from 'vue';

const admin = useAdmin();
const tokens = useAdminResource(() => admin.request(admin.api.tokens.list()));
const create = useAdminAction();
const revoke = useAdminAction();

const open = ref(false);
const name = ref('');
const secret = ref('');

const selected = ref<ApiToken | null>(null);
const confirm = ref(false);

onMounted(tokens.reload);

async function make() {
  await create.perform(async () => {
    const created = await admin.request(
      admin.api.tokens.create({ payload: { name: name.value } })
    );

    secret.value = created.secret;
    name.value = '';
    open.value = false;
    await tokens.reload();
  });
}

async function remove() {
  await revoke.perform(async () => {
    if (!selected.value) return;

    await admin.request(
      admin.api.tokens.revoke({ params: { id: selected.value.id } })
    );
    secret.value = '';
    confirm.value = false;
    await tokens.reload();
  });
}
</script>

<template>
  <AdminScreenHeader
    title="API tokens"
    description="Private credentials for scripts and CI. Each token has your permissions; keep it out of source code."
  >
    <UButton
      label="Create token"
      icon="i-lucide-plus"
      @click="
        create.error.value = '';
        open = true;
      "
    />
  </AdminScreenHeader>

  <AdminSecret
    v-if="secret"
    :value="secret"
    title="Save your token"
    description="This secret is shown once. Store it securely and send it as Authorization: Bearer <token>."
  />

  <AdminFeedback
    :busy="tokens.busy.value"
    :error="tokens.error.value"
    :empty="tokens.data.value?.length === 0"
    title="No API tokens"
    description="Create one when a script needs to act on your behalf."
    @retry="tokens.reload"
  />

  <div class="list-surface">
    <div v-for="token in tokens.data.value" :key="token.id" class="content-row">
      <div class="min-w-0 flex-1">
        <p class="font-medium break-words">{{ token.name }}</p>

        <p class="mt-1 text-xs text-muted tabular-nums">
          {{
            token.lastUsedAt
              ? `Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
              : 'Not used yet'
          }}
        </p>
      </div>

      <UDropdownMenu
        :items="[
          {
            label: 'Revoke token',
            color: 'error',
            onSelect: () => {
              selected = token;
              revoke.error.value = '';
              confirm = true;
            }
          }
        ]"
      >
        <UButton
          icon="i-lucide-ellipsis"
          :aria-label="`Actions for ${token.name}`"
          color="neutral"
          variant="ghost"
        />
      </UDropdownMenu>
    </div>
  </div>

  <UModal
    v-model:open="open"
    title="Create API token"
    description="Choose a name so you can recognise what uses it."
    :dismissible="!create.busy.value"
  >
    <template #body>
      <form id="create-token" class="space-y-5" @submit.prevent="make">
        <UFormField label="Name" required>
          <UInput
            v-model="name"
            name="name"
            maxlength="120"
            required
            placeholder="e.g. Deployment script"
            class="w-full"
          />
        </UFormField>

        <p v-if="create.error.value" role="alert" class="text-sm text-error">
          {{ create.error.value }}
        </p>
      </form>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="create.busy.value"
        @click="open = false"
      />

      <UButton
        label="Create token"
        type="submit"
        form="create-token"
        :loading="create.busy.value"
      />
    </template>
  </UModal>

  <AdminConfirm
    v-model:open="confirm"
    title="Revoke API token?"
    :description="`Scripts using ${selected?.name ?? 'this token'} will lose access immediately.`"
    label="Revoke token"
    :busy="revoke.busy.value"
    :error="revoke.error.value"
    @confirm="remove"
  />
</template>
