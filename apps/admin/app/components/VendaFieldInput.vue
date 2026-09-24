<script setup lang="ts">
import type { FieldDefinition } from '@venda/schema';

// One Directus-style interface for one field. The parent owns the value.
const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const toast = useToast();
const { upload, pick } = useMediaUpload();
const uploading = shallowRef(false);

const text = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''));
const tags = computed(() => (Array.isArray(props.modelValue) ? props.modelValue.filter((t): t is string => typeof t === 'string') : []));
const numberValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : null));
const choices = computed(() => (props.field.choices ?? []).map(c => ({ label: c.label, value: c.value })));
// Optional props are only passed when set (exactOptionalPropertyTypes).
const placeholderProp = computed(() => (props.field.placeholder ? { placeholder: props.field.placeholder } : {}));

// datetime-local works in local time without a zone; store ISO 8601 in UTC.
const localDatetime = computed(() => {
  if (typeof props.modelValue !== 'string' || Number.isNaN(Date.parse(props.modelValue))) return '';
  const date = new Date(props.modelValue);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
});

function setDatetime(value: string): void {
  emit('update:modelValue', value ? new Date(value).toISOString() : undefined);
}

// JSON is edited as text and only emitted once it parses.
const jsonText = shallowRef(props.modelValue === undefined ? '' : JSON.stringify(props.modelValue, null, 2));
const jsonError = shallowRef('');

function setJson(value: string): void {
  jsonText.value = value;
  if (!value.trim()) { jsonError.value = ''; emit('update:modelValue', undefined); return; }
  try {
    emit('update:modelValue', JSON.parse(value));
    jsonError.value = '';
  } catch {
    jsonError.value = 'Not valid JSON yet — changes are saved once it parses.';
  }
}

async function chooseImage(): Promise<void> {
  const file = await pick('image/*');
  if (!file) return;
  uploading.value = true;
  try {
    emit('update:modelValue', await upload(file));
  } catch (error) {
    toast.add({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Please try again.', color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <UInput
    v-if="field.interface === 'input'"
    :model-value="text"
    v-bind="placeholderProp"
    class="w-full"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UTextarea
    v-else-if="field.interface === 'textarea'"
    :model-value="text"
    v-bind="placeholderProp"
    :rows="3"
    autoresize
    class="w-full"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <VendaRichTextField
    v-else-if="field.interface === 'wysiwyg'"
    :model-value="text"
    v-bind="placeholderProp"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UInputNumber
    v-else-if="field.interface === 'number'"
    :model-value="numberValue"
    v-bind="placeholderProp"
    :format-options="{ maximumFractionDigits: 6, useGrouping: false }"
    class="w-full"
    @update:model-value="emit('update:modelValue', $event ?? undefined)"
  />

  <USwitch
    v-else-if="field.interface === 'toggle'"
    :model-value="modelValue === true"
    :label="modelValue === true ? 'On' : 'Off'"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UInput
    v-else-if="field.interface === 'datetime'"
    type="datetime-local"
    :model-value="localDatetime"
    class="w-full"
    @update:model-value="setDatetime(String($event ?? ''))"
  />

  <USelect
    v-else-if="field.interface === 'dropdown'"
    :model-value="text"
    :items="choices"
    value-key="value"
    :placeholder="field.placeholder ?? 'Choose…'"
    class="w-full"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <UInputTags
    v-else-if="field.interface === 'tags'"
    :model-value="tags"
    :placeholder="field.placeholder ?? 'Add a tag…'"
    class="w-full"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <div v-else-if="field.interface === 'image'" class="space-y-2">
    <div v-if="text" class="group relative overflow-hidden rounded-lg border border-default">
      <img :src="text" alt="" class="max-h-56 w-full object-cover">
      <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <UButton icon="i-lucide-replace" size="xs" color="neutral" aria-label="Replace image" :loading="uploading" @click="chooseImage" />
        <UButton icon="i-lucide-trash-2" size="xs" color="error" aria-label="Remove image" @click="emit('update:modelValue', undefined)" />
      </div>
    </div>
    <UButton
      v-else
      icon="i-lucide-image-plus"
      label="Upload image"
      color="neutral"
      variant="outline"
      :loading="uploading"
      @click="chooseImage"
    />
  </div>

  <div v-else-if="field.interface === 'code'" class="space-y-1">
    <UTextarea
      :model-value="jsonText"
      :rows="5"
      autoresize
      placeholder="{ }"
      class="w-full font-mono text-sm"
      @update:model-value="setJson(String($event ?? ''))"
    />
    <p v-if="jsonError" class="text-xs text-warning">{{ jsonError }}</p>
  </div>
</template>
