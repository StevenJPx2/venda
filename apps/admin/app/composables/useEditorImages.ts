import type { EditorCustomHandlers } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';

/** Editor handler that picks an image, uploads it to R2 and inserts it at the cursor. */
export function useEditorImages() {
  const toast = useToast();
  const { upload, pick } = useMediaUpload();

  async function insertImage(editor: Editor): Promise<void> {
    const file = await pick('image/*');
    if (!file) return;

    try {
      const src = await upload(file);
      editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') }).run();
    } catch (error) {
      toast.add({ title: 'Image upload failed', description: error instanceof Error ? error.message : 'Please try again.', color: 'error', icon: 'i-lucide-circle-alert' });
    }
  }

  const handlers = {
    imageUpload: {
      canExecute: () => true,
      execute: (editor: Editor) => {
        void insertImage(editor);
        return editor.chain();
      },
      isActive: () => false
    }
  } satisfies EditorCustomHandlers;

  return { handlers };
}
