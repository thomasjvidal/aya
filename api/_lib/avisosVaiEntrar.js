const { idiomaDoUsuario } = require('./idioma');
const { todosDestinos, enviarParaDestino } = require('./push');

// Avisos do "Vai entrar" (rodam junto com o lembrete da manhã):
//  - o que deve cair hoje
//  - o que era pra ter caído ontem e ninguém confirmou ("Chegou!")
// Vão pra todas as pessoas da conta (ex: os dois sócios da PJ).

function dataBrasil(diasAtras) {
  // Dia de hoje no horário de Brasília (UTC-3), em AAAA-MM-DD.
  return new Date(Date.now() - 3 * 3600 * 1000 - diasAtras * 86400000).toISOString().slice(0, 10);
}

function formatarValor(valor, moeda, en) {
  const n = Number(valor || 0);
  const local = en ? 'en-US' : 'pt-BR';
  const texto = n.toLocaleString(local, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moeda === 'USD' ? 'US$' : 'R$'} ${texto}`;
}

async function avisarVaiEntrar(supabaseAdmin) {
  const hoje = dataBrasil(0);
  const ontem = dataBrasil(1);
  const { data: itens, error } = await supabaseAdmin
    .from('movimentos')
    .select('id,descricao,valor,valor_original,moeda_original,data_prevista,conta_id,user_id')
    .eq('tipo', 'esperado')
    .in('data_prevista', [hoje, ontem]);
  if (error || !itens || !itens.length) return 0;

  const contaIds = [...new Set(itens.map((m) => m.conta_id).filter(Boolean))];
  const [{ data: contas }, { data: membros, error: errMembros }] = await Promise.all([
    contaIds.length ? supabaseAdmin.from('contas').select('id,nome,moeda').in('id', contaIds) : Promise.resolve({ data: [] }),
    contaIds.length ? supabaseAdmin.from('conta_membros').select('conta_id,user_id').in('conta_id', contaIds) : Promise.resolve({ data: [] }),
  ]);
  const contaPorId = new Map((contas || []).map((c) => [c.id, c]));

  // Quem recebe o aviso de cada item: membros da conta (ou quem criou, se não tiver o SQL 008).
  const pessoasDoItem = (m) => {
    const lista = !errMembros ? (membros || []).filter((x) => x.conta_id === m.conta_id).map((x) => x.user_id) : [];
    return lista.length ? lista : [m.user_id];
  };

  const porPessoa = new Map();
  for (const m of itens) {
    for (const uid of pessoasDoItem(m)) {
      if (!porPessoa.has(uid)) porPessoa.set(uid, []);
      porPessoa.get(uid).push(m);
    }
  }
  if (!porPessoa.size) return 0;

  const destinos = await todosDestinos(supabaseAdmin);
  let enviados = 0;
  for (const [uid, lista] of porPessoa) {
    const aparelhos = destinos.filter((d) => d.user_id === uid);
    if (!aparelhos.length) continue;
    const en = (await idiomaDoUsuario(supabaseAdmin, uid)) === 'en';
    for (const m of lista.slice(0, 5)) {
      const conta = contaPorId.get(m.conta_id);
      const emOutraMoeda = m.moeda_original && m.valor_original != null;
      const valor = formatarValor(emOutraMoeda ? m.valor_original : m.valor, emOutraMoeda ? m.moeda_original : (conta && conta.moeda) || 'BRL', en);
      const onde = conta ? ` (${conta.nome})` : '';
      const body = m.data_prevista === hoje
        ? (en ? `💰 Due today: ${valor} — ${m.descricao}${onde}. Tap "Arrived!" when it lands.`
              : `💰 Hoje cai ${valor} — ${m.descricao}${onde}. Toque em "Chegou!" quando cair.`)
        : (en ? `⚠️ This was due yesterday: ${valor} — ${m.descricao}${onde}. Did it arrive?`
              : `⚠️ Era pra ter caído ontem: ${valor} — ${m.descricao}${onde}. Já caiu?`);
      for (const d of aparelhos) {
        if (await enviarParaDestino(supabaseAdmin, d, { title: 'Aya', body, url: '/' })) enviados += 1;
      }
    }
  }
  return enviados;
}

module.exports = { avisarVaiEntrar, dataBrasil };
