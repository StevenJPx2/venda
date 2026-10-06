<script setup lang="ts">
import { useAdmin, useAdminAction } from '@venda/admin';

const admin = useAdmin();
const { busy, error, perform } = useAdminAction();
const email = ref('');
const password = ref('');

async function signIn() {
  await perform(async () => {
    admin.user.value = await admin.request(admin.api.auth.signIn({ payload: { email: email.value, password: password.value } }));
    password.value = '';
  });
}
</script>

<template>
  <main class="auth-screen">
    <div class="auth-form">
      <p class="brand-mark mb-8">venda<span>.</span></p>
      <h1 class="screen-title">Welcome back</h1>
      <p class="mt-2 text-sm text-muted">Sign in to your content.</p>

      <form class="mt-8 space-y-5" @submit.prevent="signIn">
        <UFormField label="Email" name="email" required>
          <UInput v-model="email" type="email" autocomplete="username" name="email" required autofocus class="w-full" />
        </UFormField>

        <UFormField label="Password" name="password" required>
          <UInput v-model="password" type="password" autocomplete="current-password" name="password" required class="w-full" />
        </UFormField>

        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" label="Sign in" :loading="busy" block />
      </form>
    </div>
  </main>
</template>
