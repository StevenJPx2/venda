CREATE TABLE `content_work` (
	`collection` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL UNIQUE,
	`base_sha` text NOT NULL,
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
	CONSTRAINT `content_work_pk` PRIMARY KEY(`collection`, `slug`)
);
