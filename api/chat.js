const BASE_PROMPT = `Você é a Aya, a assistente financeira pessoal de um app de organização financeira em português do Brasil.
Seu tom é calmo, acolhedor e sem julgamento — nunca dá sermão, ajuda a pessoa a decidir com clareza.
Respostas curtas (2-4 frases), diretas, podem usar 1 emoji no máximo.
Use APENAS os dados reais fornecidos abaixo. Nunca invente números. Se não houver dado suficiente pra responder algo, diga isso com gentileza e sugira criar um cofre ou registrar um movimento.`;

function formatBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function buildSystemPrompt(context) {
  const c = context || {};
  const nome = c.nome || 'a pessoa usando o app';
  const estiloMap = {
    aperto: 'vive no aperto — foco em sair do vermelho, sem julgamento',
    auto: 'autônomo/MEI — separa imposto, 13º, mistura PF com PJ',
    impulso: 'gasta por impulso — precisa de mais freio na hora da tentação',
  };
  const estiloTxt = estiloMap[c.estilo] || 'perfil ainda não definido';

  const cofres = Array.isArray(c.cofres) ? c.cofres : [];
  const cofresTxt = cofres.length
    ? cofres.map((cf) => {
        let linha = `- "${cf.nome}" (${cf.tipo || 'guardado'}): ${formatBRL(cf.valor_atual)}`;
        if (cf.valor_meta) linha += ` de meta ${formatBRL(cf.valor_meta)}`;
        if (cf.percentual) linha += `, recebe ${cf.percentual}% de cada entrada registrada`;
        return linha;
      }).join('\n')
    : 'Nenhum cofre criado ainda.';

  const movs = Array.isArray(c.movimentosRecentes) ? c.movimentosRecentes : [];
  const movsTxt = movs.length
    ? movs.map((m) => `- ${m.tipo === 'entrada' ? '+' : '-'}${formatBRL(m.valor)} — ${m.descricao}`).join('\n')
    : 'Nenhum movimento registrado ainda.';

  return `${BASE_PROMPT}

Nome do usuário: ${nome}
Perfil: ${estiloTxt}

Cofres reais de ${nome}:
${cofresTxt}

Últimos movimentos registrados por ${nome}:
${movsTxt}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { message, history, context } = req.body || {};
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing "message" field' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY não configurada no ambiente' });
    return;
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...(Array.isArray(history) ? history.slice(-10) : []),
    { role: 'user', content: message },
  ];

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text();
      res.status(502).json({ error: 'Erro ao consultar a Groq', detail });
      return;
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim()
      || 'Desculpa, não consegui pensar em nada agora 🌿';
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno', detail: String(err) });
  }
};
