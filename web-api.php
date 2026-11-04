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
    $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status
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
        default:
            webDelegateToApi($action);
    }
}

try {
    webDispatch();
} catch (Throwable) {
    webError('internal_error', 500);
}
