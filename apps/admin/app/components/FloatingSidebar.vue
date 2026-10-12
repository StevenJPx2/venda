<script setup lang="ts">
// The desktop sidebar. Pinned, it sits beside the page; hidden, the page takes
// the width, and the pointer near the left edge floats it back over the page
// until the pointer moves well away. Its toggle sits in its head; hidden, the
// same toggle waits at the same height where the sidebar's icons were.
import { peekAt, useSidebar } from '~/utils/sidebar';

const props = defineProps<{ writing: boolean }>();

const WIDTH = 232;
const CLOSE_DELAY = 200;

const sidebar = useSidebar(toRef(props, 'writing'));
const { state, instant } = sidebar;
const aside = useTemplateRef<HTMLElement>('aside');
let closing: ReturnType<typeof setTimeout> | undefined;

const shown = computed(() => state.value === 'shown');

// An open menu, select or popover anywhere keeps the sidebar out: one opened
// from it (who you are) reaches past it, and hiding it would pull the menu's
// trigger from under it.
const holding = () => Boolean(document.querySelector('[aria-expanded="true"]'));

function onPointer(event: PointerEvent) {
  if (shown.value || event.pointerType === 'touch') return;

  const want = peekAt(event.clientX, sidebar.peeking.value, WIDTH);

  if (want !== 'close') clearTimeout(closing);

  if (want === 'open') sidebar.peek(true);

  if (want === 'close' && !holding())
    closing = setTimeout(() => sidebar.peek(false), CLOSE_DELAY);
}

onMounted(() =>
  window.addEventListener('pointermove', onPointer, { passive: true })
);

onUnmounted(() => {
  clearTimeout(closing);
  window.removeEventListener('pointermove', onPointer);
});
</script>

<template>
  <div
    class="floating-sidebar"
    :data-state="state"
    :data-instant="instant || undefined"
  >
    <div v-if="!shown" class="sidebar-rail">
      <UButton
        icon="i-lucide-panel-left-open"
        aria-label="Show sidebar"
        title="Show sidebar (⌘\)"
        color="neutral"
        variant="ghost"
        size="sm"
        class="sidebar-toggle"
        @click="sidebar.toggle()"
      />
    </div>

    <aside ref="aside" class="admin-sidebar" :inert="state === 'hidden'">
      <div class="sidebar-head">
        <slot name="head" />

        <UButton
          :icon="
            shown ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'
          "
          :aria-label="shown ? 'Hide sidebar' : 'Keep sidebar open'"
          :title="shown ? 'Hide sidebar (⌘\\)' : 'Keep sidebar open (⌘\\)'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="sidebar-toggle"
          @click="sidebar.toggle()"
        />
      </div>

      <slot />
    </aside>
  </div>
</template>
