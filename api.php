<?php
declare(strict_types=1);

/**
 * Barber Shop API.
 *
 * Appointment DATETIME values are local wall-clock values in America/Sao_Paulo,
 * matching the existing schema and live application. Sessions continue to use
 * UTC timestamps for expiry.
 */
date_default_timezone_set('America/Sao_Paulo');

const BARBERSHOP_API_TIMEZONE = 'America/Sao_Paulo';
const BARBERSHOP_API_MAX_BODY_BYTES = 65536;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;
}

function apiError(string $error, int $status = 400): never
{
    jsonResponse(['ok' => false, 'error' => $error], $status);
}

function apiRollbackAndError(PDO $pdo, string $error, int $status): never
{
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    apiError($error, $status);
}

function apiTimezone(): DateTimeZone
{
    return new DateTimeZone(BARBERSHOP_API_TIMEZONE);
}

function apiStringLength(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function apiIntegerValue(mixed $value): ?int
{
    if (is_int($value)) {
        return $value;
    }
    if (is_string($value) && preg_match('/^-?(?:0|[1-9][0-9]*)$/', $value) === 1) {
        $filtered = filter_var($value, FILTER_VALIDATE_INT);
        return $filtered === false ? null : (int)$filtered;
    }
    return null;
}

function apiPositiveId(mixed $value): ?int
{
    $number = apiIntegerValue($value);
    return $number !== null && $number > 0 ? $number : null;
}

function apiDateTimeFromFormat(string $format, string $value, DateTimeZone $timezone): ?DateTimeImmutable
{
    $date = DateTimeImmutable::createFromFormat($format, $value, $timezone);
    $errors = DateTimeImmutable::getLastErrors();
    if ($date === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return null;
    }
    return $date;
}

function apiParseLocalDate(string $value): ?DateTimeImmutable
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
        return null;
    }
    $date = apiDateTimeFromFormat('!Y-m-d', $value, apiTimezone());
    return $date !== null && $date->format('Y-m-d') === $value ? $date : null;
}

function apiParseLocalDateTime(string $value): ?DateTimeImmutable
{
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/', $value) !== 1) {
        return null;
    }
    $normalized = strlen($value) === 16 ? $value . ':00' : $value;
    $date = apiDateTimeFromFormat('!Y-m-d H:i:s', $normalized, apiTimezone());
    return $date !== null && $date->format('Y-m-d H:i:s') === $normalized ? $date : null;
}

/**
 * Pure validation used by user_save and the local unit tests.
 */
function apiValidateUserPayload(array $payload, bool $isUpdate = false, array $existing = []): array
{
    $required = ['name', 'email', 'role', 'status'];
    if (!$isUpdate) {
        foreach ($required as $field) {
            if (!array_key_exists($field, $payload)) {
                return ['ok' => false, 'error' => 'invalid_user'];
            }
        }
    }

    $nameValue = $payload['name'] ?? ($existing['name'] ?? null);
    $emailValue = $payload['email'] ?? ($existing['email'] ?? null);
    $roleValue = $payload['role'] ?? ($existing['role'] ?? null);
    $statusValue = $payload['status'] ?? ($existing['status'] ?? null);

    if (!is_string($nameValue)) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }
    $name = trim($nameValue);
    if ($name === '' || apiStringLength($name) > 160) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }

    if (!is_string($emailValue)) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }
    $email = strtolower(trim($emailValue));
    if ($email === '' || apiStringLength($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }

    if (!is_string($roleValue) || !in_array($roleValue, ['client', 'barber'], true)) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }
    if (!is_string($statusValue) || !in_array($statusValue, ['active', 'inactive'], true)) {
        return ['ok' => false, 'error' => 'invalid_user'];
    }

    $result = [
        'ok' => true,
        'name' => $name,
        'email' => $email,
        'role' => $roleValue,
        'status' => $statusValue,
    ];

    if (array_key_exists('password', $payload)) {
        if (!is_string($payload['password']) || strlen($payload['password']) < 8 || strlen($payload['password']) > 4096) {
            return ['ok' => false, 'error' => 'invalid_password'];
        }
        $result['password'] = $payload['password'];
    } elseif (!$isUpdate) {
        return ['ok' => false, 'error' => 'invalid_password'];
    }

    return $result;
}

function apiBoolean01(mixed $value): ?int
{
    if (is_int($value) && ($value === 0 || $value === 1)) {
        return $value;
    }
    if (is_string($value) && ($value === '0' || $value === '1')) {
        return (int)$value;
    }
    return null;
}

/**
 * Pure validation used by service_save and the local unit tests.
 */
function apiValidateServicePayload(array $payload, bool $isUpdate = false, array $existing = []): array
{
    if (!$isUpdate) {
        foreach (['name', 'duration_minutes', 'price_cents', 'active'] as $field) {
            if (!array_key_exists($field, $payload)) {
                return ['ok' => false, 'error' => 'invalid_service'];
            }
        }
    }

    $nameValue = $payload['name'] ?? ($existing['name'] ?? null);
    $durationValue = $payload['duration_minutes'] ?? ($existing['duration_minutes'] ?? null);
    $priceValue = $payload['price_cents'] ?? ($existing['price_cents'] ?? null);
    $activeValue = $payload['active'] ?? ($existing['active'] ?? null);
    $descriptionValue = $payload['description'] ?? ($existing['description'] ?? null);

    if (!is_string($nameValue)) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }
    $name = trim($nameValue);
    if ($name === '' || apiStringLength($name) > 140) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }

    $duration = apiIntegerValue($durationValue);
    if ($duration === null || $duration < 5 || $duration > 480) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }
    $price = apiIntegerValue($priceValue);
    if ($price === null || $price < 0 || $price > 100000000) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }
    $active = apiBoolean01($activeValue);
    if ($active === null) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }
    if ($descriptionValue !== null && !is_string($descriptionValue)) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }
    $description = $descriptionValue === null ? null : trim($descriptionValue);
    if ($description !== null && apiStringLength($description) > 5000) {
        return ['ok' => false, 'error' => 'invalid_service'];
    }

    return [
        'ok' => true,
        'name' => $name,
        'duration_minutes' => $duration,
        'price_cents' => $price,
        'active' => $active,
        'description' => $description,
    ];
}

/**
 * Pure appointment window validation. Database DATETIME values are formatted
 * without UTC conversion because the existing table stores local wall-clock time.
 */
function apiValidateAppointmentWindow(
    DateTimeImmutable $start,
    int $durationMinutes,
    ?DateTimeImmutable $providedEnd = null,
    ?DateTimeImmutable $now = null
): array {
    if ($durationMinutes < 5 || $durationMinutes > 480 || $start->format('s') !== '00') {
        return ['ok' => false, 'error' => 'invalid_appointment_time'];
    }

    $now = $now ?? new DateTimeImmutable('now', apiTimezone());
    if ($start <= $now) {
        return ['ok' => false, 'error' => 'appointment_must_be_future'];
    }

    $dayStart = $start->setTime(9, 0, 0);
    $dayEnd = $start->setTime(18, 0, 0);
    $end = $start->modify('+' . $durationMinutes . ' minutes');
    if ($start < $dayStart || $end > $dayEnd || $end->format('Y-m-d') !== $start->format('Y-m-d')) {
        return ['ok' => false, 'error' => 'appointment_outside_hours'];
    }
    if ($providedEnd !== null && $providedEnd->format('Y-m-d H:i:s') !== $end->format('Y-m-d H:i:s')) {
        return ['ok' => false, 'error' => 'appointment_duration_mismatch'];
    }

    return [
        'ok' => true,
        'starts_at' => $start->format('Y-m-d H:i:s'),
        'ends_at' => $end->format('Y-m-d H:i:s'),
    ];
}

function apiRequestConfig(): array
{
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        return [];
    }
    try {
        $config = require $path;
    } catch (Throwable) {
        return [];
    }
    return is_array($config) ? $config : [];
}

function apiAllowedOrigins(array $config): array
{
    $origins = [];
    $configured = $config['security']['allowed_origins'] ?? [];
    if (is_array($configured)) {
        foreach ($configured as $origin) {
            if (is_string($origin) && preg_match('#^https?://[^/]+$#i', trim($origin)) === 1) {
                $origins[] = rtrim(trim($origin), '/');
            }
        }
    }

    $baseUrl = $config['app']['base_url'] ?? 'https://sistemashp.com.br/barbershop';
    if (is_string($baseUrl)) {
        $parts = parse_url($baseUrl);
        if (is_array($parts) && isset($parts['scheme'], $parts['host']) && in_array(strtolower((string)$parts['scheme']), ['http', 'https'], true)) {
            $origin = strtolower((string)$parts['scheme']) . '://' . (string)$parts['host'];
            if (isset($parts['port'])) {
                $origin .= ':' . (int)$parts['port'];
            }
            $origins[] = $origin;
        }
    }

    if (!$origins) {
        $origins[] = 'https://sistemashp.com.br';
    }
    return array_values(array_unique($origins));
}

function apiApplyCors(array $config): void
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') {
        return;
    }
    $allowed = apiAllowedOrigins($config);
    if (!in_array($origin, $allowed, true)) {
        apiError('origin_not_allowed', 403);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}

function apiReadBody(): array
{
    $contentLength = apiIntegerValue($_SERVER['CONTENT_LENGTH'] ?? null);
    if ($contentLength !== null && $contentLength > BARBERSHOP_API_MAX_BODY_BYTES) {
        apiError('request_too_large', 413);
    }

    $raw = file_get_contents('php://input', false, null, 0, BARBERSHOP_API_MAX_BODY_BYTES + 1);
    if ($raw === false) {
        apiError('invalid_body', 400);
    }
    if (strlen($raw) > BARBERSHOP_API_MAX_BODY_BYTES) {
        apiError('request_too_large', 413);
    }
    if (trim($raw) === '') {
        return is_array($_POST ?? null) ? $_POST : [];
    }

    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($contentType, 'application/json') || in_array($raw[0], ['{', '['], true)) {
        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            apiError('invalid_json', 400);
        }
        if (!is_array($decoded)) {
            apiError('invalid_json', 400);
        }
        return $decoded;
    }

    return is_array($_POST ?? null) ? $_POST : [];
}

function apiRequireMethod(string $method, string $allow = 'GET'): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== $method) {
        header('Allow: ' . $allow);
        apiError('method_not_allowed', 405);
    }
}

function database(): array
{
    $config = apiRequestConfig();
    $db = $config['database'] ?? null;
    if (!is_array($db)) {
        apiError('not_installed', 503);
    }

    $prefix = (string)($db['table_prefix'] ?? 'bs_');
    if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $prefix)) {
        apiError('invalid_table_prefix', 500);
    }
    $host = (string)($db['host'] ?? '');
    $name = (string)($db['name'] ?? '');
    $dbUser = (string)($db['user'] ?? '');
    $port = apiIntegerValue($db['port'] ?? 3306) ?? 0;
    if ($host === '' || $name === '' || $dbUser === '' || $port < 1 || $port > 65535 || preg_match('/[\x00-\x1F;#]/', $host . $name . $dbUser) === 1) {
        apiError('invalid_database_config', 500);
    }

    try {
        $pdo = new PDO(
            'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4',
            $dbUser,
            (string)($db['password'] ?? ''),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (Throwable) {
        apiError('database_unavailable', 503);
    }
    return [$pdo, $prefix, $config];
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
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $token = null;
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $match) === 1) {
        $token = trim($match[1]);
    }
    if ($token === null || $token === '') {
        apiError('unauthorized', 401);
    }

    ensureSessions($pdo, $prefix);
    $stmt = $pdo->prepare("SELECT u.id, u.name, u.email, u.role, u.status
        FROM `{$prefix}sessions` s
        INNER JOIN `{$prefix}users` u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'active'
        LIMIT 1");
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) {
        apiError('unauthorized', 401);
    }
    $user['id'] = (int)$user['id'];
    return $user;
}

function apiFetchUser(PDO $pdo, string $prefix, int $id): ?array
{
    $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status FROM `{$prefix}users` WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function apiFetchService(PDO $pdo, string $prefix, int $id, bool $forUpdate = false): ?array
{
    $sql = "SELECT id, name, duration_minutes, price_cents, active, description FROM `{$prefix}services` WHERE id = ? LIMIT 1";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $service = $stmt->fetch();
    return $service ?: null;
}

function apiServiceResponse(array $service): array
{
    return [
        'id' => (int)$service['id'],
        'name' => (string)$service['name'],
        'duration_minutes' => (int)$service['duration_minutes'],
        'price_cents' => (int)$service['price_cents'],
        'active' => (int)$service['active'],
        'description' => $service['description'] === null ? null : (string)$service['description'],
    ];
}

function apiAppointmentResponse(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'client_id' => (int)$row['client_id'],
        'barber_id' => $row['barber_id'] === null ? null : (int)$row['barber_id'],
        'service_id' => (int)$row['service_id'],
        'starts_at' => (string)$row['starts_at'],
        'ends_at' => (string)$row['ends_at'],
        'status' => (string)$row['status'],
        'notes' => $row['notes'] === null ? null : (string)$row['notes'],
        'client_name' => $row['client_name'] === null ? null : (string)$row['client_name'],
        'barber_name' => $row['barber_name'] === null ? null : (string)$row['barber_name'],
        'service_name' => $row['service_name'] === null ? null : (string)$row['service_name'],
        'price_cents' => $row['price_cents'] === null ? null : (int)$row['price_cents'],
    ];
}

function apiEscapeLike(string $value): string
{
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
}

function handleUsers(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    if ($user['role'] !== 'admin') {
        apiError('forbidden', 403);
    }
    $role = isset($_GET['role']) ? trim((string)$_GET['role']) : '';
    if ($role !== '' && !in_array($role, ['client', 'barber'], true)) {
        apiError('invalid_role', 422);
    }
    $search = trim((string)($_GET['search'] ?? ''));
    if (apiStringLength($search) > 100) {
        apiError('invalid_search', 422);
    }

    $sql = "SELECT id, name, email, role, status FROM `{$prefix}users` WHERE role IN ('client', 'barber')";
    $params = [];
    if ($role !== '') {
        $sql .= ' AND role = ?';
        $params[] = $role;
    }
    if ($search !== '') {
        $sql .= " AND (name LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\')";
        $term = '%' . apiEscapeLike($search) . '%';
        $params[] = $term;
        $params[] = $term;
    }
    $sql .= ' ORDER BY name ASC, id ASC LIMIT 200';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $users = [];
    foreach ($stmt->fetchAll() as $row) {
        $users[] = [
            'id' => (int)$row['id'],
            'name' => (string)$row['name'],
            'email' => (string)$row['email'],
            'role' => (string)$row['role'],
            'status' => (string)$row['status'],
        ];
    }
    jsonResponse(['ok' => true, 'users' => $users]);
}

function handleUserSave(PDO $pdo, string $prefix, array $currentUser): never
{
    apiRequireMethod('POST');
    if ($currentUser['role'] !== 'admin') {
        apiError('forbidden', 403);
    }
    $data = apiReadBody();
    $id = array_key_exists('id', $data) ? apiPositiveId($data['id']) : null;
    if (array_key_exists('id', $data) && $id === null) {
        apiError('invalid_user', 422);
    }

    $existing = [];
    if ($id !== null) {
        $existing = apiFetchUser($pdo, $prefix, $id) ?? [];
        if (!$existing) {
            apiError('user_not_found', 404);
        }
        if ((string)$existing['role'] === 'admin') {
            apiError('admin_record_restricted', 403);
        }
    }

    $validated = apiValidateUserPayload($data, $id !== null, $existing);
    if (!$validated['ok']) {
        apiError((string)$validated['error'], 422);
    }
    $duplicate = $pdo->prepare("SELECT id FROM `{$prefix}users` WHERE email = ? AND id <> ? LIMIT 1");
    $duplicate->execute([$validated['email'], $id ?? 0]);
    if ($duplicate->fetchColumn() !== false) {
        apiError('email_already_exists', 409);
    }

    try {
        if ($id === null) {
            $stmt = $pdo->prepare("INSERT INTO `{$prefix}users` (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $validated['name'],
                $validated['email'],
                password_hash((string)$validated['password'], PASSWORD_DEFAULT),
                $validated['role'],
                $validated['status'],
            ]);
            $id = (int)$pdo->lastInsertId();
        } else {
            $fields = ['name = ?', 'email = ?', 'role = ?', 'status = ?'];
            $params = [$validated['name'], $validated['email'], $validated['role'], $validated['status']];
            if (array_key_exists('password', $validated)) {
                $fields[] = 'password_hash = ?';
                $params[] = password_hash((string)$validated['password'], PASSWORD_DEFAULT);
            }
            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE `{$prefix}users` SET " . implode(', ', $fields) . " WHERE id = ? AND role IN ('client', 'barber')");
            $stmt->execute($params);
        }
    } catch (PDOException $exception) {
        if ((string)$exception->getCode() === '23000') {
            apiError('email_already_exists', 409);
        }
        throw $exception;
    }

    $saved = apiFetchUser($pdo, $prefix, (int)$id);
    if (!$saved || (string)$saved['role'] === 'admin') {
        apiError('user_not_found', 404);
    }
    jsonResponse([
        'ok' => true,
        'user' => [
            'id' => (int)$saved['id'],
            'name' => (string)$saved['name'],
            'email' => (string)$saved['email'],
            'role' => (string)$saved['role'],
            'status' => (string)$saved['status'],
        ],
    ], $existing ? 200 : 201);
}

function handleServices(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    $activeOnly = $user['role'] !== 'admin';
    $sql = "SELECT id, name, duration_minutes, price_cents, active, description FROM `{$prefix}services`";
    if ($activeOnly) {
        $sql .= ' WHERE active = 1';
    }
    $sql .= ' ORDER BY name ASC, id ASC';
    $rows = $pdo->query($sql)->fetchAll();
    $services = [];
    foreach ($rows as $row) {
        $services[] = apiServiceResponse($row);
    }
    jsonResponse(['ok' => true, 'services' => $services]);
}

function handleServiceSave(PDO $pdo, string $prefix, array $currentUser): never
{
    apiRequireMethod('POST');
    if ($currentUser['role'] !== 'admin') {
        apiError('forbidden', 403);
    }
    $data = apiReadBody();
    $id = array_key_exists('id', $data) ? apiPositiveId($data['id']) : null;
    if (array_key_exists('id', $data) && $id === null) {
        apiError('invalid_service', 422);
    }
    $existing = [];
    if ($id !== null) {
        $existing = apiFetchService($pdo, $prefix, $id) ?? [];
        if (!$existing) {
            apiError('service_not_found', 404);
        }
    }
    $validated = apiValidateServicePayload($data, $id !== null, $existing);
    if (!$validated['ok']) {
        apiError((string)$validated['error'], 422);
    }

    if ($id === null) {
        $stmt = $pdo->prepare("INSERT INTO `{$prefix}services` (name, duration_minutes, price_cents, active, description) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([
            $validated['name'],
            $validated['duration_minutes'],
            $validated['price_cents'],
            $validated['active'],
            $validated['description'],
        ]);
        $id = (int)$pdo->lastInsertId();
    } else {
        $stmt = $pdo->prepare("UPDATE `{$prefix}services` SET name = ?, duration_minutes = ?, price_cents = ?, active = ?, description = ? WHERE id = ?");
        $stmt->execute([
            $validated['name'],
            $validated['duration_minutes'],
            $validated['price_cents'],
            $validated['active'],
            $validated['description'],
            $id,
        ]);
    }
    $saved = apiFetchService($pdo, $prefix, (int)$id);
    if (!$saved) {
        apiError('service_not_found', 404);
    }
    jsonResponse(['ok' => true, 'service' => apiServiceResponse($saved)], $existing ? 200 : 201);
}

/** @return array<int, array<string, mixed>> */
function apiLockUsers(PDO $pdo, string $prefix, array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    sort($ids, SORT_NUMERIC);
    $locked = [];
    foreach ($ids as $id) {
        $stmt = $pdo->prepare("SELECT id, role, status FROM `{$prefix}users` WHERE id = ? LIMIT 1 FOR UPDATE");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row) {
            $locked[(int)$row['id']] = $row;
        }
    }
    return $locked;
}

function apiAppointmentNotes(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value)) {
        apiError('invalid_notes', 422);
    }
    $notes = trim($value);
    if (apiStringLength($notes) > 500) {
        apiError('invalid_notes', 422);
    }
    return $notes === '' ? null : $notes;
}

function handleAppointmentCreate(PDO $pdo, string $prefix, array $currentUser): never
{
    apiRequireMethod('POST');
    $data = apiReadBody();
    $serviceId = apiPositiveId($data['service_id'] ?? null);
    if ($serviceId === null) {
        apiError('invalid_appointment', 422);
    }

    $requestedClientId = array_key_exists('client_id', $data) ? apiPositiveId($data['client_id']) : null;
    $requestedBarberId = array_key_exists('barber_id', $data) ? apiPositiveId($data['barber_id']) : null;
    if (array_key_exists('client_id', $data) && $requestedClientId === null) {
        apiError('invalid_appointment', 422);
    }
    if (array_key_exists('barber_id', $data) && $requestedBarberId === null) {
        apiError('invalid_appointment', 422);
    }

    $clientId = $requestedClientId;
    $barberId = $requestedBarberId;
    if ($currentUser['role'] === 'client') {
        if ($clientId !== null && $clientId !== (int)$currentUser['id']) {
            apiError('client_ownership_mismatch', 403);
        }
        $clientId = (int)$currentUser['id'];
    } elseif ($currentUser['role'] === 'barber') {
        if ($barberId !== null && $barberId !== (int)$currentUser['id']) {
            apiError('barber_ownership_mismatch', 403);
        }
        $barberId = (int)$currentUser['id'];
    } elseif ($currentUser['role'] !== 'admin') {
        apiError('forbidden', 403);
    }
    if ($clientId === null || $barberId === null) {
        apiError('invalid_appointment', 422);
    }

    $startsRaw = $data['starts_at'] ?? null;
    if (!is_string($startsRaw)) {
        apiError('invalid_appointment', 422);
    }
    $starts = apiParseLocalDateTime(trim($startsRaw));
    if ($starts === null) {
        apiError('invalid_appointment_time', 422);
    }
    $endsRaw = $data['ends_at'] ?? null;
    $providedEnds = null;
    if ($endsRaw !== null) {
        if (!is_string($endsRaw)) {
            apiError('invalid_appointment_time', 422);
        }
        $providedEnds = apiParseLocalDateTime(trim($endsRaw));
        if ($providedEnds === null) {
            apiError('invalid_appointment_time', 422);
        }
    }
    $notes = apiAppointmentNotes($data['notes'] ?? null);

    try {
        $pdo->beginTransaction();
        // Every create locks the two user rows in ascending id order. This
        // serializes competing inserts for both barber and client bookings.
        $lockedUsers = apiLockUsers($pdo, $prefix, [(int)$clientId, (int)$barberId]);
        $client = $lockedUsers[(int)$clientId] ?? null;
        $barber = $lockedUsers[(int)$barberId] ?? null;
        if (!$client || $client['role'] !== 'client' || $client['status'] !== 'active') {
            apiRollbackAndError($pdo, 'client_not_found', 404);
        }
        if (!$barber || $barber['role'] !== 'barber' || $barber['status'] !== 'active') {
            apiRollbackAndError($pdo, 'barber_not_found', 404);
        }

        // Lock the service row for a consistent duration while calculating and inserting.
        $service = apiFetchService($pdo, $prefix, (int)$serviceId, true);
        if (!$service || (int)$service['active'] !== 1) {
            apiRollbackAndError($pdo, 'service_not_found', 404);
        }
        $duration = (int)$service['duration_minutes'];
        $window = apiValidateAppointmentWindow($starts, $duration, $providedEnds);
        if (!$window['ok']) {
            apiRollbackAndError($pdo, (string)$window['error'], 422);
        }

        $conflict = $pdo->prepare("SELECT id FROM `{$prefix}appointments`
            WHERE barber_id = ? AND status IN ('pending', 'confirmed')
              AND starts_at < ? AND ends_at > ?
            LIMIT 1");
        $conflict->execute([(int)$barberId, $window['ends_at'], $window['starts_at']]);
        if ($conflict->fetch()) {
            apiRollbackAndError($pdo, 'appointment_conflict', 409);
        }

        $clientConflict = $pdo->prepare("SELECT id FROM `{$prefix}appointments`
            WHERE client_id = ? AND status IN ('pending', 'confirmed')
              AND starts_at < ? AND ends_at > ?
            LIMIT 1");
        $clientConflict->execute([(int)$clientId, $window['ends_at'], $window['starts_at']]);
        if ($clientConflict->fetch()) {
            apiRollbackAndError($pdo, 'client_appointment_conflict', 409);
        }

        $insert = $pdo->prepare("INSERT INTO `{$prefix}appointments`
            (client_id, barber_id, service_id, starts_at, ends_at, status, notes)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)");
        $insert->execute([
            (int)$clientId,
            (int)$barberId,
            (int)$serviceId,
            $window['starts_at'],
            $window['ends_at'],
            $notes,
        ]);
        $appointmentId = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    jsonResponse(['ok' => true, 'appointment_id' => $appointmentId, 'status' => 'pending'], 201);
}

function handleAppointmentCancel(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('POST');
    $id = apiPositiveId(apiReadBody()['appointment_id'] ?? null);
    if ($id === null) {
        apiError('invalid_appointment', 422);
    }
    if ($user['role'] === 'admin') {
        $stmt = $pdo->prepare("UPDATE `{$prefix}appointments` SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'confirmed')");
        $stmt->execute([$id]);
    } else {
        $stmt = $pdo->prepare("UPDATE `{$prefix}appointments` SET status = 'cancelled'
            WHERE id = ? AND status IN ('pending', 'confirmed') AND (client_id = ? OR barber_id = ?)");
        $stmt->execute([$id, (int)$user['id'], (int)$user['id']]);
    }
    if ($stmt->rowCount() < 1) {
        apiError('appointment_not_found', 404);
    }
    jsonResponse(['ok' => true, 'appointment_id' => $id, 'status' => 'cancelled']);
}

function handleAppointmentStatus(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('POST');
    $data = apiReadBody();
    $id = apiPositiveId($data['appointment_id'] ?? null);
    $status = is_string($data['status'] ?? null) ? trim((string)$data['status']) : '';
    if ($id === null || !in_array($status, ['confirmed', 'completed', 'cancelled', 'no_show'], true)) {
        apiError('invalid_appointment_status', 422);
    }
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("SELECT id, barber_id, status FROM `{$prefix}appointments` WHERE id = ? LIMIT 1 FOR UPDATE");
        $stmt->execute([$id]);
        $appointment = $stmt->fetch();
        if (!$appointment) {
            apiRollbackAndError($pdo, 'appointment_not_found', 404);
        }
        if ($user['role'] !== 'admin' && (int)$appointment['barber_id'] !== (int)$user['id']) {
            apiRollbackAndError($pdo, 'forbidden', 403);
        }

        $current = (string)$appointment['status'];
        $transitions = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['completed', 'no_show', 'cancelled'],
        ];
        if (!isset($transitions[$current]) || !in_array($status, $transitions[$current], true)) {
            apiRollbackAndError($pdo, 'invalid_status_transition', 409);
        }
        $update = $pdo->prepare("UPDATE `{$prefix}appointments` SET status = ? WHERE id = ?");
        $update->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
    jsonResponse(['ok' => true, 'appointment_id' => $id, 'status' => $status]);
}

function handleAppointmentList(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    $dateValue = $_GET['date'] ?? null;
    if (!is_string($dateValue)) {
        apiError('invalid_date', 422);
    }
    $date = apiParseLocalDate(trim($dateValue));
    if ($date === null) {
        apiError('invalid_date', 422);
    }
    $nextDate = $date->modify('+1 day');
    $sql = "SELECT a.id, a.client_id, a.barber_id, a.service_id, a.starts_at, a.ends_at, a.status, a.notes,
        c.name AS client_name, b.name AS barber_name, s.name AS service_name, s.price_cents
        FROM `{$prefix}appointments` a
        LEFT JOIN `{$prefix}users` c ON c.id = a.client_id
        LEFT JOIN `{$prefix}users` b ON b.id = a.barber_id
        LEFT JOIN `{$prefix}services` s ON s.id = a.service_id
        WHERE a.starts_at >= ? AND a.starts_at < ?";
    $params = [$date->format('Y-m-d 00:00:00'), $nextDate->format('Y-m-d 00:00:00')];
    if ($user['role'] === 'barber') {
        $sql .= ' AND a.barber_id = ?';
        $params[] = (int)$user['id'];
    } elseif ($user['role'] === 'client') {
        $sql .= ' AND a.client_id = ?';
        $params[] = (int)$user['id'];
    }
    $sql .= ' ORDER BY a.starts_at ASC, a.id ASC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $appointments = [];
    foreach ($stmt->fetchAll() as $row) {
        $appointments[] = apiAppointmentResponse($row);
    }
    jsonResponse(['ok' => true, 'appointments' => $appointments]);
}

function handleCatalog(PDO $pdo, string $prefix): never
{
    apiRequireMethod('GET');
    $services = $pdo->query("SELECT id, name, duration_minutes, price_cents FROM `{$prefix}services` WHERE active = 1 ORDER BY name ASC, id ASC")->fetchAll();
    $barbers = $pdo->query("SELECT id, name FROM `{$prefix}users` WHERE role = 'barber' AND status = 'active' ORDER BY name ASC, id ASC")->fetchAll();
    foreach ($services as &$service) {
        $service['id'] = (int)$service['id'];
        $service['duration_minutes'] = (int)$service['duration_minutes'];
        $service['price_cents'] = (int)$service['price_cents'];
    }
    unset($service);
    foreach ($barbers as &$barber) {
        $barber['id'] = (int)$barber['id'];
    }
    unset($barber);
    jsonResponse(['ok' => true, 'services' => $services, 'barbers' => $barbers]);
}

function handleAvailability(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    $dateValue = $_GET['date'] ?? null;
    $barberId = apiPositiveId($_GET['barber_id'] ?? null);
    $serviceId = apiPositiveId($_GET['service_id'] ?? null);
    if (!is_string($dateValue) || $barberId === null || $serviceId === null) {
        apiError('invalid_availability', 422);
    }
    $date = apiParseLocalDate(trim($dateValue));
    if ($date === null) {
        apiError('invalid_availability', 422);
    }

    $barberStmt = $pdo->prepare("SELECT id FROM `{$prefix}users` WHERE id = ? AND role = 'barber' AND status = 'active' LIMIT 1");
    $barberStmt->execute([$barberId]);
    if ($barberStmt->fetchColumn() === false) {
        apiError('barber_not_found', 404);
    }
    $service = apiFetchService($pdo, $prefix, $serviceId);
    if (!$service || (int)$service['active'] !== 1) {
        apiError('service_not_found', 404);
    }
    $duration = (int)$service['duration_minutes'];
    if ($duration < 5 || $duration > 480) {
        apiError('invalid_service', 422);
    }

    $nextDate = $date->modify('+1 day');
    $appointments = $pdo->prepare("SELECT starts_at, ends_at FROM `{$prefix}appointments`
        WHERE barber_id = ? AND status IN ('pending', 'confirmed')
          AND starts_at < ? AND ends_at > ?");
    $appointments->execute([
        $barberId,
        $nextDate->format('Y-m-d 00:00:00'),
        $date->format('Y-m-d 00:00:00'),
    ]);
    $busy = $appointments->fetchAll();
    $now = new DateTimeImmutable('now', apiTimezone());
    $slots = [];
    for ($minutes = 9 * 60; $minutes <= 18 * 60 - $duration; $minutes += 30) {
        $start = $date->setTime(intdiv($minutes, 60), $minutes % 60, 0);
        $end = $start->modify('+' . $duration . ' minutes');
        if ($start <= $now) {
            continue;
        }
        $blocked = false;
        foreach ($busy as $item) {
            if ($start->format('Y-m-d H:i:s') < (string)$item['ends_at'] && $end->format('Y-m-d H:i:s') > (string)$item['starts_at']) {
                $blocked = true;
                break;
            }
        }
        if (!$blocked) {
            // Only slot times are returned; no other client's identity or details are exposed.
            $slots[] = ['starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $end->format('Y-m-d H:i:s')];
        }
    }
    jsonResponse(['ok' => true, 'slots' => $slots]);
}

function handleSummary(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    $today = new DateTimeImmutable('today', apiTimezone());
    $tomorrow = $today->modify('+1 day');
    $todayStart = $today->format('Y-m-d 00:00:00');
    $tomorrowStart = $tomorrow->format('Y-m-d 00:00:00');
    $response = ['ok' => true, 'user' => $user, 'data' => []];

    if ($user['role'] === 'admin') {
        $counts = ['admin' => 0, 'barber' => 0, 'client' => 0];
        $rows = $pdo->query("SELECT role, COUNT(*) AS total FROM `{$prefix}users` WHERE status = 'active' GROUP BY role")->fetchAll();
        foreach ($rows as $row) {
            if (array_key_exists((string)$row['role'], $counts)) {
                $counts[(string)$row['role']] = (int)$row['total'];
            }
        }
        $appointmentCount = $pdo->prepare("SELECT COUNT(*) FROM `{$prefix}appointments` WHERE starts_at >= ? AND starts_at < ?");
        $appointmentCount->execute([$todayStart, $tomorrowStart]);
        $response['data'] = [
            // Keep the old users key, but make all role counts explicit and real.
            'users' => $counts['admin'] + $counts['barber'] + $counts['client'],
            'admins' => $counts['admin'],
            'barbers' => $counts['barber'],
            'clients' => $counts['client'],
            'appointments' => (int)$appointmentCount->fetchColumn(),
        ];
    } elseif ($user['role'] === 'barber') {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$prefix}appointments`
            WHERE barber_id = ? AND starts_at >= ? AND starts_at < ? AND status IN ('pending', 'confirmed')");
        $stmt->execute([(int)$user['id'], $todayStart, $tomorrowStart]);
        $response['data']['today_appointments'] = (int)$stmt->fetchColumn();
        $list = $pdo->prepare("SELECT a.id, a.starts_at, a.ends_at, a.status,
            u.name AS client_name, s.name AS service_name
            FROM `{$prefix}appointments` a
            LEFT JOIN `{$prefix}users` u ON u.id = a.client_id
            LEFT JOIN `{$prefix}services` s ON s.id = a.service_id
            WHERE a.barber_id = ? AND a.starts_at >= ?
            ORDER BY a.starts_at ASC, a.id ASC LIMIT 20");
        $list->execute([(int)$user['id'], $todayStart]);
        $response['data']['appointments'] = $list->fetchAll();
    } else {
        $now = (new DateTimeImmutable('now', apiTimezone()))->format('Y-m-d H:i:s');
        $stmt = $pdo->prepare("SELECT a.id, a.starts_at, a.ends_at, a.status,
            u.name AS barber_name, s.name AS service_name
            FROM `{$prefix}appointments` a
            LEFT JOIN `{$prefix}users` u ON u.id = a.barber_id
            LEFT JOIN `{$prefix}services` s ON s.id = a.service_id
            WHERE a.client_id = ? AND a.starts_at >= ? AND a.status IN ('pending', 'confirmed')
            ORDER BY a.starts_at ASC, a.id ASC LIMIT 5");
        $stmt->execute([(int)$user['id'], $now]);
        $response['data']['upcoming'] = $stmt->fetchAll();
    }
    jsonResponse($response);
}

function handleHistory(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('GET');
    $stmt = $pdo->prepare("SELECT a.id, a.starts_at, a.ends_at, a.status,
        u.name AS barber_name, s.name AS service_name
        FROM `{$prefix}appointments` a
        LEFT JOIN `{$prefix}users` u ON u.id = a.barber_id
        LEFT JOIN `{$prefix}services` s ON s.id = a.service_id
        WHERE a.client_id = ? ORDER BY a.starts_at DESC, a.id DESC LIMIT 50");
    $stmt->execute([(int)$user['id']]);
    jsonResponse(['ok' => true, 'appointments' => $stmt->fetchAll()]);
}

function handleSync(PDO $pdo, string $prefix, array $user): never
{
    apiRequireMethod('POST');
    if ($user['role'] !== 'admin') {
        apiError('forbidden', 403);
    }
    $data = apiReadBody();
    $changes = is_array($data['changes'] ?? null) ? array_slice($data['changes'], 0, 50) : [];
    $deviceId = trim((string)($data['device_id'] ?? ''));
    if ($deviceId === '' || apiStringLength($deviceId) > 120 || !$changes) {
        apiError('invalid_sync_payload', 422);
    }

    // Legacy queue compatibility only: admin-only, allowlisted entities, never applied here.
    ensureSyncQueue($pdo, $prefix);
    $stmt = $pdo->prepare("INSERT INTO `{$prefix}sync_queue`
        (device_id, entity, entity_id, operation, payload) VALUES (?, ?, ?, ?, ?)");
    $accepted = [];
    foreach ($changes as $change) {
        if (!is_array($change)) {
            continue;
        }
        $entity = (string)($change['entity'] ?? '');
        $operation = (string)($change['operation'] ?? '');
        $entityId = apiIntegerValue($change['entity_id'] ?? 0);
        $payload = $change['payload'] ?? null;
        if (!in_array($entity, ['appointments', 'users', 'services'], true) || !in_array($operation, ['create', 'update', 'delete'], true) || $entityId === null || $entityId < 0 || !is_array($payload)) {
            continue;
        }
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($encoded === false || strlen($encoded) > 32768) {
            continue;
        }
        $stmt->execute([$deviceId, $entity, $entityId, $operation, $encoded]);
        $accepted[] = [
            'client_id' => (string)($change['client_id'] ?? ''),
            'server_id' => (int)$pdo->lastInsertId(),
        ];
    }
    jsonResponse(['ok' => true, 'accepted' => $accepted, 'queued' => count($accepted)]);
}

function runApi(): never
{
    $pdo = null;
    try {
        $config = apiRequestConfig();
        apiApplyCors($config);
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method === 'OPTIONS') {
            http_response_code(204);
            exit;
        }

        $action = (string)($_GET['action'] ?? 'health');
        if ($action === 'health') {
            apiRequireMethod('GET');
            jsonResponse(['ok' => true, 'service' => 'barber-shop-api', 'version' => '1.1.0']);
        }

        [$pdo, $prefix] = database();
        if ($action === 'login') {
            apiRequireMethod('POST');
            $data = apiReadBody();
            $email = is_string($data['email'] ?? null) ? strtolower(trim((string)$data['email'])) : '';
            $password = is_string($data['password'] ?? null) ? (string)$data['password'] : '';
            if ($email === '' || apiStringLength($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false || $password === '' || strlen($password) > 4096) {
                apiError('invalid_credentials', 422);
            }
            $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status FROM `{$prefix}users` WHERE email = ? LIMIT 1");
            $stmt->execute([$email]);
            $loginUser = $stmt->fetch();
            if (!$loginUser || $loginUser['status'] !== 'active' || !password_verify($password, (string)$loginUser['password_hash'])) {
                apiError('invalid_credentials', 401);
            }
            ensureSessions($pdo, $prefix);
            $token = bin2hex(random_bytes(32));
            $session = $pdo->prepare("INSERT INTO `{$prefix}sessions` (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))");
            $session->execute([(int)$loginUser['id'], hash('sha256', $token)]);
            unset($loginUser['password_hash']);
            $loginUser['id'] = (int)$loginUser['id'];
            jsonResponse(['ok' => true, 'token' => $token, 'user' => $loginUser, 'expires_in' => 2592000]);
        }

        if ($action === 'logout') {
            apiRequireMethod('POST');
            $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
            if (preg_match('/^Bearer\s+(.+)$/i', $header, $match) === 1) {
                ensureSessions($pdo, $prefix);
                $stmt = $pdo->prepare("DELETE FROM `{$prefix}sessions` WHERE token_hash = ?");
                $stmt->execute([hash('sha256', trim($match[1]))]);
            }
            jsonResponse(['ok' => true]);
        }

        $user = authenticatedUser($pdo, $prefix);
        if ($action === 'me') {
            apiRequireMethod('GET');
            jsonResponse(['ok' => true, 'user' => $user]);
        }
        if ($action === 'users') {
            handleUsers($pdo, $prefix, $user);
        }
        if ($action === 'user_save') {
            handleUserSave($pdo, $prefix, $user);
        }
        if ($action === 'services') {
            handleServices($pdo, $prefix, $user);
        }
        if ($action === 'service_save') {
            handleServiceSave($pdo, $prefix, $user);
        }
        if ($action === 'sync') {
            handleSync($pdo, $prefix, $user);
        }
        if ($action === 'appointment_create') {
            handleAppointmentCreate($pdo, $prefix, $user);
        }
        if ($action === 'appointment_cancel') {
            handleAppointmentCancel($pdo, $prefix, $user);
        }
        if ($action === 'appointment_status') {
            handleAppointmentStatus($pdo, $prefix, $user);
        }
        if ($action === 'appointment_list') {
            handleAppointmentList($pdo, $prefix, $user);
        }
        if ($action === 'catalog') {
            handleCatalog($pdo, $prefix);
        }
        if ($action === 'availability') {
            handleAvailability($pdo, $prefix, $user);
        }
        if ($action === 'summary') {
            handleSummary($pdo, $prefix, $user);
        }
        if ($action === 'history') {
            handleHistory($pdo, $prefix, $user);
        }
        apiError('not_found', 404);
    } catch (Throwable) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Never return driver messages, SQL, credentials, or stack traces to clients.
        apiError('internal_error', 500);
    }
}

// Unit tests include this file as a library so no request or database is executed.
if (!defined('BARBERSHOP_API_LIBRARY')) {
    runApi();
}
