-- Isolamento multiempresa: cada registro operacional pertence a uma barbearia.
SET NAMES utf8mb4;

SET @has_user_shop = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_users' AND COLUMN_NAME = 'barbershop_id');
SET @sql = IF(@has_user_shop = 0, 'ALTER TABLE `bs_users` ADD COLUMN `barbershop_id` BIGINT UNSIGNED NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_service_shop = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_services' AND COLUMN_NAME = 'barbershop_id');
SET @sql = IF(@has_service_shop = 0, 'ALTER TABLE `bs_services` ADD COLUMN `barbershop_id` BIGINT UNSIGNED NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_appointment_shop = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_appointments' AND COLUMN_NAME = 'barbershop_id');
SET @sql = IF(@has_appointment_shop = 0, 'ALTER TABLE `bs_appointments` ADD COLUMN `barbershop_id` BIGINT UNSIGNED NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Legacy installation: the first existing shop is the only reliable owner for
-- old rows. Platform administrators remain global and intentionally NULL.
SET @default_shop = (SELECT MIN(id) FROM `bs_barbershops`);
UPDATE `bs_users` SET barbershop_id = @default_shop WHERE barbershop_id IS NULL AND platform_admin = 0 AND @default_shop IS NOT NULL;
UPDATE `bs_services` SET barbershop_id = @default_shop WHERE barbershop_id IS NULL AND @default_shop IS NOT NULL;
UPDATE `bs_appointments` a
LEFT JOIN `bs_users` c ON c.id = a.client_id
LEFT JOIN `bs_users` b ON b.id = a.barber_id
SET a.barbershop_id = COALESCE(a.barbershop_id, c.barbershop_id, b.barbershop_id, @default_shop)
WHERE a.barbershop_id IS NULL AND @default_shop IS NOT NULL;

SET @has_user_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_users' AND INDEX_NAME = 'idx_bs_users_barbershop');
SET @sql = IF(@has_user_idx = 0, 'ALTER TABLE `bs_users` ADD KEY `idx_bs_users_barbershop` (`barbershop_id`,`role`,`status`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_service_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_services' AND INDEX_NAME = 'idx_bs_services_barbershop');
SET @sql = IF(@has_service_idx = 0, 'ALTER TABLE `bs_services` ADD KEY `idx_bs_services_barbershop` (`barbershop_id`,`active`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_appointment_idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bs_appointments' AND INDEX_NAME = 'idx_bs_appointments_barbershop');
SET @sql = IF(@has_appointment_idx = 0, 'ALTER TABLE `bs_appointments` ADD KEY `idx_bs_appointments_barbershop` (`barbershop_id`,`starts_at`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
