// Dados que a pessoa escolheu no app e ficam em user_metadata (salvos pelo index.html):
// idioma ('pt' padrão ou 'en') e o consentimento pra IA (ia_consentimento).
async function metadadosDoUsuario(supabaseAdmin, userId) {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return (data && data.user && data.user.user_metadata) || {};
  } catch (e) {
    return {};
  }
}

async function idiomaDoUsuario(supabaseAdmin, userId) {
  const meta = await metadadosDoUsuario(supabaseAdmin, userId);
  return meta.idioma === 'en' ? 'en' : 'pt';
}

module.exports = { idiomaDoUsuario, metadadosDoUsuario };
