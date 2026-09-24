import { validateEntryData, type CollectionSchema, type FieldError } from '@venda/schema';
import type { Entry, EntryStatus } from '~/types';

export type SaveState = 'new' | 'unsaved' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 1200;
const MAX_SLUG_RETRIES = 5;

interface ApiErrorBody { error?: string; fields?: FieldError[] }

function apiError(error: unknown): { status?: number; body?: ApiErrorBody } {
  if (typeof error !== 'object' || error === null) return {};
  const { statusCode, data } = error as { statusCode?: number; data?: ApiErrorBody };
  const result: { status?: number; body?: ApiErrorBody } = {};
  if (typeof statusCode === 'number') result.status = statusCode;
  if (data) result.body = data;
  return result;
}

/**
 * Ghost-style editing session for one entry of a Directus-style collection:
 * drafts autosave after a pause, published entries wait for an explicit
 * update, and the slug follows the title field until the author edits it.
 */
export function useEntryDraft(collectionId: string, schema: Ref<CollectionSchema>) {
  const { api } = useVendaApi();

  const id = shallowRef<string | null>(null);
  const status = shallowRef<EntryStatus>('draft');
  const slug = shallowRef('');
  const slugTouched = shallowRef(false);
  const data = ref<Record<string, unknown>>({});
  const saveState = shallowRef<SaveState>('new');
  const errorMessage = shallowRef('');
  const fieldErrors = ref<FieldError[]>([]);
  const snapshot = shallowRef('');
  const fallbackSlug = `untitled-${Math.random().toString(36).slice(2, 6)}`;

  const title = computed(() => {
    const value = schema.value.titleField ? data.value[schema.value.titleField] : undefined;
    return typeof value === 'string' ? value : '';
  });
  const effectiveSlug = computed(() => slugify(slug.value) || slugify(title.value) || fallbackSlug);
  const payload = computed(() => ({ slug: effectiveSlug.value, status: status.value, data: cleanEntryData(schema.value, data.value) }));
  const dirty = computed(() => JSON.stringify(payload.value) !== snapshot.value);
  const isEmpty = computed(() => Object.keys(payload.value.data).length === 0);

  function apply(entry: Entry): void {
    data.value = { ...entry.data };
    id.value = entry.id;
    status.value = entry.status;
    slug.value = entry.slug;
    // Keep syncing only while the slug is still the one derived from the title.
    slugTouched.value = entry.status === 'published' || entry.slug !== slugify(title.value);
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
    if (!slugTouched.value && status.value === 'draft') slug.value = slugify(next);
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
        return await api<Entry>(`/collections/${collectionId}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
      } catch (error) {
        // Only auto-generated slugs are renamed; a slug the author chose is reported instead.
        if (apiError(error).status !== 409 || slugTouched.value || tries >= MAX_SLUG_RETRIES) throw error;
        attempt = { ...attempt, slug: nextSlug(attempt.slug) };
      }
    }
  }

  async function persist(body: Payload): Promise<void> {
    const saved = id.value
      ? await api<Entry>(`/entries/${id.value}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await create(body);

    id.value = saved.id;
    if (saved.slug !== body.slug) slug.value = saved.slug;
    snapshot.value = JSON.stringify({ ...body, slug: saved.slug });
  }

  function reportFailure(error: unknown): void {
    const { status: code, body } = apiError(error);
    saveState.value = 'error';
    fieldErrors.value = body?.fields ?? [];
    if (code === 409) errorMessage.value = 'That URL is already used by another entry.';
    else if (code === 422) errorMessage.value = body?.error ?? 'Some fields are invalid.';
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
    const problems = validateEntryData(schema.value, body.data, { published: body.status === 'published' });
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
    if (status.value !== 'draft' || isEmpty.value || saveState.value === 'error') return;
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => {}), AUTOSAVE_DELAY_MS);
  }

  watch(payload, () => {
    if (!dirty.value || saveState.value === 'saving') return;
    // Editing after a failed save retries automatically for drafts.
    saveState.value = 'unsaved';
    scheduleAutosave();
  }, { deep: true });

  /** Publishing validates required fields first; on failure the status is restored. */
  async function setStatus(next: EntryStatus): Promise<void> {
    const previous = status.value;
    status.value = next;
    try {
      await save();
    } catch (error) {
      status.value = previous;
      throw error;
    }
  }

  async function remove(): Promise<void> {
    clearTimeout(timer);
    if (id.value) await api(`/entries/${id.value}`, { method: 'DELETE' });
    snapshot.value = JSON.stringify(payload.value);
  }

  onScopeDispose(() => clearTimeout(timer));

  return { id, status, slug: effectiveSlug, rawSlug: slug, slugTouched, data, title, saveState, errorMessage, fieldErrors, dirty, isEmpty, begin, load, save, setField, setSlug, setStatus, remove };
}
