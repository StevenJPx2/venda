<script setup lang="ts">
const route = useRoute(); const config = useRuntimeConfig();
const { data, error } = await useFetch(`${config.public.apiBase}/content/${route.params.collection}/${route.params.slug}`);
</script>
<template><main style="max-width:800px;margin:5rem auto;font-family:system-ui"><p v-if="error">Content not found.</p><pre v-else>{{ JSON.stringify(data, null, 2) }}</pre></main></template>
