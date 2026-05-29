CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_idx` ON `activity_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
DROP INDEX `connections_integration_name_uq`;--> statement-breakpoint
ALTER TABLE `connections` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `connections_owner_idx` ON `connections` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_owner_integration_name_uq` ON `connections` (`owner_id`,`integration_id`,`name`);--> statement-breakpoint
ALTER TABLE `flows` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `flows_owner_idx` ON `flows` (`owner_id`);--> statement-breakpoint
ALTER TABLE `monitors` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `monitors_owner_idx` ON `monitors` (`owner_id`);--> statement-breakpoint
ALTER TABLE `shortcuts` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `shortcuts_owner_idx` ON `shortcuts` (`owner_id`);--> statement-breakpoint
ALTER TABLE `widgets` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `widgets_owner_idx` ON `widgets` (`owner_id`);