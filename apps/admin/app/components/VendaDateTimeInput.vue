<script setup lang="ts">
// A date and time in the user's time zone, stored as a UTC ISO string (what
// the API takes). Type the segments, or pick the day from a calendar.
import {
  getLocalTimeZone,
  now,
  parseAbsoluteToLocal,
  toCalendarDate,
  toZoned,
  type DateValue,
  type ZonedDateTime
} from '@internationalized/date';

const props = withDefaults(
  defineProps<{
    /** Refuse times before now (scheduling). */
    future?: boolean;
    /** Hour used when a day is picked before any time is set. */
    defaultHour?: number;
    ariaLabel?: string;
  }>(),
  { future: false, defaultHour: 9, ariaLabel: 'Date and time' }
);

const model = defineModel<string | null>({ default: null });

const zone = getLocalTimeZone();
const minimum = props.future ? now(zone) : undefined;

function toIso(value: DateValue): string {
  return ('timeZone' in value ? value : toZoned(value, zone))
    .toDate()
    .toISOString();
}

const value = computed<ZonedDateTime | null>({
  get: () => (model.value ? parseAbsoluteToLocal(model.value) : null),
  set: next => {
    model.value = next ? toIso(next) : null;
  }
});

function onInput(next: unknown): void {
  // A single field (not `range`) only ever emits one date, or null when cleared.
  value.value =
    next && typeof next === 'object' && 'day' in next
      ? toZoned(next as DateValue, zone)
      : null;
}

const day = computed(() =>
  value.value ? toCalendarDate(value.value) : undefined
);
// Omitted rather than `undefined` (exactOptionalPropertyTypes).
const inputLimits = minimum ? { minValue: minimum } : {};
const calendarLimits = minimum ? { minValue: toCalendarDate(minimum) } : {};

/** Picking a day keeps the chosen time, or uses the default hour for a new one. */
function onPickDay(next: unknown): void {
  if (!next || typeof next !== 'object' || !('day' in next)) return;

  const picked = next as DateValue;
  const base =
    value.value ??
    toZoned(toCalendarDate(picked), zone).set({
      hour: props.defaultHour,
      minute: 0
    });
  value.value = base.set({
    year: picked.year,
    month: picked.month,
    day: picked.day
  });
}

const open = shallowRef(false);
</script>

<template>
  <UInputDate
    :model-value="value"
    granularity="minute"
    hide-time-zone
    v-bind="inputLimits"
    :default-placeholder="minimum ?? now(zone)"
    :aria-label="ariaLabel"
    class="w-full"
    @update:model-value="onInput"
  >
    <template #trailing>
      <UButton
        v-if="value"
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-x"
        aria-label="Clear"
        class="px-0"
        @click="model = null"
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
            v-bind="calendarLimits"
            class="p-2"
            @update:model-value="
              (next: unknown) => {
                onPickDay(next);
                open = false;
              }
            "
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
