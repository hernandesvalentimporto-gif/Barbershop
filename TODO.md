# Site PHP/MySQL — resultados

- [x] Site responsivo em PHP/MySQL no endereço existente, com logo e identidade preto/dourado fornecidas, sem nova build APK.
- [x] Login com as contas existentes, autorização por cliente/barbeiro/admin, sessão HTTP-only no servidor, CSRF e logout sem expor bearer ao navegador.
- [x] Painel com contagens reais e links claros, sem financeiro ou estoque fictício.
- [x] Agenda administrativa por data com botão Novo atendimento. Selecionar cliente, barbeiro, serviço e horário disponível; confirmar criação real; informar conflito; consultar e atualizar status permitido.
- [x] Cadastro/edição/ativação/inativação de clientes e barbeiros, sem excluir histórico. Senha inicial com no mínimo 8 caracteres; senha opcional na edição.
- [x] Cadastro/edição de serviços com preço em reais convertido exatamente para centavos, duração de 5 a 480 minutos e ativação. Referência da foto só preenche valores por escolha; não inventar duração ou inserir automaticamente no banco.
- [x] Cliente pode agendar para si, consultar histórico e cancelar o que estiver autorizado. Barbeiro só vê e altera os atendimentos autorizados da própria agenda.
- [ ] Conta com troca de senha autenticada e recuperação por token de uso único/expiração enviado por e-mail. Não expor token nem permitir reset apenas informando e-mail. Indicar dependência do transporte de e-mail da hospedagem; não afirmar entrega sem comprovação.
- [x] Verificar fluxos com banco local sintético, sem criar/alterar dados de produção durante testes. Revisão independente somente leitura; corrigir falhas concretas.
- [x] Publicar apenas arquivos do site por FTP, preservando config.php, banco, API compatível e APK. Não publicar testes, dumps SQL, segredos, código mobile ou arquivos internos.

Publicação FTP concluída na execução 41881925587. Verificados 26 fluxos HTTP locais de cadastros/agenda/permissões, 14 verificações locais de senha e criação pela interface no navegador. Nenhum registro real criado nos testes. O envio de recuperação foi testado em transporte simulado local; entrega de e-mail da hospedagem continua sem comprovação. Não foi gerado outro APK.
