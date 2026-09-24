<script setup lang="ts">
import { fieldLabel, type FieldDefinition, type FieldError } from '@venda/schema';

// Directus-style item form: one input per field, half/full width on a 2-column grid.
const props = defineProps<{
  fields: FieldDefinition[];
  data: Record<string, unknown>;
  errors?: FieldError[];
}>();

const emit = defineEmits<{
  change: [key: string, value: unknown];
}>();

// Only pass the optional FormField props a field actually has.
function formFieldProps(field: FieldDefinition) {
  const error = props.errors?.find(e => e.field === field.key)?.message;
  return {
    label: fieldLabel(field),
    ...(field.note ? { description: field.note } : {}),
    ...(field.required ? { required: true } : {}),
    ...(error ? { error } : {})
  };
}
</script>

<template>
  <div class="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
    <UFormField
      v-for="field in fields"
      :key="field.key"
      v-bind="formFieldProps(field)"
      :class="field.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'"
      :data-field="field.key"
    >
      <VendaFieldInput :field="field" :model-value="data[field.key]" @update:model-value="emit('change', field.key, $event)" />
    </UFormField>
  </div>
</template>
