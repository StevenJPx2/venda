CREATE TABLE `content_guard` (
	`ok` integer NOT NULL,
	CONSTRAINT "content_guard_ok" CHECK("ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `content_source` (
	`id` integer PRIMARY KEY,
	`generation` integer DEFAULT 0 NOT NULL,
	`fence` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`requested` integer DEFAULT 1 NOT NULL,
	`handled` integer DEFAULT 0 NOT NULL,
	`indexed_version` text,
	`remaining` integer DEFAULT 0 NOT NULL,
	`synced_at` text,
	`last_error` text
);
--> statement-breakpoint
ALTER TABLE `content_files` ADD `generation` integer DEFAULT 0 NOT NULL;