ALTER TABLE `devices` ADD `ha_entity` text;--> statement-breakpoint
ALTER TABLE `family_memories` ADD `family_id` text DEFAULT 'F001' NOT NULL;--> statement-breakpoint
ALTER TABLE `tool_runs` ADD `family_id` text DEFAULT 'F001' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `family_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;