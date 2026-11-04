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
    } else {
        $stmt = $pdo->prepare("SELECT id, starts_at, ends_at, status FROM `{$prefix}appointments` WHERE client_id = ? AND starts_at >= NOW() ORDER BY starts_at ASC LIMIT 5");
        $stmt->execute([(int)$user['id']]);
        $response['data']['upcoming'] = $stmt->fetchAll();
    }
    jsonResponse($response);
}

jsonResponse(['ok' => false, 'error' => 'not_found'], 404);
