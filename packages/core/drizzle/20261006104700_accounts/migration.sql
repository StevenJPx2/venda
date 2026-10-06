CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL UNIQUE,
	`created_at` text NOT NULL,
	`last_used_at` text,
	CONSTRAINT `fk_api_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`invited_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	CONSTRAINT `fk_invitations_invited_by_users_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`password_hash` text,
	`session_epoch` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_tokens_user` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitations_email` ON `invitations` (`email`);