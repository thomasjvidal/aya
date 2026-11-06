const dns = require('dns').promises;
const net = require('net');
const { exigirLogin } = require('./_lib/auth');
const { cors } = require('./_lib/cors');

function extrairMeta(html, propriedade) {
  const padroes = [
    new RegExp(`<meta[^>]+property=["']${propriedade}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propriedade}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${propriedade}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${propriedade}["']`, 'i'),
  ];
  for (const padrao of padroes) {
    const m = html.match(padrao);
    if (m) return decodeEntidades(m[1]);
  }
  return null;
}

function decodeEntidades(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Só deixa buscar endereços públicos (http/https). Bloqueia IPs internos, localhost
// e a rede da nuvem, pra ninguém usar o servidor pra acessar o que não devia.
function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return ipPrivado(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
async function urlSegura(texto) {
  let u;
  try { u = new URL(texto); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length || ips.some(ipPrivado)) return null;
  return u;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = await exigirLogin(req, res);
  if (!user) return;
  const url = req.query.url;
  if (!url || typeof url !== 'string' || url.length > 2000) {
    res.status(400).json({ error: 'Faltou o parâmetro url' });
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Segue redirecionamentos na mão (no máximo 4), conferindo cada destino.
    let atual = await urlSegura(url);
    let r = null;
    for (let i = 0; atual && i < 5; i++) {
      r = await fetch(atual.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        atual = await urlSegura(new URL(r.headers.get('location'), atual).toString());
        r = null;
        continue;
      }
      break;
    }
    if (!r) { clearTimeout(timeout); res.status(200).json({ image: null, title: null }); return; }
    // Lê no máximo 1 MB da página (o og:image fica no começo).
    let html = '';
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    while (html.length < 1000000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch (e) {}
    clearTimeout(timeout);
    const image = extrairMeta(html, 'og:image') || extrairMeta(html, 'twitter:image');
    const title = extrairMeta(html, 'og:title') || extrairMeta(html, 'twitter:title');
    res.status(200).json({ image: image && /^https?:\/\//i.test(image) ? image : null, title: title || null });
  } catch (err) {
    res.status(200).json({ image: null, title: null });
  }
};
