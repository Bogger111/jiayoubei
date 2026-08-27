CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`risk_level` text DEFAULT 'normal' NOT NULL,
	`result` text DEFAULT 'success' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_family_idx` ON `audit_logs` (`family_id`);--> statement-breakpoint
CREATE INDEX `audit_time_idx` ON `audit_logs` (`family_id`,`time`);--> statement-breakpoint
CREATE TABLE `authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`risk_level` text DEFAULT 'normal' NOT NULL,
	`policy` text DEFAULT 'ask_every_time' NOT NULL,
	`requester` text DEFAULT 'AI Agent' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`event_id` text,
	`consequence` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `authz_family_idx` ON `authorizations` (`family_id`);--> statement-breakpoint
CREATE INDEX `authz_status_idx` ON `authorizations` (`family_id`,`status`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`reading` text DEFAULT '' NOT NULL,
	`unit` text,
	`online` integer DEFAULT true NOT NULL,
	`risk_level` text DEFAULT 'normal' NOT NULL,
	`last_sync` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'simulator' NOT NULL,
	`permission` text DEFAULT 'read' NOT NULL,
	`related_event_ids` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devices_family_idx` ON `devices` (`family_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`risk_level` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'monitoring' NOT NULL,
	`source` text DEFAULT 'family' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`related_members` text DEFAULT '[]' NOT NULL,
	`related_devices` text DEFAULT '[]' NOT NULL,
	`related_tasks` text DEFAULT '[]' NOT NULL,
	`related_authorization_id` text,
	`ai_assessment` text DEFAULT '' NOT NULL,
	`timeline` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_family_idx` ON `events` (`family_id`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`family_id`,`status`);--> statement-breakpoint
CREATE INDEX `events_risk_idx` ON `events` (`family_id`,`risk_level`);--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`mode` text DEFAULT 'real' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`relation` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '成员' NOT NULL,
	`avatar` text DEFAULT '家' NOT NULL,
	`online` integer DEFAULT false NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`emergency_contact` integer DEFAULT false NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`current_task_id` text
);
--> statement-breakpoint
CREATE INDEX `members_family_idx` ON `family_members` (`family_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`category` text DEFAULT 'family' NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`event_id` text
);
--> statement-breakpoint
CREATE INDEX `notifications_family_idx` ON `notifications` (`family_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`family_id`,`read`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_family_idx` ON `push_subscriptions` (`family_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `service_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`coverage` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`last_used` text DEFAULT '' NOT NULL,
	`trust_level` text DEFAULT 'unverified' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `services_family_idx` ON `service_providers` (`family_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`creator` text DEFAULT '' NOT NULL,
	`source_event_id` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'to_receive' NOT NULL,
	`due_at` text,
	`evidence` text,
	`evidence_uploaded_at` text,
	`family_confirmed_at` text,
	`help_requested` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_family_idx` ON `tasks` (`family_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`family_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`avatar` text DEFAULT '家' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);