CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`def` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connectors_connector_id_uq` ON `connectors` (`connector_id`);