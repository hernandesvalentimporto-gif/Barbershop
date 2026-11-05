-- Barber Shop SaaS foundation.
-- Execute once against the existing database after taking a backup.
-- This migration does not create or change production credentials.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bs_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) DEFAULT NULL,
  `price_cents` INT UNSIGNED DEFAULT NULL,
  `billing_interval` ENUM('month','year') NOT NULL DEFAULT 'month',
  `trial_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bs_plans_code` (`code`),
  KEY `idx_bs_plans_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bs_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `barbershop_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('trialing','active','past_due','paused','canceled','expired') NOT NULL DEFAULT 'trialing',
  `trial_started_at` DATETIME DEFAULT NULL,
  `trial_ends_at` DATETIME DEFAULT NULL,
  `current_period_start` DATETIME DEFAULT NULL,
  `current_period_end` DATETIME DEFAULT NULL,
  `grace_period_ends_at` DATETIME DEFAULT NULL,
  `provider` VARCHAR(40) DEFAULT NULL,
  `provider_customer_id` VARCHAR(190) DEFAULT NULL,
  `provider_subscription_id` VARCHAR(190) DEFAULT NULL,
  `cancel_at_period_end` TINYINT(1) NOT NULL DEFAULT 0,
  `canceled_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bs_subscriptions_barbershop` (`barbershop_id`),
  KEY `idx_bs_subscriptions_status` (`status`),
  KEY `idx_bs_subscriptions_trial_end` (`trial_ends_at`),
  UNIQUE KEY `uq_bs_subscriptions_provider` (`provider`,`provider_subscription_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bs_billing_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(40) NOT NULL,
  `provider_event_id` VARCHAR(190) NOT NULL,
  `event_type` VARCHAR(120) NOT NULL,
  `barbershop_id` BIGINT UNSIGNED DEFAULT NULL,
  `payload_json` JSON NOT NULL,
  `processed_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bs_billing_events_provider_event` (`provider`,`provider_event_id`),
  KEY `idx_bs_billing_events_barbershop` (`barbershop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Plano comercial inicial: cobrança mensal de R$ 30, comunicada como R$ 1 por dia.
-- INSERT IGNORE preserva qualquer alteração de preço feita pelo administrador.
INSERT IGNORE INTO `bs_plans`
  (`code`, `name`, `description`, `price_cents`, `billing_interval`, `trial_days`, `active`)
VALUES
  ('um_real_por_dia', 'Plano 1 Real por Dia', 'Seu sistema completo por apenas R$ 1 por dia.', 3000, 'month', 30, 1);

SET @has_checkout_id = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_subscriptions' AND COLUMN_NAME = 'provider_checkout_id'
);
SET @sql = IF(@has_checkout_id = 0,
  'ALTER TABLE `bs_subscriptions` ADD COLUMN `provider_checkout_id` VARCHAR(190) DEFAULT NULL AFTER `provider_subscription_id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_checkout_url = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_subscriptions' AND COLUMN_NAME = 'provider_checkout_url'
);
SET @sql = IF(@has_checkout_url = 0,
  'ALTER TABLE `bs_subscriptions` ADD COLUMN `provider_checkout_url` VARCHAR(500) DEFAULT NULL AFTER `provider_checkout_id`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_platform_admin = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_users' AND COLUMN_NAME = 'platform_admin'
);
SET @sql = IF(@has_platform_admin = 0,
  'ALTER TABLE `bs_users` ADD COLUMN `platform_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_platform_admin_index = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_users' AND INDEX_NAME = 'idx_bs_users_platform_admin'
);
SET @sql = IF(@has_platform_admin_index = 0,
  'ALTER TABLE `bs_users` ADD KEY `idx_bs_users_platform_admin` (`platform_admin`,`status`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Existing establishments receive one server-side trial only when they do not
-- already have a subscription. The end date is never reset by re-running this.
INSERT INTO `bs_subscriptions` (`barbershop_id`,`status`,`trial_started_at`,`trial_ends_at`)
SELECT b.`id`, 'trialing', UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)
FROM `bs_barbershops` b
LEFT JOIN `bs_subscriptions` s ON s.`barbershop_id` = b.`id`
WHERE s.`id` IS NULL;
