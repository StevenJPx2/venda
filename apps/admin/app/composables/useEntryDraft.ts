import { validateEntryData, type CollectionSchema, type FieldError } from '@venda/schema';
import type { Entry, EntryStatus } from '~/types';

export type SaveState = 'new' | 'unsaved' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 1200;
const MAX_SLUG_RETRIES = 5;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface ApiErrorBody { error?: string; fields?: FieldError[] }

function apiError(error: unknown): { status?: number; body?: ApiErrorBody } {
  if (typeof error !== 'object' || error === null) return {};
  const { statusCode, data } = error as { statusCode?: number; data?: ApiErrorBody };
  const result: { status?: number; body?: ApiErrorBody } = {};
  if (typeof statusCode === 'number') result.status = statusCode;
  if (data) result.body = data;
  return result;
}

/** Publication state reported by the API; the working copy itself lives in `data`. */
interface EntryState {
  status: EntryStatus;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  publishAt: string | null;
  unpublishAt: string | null;
  scheduleError: string | null;
}

const NEW_STATE: EntryState = { status: 'draft', hasUnpublishedChanges: false, publishedAt: null, publishAt: null, unpublishAt: null, scheduleError: null };

/**
 * Ghost-style editing session for one entry. Every edit autosaves to the
 * working copy after a pause; readers only see changes once they are
 * published. The slug follows the title until it is edited or first published.
 */
export function useEntryDraft(collectionId: string, schema: Ref<CollectionSchema>) {
  const { api } = useVendaApi();

  const id = shallowRef<string | null>(null);
  const state = shallowRef<EntryState>({ ...NEW_STATE });
  /** Who created the entry; null for a new entry (the current user will own it). */
  const createdBy = shallowRef<string | null>(null);
  /** False when the signed-in user may not change this entry; autosave is off. */
  const editable = shallowRef(true);
  const slug = shallowRef('');
  const slugTouched = shallowRef(false);
  const data = ref<Record<string, unknown>>({});
  const saveState = shallowRef<SaveState>('new');
  const errorMessage = shallowRef('');
  const fieldErrors = ref<FieldError[]>([]);
  const snapshot = shallowRef('');
  const fallbackSlug = `untitled-${Math.random().toString(36).slice(2, 6)}`;

  const status = computed(() => state.value.status);
  const title = computed(() => {
    const value = schema.value.titleField ? data.value[schema.value.titleField] : undefined;
    return typeof value === 'string' ? value : '';
  });
  const effectiveSlug = computed(() => slugify(slug.value) || slugify(title.value) || fallbackSlug);
  const payload = computed(() => ({ slug: effectiveSlug.value, data: cleanEntryData(schema.value, data.value) }));
  const dirty = computed(() => JSON.stringify(payload.value) !== snapshot.value);
  const isEmpty = computed(() => Object.keys(payload.value.data).length === 0);
  /** Unsaved edits on a published entry also count as unpublished changes. */
  const hasUnpublishedChanges = computed(() => state.value.status === 'published' && (state.value.hasUnpublishedChanges || dirty.value));

  function applyState(entry: Entry): void {
    id.value = entry.id;
    createdBy.value = entry.createdBy;
    state.value = { status: entry.status, hasUnpublishedChanges: entry.hasUnpublishedChanges, publishedAt: entry.publishedAt, publishAt: entry.publishAt, unpublishAt: entry.unpublishAt, scheduleError: entry.scheduleError };
  }

  function apply(entry: Entry): void {
    applyState(entry);
    data.value = { ...entry.data };
    slug.value = entry.slug;
    // Keep syncing only while the slug is still the one derived from the title and never went live.
    slugTouched.value = entry.publishedAt !== null || entry.slug !== slugify(title.value);
    snapshot.value = JSON.stringify(payload.value);
    saveState.value = 'saved';
  }

  async function load(entryId: string): Promise<void> {
    apply(await api<Entry>(`/entries/${entryId}`));
  }

  /** Marks a brand-new entry as pristine once its schema is known. */
  function begin(): void {
    snapshot.value = JSON.stringify(payload.value);
    saveState.value = 'new';
  }

  watch(title, (next) => {
    if (!slugTouched.value) slug.value = slugify(next);
  });

  function setSlug(value: string): void {
    slugTouched.value = true;
    slug.value = value;
  }

  function setField(key: string, value: unknown): void {
    data.value = { ...data.value, [key]: value };
    fieldErrors.value = fieldErrors.value.filter(error => error.field !== key);
  }

  type Payload = typeof payload.value;

  async function create(body: Payload): Promise<Entry> {
    let attempt = { ...body };

    for (let tries = 0; ; tries++) {
      try {
        return await api<Entry>(`/collections/${collectionId}/entries`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(attempt) });
      } catch (error) {
        // Only auto-generated slugs are renamed; a slug the author chose is reported instead.
        if (apiError(error).status !== 409 || slugTouched.value || tries >= MAX_SLUG_RETRIES) throw error;
        attempt = { ...attempt, slug: nextSlug(attempt.slug) };
      }
    }
  }

  async function persist(body: Payload): Promise<void> {
    const saved = id.value
      ? await api<Entry>(`/entries/${id.value}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) })
      : await create(body);
    // Keep the local data: the user may have typed more while the request was in flight.
    applyState(saved);
    if (saved.slug !== body.slug) slug.value = saved.slug;
    snapshot.value = JSON.stringify({ ...body, slug: saved.slug });
  }

  function reportFailure(error: unknown): void {
    const { status: code, body } = apiError(error);
    saveState.value = 'error';
    fieldErrors.value = body?.fields ?? [];
    if (code === 409) errorMessage.value = body?.error ?? 'That URL is already used by another entry.';
    else if (code === 422) errorMessage.value = body?.error ?? 'Some fields are invalid.';
    else if (code === 403) errorMessage.value = body?.error ?? 'You don’t have permission to do that.';
    else errorMessage.value = 'Couldn’t save. Check your connection and try again.';
  }

  let inFlight: Promise<void> | null = null;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function save(): Promise<void> {
    clearTimeout(timer);

    if (inFlight) {
      queued = true;
      return inFlight;
    }

    const body = payload.value;
    const problems = validateEntryData(schema.value, body.data, { published: false });

    if (problems.length) {
      fieldErrors.value = problems;
      saveState.value = 'error';
      errorMessage.value = problems[0]?.message ?? 'Some fields are invalid.';
      throw new Error(errorMessage.value);
    }

    saveState.value = 'saving';
    errorMessage.value = '';
    fieldErrors.value = [];
    inFlight = persist(body)
      .then(() => { saveState.value = dirty.value ? 'unsaved' : 'saved'; })
      .catch((error: unknown) => { reportFailure(error); throw error; })
      .finally(() => {
        inFlight = null;
        if (queued) { queued = false; void save().catch(() => {}); } else if (dirty.value) scheduleAutosave();
      });
    return inFlight;
  }

  function scheduleAutosave(): void {
    if (!editable.value || isEmpty.value || saveState.value === 'error') return;
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => {}), AUTOSAVE_DELAY_MS);
  }

  watch(payload, () => {
    if (!dirty.value || saveState.value === 'saving') return;
    // Editing after a failed save retries automatically.
    saveState.value = 'unsaved';
    scheduleAutosave();
  }, { deep: true });

  /** Saves pending edits so a lifecycle action applies to what the editor shows. */
  async function flush(): Promise<string> {
    if (dirty.value || !id.value || inFlight) await save();
    if (inFlight) await inFlight;
    if (!id.value) throw new Error('The entry could not be saved.');
    return id.value;
  }

  async function action(path: string, init: { method: 'POST' | 'PUT'; body?: unknown }): Promise<void> {
    const entryId = await flush();

    try {
      const updated = await api<Entry>(`/entries/${entryId}/${path}`, { method: init.method, ...(init.body ? { headers: JSON_HEADERS, body: JSON.stringify(init.body) } : {}) });
      applyState(updated);
      errorMessage.value = '';
    } catch (error) {
      reportFailure(error);
      throw error;
    }
  }

  const publish = () => action('publish', { method: 'POST' });
  const unpublish = () => action('unpublish', { method: 'POST' });
  const schedule = (times: { publishAt?: string | null; unpublishAt?: string | null }) => action('schedule', { method: 'PUT', body: times });

  async function createPreview(): Promise<string> {
    const entryId = await flush();
    return (await api<{ token: string }>(`/entries/${entryId}/preview`, { method: 'POST' })).token;
  }

  /** Moves the entry to the trash. */
  async function remove(): Promise<void> {
    clearTimeout(timer);
    if (id.value) await api(`/entries/${id.value}`, { method: 'DELETE' });
    snapshot.value = JSON.stringify(payload.value);
  }

  onScopeDispose(() => clearTimeout(timer));

  return {
    id, status, state, createdBy, editable, slug: effectiveSlug, rawSlug: slug, slugTouched, data, title, saveState, errorMessage, fieldErrors,
    dirty, isEmpty, hasUnpublishedChanges, begin, load, apply, save, setField, setSlug, publish, unpublish, schedule, createPreview, remove
  };
}
