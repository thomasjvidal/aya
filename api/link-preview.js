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

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Faltou o parâmetro url' });
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const html = await r.text();
    const image = extrairMeta(html, 'og:image') || extrairMeta(html, 'twitter:image');
    const title = extrairMeta(html, 'og:title') || extrairMeta(html, 'twitter:title');
    res.status(200).json({ image: image || null, title: title || null });
  } catch (err) {
    res.status(200).json({ image: null, title: null });
  }
};
