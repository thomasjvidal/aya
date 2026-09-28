# Aya

## Idiomas (português e inglês)

O app é escrito em português e pode ser usado em inglês (seletor no login e no Perfil).
A tradução é feita na hora por `i18n.js`, usando o dicionário `i18n-en.js`.

**Todo texto novo que aparece pra pessoa precisa de uma linha em `i18n-en.js`**
(tela, botão, toast, placeholder, `title`, `confirm`/`alert`). Valores dinâmicos
entram como marcadores na chave: `{R}` valor em R$, `{N}` número, `{X}` qualquer
texto; no inglês use `{0}`, `{1}`… na ordem. Mensagens geradas no servidor
(`api/`) usam `api/_lib/idioma.js` pra saber o idioma da pessoa.
