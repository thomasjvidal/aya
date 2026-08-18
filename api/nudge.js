const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

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

  let body, url;
  if (tipo === 'manha' || tipo === 'noite') {
    let estilo = 'default';
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('estilo')
      .eq('id', sub.user_id)
      .single();
    if (perfil && MENSAGENS_LEMBRETE[tipo][perfil.estilo]) estilo = perfil.estilo;
    body = MENSAGENS_LEMBRETE[tipo][estilo];
    url = '/#add';
  } else if (tipo === 'banco') {
    body = 'Vi que você abriu o banco 🌿 Rolou alguma coisa? Toca aqui pra eu registrar rapidinho.';
    url = '/#add';
  } else {
    body = app
      ? `Vi que você abriu ${app} 🌿 Calma — respira 3 segundos comigo antes de decidir.`
      : 'Calma 🌿 Respira 3 segundos comigo antes de decidir essa compra.';
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
