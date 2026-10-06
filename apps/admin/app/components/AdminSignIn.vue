<script setup lang="ts">
import { useAdmin, useAdminAction } from '@venda/admin';

const admin = useAdmin();
const { busy, error, perform } = useAdminAction();
const email = ref('');
const password = ref('');
const attempted = ref(false);
const emailInput = useTemplateRef('emailInput');
const passwordInput = useTemplateRef('passwordInput');

// Shown only after a sign-in attempt, and gone as soon as the field is filled.
const emailError = computed(() => attempted.value && !email.value.trim() ? 'Enter your email.' : false);
const passwordError = computed(() => attempted.value && !password.value ? 'Enter your password.' : false);

// Enter in any field signs in. A missing field takes focus and says what it
// needs, instead of the browser's validation bubble that silently blocks it.
async function signIn() {
  attempted.value = true;

  if (emailError.value) return emailInput.value?.inputRef?.focus();

  if (passwordError.value) return passwordInput.value?.inputRef?.focus();

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

      <form class="mt-8 space-y-5" novalidate @submit.prevent="signIn">
        <UFormField label="Email" name="email" required :error="emailError">
          <UInput ref="emailInput" v-model="email" type="email" autocomplete="username" name="email" required autofocus class="w-full" />
        </UFormField>

        <UFormField label="Password" name="password" required :error="passwordError">
          <UInput ref="passwordInput" v-model="password" type="password" autocomplete="current-password" name="password" required class="w-full" />
        </UFormField>

        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" label="Sign in" :loading="busy" block />
      </form>
    </div>
  </main>
</template>
