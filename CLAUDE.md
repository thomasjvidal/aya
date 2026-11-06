# Aya

## Regras do projeto

- **Nunca enviar nada pra `main` sem o dono pedir explicitamente.** O site na Vercel
  tem limite diário de deploys.
- Cada push (inclusive em branch) gera um deploy de pré-visualização na Vercel:
  juntar as mudanças e fazer poucos pushes.
- SQL novo vai em `supabase/migration_NNN_*.sql`, idempotente (pode rodar 2x), e o
  dono roda colando no SQL Editor do Supabase (ele trabalha pelo celular).

## Idiomas (português e inglês)

O app é escrito em português e pode ser usado em inglês (seletor no login e no Perfil).
A tradução é feita na hora por `i18n.js`, usando o dicionário `i18n-en.js`.

**Todo texto novo que aparece pra pessoa precisa de uma linha em `i18n-en.js`**
(tela, botão, toast, placeholder, `title`, `confirm`/`alert`). Valores dinâmicos
entram como marcadores na chave: `{R}` valor em R$, `{N}` número, `{X}` qualquer
texto; no inglês use `{0}`, `{1}`… na ordem. Mensagens geradas no servidor
(`api/`) usam `api/_lib/idioma.js` pra saber o idioma da pessoa.

## Site e app de iPhone

- O site (Vercel) é onde tudo é testado primeiro. O app de iPhone (Capacitor, pasta
  `ios/`) usa os mesmos arquivos: `scripts/build-app.js` copia o site pra `www/` e
  grava em `app-config.js` o endereço da API (`AYA_API_URL`, o site na Vercel).
- O build do app roda no Codemagic (`codemagic.yaml`) e vai pro TestFlight.
- No app, plugins nativos ficam em `window.Capacitor.Plugins` (`pluginNativo()` no
  `index.html`); `ehAppNativo()` diz se está no iPhone. Chamadas à API usam
  `apiFetch()` (com `comLogin` quando a API exige login).
- Notificações: web push no site e APNs no app (`api/_lib/push.js`).

## Segurança

- APIs que gastam dinheiro ou buscam coisas de fora (chat, link-preview) exigem login
  (`api/_lib/auth.js`). APIs chamadas pelo app de iPhone usam `api/_lib/cors.js`.
- Texto digitado pela pessoa sempre passa por `escapeHtml()` antes de ir pro HTML;
  links abertos passam por `linkSeguro()`/`abrirLink()`.
- Chat e leitura de comprovantes só com o consentimento de IA
  (`user_metadata.ia_consentimento`).
