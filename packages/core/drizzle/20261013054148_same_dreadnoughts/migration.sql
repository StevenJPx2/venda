ALTER TABLE `content_work` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_work` ADD `trash_sha` text;--> statement-breakpoint
ALTER TABLE `content_work` ADD `trashed_at` text;--> statement-breakpoint
ALTER TABLE `content_work` ADD `trashed_by` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_work` (
	`collection` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL UNIQUE,
	`status` text DEFAULT 'active' NOT NULL,
	`trash_sha` text,
	`trashed_at` text,
	`trashed_by` text,
	`base_sha` text,
	`data_json` text NOT NULL,
	`extra_json` text NOT NULL,
	`published_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT false NOT NULL,
	`owner_id` text,
	`updated_by` text,
	`updated_at` text,
	CONSTRAINT `content_work_pk` PRIMARY KEY(`collection`, `slug`),
	CONSTRAINT "content_work_trash_state" CHECK(
      ("status" = 'active' AND "trash_sha" IS NULL
        AND "trashed_at" IS NULL AND "trashed_by" IS NULL)
      OR ("status" = 'trashed' AND "trash_sha" IS NOT NULL
        AND "trashed_at" IS NOT NULL AND "trashed_by" IS NOT NULL)
    )
);
--> statement-breakpoint
INSERT INTO `__new_content_work`(`collection`, `slug`, `path`, `base_sha`, `data_json`, `extra_json`, `published_at`, `revision`, `dirty`, `owner_id`, `updated_by`, `updated_at`) SELECT `collection`, `slug`, `path`, `base_sha`, `data_json`, `extra_json`, `published_at`, `revision`, `dirty`, `owner_id`, `updated_by`, `updated_at` FROM `content_work`;--> statement-breakpoint
DROP TABLE `content_work`;--> statement-breakpoint
ALTER TABLE `__new_content_work` RENAME TO `content_work`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `content_work_trash` ON `content_work` (`status`,`trashed_at`,`collection`,`slug`);