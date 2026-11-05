<?php
declare(strict_types=1);

$expected = '__MIGRATION_TOKEN__';
$received = is_string($_GET['token'] ?? null) ? (string)$_GET['token'] : '';
header('Content-Type: text/plain; charset=utf-8');
if ($received === '' || !hash_equals($expected, $received)) {
    http_response_code(404);
    exit("not found\n");
}

try {
    $config = require __DIR__ . '/config.php';
    $db = $config['database'] ?? [];
    $prefix = (string)($db['table_prefix'] ?? 'bs_');
    if (preg_match('/^[A-Za-z0-9_]+$/', $prefix) !== 1) {
        throw new RuntimeException('invalid table prefix');
    }
    $pdo = new PDO(
        'mysql:host=' . $db['host'] . ';port=' . (int)$db['port'] . ';dbname=' . $db['name'] . ';charset=' . ($db['charset'] ?? 'utf8mb4'),
        (string)$db['user'],
        (string)$db['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $pdo->exec('SET NAMES utf8mb4');
    $plans = $prefix . 'plans';
    $subscriptions = $prefix . 'subscriptions';
    $events = $prefix . 'billing_events';
    $users = $prefix . 'users';
    $shops = $prefix . 'barbershops';

    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$plans}` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `code` VARCHAR(64) NOT NULL, `name` VARCHAR(120) NOT NULL,
      `description` VARCHAR(500) DEFAULT NULL, `price_cents` INT UNSIGNED DEFAULT NULL,
      `billing_interval` ENUM('month','year') NOT NULL DEFAULT 'month', `trial_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      `active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`), UNIQUE KEY `uq_{$prefix}plans_code` (`code`), KEY `idx_{$prefix}plans_active` (`active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$subscriptions}` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `barbershop_id` BIGINT UNSIGNED NOT NULL, `plan_id` BIGINT UNSIGNED DEFAULT NULL,
      `status` ENUM('trialing','active','past_due','paused','canceled','expired') NOT NULL DEFAULT 'trialing',
      `trial_started_at` DATETIME DEFAULT NULL, `trial_ends_at` DATETIME DEFAULT NULL, `current_period_start` DATETIME DEFAULT NULL,
      `current_period_end` DATETIME DEFAULT NULL, `grace_period_ends_at` DATETIME DEFAULT NULL, `provider` VARCHAR(40) DEFAULT NULL,
      `provider_customer_id` VARCHAR(190) DEFAULT NULL, `provider_subscription_id` VARCHAR(190) DEFAULT NULL,
      `cancel_at_period_end` TINYINT(1) NOT NULL DEFAULT 0, `canceled_at` DATETIME DEFAULT NULL,
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`), KEY `idx_{$prefix}subscriptions_barbershop` (`barbershop_id`), KEY `idx_{$prefix}subscriptions_status` (`status`), KEY `idx_{$prefix}subscriptions_trial_end` (`trial_ends_at`),
      UNIQUE KEY `uq_{$prefix}subscriptions_provider` (`provider`,`provider_subscription_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$events}` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `provider` VARCHAR(40) NOT NULL, `provider_event_id` VARCHAR(190) NOT NULL,
      `event_type` VARCHAR(120) NOT NULL, `barbershop_id` BIGINT UNSIGNED DEFAULT NULL, `payload_json` JSON NOT NULL,
      `processed_at` DATETIME DEFAULT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`), UNIQUE KEY `uq_{$prefix}billing_events_provider_event` (`provider`,`provider_event_id`), KEY `idx_{$prefix}billing_events_barbershop` (`barbershop_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $columnExists = static function (PDO $pdo, string $table, string $column): bool {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $stmt->execute([$table, $column]);
        return (int)$stmt->fetchColumn() > 0;
    };
    if (!$columnExists($pdo, $subscriptions, 'provider_checkout_id')) {
        $pdo->exec("ALTER TABLE `{$subscriptions}` ADD COLUMN `provider_checkout_id` VARCHAR(190) DEFAULT NULL AFTER `provider_subscription_id`");
    }
    if (!$columnExists($pdo, $subscriptions, 'provider_checkout_url')) {
        $pdo->exec("ALTER TABLE `{$subscriptions}` ADD COLUMN `provider_checkout_url` VARCHAR(500) DEFAULT NULL AFTER `provider_checkout_id`");
    }
    if (!$columnExists($pdo, $users, 'platform_admin')) {
        $pdo->exec("ALTER TABLE `{$users}` ADD COLUMN `platform_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`");
    }
    $pdo->exec("INSERT IGNORE INTO `{$plans}` (`code`,`name`,`description`,`price_cents`,`billing_interval`,`trial_days`,`active`) VALUES ('um_real_por_dia','Plano 1 Real por Dia','Seu sistema completo por apenas R$ 1 por dia.',3000,'month',30,1)");
    $pdo->exec("INSERT INTO `{$subscriptions}` (`barbershop_id`,`status`,`trial_started_at`,`trial_ends_at`) SELECT b.id,'trialing',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY) FROM `{$shops}` b LEFT JOIN `{$subscriptions}` s ON s.barbershop_id=b.id WHERE s.id IS NULL");
    $pdo->exec("UPDATE `{$users}` SET platform_admin=1 WHERE id=(SELECT id FROM (SELECT id FROM `{$users}` WHERE role='admin' AND status='active' ORDER BY id LIMIT 1) selected_admin)");
    @unlink(__FILE__);
    echo "migration_ok\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "migration_failed\n";
    error_log('temporary SaaS migration failed: ' . $e->getMessage());
    @unlink(__FILE__);
}
