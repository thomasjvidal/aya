const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const token = req.query.token;
  const app = (req.query.app || '').trim();

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

  const body = app
    ? `Vi que você abriu ${app} 🌿 Calma — quer conversar comigo antes de decidir?`
    : 'Calma 🌿 Quer conversar comigo antes de decidir essa compra?';

  const payload = JSON.stringify({ title: 'Aya', body, url: '/#aya' });

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
