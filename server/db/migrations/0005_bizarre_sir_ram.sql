CREATE TABLE `email_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `email_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_chat_messages_project_idx` ON `email_chat_messages` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`document` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_projects_updated_idx` ON `email_projects` (`updated_at`);