// O app de iPhone (Capacitor) roda em capacitor://localhost e chama a API do site.
// Libera só essas origens além do próprio site. Devolve true quando já respondeu
// (pré-verificação OPTIONS) e a função deve parar.
const ORIGENS_APP = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'];

function cors(req, res) {
  const origem = req.headers.origin;
  if (origem && ORIGENS_APP.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { cors };
