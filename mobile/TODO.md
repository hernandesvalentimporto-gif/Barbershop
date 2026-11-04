# Barber Shop Sistemas HP

Referência mais recente do usuário: logo original Barber Shop Sistemas HP, preto #080808 e dourado #E7B94E, cartões grafite e texto branco. Esta referência substitui Agenda Cobalto. Interface em português brasileiro. Estoque e financeiro da imagem são apenas referência visual, fora do escopo funcional aprovado.

- [ ] Aplicativo Android compilável com geração de APK instalável. Preservar os identificadores do projeto; não confundir Preview com APK.
- [ ] Login integrado à API existente, com acesso conforme o perfil de cliente, barbeiro ou administrador. Guardar token no armazenamento seguro nativo; não incluir credenciais do servidor no aplicativo.
- [ ] Agendamento para clientes, incluindo consulta de serviços, barbeiros, datas e horários disponíveis. Confirmar no servidor; informar conflitos e erros de rede sem criar reservas fictícias.
- [ ] Histórico do cliente com visualização dos agendamentos anteriores e atuais.
- [ ] Agenda do barbeiro com visualização dos atendimentos marcados e ações autorizadas de status.
- [ ] Gerenciamento básico de clientes pelo administrador: cadastro, edição e ativação/inativação, sem excluir histórico.
- [ ] Gerenciamento básico de barbeiros pelo administrador: cadastro, edição e ativação/inativação, sem excluir histórico.
- [ ] Gerenciamento básico de serviços pelo administrador: cadastro, edição, duração, preço e ativação/inativação.
- [ ] Usar a foto da tabela de preços como referência editável no cadastro de serviços, mantendo valores encobertos pendentes de confirmação. Não inferir durações ausentes nem atualizar preços de produção automaticamente.
- [ ] Integração com https://sistemashp.com.br/barbershop/api.php, preservando o servidor e o banco de dados atuais. Não executar testes de escrita em produção.
- [ ] Alterações do repositório do usuário preparadas em branch separada, sem implantação automática ou alteração imediata do ambiente publicado. Complementos PHP necessários serão claramente indicados como pendentes de implantação.
- [ ] Verificação independente e somente leitura da implementação, com correções dos problemas concretos encontrados.
