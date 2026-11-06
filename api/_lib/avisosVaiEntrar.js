const { idiomaDoUsuario } = require('./idioma');
const { todosDestinos, enviarParaDestino } = require('./push');
const { processarEntradasAutomaticas, dataBrasil } = require('./entradasAutomaticas');

// Avisos do "Vai entrar" (rodam junto com o lembrete da manhã), pra todas as pessoas da
// conta (ex: os dois sócios da PJ), no idioma de cada uma:
//  - entrou sozinho hoje (auto_entrar): "Caiu mesmo? Confirme no app"
//  - entrou sozinho ontem e ninguém confirmou: "Ainda falta confirmar"
//  - sem entrada automática: o que cai hoje e o que era pra ter caído ontem

function formatarValor(valor, moeda, en) {
  const texto = Number(valor || 0).toLocaleString(en ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moeda === 'USD' ? 'US$' : 'R$'} ${texto}`;
}

const MENSAGENS = {
  entrou: (v, d, onde, en) => en
    ? `💰 ${v} came in automatically — ${d}${onde}, already split into your vaults. Did it really arrive? Confirm in the app.`
    : `💰 Entrou sozinho ${v} — ${d}${onde}, já separado nos cofres. Caiu mesmo? Confirme no app.`,
  falta: (v, d, onde, en) => en
    ? `⏳ Still needs confirming: ${v} — ${d}${onde}. Did it arrive?`
    : `⏳ Ainda falta confirmar: ${v} — ${d}${onde}. Caiu mesmo?`,
  hoje: (v, d, onde, en) => en
    ? `💰 Due today: ${v} — ${d}${onde}. Tap "Arrived!" when it lands.`
    : `💰 Hoje cai ${v} — ${d}${onde}. Toque em "Chegou!" quando cair.`,
  ontem: (v, d, onde, en) => en
    ? `⚠️ This was due yesterday: ${v} — ${d}${onde}. Did it arrive?`
    : `⚠️ Era pra ter caído ontem: ${v} — ${d}${onde}. Já caiu?`,
};

async function avisarVaiEntrar(supabaseAdmin) {
  const hoje = dataBrasil(0);
  const ontem = dataBrasil(1);

  // 1) Entradas automáticas do dia (precisa do SQL 011; sem ele não faz nada).
  let entrouHoje = [];
  try { entrouHoje = await processarEntradasAutomaticas(supabaseAdmin); } catch (e) { entrouHoje = []; }

  // 2) Entraram sozinhas ontem e ninguém confirmou.
  const { data: faltaConfirmar } = await supabaseAdmin.from('movimentos')
    .select('id,descricao,valor,conta_id,user_id').eq('tipo', 'entrada').eq('a_confirmar', true).eq('data_prevista', ontem);

  // 3) "Vai entrar" sem entrada automática: hoje e ontem.
  let { data: esperados, error } = await supabaseAdmin.from('movimentos')
    .select('id,descricao,valor,valor_original,moeda_original,data_prevista,conta_id,user_id,auto_entrar')
    .eq('tipo', 'esperado').in('data_prevista', [hoje, ontem]);
  if (error) {
    ({ data: esperados } = await supabaseAdmin.from('movimentos')
      .select('id,descricao,valor,valor_original,moeda_original,data_prevista,conta_id,user_id')
      .eq('tipo', 'esperado').in('data_prevista', [hoje, ontem]));
  }
  const avisos = [
    ...entrouHoje.map((m) => ({ m, tipo: 'entrou', naMoedaDaConta: true })),
    ...(faltaConfirmar || []).map((m) => ({ m, tipo: 'falta', naMoedaDaConta: true })),
    ...(esperados || []).filter((m) => !m.auto_entrar).map((m) => ({ m, tipo: m.data_prevista === hoje ? 'hoje' : 'ontem' })),
  ];
  if (!avisos.length) return 0;

  const contaIds = [...new Set(avisos.map((a) => a.m.conta_id).filter(Boolean))];
  const [{ data: contas }, { data: membros, error: errMembros }] = await Promise.all([
    contaIds.length ? supabaseAdmin.from('contas').select('id,nome,moeda').in('id', contaIds) : Promise.resolve({ data: [] }),
    contaIds.length ? supabaseAdmin.from('conta_membros').select('conta_id,user_id').in('conta_id', contaIds) : Promise.resolve({ data: [] }),
  ]);
  const contaPorId = new Map((contas || []).map((c) => [c.id, c]));
  const pessoas = (m) => {
    const lista = !errMembros ? (membros || []).filter((x) => x.conta_id === m.conta_id).map((x) => x.user_id) : [];
    return lista.length ? lista : [m.user_id];
  };

  const porPessoa = new Map();
  for (const a of avisos) for (const uid of pessoas(a.m)) {
    if (!porPessoa.has(uid)) porPessoa.set(uid, []);
    porPessoa.get(uid).push(a);
  }

  const destinos = await todosDestinos(supabaseAdmin);
  let enviados = 0;
  for (const [uid, lista] of porPessoa) {
    const aparelhos = destinos.filter((d) => d.user_id === uid);
    if (!aparelhos.length) continue;
    const en = (await idiomaDoUsuario(supabaseAdmin, uid)) === 'en';
    for (const { m, tipo, naMoedaDaConta } of lista.slice(0, 6)) {
      const conta = contaPorId.get(m.conta_id);
      const outra = !naMoedaDaConta && m.moeda_original && m.valor_original != null;
      const valor = formatarValor(outra ? m.valor_original : m.valor, outra ? m.moeda_original : (conta && conta.moeda) || 'BRL', en);
      const body = MENSAGENS[tipo](valor, m.descricao, conta ? ` (${conta.nome})` : '', en);
      for (const d of aparelhos) {
        if (await enviarParaDestino(supabaseAdmin, d, { title: 'Aya', body, url: '/' })) enviados += 1;
      }
    }
  }
  return enviados;
}

module.exports = { avisarVaiEntrar, dataBrasil };
