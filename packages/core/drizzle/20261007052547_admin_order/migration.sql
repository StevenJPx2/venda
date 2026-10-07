ALTER TABLE `content_entries` ADD `sort_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `content_entries_admin_order` ON `content_entries` (`collection`,`sort_key`,`slug`);--> statement-breakpoint
-- Hand-added: the index is derived from the files, so forgetting what was read makes the next sync re-read every entry and fill in its sort key.
DELETE FROM `content_files`;
