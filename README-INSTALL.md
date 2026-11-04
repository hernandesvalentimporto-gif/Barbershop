# Instalador do Barber Shop

1. Envie `install.php` e `.htaccess` para a pasta `barbershop` do FTP.
2. Acesse `https://sistemashp.com.br/barbershop/install.php`.
3. Preencha o endereço, porta, nome, usuário e senha do MySQL/MariaDB.
4. Informe o nome e a senha do primeiro administrador.
5. Clique em **Testar banco e instalar sistema**.
6. Depois da conclusão, remova `install.php` do servidor ou bloqueie seu acesso.

O instalador cria as tabelas iniciais de usuários, barbearias, serviços, agendamentos e sincronização offline. Ele grava `config.php` no servidor, protegido pelo `.htaccess`.

Não faça commit de `config.php`, não envie a senha ao chat e não deixe o instalador público depois da configuração.
