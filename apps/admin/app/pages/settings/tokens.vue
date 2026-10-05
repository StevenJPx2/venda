<script setup lang="ts">
import type { ApiToken, Capability } from '~/types';

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();

const SCOPE_LABELS: Record<Capability, string> = {
  'content:read': 'Read all content, including drafts',
  'content:create': 'Create entries',
  'content:edit:own': 'Edit own entries',
  'content:edit:any': 'Edit any entry',
  'content:publish:own': 'Publish own entries',
  'content:publish:any': 'Publish any entry',
  'content:delete:own': 'Delete own entries',
  'content:delete:any': 'Delete any entry',
  'media:upload': 'Upload media',
  'media:delete:own': 'Delete own media',
  'media:delete:any': 'Delete any media',
  'schema:manage': 'Edit data models',
  'users:manage': 'Manage users'
};

const ready = shallowRef(false);
const tokens = shallowRef<ApiToken[]>([]);
const form = reactive({ name: '', scopes: ['content:read'] as Capability[], expiresInDays: 90 as number | null });
const creating = shallowRef(false);
const secret = shallowRef('');

// Only scopes the user's own role grants can be delegated.
const scopeOptions = computed(() => session.capabilities.value.map(scope => ({ scope, label: SCOPE_LABELS[scope] })));
const expiryItems = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
  { label: 'Never', value: null }
];

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } }).data?.error ?? fallback;
}

onMounted(async () => {
  if (!(await session.ensure())) return;

  tokens.value = await api<ApiToken[]>('/tokens');
  ready.value = true;
});

function toggleScope(scope: Capability, on: boolean): void {
  form.scopes = on ? [...new Set([...form.scopes, scope])] : form.scopes.filter(s => s !== scope);
}

async function create(): Promise<void> {
  creating.value = true;
  secret.value = '';

  try {
    const body = { name: form.name, scopes: form.scopes, ...(form.expiresInDays ? { expiresInDays: form.expiresInDays } : {}) };
    const result = await api<{ token: ApiToken; secret: string }>('/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    secret.value = result.secret;
    tokens.value = [result.token, ...tokens.value];
    form.name = '';
  } catch (error) {
    toast.add({ title: 'Token not created', description: apiMessage(error, 'Try again.'), color: 'error' });
  } finally {
    creating.value = false;
  }
}

async function revoke(token: ApiToken): Promise<void> {
  if (!window.confirm(`Revoke “${token.name}”? Scripts using it stop working immediately.`)) return;

  await api(`/tokens/${token.id}`, { method: 'DELETE' });
  tokens.value = tokens.value.filter(t => t.id !== token.id);
}

async function copySecret(): Promise<void> {
  await navigator.clipboard.writeText(secret.value);
  toast.add({ title: 'Token copied', color: 'success', icon: 'i-lucide-copy-check' });
}
</script>

<template>
  <VendaSettingsShell title="API tokens" description="Let scripts, CI and agents use the API as you, limited to the scopes you choose.">
    <div v-if="!ready" class="flex justify-center py-16"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>

    <template v-else>
      <UCard>
        <form class="space-y-4" @submit.prevent="create">
          <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <UFormField label="Name" name="token-name" description="Where it will be used, e.g. “Netlify rebuild”." required>
              <UInput v-model="form.name" autocomplete="off" class="w-full" />
            </UFormField>
            <UFormField label="Expires" name="token-expiry">
              <USelect v-model="form.expiresInDays" :items="expiryItems" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <fieldset class="space-y-2">
            <legend class="text-sm font-medium text-highlighted">Scopes</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              <UCheckbox v-for="option in scopeOptions" :key="option.scope" :model-value="form.scopes.includes(option.scope)" :label="option.label" :description="option.scope" @update:model-value="(on: boolean | 'indeterminate') => toggleScope(option.scope, on === true)" />
            </div>
          </fieldset>
          <div class="flex justify-end">
            <UButton type="submit" label="Create token" icon="i-lucide-key-round" :loading="creating" :disabled="!form.name.trim() || !form.scopes.length" />
          </div>
        </form>

        <div v-if="secret" class="mt-4 space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3" aria-live="polite">
          <p class="text-xs font-medium text-highlighted">Copy this token now. It won’t be shown again.</p>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate text-xs">{{ secret }}</code>
            <UButton label="Copy" icon="i-lucide-copy" size="xs" color="neutral" variant="outline" @click="copySecret" />
          </div>
          <p class="text-xs text-muted">Send it as <code>Authorization: Bearer &lt;token&gt;</code>.</p>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header><h2 class="text-sm font-semibold text-highlighted">Your tokens · {{ tokens.length }}</h2></template>
        <UEmpty v-if="!tokens.length" icon="i-lucide-key-round" title="No tokens yet" description="Create one above for scripts or CI." class="py-10" />
        <ul v-else class="divide-y divide-default">
          <li v-for="token in tokens" :key="token.id" class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ token.name }}</p>
              <p class="truncate text-xs text-muted">
                {{ token.scopes.join(', ') }} ·
                {{ token.expiresAt ? `expires ${new Date(token.expiresAt).toLocaleDateString()}` : 'never expires' }} ·
                {{ token.lastUsedAt ? `used ${new Date(token.lastUsedAt).toLocaleDateString()}` : 'never used' }}
              </p>
            </div>
            <UButton label="Revoke" size="sm" color="error" variant="ghost" @click="revoke(token)" />
          </li>
        </ul>
      </UCard>
    </template>
  </VendaSettingsShell>
</template>
