const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { subscription, accessToken } = req.body || {};
  if (!subscription || !accessToken) {
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
