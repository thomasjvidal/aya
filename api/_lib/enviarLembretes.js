const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// Usado pelos dois crons (api/cron/manha.js e api/cron/noite.js) — o path de
// um cron do Vercel não pode ter query string, por isso são dois arquivos
// em vez de um só com ?tipo=.
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

async function enviarLembretes(req, res, tipo) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: 'Supabase ou VAPID não configurado' });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  webpush.setVapidDetails('mailto:contato@aya.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const [{ data: subs, error: subsErr }, { data: perfis }] = await Promise.all([
    supabaseAdmin.from('push_subscriptions').select('*'),
    supabaseAdmin.from('profiles').select('id,estilo'),
  ]);

  if (subsErr || !subs || !subs.length) {
    res.status(200).json({ ok: true, enviados: 0 });
    return;
  }

  const estiloPorUser = new Map((perfis || []).map((p) => [p.id, p.estilo]));
  let enviados = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const estilo = estiloPorUser.get(sub.user_id);
      const body = MENSAGENS_LEMBRETE[tipo][estilo] || MENSAGENS_LEMBRETE[tipo].default;
      const payload = JSON.stringify({ title: 'Aya', body, url: '/#add' });
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        enviados += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );

  res.status(200).json({ ok: true, enviados });
}

module.exports = { enviarLembretes };
