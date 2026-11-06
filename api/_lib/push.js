const webpush = require('web-push');
const http2 = require('http2');
const crypto = require('crypto');

// Notificações vão pra dois tipos de aparelho:
//  - 'web': site aberto no navegador / Tela de Início (Web Push, tabela push_subscriptions)
//  - 'ios': app de iPhone (APNs da Apple, tabela dispositivos_ios — SQL 010)
// Cada aparelho tem um nudge_token, usado pelos atalhos do iPhone (avisos e comprovantes).
//
// APNs precisa destas variáveis na Vercel:
//   APNS_KEY (conteúdo do arquivo .p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
//   APNS_SANDBOX=1 só pra testar com build de desenvolvimento (TestFlight e App Store usam produção)

function webConfigurado() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:contato@aya.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

function apnsConfigurado() {
  return !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);
}

let jwtCache = null;
function jwtApns() {
  // O token da Apple vale 1h; renova a cada 50 min.
  if (jwtCache && Date.now() - jwtCache.em < 50 * 60 * 1000) return jwtCache.token;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const dados = `${b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID })}.${b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })}`;
  const chave = process.env.APNS_KEY.replace(/\\n/g, '\n');
  const assinatura = crypto.sign('sha256', Buffer.from(dados), { key: chave, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwtCache = { token: `${dados}.${assinatura}`, em: Date.now() };
  return jwtCache.token;
}

function enviarApns(deviceToken, msg) {
  return new Promise((resolve) => {
    const host = process.env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    let cliente;
    try { cliente = http2.connect(host); } catch (e) { resolve({ ok: false, status: 0 }); return; }
    cliente.on('error', () => resolve({ ok: false, status: 0 }));
    const req = cliente.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwtApns()}`,
      'apns-topic': process.env.APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let corpo = '';
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (d) => { corpo += d; });
    req.on('end', () => {
      cliente.close();
      let motivo = '';
      try { motivo = JSON.parse(corpo).reason || ''; } catch (e) {}
      resolve({ ok: status === 200, status, motivo });
    });
    req.on('error', () => { cliente.close(); resolve({ ok: false, status: 0 }); });
    req.setTimeout(10000, () => { req.close(); });
    req.end(JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' }, url: msg.url || '/' }));
  });
}

// Manda pra um aparelho. Se o aparelho não existe mais, apaga o registro dele.
async function enviarParaDestino(supabaseAdmin, destino, msg) {
  if (destino.tipo === 'ios') {
    if (!apnsConfigurado()) return false;
    const r = await enviarApns(destino.row.token, msg);
    if (r.status === 410 || r.motivo === 'BadDeviceToken' || r.motivo === 'Unregistered') {
      await supabaseAdmin.from('dispositivos_ios').delete().eq('id', destino.row.id);
    }
    return r.ok;
  }
  if (!webConfigurado()) return false;
  const sub = destino.row;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/' })
    );
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
    }
    return false;
  }
}

// Acha o aparelho pelo nudge_token (web ou iPhone).
async function buscarPorToken(supabaseAdmin, token) {
  const { data: web } = await supabaseAdmin.from('push_subscriptions').select('*').eq('nudge_token', token).maybeSingle();
  if (web) return { tipo: 'web', row: web, user_id: web.user_id };
  const { data: ios, error } = await supabaseAdmin.from('dispositivos_ios').select('*').eq('nudge_token', token).maybeSingle();
  if (!error && ios) return { tipo: 'ios', row: ios, user_id: ios.user_id };
  return null;
}

// Todos os aparelhos (pros lembretes de manhã e de noite).
async function todosDestinos(supabaseAdmin) {
  const [{ data: web }, { data: ios, error: errIos }] = await Promise.all([
    supabaseAdmin.from('push_subscriptions').select('*'),
    supabaseAdmin.from('dispositivos_ios').select('*'),
  ]);
  return [
    ...(web || []).map((row) => ({ tipo: 'web', row, user_id: row.user_id })),
    ...(!errIos && ios ? ios : []).map((row) => ({ tipo: 'ios', row, user_id: row.user_id })),
  ];
}

module.exports = { enviarParaDestino, buscarPorToken, todosDestinos, webConfigurado, apnsConfigurado, jwtApns };
