// Cotação do dólar comercial (quantos reais vale 1 dólar). Tenta a AwesomeAPI e, se
// ela falhar, a open.er-api.com. A pessoa sempre pode corrigir o valor no app.
async function buscarJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Aya/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  const fontes = [
    async () => {
      const j = await buscarJson('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      return { usdBrl: Number(j.USDBRL && j.USDBRL.bid), fonte: 'AwesomeAPI' };
    },
    async () => {
      const j = await buscarJson('https://open.er-api.com/v6/latest/USD');
      return { usdBrl: Number(j.rates && j.rates.BRL), fonte: 'ExchangeRate-API' };
    },
  ];
  for (const fonte of fontes) {
    try {
      const { usdBrl, fonte: nome } = await fonte();
      if (usdBrl > 0) {
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        res.status(200).json({ usdBrl, fonte: nome, em: new Date().toISOString() });
        return;
      }
    } catch (e) { /* tenta a próxima */ }
  }
  res.status(503).json({ error: 'Não consegui buscar a cotação agora' });
};
