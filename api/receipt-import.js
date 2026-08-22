const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const PROMPT = `Essa imagem é um comprovante ou extrato de uma transação bancária (Pix, transferência, pagamento). Extraia os dados e responda SOMENTE com um JSON puro, sem texto antes ou depois, exatamente neste formato:
{"tipo":"entrada" ou "saida","valor":numero (sem R$, sem separador de milhar, use ponto decimal),"descricao":"string curta descrevendo a transação","pessoa":"nome de quem recebeu (se saída) ou de quem pagou (se entrada), ou null se não der pra ver"}
Dinheiro SAINDO da conta do dono do comprovante (Pix enviado, pagamento, compra) é tipo "saida". Dinheiro ENTRANDO (Pix recebido, depósito) é tipo "entrada".
Se a imagem não for um comprovante financeiro reconhecível, responda apenas {"erro":"não consegui identificar um comprovante nessa imagem"}.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = req.query.token || (req.body && req.body.token);
  const image = req.body && req.body.image;
  if (!token) {
    res.status(400).json({ error: 'Faltou o parâmetro token' });
    return;
  }
  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'Faltou a imagem' });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase não configurado' });
    return;
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY não configurada no ambiente' });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sub, error: subError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('nudge_token', token)
    .single();
  if (subError || !sub) {
    res.status(404).json({ error: 'Inscrição não encontrada pra esse token' });
    return;
  }

  const dataUri = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
  const visionModel = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

  let extraido;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });
    if (!groqRes.ok) {
      const detail = await groqRes.text();
      res.status(502).json({ error: 'Erro ao consultar o modelo de visão da Groq (confere se GROQ_VISION_MODEL ainda é válido)', detail });
      return;
    }
    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    extraido = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (err) {
    res.status(500).json({ error: 'Não consegui ler a imagem', detail: String(err) });
    return;
  }

  const valorValido = extraido && typeof extraido.valor === 'number' && extraido.valor > 0;
  const tipoValido = extraido && (extraido.tipo === 'entrada' || extraido.tipo === 'saida');
  if (!extraido || extraido.erro || !valorValido || !tipoValido) {
    res.status(422).json({ error: (extraido && extraido.erro) || 'Não consegui identificar valor e tipo nesse comprovante. Registra na mão dessa vez 🌿' });
    return;
  }

  const descricao = String(extraido.descricao || (extraido.tipo === 'saida' ? 'Saída via comprovante' : 'Entrada via comprovante')).slice(0, 200);
  const pessoa = extraido.pessoa ? String(extraido.pessoa).slice(0, 120) : null;

  // O atalho não sabe qual conta (Pessoal/PJ) está ativa no app — cai sempre na Pessoal.
  const { data: contaPessoal } = await supabaseAdmin
    .from('contas')
    .select('id')
    .eq('user_id', sub.user_id)
    .eq('tipo', 'pessoal')
    .single();

  const { error: insertError } = await supabaseAdmin.from('movimentos').insert({
    user_id: sub.user_id,
    conta_id: contaPessoal ? contaPessoal.id : null,
    descricao,
    valor: extraido.valor,
    tipo: extraido.tipo,
    cofre_id: null,
    pessoa,
  });
  if (insertError) {
    res.status(500).json({ error: 'Não consegui salvar o movimento', detail: insertError.message });
    return;
  }

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails('mailto:contato@aya.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const sinal = extraido.tipo === 'entrada' ? '+' : '−';
    const valorTxt = extraido.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const body = `Registrei ${sinal} R$ ${valorTxt} — ${descricao} 🌿 Toca pra conferir.`;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title: 'Aya', body, url: '/#mov' })
      );
    } catch (pushErr) {
      // Registro já foi salvo — falha no push não deve derrubar a resposta.
    }
  }

  res.status(200).json({ ok: true, tipo: extraido.tipo, valor: extraido.valor, descricao });
};
