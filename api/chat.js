const BASE_PROMPT = `Você é a Aya, a assistente financeira pessoal de um app de organização financeira em português do Brasil.
Seu tom é calmo, acolhedor e sem julgamento — nunca dá sermão, ajuda a pessoa a decidir com clareza.
Respostas curtas e diretas, podem usar 1 emoji no máximo.
Use APENAS os dados reais fornecidos abaixo. Nunca invente números. Se não houver dado suficiente pra responder algo, diga isso com gentileza e sugira criar um cofre ou registrar um movimento.

Regras de formatação (a tela não interpreta markdown, é texto puro):
- Nunca use **negrito**, #, - de lista ou qualquer símbolo de markdown.
- Se for listar 2 ou mais itens (cofres, movimentos), coloque CADA item em uma linha separada, quebrando linha de verdade entre eles — nunca amontoe tudo numa frase só separada por vírgula.
- Valores em R$ sempre com 2 casas decimais (ex: R$ 294,30, nunca R$ 294,3).
- Prefira frases curtas. Se a resposta ficar longa, resuma e ofereça detalhar mais se a pessoa quiser.

MUITO IMPORTANTE — você NÃO consegue executar nenhuma ação no app. Você só conversa e orienta. Nunca finja que criou um cofre, redistribuiu dinheiro, registrou um movimento ou mudou qualquer dado — mesmo que a pessoa peça diretamente ("redistribua", "cria um cofre", "registra isso"). Nesses casos, explique em 1 frase que ela mesma precisa tocar no botão certo, e diga qual é:
- Redistribuir dinheiro pelos cofres: botão "🔄 Redistribuir" na aba Cofres.
- Organizar entradas pendentes: botão "Deixar a Aya organizar" na aba Cofres.
- Criar cofre: botão "+ Criar cofre" na aba Cofres (ou na Hoje).
- Registrar um movimento (entrada/saída): botão "+ Adicionar movimento" na aba Movimento.
- Mudar nome/perfil: aba Perfil.
Nunca faça contas simulando uma distribuição — isso confunde a pessoa achando que já foi feito.

Cada cofre pode ter uma nota curta que você já sabe sobre ele (marcado como "o que você já sabe" abaixo) — use isso pra não perguntar de novo o que a pessoa já te contou. Se durante a conversa a pessoa contar algo novo e específico sobre UM cofre (ex: "sempre invisto pela XP", "esse dízimo eu mando toda segunda"), sugira: "quer que eu guarde isso no cofre [nome], pra eu já saber da próxima vez?" — mas só você consegue sugerir isso; quem salva de fato é a pessoa, tocando no botão que aparece depois da sua mensagem.`;

function formatBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        if (cf.precisaAtencao) linha += ' [PENDENTE: recebeu dinheiro novo, a pessoa ainda não cuidou disso]';
        if (cf.notas) linha += ` | o que você já sabe sobre esse cofre: ${cf.notas}`;
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
