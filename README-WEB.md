# Barber Shop Sistemas HP — site PHP/MySQL

A interface web usa a instalação existente e fica em `https://sistemashp.com.br/barbershop/`. Não há nova build Android, migração dos dados ou reinstalação do banco. As credenciais existentes continuam válidas.

## Operação

Administrador: painel com contagens reais, agenda por data e botão **Novo atendimento**, seleção de cliente/barbeiro/serviço/horário disponível, confirmação/finalização/cancelamento, cadastro e edição de clientes/equipe/serviços, ativação/inativação sem excluir histórico. Clientes agendam para si e consultam/cancelam o que estiver autorizado; barbeiros consultam sua agenda e atualizam status autorizado. A referência de preços só preenche nome/preço quando escolhida e não inventa duração.

## Master: clientes SaaS, financeiro e teste

O administrador master pode abrir e editar o cadastro comercial de cada barbearia: nome e contato comercial, nome e e-mail de acesso do responsável. O e-mail aparece explicitamente na lista e na ficha; alterá-lo invalida as sessões anteriores do responsável e preserva a senha atual. O master também pode consultar o plano, status e contas daquele tenant. A área **Financeiro** lista assinaturas em teste, ativas, inadimplentes e vencidas. O preço exibido é o preço cadastrado do plano, não um saldo de fatura; não há extrato conciliado de pagamentos enquanto os webhooks e a correlação do provedor não forem configurados e validados.

O trial começa no servidor em UTC e termina 30 dias depois. Vencimento não significa aprovação nem pagamento: deve passar para `expired`; a assinatura só vira `active` após confirmação de cobrança do provedor. A aplicação atual registra o vencimento ao consultar o painel master (não é um cron independente) e ainda precisa validar a configuração de pagamento e o bloqueio/leitura para vencidos antes de considerar o ciclo comercial completo.

## Sessão e segurança

`web-api.php` é um gateway da mesma origem que usa os handlers de `api.php`. O bearer fica somente na sessão PHP, não em localStorage/sessionStorage. Cookies HTTP-only/Secure em produção, regeneração de sessão, CSRF nas escritas, queries preparadas e autorização por perfil. Troca de senha pede a senha atual e revoga os tokens da conta. Recuperação usa tokens SHA-256 em repouso, expiração de 15 minutos e uso único. Os links usam fragmento, removido do endereço após captura no navegador. A tabela auxiliar de recuperação é criada quando o fluxo é usado, sem apagar tabelas existentes.

## E-mail

O envio real depende de `mail()` e da autorização do remetente na hospedagem. O padrão é `no-reply@` seguido do domínio da URL confiável em `config.php`. Opcionalmente, no arquivo privado de configuração: `mail.from` define o remetente e `mail.enabled=false` desabilita o recurso. A tela de recuperação informa quando o endpoint declara o envio desabilitado; uma resposta aceita do PHP `mail()` ainda não comprova entrega. Verifique também a configuração de saída da hospedagem, SPF/DKIM e spam/quarentena. O transporte de teste local **não comprova entrega de e-mail de produção**.

## Publicação

Publicar `index.php`, `web-api.php`, `web-common.php`, `.htaccess`, `assets/`, o manifesto de rotas e preservar `api.php`. O workflow FTP exclui `config.php`, `.installed`, testes, dumps, arquivos de ambiente e código mobile. Não executar `install.php` novamente nem importar o dump do usuário. Nunca versionar credenciais.

## Verificações locais

A preparação de testes aplica as migrações SaaS e multi-tenant no MariaDB local e usa nove contas sintéticas distribuídas por duas barbearias e uma conta global. `tests/web-flow.py` cobre login/CSRF, cadastros, contagens de clientes ativos/inativos, painel global, status de assinatura, contagens isoladas por barbearia, criação de atendimentos, conflitos, permissões e tentativas de acesso cruzado. `tests/web-passwords.py` cobre troca, expiração, uso único e recuperação com transporte local fora do docroot. O ambiente `BARBER_MAIL_TEST_FILE` serve só aos testes sintéticos; nunca configurar um arquivo público ou ativar no servidor de produção.
