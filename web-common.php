<?php
declare(strict_types=1);

/**
 * Same-origin web gateway helpers.
 *
 * Authentication bearer tokens are stored only in the PHP session. This file
 * deliberately contains no request dispatch and does not bypass API auth.
 */
const BARBERSHOP_WEB_MAX_BODY_BYTES = 65536;
const BARBERSHOP_WEB_RESET_MINUTES = 15;

function webJsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    echo json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;
}

function webError(string $error, int $status = 400): never
{
    webJsonResponse(['ok' => false, 'error' => $error], $status);
}

function webRequestMethod(): string
{
    return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function webRequireMethod(string $method, string $allow = 'GET'): void
{
    if (webRequestMethod() !== strtoupper($method)) {
        if (!headers_sent()) {
            header('Allow: ' . $allow);
        }
        webError('method_not_allowed', 405);
    }
}

/** @return array<string, mixed> */
function webConfig(): array
{
    static $loaded = false;
    static $config = [];
    if ($loaded) {
        return $config;
    }
    $loaded = true;
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        return $config;
    }
    try {
        $value = require $path;
    } catch (Throwable) {
        return $config;
    }
    $config = is_array($value) ? $value : [];
    $mailPath = __DIR__ . '/mail.local.php';
    if (is_file($mailPath)) {
        try {
            $mailValue = require $mailPath;
            if (is_array($mailValue)) {
                $config['mail'] = array_merge(is_array($config['mail'] ?? null) ? $config['mail'] : [], $mailValue);
            }
        } catch (Throwable) {
            // Keep the public configuration usable when the private mail file is unavailable.
        }
    }
    return $config;
}

function webRequestIsHttps(): bool
{
    $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    if ($https === 'on' || $https === '1') {
        return true;
    }
    $config = webConfig();
    if (($config['security']['trust_proxy'] ?? false) === true) {
        return strtolower(trim((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))) === 'https';
    }
    return ((int)($_SERVER['SERVER_PORT'] ?? 0)) === 443;
}

function webLocalRequest(): bool
{
    $config = webConfig();
    $environment = strtolower((string)($config['app']['environment'] ?? ''));
    if (in_array($environment, ['local', 'development', 'test', 'testing'], true)) {
        return true;
    }
    if (PHP_SAPI === 'cli') {
        return true;
    }
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $host = preg_replace('/:\d+$/', '', $host) ?? $host;
    return in_array($host, ['localhost', '127.0.0.1', '::1'], true)
        || str_ends_with($host, '.local');
}

function webCookiePath(): string
{
    if (webLocalRequest()) {
        return '/';
    }
    $config = webConfig();
    $baseUrl = $config['app']['base_url'] ?? null;
    if (is_string($baseUrl)) {
        $parts = parse_url($baseUrl);
        if (is_array($parts) && isset($parts['path']) && is_string($parts['path'])) {
            $path = trim($parts['path']);
            if ($path !== '' && $path !== '/') {
                return '/' . trim($path, '/');
            }
            return '/';
        }
    }

    $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $directory = str_replace('\\', '/', dirname($script));
    if ($directory === '.' || $directory === '') {
        return '/';
    }
    return '/' . trim($directory, '/');
}

function webCookieSameSite(bool $secure): string
{
    $config = webConfig();
    $explicitPreview = ($config['app']['preview'] ?? false) === true
        || ($config['security']['preview'] ?? false) === true
        || ($config['security']['preview_cookie'] ?? false) === true;
    return $explicitPreview && $secure ? 'None' : 'Lax';
}

function webSessionStart(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.cookie_httponly', '1');

    $secure = webRequestIsHttps() || !webLocalRequest();
    session_name('barber_web_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => webCookiePath(),
        'secure' => $secure,
        'httponly' => true,
        'samesite' => webCookieSameSite($secure),
    ]);
    session_start();
}

function webSessionClose(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

function webEnsureCsrf(): string
{
    webSessionStart();
    $token = $_SESSION['csrf_token'] ?? null;
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
    }
    return $token;
}

function webCsrfIsValid(): bool
{
    webSessionStart();
    $expected = $_SESSION['csrf_token'] ?? null;
    $provided = trim((string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    return is_string($expected)
        && $expected !== ''
        && $provided !== ''
        && hash_equals($expected, $provided);
}

function webRequireCsrf(): void
{
    if (!webCsrfIsValid()) {
        webError('csrf_invalid', 403);
    }
}

function webSafeUser(array $user): array
{
    return [
        'id' => (int)($user['id'] ?? 0),
        'name' => (string)($user['name'] ?? ''),
        'email' => (string)($user['email'] ?? ''),
        'role' => (string)($user['role'] ?? ''),
        'status' => (string)($user['status'] ?? ''),
        'platform_admin' => (int)($user['platform_admin'] ?? 0) === 1,
        'barbershop_id' => isset($user['barbershop_id']) && $user['barbershop_id'] !== null ? (int)$user['barbershop_id'] : null,
    ];
}

function webClearAuthentication(bool $regenerate = true): string
{
    webSessionStart();
    $_SESSION = [];
    if ($regenerate) {
        session_regenerate_id(true);
    }
    $token = bin2hex(random_bytes(32));
    $_SESSION['csrf_token'] = $token;
    return $token;
}

function webSetAuthenticatedSession(string $apiToken, array $user): string
{
    webSessionStart();
    session_regenerate_id(true);
    $_SESSION = [
        'api_token' => $apiToken,
        'user_id' => (int)$user['id'],
        'user' => webSafeUser($user),
        'csrf_token' => bin2hex(random_bytes(32)),
    ];
    return (string)$_SESSION['csrf_token'];
}

function webSessionToken(): ?string
{
    webSessionStart();
    $token = $_SESSION['api_token'] ?? null;
    return is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token) === 1 ? $token : null;
}

function webOpenDatabase(): array
{
    /** @var array{0: PDO, 1: string} $database */
    $database = database();
    return [$database[0], $database[1]];
}

function webStoredSessionUser(PDO $pdo, string $prefix, string $token): ?array
{
    ensureSessions($pdo, $prefix);
    $stmt = $pdo->prepare("SELECT u.id, u.name, u.email, u.role, u.status, u.platform_admin, u.barbershop_id
        FROM `{$prefix}sessions` s
        INNER JOIN `{$prefix}users` u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'active'
        LIMIT 1");
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    return is_array($user) ? webSafeUser($user) : null;
}

/**
 * Validate a PHP-session bearer without holding the PHP session lock during DB
 * work. Invalid credentials are removed in a fresh short session transaction.
 *
 * @return array{pdo: PDO, prefix: string, token: string, user: array<string,mixed>}
 */
function webAuthenticatedContext(bool $csrf = false): array
{
    webSessionStart();
    if ($csrf && !webCsrfIsValid()) {
        webSessionClose();
        webError('csrf_invalid', 403);
    }
    $token = webSessionToken();
    webSessionClose();
    if ($token === null) {
        webError('unauthorized', 401);
    }

    [$pdo, $prefix] = webOpenDatabase();
    $user = webStoredSessionUser($pdo, $prefix, $token);
    if ($user === null) {
        webClearAuthentication();
        webSessionClose();
        webError('unauthorized', 401);
    }
    return ['pdo' => $pdo, 'prefix' => $prefix, 'token' => $token, 'user' => $user];
}

/** @return array<string, mixed> */
function webReadJsonBody(): array
{
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > BARBERSHOP_WEB_MAX_BODY_BYTES) {
        webError('request_too_large', 413);
    }
    $raw = file_get_contents('php://input', false, null, 0, BARBERSHOP_WEB_MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > BARBERSHOP_WEB_MAX_BODY_BYTES) {
        webError('invalid_body', 400);
    }
    if (trim($raw) === '') {
        webError('invalid_json', 400);
    }
    try {
        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        webError('invalid_json', 400);
    }
    if (!is_array($decoded)) {
        webError('invalid_json', 400);
    }
    return $decoded;
}

function webRateLimitDirectory(): ?string
{
    $config = webConfig();
    $configured = $config['security']['rate_limit_dir'] ?? null;
    if (is_string($configured) && $configured !== '' && $configured[0] === '/') {
        $directory = rtrim($configured, '/');
    } else {
        $directory = rtrim(sys_get_temp_dir(), '/') . '/barbershop-web-rate-' . hash('sha256', __DIR__);
    }
    $docroot = realpath(__DIR__) ?: __DIR__;
    $resolvedParent = realpath(dirname($directory));
    if ($directory === __DIR__ || str_starts_with($directory, __DIR__ . '/')
        || ($resolvedParent !== false && ($resolvedParent === $docroot || str_starts_with($resolvedParent, $docroot . '/')))) {
        return null;
    }
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        return null;
    }
    @chmod($directory, 0700);
    return $directory;
}

/**
 * Temporary rate-limit state contains timestamps only. Identifiers are HMAC
 * hashed and neither email addresses nor IPs are written to the file system.
 */
function webRateLimitAllowed(string $bucket, array $identifiers, int $maxAttempts, int $windowSeconds): bool
{
    $directory = webRateLimitDirectory();
    if ($directory === null) {
        return false;
    }
    $config = webConfig();
    $secret = (string)($config['security']['app_key'] ?? 'barbershop-web-rate-limit');
    $values = [];
    foreach ($identifiers as $identifier) {
        $values[] = hash_hmac('sha256', (string)$identifier, $secret);
    }
    $file = $directory . '/' . hash('sha256', $bucket . '|' . implode('|', $values)) . '.rate';
    $handle = @fopen($file, 'c+b');
    if (!is_resource($handle) || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        return false;
    }

    $now = time();
    $raw = stream_get_contents($handle);
    $timestamps = [];
    foreach (preg_split('/\s+/', trim((string)$raw)) ?: [] as $value) {
        if (ctype_digit($value) && (int)$value > $now - $windowSeconds) {
            $timestamps[] = (int)$value;
        }
    }
    $allowed = count($timestamps) < $maxAttempts;
    if ($allowed) {
        $timestamps[] = $now;
    }
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, implode("\n", $timestamps));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $allowed;
}

function webClientIdentifier(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function webTrustedBaseUrl(): ?string
{
    $base = webConfig()['app']['base_url'] ?? null;
    if (!is_string($base) || trim($base) === '') {
        return null;
    }
    $base = rtrim(trim($base), '/');
    $parts = parse_url($base);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return null;
    }
    if (!in_array(strtolower((string)$parts['scheme']), ['http', 'https'], true)
        || isset($parts['user'], $parts['pass'], $parts['query'], $parts['fragment'])) {
        return null;
    }
    return $base;
}

function webMailFrom(): ?string
{
    $config = webConfig();
    $configured = $config['mail']['from'] ?? null;
    if (is_string($configured) && filter_var($configured, FILTER_VALIDATE_EMAIL) !== false) {
        return $configured;
    }
    $base = webTrustedBaseUrl();
    if ($base === null) {
        return null;
    }
    $host = parse_url($base, PHP_URL_HOST);
    if (!is_string($host) || $host === '') {
        return null;
    }
    $candidate = 'no-reply@' . $host;
    if (filter_var($candidate, FILTER_VALIDATE_EMAIL) !== false) {
        return $candidate;
    }
    // Localhost-style addresses are useful only for the explicit synthetic
    // file transport; never use them with the production mail() transport.
    return webMailTestPath() !== null && preg_match('/^[A-Za-z0-9.-]+$/', $host) === 1
        ? $candidate
        : null;
}

function webMailTestPath(): ?string
{
    $configured = getenv('BARBER_MAIL_TEST_FILE');
    if (!is_string($configured) || trim($configured) === '' || $configured[0] !== '/') {
        return null;
    }
    $path = rtrim(trim($configured), '/');
    $docroot = realpath(__DIR__) ?: __DIR__;
    $resolvedParent = realpath(dirname($path));
    if ($path === __DIR__ || str_starts_with($path, __DIR__ . '/')
        || ($resolvedParent !== false && ($resolvedParent === $docroot || str_starts_with($resolvedParent, $docroot . '/')))) {
        return null;
    }
    return $path;
}

function webMailEnabled(): bool
{
    if (webMailTestPath() !== null) return true;
    $config = webConfig();
    if (($config['mail']['enabled'] ?? true) === false) return false;
    $mail = is_array($config['mail'] ?? null) ? $config['mail'] : [];
    return webMailFrom() !== null && (trim((string)($mail['smtp_host'] ?? '')) !== '' || function_exists('mail'));
}

function webResetLink(string $token): ?string
{
    $base = webTrustedBaseUrl();
    if ($base === null) {
        return null;
    }
    return $base . '/index.php?view=reset#token=' . rawurlencode($token);
}

function webSmtpSend(string $recipient, string $subject, string $body): bool
{
    $config = webConfig(); $mail = is_array($config['mail'] ?? null) ? $config['mail'] : [];
    $host = trim((string)($mail['smtp_host'] ?? '')); $user = trim((string)($mail['smtp_username'] ?? '')); $pass = (string)($mail['smtp_password'] ?? '');
    $port = (int)($mail['smtp_port'] ?? 465); $secure = strtolower(trim((string)($mail['smtp_secure'] ?? 'ssl')));
    if ($host === '' || $user === '' || $pass === '' || !in_array($secure, ['ssl', 'tls'], true)) return false;
    $remote = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $socket = @stream_socket_client($remote, $errno, $errstr, 12, STREAM_CLIENT_CONNECT);
    if (!is_resource($socket)) return false;
    stream_set_timeout($socket, 12);
    $read = static function () use ($socket): string { $out = ''; while (($line = fgets($socket, 515)) !== false) { $out .= $line; if (isset($line[3]) && $line[3] === ' ') break; } return $out; };
    $send = static function (string $command) use ($socket, $read): bool { fwrite($socket, $command . "\r\n"); $reply = $read(); return preg_match('/^[245][0-9]{2}/m', $reply) === 1; };
    $greeting = $read();
    if (!preg_match('/^2[0-9]{2}/m', $greeting)) { fclose($socket); return false; }
    $domain = parse_url(webTrustedBaseUrl() ?: 'https://localhost', PHP_URL_HOST) ?: 'localhost';
    if (!$send('EHLO ' . $domain)) { fclose($socket); return false; }
    if ($secure === 'tls') { if (!$send('STARTTLS') || !@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) || !$send('EHLO ' . $domain)) { fclose($socket); return false; } }
    fwrite($socket, 'AUTH LOGIN\r\n');
    if (preg_match('/^334/m', $read()) !== 1) { fclose($socket); return false; }
    fwrite($socket, base64_encode($user) . "\r\n");
    if (preg_match('/^334/m', $read()) !== 1) { fclose($socket); return false; }
    fwrite($socket, base64_encode($pass) . "\r\n");
    if (preg_match('/^235/m', $read()) !== 1) { fclose($socket); return false; }
    $from = webMailFrom(); if ($from === null || !$send('MAIL FROM:<' . $from . '>') || !$send('RCPT TO:<' . $recipient . '>') || !$send('DATA')) { fclose($socket); return false; }
    $safeSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers = 'From: ' . $from . "\r\n" . 'To: ' . $recipient . "\r\n" . 'Subject: ' . $safeSubject . "\r\n" . 'Content-Type: text/plain; charset=UTF-8\r\n' . 'Content-Transfer-Encoding: 8bit\r\n';
    $payload = preg_replace('/\r?\n/', "\r\n", $headers . "\r\n" . $body) ?? ($headers . "\r\n" . $body);
    $payload = preg_replace('/^\./m', '..', $payload) ?? $payload;
    fwrite($socket, $payload . "\r\n.\r\n"); $accepted = preg_match('/^2[0-9]{2}/m', $read()) === 1; $send('QUIT'); fclose($socket); return $accepted;
}

function webSendResetMail(string $recipient, string $token, string $name): bool
{
    $link = webResetLink($token);
    $from = webMailFrom();
    if ($link === null || $from === null) {
        return false;
    }
    $safeName = trim($name) !== '' ? trim($name) : 'cliente';
    $subject = 'Recuperacao de senha - Barber Shop';
    $body = "Ola {$safeName},\n\n"
        . "Recebemos uma solicitacao para redefinir sua senha. Use o link abaixo em ate "
        . BARBERSHOP_WEB_RESET_MINUTES . " minutos:\n\n"
        . $link . "\n\n"
        . "Se voce nao solicitou isso, ignore esta mensagem.\n";
    $testPath = webMailTestPath();
    if ($testPath !== null) {
        $parent = dirname($testPath);
        if (!is_dir($parent) && !@mkdir($parent, 0700, true) && !is_dir($parent)) {
            return false;
        }
        // This transport is opt-in and intended only for synthetic local tests.
        $record = json_encode([
            'to' => $recipient,
            'from' => $from,
            'subject' => $subject,
            'body' => $body,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($record === false) {
            return false;
        }
        return @file_put_contents($testPath, $record . "\n", FILE_APPEND | LOCK_EX) !== false;
    }
    $mail = webConfig()['mail'] ?? [];
    if (is_array($mail) && trim((string)($mail['smtp_host'] ?? '')) !== '') {
        return webSmtpSend($recipient, $subject, $body);
    }
    $headers = 'From: ' . $from . "\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    return @mail($recipient, $subject, $body, $headers);
}

function webEnsurePasswordResets(PDO $pdo, string $prefix): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS `{$prefix}password_resets` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `user_id` BIGINT UNSIGNED NOT NULL,
        `token_hash` CHAR(64) NOT NULL,
        `expires_at` DATETIME NOT NULL,
        `used_at` DATETIME NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uq_{$prefix}password_resets_token` (`token_hash`),
        KEY `idx_{$prefix}password_resets_user` (`user_id`),
        KEY `idx_{$prefix}password_resets_expiry` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function webGenericForgotResponse(bool $emailEnabled): never
{
    webJsonResponse([
        'ok' => true,
        'message' => 'Se houver uma conta ativa com esse e-mail e o serviço estiver habilitado, enviaremos instruções de recuperação.',
        'email_enabled' => $emailEnabled,
    ]);
}

function webValidateNewPassword(mixed $value, mixed $confirmation): string
{
    if (!is_string($value) || !is_string($confirmation) || strlen($value) < 8 || strlen($value) > 4096) {
        webError('invalid_password', 422);
    }
    if (!hash_equals($value, $confirmation)) {
        webError('password_confirmation_mismatch', 422);
    }
    return $value;
}
