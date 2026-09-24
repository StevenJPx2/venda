<script setup lang="ts">
import { FIELD_INTERFACES, parseSchema, type FieldDefinition, type FieldInterface } from '@venda/schema';

const props = defineProps<{
  field: FieldDefinition | null;
  existingKeys: string[];
}>();

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ save: [field: FieldDefinition] }>();

const ICONS: Record<FieldInterface, string> = {
  input: 'i-lucide-text-cursor-input',
  textarea: 'i-lucide-align-left',
  wysiwyg: 'i-lucide-pen-line',
  number: 'i-lucide-hash',
  toggle: 'i-lucide-toggle-right',
  datetime: 'i-lucide-calendar-clock',
  dropdown: 'i-lucide-list-checks',
  tags: 'i-lucide-tags',
  image: 'i-lucide-image',
  code: 'i-lucide-braces'
};

const state = reactive({
  interface: 'input' as FieldInterface,
  key: '',
  label: '',
  note: '',
  placeholder: '',
  required: false,
  half: false,
  choices: ''
});
const keyTouched = shallowRef(false);
const error = shallowRef('');
const isEdit = computed(() => props.field !== null);
const interfaceOptions = computed(() => (Object.keys(FIELD_INTERFACES) as FieldInterface[])
  .filter(name => !isEdit.value || FIELD_INTERFACES[name].value === FIELD_INTERFACES[props.field!.interface].value)
  .map(name => ({ label: FIELD_INTERFACES[name].label, value: name, icon: ICONS[name], description: FIELD_INTERFACES[name].description })));

watch(open, (isOpen) => {
  if (!isOpen) return;
  const field = props.field;
  Object.assign(state, {
    interface: field?.interface ?? 'input',
    key: field?.key ?? '',
    label: field?.label ?? '',
    note: field?.note ?? '',
    placeholder: field?.placeholder ?? '',
    required: field?.required ?? false,
    half: field?.width === 'half',
    choices: (field?.choices ?? []).map(choice => choice.label === choice.value ? choice.value : `${choice.value}=${choice.label}`).join('\n')
  });
  keyTouched.value = isEdit.value;
  error.value = '';
});

function keyFromLabel(label: string): string {
  const words = label.trim().replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  return words.map((word, index) => index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
}

watch(() => state.label, (label) => {
  if (!keyTouched.value) state.key = keyFromLabel(label);
});

function parseChoices(value: string): Array<{ value: string; label: string }> {
  return value.split('\n').map(line => line.trim()).filter(Boolean).map((line) => {
    const [choiceValue = '', ...rest] = line.split('=');
    return { value: choiceValue.trim(), label: rest.join('=').trim() || choiceValue.trim() };
  });
}

function submit(): void {
  error.value = '';
  const key = state.key.trim();
  if (!state.label.trim()) { error.value = 'Enter a label for this field.'; return; }
  if (!key) { error.value = 'Enter a key for this field.'; return; }
  if (!isEdit.value && props.existingKeys.includes(key)) { error.value = `A field with key "${key}" already exists.`; return; }

  const field: FieldDefinition = { key, interface: state.interface };
  if (state.label.trim()) field.label = state.label.trim();
  if (state.note.trim()) field.note = state.note.trim();
  if (state.placeholder.trim()) field.placeholder = state.placeholder.trim();
  if (state.required) field.required = true;
  if (state.half) field.width = 'half';
  if (state.interface === 'dropdown') field.choices = parseChoices(state.choices);

  try {
    const parsed = parseSchema({ fields: [field] });
    emit('save', parsed.fields[0]!);
  } catch (problem) {
    error.value = problem instanceof Error ? problem.message : 'Check the field settings.';
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Edit field' : 'Add a field'" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <form id="venda-field-modal-form" class="space-y-5" @submit.prevent="submit">
        <UFormField label="Interface" :description="isEdit ? 'Only interfaces that store the same kind of value are available.' : 'Choose how editors enter this field.'">
          <USelect v-model="state.interface" :items="interfaceOptions" value-key="value" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Label" name="label" required>
            <UInput v-model="state.label" placeholder="Short description…" class="w-full" />
          </UFormField>
          <UFormField label="Key" name="key" :description="isEdit ? 'Keys cannot change once content exists.' : 'Used as the key in entry data.'" required>
            <UInput v-model="state.key" :disabled="isEdit" autocomplete="off" class="w-full font-mono" @update:model-value="keyTouched = true" />
          </UFormField>
        </div>

        <UFormField label="Note" name="note" description="Help text shown under the field.">
          <UInput v-model="state.note" placeholder="Help editors understand this field…" class="w-full" />
        </UFormField>

        <UFormField v-if="!['toggle', 'image', 'code'].includes(state.interface)" label="Placeholder" name="placeholder">
          <UInput v-model="state.placeholder" placeholder="Example value…" class="w-full" />
        </UFormField>

        <UFormField v-if="state.interface === 'dropdown'" label="Choices" name="choices" description="One choice per line; use value=Label to customize the displayed label." required>
          <UTextarea v-model="state.choices" :rows="5" autoresize placeholder="draft&#10;review=In review&#10;published" class="w-full font-mono text-sm" />
        </UFormField>

        <div class="flex flex-wrap gap-x-6 gap-y-3">
          <USwitch v-model="state.required" label="Required to publish" />
          <USwitch v-model="state.half" label="Half width" />
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton type="submit" form="venda-field-modal-form" :label="isEdit ? 'Save field' : 'Add field'" />
      </div>
    </template>
  </UModal>
</template>
