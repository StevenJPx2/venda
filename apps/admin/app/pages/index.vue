<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import type { Collection, Media } from '~/types';

interface CollectionResponse {
  id: string;
}

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();
const route = useRoute();
const router = useRouter();

const loggedIn = computed(() => Boolean(session.user.value));
const loading = shallowRef(true);
const uploading = shallowRef(false);
const error = shallowRef('');
const collections = shallowRef<Collection[]>([]);
const selected = shallowRef<Collection | null>(null);
const media = shallowRef<Media[]>([]);
const sidebarCollapsed = shallowRef(false);
// Derived from the configured API base so self-hosted installs link to themselves.
// A relative base (single-Worker install) resolves against the current origin.
const apiBase = useRuntimeConfig().public.apiBase;
const publicUrl = computed(() => {
  if (!selected.value || !import.meta.client) return '';
  return new URL(`${apiBase}/content/${selected.value.slug}`, window.location.origin).toString();
});

const userMenu = computed(() => [[
  { label: 'Profile', icon: 'i-lucide-user-round', to: '/settings/profile' },
  ...(session.can('users:manage') ? [{ label: 'Users', icon: 'i-lucide-users', to: '/settings/users' }] : []),
  { label: 'API tokens', icon: 'i-lucide-key-round', to: '/settings/tokens' }
], [
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => { void logout(); } }
]]);

async function checkSession(): Promise<void> {
  try {
    if (await session.refresh()) await loadCollections();
  } finally {
    loading.value = false;
  }
}

async function login(credentials: { email: string; password: string }): Promise<void> {
  error.value = '';

  try {
    await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    await session.refresh();
    await loadCollections();
  } catch {
    error.value = 'Check your email and password, then try again.';
  }
}

async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' });
  session.user.value = null;
  session.capabilities.value = [];
  selected.value = null;
}

async function loadCollections(): Promise<void> {
  const result = await api<Collection[]>('/collections');
  collections.value = result;

  // Returning from the editor or data model reopens the same collection.
  const wanted = selected.value?.id ?? (typeof route.query.collection === 'string' ? route.query.collection : undefined);
  const next = result.find(collection => collection.id === wanted) ?? result[0];

  if (next) selectCollection(next);
  else selected.value = null;
}

function selectCollection(collection: Collection): void {
  selected.value = collection;
  void router.replace({ query: { ...route.query, collection: collection.id } });
}

async function createCollection(payload: { name: string; slug?: string }): Promise<void> {
  error.value = '';

  try {
    const created = await api<CollectionResponse>('/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadCollections();

    const createdCollection = collections.value.find(collection => collection.id === created.id);
    if (createdCollection) selectCollection(createdCollection);

    toast.add({ title: 'Collection created', color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    error.value = 'Could not create the collection. Its slug may already be in use.';
  }
}

async function uploadMedia(file: File): Promise<void> {
  uploading.value = true;
  error.value = '';

  try {
    const form = new FormData();
    form.append('file', file);
    const item = await api<Media>('/media', { method: 'POST', body: form });
    media.value = [item, ...media.value];
    toast.add({ title: 'Media uploaded', description: file.name, color: 'success', icon: 'i-lucide-cloud-upload' });
  } catch {
    error.value = 'The upload failed. Files must be smaller than 10 MB.';
  } finally {
    uploading.value = false;
  }
}

onMounted(checkSession);
</script>

<template>
  <div v-if="loading" class="flex min-h-svh items-center justify-center bg-elevated/30">
    <div class="flex items-center gap-3 text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
      Loading Venda…
    </div>
  </div>

  <VendaLoginPanel v-else-if="!loggedIn" :loading="loading" :error="error" @submit="login" />

  <UDashboardGroup v-else storage="local" storage-key="venda-dashboard">
    <UDashboardSidebar v-model:collapsed="sidebarCollapsed" resizable collapsible :default-size="22" :min-size="18" :max-size="30" :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2" :class="collapsed ? 'justify-center w-full' : ''">
          <div class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-inverted">V</div>
          <span v-if="!collapsed" class="text-lg font-semibold tracking-tight text-highlighted">Venda</span>
        </div>
      </template>

      <template #default>
        <VendaCollectionSidebar
          :collections="collections"
          :selected-id="selected?.id ?? null"
          :collapsed="sidebarCollapsed"
          :can-create="session.can('schema:manage')"
          @select="selectCollection"
          @create="createCollection"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }" class="w-full">
          <UButton v-if="collapsed" icon="i-lucide-circle-user-round" color="neutral" variant="ghost" block aria-label="Account menu" />
          <UButton
            v-else
            :label="session.user.value?.name || session.user.value?.email || 'Account'"
            icon="i-lucide-circle-user-round"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="selected?.name ?? 'Content studio'">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              v-if="selected"
              label="View API"
              icon="i-lucide-external-link"
              color="neutral"
              variant="outline"
              size="sm"
              :to="publicUrl"
              target="_blank"
              external
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Something needs attention"
            :description="error"
          />

          <UEmpty
            v-if="!selected"
            icon="i-lucide-panels-top-left"
            title="Choose a collection"
            description="Select a collection in the sidebar or create a new one to start editing."
            class="rounded-xl border border-dashed border-default bg-elevated/20 py-24"
          />

          <template v-else>
            <VendaCollectionEntries :collection="selected" :collections-count="collections.length" />

            <VendaMediaPanel v-if="session.can('media:upload')" :items="media" :uploading="uploading" @upload="uploadMedia" />
          </template>
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
