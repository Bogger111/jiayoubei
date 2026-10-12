CREATE TABLE `family_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`member_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`joined_user_id` text
);
--> statement-breakpoint
CREATE INDEX `invitations_family_idx` ON `family_invitations` (`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `family_invitations` (`token_hash`);--> statement-breakpoint
ALTER TABLE `family_members` ADD `user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_unique` ON `family_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_email_unique` ON `users` (lower("email")) WHERE "users"."email" IS NOT NULL AND "users"."password_hash" IS NOT NULL;