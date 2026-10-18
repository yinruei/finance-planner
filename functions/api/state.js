// Cloudflare Pages Function：/api/state
//   GET  /api/state                 → 讀取目前資料
//   PUT  /api/state                 → 儲存（帶 X-Base 做衝突檢查）
//   GET  /api/state?backups=1       → 列出所有每日備份
//   GET  /api/state?backup=YYYY-MM-DD → 讀取某一天的備份
// 備份永久保存（不設過期），每天第一次存檔時，把「存檔前」的版本記下來。
// 需要：KV 綁定 FINANCE_KV、密鑰 PASSCODE

const KEY = 'state:v2';
const BK = 'backup:';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers });

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// 台灣時間的日期
const twDay = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export async function onRequest({ request, env }) {
  if (!env.PASSCODE) return json({ error: 'server_missing_passcode' }, 500);
  if (!env.FINANCE_KV) return json({ error: 'server_missing_kv' }, 500);

  const pass = request.headers.get('x-passcode') || '';
  if (!safeEqual(pass, env.PASSCODE)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const kv = env.FINANCE_KV;

  if (request.method === 'GET') {
    if (url.searchParams.has('backups')) {
      const days = [];
      let cursor;
      do {
        const r = await kv.list({ prefix: BK, cursor });
        r.keys.forEach(k => days.push(k.name.slice(BK.length)));
        cursor = r.list_complete ? undefined : r.cursor;
      } while (cursor);
      days.sort().reverse();
      return json({ days });
    }
    const day = url.searchParams.get('backup');
    if (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'bad_day' }, 400);
      const v = await kv.get(BK + day);
      return v === null ? json({ error: 'not_found' }, 404) : new Response(v, { headers });
    }
    const v = await kv.get(KEY);
    return new Response(v ?? 'null', { headers });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > 5_000_000) return json({ error: 'too_large' }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    if (!data || typeof data !== 'object' || typeof data.months !== 'object') {
      return json({ error: 'bad_shape' }, 400);
    }

    const cur = await kv.get(KEY);

    // 衝突檢查：用戶端帶 X-Base（它最後看到的雲端版本），雲端若已被別台裝置更新就回 409
    const base = request.headers.get('x-base');
    if (base !== null && cur) {
      let curAt = 0;
      try { curAt = Number(JSON.parse(cur).updatedAt) || 0; } catch {}
      if (curAt !== Number(base)) return json({ error: 'conflict', updatedAt: curAt }, 409);
    }

    // 每日備份（永久保存）：今天第一次存檔時，先把「改之前」的版本存起來
    const bk = BK + twDay();
    if ((await kv.get(bk)) === null) await kv.put(bk, cur ?? text);

    await kv.put(KEY, text);
    return json({ ok: true, updatedAt: data.updatedAt });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
