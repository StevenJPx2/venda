// The table a records collection is browsed in. The first column names the
// entry (its title field, or its slug when the model has none); the next are
// the following fields in config.ts order, leaving out the rich-text body.
import type { CollectionField, CollectionSummary } from '@venda/contract';

// Enough to tell rows apart at a glance; the entry screen shows the rest.
const MORE_COLUMNS = 3;

interface Column {
  readonly key: string;
  readonly label: string;
}

/** A field's label as config.ts gives it, or its key with a capital. */
export const fieldLabel = (field: CollectionField) =>
  field.label ?? field.key.charAt(0).toUpperCase() + field.key.slice(1);

export function tableColumns(collection: CollectionSummary) {
  const title = collection.fields.find(
    field => field.key === collection.titleField
  );

  return {
    entry: title ? fieldLabel(title) : 'Entry',
    columns: collection.fields
      .filter(field => field.type !== 'richtext' && field !== title)
      .slice(0, MORE_COLUMNS)
      .map((field): Column => ({ key: field.key, label: fieldLabel(field) }))
  };
}
