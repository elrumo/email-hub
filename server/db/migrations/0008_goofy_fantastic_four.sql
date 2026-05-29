CREATE TABLE `ping_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`ts` integer NOT NULL,
	`ok` integer NOT NULL,
	`status` integer NOT NULL,
	`latency_ms` integer,
	`error` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ping_samples_monitor_ts_idx` ON `ping_samples` (`monitor_id`,`ts`);