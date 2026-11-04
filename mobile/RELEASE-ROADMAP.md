# Sequência de entrega aprovada

Primeiro gerar um APK Android para instalação e testes, sem publicar em loja. O usuário testa os fluxos reais e solicita as mudanças necessárias; as novas versões mantêm pacote e assinatura compatíveis quando possível.

Depois de corrigir e aprovar o aplicativo, preparar a distribuição Google Play usando AAB e os requisitos de conta, assinatura, ficha, privacidade e testes aplicáveis. Publicar na Google Play somente após aprovação explícita da versão final e do conteúdo de publicação.

A versão iOS vem após os testes e ajustes. Validar o app no iPhone, preparar TestFlight/App Store e usar a conta de desenvolvedor Apple do usuário. Publicar na App Store somente após aprovação explícita. Não criar nem contratar contas pagas, não enviar o aplicativo para revisão pública e não publicar automaticamente agora.

Estado atual: código Android implementado, fonte preservada no Manus e na branch apk/android-app do GitHub. O APK de teste ainda depende da conclusão da build oficial no painel. O complemento da API administrativa está preparado, mas ainda não foi implantado no servidor.
