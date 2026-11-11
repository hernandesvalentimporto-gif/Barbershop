# Barber Shop Sistemas HP — site PHP/MySQL

A interface web usa a instalação existente e fica em `https://sistemashp.com.br/barbershop/`. Não há nova build Android, migração dos dados ou reinstalação do banco. As credenciais existentes continuam válidas.

## Tabela padrão da barbearia

O cadastro de serviços apresenta a tabela padrão com os serviços e combos informados pela barbearia. O administrador pode usar cada valor como ponto de partida, alterar nome/preço/duração, salvar, inativar para remover da agenda ou cadastrar novos itens. A duração não foi inventada: cada item precisa ser confirmado antes de ficar disponível para agendamento. A inativação preserva o histórico de atendimentos.

## Operação

Administrador: painel com contagens reais, agenda por data e botão **Novo atendimento**, seleção de cliente/barbeiro/serviço/horário disponível, confirmação/finalização/cancelamento, cadastro e edição de clientes/equipe/serviços, ativação/inativação sem excluir histórico. Clientes agendam para si e consultam/cancelam o que estiver autorizado; barbeiros consultam sua agenda e atualizam status autorizado. A referência de preços só preenche nome/preço quando escolhida e não inventa duração.

## Sessão e segurança

`web-api.php` é um gateway da mesma origem que usa os handlers de `api.php`. O bearer fica somente na sessão PHP, não em localStorage/sessionStorage. Cookies HTTP-only/Secure em produção, regeneração de sessão, CSRF nas escritas, queries preparadas e autorização por perfil. Troca de senha pede a senha atual e revoga os tokens da conta. Recuperação usa tokens SHA-256 em repouso, expiração de 15 minutos e uso único. Os links usam fragmento, removido do endereço após captura no navegador. A tabela auxiliar de recuperação é criada quando o fluxo é usado, sem apagar tabelas existentes.

## E-mail

O envio real depende de `mail()` e da autorização do remetente na hospedagem. O padrão é `no-reply@` seguido do domínio da URL confiável em `config.php`. Opcionalmente, no arquivo privado de configuração: `mail.from` define o remetente e `mail.enabled=false` desabilita o recurso. A confirmação é genérica para não revelar contas. Um teste do transporte local **não comprova entrega de e-mail de produção**; não afirme que o e-mail chegou sem confirmação.

## Publicação

Publicar `index.php`, `web-api.php`, `web-common.php`, `.htaccess`, `assets/`, o manifesto de rotas e preservar `api.php`. O workflow FTP exclui `config.php`, `.installed`, testes, dumps, arquivos de ambiente e código mobile. Não executar `install.php` novamente nem importar o dump do usuário. Nunca versionar credenciais.

## Verificações locais

Foi usado um MariaDB somente local com a estrutura existente e quatro contas sintéticas. `tests/web-flow.py` cobre login/CSRF, cadastros, centavos, criação de atendimento, conflito, status e permissões. `tests/web-passwords.py` cobre troca, expiração, uso único e recuperação com transporte local fora do docroot. O ambiente `BARBER_MAIL_TEST_FILE` serve só aos testes sintéticos; nunca configurar um arquivo público ou ativar no servidor de produção.
