// Idioma escolhido pela pessoa no app (salvo em user_metadata.idioma pelo index.html).
// 'pt' é o padrão.
async function idiomaDoUsuario(supabaseAdmin, userId) {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data && data.user && data.user.user_metadata && data.user.user_metadata.idioma === 'en' ? 'en' : 'pt';
  } catch (e) {
    return 'pt';
  }
}

module.exports = { idiomaDoUsuario };
