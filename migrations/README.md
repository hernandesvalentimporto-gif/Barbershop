# Migrações SaaS

## 001_saas_foundation.sql

Execute a migração uma vez no banco do Barbershop, depois de fazer um backup. Ela cria planos, assinaturas, eventos de cobrança, adiciona `platform_admin` às contas e cria o trial de 30 dias para cada barbearia existente que ainda não possua assinatura.

A migração é idempotente: executá-la novamente não reinicia o trial existente.

Depois de identificar o e-mail correto da conta que será a administradora global, ative somente essa conta com uma instrução equivalente a:

```sql
UPDATE bs_users
SET platform_admin = 1
WHERE email = 'SEU_EMAIL_ADMINISTRATIVO_EXATO';
```

Não coloque senha no arquivo, no GitHub ou no chat. A conta deve usar o fluxo normal de recuperação/troca de senha.

A implantação do código web deve acontecer somente depois da migração, porque o login passa a ler a coluna `platform_admin`.
