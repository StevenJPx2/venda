// One collection's model for a content screen, read with the others.
import { useAdmin, useAdminResource } from '@venda/admin';
import { computed, onMounted } from 'vue';

export function useCollection(slug: string) {
  const admin = useAdmin();
  const collections = useAdminResource(() =>
    admin.request(admin.api.adminContent.collections())
  );
  const collection = computed(() =>
    collections.data.value?.find(item => item.slug === slug)
  );

  // The name is unknown until the models answer; screens hold its space blank until then.
  const pending = computed(
    () => !collections.data.value && !collections.error.value
  );
  const notFound = computed(
    () => Boolean(collections.data.value) && !collection.value
  );

  onMounted(collections.reload);

  return { collections, collection, pending, notFound };
}
