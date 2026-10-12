<script setup lang="ts">
import {
  fieldLabel,
  useFieldInputs,
  type EntryEdit,
  type FieldValue
} from '@venda/admin';
import type { CollectionField } from '@venda/contract';
import { computed } from 'vue';

// Fields of an entry, each in the input installed for its type, labelled and
// explained as the model declares. Shared by the form and the writer's panel.
const props = defineProps<{
  fields: ReadonlyArray<CollectionField>;
  edit: EntryEdit;
}>();
const inputFor = useFieldInputs();

const rows = computed(() =>
  props.fields.map(field => ({
    field,
    label: fieldLabel(field),
    input: inputFor(field.type)
  }))
);

const set = (key: string, value: FieldValue | null) =>
  props.edit.set(key, value);
</script>

<template>
  <UFormField
    v-for="row in rows"
    :key="row.field.key"
    :label="row.label"
    :help="row.field.help ?? ''"
    :required="row.field.required"
  >
    <component
      :is="row.input"
      v-if="row.input"
      :field="row.field"
      :model-value="edit.data[row.field.key] ?? null"
      :readonly="edit.readonly"
      @update:model-value="
        (value: FieldValue | null) => set(row.field.key, value)
      "
    />

    <p v-else class="text-sm text-muted">
      No input is installed for {{ row.field.type }} fields.
    </p>
  </UFormField>
</template>
