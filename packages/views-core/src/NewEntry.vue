<script setup lang="ts">
import { useAdmin, useAdminAction } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { computed, shallowRef, watch } from 'vue';
import { entryPath } from './entries';
import { slugOf } from './text';

// Starts an entry: a title (when the model has one) suggests its slug, which
// can be changed until the slug is edited by hand. It opens in its editor as
// a new, unpublished copy. A single collection's one entry is always `index`.
const props = defineProps<{ collection: CollectionSummary; label: string }>();
const admin = useAdmin();
const action = useAdminAction();
const open = shallowRef(false);
const title = shallowRef('');
const slug = shallowRef('');
const slugEdited = shallowRef(false);
const single = computed(() => props.collection.kind === 'single');

watch(title, value => {
  if (!single.value && !slugEdited.value) slug.value = slugOf(value);
});

watch(open, isOpen => {
  if (!isOpen) return;

  title.value = '';
  slug.value = single.value ? 'index' : '';
  slugEdited.value = false;
  action.error.value = '';
});

function data(): Record<string, string> {
  const field = props.collection.titleField;

  return field && title.value.trim() ? { [field]: title.value.trim() } : {};
}

const create = () =>
  action.perform(async () => {
    const copy = await admin.request(
      admin.api.contentWrite.create({
        params: { collection: props.collection.slug },
        payload: { slug: slug.value, data: data() }
      })
    );

    open.value = false;
    await admin.navigate(entryPath(copy.collection, copy.slug));
  });
</script>

<template>
  <UButton :label="label" icon="i-lucide-plus" @click="open = true" />

  <UModal
    v-model:open="open"
    :title="label"
    :description="
      single
        ? 'This collection holds one entry. It opens as a draft until you publish it.'
        : 'It opens as a draft, and stays out of the site until you publish it.'
    "
    :dismissible="!action.busy.value"
  >
    <template #body>
      <form class="grid gap-4" @submit.prevent="create">
        <UFormField v-if="collection.titleField" label="Title">
          <UInput v-model="title" autofocus class="w-full" />
        </UFormField>

        <UFormField
          label="Slug"
          help="The file name, and usually the address on the site."
        >
          <UInput
            v-model="slug"
            :disabled="single"
            class="w-full"
            @update:model-value="slugEdited = true"
          />
        </UFormField>

        <p v-if="action.error.value" role="alert" class="text-sm text-error">
          {{ action.error.value }}
        </p>

        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="action.busy.value"
            @click="open = false"
          />

          <UButton
            type="submit"
            label="Create"
            :loading="action.busy.value"
            :disabled="!slug"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
