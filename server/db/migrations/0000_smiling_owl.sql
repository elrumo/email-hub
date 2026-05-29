CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connections_integration_idx` ON `connections` (`integration_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_integration_name_uq` ON `connections` (`integration_id`,`name`);--> statement-breakpoint
CREATE TABLE `flow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`steps` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flow_runs_flow_idx` ON `flow_runs` (`flow_id`);--> statement-breakpoint
CREATE INDEX `flow_runs_started_idx` ON `flow_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `flow_state` (
	`flow_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flow_state_pk` ON `flow_state` (`flow_id`,`key`);--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`definition` text NOT NULL,
	`cron` text,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `flows_enabled_idx` ON `flows` (`enabled`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`name` text NOT NULL,
	`server_id` text,
	`metrics_url` text,
	`metrics_token` text,
	`data_points` text DEFAULT '50' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machines_connection_idx` ON `machines` (`connection_id`);