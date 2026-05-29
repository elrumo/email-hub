DROP TABLE `machines`;--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`name` text NOT NULL,
	`target_config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `monitors_connection_idx` ON `monitors` (`connection_id`);
