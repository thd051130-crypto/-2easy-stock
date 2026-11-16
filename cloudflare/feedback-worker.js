// 이지스톡 의견 우체통 (클라우드플레어 Workers 무료 플랜)
// 앱 '의견 보내기' 화면이 보낸 글을 받아서 텔레그램 내 대화방으로 옮겨요.
// 저장소·앱 화면은 공개라 봇 열쇠(토큰)를 둘 수 없어서, 열쇠는 여기(클라우드플레어 비밀 값)에만 둬요.
//
// 필요한 비밀 값(Settings → Variables and Secrets, 종류 Secret):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  — GitHub Secrets에 넣은 것과 같은 값
// 선택: KV 이름공간을 FB_KV라는 이름으로 연결하면 하루 개수 제한이 더 정확해져요 (없어도 돌아가요).
//
// 무료 플랜은 하루 10만 번까지이고, 넘으면 그날은 멈추기만 해요(자동 유료 전환 없음).
// 도배 막기: 앱 주소에서 온 것만, 1500자까지, 같은 곳(IP)에서 하루 5통·모두 합쳐 하루 50통까지.
// 보낸 사람 IP·이름은 텔레그램으로 넘기지 않고, 개수 셀 때도 IP를 가린 값(해시)만 써요.

const ALLOW = ["https://thd051130-crypto.github.io"];
const KINDS = ["수정 요청", "오류", "의견"];
const MAX_CHARS = 1500, PER_IP = 5, PER_DAY = 50;
const mem = new Map();  // KV가 없을 때 쓰는 임시 개수 (같은 서버 안에서만, 다시 켜지면 0부터)

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOW.includes(origin) ? origin : ALLOW[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});
const reply = (origin, status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
});

async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`easy-stock-fb:${s}`));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function bump(env, key) {
  if (env.FB_KV) {
    const n = Number(await env.FB_KV.get(key)) || 0;
    await env.FB_KV.put(key, String(n + 1), { expirationTtl: 60 * 60 * 30 });
    return n + 1;
  }
  const n = (mem.get(key) || 0) + 1;
  mem.set(key, n);
  if (mem.size > 5000) mem.clear();
  return n;
}
async function count(env, key) {
  return env.FB_KV ? Number(await env.FB_KV.get(key)) || 0 : mem.get(key) || 0;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply(origin, 405, { ok: false, msg: "보내기만 받아요." });
    if (!ALLOW.includes(origin)) return reply(origin, 403, { ok: false, msg: "이지스톡 앱에서만 보낼 수 있어요." });
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(origin, 500, { ok: false, msg: "우체통 설정이 아직 안 됐어요." });

    let data;
    try { data = JSON.parse(await request.text()); } catch { return reply(origin, 400, { ok: false, msg: "글을 못 읽었어요." }); }
    const text = String(data.text || "").trim().slice(0, MAX_CHARS);
    const kind = KINDS.includes(data.kind) ? data.kind : "의견";
    const screen = String(data.screen || "").replace(/[^a-z]/g, "").slice(0, 12);
    if (!text) return reply(origin, 400, { ok: false, msg: "내용을 적어 주세요." });

    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);  // 한국 날짜
    const who = await hash(request.headers.get("CF-Connecting-IP") || "?");
    if (await count(env, `ip:${day}:${who}`) >= PER_IP) return reply(origin, 429, { ok: false, msg: `오늘은 ${PER_IP}통까지 받아요. 내일 다시 보내 주세요.` });
    if (await count(env, `day:${day}`) >= PER_DAY) return reply(origin, 429, { ok: false, msg: "오늘은 의견이 많이 와서 더 받지 못해요. 내일 다시 보내 주세요." });

    const when = new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
    const msg = `💬 <b>새 의견 · ${esc(kind)}</b>\n${esc(text)}\n\n<i>${when} KST${screen ? ` · ${esc(screen)} 화면에서` : ""}</i>`;
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!r.ok) return reply(origin, 502, { ok: false, msg: "텔레그램에 못 보냈어요. 잠시 뒤 다시 눌러 주세요." });
    await bump(env, `ip:${day}:${who}`);
    await bump(env, `day:${day}`);
    return reply(origin, 200, { ok: true });
  },
};
