# Site Barber Shop Sistemas HP — plano aprovado

O usuário escolheu concluir primeiro o site PHP/MySQL, sem gerar outro APK. Usar a hospedagem em https://sistemashp.com.br/barbershop/, o banco existente e a API 1.1.0 já publicada. Preservar o projeto Android e todos os dados. Desenvolver em `web/php-site`, validar com dados sintéticos locais e publicar pelo FTP existente depois da verificação.

## Implementação

PHP fornece a página e sessões HTTP-only no servidor; JavaScript simples acessa um gateway PHP da mesma origem. O gateway reutiliza os handlers da API existente e guarda o bearer apenas na sessão PHP, sem localStorage/sessionStorage. Validação de CSRF nas escritas, autorização por perfil e queries preparadas. Cookies HTTPS, regeneração após login e mensagens de erro úteis.

Administrador: painel com contagens reais; agenda por data com botão Novo atendimento; escolher cliente, barbeiro, serviço e horário disponível; confirmar no banco, tratar conflitos e cancelar/confirmar/finalizar. Cadastro e edição de clientes, barbeiros e serviços, com ativação/inativação sem excluir histórico. Preços de referência somente por escolha explícita e duração obrigatória. Cliente: agendar para si e consultar histórico. Barbeiro: consultar sua agenda e atualizar status autorizado.

Conta: troca de senha autenticada e fluxo de recuperação por token de uso único e prazo curto enviado por e-mail. Recuperação depende do transporte de e-mail da hospedagem e não será apresentada como envio comprovado sem evidência. Nunca retornar tokens de recuperação ou autenticação ao navegador. Eventual tabela auxiliar de recuperação não recria nem limpa tabelas existentes.

## Estrutura

- `index.php`: shell HTML responsivo, rotas por `?view=` e logo fornecida.
- `assets/site.js` e `assets/site.css`: interface, formulários e navegação acessível.
- `web-common.php`: sessão, configuração, CSRF, identidade e utilidades PHP.
- `web-api.php`: gateway de mesma origem, login, senha/recuperação e delegação à API.
- `api.php`: handlers PHP/MySQL 1.1.0 reutilizados, preservando compatibilidade do APK.
- `assets/logo.png` e favicon: imagens derivadas da logo do usuário, sem mudar a marca.
- `tests/`: verificações locais com dados sintéticos; nunca publicar fixtures ou credenciais.

## Design existente

Reutilizar preto e dourado e a logo Barber Shop Sistemas HP fornecidos. Interface operacional, sem números fictícios ou módulos financeiros/estoque simulados. Menu lateral em desktop e navegação inferior no celular. Botão Novo atendimento evidente na Agenda. Formulários com rótulos completos, estados de envio, erros próximos aos campos e confirmação de sucesso. Português brasileiro, datas dd/mm/aaaa, moeda R$ e horário America/Sao_Paulo.

Não há nova build APK, publicação em lojas, reinstalação do banco ou alteração de credenciais do servidor neste trabalho.
