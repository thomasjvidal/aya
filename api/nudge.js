const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const { idiomaDoUsuario } = require('./_lib/idioma');

module.exports = async (req, res) => {
  const token = req.query.token;
  const app = (req.query.app || '').trim();
  const tipo = (req.query.tipo || '').trim();

  if (!token) {
    res.status(400).json({ error: 'Faltou o parâmetro token' });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase não configurado' });
    return;
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: 'VAPID não configurado' });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  webpush.setVapidDetails('mailto:contato@aya.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const { data: sub, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('nudge_token', token)
    .single();

  if (error || !sub) {
    res.status(404).json({ error: 'Inscrição não encontrada pra esse token' });
    return;
  }

  const MENSAGENS_LEMBRETE = {
    manha: {
      aperto: 'Bom dia 🌧️ Antes de sair de casa, dá uma olhada no que ficou pendente de ontem — evita perder o fio de novo.',
      auto: 'Bom dia 💼 Separou o que entrou ontem entre PF e PJ? Registra rapidinho antes do dia engolir.',
      impulso: 'Bom dia ⚡ Começa o dia registrando o que rolou ontem — ajuda a notar os padrões antes da tentação bater.',
      default: 'Bom dia 🌿 O que ficou de ontem pra registrar? Começa o dia com as contas em dia.',
    },
    noite: {
      aperto: 'Boa noite 🌧️ Fecha o dia comigo: o que saiu hoje? Não deixa acumular.',
      auto: 'Boa noite 💼 Bateu o dia? Registra o que entrou e saiu antes de dormir, separado por PF/PJ.',
      impulso: 'Boa noite ⚡ Antes de dormir, registra o que rolou hoje — inclusive aquela vontade de comprar que você resistiu (ou não).',
      default: 'Boa noite 🌿 Fecha o dia registrando o que rolou. Assim você não perde o fio de novo.',
    },
  };

  const MENSAGENS_LEMBRETE_EN = {
    manha: {
      aperto: "Good morning 🌧️ Before you head out, take a look at what's left from yesterday — so you don't lose track again.",
      auto: 'Good morning 💼 Did you split what came in yesterday between personal and business? Log it quickly before the day takes over.',
      impulso: "Good morning ⚡ Start the day logging what happened yesterday — it helps you notice patterns before temptation hits.",
      default: "Good morning 🌿 Anything from yesterday to log? Start the day with your accounts up to date.",
    },
    noite: {
      aperto: "Good evening 🌧️ Wrap up the day with me: what went out today? Don't let it pile up.",
      auto: 'Good evening 💼 Done for the day? Log what came in and went out before bed, split by personal/business.',
      impulso: "Good evening ⚡ Before bed, log what happened today — including that urge to buy you resisted (or didn't).",
      default: "Good evening 🌿 Wrap up the day by logging what happened. That way you don't lose track again.",
    },
  };

  const en = (await idiomaDoUsuario(supabaseAdmin, sub.user_id)) === 'en';
  let body, url;
  if (tipo === 'manha' || tipo === 'noite') {
    let estilo = 'default';
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('estilo')
      .eq('id', sub.user_id)
      .single();
    if (perfil && MENSAGENS_LEMBRETE[tipo][perfil.estilo]) estilo = perfil.estilo;
    body = (en ? MENSAGENS_LEMBRETE_EN : MENSAGENS_LEMBRETE)[tipo][estilo];
    url = '/#add';
  } else if (tipo === 'banco') {
    body = en
      ? 'I saw you opened your bank 🌿 Anything happen? Tap here and I\'ll log it quickly.'
      : 'Vi que você abriu o banco 🌿 Rolou alguma coisa? Toca aqui pra eu registrar rapidinho.';
    url = '/#add';
  } else {
    body = en
      ? (app
        ? `I saw you opened ${app} 🌿 Easy — breathe with me for 3 seconds before deciding.`
        : 'Easy 🌿 Breathe with me for 3 seconds before deciding on this purchase.')
      : (app
        ? `Vi que você abriu ${app} 🌿 Calma — respira 3 segundos comigo antes de decidir.`
        : 'Calma 🌿 Respira 3 segundos comigo antes de decidir essa compra.');
    url = app ? `/#calma=${encodeURIComponent(app)}` : '/#calma';
  }

  const payload = JSON.stringify({ title: 'Aya', body, url });

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      payload
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
    }
    res.status(500).json({ error: 'Falha ao enviar notificação', detail: String(err) });
  }
};
