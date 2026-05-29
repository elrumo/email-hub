CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`public_trigger` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boards_owner_idx` ON `boards` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boards_slug_uq` ON `boards` (`slug`);--> statement-breakpoint
ALTER TABLE `flows` ADD `public_trigger` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `widgets` ADD `board_id` text REFERENCES boards(id);--> statement-breakpoint
CREATE INDEX `widgets_board_idx` ON `widgets` (`board_id`);--> statement-breakpoint
-- Backfill: give every existing user a default "Home" board and adopt their
-- current widgets into it. The board id/slug are derived from the user id so
-- the slug is unique and the operation is deterministic/idempotent. A single
-- ownerless board ('home-legacy') adopts any pre-existing ownerless widgets.
INSERT INTO `boards` (`id`, `owner_id`, `name`, `slug`, `is_default`, `is_public`, `public_trigger`, `sort_order`, `created_at`, `updated_at`)
SELECT 'board-' || `id`, `id`, 'Home', 'home-' || `id`, 1, 0, 0, 0, `created_at`, `created_at` FROM `users`;--> statement-breakpoint
INSERT INTO `boards` (`id`, `owner_id`, `name`, `slug`, `is_default`, `is_public`, `public_trigger`, `sort_order`, `created_at`, `updated_at`)
SELECT 'board-legacy', NULL, 'Home', 'home-legacy', 1, 0, 0, 0, 0, 0
WHERE EXISTS (SELECT 1 FROM `widgets` WHERE `owner_id` IS NULL);--> statement-breakpoint
UPDATE `widgets` SET `board_id` = 'board-' || `owner_id` WHERE `owner_id` IS NOT NULL;--> statement-breakpoint
UPDATE `widgets` SET `board_id` = 'board-legacy' WHERE `owner_id` IS NULL;