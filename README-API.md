# Barber Shop API contract

This document describes the PHP API in `api.php`. The API is compatible with the existing Android client actions and adds safe user, service, appointment-list, and appointment-status operations. It uses the tables created by the original installer in `barbershop-schema-reference.php`; it does not require a schema migration.

## Base behavior

- The live base URL is `https://sistemashp.com.br/barbershop/api.php`.
- JSON responses use `{ "ok": true, ... }` on success and `{ "ok": false, "error": "stable_code" }` on failure. Driver messages, SQL, credentials, and stack traces are never returned.
- Protected actions require `Authorization: Bearer <token>`. Tokens remain random bearer values stored only as SHA-256 hashes in `bs_sessions` (or the configured prefix), expire after 30 days, and are invalid for inactive users.
- Browser CORS is an exact-origin allowlist. `security.allowed_origins` in the server-only `config.php` may contain the production web origin and any exact HTTPS preview origin. The configured `app.base_url` origin is also allowed. Requests without an `Origin` header (including native Android requests) do not need CORS. There is no wildcard origin and no cookie-based credential mode.
- Request bodies are limited to 64 KiB and JSON must be an object. Notes are limited to 500 characters. Unsupported methods return HTTP 405; malformed input is 400/422; authorization failures are 401/403; conflicts are 409.
- Appointment `starts_at` and `ends_at` are local wall-clock `DATETIME` values in `America/Sao_Paulo`, formatted as `YYYY-MM-DD HH:MM:SS` (the input also accepts `YYYY-MM-DD HH:MM`). They are not converted to UTC. Session expiry is the one existing UTC-based operation.

## Existing actions retained

### `GET ?action=health`

Unauthenticated health check. Returns the service name and API version.

### `POST ?action=login`

Body: `{ "email": "...", "password": "..." }`.

Returns a bearer token and the active user (`id`, `name`, `email`, `role`, `status`). Inactive users and bad credentials return the same HTTP 401 `invalid_credentials` response.

### `POST ?action=logout`

Accepts the bearer token when present and invalidates that token. It remains safe to call without a token.

### `GET ?action=me`

Returns the authenticated active user.

### `GET ?action=catalog`

Returns active services (`id`, `name`, `duration_minutes`, `price_cents`) and active barbers (`id`, `name`). This is the compact catalog retained for the existing app.

### `POST ?action=appointment_create`

Creates a pending appointment. Required fields are `service_id`, `starts_at`, and the IDs needed by the caller's role. `ends_at` remains accepted for compatibility but is optional; when supplied it must equal the computed service duration.

- A client is always booked as the authenticated client; a supplied different `client_id` is rejected.
- A barber is always booked as the authenticated barber; a supplied different `barber_id` is rejected.
- An admin must provide both `client_id` and `barber_id`.
- The client must be an active `client`, the barber an active `barber`, and the service active.
- The start must be in the future, on the same local date as the computed end, between 09:00 and 18:00 inclusive at the end boundary, and the supplied end must match the service duration. Notes are trimmed and capped at 500 characters.
- The transaction locks both user rows in ascending ID order, then checks overlapping `pending`/`confirmed` appointments for both barber and client before inserting. This serializes competing inserts without a migration and prevents double booking on either side.

Success: HTTP 201 with `{ "ok": true, "appointment_id": 123, "status": "pending" }`. Barber overlap is `appointment_conflict` (409); client overlap is `client_appointment_conflict` (409).

### `POST ?action=appointment_cancel`

An admin, the appointment's barber, or the appointment's client may cancel a `pending` or `confirmed` appointment. Completed, cancelled, and no-show records are not reopened. Returns the existing `appointment_id` and `status` fields.

### `GET ?action=availability&date=YYYY-MM-DD&barber_id=ID&service_id=ID`

Requires an authenticated user. The barber must be active and have role `barber`; the service must be active. Returns only available slot times and never another client's identity or appointment details. Slots are 30-minute starts within 09:00–18:00, exclude existing pending/confirmed overlaps, and exclude past slots when the requested date is today.

### `GET ?action=summary`

Returns real counts and role-specific agenda information. Admin data includes `users` (all active users), `admins`, `barbers`, `clients`, and today's `appointments`; barber data includes today's pending/confirmed count and upcoming appointments; client data includes the client's own upcoming pending/confirmed appointments. No revenue, stock, or other invented financial fields are returned.

### `GET ?action=history`

Returns the authenticated user's own client appointment history, preserving the existing client-self behavior and the 50-row limit. No client can request another user's history.

## New administration and agenda actions

### `GET ?action=users&role=client|barber&search=text`

Admin only. `role` is optional; when present it is limited to `client` or `barber`. `search` matches name or email and is capped at 100 characters. The response is `{ "ok": true, "users": [...] }`, where each item has only `id`, `name`, `email`, `role`, and `status`. Admin records are never listed or exposed by this action. Results are capped at 200 rows.

### `POST ?action=user_save`

Admin only. Create with `name`, `email`, `role` (`client` or `barber`), `status` (`active` or `inactive`), and a password of at least 8 characters. Update by including `id`; the password is optional on updates and is changed only when provided. Names are capped at 160 characters and emails at 190 characters. The request can never grant `admin`; existing admin records cannot be edited through this action. Duplicate emails return HTTP 409 `email_already_exists`. The response contains the saved user without a password hash.

### `GET ?action=services`

Authenticated users receive active services. Admins receive active and inactive services. Each service has `id`, `name`, `duration_minutes`, `price_cents`, `active`, and `description`.

### `POST ?action=service_save`

Admin only. Create or update with `name`, `duration_minutes` (integer 5–480), `price_cents` (integer 0–100000000), `active` (only `0` or `1`), and optional `description` (up to 5000 characters). Updates are selected by `id` and may omit unchanged fields. The response is the saved service object. Existing appointment prices cannot be historically reconstructed because the original schema has no price snapshot column; list responses therefore join the current service price without changing the schema.

### `GET ?action=appointment_list&date=YYYY-MM-DD`

Admin sees all appointments for the local day; a barber sees only that barber's appointments. Clients receive HTTP 403 and should use `history` instead. The response is `{ "ok": true, "appointments": [...] }`, with each item containing `id`, `client_id`, `barber_id`, `service_id`, `starts_at`, `ends_at`, `status`, `notes`, `client_name`, `barber_name`, `service_name`, and `price_cents`.

### `POST ?action=appointment_status`

Admin or the appointment's barber only. Body: `{ "appointment_id": ID, "status": "confirmed"|"completed"|"cancelled"|"no_show" }`.

Legal transitions are `pending -> confirmed|cancelled` and `confirmed -> completed|no_show|cancelled`. Completed and cancelled records cannot be reopened. Invalid transitions return HTTP 409 `invalid_status_transition`.

## Offline sync limitation

The legacy `sync` action is retained only as a compatibility queue. It is now admin-only, accepts only the allowlisted entities `appointments`, `users`, and `services`, caps the request and each JSON payload, and does not apply arbitrary entity writes. Normal Android MVP flows should not use it. Non-admin callers receive HTTP 403. The queue table is the installer table; no migration is performed.

## Deployment and compatibility

Deploy only the new `api.php` to the existing installed server alongside the separately reviewed tests/docs. Preserve the existing server-only `config.php` and `.installed` lock file and the current database; do not run `install.php` again and do not commit credentials. If a browser preview is needed, add its exact origin to `security.allowed_origins` in the live server's `config.php`; do not use `*`. The API never sends cookies, so web clients should continue to send the bearer token explicitly.

The local tests are pure validator checks and intentionally do not connect to production. Run them with:

```sh
php -l api.php
php tests/api_unit_test.php
```

A successful local validator run does not claim full database integration coverage; a MySQL/MariaDB test database is required for end-to-end testing. No production POST or write is part of these checks.
