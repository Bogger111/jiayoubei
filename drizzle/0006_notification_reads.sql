CREATE TABLE `notification_reads` (
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`notification_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`family_id`, `user_id`, `notification_id`)
);
