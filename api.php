<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $_POST;
}

function bearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $match)) return trim($match[1]);
    return null;
}

function database(): array
{
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) jsonResponse(['ok' => false, 'error' => 'not_installed'], 503);
    $config = require $configPath;
    $db = $config['database'] ?? [];
    $prefix = (string)($db['table_prefix'] ?? 'bs_');
    if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $prefix)) jsonResponse(['ok' => false, 'error' => 'invalid_table_prefix'], 500);
    try {
        $pdo = new PDO(
            "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4",
            (string)$db['user'],
            (string)$db['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
        );
    } catch (Throwable $exception) {
        jsonResponse(['ok' => false, 'error' => 'database_unavailable'], 503);
    }
    return [$pdo, $prefix];
}

function ensureSessions(PDO $pdo, string $prefix): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$prefix}sessions` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `user_id` BIGINT UNSIGNED NOT NULL,
        `token_hash` CHAR(64) NOT NULL,
        `expires_at` DATETIME NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`), UNIQUE KEY `uq_{$prefix}sessions_token` (`token_hash`), KEY `idx_{$prefix}sessions_expires` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function ensureSyncQueue(PDO $pdo, string $prefix): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$prefix}sync_queue` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `device_id` VARCHAR(120) NOT NULL,
        `entity` VARCHAR(80) NOT NULL,
        `entity_id` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        `operation` ENUM('create','update','delete') NOT NULL,
        `payload` JSON NOT NULL,
        `status` ENUM('pending','processed','conflict') NOT NULL DEFAULT 'pending',
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`), KEY `idx_{$prefix}sync_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function authenticatedUser(PDO $pdo, string $prefix): array
{
    $token = bearerToken();
    if (!$token) jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    ensureSessions($pdo, $prefix);
    $stmt = $pdo->prepare("SELECT u.id, u.name, u.email, u.role, u.status FROM `{$prefix}sessions` s INNER JOIN `{$prefix}users` u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'active' LIMIT 1");
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    return $user;
}

$action = (string)($_GET['action'] ?? 'health');
if ($action === 'health') {
    jsonResponse(['ok' => true, 'service' => 'barber-shop-api', 'version' => '1.0.0']);
}

[$pdo, $prefix] = database();

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = body();
    $email = strtolower(trim((string)($data['email'] ?? '')));
    $password = (string)($data['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') jsonResponse(['ok' => false, 'error' => 'invalid_credentials'], 422);
    $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status FROM `{$prefix}users` WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || $user['status'] !== 'active' || !password_verify($password, (string)$user['password_hash'])) jsonResponse(['ok' => false, 'error' => 'invalid_credentials'], 401);
    ensureSessions($pdo, $prefix);
    $token = bin2hex(random_bytes(32));
    $session = $pdo->prepare("INSERT INTO `{$prefix}sessions` (`user_id`, `token_hash`, `expires_at`) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))");
    $session->execute([(int)$user['id'], hash('sha256', $token)]);
    unset($user['password_hash']);
    jsonResponse(['ok' => true, 'token' => $token, 'user' => $user, 'expires_in' => 2592000]);
}

if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = bearerToken();
    if ($token) {
        ensureSessions($pdo, $prefix);
        $stmt = $pdo->prepare("DELETE FROM `{$prefix}sessions` WHERE token_hash = ?");
        $stmt->execute([hash('sha256', $token)]);
    }
    jsonResponse(['ok' => true]);
}

$user = authenticatedUser($pdo, $prefix);
if ($action === 'me') jsonResponse(['ok' => true, 'user' => $user]);

if ($action === 'sync' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = body();
    $changes = is_array($data['changes'] ?? null) ? array_slice($data['changes'], 0, 50) : [];
    $deviceId = trim((string)($data['device_id'] ?? ''));
    if ($deviceId === '' || strlen($deviceId) > 120 || !$changes) jsonResponse(['ok' => false, 'error' => 'invalid_sync_payload'], 422);
    ensureSyncQueue($pdo, $prefix);
    $stmt = $pdo->prepare("INSERT INTO `{$prefix}sync_queue` (`device_id`, `entity`, `entity_id`, `operation`, `payload`) VALUES (?, ?, ?, ?, ?)");
    $accepted = [];
    foreach ($changes as $change) {
        $entity = (string)($change['entity'] ?? '');
        $operation = (string)($change['operation'] ?? '');
        $payload = $change['payload'] ?? null;
        if (!preg_match('/^[A-Za-z0-9._-]{1,80}$/', $entity) || !in_array($operation, ['create', 'update', 'delete'], true) || !is_array($payload)) continue;
        $stmt->execute([$deviceId, $entity, (int)($change['entity_id'] ?? 0), $operation, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $accepted[] = ['client_id' => (string)($change['client_id'] ?? ''), 'server_id' => (int)$pdo->lastInsertId()];
    }
    jsonResponse(['ok' => true, 'accepted' => $accepted, 'queued' => count($accepted)]);
}

if ($action === 'appointment_create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = body();
    $clientId = (int)($data['client_id'] ?? 0);
    $barberId = (int)($data['barber_id'] ?? 0);
    $serviceId = (int)($data['service_id'] ?? 0);
    $startsAt = trim((string)($data['starts_at'] ?? ''));
    $endsAt = trim((string)($data['ends_at'] ?? ''));
    $notes = trim((string)($data['notes'] ?? ''));
    if ($user['role'] === 'client') $clientId = (int)$user['id'];
    if ($user['role'] === 'barber') $barberId = (int)$user['id'];
    if ($clientId < 1 || $barberId < 1 || $serviceId < 1 || $startsAt === '' || $endsAt === '') jsonResponse(['ok' => false, 'error' => 'invalid_appointment'], 422);
    $conflict = $pdo->prepare("SELECT id FROM `{$prefix}appointments` WHERE barber_id = ? AND status IN ('pending','confirmed') AND starts_at < ? AND ends_at > ? LIMIT 1");
    $conflict->execute([$barberId, $endsAt, $startsAt]);
    if ($conflict->fetch()) jsonResponse(['ok' => false, 'error' => 'appointment_conflict'], 409);
    $insert = $pdo->prepare("INSERT INTO `{$prefix}appointments` (`client_id`, `barber_id`, `service_id`, `starts_at`, `ends_at`, `status`, `notes`) VALUES (?, ?, ?, ?, ?, 'pending', ?)");
    $insert->execute([$clientId, $barberId, $serviceId, $startsAt, $endsAt, $notes !== '' ? $notes : null]);
    jsonResponse(['ok' => true, 'appointment_id' => (int)$pdo->lastInsertId(), 'status' => 'pending'], 201);
}

if ($action === 'appointment_cancel' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $appointmentId = (int)(body()['appointment_id'] ?? 0);
    if ($appointmentId < 1) jsonResponse(['ok' => false, 'error' => 'invalid_appointment'], 422);
    $cancel = $pdo->prepare("UPDATE `{$prefix}appointments` SET status = 'cancelled' WHERE id = ? AND status IN ('pending','confirmed') AND (client_id = ? OR barber_id = ? OR ? = 'admin')");
    $cancel->execute([$appointmentId, (int)$user['id'], (int)$user['id'], $user['role']]);
    if ($cancel->rowCount() < 1) jsonResponse(['ok' => false, 'error' => 'appointment_not_found'], 404);
    jsonResponse(['ok' => true, 'appointment_id' => $appointmentId, 'status' => 'cancelled']);
}

if ($action === 'summary') {
    $response = ['ok' => true, 'user' => $user, 'data' => []];
    if ($user['role'] === 'admin') {
        $response['data']['users'] = (int)$pdo->query("SELECT COUNT(*) FROM `{$prefix}users` WHERE status = 'active'")->fetchColumn();
        $response['data']['barbers'] = (int)$pdo->query("SELECT COUNT(*) FROM `{$prefix}users` WHERE role = 'barber' AND status = 'active'")->fetchColumn();
        $response['data']['appointments'] = (int)$pdo->query("SELECT COUNT(*) FROM `{$prefix}appointments` WHERE starts_at >= CURDATE() AND starts_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)")->fetchColumn();
    } elseif ($user['role'] === 'barber') {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$prefix}appointments` WHERE barber_id = ? AND starts_at >= CURDATE() AND starts_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND status IN ('pending','confirmed')");
        $stmt->execute([(int)$user['id']]);
        $response['data']['today_appointments'] = (int)$stmt->fetchColumn();
        $list = $pdo->prepare("SELECT a.id, a.starts_at, a.ends_at, a.status, u.name AS client_name, s.name AS service_name FROM `{$prefix}appointments` a LEFT JOIN `{$prefix}users` u ON u.id = a.client_id LEFT JOIN `{$prefix}services` s ON s.id = a.service_id WHERE a.barber_id = ? AND a.starts_at >= CURDATE() ORDER BY a.starts_at ASC LIMIT 20");
        $list->execute([(int)$user['id']]);
        $response['data']['appointments'] = $list->fetchAll();
    } else {
        $stmt = $pdo->prepare("SELECT a.id, a.starts_at, a.ends_at, a.status, u.name AS barber_name, s.name AS service_name FROM `{$prefix}appointments` a LEFT JOIN `{$prefix}users` u ON u.id = a.barber_id LEFT JOIN `{$prefix}services` s ON s.id = a.service_id WHERE a.client_id = ? AND a.starts_at >= NOW() ORDER BY a.starts_at ASC LIMIT 5");
        $stmt->execute([(int)$user['id']]);
        $response['data']['upcoming'] = $stmt->fetchAll();
    }
    jsonResponse($response);
}

jsonResponse(['ok' => false, 'error' => 'not_found'], 404);
