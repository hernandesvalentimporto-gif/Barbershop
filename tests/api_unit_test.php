<?php
declare(strict_types=1);

// This test intentionally loads only the pure validator functions. It does not
// set HTTP request data, open a database connection, or call the live API.
define('BARBERSHOP_API_LIBRARY', true);
require dirname(__DIR__) . '/api.php';

$checks = 0;

function check(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$validUser = apiValidateUserPayload([
    'name' => 'Cliente Local',
    'email' => 'cliente@example.test',
    'phone' => '(11) 99999-9999',
    'role' => 'client',
    'status' => 'active',
    'password' => 'strong-pass-8',
]);
check($validUser['ok'] === true, 'valid client payload is accepted');
check($validUser['email'] === apiInternalClientEmail((string)apiNormalizePhone('(11) 99999-9999')), 'client email is derived from normalized phone');

$adminUser = apiValidateUserPayload([
    'name' => 'Admin Attempt',
    'email' => 'admin@example.test',
    'role' => 'admin',
    'status' => 'active',
    'password' => 'strong-pass-8',
]);
check($adminUser['ok'] === false, 'admin role cannot be supplied to user_save');

$shortPassword = apiValidateUserPayload([
    'name' => 'Cliente Local',
    'phone' => '(11) 99999-1111',
    'email' => 'cliente2@example.test',
    'role' => 'client',
    'status' => 'active',
    'password' => 'short',
]);
check($shortPassword['ok'] === false && $shortPassword['error'] === 'invalid_password', 'new passwords require eight characters');

$validUpdate = apiValidateUserPayload([
    'name' => 'Barbeiro Atualizado',
    'status' => 'inactive',
], true, [
    'name' => 'Barbeiro',
    'email' => 'barber@example.test',
    'role' => 'barber',
    'status' => 'active',
]);
check($validUpdate['ok'] === true && $validUpdate['role'] === 'barber', 'updates preserve omitted safe fields');

$validService = apiValidateServicePayload([
    'name' => 'Corte',
    'duration_minutes' => 5,
    'price_cents' => 0,
    'active' => 1,
]);
check($validService['ok'] === true, 'service lower bounds are accepted');

$badService = apiValidateServicePayload([
    'name' => 'Corte',
    'duration_minutes' => 481,
    'price_cents' => 100000001,
    'active' => 1,
]);
check($badService['ok'] === false, 'service upper bounds are rejected');

$timezone = apiTimezone();
$future = new DateTimeImmutable('2026-11-04 08:00:00', $timezone);
$start = apiParseLocalDateTime('2026-11-04 09:00');
$end = apiParseLocalDateTime('2026-11-04 09:30:00');
check($start !== null && $end !== null, 'local date-time formats are parsed');
$window = apiValidateAppointmentWindow($start, 30, $end, $future);
check($window['ok'] === true, 'valid future appointment window is accepted');
check($window['starts_at'] === '2026-11-04 09:00:00' && $window['ends_at'] === '2026-11-04 09:30:00', 'appointment times remain local DATETIME values');

$outsideHours = apiValidateAppointmentWindow(
    apiParseLocalDateTime('2026-11-04 17:45'),
    30,
    null,
    $future
);
check($outsideHours['ok'] === false && $outsideHours['error'] === 'appointment_outside_hours', 'appointments cannot pass 18:00');

$busyWindow = [[
    'starts_at' => '2026-11-04 09:00:00',
    'ends_at' => '2026-11-04 10:00:00',
]];
check(
    apiAvailabilitySlotIsBlocked(
        apiParseLocalDateTime('2026-11-04 09:30'),
        apiParseLocalDateTime('2026-11-04 10:30'),
        $busyWindow
    ),
    'availability marks slots overlapping an active booking as busy'
);
check(
    !apiAvailabilitySlotIsBlocked(
        apiParseLocalDateTime('2026-11-04 10:00'),
        apiParseLocalDateTime('2026-11-04 10:30'),
        $busyWindow
    ),
    'adjacent slots remain available when one booking ends at the slot start'
);

$mismatchedEnd = apiValidateAppointmentWindow(
    apiParseLocalDateTime('2026-11-04 10:00'),
    30,
    apiParseLocalDateTime('2026-11-04 11:00'),
    $future
);
check($mismatchedEnd['ok'] === false && $mismatchedEnd['error'] === 'appointment_duration_mismatch', 'client supplied end must match service duration');

check(apiParseLocalDate('2026-02-30') === null, 'invalid calendar dates are rejected');
check(apiParseLocalDate('2026-11-04') !== null, 'valid calendar dates are accepted');

fwrite(STDOUT, "PASS: {$checks} isolated API validator checks; no database or network used.\n");
