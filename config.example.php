<?php
/**
 * Configuração do Barber Shop Sistemas HP.
 *
 * Copie este arquivo para config.php no servidor e preencha os valores.
 * Nunca publique credenciais reais no GitHub.
 * Depois da instalação, restrinja o acesso a este arquivo no servidor.
 */

return [
    'app' => [
        'name' => 'Barber Shop Sistemas HP',
        'base_url' => 'https://sistemashp.com.br/barbershop',
        'environment' => 'production',
    ],

    'database' => [
        // Exemplos: localhost, 127.0.0.1 ou o host fornecido pela hospedagem.
        'host' => 'ENDERECO_DO_BANCO',
        'port' => 3306,
        'name' => 'NOME_DO_BANCO',
        'user' => 'USUARIO_DO_BANCO',
        'password' => 'SENHA_DO_BANCO',
        'charset' => 'utf8mb4',
        'table_prefix' => 'bs_',
    ],

    'security' => [
        // Gere uma chave longa e aleatória para assinar as sessões da API.
        'app_key' => 'COLOQUE_AQUI_UMA_CHAVE_LONGA_E_ALEATORIA',
        'allowed_origins' => [
            'https://sistemashp.com.br',
        ],
    ],

    'payment' => [
        'provider' => 'asaas',
        'environment' => 'sandbox',
        'base_url' => 'https://api-sandbox.asaas.com',
        'checkout_base_url' => 'https://asaas.com',
        // Nunca publique a chave da API ou o token de webhook no GitHub.
        'api_key' => 'PREENCHA_APENAS_NO_SERVIDOR',
        'webhook_token' => 'GERE_UM_TOKEN_LONGO_E_ALEATORIO',
    ],

    'sync' => [
        'enabled' => true,
        'conflict_strategy' => 'server_wins_for_appointments',
    ],
];
