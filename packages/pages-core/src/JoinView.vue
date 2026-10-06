<script setup lang="ts">
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import { onMounted, ref } from 'vue';

const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();
const invitation = useAdminResource(() =>
  admin.request(
    admin.api.invitations.preview({
      params: { token: props.params.token ?? '' }
    })
  )
);
const { busy, error, perform } = useAdminAction();

const name = ref('');
const password = ref('');
const joined = ref(false);

onMounted(invitation.reload);

async function accept() {
  await perform(async () => {
    await admin.request(
      admin.api.invitations.accept({
        params: { token: props.params.token ?? '' },
        payload: { name: name.value, password: password.value }
      })
    );
    // Joining starts the session as well, so the invitation flow ends in content.
    admin.user.value = await admin.request(
      admin.api.auth.signIn({
        payload: {
          email: invitation.data.value?.email ?? '',
          password: password.value
        }
      })
    );
    password.value = '';
    joined.value = true;
  });
}
</script>

<template>
  <div class="auth-form">
    <p class="brand-mark mb-8">venda<span>.</span></p>

    <h1 class="screen-title">
      {{ joined ? 'You’re in' : 'Make yourself at home' }}
    </h1>

    <template v-if="joined">
      <p class="text-sm text-muted mt-3">
        Your account is ready. Welcome to the team.
      </p>

      <UButton to="/content" label="Open content" class="mt-6" />
    </template>

    <template v-else>
      <AdminFeedback
        :error="invitation.error.value"
        :busy="invitation.busy.value"
        @retry="invitation.reload"
      />

      <template v-if="invitation.data.value">
        <p class="text-sm text-muted mt-3 break-words">
          You’re invited as {{ invitation.data.value.role }} with
          {{ invitation.data.value.email }}.
        </p>

        <form class="mt-8 space-y-5" @submit.prevent="accept">
          <UFormField label="Your name" required>
            <UInput
              v-model="name"
              name="name"
              autocomplete="name"
              maxlength="120"
              required
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Choose a password"
            help="At least 10 characters."
            required
          >
            <UInput
              v-model="password"
              name="password"
              type="password"
              autocomplete="new-password"
              minlength="10"
              maxlength="200"
              required
              class="w-full"
            />
          </UFormField>

          <p v-if="error" role="alert" class="text-sm text-error">
            {{ error }}
          </p>

          <UButton type="submit" label="Join the team" :loading="busy" block />
        </form>
      </template>
    </template>
  </div>
</template>
