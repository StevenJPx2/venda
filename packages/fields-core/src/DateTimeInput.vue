<script setup lang="ts">
// A date and time in the person's time zone, stored as a UTC ISO string (what
// the file holds). Type the segments, or pick the day from a calendar.
import {
  getLocalTimeZone,
  now,
  parseAbsoluteToLocal,
  toCalendarDate,
  toZoned,
  type DateValue,
  type ZonedDateTime
} from '@internationalized/date';
import { computed, shallowRef } from 'vue';
import { textOf, type FieldProps } from './values';

const props = defineProps<FieldProps>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

// The hour used when a day is picked before any time is set.
const DEFAULT_HOUR = 9;

const zone = getLocalTimeZone();
const open = shallowRef(false);

const value = computed<ZonedDateTime | null>(() => {
  const iso = textOf(props.modelValue);

  return iso ? parseAbsoluteToLocal(iso) : null;
});

const day = computed(() =>
  value.value ? toCalendarDate(value.value) : undefined
);

const save = (next: ZonedDateTime | null) =>
  emit('update:modelValue', next ? next.toDate().toISOString() : null);

// The inputs also emit ranges and lists in their other modes; this one is a
// single date, so anything else counts as cleared.
interface DateRange {
  readonly start: DateValue | undefined;
  readonly end: DateValue | undefined;
}

type Emitted = DateValue | DateRange | DateValue[] | null | undefined;

const singleDate = (next: Emitted): DateValue | undefined =>
  next && !Array.isArray(next) && 'day' in next ? next : undefined;

function onInput(next: Emitted) {
  const day = singleDate(next);

  save(day ? toZoned(day, zone) : null);
}

/** Picking a day keeps the chosen time, or uses the default hour for a new one. */
function onPickDay(emitted: Emitted) {
  const next = singleDate(emitted);

  open.value = false;

  if (!next) return;

  const base =
    value.value ??
    toZoned(toCalendarDate(next), zone).set({ hour: DEFAULT_HOUR, minute: 0 });

  save(base.set({ year: next.year, month: next.month, day: next.day }));
}
</script>

<template>
  <UInputDate
    :model-value="value"
    granularity="minute"
    hide-time-zone
    :disabled="readonly"
    :default-placeholder="now(zone)"
    :aria-label="field.label ?? field.key"
    class="w-full"
    @update:model-value="onInput"
  >
    <template v-if="!readonly" #trailing>
      <UButton
        v-if="value"
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-x"
        aria-label="Clear"
        class="px-0"
        @click="save(null)"
      />

      <UPopover v-model:open="open" :content="{ align: 'end', sideOffset: 8 }">
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-calendar"
          aria-label="Pick a day"
          class="px-0"
        />

        <template #content>
          <UCalendar
            :model-value="day"
            class="p-2"
            @update:model-value="onPickDay"
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
