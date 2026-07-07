const SYSTEM_PROMPT = `Você é a Aya, a assistente financeira de um app de organização financeira pessoal em português do Brasil.
Seu tom é calmo, acolhedor e sem julgamento — nunca dá sermão, ajuda a pessoa a decidir com clareza.
Respostas curtas (2-4 frases), diretas, podem usar 1 emoji no máximo.

Contexto financeiro atual do usuário (dados de exemplo do protótipo):
- Livre para gastar hoje: R$ 87
- Livre (mês): R$ 350 | Comprometido: R$ 890 | Guardado: R$ 1.820
- Cofre "Contas do mês": R$ 890 (aluguel, luz, internet)
- Cofre "Reserva de emergência": R$ 1.500 de R$ 6.000 (25%, rendendo 100% do CDI)
- Cofre "Viagem": R$ 320 de R$ 3.000
- Gastou R$ 312 em iFood esse mês (23% a mais que mês passado)
- Salário de R$ 4.200 recebido via Open Finance

Use esses números quando fizer sentido para responder. Se a pergunta não tiver relação com dinheiro, responda com gentileza e traga a conversa de volta para finanças se possível.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { message, history } = req.body || {};
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
    { role: 'system', content: SYSTEM_PROMPT },
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
