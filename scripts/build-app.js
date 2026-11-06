// Monta a pasta www/ que vai dentro do app de iPhone (Capacitor), a partir dos mesmos
// arquivos do site. A API continua no site da Vercel: AYA_API_URL diz qual é o endereço.
//   AYA_API_URL=https://seu-site.vercel.app node scripts/build-app.js
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const www = path.join(raiz, 'www');
const ARQUIVOS = ['index.html', 'i18n.js', 'i18n-en.js', 'privacidade.html', 'termos.html', 'favicon.ico', 'manifest.json'];
const PASTAS = ['icons'];

const api = (process.env.AYA_API_URL || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(api)) {
  console.error('Defina AYA_API_URL com o endereço https do site (ex: https://aya.vercel.app).');
  process.exit(1);
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const f of ARQUIVOS) fs.copyFileSync(path.join(raiz, f), path.join(www, f));
for (const d of PASTAS) fs.cpSync(path.join(raiz, d), path.join(www, d), { recursive: true });
fs.writeFileSync(path.join(www, 'app-config.js'),
  `// Gerado por scripts/build-app.js\nwindow.AYA_API_BASE=${JSON.stringify(api)};\n`);
console.log('www/ pronto, API em', api);
