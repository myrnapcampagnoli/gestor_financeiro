CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`bank` varchar(100),
	`type` enum('PJ','PF') NOT NULL,
	`accountType` enum('checking','savings','credit','other') DEFAULT 'checking',
	`balance` decimal(15,2) DEFAULT '0.00',
	`color` varchar(7) DEFAULT '#1F4E79',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(7) DEFAULT '#6B7280',
	`icon` varchar(50) DEFAULT 'tag',
	`type` enum('PJ','PF','both') NOT NULL DEFAULT 'both',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gmailImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gmailMessageId` varchar(255) NOT NULL,
	`subject` varchar(500),
	`sender` varchar(255),
	`documentType` enum('extrato','fatura_cartao','conta_servico','boleto','other') DEFAULT 'other',
	`status` enum('pending','imported','skipped','error') DEFAULT 'pending',
	`transactionsImported` int DEFAULT 0,
	`rawData` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gmailImports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installmentGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`installmentCount` int NOT NULL,
	`installmentAmount` decimal(15,2) NOT NULL,
	`entityType` enum('PJ','PF') NOT NULL,
	`paymentMethod` enum('credit','debit','pix','cash','boleto','other') DEFAULT 'credit',
	`categoryId` int,
	`startDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `installmentGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`transactionId` int,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('due_soon','overdue','imported','info') NOT NULL DEFAULT 'info',
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`categoryId` int,
	`installmentGroupId` int,
	`description` varchar(255) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`type` enum('income','expense','transfer') NOT NULL,
	`entityType` enum('PJ','PF') NOT NULL,
	`paymentMethod` enum('credit','debit','pix','cash','boleto','other') DEFAULT 'pix',
	`status` enum('paid','pending','overdue','legal','scheduled') NOT NULL DEFAULT 'pending',
	`dueDate` timestamp,
	`paidAt` timestamp,
	`notes` text,
	`cnpjCpf` varchar(20),
	`source` enum('manual','import_pdf','import_csv','import_excel','gmail') DEFAULT 'manual',
	`importedFrom` varchar(255),
	`isRecurring` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `gmailAccessToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `gmailRefreshToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `gmailTokenExpiry` timestamp;