<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
$assetVersion = (string) max(filemtime(__DIR__ . '/assets/site.js') ?: 0, filemtime(__DIR__ . '/assets/site.css') ?: 0);

$allowedViews = ['login', 'forgot', 'home', 'agenda', 'clients', 'team', 'services', 'account', 'booking', 'history', 'reset'];
$requestedView = isset($_GET['view']) ? (string)$_GET['view'] : 'login';
$view = in_array($requestedView, $allowedViews, true) ? $requestedView : 'login';
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#090a0c">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Barber Shop">
    <link rel="manifest" href="manifest.webmanifest">
    <meta name="description" content="Gestão de agenda do Barber Shop Sistemas HP">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="no-referrer">
    <title>Barber Shop Sistemas HP</title>
    <link rel="icon" href="assets/favicon.png" type="image/png">
    <link rel="stylesheet" href="assets/site.css?v=<?= htmlspecialchars($assetVersion, ENT_QUOTES, 'UTF-8') ?>">
</head>
<body>
    <div id="app" data-view="<?= htmlspecialchars($view, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
        <div class="boot-screen" role="status" aria-live="polite">
            <img src="assets/logo.png" width="96" height="96" alt="Barber Shop Sistemas HP">
            <span>Carregando seu espaço...</span>
        </div>
    </div>
    <noscript>
        <div class="noscript-message">Ative o JavaScript para usar a agenda online.</div>
    </noscript>
    <script>
        window.BARBERSHOP_BOOTSTRAP = { view: <?= json_encode($view, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?> };
    </script>
    <script src="assets/site.js?v=<?= htmlspecialchars($assetVersion, ENT_QUOTES, 'UTF-8') ?>" defer></script>
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
        }
    </script>
</body>
</html>
