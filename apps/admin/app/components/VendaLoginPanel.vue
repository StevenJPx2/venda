<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui';

interface LoginCredentials {
  email: string;
  password: string;
}

defineProps<{
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  submit: [credentials: LoginCredentials];
}>();

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'admin@example.com',
    required: true
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Your password',
    required: true
  }
];

function onSubmit(event: FormSubmitEvent<LoginCredentials>): void {
  emit('submit', event.data);
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center bg-elevated/30 p-4">
    <UCard class="w-full max-w-md shadow-xl shadow-primary/5">
      <UAuthForm
        :fields="fields"
        :loading="loading"
        :submit="{ label: 'Sign in', block: true }"
        title="Welcome to Venda"
        description="Manage your content from the edge."
        icon="i-lucide-box"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Unable to sign in"
            :description="error"
          />
        </template>
        <template #footer>
          <p class="text-center text-xs text-muted">
            Venda · content, at the edge.
          </p>
        </template>
      </UAuthForm>
    </UCard>
  </div>
</template>
