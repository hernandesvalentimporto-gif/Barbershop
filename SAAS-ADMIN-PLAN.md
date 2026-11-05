# Plataforma SaaS do Barber Shop

## Objetivo

O site terá dois níveis administrativos distintos:

- **Administrador global da plataforma:** controla barbearias clientes, planos, testes, assinaturas, inadimplência e métricas comerciais.
- **Administrador da barbearia:** controla a operação do próprio estabelecimento, incluindo barbeiros, clientes, serviços e agenda.

Barbeiros e clientes continuam usando as áreas operacionais atuais. O APK Android e o aplicativo Apple serão feitos depois, consumindo o mesmo contrato de assinatura do servidor.

## Ciclo comercial

1. Uma barbearia é cadastrada no sistema.
2. O servidor cria uma assinatura `trialing` com início em UTC e término 30 dias depois.
3. Durante o teste, o estabelecimento recebe os direitos do plano de teste.
4. Antes do vencimento, o administrador é avisado para escolher um plano.
5. Se houver assinatura confirmada, o estado passa para `active`.
6. Se o período acabar sem assinatura, o estado passa para `expired` e o acesso operacional pode ser limitado a leitura/renovação.
7. Falhas de cobrança ficam como `past_due`, com período de tolerância configurável.
8. Cancelamentos e revogações são registrados com origem, identificador externo e histórico de eventos.

O servidor será a fonte dos direitos de acesso. O relógio do navegador, a reinstalação do APK ou a troca de dispositivo não reiniciam o teste.

## Proposta comercial

O plano inicial custa **R$ 30 por mês**. A comunicação principal será: **“Seu sistema por apenas R$ 1 por dia.”** O valor cobrado continua sendo mensal; a frase de R$ 1 por dia é a equivalência comercial para facilitar a compreensão do preço.

## Regra permanente de senha

O sistema nunca terá opção própria de “lembrar senha”. Senhas não serão gravadas no navegador, em `localStorage`, em `sessionStorage`, no APK ou em arquivos de configuração. O banco guarda somente o hash necessário para verificar a senha. A recuperação será feita por link temporário enviado ao e-mail cadastrado, e os campos terão mostrar/ocultar senha somente durante a digitação.

## Dados principais

- `bs_plans`: planos, preço em centavos, periodicidade e limites.
- `bs_subscriptions`: assinatura por barbearia, estado, início/fim do teste, período atual e identificadores do provedor.
- `bs_billing_events`: eventos idempotentes recebidos de Stripe/outro provedor, Google Play ou App Store.
- `platform_admin` em `bs_users`: marca a conta administradora global sem transformar todos os administradores de barbearia em administradores da plataforma.

A próxima etapa de isolamento completo adicionará o vínculo `barbershop_id` a usuários, serviços e agendamentos. Isso deve ser feito junto com uma migração de dados e testes de autorização, não apenas com alterações de tela.

## Painel global

O painel exibirá números reais:

- barbearias cadastradas;
- contas em teste;
- assinaturas ativas;
- assinaturas vencidas;
- assinaturas inadimplentes;
- barbeiros ativos;
- clientes ativos;
- cadastros recentes;
- vencimentos próximos.

Nenhum número fictício será criado para preencher o painel.

## Lojas e cobrança

No Google Play, o produto será uma assinatura com plano base e oferta de teste no Play Console. A integração deverá reconhecer renovação, cancelamento, suspensão, período de carência e inadimplência por meio do estado verificado no servidor. A documentação oficial recomenda Billing Library 8 ou superior para novos apps e atualizações a partir de agosto de 2026: <https://developer.android.com/google/play/billing/subscriptions>.

Na Apple, o produto será uma assinatura auto-renovável com oferta introdutória gratuita configurada no App Store Connect. A Apple informa que a oferta gratuita termina e a assinatura começa a cobrar o preço normal depois do período introdutório, e que a elegibilidade precisa ser verificada por recibo: <https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/> e <https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app>.

Durante a fase web, a cobrança deverá usar um provedor de pagamentos com webhook idempotente. O nome do provedor, os preços e os dados comerciais ainda não serão gravados no código; serão configurados por secrets e pelo painel.

## Ordem de implementação

1. Migração de dados e estado de assinatura.
2. Conta administradora global e autorização separada.
3. Painel global somente com métricas reais.
4. Tela de barbearias e assinaturas.
5. Isolamento multiempresa das entidades operacionais.
6. Checkout web e webhooks do provedor escolhido.
7. Testes de trial, renovação, inadimplência, cancelamento e revogação.
8. Só depois, integração nativa com Google Play e Apple.
