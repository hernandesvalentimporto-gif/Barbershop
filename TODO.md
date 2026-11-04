# Site PHP/MySQL — resultados

- [ ] Site responsivo em PHP/MySQL no endereço existente, com logo e identidade preto/dourado fornecidas, sem nova build APK.
- [ ] Login com as contas existentes, autorização por cliente/barbeiro/admin, sessão HTTP-only no servidor, CSRF e logout sem expor bearer ao navegador.
- [ ] Painel com contagens reais e links claros, sem financeiro ou estoque fictício.
- [ ] Agenda administrativa por data com botão Novo atendimento. Selecionar cliente, barbeiro, serviço e horário disponível; confirmar criação real; informar conflito; consultar e atualizar status permitido.
- [ ] Cadastro/edição/ativação/inativação de clientes e barbeiros, sem excluir histórico. Senha inicial com no mínimo 8 caracteres; senha opcional na edição.
- [ ] Cadastro/edição de serviços com preço em reais convertido exatamente para centavos, duração de 5 a 480 minutos e ativação. Referência da foto só preenche valores por escolha; não inventar duração ou inserir automaticamente no banco.
- [ ] Cliente pode agendar para si, consultar histórico e cancelar o que estiver autorizado. Barbeiro só vê e altera os atendimentos autorizados da própria agenda.
- [ ] Conta com troca de senha autenticada e recuperação por token de uso único/expiração enviado por e-mail. Não expor token nem permitir reset apenas informando e-mail. Indicar dependência do transporte de e-mail da hospedagem; não afirmar entrega sem comprovação.
- [ ] Verificar fluxos com banco local sintético, sem criar/alterar dados de produção durante testes. Revisão independente somente leitura; corrigir falhas concretas.
- [ ] Publicar apenas arquivos do site por FTP, preservando config.php, banco, API compatível e APK. Não publicar testes, dumps SQL, segredos, código mobile ou arquivos internos.
