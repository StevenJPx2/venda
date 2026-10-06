CREATE TABLE `content_collections` (
	`slug` text PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`model_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_entries` (
	`collection` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL UNIQUE,
	`draft` integer NOT NULL,
	`published_at` text,
	`data_json` text NOT NULL,
	`sha` text NOT NULL,
	CONSTRAINT `content_entries_pk` PRIMARY KEY(`collection`, `slug`)
);
--> statement-breakpoint
CREATE TABLE `content_files` (
	`path` text PRIMARY KEY,
	`sha` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_problems` (
	`path` text PRIMARY KEY,
	`message` text NOT NULL,
	`line` integer
);
--> statement-breakpoint
CREATE INDEX `content_entries_published` ON `content_entries` (`collection`,`draft`,`published_at`);