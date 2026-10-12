import { VendaApi, type SiteSettings, type User } from '@venda/contract';
import { Effect, Predicate, Result } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { inject, ref, type InjectionKey, type Ref } from 'vue';
import type { AdminRegistry } from './plugin';

const MESSAGES = new Map([
  ['InvalidCredentials', 'The email or password is incorrect.'],
  ['Unauthenticated', 'Your session has ended. Please sign in again.'],
  ['Forbidden', 'You do not have permission to do this.'],
  ['LastAdministrator', 'Keep at least one active administrator.'],
  ['EmailTaken', 'This email already has an account.'],
  [
    'InvitationNotFound',
    'This invitation has expired, was revoked, or has already been used.'
  ],
  ['TokenNotFound', 'This token no longer exists.'],
  ['CollectionNotFound', 'This collection no longer exists.'],
  ['EntryNotFound', 'This entry is missing or is not visible to your role.'],
  ['UserNotFound', 'This person no longer has an account.'],
  ['TooManyAttempts', 'Too many attempts. Try again in fifteen minutes.']
]);

export class AdminRequestError extends Error {
  constructor(
    readonly tag: string,
    message: string
  ) {
    super(message);
  }
}

/** Run a contract client call; errors stay typed until this browser boundary. */
export async function request<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));

  if (Result.isSuccess(result)) return result.success;

  const error = result.failure;
  const tag =
    Predicate.isObject(error) && Predicate.isString(error._tag)
      ? error._tag
      : 'Unavailable';
  const reason =
    Predicate.isObject(error) && Predicate.isString(error.reason)
      ? error.reason
      : undefined;

  throw new AdminRequestError(
    tag,
    reason ??
      MESSAGES.get(tag) ??
      'The request could not be completed. Check your connection and try again.'
  );
}

export async function createAdminRuntime(origin: string) {
  const api = await Effect.runPromise(
    HttpApiClient.make(VendaApi, { baseUrl: origin }).pipe(
      Effect.provide(FetchHttpClient.layer)
    )
  );
  const user = ref<User | null>(null);
  const site = ref<SiteSettings | null>(null);

  const invoke = async <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    try {
      return await request(effect);
    } catch (error) {
      if (error instanceof AdminRequestError && error.tag === 'Unauthenticated')
        user.value = null;

      throw error;
    }
  };

  const refreshIdentity = async () => {
    try {
      user.value = await request(api.auth.me());
    } catch (error) {
      if (
        !(error instanceof AdminRequestError) ||
        error.tag !== 'Unauthenticated'
      )
        throw error;

      user.value = null;
    }
  };

  // The site's settings change with its files; a failed read keeps the last.
  const refreshSite = async () => {
    site.value = await request(api.content.site()).catch(() => site.value);
  };

  return { api, user, site, refreshIdentity, refreshSite, request: invoke };
}

export type AdminRuntime = Awaited<ReturnType<typeof createAdminRuntime>>;

export const AdminRuntimeKey: InjectionKey<AdminRuntime> = Symbol(
  'venda/admin/runtime'
);

export function useAdmin(): AdminRuntime {
  const runtime = inject(AdminRuntimeKey);

  if (!runtime)
    throw new Error('An admin plugin must run inside the Venda shell');

  return runtime;
}

export const AdminRegistryKey: InjectionKey<AdminRegistry> = Symbol(
  'venda/admin/registry'
);

/** The installed plugins' pages, views and editors, as the shell registered them. */
export function useAdminRegistry(): AdminRegistry {
  const registry = inject(AdminRegistryKey);

  if (!registry)
    throw new Error('An admin plugin must run inside the Venda shell');

  return registry;
}

const failure = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'The request failed. Please try again.';

/** A user-triggered mutation: one at a time, a visible error, always settled. */
export function useAdminAction() {
  const busy = ref(false);
  const error = ref('');

  async function perform(work: () => Promise<void>) {
    if (busy.value) return;

    busy.value = true;
    error.value = '';

    try {
      await work();
    } catch (cause) {
      error.value = failure(cause);
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, perform };
}

/**
 * An async screen read, owned by its component. The component triggers reload after mutations.
 * The latest reload wins: a new query starts at once, and an older answer arriving late is dropped.
 */
export function useAdminResource<A>(read: () => Promise<A>) {
  const data: Ref<A | undefined> = ref();
  const busy = ref(false);
  const error = ref('');
  let latest = 0;

  async function reload() {
    const request = ++latest;

    busy.value = true;
    error.value = '';

    try {
      const value = await read();

      if (request === latest) data.value = value;
    } catch (cause) {
      if (request === latest) error.value = failure(cause);
    } finally {
      if (request === latest) busy.value = false;
    }
  }

  return { data, busy, error, reload };
}
