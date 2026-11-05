<?php
declare(strict_types=1);

require_once __DIR__ . '/web-common.php';
if (!defined('BARBERSHOP_API_LIBRARY')) {
    define('BARBERSHOP_API_LIBRARY', true);
}
require_once __DIR__ . '/api.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function webRollbackError(PDO $pdo, string $error, int $status): never
{
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    webError($error, $status);
}

function webHandleSession(): never
{
    webRequireMethod('GET');
    webSessionStart();
    $csrf = webEnsureCsrf();
    $token = webSessionToken();
    webSessionClose();

    if ($token === null) {
        webJsonResponse(['ok' => true, 'user' => null, 'csrf' => $csrf]);
    }

    [$pdo, $prefix] = webOpenDatabase();
    $user = webStoredSessionUser($pdo, $prefix, $token);
    if ($user === null) {
        $csrf = webClearAuthentication();
        webSessionClose();
        webJsonResponse(['ok' => true, 'user' => null, 'csrf' => $csrf]);
    }
    webJsonResponse(['ok' => true, 'user' => $user, 'csrf' => $csrf]);
}

function webHandleLogin(): never
{
    webRequireMethod('POST');
    webSessionStart();
    webEnsureCsrf();
    if (!webCsrfIsValid()) {
        webSessionClose();
        webError('csrf_invalid', 403);
    }
    webSessionClose();

    $data = webReadJsonBody();
    $email = is_string($data['email'] ?? null) ? strtolower(trim((string)$data['email'])) : '';
    $password = is_string($data['password'] ?? null) ? (string)$data['password'] : '';
    if ($email === '' || strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false
        || $password === '' || strlen($password) > 4096) {
        webError('invalid_credentials', 422);
    }

    if (!webRateLimitAllowed('login', [$email, webClientIdentifier()], 8, 900)) {
        webError('rate_limited', 429);
    }

    [$pdo, $prefix] = webOpenDatabase();
    $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status, platform_admin
        FROM `{$prefix}users` WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!is_array($user) || (string)$user['status'] !== 'active'
        || !password_verify($password, (string)$user['password_hash'])) {
        webError('invalid_credentials', 401);
    }

    ensureSessions($pdo, $prefix);
    $apiToken = bin2hex(random_bytes(32));
    $session = $pdo->prepare("INSERT INTO `{$prefix}sessions`
        (user_id, token_hash, expires_at)
        VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))");
    $session->execute([(int)$user['id'], hash('sha256', $apiToken)]);
    $safeUser = webSafeUser($user);
    $csrf = webSetAuthenticatedSession($apiToken, $safeUser);
    webSessionClose();
    webJsonResponse(['ok' => true, 'user' => $safeUser, 'csrf' => $csrf]);
}

function webHandlePlatformDashboard(): never
{
    webRequireMethod('GET');
    $context = webAuthenticatedContext();
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    $table = $prefix . 'subscriptions';
    $exists = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $exists->execute([$table]);
    if ((int)$exists->fetchColumn() !== 1) {
        webError('billing_not_ready', 503);
    }
    $pdo->exec("UPDATE `{$table}` SET status = 'expired'
        WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= UTC_TIMESTAMP()");

    $scalar = static function (PDO $pdo, string $sql): int {
        return (int)$pdo->query($sql)->fetchColumn();
    };
    $metrics = [
        'barbershops' => $scalar($pdo, "SELECT COUNT(*) FROM `{$prefix}barbershops`"),
        'active_barbers' => $scalar($pdo, "SELECT COUNT(*) FROM `{$prefix}users` WHERE role = 'barber' AND status = 'active'"),
        'active_clients' => $scalar($pdo, "SELECT COUNT(*) FROM `{$prefix}users` WHERE role = 'client' AND status = 'active'"),
        'trialing' => $scalar($pdo, "SELECT COUNT(*) FROM `{$table}` WHERE status = 'trialing' AND (trial_ends_at IS NULL OR trial_ends_at > UTC_TIMESTAMP())"),
        'active_subscriptions' => $scalar($pdo, "SELECT COUNT(*) FROM `{$table}` WHERE status = 'active'"),
        'past_due' => $scalar($pdo, "SELECT COUNT(*) FROM `{$table}` WHERE status = 'past_due'"),
        'expired' => $scalar($pdo, "SELECT COUNT(*) FROM `{$table}` WHERE status = 'expired' OR (status = 'trialing' AND trial_ends_at <= UTC_TIMESTAMP())"),
    ];

    $statusStmt = $pdo->query("SELECT status, COUNT(*) AS total FROM `{$table}` GROUP BY status ORDER BY status");
    $statusCounts = [];
    foreach ($statusStmt->fetchAll() as $row) {
        $statusCounts[(string)$row['status']] = (int)$row['total'];
    }

    $trialStmt = $pdo->query("SELECT s.id, s.barbershop_id, b.name AS barbershop_name,
            s.status, s.trial_started_at, s.trial_ends_at, s.current_period_end,
            p.code AS plan_code, p.name AS plan_name
        FROM `{$table}` s
        LEFT JOIN `{$prefix}barbershops` b ON b.id = s.barbershop_id
        LEFT JOIN `{$prefix}plans` p ON p.id = s.plan_id
        WHERE s.status IN ('trialing','past_due')
        ORDER BY COALESCE(s.trial_ends_at, s.current_period_end) ASC, s.id ASC LIMIT 25");
    $upcoming = [];
    foreach ($trialStmt->fetchAll() as $row) {
        $upcoming[] = [
            'id' => (int)$row['id'],
            'barbershop_id' => (int)$row['barbershop_id'],
            'barbershop_name' => (string)($row['barbershop_name'] ?? 'Barbearia sem nome'),
            'status' => (string)$row['status'],
            'trial_started_at' => $row['trial_started_at'],
            'trial_ends_at' => $row['trial_ends_at'],
            'current_period_end' => $row['current_period_end'],
            'plan_code' => $row['plan_code'],
            'plan_name' => $row['plan_name'],
        ];
    }
    webJsonResponse(['ok' => true, 'metrics' => $metrics, 'status_counts' => $statusCounts, 'upcoming' => $upcoming]);
}

function webHandlePlatformPlans(): never
{
    webRequireMethod('GET');
    $context = webAuthenticatedContext();
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    $table = $prefix . 'plans';
    $exists = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $exists->execute([$table]);
    if ((int)$exists->fetchColumn() !== 1) {
        webError('billing_not_ready', 503);
    }
    $plans = [];
    foreach ($pdo->query("SELECT id, code, name, description, price_cents, billing_interval, trial_days
        FROM `{$table}` WHERE active = 1 ORDER BY price_cents IS NULL, price_cents, id") as $row) {
        $plans[] = [
            'id' => (int)$row['id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
            'description' => $row['description'],
            'price_cents' => $row['price_cents'] === null ? null : (int)$row['price_cents'],
            'billing_interval' => (string)$row['billing_interval'],
            'trial_days' => (int)$row['trial_days'],
        ];
    }
    $barbershops = [];
    foreach ($pdo->query("SELECT id, name FROM `{$prefix}barbershops` ORDER BY name, id") as $row) {
        $barbershops[] = ['id' => (int)$row['id'], 'name' => (string)$row['name']];
    }
    $payment = webConfig()['payment'] ?? [];
    $apiKey = trim((string)($payment['api_key'] ?? ''));
    $webhookToken = trim((string)($payment['webhook_token'] ?? ''));
    $configured = $apiKey !== '' && !str_contains($apiKey, 'PREENCHA_')
        && $webhookToken !== '' && !str_contains($webhookToken, 'GERE_');
    webJsonResponse([
        'ok' => true,
        'provider' => (string)($payment['provider'] ?? 'asaas'),
        'environment' => (string)($payment['environment'] ?? 'sandbox'),
        'payment_configured' => $configured,
        'plans' => $plans,
        'barbershops' => $barbershops,
    ]);
}

function webHandlePlatformCustomers(): never
{
    webRequireMethod('GET');
    $context = webAuthenticatedContext();
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    $sql = "SELECT b.id, b.name, b.phone, b.address, b.created_at,
            s.status AS subscription_status, s.trial_ends_at, s.current_period_end,
            p.name AS plan_name, p.price_cents,
            (SELECT COUNT(*) FROM `{$prefix}users` WHERE role = 'barber' AND status = 'active') AS active_barbers,
            (SELECT COUNT(*) FROM `{$prefix}users` WHERE role = 'client' AND status = 'active') AS active_clients
        FROM `{$prefix}barbershops` b
        LEFT JOIN `{$prefix}subscriptions` s ON s.id = (
            SELECT s2.id FROM `{$prefix}subscriptions` s2 WHERE s2.barbershop_id = b.id ORDER BY s2.id DESC LIMIT 1
        )
        LEFT JOIN `{$prefix}plans` p ON p.id = s.plan_id
        ORDER BY b.created_at DESC, b.id DESC";
    $customers = [];
    foreach ($pdo->query($sql) as $row) {
        $customers[] = [
            'id' => (int)$row['id'],
            'name' => (string)$row['name'],
            'phone' => $row['phone'] === null ? null : (string)$row['phone'],
            'address' => $row['address'] === null ? null : (string)$row['address'],
            'created_at' => $row['created_at'],
            'subscription_status' => $row['subscription_status'] === null ? 'without_subscription' : (string)$row['subscription_status'],
            'trial_ends_at' => $row['trial_ends_at'],
            'current_period_end' => $row['current_period_end'],
            'plan_name' => $row['plan_name'],
            'price_cents' => $row['price_cents'] === null ? null : (int)$row['price_cents'],
            'active_barbers' => (int)$row['active_barbers'],
            'active_clients' => (int)$row['active_clients'],
            'counts_scope' => 'current_database',
        ];
    }
    webJsonResponse(['ok' => true, 'customers' => $customers]);
}

function webHandlePlatformCustomerSave(): never
{
    webRequireMethod('POST');
    $context = webAuthenticatedContext(true);
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $data = webReadJsonBody();
    $name = is_string($data['name'] ?? null) ? trim($data['name']) : '';
    $phone = is_string($data['phone'] ?? null) ? trim($data['phone']) : '';
    $address = is_string($data['address'] ?? null) ? trim($data['address']) : '';
    $ownerName = is_string($data['owner_name'] ?? null) ? trim($data['owner_name']) : '';
    $ownerEmail = is_string($data['owner_email'] ?? null) ? strtolower(trim($data['owner_email'])) : '';
    $ownerPassword = is_string($data['owner_password'] ?? null) ? $data['owner_password'] : '';
    if ($name === '' || strlen($name) > 180 || strlen($phone) > 40 || strlen($address) > 255
        || $ownerName === '' || strlen($ownerName) > 160 || filter_var($ownerEmail, FILTER_VALIDATE_EMAIL) === false
        || strlen($ownerEmail) > 190 || strlen($ownerPassword) < 8 || strlen($ownerPassword) > 4096) {
        webError('invalid_platform_customer', 422);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    try {
        $pdo->beginTransaction();
        $check = $pdo->prepare("SELECT id FROM `{$prefix}users` WHERE email = ? LIMIT 1");
        $check->execute([$ownerEmail]);
        if ($check->fetch()) {
            $pdo->rollBack();
            webError('email_already_exists', 409);
        }
        $shop = $pdo->prepare("INSERT INTO `{$prefix}barbershops` (name, phone, address) VALUES (?, ?, ?)");
        $shop->execute([$name, $phone !== '' ? $phone : null, $address !== '' ? $address : null]);
        $barbershopId = (int)$pdo->lastInsertId();
        $owner = $pdo->prepare("INSERT INTO `{$prefix}users` (name, email, password_hash, role, status, platform_admin) VALUES (?, ?, ?, 'admin', 'active', 0)");
        $owner->execute([$ownerName, $ownerEmail, password_hash($ownerPassword, PASSWORD_DEFAULT)]);
        $trial = $pdo->prepare("INSERT INTO `{$prefix}subscriptions` (barbershop_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trialing', UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))");
        $trial->execute([$barbershopId]);
        $pdo->commit();
        webJsonResponse(['ok' => true, 'barbershop_id' => $barbershopId], 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $exception;
    }
}

function webHandlePlatformPlanSave(): never
{
    webRequireMethod('POST');
    $context = webAuthenticatedContext(true);
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $data = webReadJsonBody();
    $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: null;
    $code = is_string($data['code'] ?? null) ? strtolower(trim($data['code'])) : '';
    $name = is_string($data['name'] ?? null) ? trim($data['name']) : '';
    $description = is_string($data['description'] ?? null) ? trim($data['description']) : '';
    $interval = is_string($data['billing_interval'] ?? null) ? $data['billing_interval'] : 'month';
    $price = filter_var($data['price_cents'] ?? null, FILTER_VALIDATE_INT);
    $trialDays = filter_var($data['trial_days'] ?? 0, FILTER_VALIDATE_INT);
    $active = !empty($data['active']) ? 1 : 0;
    if (preg_match('/^[a-z0-9][a-z0-9_-]{1,63}$/', $code) !== 1 || $name === '' || strlen($name) > 120
        || strlen($description) > 500 || !in_array($interval, ['month', 'year'], true)
        || $price === false || $price < 1 || $price > 2147483647 || $trialDays === false || $trialDays < 0 || $trialDays > 30) {
        webError('invalid_plan', 422);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    try {
        if ($id !== null) {
            $stmt = $pdo->prepare("UPDATE `{$prefix}plans`
                SET code = ?, name = ?, description = ?, price_cents = ?, billing_interval = ?, trial_days = ?, active = ?
                WHERE id = ?");
            $stmt->execute([$code, $name, $description !== '' ? $description : null, $price, $interval, $trialDays, $active, $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO `{$prefix}plans`
                (code, name, description, price_cents, billing_interval, trial_days, active)
                VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$code, $name, $description !== '' ? $description : null, $price, $interval, $trialDays, $active]);
            $id = (int)$pdo->lastInsertId();
        }
    } catch (PDOException $exception) {
        if ((string)($exception->errorInfo[0] ?? '') === '23000') {
            webError('plan_code_exists', 409);
        }
        throw $exception;
    }
    webJsonResponse(['ok' => true, 'id' => $id]);
}

function webHandlePlatformCheckout(): never
{
    webRequireMethod('POST');
    $context = webAuthenticatedContext(true);
    if (!(bool)($context['user']['platform_admin'] ?? false)) {
        webError('forbidden', 403);
    }
    $data = webReadJsonBody();
    $barbershopId = filter_var($data['barbershop_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $planId = filter_var($data['plan_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $customerName = is_string($data['customer_name'] ?? null) ? trim($data['customer_name']) : '';
    $customerEmail = is_string($data['customer_email'] ?? null) ? strtolower(trim($data['customer_email'])) : '';
    if ($barbershopId === false || $planId === false || $customerName === '' || strlen($customerName) > 160
        || strlen($customerEmail) > 190 || filter_var($customerEmail, FILTER_VALIDATE_EMAIL) === false) {
        webError('invalid_checkout_request', 422);
    }
    $config = webConfig();
    $payment = $config['payment'] ?? [];
    $apiKey = trim((string)($payment['api_key'] ?? ''));
    if ($apiKey === '' || str_contains($apiKey, 'PREENCHA_')) {
        webError('payment_not_configured', 503);
    }
    $baseUrl = webTrustedBaseUrl();
    if ($baseUrl === null) {
        webError('payment_not_configured', 503);
    }
    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    $planStmt = $pdo->prepare("SELECT id, name, description, price_cents, billing_interval, trial_days
        FROM `{$prefix}plans` WHERE id = ? AND active = 1 LIMIT 1");
    $planStmt->execute([$planId]);
    $plan = $planStmt->fetch();
    if (!is_array($plan) || (int)$plan['price_cents'] < 1) {
        webError('invalid_plan', 422);
    }
    $shopStmt = $pdo->prepare("SELECT id FROM `{$prefix}barbershops` WHERE id = ? LIMIT 1");
    $shopStmt->execute([$barbershopId]);
    if (!is_array($shopStmt->fetch())) {
        webError('barbershop_not_found', 404);
    }
    $cycle = (string)$plan['billing_interval'] === 'year' ? 'YEARLY' : 'MONTHLY';
    $due = new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo'));
    $trialDays = max(0, (int)$plan['trial_days']);
    if ($trialDays > 0) {
        $due = $due->modify('+' . $trialDays . ' days');
    }
    $payload = [
        'billingTypes' => ['CREDIT_CARD'],
        'chargeTypes' => ['RECURRENT'],
        'minutesToExpire' => 1440,
        'callback' => [
            'successUrl' => $baseUrl . '/?view=account&payment=success',
            'cancelUrl' => $baseUrl . '/?view=account&payment=cancelled',
            'expiredUrl' => $baseUrl . '/?view=account&payment=expired',
        ],
        'items' => [[
            'name' => (string)$plan['name'],
            'description' => (string)($plan['description'] ?: 'Assinatura Barber Shop'),
            'quantity' => 1,
            'value' => ((int)$plan['price_cents']) / 100,
        ]],
        'subscription' => [
            'cycle' => $cycle,
            'nextDueDate' => $due->format('Y-m-d H:i:s'),
        ],
        'customerData' => [
            'name' => $customerName,
            'email' => $customerEmail,
        ],
    ];
    $ch = curl_init(rtrim((string)($payment['base_url'] ?? 'https://api-sandbox.asaas.com'), '/') . '/v3/checkouts');
    if ($ch === false) {
        webError('payment_provider_error', 502);
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'access_token: ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $responseData = is_string($response) ? json_decode($response, true) : null;
    $checkoutId = is_array($responseData) && is_string($responseData['id'] ?? null) ? trim($responseData['id']) : '';
    if ($httpCode < 200 || $httpCode >= 300 || $checkoutId === '') {
        webError('payment_provider_error', 502);
    }
    $checkoutBase = rtrim((string)($payment['checkout_base_url'] ?? 'https://asaas.com'), '/');
    $checkoutUrl = $checkoutBase . '/checkoutSession/show?id=' . rawurlencode($checkoutId);
    $update = $pdo->prepare("UPDATE `{$prefix}subscriptions`
        SET plan_id = ?, provider = 'asaas', provider_checkout_id = ?, provider_checkout_url = ?
        WHERE barbershop_id = ? AND status IN ('trialing','active','past_due')");
    $update->execute([$planId, $checkoutId, $checkoutUrl, $barbershopId]);
    webJsonResponse(['ok' => true, 'checkout_url' => $checkoutUrl]);
}

function webHandleLogout(): never
{
    webRequireMethod('POST');
    webSessionStart();
    if (!webCsrfIsValid()) {
        webSessionClose();
        webError('csrf_invalid', 403);
    }
    $token = webSessionToken();
    webSessionClose();

    if ($token !== null) {
        [$pdo, $prefix] = webOpenDatabase();
        ensureSessions($pdo, $prefix);
        $stmt = $pdo->prepare("DELETE FROM `{$prefix}sessions` WHERE token_hash = ?");
        $stmt->execute([hash('sha256', $token)]);
    }
    $csrf = webClearAuthentication();
    webSessionClose();
    webJsonResponse(['ok' => true, 'user' => null, 'csrf' => $csrf]);
}

function webHandlePasswordChange(): never
{
    webRequireMethod('POST');
    $context = webAuthenticatedContext(true);
    $data = webReadJsonBody();
    $currentPassword = $data['current_password'] ?? null;
    if (!is_string($currentPassword) || $currentPassword === '' || strlen($currentPassword) > 4096) {
        webError('invalid_current_password', 422);
    }
    $newPassword = webValidateNewPassword(
        $data['new_password'] ?? null,
        $data['new_password_confirm'] ?? null
    );

    $pdo = $context['pdo'];
    $prefix = $context['prefix'];
    $userId = (int)$context['user']['id'];
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("SELECT id, password_hash, role, email, status
            FROM `{$prefix}users` WHERE id = ? LIMIT 1 FOR UPDATE");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!is_array($user) || (string)$user['status'] !== 'active'
            || !password_verify($currentPassword, (string)$user['password_hash'])) {
            webRollbackError($pdo, 'current_password_invalid', 403);
        }
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        if (!is_string($newHash) || $newHash === '') {
            webRollbackError($pdo, 'internal_error', 500);
        }
        $update = $pdo->prepare("UPDATE `{$prefix}users` SET password_hash = ? WHERE id = ?");
        $update->execute([$newHash, $userId]);
        // Password changes revoke every API bearer for the account, including
        // the bearer held by this web session.
        $revoke = $pdo->prepare("DELETE FROM `{$prefix}sessions` WHERE user_id = ?");
        $revoke->execute([$userId]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    $csrf = webClearAuthentication();
    webSessionClose();
    webJsonResponse(['ok' => true, 'require_login' => true, 'csrf' => $csrf]);
}

function webHandleForgotPassword(): never
{
    webRequireMethod('POST');
    webSessionStart();
    if (!webCsrfIsValid()) {
        webSessionClose();
        webError('csrf_invalid', 403);
    }
    webSessionClose();

    $emailEnabled = webMailEnabled();
    $data = webReadJsonBody();
    $email = is_string($data['email'] ?? null) ? strtolower(trim((string)$data['email'])) : '';
    if (!webRateLimitAllowed('forgot', [$email, webClientIdentifier()], 5, 900)) {
        webError('rate_limited', 429);
    }
    if ($email === '' || strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        webGenericForgotResponse($emailEnabled);
    }

    [$pdo, $prefix] = webOpenDatabase();
    webEnsurePasswordResets($pdo, $prefix);
    $token = null;
    $tokenHash = null;
    $recipient = null;
    $name = '';
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("SELECT id, name, email FROM `{$prefix}users`
            WHERE email = ? AND status = 'active' LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (is_array($user) && $emailEnabled) {
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $invalidate = $pdo->prepare("UPDATE `{$prefix}password_resets`
                SET used_at = UTC_TIMESTAMP()
                WHERE user_id = ? AND used_at IS NULL");
            $invalidate->execute([(int)$user['id']]);
            $insert = $pdo->prepare("INSERT INTO `{$prefix}password_resets`
                (user_id, token_hash, expires_at)
                VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL " . BARBERSHOP_WEB_RESET_MINUTES . " MINUTE))");
            $insert->execute([(int)$user['id'], $tokenHash]);
            $recipient = (string)$user['email'];
            $name = (string)$user['name'];
        }
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    if ($token !== null && $tokenHash !== null && $recipient !== null) {
        $sent = webSendResetMail($recipient, $token, $name);
        if (!$sent) {
            // Do not leave a usable token when the configured transport failed.
            $delete = $pdo->prepare("DELETE FROM `{$prefix}password_resets`
                WHERE token_hash = ? AND used_at IS NULL");
            $delete->execute([$tokenHash]);
        }
    }
    // The opaque token is never included in the JSON response or application log.
    unset($token, $tokenHash, $recipient, $name);
    webGenericForgotResponse($emailEnabled);
}

function webHandleResetPassword(): never
{
    webRequireMethod('POST');
    webSessionStart();
    if (!webCsrfIsValid()) {
        webSessionClose();
        webError('csrf_invalid', 403);
    }
    webSessionClose();

    $data = webReadJsonBody();
    $token = is_string($data['token'] ?? null) ? trim((string)$data['token']) : '';
    if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
        webError('invalid_reset_token', 422);
    }
    $newPassword = webValidateNewPassword(
        $data['new_password'] ?? null,
        $data['new_password_confirm'] ?? null
    );
    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
    if (!is_string($newHash) || $newHash === '') {
        webError('internal_error', 500);
    }

    [$pdo, $prefix] = webOpenDatabase();
    webEnsurePasswordResets($pdo, $prefix);
    $tokenHash = hash('sha256', $token);
    try {
        $pdo->beginTransaction();
        $resetStmt = $pdo->prepare("SELECT id, user_id, expires_at, used_at
            FROM `{$prefix}password_resets`
            WHERE token_hash = ? LIMIT 1 FOR UPDATE");
        $resetStmt->execute([$tokenHash]);
        $reset = $resetStmt->fetch();
        if (!is_array($reset) || $reset['used_at'] !== null
            || strtotime((string)$reset['expires_at'] . ' UTC') <= time()) {
            webRollbackError($pdo, 'invalid_reset_token', 422);
        }

        $userStmt = $pdo->prepare("SELECT id, status FROM `{$prefix}users`
            WHERE id = ? LIMIT 1 FOR UPDATE");
        $userStmt->execute([(int)$reset['user_id']]);
        $user = $userStmt->fetch();
        if (!is_array($user) || (string)$user['status'] !== 'active') {
            webRollbackError($pdo, 'invalid_reset_token', 422);
        }
        $update = $pdo->prepare("UPDATE `{$prefix}users` SET password_hash = ? WHERE id = ?");
        $update->execute([$newHash, (int)$reset['user_id']]);
        $used = $pdo->prepare("UPDATE `{$prefix}password_resets`
            SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL");
        $used->execute([(int)$reset['id']]);
        if ($used->rowCount() !== 1) {
            webRollbackError($pdo, 'invalid_reset_token', 422);
        }
        $revoke = $pdo->prepare("DELETE FROM `{$prefix}sessions` WHERE user_id = ?");
        $revoke->execute([(int)$reset['user_id']]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }

    unset($token, $tokenHash, $newHash);
    $csrf = webClearAuthentication();
    webSessionClose();
    webJsonResponse(['ok' => true, 'require_login' => true, 'csrf' => $csrf]);
}

/**
 * All non-account actions go through the original API handlers. The bearer is
 * injected only server-side, and the PHP session is already closed.
 */
function webDelegateToApi(string $action): never
{
    $context = webAuthenticatedContext(webRequestMethod() !== 'GET');
    $_GET['action'] = $action;
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $context['token'];
    unset($context);
    runApi();
    exit;
}

function webDispatch(): never
{
    $rawAction = $_GET['action'] ?? 'session';
    $action = is_string($rawAction) ? trim($rawAction) : '';
    if ($action === '') {
        webError('not_found', 404);
    }

    switch ($action) {
        case 'session':
            webHandleSession();
        case 'login':
            webHandleLogin();
        case 'logout':
            webHandleLogout();
        case 'password_change':
        case 'change_password':
            webHandlePasswordChange();
        case 'forgot_password':
            webHandleForgotPassword();
        case 'reset_password':
            webHandleResetPassword();
        case 'platform_dashboard':
            webHandlePlatformDashboard();
        case 'platform_plans':
            webHandlePlatformPlans();
        case 'platform_customers':
            webHandlePlatformCustomers();
        case 'platform_customer_save':
            webHandlePlatformCustomerSave();
        case 'platform_plan_save':
            webHandlePlatformPlanSave();
        case 'platform_checkout':
            webHandlePlatformCheckout();
        default:
            webDelegateToApi($action);
    }
}

try {
    webDispatch();
} catch (Throwable) {
    webError('internal_error', 500);
}
