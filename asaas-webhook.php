<?php
declare(strict_types=1);

require_once __DIR__ . '/web-common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (webRequestMethod() !== 'POST') {
    header('Allow: POST');
    webJsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

$config = webConfig();
$expectedToken = trim((string)($config['payment']['webhook_token'] ?? ''));
$receivedToken = trim((string)($_SERVER['HTTP_ASAAS_ACCESS_TOKEN'] ?? ''));
if ($expectedToken === '' || !hash_equals($expectedToken, $receivedToken)) {
    webJsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
}

$raw = file_get_contents('php://input', false, null, 0, BARBERSHOP_WEB_MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > BARBERSHOP_WEB_MAX_BODY_BYTES) {
    webJsonResponse(['ok' => false, 'error' => 'payload_too_large'], 413);
}
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    webJsonResponse(['ok' => false, 'error' => 'invalid_json'], 400);
}

$eventId = is_string($payload['id'] ?? null) ? trim($payload['id']) : '';
$eventName = is_string($payload['event'] ?? null) ? trim($payload['event']) : '';
if ($eventId === '' || $eventName === '') {
    webJsonResponse(['ok' => false, 'error' => 'invalid_event'], 422);
}

try {
    [$pdo, $prefix] = webOpenDatabase();
    $eventTable = $prefix . 'billing_events';
    $subscriptionTable = $prefix . 'subscriptions';
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $insert = $pdo->prepare("INSERT INTO `{$eventTable}`
        (provider, provider_event_id, event_type, barbershop_id, payload_json)
        VALUES ('asaas', ?, ?, NULL, ?)");
    try {
        $insert->execute([$eventId, $eventName, $payloadJson]);
    } catch (PDOException $exception) {
        if ((string)$exception->errorInfo[0] !== '23000') {
            throw $exception;
        }
        webJsonResponse(['ok' => true, 'duplicate' => true]);
    }

    $resource = is_array($payload['subscription'] ?? null)
        ? $payload['subscription']
        : (is_array($payload['payment'] ?? null) ? $payload['payment'] : []);
    $providerSubscriptionId = is_string($resource['id'] ?? null) && str_starts_with($eventName, 'SUBSCRIPTION_')
        ? trim($resource['id'])
        : (is_string($resource['subscription'] ?? null) ? trim($resource['subscription']) : '');
    $providerStatus = strtoupper((string)($resource['status'] ?? ''));
    $status = null;
    if (in_array($providerStatus, ['ACTIVE', 'RECEIVED', 'CONFIRMED'], true)) {
        $status = 'active';
    } elseif (in_array($providerStatus, ['OVERDUE', 'PENDING'], true)) {
        $status = 'past_due';
    } elseif (in_array($providerStatus, ['INACTIVE', 'CANCELED', 'CANCELLED'], true)) {
        $status = 'canceled';
    } elseif ($providerStatus === 'EXPIRED') {
        $status = 'expired';
    }
    if ($providerSubscriptionId !== '' && $status !== null) {
        $update = $pdo->prepare("UPDATE `{$subscriptionTable}`
            SET provider = 'asaas', provider_subscription_id = ?, status = ?
            WHERE provider_subscription_id = ?");
        $update->execute([$providerSubscriptionId, $status, $providerSubscriptionId]);
    }
    webJsonResponse(['ok' => true]);
} catch (Throwable) {
    webJsonResponse(['ok' => false, 'error' => 'internal_error'], 500);
}
