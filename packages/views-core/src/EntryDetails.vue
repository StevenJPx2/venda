<script setup lang="ts">
type Detail = readonly [label: string, text: string];

defineProps<{ about: ReadonlyArray<Detail>; fields: ReadonlyArray<Detail> }>();
</script>

<template>
  <div class="entry-details">
    <dl>
      <div v-for="[label, text] in about" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ text }}</dd>
      </div>
    </dl>

    <section v-if="fields.length" aria-labelledby="entry-frontmatter">
      <h3 id="entry-frontmatter" class="details-heading">Frontmatter</h3>

      <dl>
        <div v-for="[key, text] in fields" :key="key">
          <dt class="font-mono">{{ key }}</dt>
          <dd>{{ text }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
