<?php
declare(strict_types=1);
const BARBERSHOP_API_LIBRARY = true;
require_once __DIR__ . '/api.php';
$key = (string)($_GET['key'] ?? '');
if (!hash_equals('tenant-isolation-97719d2-20261105', $key)) {
    http_response_code(404); exit;
}
[$pdo, $prefix] = database();
$qi = static fn(string $name): string => '`' . str_replace('`', '', $name) . '`';
$users = $qi($prefix . 'users'); $shops = $qi($prefix . 'barbershops'); $services = $qi($prefix . 'services'); $appointments = $qi($prefix . 'appointments');
$has = static function(PDO $pdo, string $table, string $column): bool {
    $s = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $s->execute([$table, $column]); return (int)$s->fetchColumn() > 0;
};
$index = static function(PDO $pdo, string $table, string $name): bool {
    $s = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $s->execute([$table, $name]); return (int)$s->fetchColumn() > 0;
};
foreach ([[$users, $prefix.'users'], [$services, $prefix.'services'], [$appointments, $prefix.'appointments']] as [$table, $tableName]) {
    if (!$has($pdo, $tableName, 'barbershop_id')) $pdo->exec("ALTER TABLE {$table} ADD COLUMN barbershop_id BIGINT UNSIGNED NULL AFTER id");
}
$default = $pdo->query("SELECT MIN(id) FROM {$shops}")->fetchColumn();
if ($default !== false && $default !== null) {
    $pdo->prepare("UPDATE {$users} SET barbershop_id = ? WHERE barbershop_id IS NULL AND platform_admin = 0")->execute([(int)$default]);
    $pdo->prepare("UPDATE {$services} SET barbershop_id = ? WHERE barbershop_id IS NULL")->execute([(int)$default]);
    $pdo->exec("UPDATE {$appointments} a LEFT JOIN {$users} c ON c.id = a.client_id LEFT JOIN {$users} b ON b.id = a.barber_id SET a.barbershop_id = COALESCE(a.barbershop_id, c.barbershop_id, b.barbershop_id, " . (int)$default . ") WHERE a.barbershop_id IS NULL");
}
if (!$index($pdo, $prefix.'users', 'idx_'.$prefix.'users_barbershop')) $pdo->exec("ALTER TABLE {$users} ADD KEY idx_{$prefix}users_barbershop (barbershop_id, role, status)");
if (!$index($pdo, $prefix.'services', 'idx_'.$prefix.'services_barbershop')) $pdo->exec("ALTER TABLE {$services} ADD KEY idx_{$prefix}services_barbershop (barbershop_id, active)");
if (!$index($pdo, $prefix.'appointments', 'idx_'.$prefix.'appointments_barbershop')) $pdo->exec("ALTER TABLE {$appointments} ADD KEY idx_{$prefix}appointments_barbershop (barbershop_id, starts_at)");
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>true, 'default_shop'=>(int)$default, 'users_without_tenant'=>(int)$pdo->query("SELECT COUNT(*) FROM {$users} WHERE barbershop_id IS NULL AND platform_admin = 0")->fetchColumn(), 'services_without_tenant'=>(int)$pdo->query("SELECT COUNT(*) FROM {$services} WHERE barbershop_id IS NULL")->fetchColumn(), 'appointments_without_tenant'=>(int)$pdo->query("SELECT COUNT(*) FROM {$appointments} WHERE barbershop_id IS NULL")->fetchColumn()], JSON_UNESCAPED_UNICODE);
