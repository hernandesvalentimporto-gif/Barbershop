# Correção da abertura — versão de teste 1.0.1

O usuário relatou que a versão 1.0.0 mostrava a logo e fechava. Foi encontrado um defeito concreto na navegação: após a restauração de sessão sem usuário, o layout das abas devolvia um redirecionamento para `/`, inclusive quando já estava na própria raiz. Isso impedia a renderização da tela de login e podia causar um ciclo de navegação. O fechamento exato no aparelho ainda não foi confirmado por logcat desse dispositivo.

A nova regra redireciona somente rotas explicitamente protegidas. As representações de raiz `index`, `(tabs)` e segmento ausente não são redirecionadas para si mesmas. Testes de regressão preservam essa condição e as permissões por perfil. A versão Android mantém o pacote e usa versionCode 2. A inicialização também recebe uma tela de recuperação para erros JavaScript.

A próxima build remota inclui ARM64 para o celular e x86_64 para o emulador. Antes de disponibilizar o APK, o teste precisa instalar e abrir a release, mostrar Entrar e E-mail, manter o processo ativo e reabrir o aplicativo sem falha. São capturados screenshot, XML da tela e logcat. Isso valida abertura e não substitui o teste completo no aparelho do usuário. Nenhuma credencial real ou transação de produção é usada.

Fontes para a configuração do emulador: https://github.com/ReactiveCircus/android-emulator-runner e https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/ .
