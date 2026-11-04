# Barber Shop Sistemas HP

Esta branch `apk/android-app` contém a nova aplicação Android em `mobile/` e os complementos de API em PHP. A branch `main` e o servidor publicado não foram alterados. A implementação passa por validação antes da build final.

## Onde encontrar o aplicativo

A fonte Android está na pasta [`mobile`](./mobile/). Ela usa Expo/React Native e conecta à API existente em https://sistemashp.com.br/barbershop/api.php, preservando o banco do servidor. A logo e a identidade preto/dourado foram fornecidas pelo usuário.

O projeto móvel gerenciado para geração oficial de APK está na [tarefa do Manus](https://manus.im/app/JRUSfqwAU5TFVb8UtWoxBu). O código-fonte nesta branch não é um arquivo APK: o APK instalável só existe depois da build Android terminar.

## Servidor e segurança

Os arquivos `api.php` e `README-API.md` descrevem as funções novas de administração e agenda. Eles não foram implantados automaticamente. Não reinstalar o banco nem substituir `config.php` ou `.installed`. Nenhuma senha, token de sessão, configuração real de banco ou chave de assinatura é versionada.

A publicação FTP continua limitada à `main`. A pasta `mobile/`, testes e artefatos de build são excluídos do envio FTP para evitar exposição de arquivos do aplicativo no servidor PHP.

## Preços

A tabela enviada pelo usuário foi utilizada somente como referência editável de preços legíveis. O administrador confirma duração, nome e valor antes de salvar; serviços encobertos na foto permanecem pendentes. Os clientes sempre consultam os preços cadastrados no servidor.
