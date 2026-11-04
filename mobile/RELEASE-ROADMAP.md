# Sequência de entrega aprovada

Primeiro gerar um APK Android para instalação e testes, sem publicar em loja. Esta etapa foi concluída: BarberShop-SistemasHP-Teste.apk, compilação GitHub Actions 41845806089, assinatura de desenvolvimento verificada e checksum SHA256 confirmado. A compilação remota foi utilizada porque o painel Build do Manus voltou inesperadamente a uma aba vazia. A fonte Expo continua salva no projeto gerenciado do Manus.

Agora o usuário testa os fluxos reais e solicita as mudanças necessárias. O APK entregue é ARM64; sua assinatura é de desenvolvimento, não a chave de produção da Google Play. Manter o mesmo pacote e a assinatura compatível nos próximos APKs de teste quando possível. O complemento da API administrativa está preparado na branch apk/android-app, mas ainda não foi implantado no servidor; por isso algumas telas administrativas informam a indisponibilidade dos novos endpoints.

Depois de corrigir e aprovar o aplicativo, preparar a distribuição Google Play usando AAB e os requisitos de conta, assinatura, ficha, privacidade e testes aplicáveis. Publicar na Google Play somente após aprovação explícita da versão final e do conteúdo de publicação.

A versão iOS vem após os testes e ajustes. Validar o app no iPhone, preparar TestFlight/App Store e usar a conta de desenvolvedor Apple do usuário. Publicar na App Store somente após aprovação explícita. Não criar nem contratar contas pagas, não enviar o aplicativo para revisão pública e não publicar automaticamente agora.
