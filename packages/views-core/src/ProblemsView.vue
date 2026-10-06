<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { onMounted } from 'vue';

const admin = useAdmin();

const problems = useAdminResource(() => admin.request(admin.api.adminContent.problems()));

onMounted(problems.reload);
</script>

<template>
  <AdminScreenHeader title="Content problems" description="Files that could not be indexed. Fix the file in your repository; the next sync checks it again.">
    <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="problems.busy.value" @click="problems.reload" />
  </AdminScreenHeader>

  <AdminFeedback :busy="problems.busy.value" :error="problems.error.value" :empty="problems.data.value?.length === 0" title="All files look good" description="Every content file fits its collection model." @retry="problems.reload" />

  <div class="list-surface">
    <div v-for="problem in problems.data.value" :key="problem.path" class="py-5 px-3 border-b border-default">
      <p class="text-sm font-medium break-all">{{ problem.path }}<span v-if="problem.line" class="text-muted"> · line {{ problem.line }}</span></p>
      <p class="text-sm text-muted mt-2 break-words">{{ problem.message }}</p>
    </div>
  </div>
</template>
