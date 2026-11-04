# Barber Shop Sistemas HP — Android

Aplicativo Expo/React Native em português brasileiro, com a logo original e a identidade preto e dourado fornecidas pelo usuário. A fonte de dados é a API existente em https://sistemashp.com.br/barbershop/api.php. Não há recriação nem importação do banco da hospedagem.

## Funções

O cliente entra com o e-mail e senha cadastrados no servidor, consulta serviços e barbeiros, escolhe uma data e um horário disponível, agenda e acompanha seu histórico. O barbeiro consulta sua agenda e controla os estados dos atendimentos. O administrador gerencia clientes, barbeiros e serviços. Nenhum perfil é escolhido livremente pelo usuário: o servidor determina as permissões no login.

Não são incluídos valores financeiros, fotos de clientes, estoque, comissões ou contas de demonstração fictícias. Os dados mostrados são retornados pela API. A logo e a composição visual fornecidas são referências de identidade, não fontes de dados.

## Compatibilidade com a API publicada

A versão que já está no ar oferece login, catálogo, disponibilidade, criação/cancelamento, resumo e histórico. Os novos endpoints de administração, listagem diária e mudança de status estão preparados na branch `apk/android-app` do repositório Barbershop, mas não são publicados automaticamente. Enquanto o complemento PHP não for aprovado e implantado, o app informa a indisponibilidade desses endpoints em vez de inventar cadastros ou resultados.

Atualizar somente o código aprovado de `api.php` preserva `config.php`, `.installed` e o banco existente. Não usar o instalador novamente e não colocar senhas ou credenciais da hospedagem no aplicativo/GitHub.

## Verificação e Preview

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm dev
```

Os listeners gerenciados são Metro 8081 e API de apoio 3000. A API PHP da barbearia continua hospedada no endereço original. A visualização Web não substitui um teste do APK no Android.

## Gerar o APK no Manus

A fonte aceita é salva como checkpoint do projeto móvel gerenciado. No painel de publicação mobile, usar Android e o formato APK para instalação direta; AAB é destinado à Google Play. Se o painel exigir conexão Expo, preencher a credencial no formulário protegido do Manus, nunca no chat. O perfil `preview` em `eas.json` define um APK de distribuição interna. Não afirmar que o APK foi gerado até a build terminar e existir um arquivo de saída.

O pacote Android é `space.manus.barberhp.t054228665129522`. O aplicativo mantém os identificadores desta nova implementação; não é possível garantir atualização por cima de um APK anterior cuja assinatura/pacote não foram recuperados.

## Segurança

O Android usa armazenamento seguro para o token. As senhas são transmitidas somente no login/cadastro autorizado por HTTPS e não devem ser persistidas em texto simples. O servidor valida o token e as permissões a cada chamada. Falhas de rede ou conflitos de horário não são tratados como agendamentos concluídos. Os testes automatizados não criam usuários ou reservas no banco de produção.
