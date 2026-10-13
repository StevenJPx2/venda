CREATE TABLE `content_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`path` text NOT NULL,
	`sha` text,
	`text` text,
	`parent_sha` text,
	`message` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_revisions_path` ON `content_revisions` (`path`,`id`);--> statement-breakpoint
-- The old rows only marked what a sync had read; the files now live here, and
-- the index is rebuilt from them by an import.
DROP TABLE `content_files`;--> statement-breakpoint
CREATE TABLE `content_files` (
	`path` text PRIMARY KEY,
	`text` text NOT NULL,
	`sha` text NOT NULL,
	`size` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
DELETE FROM `content_entries`;--> statement-breakpoint
DELETE FROM `content_collections`;--> statement-breakpoint
DELETE FROM `content_site`;--> statement-breakpoint
DELETE FROM `content_problems`;--> statement-breakpoint
DROP TABLE `content_source`;--> statement-breakpoint
ALTER TABLE `content_work` DROP COLUMN `publish_text`;--> statement-breakpoint
ALTER TABLE `content_work` DROP COLUMN `publish_sha`;--> statement-breakpoint
ALTER TABLE `content_work` DROP COLUMN `publish_model_json`;--> statement-breakpoint
ALTER TABLE `content_work` DROP COLUMN `publish_author`;
