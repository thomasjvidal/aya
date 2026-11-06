const { createClient } = require('@supabase/supabase-js');

// Confere o login de quem chamou (header "Authorization: Bearer <token do Supabase>").
// Devolve o usuário, ou responde 401 e devolve null.
async function exigirLogin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    res.status(401).json({ error: 'Entre na sua conta primeiro' });
    return null;
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) throw new Error('sessão inválida');
    return data.user;
  } catch (e) {
    res.status(401).json({ error: 'Sessão inválida, entre de novo' });
    return null;
  }
}

module.exports = { exigirLogin };
