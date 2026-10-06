// Prototype only: a realistic post with simulated autosave and publishing, so
// every variant behaves like the real editor without an API.
import { wordCount, type RichTextDoc } from '@venda/richtext';

const text = (value: string, marks?: { type: string }[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

const SAMPLE_BODY = {
  type: 'doc',
  content: [
    paragraph(text('For three years every page on our site was rendered in a single region. Readers in Sydney waited 900ms before the first byte arrived. Moving the CMS to the edge cut that to under 120ms, and it changed how we think about publishing.')),
    { type: 'heading', attrs: { level: 2 }, content: [text('What actually got slower')] },
    paragraph(text('Latency was never the whole story. Every preview link, every scheduled post and every image resize went through the same origin, so a busy editor in London made the site slower for everyone. '), text('The bottleneck was the database, not the network.', [{ type: 'bold' }])),
    { type: 'blockquote', content: [paragraph(text('If the content is the same everywhere, there is no reason for it to live in one place.'))] },
    paragraph(text('We moved reads to a replicated store and kept writes in one place. Editors noticed nothing; readers noticed everything.'))
  ]
} as RichTextDoc;

export type ProtoStatus = 'draft' | 'scheduled' | 'published';
export type SaveState = 'saved' | 'saving';

const SAVE_DELAY_MS = 900;
const PUBLISH_DELAY_MS = 650;

export function useProtoPost() {
  const toast = useToast();

  const title = ref('Why we moved our CMS to the edge');
  const body = ref<RichTextDoc>(structuredClone(SAMPLE_BODY));
  const slug = ref('why-we-moved-our-cms-to-the-edge');
  const excerpt = ref('Median time to first byte fell from 900ms to 120ms. Here is what moved, what broke, and what we would do again.');
  const tags = ref(['Engineering', 'Infrastructure']);
  const featured = ref(false);
  const author = 'Aleksandra Wiśniewska';
  const featureImage = shallowRef<string | null>(null);
  const publishAt = ref('');

  const status = shallowRef<ProtoStatus>('draft');
  const hasUnpublishedChanges = shallowRef(false);
  const saveState = shallowRef<SaveState>('saved');
  const publishing = shallowRef(false);
  const savedAt = shallowRef(Date.now());

  const words = computed(() => wordCount(body.value));
  const readingMinutes = computed(() => Math.max(1, Math.round(words.value / 230)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  watch([title, body, slug, excerpt, tags, featured, featureImage], () => {
    saveState.value = 'saving';

    if (status.value === 'published') hasUnpublishedChanges.value = true;

    clearTimeout(timer);
    timer = setTimeout(() => {
      saveState.value = 'saved';
      savedAt.value = Date.now();
    }, SAVE_DELAY_MS);
  }, { deep: true });
  onScopeDispose(() => clearTimeout(timer));

  async function publish(at?: string): Promise<void> {
    publishing.value = true;
    await new Promise(resolve => setTimeout(resolve, PUBLISH_DELAY_MS));
    publishing.value = false;
    hasUnpublishedChanges.value = false;

    if (at && Date.parse(at) > Date.now()) {
      status.value = 'scheduled';
      publishAt.value = at;
      toast.add({ title: 'Scheduled', description: new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), icon: 'i-lucide-calendar-check' });
      return;
    }

    const wasLive = status.value === 'published';
    status.value = 'published';
    toast.add({ title: wasLive ? 'Changes published' : 'Published', icon: 'i-lucide-check' });
  }

  function unpublish(): void {
    status.value = 'draft';
    hasUnpublishedChanges.value = false;
    publishAt.value = '';
    toast.add({ title: 'Reverted to draft', icon: 'i-lucide-undo-2' });
  }

  function pickFeatureImage(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = () => {
      const file = input.files?.[0];

      if (file) featureImage.value = URL.createObjectURL(file);
    };

    input.click();
  }

  return {
    title, body, slug, excerpt, tags, featured, author, featureImage, publishAt,
    status, hasUnpublishedChanges, saveState, publishing, savedAt, words, readingMinutes,
    publish, unpublish, pickFeatureImage
  };
}

export type ProtoPost = ReturnType<typeof useProtoPost>;

/** One status line for every variant: "Draft", "Published", "Published · Unpublished changes". */
export function statusLabel(post: ProtoPost): { label: string; tone: 'neutral' | 'success' | 'warning' | 'info' } {
  if (post.status.value === 'scheduled') return { label: `Scheduled for ${new Date(post.publishAt.value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`, tone: 'info' };
  if (post.status.value === 'published') return post.hasUnpublishedChanges.value ? { label: 'Unpublished changes', tone: 'warning' } : { label: 'Published', tone: 'success' };

  return { label: 'Draft', tone: 'neutral' };
}
