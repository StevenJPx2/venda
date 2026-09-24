<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import type { Collection, Entry, EntryStatus, Media } from '~/types';

interface SessionResponse {
  email: string | null;
}

interface CollectionResponse {
  id: string;
}

const { api } = useVendaApi();
const toast = useToast();

const email = shallowRef('');
const loggedIn = shallowRef(false);
const loading = shallowRef(true);
const saving = shallowRef(false);
const uploading = shallowRef(false);
const error = shallowRef('');
const collections = shallowRef<Collection[]>([]);
const selected = shallowRef<Collection | null>(null);
const entries = shallowRef<Entry[]>([]);
const editingEntry = shallowRef<Entry | null>(null);
const media = shallowRef<Media[]>([]);

const publishedCount = computed(() => entries.value.filter(entry => entry.status === 'published').length);
const draftCount = computed(() => entries.value.filter(entry => entry.status === 'draft').length);
const publicUrl = computed(() => selected.value ? `https://api.venda.stevenjohn.co/api/content/${selected.value.slug}` : '');

async function checkSession(): Promise<void> {
  try {
    const result = await api<SessionResponse>('/auth/me');
    loggedIn.value = Boolean(result.email);

    if (loggedIn.value) await loadCollections();
  } catch {
    loggedIn.value = false;
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
    email.value = credentials.email;
    loggedIn.value = true;
    await loadCollections();
  } catch {
    error.value = 'Check your email and password, then try again.';
  }
}

async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' });
  loggedIn.value = false;
  selected.value = null;
  entries.value = [];
}

async function loadCollections(): Promise<void> {
  const result = await api<Collection[]>('/collections');
  collections.value = result;

  const next = selected.value ? result.find(collection => collection.id === selected.value?.id) : result[0];

  if (next) {
    await selectCollection(next);
  } else {
    selected.value = null;
    entries.value = [];
  }
}

async function selectCollection(collection: Collection): Promise<void> {
  selected.value = collection;
  editingEntry.value = null;
  entries.value = await api<Entry[]>(`/collections/${collection.id}/entries`);
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
    if (createdCollection) await selectCollection(createdCollection);

    toast.add({ title: 'Collection created', color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    error.value = 'Could not create the collection. Its slug may already be in use.';
  }
}

async function saveEntry(draft: { slug: string; data: Record<string, unknown>; status: EntryStatus }): Promise<void> {
  if (!selected.value) return;

  saving.value = true;
  error.value = '';
  const wasEditing = Boolean(editingEntry.value);

  try {
    const path = editingEntry.value ? `/entries/${editingEntry.value.id}` : `/collections/${selected.value.id}/entries`;
    const method = editingEntry.value ? 'PATCH' : 'POST';

    await api(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });

    editingEntry.value = null;
    await refreshEntries();
    toast.add({ title: wasEditing ? 'Entry updated' : 'Entry created', color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    error.value = 'The entry could not be saved. Check its slug and JSON data.';
  } finally {
    saving.value = false;
  }
}

async function refreshEntries(): Promise<void> {
  if (!selected.value) return;

  entries.value = await api<Entry[]>(`/collections/${selected.value.id}/entries`);
}

function editEntry(entry: Entry): void {
  editingEntry.value = entry;
}

async function deleteEntry(entry: Entry): Promise<void> {
  if (!window.confirm(`Delete “${entry.slug}”? This cannot be undone.`)) return;

  try {
    await api(`/entries/${entry.id}`, { method: 'DELETE' });
    if (editingEntry.value?.id === entry.id) editingEntry.value = null;
    await refreshEntries();
    toast.add({ title: 'Entry deleted', color: 'success', icon: 'i-lucide-trash-2' });
  } catch {
    error.value = 'The entry could not be deleted.';
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
    <UDashboardSidebar resizable collapsible :default-size="22" :min-size="18" :max-size="30" :ui="{ footer: 'border-t border-default' }">
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
          @select="selectCollection"
          @create="createCollection"
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          v-if="collapsed"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          block
          aria-label="Sign out"
          @click="logout"
        />
        <UButton
          v-else
          :label="email || 'Sign out'"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          block
          class="justify-start"
          @click="logout"
        />
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

          <div class="grid gap-4 sm:grid-cols-3">
            <UCard>
              <p class="text-sm text-muted">Collections</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ collections.length }}</p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">Published entries</p>
              <p class="mt-2 text-2xl font-semibold text-success">{{ publishedCount }}</p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">Draft entries</p>
              <p class="mt-2 text-2xl font-semibold text-warning">{{ draftCount }}</p>
            </UCard>
          </div>

          <UEmpty
            v-if="!selected"
            icon="i-lucide-panels-top-left"
            title="Choose a collection"
            description="Select a collection in the sidebar or create a new one to start editing."
            class="rounded-xl border border-dashed border-default bg-elevated/20 py-24"
          />

          <template v-else>
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-base font-semibold text-highlighted">Entries</p>
                    <p class="mt-1 text-sm text-muted">/{{ selected.slug }} · {{ entries.length }} total</p>
                  </div>
                  <UBadge color="primary" variant="subtle" icon="i-lucide-database">D1 content</UBadge>
                </div>
              </template>
              <VendaEntryList :entries="entries" @edit="editEntry" @delete="deleteEntry" />
            </UCard>

            <VendaEntryEditor :entry="editingEntry" :saving="saving" @submit="saveEntry" @cancel="editingEntry = null" />

            <VendaMediaPanel :items="media" :uploading="uploading" @upload="uploadMedia" />
          </template>
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
