// "Vai entrar" com auto_entrar (SQL 011): no dia previsto o valor entra sozinho na conta,
// já vai pros cofres (um cofre escolhido ou dividido pelas % dos cofres) e fica marcado
// a_confirmar até alguém tocar em "Caiu" / "Outro valor" / "Não caiu" no app.
// Roda no lembrete da manhã (cron). Também anota o próximo mês do recorrente/contrato.

function dataBrasil(diasAtras) {
  return new Date(Date.now() - 3 * 3600 * 1000 - (diasAtras || 0) * 86400000).toISOString().slice(0, 10);
}

function proximoMes(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(a, m, Math.min(d, ultimo)));
  return alvo.toISOString().slice(0, 10);
}

// Mesmo formato do app: 'mensal' ou 'contrato:N:K'.
function proximaCategoria(categoria) {
  const c = String(categoria || '');
  if (c === 'mensal') return 'mensal';
  const x = c.match(/^contrato:(\d+):(\d+)$/);
  if (x && Number(x[2]) < Number(x[1])) return `contrato:${x[1]}:${Number(x[2]) + 1}`;
  return null; // último pagamento do contrato: o app pergunta se renova ao confirmar
}

async function cotacaoDolar() {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { headers: { 'User-Agent': 'Aya/1.0' } });
    const j = await r.json();
    const v = Number(j.USDBRL && j.USDBRL.bid);
    return v > 0 ? v : null;
  } catch (e) {
    return null;
  }
}

const arred = (v) => Math.round(v * 100) / 100;

async function processarEntradasAutomaticas(supabaseAdmin) {
  const hoje = dataBrasil(0);
  const { data: itens, error } = await supabaseAdmin
    .from('movimentos').select('*')
    .eq('tipo', 'esperado').eq('auto_entrar', true).lte('data_prevista', hoje);
  if (error || !itens || !itens.length) return [];

  const { data: contas } = await supabaseAdmin.from('contas').select('id,nome,moeda')
    .in('id', [...new Set(itens.map((m) => m.conta_id).filter(Boolean))]);
  const contaPorId = new Map((contas || []).map((c) => [c.id, c]));
  let cot = null;
  const feitos = [];

  for (const m of itens) {
    // Trava: só processa se ainda for "esperado" (evita entrar duas vezes).
    const { data: travado } = await supabaseAdmin.from('movimentos')
      .update({ tipo: 'entrada', organizado: true, a_confirmar: true })
      .eq('id', m.id).eq('tipo', 'esperado').select('id');
    if (!travado || !travado.length) continue;

    // Valor na moeda da conta (contrato em dólar numa conta em real: cotação do dia).
    const conta = contaPorId.get(m.conta_id);
    const moedaConta = (conta && conta.moeda) || 'BRL';
    let valor = Number(m.valor || 0);
    if (m.moeda_original && m.valor_original != null && m.moeda_original !== moedaConta) {
      if (!cot) cot = await cotacaoDolar();
      const c = cot || Number(m.cotacao) || 0;
      if (c > 0) {
        valor = arred(m.moeda_original === 'USD' ? Number(m.valor_original) * c : Number(m.valor_original) / c);
        await supabaseAdmin.from('movimentos').update({ valor, cotacao: c }).eq('id', m.id);
      }
    }

    // Pra onde vai: um cofre escolhido, ou dividido pelas % (o resto fica Livre).
    let cofres = [];
    if (m.auto_cofre_id) {
      const { data } = await supabaseAdmin.from('cofres').select('id,valor_atual').eq('id', m.auto_cofre_id);
      cofres = (data || []).map((c) => ({ ...c, parte: valor }));
    } else if (m.conta_id) {
      const { data } = await supabaseAdmin.from('cofres').select('id,valor_atual,percentual')
        .eq('conta_id', m.conta_id).eq('meta_tipo', 'percentual').not('percentual', 'is', null);
      cofres = (data || []).map((c) => ({ ...c, parte: arred(valor * (Number(c.percentual) || 0) / 100) }));
    }
    for (const c of cofres) {
      if (!(c.parte > 0)) continue;
      await supabaseAdmin.from('cofres').update({ valor_atual: arred(Number(c.valor_atual || 0) + c.parte) }).eq('id', c.id);
      await supabaseAdmin.from('distribuicoes').insert({ movimento_id: m.id, cofre_id: c.id, valor: c.parte });
    }

    // Próximo mês do recorrente / contrato.
    const prox = proximaCategoria(m.categoria);
    if (prox) {
      await supabaseAdmin.from('movimentos').insert({
        user_id: m.user_id, conta_id: m.conta_id, descricao: m.descricao, valor: m.valor, tipo: 'esperado',
        cofre_id: null, pessoa: m.pessoa || null, data_prevista: proximoMes(m.data_prevista || hoje),
        categoria: prox, valor_original: m.valor_original, moeda_original: m.moeda_original, cotacao: m.cotacao,
        auto_entrar: true, auto_cofre_id: m.auto_cofre_id || null,
      });
    }
    feitos.push({ ...m, valor, conta });
  }
  return feitos;
}

module.exports = { processarEntradasAutomaticas, dataBrasil, proximoMes, proximaCategoria };
