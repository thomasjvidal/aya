function extrairMeta(html, propriedade) {
  const padroes = [
    new RegExp(`<meta[^>]+property=["']${propriedade}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propriedade}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${propriedade}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${propriedade}["']`, 'i'),
  ];
  for (const padrao of padroes) {
    const m = html.match(padrao);
    if (m) return m[1];
  }
  return null;
}

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Faltou o parâmetro url' });
    return;
  }
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AyaLinkPreview/1.0)' },
      redirect: 'follow',
    });
    const html = await r.text();
    const image = extrairMeta(html, 'og:image') || extrairMeta(html, 'twitter:image');
    const title = extrairMeta(html, 'og:title');
    res.status(200).json({ image: image || null, title: title || null });
  } catch (err) {
    res.status(200).json({ image: null, title: null });
  }
};
