# Pagamentos web com Asaas

## Decisão desta etapa

O site usará o **Asaas Checkout** para assinaturas recorrentes. O Checkout será hospedado pelo Asaas, evitando que o Barber Shop processe dados de cartão diretamente. A integração ficará inicialmente em Sandbox; nenhuma chave real está no repositório.

A cobrança será criada somente depois de existir um plano ativo com preço definido. O preço ficará em centavos na tabela `bs_plans`, e o servidor armazenará o identificador do Checkout e da assinatura do Asaas.

O primeiro plano será o **Plano 1 Real por Dia**, com cobrança de **R$ 30 por mês**. A propaganda usará “Seu sistema por apenas R$ 1 por dia”; o checkout sempre deixará explícito que o pagamento é mensal.

## Fluxo previsto

1. O administrador global escolhe uma barbearia e um plano ativo.
2. O servidor cria um Checkout recorrente no Asaas com `chargeTypes = RECURRENT`, item, periodicidade e URLs de retorno.
3. O servidor salva o identificador do Checkout e entrega somente o link hospedado ao navegador.
4. O usuário conclui o pagamento na página do Asaas.
5. O servidor recebe os eventos `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED` e eventos de cobrança.
6. Cada evento é persistido em `bs_billing_events` antes do processamento.
7. Eventos repetidos são ignorados pelo par único `provider + provider_event_id`.
8. A assinatura local passa para `active`, `past_due`, `canceled` ou `expired` conforme o evento confirmado.

A URL de sucesso nunca será considerada prova de pagamento. A confirmação dependerá do webhook autenticado.

## Segurança

A chave da API e o token de webhook ficam somente no `config.php` do servidor ou em secrets do ambiente. O endpoint `asaas-webhook.php` exige o cabeçalho `asaas-access-token`, limita o corpo recebido e rejeita eventos sem `id` e `event`.

## Referências oficiais

- Checkout com assinatura recorrente: https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- Asaas Checkout: https://docs.asaas.com/docs/checkout-asaas
- Webhooks: https://docs.asaas.com/docs/webhooks-1
- Criar nova assinatura: https://docs.asaas.com/reference/criar-nova-assinatura
