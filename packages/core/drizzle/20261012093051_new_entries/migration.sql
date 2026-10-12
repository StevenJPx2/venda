PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_work` (
	`collection` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL UNIQUE,
	`base_sha` text,
	`data_json` text NOT NULL,
	`extra_json` text NOT NULL,
	`published_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT false NOT NULL,
	`owner_id` text,
	`updated_by` text,
	`updated_at` text,
	`publish_text` text,
	`publish_sha` text,
	`publish_model_json` text,
	CONSTRAINT `content_work_pk` PRIMARY KEY(`collection`, `slug`)
);
--> statement-breakpoint
INSERT INTO `__new_content_work`(`collection`, `slug`, `path`, `base_sha`, `data_json`, `extra_json`, `published_at`, `revision`, `dirty`, `owner_id`, `updated_by`, `updated_at`, `publish_text`, `publish_sha`, `publish_model_json`) SELECT `collection`, `slug`, `path`, `base_sha`, `data_json`, `extra_json`, `published_at`, `revision`, `dirty`, `owner_id`, `updated_by`, `updated_at`, `publish_text`, `publish_sha`, `publish_model_json` FROM `content_work`;--> statement-breakpoint
DROP TABLE `content_work`;--> statement-breakpoint
ALTER TABLE `__new_content_work` RENAME TO `content_work`;--> statement-breakpoint
PRAGMA foreign_keys=ON;