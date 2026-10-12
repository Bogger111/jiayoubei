CREATE TABLE `family_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool` text NOT NULL,
	`status` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
