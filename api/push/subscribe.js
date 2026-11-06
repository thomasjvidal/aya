const { cors } = require('../_lib/cors');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { subscription, accessToken, iosToken } = req.body || {};
  if ((!subscription && !iosToken) || !accessToken) {
    res.status(400).json({ error: 'Faltou subscription ou accessToken' });
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Sessão inválida' });
    return;
  }

  // App de iPhone: guarda o token do APNs (tabela dispositivos_ios, SQL 010).
  if (iosToken) {
    if (typeof iosToken !== 'string' || !/^[0-9a-fA-F]{32,200}$/.test(iosToken)) {
      res.status(400).json({ error: 'Token do aparelho inválido' });
      return;
    }
    // O mesmo iPhone pode trocar de conta: com a chave de serviço o aparelho passa pra quem está logado agora.
    const db = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : supabase;
    const { error: errIos } = await db.from('dispositivos_ios').upsert(
      { user_id: userData.user.id, token: iosToken },
      { onConflict: 'token' }
    );
    if (errIos) {
      res.status(500).json({ error: /dispositivos_ios/.test(errIos.message) ? 'Falta rodar o SQL 010 no Supabase' : errIos.message });
      return;
    }
    const { data: dev } = await db.from('dispositivos_ios').select('nudge_token').eq('token', iosToken).single();
    res.status(200).json({ ok: true, nudgeToken: dev?.nudge_token || null });
    return;
  }

  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Subscription incompleta' });
    return;
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const { data: row } = await supabase
    .from('push_subscriptions')
    .select('nudge_token')
    .eq('endpoint', endpoint)
    .single();

  res.status(200).json({ ok: true, nudgeToken: row?.nudge_token || null });
};
