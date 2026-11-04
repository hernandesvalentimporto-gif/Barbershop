<?php
declare(strict_types=1);

$installed = is_file(__DIR__ . '/.installed') && is_file(__DIR__ . '/config.php');
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Barber Shop Sistemas HP</title>
    <style>
        :root { color-scheme: dark; --bg:#090a0c; --surface:#121417; --border:#2a2b2d; --gold:#e7b94e; --gold-soft:#f5d77f; --text:#f7f2e8; --muted:#9b9a95; --green:#63c79a; }
        * { box-sizing:border-box; } body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 50% -10%, #2b2412, var(--bg) 52%); color:var(--text); font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif; padding:24px; }
        main { width:min(620px,100%); text-align:center; background:rgba(18,20,23,.95); border:1px solid var(--border); border-radius:24px; padding:34px 24px; box-shadow:0 22px 80px rgba(0,0,0,.35); }
        .mark { color:var(--gold); font-size:11px; letter-spacing:3px; font-weight:800; } h1 { margin:12px 0 8px; font-size:30px; line-height:1.1; } p { color:var(--muted); margin:0 auto; max-width:480px; } .status { display:inline-flex; align-items:center; gap:8px; margin:24px 0 10px; border:1px solid rgba(99,199,154,.35); background:#12221b; color:#9be0ba; border-radius:999px; padding:8px 13px; font-size:13px; font-weight:700; } .dot { width:7px; height:7px; border-radius:50%; background:var(--green); } .rule { width:44px; height:2px; background:var(--gold); margin:22px auto; } .note { font-size:13px; } code { color:var(--gold-soft); }
    </style>
</head>
<body>
<main>
    <div class="mark">SISTEMAS HP</div>
    <h1>Barber Shop Sistemas HP</h1>
    <div class="rule"></div>
    <?php if ($installed): ?>
        <div class="status"><span class="dot"></span> Sistema instalado e banco configurado</div>
        <p>Esta é a base online do Barber Shop. O próximo passo é conectar o aplicativo Android e iOS à API de agenda, clientes e sincronização.</p>
    <?php else: ?>
        <div class="status"><span class="dot"></span> Servidor online</div>
        <p>O sistema ainda não foi instalado. Acesse <code>/install.php</code> para configurar o banco e criar o primeiro administrador.</p>
    <?php endif; ?>
</main>
</body>
</html>
