const { cors } = require('./_lib/cors');
const { createClient } = require('@supabase/supabase-js');

async function listarTudo(bucket, pasta, supabaseAdmin) {
  const { data } = await supabaseAdmin.storage.from(bucket).list(pasta, { limit: 1000 });
  return data || [];
}

async function apagarArquivos(supabaseAdmin, uid) {
  const fotos = await listarTudo('avatars', uid, supabaseAdmin);
  if (fotos.length) await supabaseAdmin.storage.from('avatars').remove(fotos.map((f) => `${uid}/${f.name}`));

  // cofre-arquivos: <uid>/<id do cofre>/<arquivo>
  const pastasCofres = await listarTudo('cofre-arquivos', uid, supabaseAdmin);
  for (const pasta of pastasCofres) {
    const cofreId = pasta.name;
    const { data: cofre } = await supabaseAdmin.from('cofres').select('conta_id').eq('id', cofreId).maybeSingle();
    if (cofre && cofre.conta_id) {
      const { count } = await supabaseAdmin.from('conta_membros').select('user_id', { count: 'exact', head: true })
        .eq('conta_id', cofre.conta_id).neq('user_id', uid);
      if (count > 0) continue; // conta compartilhada: o arquivo continua com os outros membros
    }
    const arquivos = await listarTudo('cofre-arquivos', `${uid}/${cofreId}`, supabaseAdmin);
    if (arquivos.length) await supabaseAdmin.storage.from('cofre-arquivos').remove(arquivos.map((f) => `${uid}/${cofreId}/${f.name}`));
  }
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { accessToken } = req.body || {};
  if (!accessToken) {
    res.status(400).json({ error: 'Faltou o token de acesso' });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase não configurado' });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Sessão inválida' });
    return;
  }

  // LGPD: apaga também os arquivos da pessoa (foto de perfil e anexos dos cofres).
  // Anexos de cofres de contas compartilhadas ficam, porque continuam com os outros membros.
  try { await apagarArquivos(supabaseAdmin, userData.user.id); } catch (e) { /* não impede excluir a conta */ }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
  if (error) {
    res.status(500).json({ error: 'Falha ao excluir conta', detail: String(error) });
    return;
  }

  res.status(200).json({ ok: true });
};
