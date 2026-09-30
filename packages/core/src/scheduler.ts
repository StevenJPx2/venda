import { backfillSearchIndex } from './entries/search';
import { invalidateCollection, publishEntry, unpublishEntry } from './entries/store';
import { HttpError } from './http';
import type { Row, VendaConfig } from './runtime';

// Per run; anything beyond is picked up by the next run a minute later.
const BATCH = 100;
export const TRASH_RETENTION_DAYS = 30;

export interface ScheduledRunResult {
  published: number;
  unpublished: number;
  failed: number;
  purged: number;
  indexed: number;
}

async function runPublishes(config: VendaConfig, now: string): Promise<{ published: number; failed: number }> {
  const due = await config.db.all<Row>('SELECT * FROM entries WHERE publish_at IS NOT NULL AND publish_at <= ? AND deleted_at IS NULL ORDER BY publish_at LIMIT ?', now, BATCH);
  let published = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await publishEntry(config.db, row, null);
      published++;
    } catch (error) {
      // Clear the schedule so a bad entry is reported once, not retried every minute.
      const reason = error instanceof HttpError ? error.message : 'Publishing failed';
      await config.db.run('UPDATE entries SET publish_at = NULL, schedule_error = ? WHERE id = ?', reason, String(row.id));
      failed++;
    }
    await invalidateCollection(config.kv, String(row.collection_id));
  }
  return { published, failed };
}

async function runUnpublishes(config: VendaConfig, now: string): Promise<number> {
  const due = await config.db.all<Row>('SELECT * FROM entries WHERE unpublish_at IS NOT NULL AND unpublish_at <= ? AND deleted_at IS NULL LIMIT ?', now, BATCH);
  for (const row of due) {
    await unpublishEntry(config.db, row, null);
    await invalidateCollection(config.kv, String(row.collection_id));
  }
  return due.length;
}

async function purgeTrash(config: VendaConfig, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = await config.db.all<{ id: string }>('SELECT id FROM entries WHERE deleted_at IS NOT NULL AND deleted_at <= ? LIMIT ?', cutoff, BATCH);
  for (const { id } of expired) await config.db.run('DELETE FROM entries WHERE id = ?', id);
  return expired.length;
}

/** Background work: scheduled publishing, trash purging and search backfill. Safe to run concurrently or late. */
export async function runScheduled(config: VendaConfig, now = new Date()): Promise<ScheduledRunResult> {
  const iso = now.toISOString();
  const { published, failed } = await runPublishes(config, iso);
  const unpublished = await runUnpublishes(config, iso);
  const purged = await purgeTrash(config, now);
  const indexed = await backfillSearchIndex(config.db);
  return { published, unpublished, failed, purged, indexed };
}
