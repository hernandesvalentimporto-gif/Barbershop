<?php
/**
 * Instalador inicial do Barber Shop Sistemas HP.
 * Suba este arquivo para a pasta /barbershop e abra /barbershop/install.php.
 * O instalador deve ser removido ou bloqueado após a conclusão.
 */
declare(strict_types=1);

session_start();

$baseDir = __DIR__;
$configFile = $baseDir . '/config.php';
$lockFile = $baseDir . '/.installed';
$errors = [];
$success = false;

if (is_file($lockFile)) {
    $success = true;
}

if (!isset($_SESSION['installer_csrf'])) {
    $_SESSION['installer_csrf'] = bin2hex(random_bytes(24));
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function old(string $key): string
{
    return e((string)($_POST[$key] ?? ''));
}

function createSchema(PDO $pdo, string $prefix): void
{
    $tables = [
        "CREATE TABLE IF NOT EXISTS `{$prefix}users` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(160) NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `password_hash` VARCHAR(255) NOT NULL,
            `role` ENUM('admin','barber','client') NOT NULL DEFAULT 'client',
            `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`), UNIQUE KEY `uq_{$prefix}users_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$prefix}barbershops` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(180) NOT NULL,
            `phone` VARCHAR(40) NULL,
            `address` VARCHAR(255) NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$prefix}services` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(140) NOT NULL,
            `description` TEXT NULL,
            `duration_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
            `price_cents` INT UNSIGNED NOT NULL DEFAULT 0,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$prefix}appointments` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `client_id` BIGINT UNSIGNED NOT NULL,
            `barber_id` BIGINT UNSIGNED NULL,
            `service_id` BIGINT UNSIGNED NOT NULL,
            `starts_at` DATETIME NOT NULL,
            `ends_at` DATETIME NOT NULL,
            `status` ENUM('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
            `notes` VARCHAR(500) NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`), KEY `idx_{$prefix}appointments_starts_at` (`starts_at`), KEY `idx_{$prefix}appointments_client` (`client_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$prefix}sync_queue` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `device_id` VARCHAR(120) NOT NULL,
            `entity` VARCHAR(80) NOT NULL,
            `entity_id` BIGINT UNSIGNED NOT NULL,
            `operation` ENUM('create','update','delete') NOT NULL,
            `payload` JSON NOT NULL,
            `status` ENUM('pending','processed','conflict') NOT NULL DEFAULT 'pending',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`), KEY `idx_{$prefix}sync_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$prefix}sessions` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `token_hash` CHAR(64) NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`), UNIQUE KEY `uq_{$prefix}sessions_token` (`token_hash`), KEY `idx_{$prefix}sessions_expires` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($tables as $sql) {
        $pdo->exec($sql);
    }
}

function writeConfig(string $path, array $data): void
{
    $contents = "<?php\n// Gerado pelo instalador do Barber Shop. Não publique este arquivo no GitHub.\nreturn " . var_export($data, true) . ";\n";
    if (file_put_contents($path, $contents, LOCK_EX) === false) {
        throw new RuntimeException('Não foi possível gravar config.php. Verifique as permissões da pasta.');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$success) {
    if (!hash_equals($_SESSION['installer_csrf'], (string)($_POST['csrf'] ?? ''))) {
        $errors[] = 'A sessão do instalador expirou. Atualize a página e tente novamente.';
    }

    $host = trim((string)($_POST['db_host'] ?? ''));
    $port = (int)($_POST['db_port'] ?? 3306);
    $database = trim((string)($_POST['db_name'] ?? ''));
    $user = trim((string)($_POST['db_user'] ?? ''));
    $password = (string)($_POST['db_password'] ?? '');
    $prefix = trim((string)($_POST['table_prefix'] ?? 'bs_'));
    $adminName = trim((string)($_POST['admin_name'] ?? ''));
    $adminEmail = strtolower(trim((string)($_POST['admin_email'] ?? '')));
    $adminPassword = (string)($_POST['admin_password'] ?? '');
    $shopName = trim((string)($_POST['shop_name'] ?? 'Barber Shop Sistemas HP'));

    if ($host === '' || $database === '' || $user === '') $errors[] = 'Preencha endereço, nome e usuário do banco.';
    if ($port < 1 || $port > 65535) $errors[] = 'A porta do banco é inválida.';
    if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $prefix)) $errors[] = 'O prefixo deve ter apenas letras, números e sublinhado.';
    if ($adminName === '' || !filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'Informe nome e e-mail válidos para o administrador.';
    if (strlen($adminPassword) < 8) $errors[] = 'A senha do administrador precisa ter pelo menos 8 caracteres.';

    if (!$errors) {
        try {
            $dsn = "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4";
            $pdo = new PDO($dsn, $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            // O MySQL faz commit implícito em CREATE TABLE; a instalação usa
            // comandos idempotentes e não envolve o schema em uma transação.
            createSchema($pdo, $prefix);
            $stmt = $pdo->prepare("INSERT INTO `{$prefix}users` (`name`, `email`, `password_hash`, `role`) VALUES (?, ?, ?, 'admin') ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `password_hash` = VALUES(`password_hash`), `role` = 'admin', `status` = 'active'");
            $stmt->execute([$adminName, $adminEmail, password_hash($adminPassword, PASSWORD_DEFAULT)]);
            $shopStmt = $pdo->prepare("INSERT INTO `{$prefix}barbershops` (`name`) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM `{$prefix}barbershops` LIMIT 1)");
            $shopStmt->execute([$shopName !== '' ? $shopName : 'Barber Shop Sistemas HP']);

            writeConfig($configFile, [
                'app' => [
                    'name' => $shopName !== '' ? $shopName : 'Barber Shop Sistemas HP',
                    'base_url' => rtrim((string)($_POST['base_url'] ?? 'https://sistemashp.com.br/barbershop'), '/'),
                    'environment' => 'production',
                ],
                'database' => [
                    'host' => $host,
                    'port' => $port,
                    'name' => $database,
                    'user' => $user,
                    'password' => $password,
                    'charset' => 'utf8mb4',
                    'table_prefix' => $prefix,
                ],
                'security' => [
                    'app_key' => bin2hex(random_bytes(32)),
                ],
                'sync' => [
                    'enabled' => true,
                    'conflict_strategy' => 'server_wins_for_appointments',
                ],
            ]);
            file_put_contents($lockFile, date('c'), LOCK_EX);
            $success = true;
        } catch (Throwable $exception) {
            if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
            $errors[] = 'Não foi possível concluir: ' . $exception->getMessage();
        }
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Instalação — Barber Shop Sistemas HP</title>
    <style>
        :root { color-scheme: dark; --bg:#090a0c; --surface:#121417; --border:#2a2b2d; --gold:#e7b94e; --gold-soft:#f5d77f; --text:#f7f2e8; --muted:#9b9a95; --danger:#e97777; }
        * { box-sizing:border-box; } body { margin:0; min-height:100vh; background:radial-gradient(circle at 50% -20%, #2b2412, var(--bg) 48%); color:var(--text); font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif; }
        main { width:min(720px, calc(100% - 32px)); margin:0 auto; padding:38px 0 58px; } header { text-align:center; margin-bottom:25px; } .mark { color:var(--gold); letter-spacing:3px; font-size:11px; font-weight:800; } h1 { font-size:30px; line-height:1.1; margin:10px 0 8px; } header p { color:var(--muted); margin:0; }
        form, .success, .warning { background:rgba(18,20,23,.94); border:1px solid var(--border); border-radius:20px; padding:22px; box-shadow:0 20px 70px rgba(0,0,0,.28); } fieldset { border:0; padding:0; margin:0 0 22px; } legend { color:var(--gold-soft); font-weight:800; font-size:12px; letter-spacing:1px; margin-bottom:14px; } .grid { display:grid; grid-template-columns:2fr 1fr; gap:12px; } .grid-three { display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:12px; } label { color:var(--muted); font-size:12px; display:block; margin-bottom:7px; } input { width:100%; color:var(--text); background:var(--bg); border:1px solid var(--border); border-radius:11px; padding:12px 13px; outline:none; } input:focus { border-color:var(--gold); box-shadow:0 0 0 3px rgba(231,185,78,.12); } .field { margin-bottom:13px; } .errors { border:1px solid rgba(233,119,119,.45); color:#ffc0c0; background:rgba(130,34,34,.2); padding:13px 15px; border-radius:12px; margin-bottom:18px; } .errors div + div { margin-top:5px; } button { width:100%; border:0; border-radius:12px; background:var(--gold); color:var(--bg); padding:14px 18px; font-weight:850; cursor:pointer; font-size:15px; } button:hover { background:var(--gold-soft); } .note { color:var(--muted); font-size:12px; margin-top:15px; } .success { border-color:rgba(99,199,154,.48); } .success h2 { color:#9be0ba; margin-top:0; } .warning { margin-top:18px; border-color:rgba(231,185,78,.35); color:var(--gold-soft); font-size:13px; } code { color:var(--gold-soft); } @media (max-width:600px) { .grid,.grid-three { grid-template-columns:1fr; gap:0; } main { padding-top:24px; } form,.success,.warning { padding:17px; } }
    </style>
</head>
<body>
<main>
    <header><div class="mark">SISTEMAS HP</div><h1>Instalação do Barber Shop</h1><p>Preencha os dados e o sistema criará a estrutura inicial automaticamente.</p></header>
    <?php if ($success): ?>
        <section class="success"><h2>Instalação concluída</h2><p>O banco foi conectado, as tabelas foram criadas e o primeiro administrador foi cadastrado.</p><p>Acesse o aplicativo usando o e-mail e a senha informados. Por segurança, remova <code>install.php</code> do servidor ou bloqueie o acesso a ele.</p></section>
    <?php else: ?>
        <?php if ($errors): ?><div class="errors"><?php foreach ($errors as $error): ?><div><?= e($error) ?></div><?php endforeach; ?></div><?php endif; ?>
        <form method="post" autocomplete="off">
            <input type="hidden" name="csrf" value="<?= e($_SESSION['installer_csrf']) ?>">
            <fieldset><legend>1. DADOS DO BANCO</legend><div class="grid"><div class="field"><label for="db_host">Endereço do banco</label><input id="db_host" name="db_host" required value="<?= old('db_host') ?>" placeholder="localhost ou endereço fornecido pela hospedagem"></div><div class="field"><label for="db_port">Porta</label><input id="db_port" name="db_port" type="number" value="<?= old('db_port') ?: '3306' ?>"></div></div><div class="grid-three"><div class="field"><label for="db_name">Nome do banco</label><input id="db_name" name="db_name" required value="<?= old('db_name') ?>"></div><div class="field"><label for="db_user">Usuário</label><input id="db_user" name="db_user" required value="<?= old('db_user') ?>"></div><div class="field"><label for="db_password">Senha</label><input id="db_password" name="db_password" type="password" value="<?= old('db_password') ?>"></div></div><div class="field"><label for="table_prefix">Prefixo das tabelas</label><input id="table_prefix" name="table_prefix" value="<?= old('table_prefix') ?: 'bs_' ?>"></div></fieldset>
            <fieldset><legend>2. PRIMEIRO ADMINISTRADOR</legend><div class="grid"><div class="field"><label for="admin_name">Nome</label><input id="admin_name" name="admin_name" required value="<?= old('admin_name') ?>"></div><div class="field"><label for="admin_email">E-mail</label><input id="admin_email" name="admin_email" type="email" required value="<?= old('admin_email') ?>"></div></div><div class="field"><label for="admin_password">Senha do administrador (mínimo de 8 caracteres)</label><input id="admin_password" name="admin_password" type="password" required></div></fieldset>
            <fieldset><legend>3. DADOS DO SISTEMA</legend><div class="field"><label for="shop_name">Nome da barbearia ou plataforma</label><input id="shop_name" name="shop_name" value="<?= old('shop_name') ?: 'Barber Shop Sistemas HP' ?>"></div><div class="field"><label for="base_url">Endereço instalado</label><input id="base_url" name="base_url" value="<?= old('base_url') ?: 'https://sistemashp.com.br/barbershop' ?>"></div></fieldset>
            <button type="submit">Testar banco e instalar sistema</button><p class="note">As credenciais são usadas somente durante a instalação e gravadas no servidor. Não coloque o arquivo preenchido no GitHub.</p>
        </form>
        <div class="warning">Antes de instalar, crie o banco vazio no painel da hospedagem se o seu provedor não permitir que o usuário web crie bancos automaticamente. O instalador cria as tabelas dentro do banco informado.</div>
    <?php endif; ?>
</main>
</body>
</html>
