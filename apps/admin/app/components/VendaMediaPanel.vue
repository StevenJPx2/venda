<script setup lang="ts">
import type { Media } from '~/types';

defineProps<{
  items: Media[];
  uploading: boolean;
}>();

const emit = defineEmits<{
  upload: [file: File];
}>();

const file = shallowRef<File | null>(null);

function onFileChange(value: File | File[] | null | undefined): void {
  const selected = Array.isArray(value) ? value[0] : value;

  if (!selected) return;

  emit('upload', selected);
  file.value = null;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-base font-semibold text-highlighted">Media library</p>
          <p class="mt-1 text-sm text-muted">Files are stored in Cloudflare R2.</p>
        </div>
        <UBadge color="neutral" variant="subtle">10 MB max</UBadge>
      </div>
    </template>

    <UFileUpload
      v-model="file"
      accept="image/*,application/pdf"
      icon="i-lucide-cloud-upload"
      label="Drop a file here"
      description="Images or PDFs · maximum 10 MB"
      :disabled="uploading"
      class="min-h-36"
      @update:model-value="onFileChange"
    />

    <div v-if="uploading" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Uploading to R2…
    </div>

    <UEmpty
      v-if="!items.length"
      icon="i-lucide-images"
      title="No uploads in this session"
      description="Upload a file to see it here."
      class="py-6"
    />
    <ul v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="item in items" :key="item.key" class="flex items-center gap-3 px-3 py-2.5">
        <UIcon name="i-lucide-file" class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ item.filename }}</span>
        <span class="text-xs text-muted">{{ formatSize(item.size) }}</span>
      </li>
    </ul>
  </UCard>
</template>
