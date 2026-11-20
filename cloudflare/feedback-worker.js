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
//
// ── 정시 알람 (2026-11-20 추가) ──
// GitHub 예약 실행이 2026-10-28쯤부터 6~10시간씩 늦게 와서 국장 자료가 다음 날 새벽에야 들어왔어요.
// 그래서 이 우체통이 5분마다 깨어나 정해진 시간이 되면 GitHub에 "지금 돌려"(workflow_dispatch)를 보내요.
// 늦게 온 GitHub 예약 실행은 저장소 sched-gate.yml이 알아서 건너뛰어요. 이 알람이 멈추면 GitHub 예약 실행이 예전처럼 대신 돌아요.
// 필요한 것: 비밀 값 GH_TOKEN (GitHub fine-grained 토큰, 이 저장소만, 권한 Actions: Read and write)
//           + Settings → Triggers → Cron Triggers에 "*/5 * * * *" 하나. (무료 플랜, 하루 288번이라 한도 걱정 없어요)
// 보내기에 실패하면 텔레그램으로 한 번 알려요(같은 날 같은 일은 한 번만).

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

// ── 정시 알람 표 (시각은 UTC, 요일 0=일요일) ──
// 저장소 .github/workflows/*.yml의 schedule과 같은 시각이에요. 5분 단위라 13·43분 같은 건 15·45분으로 맞췄어요.
const REPO = "thd051130-crypto/-2easy-stock";
const WEEKDAYS = [1, 2, 3, 4, 5], EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const JOBS = [
  { wf: "world.yml", at: ["07:10", "22:05"], days: WEEKDAYS },                          // 세계 지수 (한국 16:10 / 07:05)
  { wf: "all-stocks.yml", at: ["07:20"], days: WEEKDAYS, inputs: { market: "kr" } },    // 전 종목 국장 (한국 16:20)
  { wf: "daily.yml", at: ["08:30"], days: WEEKDAYS, inputs: { market: "kr" } },         // 국장 자료·리포트 (한국 17:30)
  { wf: "all-stocks.yml", at: ["21:20"], days: WEEKDAYS, inputs: { market: "us" } },    // 전 종목 미장 (한국 06:20)
  { wf: "macro.yml", at: ["21:50"], days: EVERY_DAY, inputs: { report: "false" } },     // 경기 판정 (한국 06:50)
  { wf: "daily.yml", at: ["22:30"], days: WEEKDAYS, inputs: { market: "us" } },         // 미장 자료·리포트 (한국 07:30)
  { wf: "keys.yml", at: ["00:00"], days: EVERY_DAY },                                   // API 키 만료 (한국 09:00)
  { wf: "fundamentals.yml", at: ["00:00"], days: [6] },                                 // 재무 (토 09:00)
  { wf: "weekly.yml", at: ["00:30"], days: [6] },                                       // 주간 리포트 (토 09:30)
  { wf: "health.yml", at: ["01:00"], days: [0] },                                       // 주간 점검 (일 10:00)
  { wf: "disclosures.yml", at: ["23:10"], days: [0, 1, 2, 3, 4] },                      // 공시 (한국 08:10)
  { wf: "disclosures.yml", at: hours(0, 10, 10), days: WEEKDAYS },                      // 공시 (한국 09:10~19:10 매시)
  { wf: "news.yml", at: hours(0, 23, 15).concat(hours(0, 23, 45)), days: EVERY_DAY },   // 지금 뉴스 30분마다
  { wf: "telegram-bot.yml", at: [5, 20, 35, 50].flatMap((m) => hours(0, 23, m)), days: EVERY_DAY },  // 봇 15분마다
];
function hours(from, to, minute) {
  const out = [];
  for (let h = from; h <= to; h++) out.push(`${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  return out;
}

// 알람이 몇 초~몇 분 늦게 깨어나도 같은 5분 칸으로 맞춰요.
function slotOf(ms) {
  const d = new Date(Math.round(ms / 300e3) * 300e3);
  return { hm: d.toISOString().slice(11, 16), day: d.getUTCDay(), date: d.toISOString().slice(0, 10) };
}
const dueAt = (slot) => JOBS.filter((j) => j.days.includes(slot.day) && j.at.includes(slot.hm));

async function dispatch(env, job) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${job.wf}/dispatches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "easystock-alarm",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", ...(job.inputs ? { inputs: job.inputs } : {}) }),
  });
  return r.status === 204 ? null : `${r.status} ${(await r.text()).slice(0, 120)}`;
}

async function tell(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => null);
}

async function alarm(env, ms) {
  const slot = slotOf(ms);
  const jobs = dueAt(slot);
  if (!jobs.length) return [];
  if (!env.GH_TOKEN) return ["GH_TOKEN 비밀 값이 없어요"];
  const errs = [];
  for (const j of jobs) {
    const e = await dispatch(env, j).catch((x) => String(x));
    if (e) errs.push(`${j.wf}${j.inputs?.market ? ` ${j.inputs.market}` : ""}: ${e}`);
  }
  if (errs.length) {
    const key = `alarm-fail:${slot.date}`;  // 하루 한 번만 알려요 (KV가 없으면 같은 서버 안에서만 기억)
    if (!(await count(env, key))) {
      await bump(env, key);
      await tell(env, `⏰ <b>정시 알람 실패</b> (${slot.hm} UTC)\n${esc(errs.join("\n"))}\n\nGitHub 예약 실행이 늦게라도 대신 돌아요. 토큰(GH_TOKEN)이 만료됐는지 확인해 주세요.`);
    }
  }
  return errs;
}

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

  // 5분마다 깨어나는 정시 알람 (Cron Trigger "*/5 * * * *")
  async scheduled(event, env, ctx) {
    ctx.waitUntil(alarm(env, event.scheduledTime));
  },

  _alarm: { JOBS, slotOf, dueAt },  // 저장소 tests/test_alarm_worker.py가 시각표를 확인해요 (클라우드플레어는 안 써요)
};
