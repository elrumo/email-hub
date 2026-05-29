CREATE TABLE `shortcuts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`icon` text,
	`ping_enabled` integer DEFAULT false NOT NULL,
	`ping_url` text,
	`ping_interval` integer DEFAULT 30 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shortcuts_sort_idx` ON `shortcuts` (`sort_order`);--> statement-breakpoint
CREATE TABLE `widgets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`content` text,
	`w` integer DEFAULT 1 NOT NULL,
	`h` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `widgets_sort_idx` ON `widgets` (`sort_order`);