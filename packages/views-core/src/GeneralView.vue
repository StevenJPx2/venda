<script setup lang="ts">
import {
  useAdmin,
  useAdminAction,
  useAdminRegistry,
  useAdminResource
} from '@venda/admin';
import type { SiteDocument } from '@venda/contract';
import { onMounted, ref, shallowRef } from 'vue';
import { tagOf } from './autosave';
import { screenDrafts, siteRequest, type ScreenDraft } from './general';
import ScreenDescription from './ScreenDescription.vue';

// The site's own settings, written to content/site.ts: its name, its address
// and the words each screen opens with. Save writes the file; a change made
// to it elsewhere since it was loaded is reported, never overwritten.
const admin = useAdmin();
const registry = useAdminRegistry();
const save = useAdminAction();
const document = useAdminResource(() =>
  admin.request(admin.api.contentWrite.site())
);
const name = shallowRef('');
const url = shallowRef('');
const drafts = ref<ScreenDraft[]>([]);
const conflict = shallowRef(false);
const saved = shallowRef(false);

function fill(site: SiteDocument) {
  document.data.value = site;
  name.value = site.settings.name ?? '';
  url.value = site.settings.url ?? '';
  drafts.value = screenDrafts(registry.pages, site.settings);
  conflict.value = false;
}

async function load() {
  await document.reload();

  if (document.data.value) fill(document.data.value);
}

onMounted(load);

const write = () =>
  admin.request(
    admin.api.contentWrite.saveSite(
      siteRequest(
        document.data.value?.sha ?? null,
        name.value,
        url.value,
        drafts.value
      )
    )
  );

const submit = () =>
  save.perform(async () => {
    saved.value = false;
    fill(
      await write().catch((cause: unknown) => {
        conflict.value = tagOf(cause) === 'Conflict';

        throw cause;
      })
    );
    // "Saved" appears once the whole admin uses the new settings.
    await admin.refreshSite();
    saved.value = true;
  });
</script>

<template>
  <AdminScreenHeader title="General">
    <span v-if="saved" class="text-xs text-muted" role="status">Saved</span>

    <UButton
      label="Save"
      :loading="save.busy.value"
      :disabled="!document.data.value"
      @click="submit"
    />
  </AdminScreenHeader>

  <AdminFeedback
    v-if="!document.data.value"
    :busy="document.busy.value"
    :error="document.error.value"
    @retry="load"
  />

  <UAlert
    v-if="conflict"
    class="mb-6"
    color="warning"
    variant="subtle"
    icon="i-lucide-git-compare"
    title="site.ts changed elsewhere"
    description="Someone changed the file since you opened this page, so nothing was saved. Load their version, then make your change again."
    :actions="[{ label: 'Load their version', onClick: load }]"
  />

  <p v-else-if="save.error.value" role="alert" class="mb-6 text-sm text-error">
    {{ save.error.value }}
  </p>

  <form v-if="document.data.value" class="entry-form" @submit.prevent="submit">
    <UFormField
      label="Site name"
      help="Shown in the sidebar and window titles."
    >
      <UInput v-model="name" maxlength="60" class="w-full" />
    </UFormField>

    <UFormField
      label="Address"
      help="Where the site lives, like https://example.com."
    >
      <UInput v-model="url" type="url" class="w-full" />
    </UFormField>

    <h2 class="mt-6 text-sm font-medium text-highlighted">
      Screen descriptions
    </h2>

    <ScreenDescription
      v-for="(draft, index) in drafts"
      :key="draft.id"
      v-model="drafts[index]!"
    />
  </form>
</template>
