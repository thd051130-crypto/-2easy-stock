// 이지스톡 대시보드: data.json(dashboard.py가 매일 만듦)을 읽어 국장·미장 화면을 그려요.
"use strict";

const NEXT_RUN = { kr: "평일 한국시간 17:30쯤", us: "화~토 한국시간 07:30쯤" };
const US_ACTION = {
  buy: ["매수 신호", "다음 거래일 시가에 계좌의 50%를 S&P500 ETF로 사요."],
  hold: ["보유 유지", "계좌의 50%는 S&P500 ETF, 나머지는 현금으로 둬요."],
  sell: ["매도 신호", "추세가 꺾여서 다음 거래일 시가에 ETF를 전부 팔아요."],
  cash: ["현금 유지", "S&P500 추세가 약하거나 변동성이 커서 사지 않아요."],
};

const TREND_RULE = {
  kr: "코스피가 50일선과 200일선 둘 다 위일 때만 새로 사요.",
  us: "S&P500이 200일선 위이고 50일선도 200일선 위일 때만 사요.",
};

// 캔들 하나의 기간과 처음 보이는 캔들 수: 일봉 1개월, 주봉 6개월, 월봉 3년, 년봉 전체
const FRAMES = [["d", "일봉", 21], ["w", "주봉", 26], ["m", "월봉", 36], ["y", "년봉", 60]];
const UNIT = { d: "일", w: "주", m: "개월", y: "년" };
let DATA = null;
let frame = "d";
try { frame = localStorage.getItem("frame") || "d"; } catch (e) { /* 기본값 */ }
if (!FRAMES.some((f) => f[0] === frame)) frame = "d";
// 차트 보조지표 켜기·끄기 (이 폰 브라우저에 기억해요). 처음엔 이동평균선만 켜져 있어요.
const IND_KEYS = [["ma", "이동평균선"], ["bb", "볼린저밴드"], ["vol", "거래량"], ["rsi", "RSI"]];
const IND = { ma: true, bb: false, vol: false, rsi: false };
try {
  const saved = JSON.parse(localStorage.getItem("ind") || "{}");
  for (const [k] of IND_KEYS) if (typeof (saved && saved[k]) === "boolean") IND[k] = saved[k];
} catch (e) { /* 기본값 */ }
let market = "kr";
try { market = localStorage.getItem("market") || "kr"; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
// 아래쪽 버튼으로 바꾸는 화면. 앱을 새로 열면 늘 홈부터 보여요. 주소 끝(#kr/chart)에 시장과 화면을 적어 둬요.
const SCREENS = ["home", "signal", "watch", "perf", "chart", "stock", "search"];
let screen = "home";
// 종목 화면(#kr/stock/005930)과 검색 화면(#kr/search)은 보던 화면 위에 한 겹 더 열려요 (뒤로 가면 보던 화면).
// 아래 버튼은 그 아래 깔린 화면(stockFrom)에 불이 들어와요.
const LAYERS = ["stock", "search"];
let stockCode = null;
let stockFrom = "watch";
let searchQuery = "";
const fromHash = () => {
  const [m, s, code] = location.hash.slice(1).split("/");
  let c = null;
  try { c = code ? decodeURIComponent(code) : null; } catch (e) { /* 이상한 주소 */ }
  return { m, s, code: c };
};
{
  const h = fromHash();
  if (h.m === "kr" || h.m === "us") market = h.m;
  if (SCREENS.includes(h.s) && (h.s !== "stock" || h.code)) { screen = h.s; stockCode = h.code; }
}
const hashFor = () => `#${market}${screen === "home" ? "" : `/${screen}`}${screen === "stock" ? `/${encodeURIComponent(stockCode)}` : ""}`;

// 관심종목(★)은 이 폰 브라우저에 시장별로 저장해요. 저장소를 못 쓰면 앱을 닫을 때까지만 기억해요.
const WATCH = {};
for (const m of ["kr", "us"]) {
  try { WATCH[m] = JSON.parse(localStorage.getItem(`watch_${m}`) || "[]"); } catch (e) { WATCH[m] = []; }
  if (!Array.isArray(WATCH[m])) WATCH[m] = [];
}
function toggleWatch(code, m = market) {
  const list = WATCH[m];
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1); else list.push(code);
  try { localStorage.setItem(`watch_${m}`, JSON.stringify(list)); } catch (e) { /* 이번만 기억 */ }
}
// 텔레그램으로 넣은 종목(data.json의 extras)은 처음 보이면 ★에 자동으로 넣어요. 본 종목은 기억해서, ☆로 빼면 다시 안 넣어요.
const SEEN = {};
for (const m of ["kr", "us"]) {
  try { SEEN[m] = JSON.parse(localStorage.getItem(`seen_extras_${m}`) || "[]"); } catch (e) { SEEN[m] = []; }
  if (!Array.isArray(SEEN[m])) SEEN[m] = [];
}
function adoptExtras() {
  for (const m of ["kr", "us"]) {
    const fresh = ((DATA.markets[m] || {}).extras || []).map((e) => e.code).filter((c) => !SEEN[m].includes(c));
    if (!fresh.length) continue;
    for (const c of fresh) { SEEN[m].push(c); if (!WATCH[m].includes(c)) WATCH[m].push(c); }
    try {
      localStorage.setItem(`seen_extras_${m}`, JSON.stringify(SEEN[m]));
      localStorage.setItem(`watch_${m}`, JSON.stringify(WATCH[m]));
    } catch (e) { /* 이번만 기억 */ }
  }
}
let watchQuery = "";
let jumpSectors = false;
// 세계 지수·환율 칸에서 고른 기간과 '전체 보기'를 펼쳤는지 (이 폰 브라우저에 기억해요)
const WORLD_P = [["d1", "오늘", 6, "1주"], ["w1", "1주", 22, "1개월"], ["m1", "1개월", 66, "3개월"], ["y1", "1년", 0, "1년"]];
let worldP = "d1";
let worldOpen = false;
try {
  worldP = localStorage.getItem("world_p") || "d1";
  worldOpen = localStorage.getItem("world_open") === "1";
} catch (e) { /* 기본값 */ }
if (!WORLD_P.some((p) => p[0] === worldP)) worldP = "d1";
// 고른 업종 (홈 '업종별 호재·악재'와 관심 화면 '전체 종목'이 같이 써요). 시장마다 따로
const SECTOR = { kr: "", us: "" };
try { Object.assign(SECTOR, JSON.parse(localStorage.getItem("sector") || "{}")); } catch (e) { /* 기본값 */ }
function pickSector(name) {
  SECTOR[market] = SECTOR[market] === name ? "" : name;
  try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
}
let watchSort = "change";
try { watchSort = localStorage.getItem("watchSort") || "change"; } catch (e) { /* 기본값 */ }
const trackSrc = {};  // 추천 성과에서 고른 출처 (시장별)

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function money(m, x) {
  if (x == null) return "-";
  return m === "kr" ? `${Math.round(x).toLocaleString("ko-KR")}원`
    : `${x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}달러`;
}
function price(m, x) {
  if (x == null) return "-";
  return m === "kr" ? `${Math.round(x).toLocaleString("ko-KR")}원`
    : `${x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}달러`;
}
function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return "-";
  const v = Math.round(x * 10 ** (digits + 2)) / 10 ** (digits + 2);
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}
const sign = (x) => (x > 0.00005 ? "up" : x < -0.00005 ? "down" : "");
const num = (x) => (x == null ? "-" : Math.round(x).toLocaleString("ko-KR"));
const px = (m, x) => (x == null ? "-" : m === "kr" ? num(x)
  : x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const md = (d) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");
const shares = (q) => (Number.isInteger(q) ? `${q}주` : `${q.toFixed(3)}주`);

let siteVersion = null;  // 이 화면을 연 뒤 처음 받은 data.json의 화면 버전

async function load() {
  let data;
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    if (DATA) return;  // 이미 화면이 있으면 그대로 둬요
    $("#app").innerHTML = `<div class="card"><p class="empty">데이터를 못 불러왔어요. 인터넷 연결을 확인하고 다시 열어 주세요.</p></div>`;
    return;
  }
  // 앱을 열어 둔 사이에 새 화면이 배포됐으면 한 번 새로고침해서 새 화면으로 바꿔요.
  if (siteVersion && data.site_version && data.site_version !== siteVersion) {
    location.reload();
    return;
  }
  siteVersion = siteVersion || data.site_version || null;
  if (DATA && DATA.built !== data.built) { STOCK_DATA.clear(); STOCK_READY.clear(); }  // 새로 배포됐으면 종목 자료도 새로
  DATA = data;
  adoptExtras();
  $("#updated").textContent = `화면 데이터 갱신: ${DATA.built.replace("T", " ").slice(0, 16)} (한국시간)`;
  render();
}

function selectMarket(m) {
  market = m;
  try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ }
  if (screen === "stock") screen = stockFrom;  // 종목 화면은 그 시장 종목이라, 시장을 바꾸면 보던 목록 화면으로
  history.replaceState(history.state, "", hashFor());
  if (DATA) motion = "swap";
  render();
}

// 기록(history) 층: 홈 = 0층, 홈에서 다른 화면으로 가면 1층, 종목 화면은 한 층 더 쌓아요. 화면끼리는 바꿔치기.
// 그래서 폰의 뒤로 가기를 누르면 종목 → 보던 화면 → 홈 순서로 돌아오고, 앱이 바로 꺼지지 않아요.
// (예전 버전이 남긴 기록 {screen}은 1층으로 쳐요)
const depth = () => { const st = history.state; return st ? (st.depth ?? (st.screen ? 1 : 0)) : 0; };
function go(s, fromBack) {
  if (!SCREENS.includes(s) || (s === "stock" && !stockCode)) s = "home";
  const prev = screen;
  if (!fromBack) {
    if (s === "search" && screen === "search") { const i = $("#search-input"); if (i) i.focus(); return; }
    if (s === screen && s !== "stock") { window.scrollTo(0, 0); return; }  // 지금 화면 버튼을 또 누르면 맨 위로
    if (s === "home" && depth() > 0) { history.go(-depth()); return; }
    if (LAYERS.includes(s)) {
      if (!LAYERS.includes(screen)) stockFrom = screen;
      screen = s;
      history.pushState({ depth: depth() + 1 }, "", hashFor());
    } else {
      const push = screen === "home";
      screen = s;
      if (push) history.pushState({ depth: 1 }, "", hashFor());
      else history.replaceState(history.state, "", hashFor());
    }
  } else {
    screen = s;
    history.replaceState(history.state, "", hashFor());
  }
  // 종목·검색은 옆에서 밀려 들어오고, 뒤로 가면 반대쪽에서 돌아와요. 아래 버튼으로 바꾸면 살짝 떠오르기.
  if (DATA) motion = fromBack ? (LAYERS.includes(prev) ? "pop" : "fade") : LAYERS.includes(screen) ? "push" : "fade";
  window.scrollTo(0, 0);
  render();
}

function openStock(code) {
  if (code !== stockCode) alertOpen = false;
  stockCode = code;
  go("stock");
}
// 종목·검색 화면의 ‹ 뒤로: 쌓인 기록이 있으면 폰 뒤로 가기와 같고, 주소로 바로 열었으면 아래 깔린 화면으로
function back() {
  if (depth() > 0) history.back();
  else go(LAYERS.includes(stockFrom) ? "watch" : stockFrom, true);
}

// ---------------------------------------------------------------- 움직임 (화면 전환, 숫자 올라가기, 새 신호 반짝임)
// 폰 설정에서 '동작 줄이기'(prefers-reduced-motion)를 켰으면 전부 꺼요.
const calm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// 다음 render()에서 쓸 화면 전환: rise(앱을 열 때 카드가 차례로), fade(아래 버튼), push(종목·검색 열기),
// pop(뒤로), swap(국장·미장 바꾸기). 별표·지표 버튼처럼 같은 화면을 다시 그릴 때는 비어 있어서 안 움직여요.
let motion = "rise";
const FX = ["fx-rise", "fx-fade", "fx-push", "fx-pop", "fx-swap"];
let fxTimer = 0;
function playMotion(app) {
  const kind = motion;
  motion = null;
  if (!kind || calm()) return;
  app.classList.add(`fx-${kind}`);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => app.classList.remove(...FX), 900);
  countUp(app);
}

// 숫자 올라가기: 0에서 최종 숫자까지 0.7초 (처음엔 빠르게, 끝에서 천천히). 화면을 열 때 보이는 숫자만 해요.
const CNT = {
  money: (v) => money(market, v), price: (v) => price(market, v), num: (v) => num(v),
  pct: (v) => pct(v), pct2: (v) => pct(v, 2),
};
const cnt = (v, f, text) => (v == null || !Number.isFinite(v) ? text : `<span class="cnt" data-v="${v}" data-f="${f}">${text}</span>`);
function countUp(root) {
  const items = [...root.querySelectorAll(".cnt")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }).map((el) => ({ el, to: Number(el.dataset.v), f: CNT[el.dataset.f], end: el.textContent }));
  if (!items.length) return;
  let done = false;
  const finish = () => { done = true; items.forEach((x) => { x.el.textContent = x.end; }); };
  const t0 = performance.now(), dur = 700;
  const step = (now) => {
    if (done) return;
    const t = (now - t0) / dur;
    if (t >= 1) { finish(); return; }
    const k = 1 - (1 - Math.max(0, t)) ** 3;
    items.forEach((x) => { x.el.textContent = x.f(x.to * k); });
    requestAnimationFrame(step);
  };
  items.forEach((x) => { x.el.textContent = x.f(0); });
  requestAnimationFrame(step);
  setTimeout(finish, dur + 400);  // 화면이 가려져 그리기가 멈춰도 최종 숫자는 꼭 보여요
}

// 새 신호 강조: 시장마다 마지막으로 본 신호 날짜를 기억해요. 그 뒤 새로 나온 신호면 '새 신호' 표시를 붙이고
// 카드를 한 번 반짝여요. 할 일이 있는 날(국장 매수 후보, 미장 매수·매도 신호)은 카드에 색을 넣어요.
const SIG_SEEN = {};
for (const m of ["kr", "us"]) {
  try { SIG_SEEN[m] = localStorage.getItem(`seen_signal_${m}`) || ""; } catch (e) { SIG_SEEN[m] = ""; }
}
const SIG_NOW = {};  // 이번에 앱을 연 뒤 본 신호 {day, fresh, pulsed} (화면을 다시 그려도 '새 신호' 표시는 그대로)
function sigLook(s) {
  let st = SIG_NOW[market];
  if (!st || st.day !== s.day) {
    st = SIG_NOW[market] = { day: s.day, fresh: SIG_SEEN[market] !== s.day, pulsed: false };
    SIG_SEEN[market] = s.day;
    try { localStorage.setItem(`seen_signal_${market}`, s.day); } catch (e) { /* 이번만 기억 */ }
  }
  const hot = market === "us" ? s.action === "buy" || s.action === "sell" : !!(s.ok && s.picks.length);
  const cls = ["card", "sig"];
  if (hot) cls.push("sig-hot", market === "us" ? s.action : "buy");
  if (st.fresh && !st.pulsed && !calm()) { cls.push("sig-pulse"); st.pulsed = true; }  // 반짝임은 한 번만
  return { cls: cls.join(" "), badge: st.fresh ? `<span class="badge new">새 신호</span>` : "" };
}

const VIEWS = {
  home: (d) => [homeSignalCard(d), worldCard(), macroCard(), sectorsCard(d), homeWatchCard(d), moversCard(d), homePerfCard(d),
    homeIndexCard(d)],
  signal: (d) => [signalCard(d), desksCard(d), widePicksCard(d), rulebookPicksCard(d), rulesCard(d)],
  watch: (d) => [watchCard(d), allStocksCard(d)],
  perf: (d) => [trackCard(d), accountCard(d), positionsCard(d), tradesCard(d), etfAccountCard(d), readinessCard(d),
    rulebookAccountCard(d), memoCard(), healthCard()],
  chart: (d) => [trendCard(d) || `<section class="card"><p class="empty">아직 지수 기록이 없어요.</p></section>`],
  stock: (d) => [stockHeadCard(d), stockSectorCard(d), stockChartCard(), `<section class="card" id="fund-card"><h2>재무제표</h2><p class="muted">불러오는 중이에요…</p></section>`],
  search: () => [searchCard(), `<div id="search-results" class="stack">${searchResults()}</div>`],
};

function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === market)));
  const sb = $(".search-btn");
  if (sb) { if (screen === "search") sb.setAttribute("aria-current", "page"); else sb.removeAttribute("aria-current"); }
  const lit = LAYERS.includes(screen) ? stockFrom : screen;
  document.querySelectorAll(".nav button").forEach((b) => {
    if (b.dataset.screen === lit) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (!DATA) return;
  const d = DATA.markets[market];
  const app = $("#app");
  app.classList.remove(...FX);
  app.innerHTML = VIEWS[screen](d).join("");
  app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  app.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
  if (screen === "perf") { drawTrack(d); drawEquity(d); }
  app.querySelectorAll("[data-tags]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const card = $("#stock-sector");
    if (card) { card.scrollIntoView({ behavior: calm() ? "auto" : "smooth" }); }
  }));
  app.querySelectorAll("[data-sector-go]").forEach((b) => b.addEventListener("click", () => {
    SECTOR[market] = b.dataset.sectorGo;
    try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
    jumpSectors = true;  // 홈이 다시 그려지면 업종 칸으로 내려가요 (뒤로 가기로 돌아가는 경우가 있어서 render에서)
    go("home");
  }));
  app.querySelectorAll("[data-sector]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    pickSector(b.dataset.sector);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-world-p]").forEach((b) => b.addEventListener("click", () => {
    worldP = b.dataset.worldP;
    try { localStorage.setItem("world_p", worldP); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const wd = $("#world-all");
  if (wd) wd.addEventListener("toggle", () => {
    worldOpen = wd.open;
    try { localStorage.setItem("world_open", worldOpen ? "1" : "0"); } catch (e) { /* 이번만 기억 */ }
  });
  if (screen === "home" && jumpSectors) {
    jumpSectors = false;
    const card = $("#sectors-card");
    if (card) requestAnimationFrame(() => { card.scrollIntoView(); window.scrollBy(0, -70); });
  }
  if (screen === "watch") bindWatch(d);
  if (screen === "stock") bindStock();
  if (screen === "search") bindSearch();
  bindRows(app, d);
  if (screen === "chart") {
    drawTrend(d);
    app.querySelectorAll(".period button").forEach((b) => b.addEventListener("click", () => {
      frame = b.dataset.frame;
      try { localStorage.setItem("frame", frame); } catch (e) { /* 무시 */ }
      app.querySelectorAll(".period button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawTrend(d, true);
    }));
  }
  app.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
    IND[b.dataset.ind] = !IND[b.dataset.ind];
    try { localStorage.setItem("ind", JSON.stringify(IND)); } catch (e) { /* 이번만 기억 */ }
    render();  // 보던 구간·확대는 그대로 두고 지표만 다시 그려요
  }));
  playMotion(app);
}

function drawEquity(d) {
  const acc = d.account;
  if (!acc || !acc.curve.length) return;
  lineChart($("#equity-chart"), {
    dates: acc.curve.map((r) => r.date),
    series: [
      { name: "가상계좌", color: "var(--series-1)", values: acc.curve.map((r) => r.account) },
      { name: d.index_name, color: "var(--series-2)", values: acc.curve.map((r) => r.index) },
    ],
    fmt: (v) => pct(v),
    zero: true,
    tall: true,
  });
}

// 작은 추세선 (축 없이 모양만). 기간 처음보다 오르면 빨강, 내리면 파랑.
// zero: 추천일(0)부터의 수익률이면 0 기준선을 점선으로 그려요. 값은 세로 눈금의 최소 폭(±zero)이라
// 1%도 안 움직인 종목은 거의 평평하게, 그보다 크게 움직이면 그래프 높이를 다 써서 모양이 보여요.
function spark(values, label, zero) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return "";
  const w = 120, h = 40;
  const lo = zero ? Math.min(...v, -zero) : Math.min(...v), hi = zero ? Math.max(...v, zero) : Math.max(...v);
  const span = hi - lo || 1;
  const y = (x) => (h - 3 - ((x - lo) / span) * (h - 6)).toFixed(1);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${y(x)}`).join(" ");
  const base = zero ? `<line class="base" x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}"/>` : "";
  return `<svg class="spark ${v[v.length - 1] >= v[0] ? "up" : "down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"
    role="img" aria-label="${esc(label)}">${base}<polyline points="${pts}"/></svg>`;
}

const more = (to, label) => `<button type="button" class="more" data-go="${to}">${label}<span aria-hidden="true">›</span></button>`;

// 홈: 오늘 할 일만 짧게. 자세한 이유·부서 보고는 신호 화면에 있어요.
function homeSignalCard(d) {
  const s = d.signal;
  if (!s) return signalCard(d);
  const chip = s.ok
    ? `<span class="chip good">● 매수 조건 충족</span>`
    : `<span class="chip wait">■ 매수 조건 미달</span>`;
  let head, sub, extra = "";
  if (market === "us") {
    [head, sub] = US_ACTION[s.action] || ["-", ""];
    const risk = (s.opinion || []).find((l) => l.startsWith("위험:"));
    if (risk) extra = `<p class="caution">${esc(risk)}</p>`;
  } else if (!s.ok) {
    head = "신규 매수 쉬는 날";
    sub = s.pause || "코스피가 50일선이나 200일선 아래라 새로 사지 않아요.";
  } else if (!s.picks.length) {
    head = "오늘은 매수 신호 없음";
    sub = "조건에 맞게 눌린 종목이 없어요. 기다리는 것도 규칙이에요.";
  } else {
    head = `매수 후보 ${s.picks.length}개`;
    sub = `다음 거래일 시가에 종목당 계좌의 10%씩, 최대 ${s.max_positions}종목까지 사요.`;
    extra = `<ul class="list" style="margin-top:12px">${s.picks.map((p, i) => `<li data-stock="${esc(p.code)}"><div class="l">
        <div class="name">${i + 1}. ${esc(p.name)} <span class="meta">${esc(p.code)}</span></div>
        <div class="meta">손절 참고 ${num(p.stop)}원</div></div><div class="r">${num(p.close)}원</div></li>`).join("")}</ul>`;
  }
  const rb = s.rulebook || [];
  const rbLine = rb.length ? `<p class="muted" style="margin:10px 0 0">내 규칙표 후보 ${rb.length}개: ${rb.map((p) => esc(p.name)).join(" · ")}</p>` : "";
  const look = sigLook(s);
  return `<section class="${look.cls}"><h2><span>오늘의 신호${look.badge}</span><small>${md(s.day)} 종가 기준</small></h2>${chip}
    <p class="headline">${esc(head)}</p><p class="sub">${esc(sub)}</p>${extra}${rbLine}
    ${more("signal", "신호 자세히 보기")}</section>`;
}

// 홈 성과 카드: 가상계좌 요약 + 추천 종목이 그 뒤 얼마나 올랐는지 한 줄
function homePerfCard(d) {
  const a = d.account;
  const rb = d.rulebook && d.rulebook.account;
  const acc = a
    ? `<p class="hero">${cnt(a.equity, "money", money(market, a.equity))}</p>
      <div class="stats">
        <div class="stat"><span>가상계좌</span><b class="${sign(a.gain)}">${cnt(a.gain, "pct", pct(a.gain))}</b></div>
        <div class="stat"><span>${esc(d.index_name)}</span><b class="${sign(a.index_gain)}">${cnt(a.index_gain, "pct", pct(a.index_gain))}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${cnt(a.mdd, "pct", pct(a.mdd))}</b></div>
      </div>
      ${rb ? `<p class="muted" style="margin:8px 0 0">내 규칙표 계좌 <b class="${sign(rb.gain)}">${pct(rb.gain)}</b></p>` : ""}
      ${pendingLines(a)}`
    : `<p class="empty">가상계좌는 아직 첫 기록 전이에요. ${NEXT_RUN[market]} 첫 자동 실행부터 날마다 기록해요.</p>`;
  const t = d.signal && d.signal.tracked;
  const src = t && pickSrc(t);
  const s = src && t.srcs[src];
  const h = s && (s.horizons.find((x) => x.days === 10 && x.n) || s.horizons.find((x) => x.n));
  const line = h ? `<div class="track-line"><span>추천 종목 ${h.days}거래일 뒤 평균 <small>${esc(s.label)} · ${h.n}개</small></span>
      <b class="${sign(h.avg)}">${cnt(h.avg, "pct", pct(h.avg))}</b><span class="muted">${esc(d.index_name)} ${pct(h.index)} · 오른 종목 ${Math.round(h.win * 100)}%</span></div>` : "";
  return `<section class="card"><h2>성과 <small>${a ? `${md(a.last_day)} 종가` : `${money(market, d.capital)}${market === "kr" ? "으로" : "로"} 시작`}</small></h2>
    ${acc}${line}${totalLine()}${healthLine()}${more("perf", "성과 자세히 보기")}</section>`;
}

// ---------------------------------------------------------------- 관심종목

// 종목 한 줄: 이름·코드·3개월 등락, 종가·전일 대비, ★. chart면 3개월 추세선도 (내 관심종목처럼 몇 개 안 될 때)
function stockRow(s, d, { star = true, chart = false } = {}) {
  const sig = d.signal || {};
  const badges = [];
  if ((sig.picks || []).some((p) => p.code === s.code)) badges.push(`<span class="badge good">오늘 매수 후보</span>`);
  if ((sig.rulebook || []).some((p) => p.code === s.code)) badges.push(`<span class="badge">규칙표 후보</span>`);
  if (s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const on = WATCH[market].includes(s.code);
  // 작은 추세선과 같은 기간(최근 3개월) 등락률이라 선 색과 숫자가 맞아요
  const c3 = s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  const meta = [s.code, c3 == null ? "" : `3개월 ${pct(c3)}`].filter(Boolean).join(" · ");
  return `<li class="stock${chart ? " spark-row" : ""}${star ? "" : " no-star"}" data-stock="${esc(s.code)}">
    <div class="name">${esc(s.name)}${badges.join("")}</div><div class="meta">${esc(meta)}</div>
    ${chart ? `<div class="mini">${spark(s.spark, `${s.name} 최근 3개월`)}</div>` : ""}
    <div class="price">${price(market, s.close)}</div><div class="chg ${sign(s.d1)}">${pct(s.d1, 2)}</div>
    ${star ? `<button type="button" class="star" data-star="${esc(s.code)}" aria-pressed="${on}"
      aria-label="${esc(s.name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button>` : ""}</li>`;
}

// 대시보드 종목: 알림이 보는 대형주 + 텔레그램으로 넣은 종목(extra)
function stocksOf(d) {
  const base = (d.signal && d.signal.stocks) || [];
  const have = new Set(base.map((s) => s.code));
  return base.concat((d.extras || []).filter((e) => !have.has(e.code)).map((e) => ({ ...e, extra: true })));
}

function watchCard(d) {
  const all = stocksOf(d);
  if (!all.length) {
    return `<section class="card"><h2>관심종목</h2><p class="empty">종목 시세가 아직 없어요. ${NEXT_RUN[market]} 자동 실행 뒤에 생겨요.</p></section>`;
  }
  const mine = WATCH[market].map((c) => all.find((s) => s.code === c)).filter(Boolean);
  return `<section class="card" id="watch-card"><h2>내 관심종목 <small>${mine.length}개 · ${md(all[0].day)} 종가</small></h2>
    ${mine.length ? `<ul class="list">${mine.map((s) => stockRow(s, d, { chart: true })).join("")}</ul>`
      : `<p class="empty">아래 전체 종목에서 ☆를 누르면 여기에 모여요.</p>`}
    <p class="muted" style="margin:10px 0 0">종목을 누르면 차트와 재무제표가 나와요. ★ 목록은 이 폰 브라우저에만 저장돼요.
      목록에 없는 종목은 위쪽 돋보기(검색)에서 찾아 텔레그램으로 넣을 수 있어요.</p></section>`;
}

function allStocksCard(d) {
  const all = stocksOf(d);
  if (!all.length) return "";
  const extra = all.filter((s) => s.extra).length, n = all.length - extra;
  const what = (market === "kr" ? `코스피 대형주 ${n}개` : `미국 대형주와 SPY ${n}개`) + (extra ? ` + 추가한 종목 ${extra}개` : "");
  const sorts = [["change", "오늘 등락순"], ["name", "이름순"]].map(([k, label]) =>
    `<button type="button" data-sort="${k}" aria-pressed="${watchSort === k}">${label}</button>`).join("");
  return `<section class="card"><h2>전체 종목 <small>${what}</small></h2>
    <input class="search" type="search" placeholder="이름이나 코드로 찾기" aria-label="종목 찾기" value="${esc(watchQuery)}">
    <div class="period" role="group" aria-label="정렬" style="margin:10px 0 6px">${sorts}</div>
    ${secList(d).length ? sectorChips(secList(d), SECTOR[market]) : ""}
    <ul class="list" id="all-list">${allRows(d)}</ul>
    <button type="button" class="more" data-find>목록에 없는 종목 찾기 (국장·미장 전체)<span aria-hidden="true">›</span></button></section>`;
}

// 관심 화면 업종 버튼: 대시보드 종목에 있는 업종만 (업종 지도 paper/sectors.json 기준)
function secList(d) {
  const of = (d.signal && d.signal.sector_of) || {};
  const have = new Set(stocksOf(d).map((s) => of[s.code]).filter(Boolean));
  const order = ((d.signal && d.signal.sectors) || []).map((s) => s.name);
  return order.filter((n) => have.has(n)).concat([...have].filter((n) => !order.includes(n)));
}
function allRows(d) {
  const q = watchQuery.trim().toLowerCase();
  const of = (d.signal && d.signal.sector_of) || {};
  const sec = secList(d).includes(SECTOR[market]) ? SECTOR[market] : "";
  const rows = stocksOf(d).filter((s) => (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    && (!sec || of[s.code] === sec));
  rows.sort(watchSort === "name" ? (a, b) => a.name.localeCompare(b.name, "ko") : (a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
  if (rows.length) return rows.map((s) => stockRow(s, d)).join("");
  return `<li><p class="empty">${q ? `"${esc(watchQuery)}"에 맞는 종목이 없어요.` : `${esc(sec)} 종목이 없어요.`}</p></li>`;
}

// ★는 관심종목 넣기·빼기, 줄의 나머지를 누르면 그 종목 화면(차트·재무제표)
function bindRows(el, d) {
  el.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    starClicked(d, b);
  }));
  el.querySelectorAll("[data-stock]").forEach((row) => row.addEventListener("click", () => openStock(row.dataset.stock)));
}

function bindWatch(d) {
  const find = $("[data-find]");
  if (find) find.addEventListener("click", () => { searchQuery = watchQuery; go("search"); });
  const input = $(".search");
  if (input) {
    input.addEventListener("input", () => {
      watchQuery = input.value;
      const list = $("#all-list");
      list.innerHTML = allRows(d);
      bindRows(list, d);
    });
  }
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    watchSort = b.dataset.sort;
    try { localStorage.setItem("watchSort", watchSort); } catch (e) { /* 무시 */ }
    document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const list = $("#all-list");
    list.innerHTML = allRows(d);
    bindRows(list, d);
  }));
}

// ★를 누르면 목록을 다시 그려요. 위쪽 관심종목 칸 높이가 바뀌어도 누른 줄이 손가락 아래에 그대로 있게 스크롤을 맞춰요.
function starClicked(d, b) {
  const code = b.dataset.star;
  const inAll = !!b.closest("#all-list");
  const before = b.getBoundingClientRect().top;
  toggleWatch(code);
  render();
  if (screen !== "watch" || !inAll) return;
  const again = [...document.querySelectorAll("#all-list [data-star]")].find((x) => x.dataset.star === code);
  if (again) {
    window.scrollBy(0, again.getBoundingClientRect().top - before);
    again.focus({ preventScroll: true });
  }
}

function homeWatchCard(d) {
  const all = stocksOf(d);
  const mine = WATCH[market].map((c) => all.find((s) => s.code === c)).filter(Boolean);
  if (!mine.length) return "";
  return `<section class="card"><h2>관심종목 <small>${md(all[0].day)} 종가</small></h2>
    <ul class="list">${mine.slice(0, 5).map((s) => stockRow(s, d, { star: false, chart: true })).join("")}</ul>
    ${more("watch", mine.length > 5 ? `관심종목 ${mine.length}개 모두 보기` : "관심종목 보기")}</section>`;
}

// ---------------------------------------------------------------- 종목 검색 (국장·미장 전체 상장 종목)
// 목록은 symbols/<시장>.json (매주 symbols.py가 야후에서 받음). 찾는 규칙은 symbols.py와 똑같이 맞춰요.
// 대시보드에 있는 종목은 바로 종목 화면으로, 없는 종목은 '추가'로 텔레그램 봇에게 넣어 달라고 보내요.
const CORP = /\(주\)|㈜|주식회사|\(유\)|유한회사/g;
const HANGUL = /[가-힣]/;
const LETTERS = { a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이",
  l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "지" };
const BRAND_KO = { 코덱스: "kodex", 타이거: "tiger", 에이스: "ace", 라이즈: "rise", 플러스: "plus", 하나로: "hanaro",
  아리랑: "arirang", 키움: "kiwoom", 코세프: "kosef", 쏠: "sol" };
const norm = (s) => String(s || "").toLowerCase().replace(CORP, "").replace(/[^0-9a-z가-힣]/g, "");
// 한글 바로 옆 영문은 한글 읽기로도: 'sk하이닉스' → '에스케이하이닉스'
const spell = (s) => s.replace(/[a-z]+/g, (w, i) =>
  (HANGUL.test(s.slice(Math.max(0, i - 1), i) + s.slice(i + w.length, i + w.length + 1)) ? [...w].map((c) => LETTERS[c]).join("") : w));
const uniq = (a) => a.filter((k, i) => k && a.indexOf(k) === i);
function queryKeys(q) {
  const n = norm(q);
  const keys = [n, spell(n)];
  for (const [ko, en] of Object.entries(BRAND_KO)) if (n.includes(ko)) keys.push(n.split(ko).join(en));
  return uniq(keys);
}
function nameKeys(row) {
  const keys = [];
  for (const name of [row[1], ...String(row[4] || "").split("|")]) {
    const n = norm(name);
    if (!n) continue;
    keys.push(n, spell(n));
    if (n.includes("자동차")) keys.push(n.split("자동차").join("차"));
  }
  return uniq(keys);
}
// 작을수록 잘 맞아요: 0 코드 그대로, 1 이름 그대로, 2 이름 앞부분, 3 코드 앞부분, 4 이름 일부. 안 맞으면 null.
function scoreOf(row, keys, qs) {
  const code = row[0].toLowerCase();
  if (qs.includes(code)) return 0;
  let best = null;
  for (const q of qs) {
    for (const k of keys) {
      const sc = k === q ? 1 : k.startsWith(q) ? 2 : k.includes(q) ? 4 : null;
      if (sc != null && (best == null || sc < best)) best = sc;
    }
    if (code.startsWith(q) && (best == null || best > 3)) best = 3;
  }
  return best;
}

const SYM = { kr: null, us: null };  // [{ row, keys }]
let symLoading = null;
function loadSymbols() {
  if (!symLoading) {
    symLoading = Promise.all(["kr", "us"].map((m) => fetch(`symbols/${m}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { SYM[m] = x && Array.isArray(x.rows) ? x.rows.map((row) => ({ row, keys: nameKeys(row) })) : []; })))
      .then(() => { if (!SYM.kr.length && !SYM.us.length) symLoading = null; });  // 둘 다 못 받았으면 다음에 다시
  }
  return symLoading;
}

// '추가'를 누른 종목 (이 폰에만 기억, 이틀 지나면 다시 '추가'로)
const REQ = {};
try { Object.assign(REQ, JSON.parse(localStorage.getItem("req") || "{}")); } catch (e) { /* 없음 */ }
for (const [k, t] of Object.entries(REQ)) if (!(Date.now() - t < 2 * 864e5)) delete REQ[k];

// 텔레그램 봇 시작 링크: 명령을 base64url로 담아요 (봇이 '/start c_…'로 받아서 그대로 처리)
function tgLink(cmd) {
  const bot = DATA && DATA.bot;
  if (!bot) return null;
  let bin = "";
  new TextEncoder().encode(cmd).forEach((b) => { bin += String.fromCharCode(b); });
  return `https://t.me/${encodeURIComponent(bot)}?start=c_${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
const kindName = (m, row) => (m === "kr" ? (row[3] === "e" ? "국내 ETF" : row[2] === "KQ" ? "코스닥" : "코스피")
  : (row[3] === "e" ? "미국 ETF" : "미국 주식"));
const MK_NAME = { kr: "국장", us: "미장" };

function searchCard() {
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <h2 class="stock-name">종목 검색</h2>
    <input id="search-input" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off"
      spellcheck="false" placeholder="종목 이름이나 코드" aria-label="종목 검색" value="${esc(searchQuery)}">
    <p class="muted" style="margin:8px 0 0">국장·미장에 상장된 종목을 다 찾아요. 대시보드에 없는 종목은 '추가'를 누르면 텔레그램 봇이 넣어 줘요.</p></section>`;
}

// 대시보드에 있는 종목(시세 있음)과 다른 상장 종목으로 나눠서, 잘 맞는 순서(같으면 지금 시장, 시가총액 큰 순)로
function findStocks(q) {
  const qs = queryKeys(q);
  const tracked = [], others = [];
  if (!qs.length || !DATA) return { tracked, others };
  for (const m of ["kr", "us"]) {
    const mine = stocksOf(DATA.markets[m]);
    const byCode = new Map(mine.map((x) => [x.code, x]));
    const seen = new Set();
    (SYM[m] || []).forEach((e, i) => {
      const sc = scoreOf(e.row, e.keys, qs);
      if (sc == null) return;
      const x = byCode.get(e.row[0]);
      seen.add(e.row[0]);
      (x ? tracked : others).push({ m, sc, i, s: x, row: e.row });
    });
    mine.forEach((x) => {  // 목록 파일에 없거나 아직 못 받았을 때도 대시보드 종목은 찾아요
      if (seen.has(x.code)) return;
      const row = [x.code, x.name, x.exch || (m === "kr" ? "KS" : ""), x.kind || (x.code === "SPY" ? "e" : "s"), ""];
      const sc = scoreOf(row, nameKeys(row), qs);
      if (sc != null) tracked.push({ m, sc, i: -1, s: x, row });
    });
  }
  const order = (a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i;
  return { tracked: tracked.sort(order), others: others.sort(order) };
}

function searchResults() {
  const q = searchQuery.trim();
  const loading = !SYM.kr || !SYM.us;
  if (!q) {
    return `<section class="card"><ul class="help" style="margin:0">
      <li>이름 일부만 쳐도 돼요: '하이닉스', '삼성sdi', '코덱스 200', '슈드'</li>
      <li>대시보드에 있는 종목은 누르면 차트와 재무제표가 나와요.</li>
      <li>없는 종목은 '추가'를 누르면 텔레그램이 열려요. 봇 화면에서 시작(START)을 누르면 보통 30분 안에 대시보드에 생기고 ★에 들어가요.</li></ul></section>`;
  }
  const { tracked, others } = findStocks(q);
  if (!tracked.length && !others.length && !loading) {
    return `<section class="card"><p class="empty">"${esc(q)}"에 맞는 종목이 없어요. 이름을 조금만 쳐 보거나 코드로 찾아보세요.</p></section>`;
  }
  const cards = [];
  if (tracked.length) {
    cards.push(`<section class="card"><h2>대시보드 종목 <small>누르면 차트·재무제표</small></h2>
      <ul class="list">${tracked.slice(0, 15).map(trackedRow).join("")}</ul></section>`);
  }
  if (others.length || loading) {
    const bot = DATA && DATA.bot;
    cards.push(`<section class="card"><h2>다른 상장 종목 <small>${others.length > 30 ? `${others.length}개 중 30개` : `${others.length}개`}</small></h2>
      ${loading ? `<p class="muted">전체 종목 목록을 불러오는 중이에요…</p>` : ""}
      ${others.length ? `<ul class="list">${others.slice(0, 30).map(otherRow).join("")}</ul>` : ""}
      ${bot ? "" : `<p class="muted" style="margin:10px 0 0">텔레그램 봇이 아직 연결 전이라 '추가'를 못 눌러요. telegram-bot 워크플로가 한 번 돌면 켜져요.</p>`}
      ${others.length > 30 ? `<p class="muted" style="margin:10px 0 0">더 자세히 쳐 보세요.</p>` : ""}</section>`);
  }
  return cards.join("");
}

function trackedRow(x) {
  const { m, s } = x;
  const on = WATCH[m].includes(s.code);
  const meta = [s.code, kindName(m, x.row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ");
  return `<li class="stock" data-open="${m}/${esc(s.code)}">
    <div class="name">${esc(s.name)}${s.extra ? `<span class="badge">추가한 종목</span>` : ""}</div><div class="meta">${esc(meta)}</div>
    <div class="price">${price(m, s.close)}</div><div class="chg ${sign(s.d1)}">${pct(s.d1, 2)}</div>
    <button type="button" class="star" data-wstar="${m}/${esc(s.code)}" aria-pressed="${on}"
      aria-label="${esc(s.name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></li>`;
}

function otherRow(x) {
  const { m, row } = x;
  const key = `${m}/${row[0]}`;
  const link = tgLink(`관심 ${m} ${row[0]}`);
  const act = REQ[key] ? `<span class="asked">요청함</span>`
    : link ? `<a class="add" href="${esc(link)}" target="_blank" rel="noopener" data-req="${esc(key)}" aria-label="${esc(row[1])} 텔레그램으로 추가">추가</a>`
      : `<button type="button" class="add" disabled>추가</button>`;
  const meta = [row[0], kindName(m, row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ");
  return `<li class="stock other"><div class="name">${esc(row[1])}</div><div class="meta">${esc(meta)}</div><div class="act">${act}</div></li>`;
}

function bindSearch() {
  const input = $("#search-input");
  const list = $("#search-results");
  if (!input || !list) return;
  const refresh = () => { list.innerHTML = searchResults(); bindResults(list); };
  input.addEventListener("input", () => { searchQuery = input.value; refresh(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });  // 폰 키보드의 '검색'은 키보드만 내려요
  bindResults(list);
  if (!searchQuery) input.focus();
  if (!SYM.kr || !SYM.us) loadSymbols().then(() => { if (screen === "search") refresh(); });
}

function bindResults(el) {
  el.querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", () => {
    const [m, code] = row.dataset.open.split("/");
    if (m !== market) { market = m; try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ } }
    openStock(code);
  }));
  el.querySelectorAll("[data-wstar]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const [m, code] = b.dataset.wstar.split("/");
    toggleWatch(code, m);
    const on = WATCH[m].includes(code);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "★" : "☆";
  }));
  el.querySelectorAll("[data-req]").forEach((a) => a.addEventListener("click", () => {
    REQ[a.dataset.req] = Date.now();
    try { localStorage.setItem("req", JSON.stringify(REQ)); } catch (e) { /* 이번만 기억 */ }
    setTimeout(() => { if (screen === "search") { const list = $("#search-results"); if (list) { list.innerHTML = searchResults(); bindResults(list); } } }, 300);
  }));
}

// ---------------------------------------------------------------- 추천 종목 성과

// 처음엔 추천이 더 많은 쪽을 보여 줘요 (국장 알림 규칙은 조건이 까다로워서 추천이 드물어요).
function pickSrc(t) {
  const keys = Object.keys(t.srcs);
  if (keys.includes(trackSrc[market])) return trackSrc[market];
  return keys.reduce((a, b) => (t.srcs[b].count > t.srcs[a].count ? b : a), keys[0]);
}

function trackCard(d) {
  const t = d.signal && d.signal.tracked;
  if (!t || !Object.keys(t.srcs).length) return "";
  const src = pickSrc(t), s = t.srcs[src];
  const buttons = Object.entries(t.srcs).map(([k, v]) =>
    `<button type="button" data-src="${k}" aria-pressed="${k === src}">${esc(v.label)} ${v.count}</button>`).join("");
  let body;
  if (!s.count) {
    body = `<p class="empty">${src === "signal" && market === "us"
      ? "최근 6개월 동안 새 SPY 매수 신호가 없었어요 (계속 보유 중이거나 현금이었어요)."
      : "최근 6개월 동안 이 규칙으로 추천한 종목이 없어요."}</p>`;
  } else {
    const stats = s.horizons.map((h) => `<div class="stat"><span>${h.days}거래일 뒤</span>
        <b class="${sign(h.avg)}">${h.n ? cnt(h.avg, "pct", pct(h.avg)) : "-"}</b>
        <small>${h.n ? `지수 ${pct(h.index)}<br>오른 종목 ${Math.round(h.win * 100)}%` : "아직 없음"}</small></div>`).join("");
    const live = t.live_from;
    let divider = false;
    const rows = s.recent.map((p) => {
      let pre = "";
      if (live && !divider && p.date < live) {
        divider = true;
        pre = `<li class="divider">↓ ${md(live)} 전은 지금 규칙을 과거 날짜에 적용해서 채운 기록이에요</li>`;
      }
      return `${pre}<li class="pick" data-stock="${esc(p.code)}"><div class="name">${esc(p.name)}</div><b class="ret ${sign(p.ret)}">${pct(p.ret)}</b>
        <div class="meta">${md(p.date)} ${px(market, p.close)} → ${px(market, p.last)} · ${p.days ? `${p.days}거래일` : "오늘"}</div>
        <div class="mini">${spark(p.path, `${p.name} 추천 뒤 수익률`, 0.01)}</div></li>`;
    });
    const shown = rows.slice(0, 10).join(""), rest = rows.slice(10).join("");
    body = `<p class="muted" style="margin:0 0 4px">추천 ${s.count}개 (${md(s.first)}부터) · 추천일 종가에서 그 뒤 종가까지, 배당 포함</p>
      <div class="stats">${stats}</div>
      <div style="margin-top:14px"><div class="legend">
        <span class="key"><i class="sw" style="background:var(--series-1)"></i>추천 종목 평균</span>
        <span class="key"><i class="sw" style="background:var(--series-2)"></i>${esc(d.index_name)} 같은 기간</span></div>
        <div class="chart" id="track-chart"></div></div>
      <p class="sub" style="margin:14px 0 6px">최근 추천 <small class="muted">작은 그래프 = 추천일부터 날마다 수익률</small></p>
      <ul class="list">${shown}</ul>
      ${rest ? `<details class="more-list"><summary>${s.recent.length - 10}개 더 보기</summary><ul class="list">${rest}</ul></details>` : ""}
      <p class="muted" style="margin:10px 0 0">같은 종목이 ${t.gap}거래일 안에 다시 후보에 오르면 처음 추천만 세요. 실제로는 다음 날 시가에 사서 조금 달라요.
        ${live ? "" : "아직은 전부 지금 규칙을 과거 날짜에 적용해서 채운 기록이에요."}</p>`;
  }
  return `<section class="card"><h2>추천 종목 성과 <small>추천일 종가 기준</small></h2>
    <div class="period" role="group" aria-label="추천 출처" style="margin-bottom:10px">${buttons}</div>${body}</section>`;
}

function drawTrack(d) {
  const t = d.signal && d.signal.tracked;
  document.querySelectorAll("[data-src]").forEach((b) => b.addEventListener("click", () => {
    trackSrc[market] = b.dataset.src;
    render();
  }));
  if (!t) return;
  const s = t.srcs[pickSrc(t)];
  if (!s || !s.count) return;
  const last = s.n.reduce((k, v, i) => (v ? i : k), 0);  // 자료가 있는 마지막 날까지
  lineChart($("#track-chart"), {
    dates: s.avg.slice(0, last + 1).map((_, k) => (k === 0 ? "추천일" : `${k}거래일 뒤 (${s.n[k]}개)`)),
    xfmt: (label) => label.replace(/ \(.*\)$/, ""),
    series: [
      { name: "추천 종목 평균", color: "var(--series-1)", values: s.avg.slice(0, last + 1) },
      { name: `${d.index_name} 같은 기간`, color: "var(--series-2)", values: s.index.slice(0, last + 1) },
    ],
    fmt: (v) => pct(v),
    zero: true,
  });
}

function homeIndexCard(d) {
  const s = d.signal;
  const close = s && s.series ? s.series.close.filter((v) => v != null) : [];
  if (close.length < 2) return "";
  const last = close[close.length - 1], ch = last / close[close.length - 2] - 1, gap = s.index / s.ma200 - 1;
  return `<section class="card"><h2>${esc(d.index_name)} <small>${md(s.day)} 종가</small></h2>
    <div class="tile"><div>
      <p class="big">${cnt(last, "num", num(last))}</p>
      <p class="sub nowrap"><b class="${sign(ch)}">${cnt(ch, "pct2", pct(ch, 2))}</b> 전일 대비</p>
    </div><div class="tile-spark">${spark(close.slice(-63), `${d.index_name} 최근 3개월`)}<span class="muted">최근 3개월</span></div></div>
    ${s.ma200 && s.ma50 ? `<p class="muted" style="margin:8px 0 0">200일선보다 ${(Math.abs(gap) * 100).toFixed(1)}% ${gap >= 0 ? "위" : "아래"} ·
      50일선보다 ${s.index >= s.ma50 ? "위" : "아래"}</p>` : ""}
    ${more("chart", "차트 크게 보기")}</section>`;
}

// 지수 추세: 고른 캔들 기간(일봉·주봉·월봉·년봉)으로 그려요.
// 캔들 데이터가 있으면 캔들 차트, 없으면(예전 기록) 최근 1년 종가 선 그래프
function drawTrend(d, reset) {
  const c = d.signal && d.signal.candles;
  if (c && c.dates.length) {
    const f = frameCandles(c, frame);
    const show = (FRAMES.find((x) => x[0] === frame) || FRAMES[0])[2];
    document.querySelectorAll(".ma-key").forEach((k) => { k.style.display = frame === "y" ? "none" : ""; });
    candleChart($("#trend-chart"), f, show, reset, (txt) => { $("#trend-change").innerHTML = txt; }, { name: d.index_name });
    return;
  }
  drawTrendLine(d);
}

// 묶는 열쇠: 주(그 주 월요일 날짜), 월(YYYY-MM), 년(YYYY)
const WEEK = (s) => {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const KEY = { d: (s) => s, w: WEEK, m: (s) => s.slice(0, 7), y: (s) => s.slice(0, 4) };

// 시가는 첫날, 고가·저가는 기간 중 최고·최저, 종가는 마지막 날, 거래량은 기간 합계로 묶어요.
function groupCandles(src, keyOf) {
  const out = { keys: [], first: [], last: [], o: [], h: [], l: [], c: [] };
  const vol = Array.isArray(src.v) && src.v.length === src.dates.length;
  if (vol) out.v = [];
  src.dates.forEach((dt, i) => {
    const k = keyOf(dt), j = out.keys.length - 1;
    if (j < 0 || out.keys[j] !== k) {
      out.keys.push(k); out.first.push(dt); out.last.push(dt);
      out.o.push(src.o[i]); out.h.push(src.h[i]); out.l.push(src.l[i]); out.c.push(src.c[i]);
      if (vol) out.v.push(src.v[i]);
    } else {
      out.last[j] = dt; out.h[j] = Math.max(out.h[j], src.h[i]); out.l[j] = Math.min(out.l[j], src.l[i]); out.c[j] = src.c[i];
      if (vol) out.v[j] += src.v[i];
    }
  });
  return out;
}
const dropFirst = (f) => (f.keys.length > 1 ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.slice(1)])) : f);

// 일봉(5년치)·월봉(전체 기간)으로 고른 기간의 캔들을 만들어요.
// 50일선·200일선은 각 캔들 기간 마지막 거래일의 값이에요 (일봉이 있는 최근 몇 년만, 년봉엔 안 그려요).
function frameCandles(c, fr) {
  // 상장일부터 받은 일봉(full: 종목 화면)은 첫 주·첫 달·첫 해가 상장 직후라 그대로 둬요.
  // 중간부터 자른 일봉(지수)은 첫 주가 중간부터일 수 있어서 빼요.
  const cut = c.full ? (x) => x : dropFirst;
  let f;
  if (fr === "d") f = groupCandles(c, KEY.d);
  else if (fr === "w") f = cut(groupCandles(c, KEY.w));
  else if (c.monthly && c.monthly.dates.length) {
    f = groupCandles(c.monthly, fr === "m" ? KEY.m : KEY.y);
    if (fr === "y" && f.first[0].slice(5, 7) !== "01") f = dropFirst(f);  // 1월부터가 아닌 첫 해는 빼요
  } else f = cut(groupCandles(c, KEY[fr]));  // 월봉이 없으면 일봉을 묶어요
  const ma50 = smaOf(c.c, 50), ma200 = smaOf(c.c, 200), lastDay = new Map();
  c.dates.forEach((dt, i) => lastDay.set(KEY[fr](dt), i));
  const pick = (vals) => f.keys.map((k) => (fr === "y" || !lastDay.has(k) ? null : vals[lastDay.get(k)]));
  return withIndicators({ ...f, ma50: pick(ma50), ma200: pick(ma200), frame: fr });
}

// 보조지표는 지금 보는 캔들로 계산해요 (주봉이면 20주 볼린저밴드, 14주 RSI). 앞쪽 계산이 모자란 캔들은 null.
function smaOf(vals, k) {
  const out = new Array(vals.length).fill(null); let sum = 0;
  for (let i = 0; i < vals.length; i++) { sum += vals[i]; if (i >= k) sum -= vals[i - k]; if (i >= k - 1) out[i] = sum / k; }
  return out;
}
// 볼린저밴드: 20개 평균 ± 표준편차 2배
function bandsOf(cl, k = 20, m = 2) {
  const mid = smaOf(cl, k), up = mid.slice(), lo = mid.slice();
  for (let i = k - 1; i < cl.length; i++) {
    let ss = 0;
    for (let j = i - k + 1; j <= i; j++) ss += (cl[j] - mid[i]) ** 2;
    const sd = Math.sqrt(ss / k);
    up[i] = mid[i] + m * sd; lo[i] = mid[i] - m * sd;
  }
  return { mid, up, lo };
}
// RSI: 신호 계산(kr_swing_backtest.rsi)과 같은 방식 (오른 폭·내린 폭의 지수평균, 1/n씩 반영)
function rsiOf(cl, n = 14) {
  const out = new Array(cl.length).fill(null);
  let g = null, l = null;
  for (let i = 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (g == null) { g = up; l = dn; } else { g += (up - g) / n; l += (dn - l) / n; }
    if (i >= n) out[i] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
  }
  return out;
}
function withIndicators(f) {
  return { ...f, bb: bandsOf(f.c), rsi: rsiOf(f.c), vma: f.v ? smaOf(f.v, 20) : null };
}

// 캔들 이름: axis = 아래 날짜 축, short = 최고·최저 표시, full = 눌렀을 때
function frameLabel(f, i, kind) {
  const a = f.first[i], b = f.last[i];
  if (f.frame === "y") return kind === "full" ? `${f.keys[i]}년` : f.keys[i];
  if (f.frame === "m") {
    const [y, m] = f.keys[i].split("-");
    return kind === "full" ? `${y}년 ${Number(m)}월` : `${y.slice(2)}.${m}`;
  }
  if (f.frame === "w") return kind === "full" ? `${a} ~ ${b.slice(5)}` : kind === "short" ? `${md(a)} 주` : a.slice(2).replace(/-/g, ".");
  return kind === "full" ? b : kind === "short" ? md(b) : b.slice(2).replace(/-/g, ".");
}

function drawTrendLine(d) {
  const s = d.signal && d.signal.series;
  if (!s || !s.dates.length) return;
  const days = 260;
  const cut = (arr) => arr.slice(-days - 1);  // 기간 시작 전날 종가부터 (변화율 기준점)
  const close = cut(s.close);
  lineChart($("#trend-chart"), {
    dates: cut(s.dates),
    series: [
      { name: d.index_name, color: "var(--series-1)", values: close },
      { name: "50일선", color: "var(--series-2)", values: cut(s.ma50), scale: days > 21 },
      { name: "200일선", color: "var(--series-3)", values: cut(s.ma200), scale: days > 21 },
    ],
    fmt: (v) => num(v),
    tall: true,
  });
  const first = close.find((v) => v != null), last = close[close.length - 1];
  $("#trend-change").innerHTML = first && last
    ? `최근 1년 <b class="${sign(last / first - 1)}">${pct(last / first - 1)}</b> (${num(first)} → ${num(last)})` : "";
}

function signalCard(d) {
  const s = d.signal;
  if (!s) {
    return `<section class="card"><h2>오늘의 신호</h2>
      <p class="empty">아직 계산된 신호가 없어요. ${NEXT_RUN[market]} 자동으로 계산되면 여기에 떠요.</p></section>`;
  }
  const chip = s.ok
    ? `<span class="chip good">● 매수 조건 충족</span>`
    : `<span class="chip wait">■ 매수 조건 미달</span>`;
  const gap = s.index / s.ma200 - 1;
  const idx = `<p class="sub">${esc(d.index_name)} ${num(s.index)} · 50일선 ${num(s.ma50)} · 200일선 ${num(s.ma200)} (${pct(gap)})</p>`;
  let body;
  if (market === "us") {
    const [title, desc] = US_ACTION[s.action] || ["-", ""];
    const etf = s.etf_close ? `<p class="muted">${esc(s.etf)} 종가 ${price("us", s.etf_close)} · ${money("us", d.capital)} 계좌면 ${money("us", d.capital / 2)} ≈ ${(d.capital / 2 / s.etf_close).toFixed(3)}주</p>` : "";
    body = `<p class="headline">${title}</p><p class="sub">${desc}</p>${idx}${etf}${opinion(s.opinion)}`;
  } else if (!s.ok) {
    body = `<p class="headline">신규 매수 쉬는 날</p><p class="sub">${esc(s.pause || "코스피가 50일선이나 200일선 아래라 새로 사지 않아요.")}</p>${idx}`;
  } else if (!s.picks.length) {
    body = `<p class="headline">오늘은 매수 신호 없음</p><p class="sub">조건에 맞게 눌린 종목이 없어요. 기다리는 것도 규칙이에요.</p>${idx}`;
  } else {
    const items = s.picks.map((p, i) => `<li data-stock="${esc(p.code)}"><div class="l">
        <div class="name">${i + 1}. ${esc(p.name)} <span class="meta">${esc(p.code)}</span></div>
        <div class="meta">RSI2 ${p.rsi2.toFixed(1)} · 5일선 ${num(p.ma5)}원 위로 마감하면 매도 · 손절 참고 ${num(p.stop)}원</div>
        ${opinion(p.opinion)}
        ${i >= s.max_positions ? `<div class="meta">${s.max_positions}종목이 차면 건너뛰어요</div>` : ""}
      </div><div class="r">${num(p.close)}원</div></li>`).join("");
    body = `<p class="headline">매수 후보 ${s.picks.length}개</p>
      <p class="sub">다음 거래일 시가에 종목당 계좌의 10%씩, 최대 ${s.max_positions}종목까지 사요.</p>${idx}
      <ul class="list" style="margin-top:12px">${items}</ul>`;
  }
  const look = sigLook(s);
  return `<section class="${look.cls}"><h2><span>오늘의 신호${look.badge}</span><small>${md(s.day)} 종가 기준</small></h2>${chip}${body}</section>`;
}

// 부서별 보고 (스크리닝·기술적 분석·펀더멘탈·마켓·리스크관리·운용부). 예전 기록엔 없을 수 있어요.
function desksCard(d) {
  const desks = d.signal && d.signal.desks;
  if (!desks || !desks.length) return "";
  const items = desks.map((x) => `<li><div class="l"><div class="name">${esc(x.dept)}</div>
      <div class="meta">${esc(x.text)}</div></div></li>`).join("");
  return `<section class="card"><h2>부서별 보고 <small>규칙 코드로 계산</small></h2><ul class="list">${items}</ul></section>`;
}

// 규칙으로 만든 매매 의견 (이유, 위험 등). 예전 기록엔 없을 수 있어요.
function opinion(lines) {
  if (!lines || !lines.length) return "";
  return lines.map((l) => `<div class="opinion">${esc(l)}</div>`).join("");
}

function accountCard(d) {
  const a = d.account;
  if (!a) {
    return `<section class="card"><h2>가상계좌 <small>${money(market, d.capital)}${market === "kr" ? "으로" : "로"} 시작</small></h2>
      <p class="empty">아직 첫 기록 전이에요. ${NEXT_RUN[market]} 첫 자동 실행부터 신호대로 샀다고 치고 날마다 기록해요.</p></section>`;
  }
  return `<section class="card"><h2>가상계좌 <small>${md(a.start)} 시작 · ${md(a.last_day)} 종가</small></h2>
    <p class="hero">${cnt(a.equity, "money", money(market, a.equity))}</p>
    <p class="sub"><span class="${sign(a.gain)}">${pct(a.gain)}</span> · 시작 ${money(market, a.capital)} · 현금 ${money(market, a.cash)}</p>
    <div class="stats">
      <div class="stat"><span>가상계좌</span><b class="${sign(a.gain)}">${cnt(a.gain, "pct", pct(a.gain))}</b></div>
      <div class="stat"><span>${esc(d.index_name)}</span><b class="${sign(a.index_gain)}">${cnt(a.index_gain, "pct", pct(a.index_gain))}</b></div>
      <div class="stat"><span>최대 낙폭</span><b>${cnt(a.mdd, "pct", pct(a.mdd))}</b></div>
    </div>
    <div style="margin-top:14px"><div class="legend">
      <span class="key"><i class="sw" style="background:var(--series-1)"></i>가상계좌</span>
      <span class="key"><i class="sw" style="background:var(--series-2)"></i>${esc(d.index_name)}</span>
      <span class="muted">시작일 대비 수익률</span></div>
      <div class="chart" id="equity-chart"></div></div>
    ${pendingLines(a)}
  </section>`;
}

// 다음 거래일 시가에 사고팔 예정인 종목
function pendingLines(a) {
  const out = [];
  if (a.pending_buys.length) out.push(`다음 거래일 시가 매수 예정: ${a.pending_buys.map(esc).join(", ")}`);
  if (a.pending_sells.length) out.push(`다음 거래일 시가 매도 예정: ${a.pending_sells.map(esc).join(", ")}`);
  return out.map((p) => `<p class="muted" style="margin:8px 0 0">${p}</p>`).join("");
}

function positionsCard(d) {
  const a = d.account;
  if (!a) return "";
  const items = a.positions.map((p) => `<li data-stock="${esc(p.code)}"><div class="l"><div class="name">${esc(p.name)}</div>
      <div class="meta">${shares(p.qty)} · ${md(p.buy_date)} ${price(market, p.buy_price)}에 매수 → 지금 ${price(market, p.price)}</div></div>
      <div class="r"><div class="${sign(p.ret)}">${pct(p.ret)}</div><div class="meta">${money(market, p.value)}</div></div></li>`).join("");
  return `<section class="card"><h2>보유 종목 <small>${a.positions.length}개</small></h2>
    ${items ? `<ul class="list">${items}</ul>` : `<p class="empty">지금은 보유 종목 없이 현금이에요.</p>`}</section>`;
}

function tradesCard(d) {
  const a = d.account;
  if (!a) return "";
  const summary = a.trade_count
    ? `<p class="muted" style="margin:0 0 8px">끝난 거래 ${a.trade_count}건 · 승률 ${Math.round(a.win_rate * 100)}% · 실현손익 <span class="${sign(a.realized)}">${a.realized > 0 ? "+" : ""}${money(market, a.realized)}</span></p>`
    : "";
  const items = a.trades.map((t) => `<li><div class="l"><div class="name">${esc(t.name)}</div>
      <div class="meta">${md(t.buy_date)} → ${md(t.sell_date)} · ${t.days}일 · ${esc(t.reason)}</div></div>
      <div class="r"><div class="${sign(t.ret)}">${pct(t.ret)}</div><div class="meta">${t.pnl > 0 ? "+" : ""}${money(market, t.pnl)}</div></div></li>`).join("");
  return `<section class="card"><h2>최근 거래 <small>최근 ${a.trades.length}건</small></h2>${summary}
    ${items ? `<ul class="list">${items}</ul>` : `<p class="empty">아직 끝난 거래가 없어요.</p>`}</section>`;
}

function trendCard(d) {
  if (!d.signal) return "";
  const cd = d.signal.candles;
  const buttons = FRAMES.map(([key, label]) =>
    `<button type="button" data-frame="${key}" aria-pressed="${key === frame}">${label}</button>`).join("");
  return `<section class="card"><h2>${esc(d.index_name)} 추세</h2>
    ${cd ? `<div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips(cd)}` : ""}
    <p class="muted" id="trend-change" style="margin:8px 0 4px"></p>
    ${cd ? candleLegend() : `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--series-1)"></i>${esc(d.index_name)}</span>
      <span class="key"><i class="sw" style="background:var(--series-2)"></i>50일선</span>
      <span class="key"><i class="sw" style="background:var(--series-3)"></i>200일선</span></div>`}
    <div class="chart candle" id="trend-chart"></div>
    <p class="muted" style="margin:8px 0 0">${cd
      ? "옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그 기간의 시가·고가·저가·종가가 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 세부정보가 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요. "
      : ""}${TREND_RULE[market]}</p>${cd ? indHelp() : ""}</section>`;
}

function candleLegend() {
  return `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--up)"></i>상승</span>
      <span class="key"><i class="sw" style="background:var(--down)"></i>하락</span>
      ${IND.ma ? `<span class="key ma-key"><i class="sw" style="background:var(--ma50)"></i>50일선</span>
      <span class="key ma-key"><i class="sw" style="background:var(--ma200)"></i>200일선</span>` : ""}
      ${IND.bb ? `<span class="key"><i class="sw" style="background:var(--bb)"></i>볼린저밴드</span>` : ""}</div>`;
}

// 보조지표 버튼 (여러 개 같이 켤 수 있어요). 거래량 자료가 없는 예전 기록이면 거래량 버튼은 못 눌러요.
function indChips(cd) {
  const chips = IND_KEYS.map(([k, label]) => {
    const off = k === "vol" && !(Array.isArray(cd.v) && cd.v.length);
    return `<button type="button" data-ind="${k}" aria-pressed="${IND[k] && !off}"${off ? " disabled" : ""}>${label}</button>`;
  }).join("");
  return `<div class="chips" role="group" aria-label="보조지표">${chips}</div>`;
}

const IND_HELP = {
  bb: "볼린저밴드: 가운데 점선은 최근 20개 캔들 평균, 띠는 평소 움직이는 범위(표준편차 2배)예요. 띠 밖으로 나가면 평소보다 크게 움직인 거예요.",
  vol: "거래량: 막대가 길수록 많이 사고판 날이에요. 막대가 평균선보다 훨씬 길면 평소보다 관심이 몰린 거예요.",
  rsi: "RSI(14): 최근 14개 캔들 동안 오른 힘과 내린 힘을 0~100으로 나타내요. 70 위면 많이 올라 과열, 30 아래면 많이 내린 상태로 봐요.",
};
function indHelp() {
  const items = IND_KEYS.filter(([k]) => IND[k] && IND_HELP[k]).map(([k]) => `<li>${IND_HELP[k]}</li>`);
  if (!items.length) return "";
  return `<ul class="help">${items.join("")}<li>보조지표는 지금 보는 캔들로 계산해요. 주봉이면 20주 평균, 14주 RSI예요.</li></ul>`;
}

// 내 매매 규칙표: 알림과 따로 가상계좌로 검증 중 (예전 데이터엔 없을 수 있어요).
// 오늘 후보와 규칙은 신호 화면, 계좌 성과는 성과 화면에 보여요.
function rulebookPicksCard(d) {
  const rb = d.rulebook;
  if (!rb) return "";
  const picks = (d.signal && d.signal.rulebook) || [];
  const unit = market === "kr" ? "원" : "달러";
  const items = picks.map((p, i) => `<li data-stock="${esc(p.code)}"><div class="l">
      <div class="name">${i + 1}. ${esc(p.name)} <span class="meta">${esc(p.code)}</span></div>${opinion(p.opinion)}</div>
      <div class="r">${num(p.close)}${unit}</div></li>`).join("");
  return `<section class="card"><h2>내 규칙표 후보 <small>${picks.length}개 · 검증용 가상계좌에 기록</small></h2>
    ${items ? `<ul class="list">${items}</ul>` : `<p class="empty">오늘은 규칙표 조건에 맞는 종목이 없어요.</p>`}
    <details style="margin-top:12px"><summary>규칙표 보기</summary><ol>${rb.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details>
  </section>`;
}

function rulebookAccountCard(d) {
  const rb = d.rulebook;
  if (!rb) return "";
  const a = rb.account;
  const main = d.account;
  const body = a
    ? `<div class="stats">
        <div class="stat"><span>규칙표 계좌</span><b class="${sign(a.gain)}">${cnt(a.gain, "pct", pct(a.gain))}</b></div>
        <div class="stat"><span>알림 규칙 계좌</span><b class="${main ? sign(main.gain) : ""}">${main ? cnt(main.gain, "pct", pct(main.gain)) : "-"}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${cnt(a.mdd, "pct", pct(a.mdd))}</b></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${money(market, a.equity)} · 끝난 거래 ${a.trade_count}건${a.trade_count ? ` · 승률 ${Math.round(a.win_rate * 100)}%` : ""} · 보유 ${a.positions.length}종목</p>`
    : `<p class="empty">${NEXT_RUN[market]} 첫 자동 실행부터 기록해요.</p>`;
  return `<section class="card"><h2>내 규칙표 검증 <small>가상계좌</small></h2>${body}</section>`;
}

// ---------------------------------------------------------------- 내 자산 합계·실전 전환·ETF·메모·점검

// 가상계좌 셋(국장·미장·ETF)을 원화로 합친 한 줄 (미장은 환율로 바꿔요)
function totalLine() {
  const t = DATA.total;
  if (!t) return "";
  return `<div class="track-line"><span>내 가상 자산 합계 <small>원화 · 환율 ${num(t.fx)}원</small></span>
    <b class="${sign(t.gain)}">${num(t.equity)}원</b>
    <span class="muted">시작 대비 ${pct(t.gain)} · 현금 ${Math.round(t.cash_share * 100)}% · 달러 ${Math.round(t.usd_share * 100)}%</span></div>`;
}

// 지난 주간 점검에서 문제가 있었으면 홈에 한 줄
function healthLine() {
  const h = DATA.health;
  if (!h || h.ok) return "";
  const bad = h.workflows.filter((w) => !w.ok).map((w) => esc(w.label)).join(", ");
  return `<p class="caution">지난 주 자동 실행 확인 필요: ${bad}</p>`;
}

function readinessCard(d) {
  const r = d.readiness;
  const e = market === "kr" && d.etf && d.etf.readiness;
  if (!r && !e) {
    return `<section class="card"><h2>실전 전환 판정</h2><p class="empty">가상계좌 기록이 쌓이면 진짜 돈을 넣어도 되는 단계인지 여기서 판정해요.</p></section>`;
  }
  const block = (x) => `<p class="name" style="margin:14px 0 6px;font-weight:700">${esc(x.name)} · ${x.ready ? "통과 ✅" : "아직"}</p>
    <ul class="list">${x.checks.map((c) => `<li><div class="l"><div class="name">${c.ok ? "✅" : "⬜"} ${esc(c.label)}</div>
      <div class="meta">${esc(c.detail)}</div></div></li>`).join("")}</ul><p class="muted" style="margin:8px 0 0">${esc(x.verdict)}</p>`;
  return `<section class="card"><h2>실전 전환 판정 <small>전부 통과하면 소액으로</small></h2>
    ${[r, e].filter(Boolean).map(block).join("")}</section>`;
}

function etfAccountCard(d) {
  if (market !== "kr" || !d.etf) return "";
  const a = d.etf.account;
  const body = a
    ? `<p class="hero">${cnt(a.equity, "money", money("kr", a.equity))}</p>
      <div class="stats">
        <div class="stat"><span>ETF 계좌</span><b class="${sign(a.gain)}">${cnt(a.gain, "pct", pct(a.gain))}</b></div>
        <div class="stat"><span>코스피</span><b class="${sign(a.index_gain)}">${cnt(a.index_gain, "pct", pct(a.index_gain))}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${cnt(a.mdd, "pct", pct(a.mdd))}</b></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${a.positions.length ? a.positions.map((p) => `${esc(p.name)} ${shares(p.qty)} ${pct(p.ret)}`).join(" · ") : "보유 없음 (현금)"}</p>
      ${pendingLines(a)}`
    : `<p class="empty">${NEXT_RUN.kr} 첫 자동 실행부터 기록해요.</p>`;
  return `<section class="card"><h2>ETF(원화) 계좌 <small>ISA·연금저축용 · 70만 원</small></h2>${body}
    <details style="margin-top:12px"><summary>규칙 보기</summary><ol>${d.etf.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details></section>`;
}

// 세계 지수·환율 (world.py, 국장·미장 같이). 보기용이고 매매 규칙엔 안 써요.
const WORLD_MAIN = ["^KS11", "^GSPC", "^IXIC", "KRW=X"];  // 펼치지 않아도 늘 보이는 것
function worldValue(r) {
  const v = r.last.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return r.kind === "krw" ? `${v}원` : v;
}
function worldRow(r) {
  const [key, , n, line] = WORLD_P.find((p) => p[0] === worldP);
  const closes = n ? r.closes.slice(-n) : r.closes;
  return `<li class="stock spark-row no-star"><div class="name">${esc(r.name)}</div>
    <div class="meta">${md(r.day)} 종가${n && closes.length > 1 ? ` · ${line} ${pct(closes[closes.length - 1] / closes[0] - 1)}` : ""}</div>
    <div class="mini">${spark(closes, `${r.name} 최근 ${line}`)}</div>
    <div class="price">${worldValue(r)}</div><div class="chg ${sign(r[key])}">${pct(r[key], 2)}</div></li>`;
}
function worldCard() {
  const w = DATA.world;
  if (!w || !w.groups || !w.groups.length) return "";
  const all = w.groups.flatMap((g) => g.items);
  const main = WORLD_MAIN.map((s) => all.find((r) => r.sym === s)).filter(Boolean);
  const [, label, , line] = WORLD_P.find((p) => p[0] === worldP);
  const chips = `<div class="chips" role="group" aria-label="기간 고르기" style="margin:0 0 6px">${WORLD_P.map(([k, l]) =>
    `<button type="button" data-world-p="${k}" aria-pressed="${k === worldP}">${l}</button>`).join("")}</div>`;
  const groups = w.groups.map((g) => `<h3 class="muted" style="margin:12px 0 4px">${esc(g.name)}</h3>
    <ul class="list">${g.items.map(worldRow).join("")}</ul>`).join("");
  return `<section class="card" id="world-card"><h2>세계 지수·환율 <small>${md(w.updated)} ${esc(w.updated.slice(11, 16))} 기준</small></h2>${chips}
    <ul class="list">${main.map(worldRow).join("")}</ul>
    <details id="world-all" class="more-list"${worldOpen ? " open" : ""}><summary class="muted">나라별 지수·환율 전체 보기 (${all.length}개)</summary>${groups}</details>
    <p class="muted" style="margin:10px 0 0">숫자는 ${label} 등락률, 선은 최근 ${line} 종가예요. 원/달러가 오르면 원화 약세(달러가 비싸짐)예요. 나라마다 장 마감 시간이 달라 날짜가 다를 수 있어요.</p></section>`;
}

// 경기 국면 (macro.py, 국장·미장 같이). 매매 규칙엔 안 쓰고 참고로만 보여 줘요.
function macroCard() {
  const m = DATA.macro;
  if (!m) return "";
  const chip = m.regime === "확장"
    ? `<span class="chip good">● 확장</span>` : `<span class="chip wait">■ ${esc(m.regime)}</span>`;
  const mark = (s) => (s.warn ? "⚠️" : s.near ? "🟡" : "✅");
  const items = m.signals.map((s) => `<li><div class="l"><div class="name">${mark(s)} ${esc(s.name)}</div>
      <div class="meta">${esc(s.now)}</div><div class="meta">경고 기준: ${esc(s.rule)}</div></div></li>`).join("");
  const us = (m.us_economy || []).map((r) => `<li><div class="l"><div class="name">${r.warn ? "⚠️" : "·"} ${esc(r.name)}</div>
      <div class="meta">${esc(r.value)} · ${esc(r.note)}</div></div></li>`).join("");
  const hist = (m.history || []).slice(-12).map((h) => h.score).join(" ");
  const change = m.month_ago !== m.score ? ` · 한 달 전 ${m.month_ago}개(${esc(m.prev_regime)})` : "";
  return `<section class="card"><h2>경기 국면 <small>${md(m.day)} 기준 · 참고</small></h2>${chip}
    <p class="headline">경고 ${m.score}/${m.total}개${change}</p><p class="sub">${esc(m.action)}</p>
    <details style="margin-top:10px"><summary class="muted">지표 ${m.total}개 자세히 보기</summary>
      <ul class="list" style="margin-top:8px">${items}</ul>
      ${us ? `<h3 class="muted" style="margin:10px 0 4px">미국 경제 참고 (FRED)</h3><ul class="list">${us}</ul>` : ""}
      ${hist ? `<p class="muted" style="margin:10px 0 0">최근 12주 경고 개수: ${hist}</p>` : ""}
    </details>
    <p class="muted" style="margin:10px 0 0">경고 0~1개 확장, 2~3개 둔화, 4개↑ 위축 경고. 백테스트에서 이걸로 매수를 줄여도 낙폭이 안 줄어서 규칙은 안 바꿔요.</p></section>`;
}

// 업종별 호재·악재 (sectors.py). 버튼으로 업종을 고르면 그 업종만 자세히, 관심 화면 전체 종목도 그 업종만 보여 줘요.
function sectorChips(list, current) {
  const btn = (name, label) => `<button type="button" data-sector="${esc(name)}" aria-pressed="${current === name}">${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="업종 고르기" style="margin-bottom:8px">${btn("", "전체")}${list.map((n) => btn(n, n)).join("")}</div>`;
}
function toneBadge(s) {
  if (!s.news || !s.news.length) return "";
  const cls = s.good > s.bad ? "good" : s.bad > s.good ? "bad" : "";
  return `<span class="badge ${cls}">${esc(s.label)}</span>`;
}
function sectorsCard(d) {
  const secs = d.signal && d.signal.sectors;
  if (!secs || !secs.length) return "";
  let cur = SECTOR[market];
  const s = secs.find((x) => x.name === cur);
  if (!s) cur = "";
  const chips = sectorChips(secs.map((x) => x.name), cur);
  let body;
  if (!s) {
    body = `<ul class="list" style="margin-top:10px">${secs.map((x) => `<li data-sector="${esc(x.name)}"><div class="l">
        <div class="name">${esc(x.name)}${toneBadge(x)}</div>
        <div class="meta">${x.count}종목${x.vs_index == null ? "" : ` · 지수보다 ${pct(x.vs_index)}p`}${x.r20 == null ? "" : ` · 20일 ${pct(x.r20)}`}</div></div>
        <div class="r ${sign(x.r5)}">${pct(x.r5)}</div></li>`).join("")}</ul>`;
  } else {
    const names = new Map(stocksOf(d).map((x) => [x.code, x]));
    const news = (s.news || []).map((n) => {
      const tag = n.tone > 0 ? `<span class="badge good">호재</span>` : n.tone < 0 ? `<span class="badge bad">악재</span>` : "";
      const title = /^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title);
      return `<li><div class="l"><div class="meta">${tag} ${title}${n.source ? ` · ${esc(n.source)}` : ""}${n.date ? ` · ${md(n.date)}` : ""}</div></div></li>`;
    }).join("");
    const members = s.codes.map((c) => {
      const st = names.get(c);
      return st ? stockRow(st, d) : "";
    }).join("");
    body = `<p class="headline">${esc(s.name)} ${pct(s.r5)}${toneBadge(s)}</p>
      <p class="sub">5거래일 중간값${s.vs_index == null ? "" : `, 지수보다 ${pct(s.vs_index)}p`}${s.r20 == null ? "" : ` · 20일 ${pct(s.r20)}`}${s.above200 == null ? "" : ` · 200일선 위 ${Math.round(s.above200 * 100)}%`}</p>
      <p class="muted" style="margin:6px 0 0">가장 강한 종목 ${esc(s.best.name)} ${pct(s.best.r5)} · 가장 약한 종목 ${esc(s.worst.name)} ${pct(s.worst.r5)} (${s.count}종목 중)</p>
      ${news ? `<h3 class="muted" style="margin:12px 0 4px">최근 7일 뉴스 제목 · 호재 ${s.good} · 악재 ${s.bad}</h3><ul class="list">${news}</ul>`
        : `<p class="empty">최근 7일 뉴스 제목을 못 받았어요.</p>`}
      ${members ? `<h3 class="muted" style="margin:12px 0 4px">이 업종 대형주</h3><ul class="list">${members}</ul>` : ""}`;
  }
  return `<section class="card" id="sectors-card"><h2>업종별 호재·악재 <small>최근 5거래일 · 참고</small></h2>${chips}${body}
    <p class="muted" style="margin:10px 0 0">호재·악재는 뉴스 제목 낱말로 짐작한 거예요. 고른 업종은 관심 화면 전체 종목에도 똑같이 걸려요.</p></section>`;
}

// 많이 오른·내린 종목과 추정 이유 (movers.py). 예전 기록엔 없을 수 있어요.
function moversCard(d) {
  const mv = d.signal && d.signal.movers;
  if (!mv) return "";
  const row = (p) => {
    const n = (p.news || [])[0];
    const link = n && /^https:\/\//.test(n.link || "")
      ? `<div class="meta">📰 <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>${n.source ? ` · ${esc(n.source)}` : ""}</div>` : "";
    return `<li><div class="l"><div class="name">${esc(p.name)}${p.sector ? `<span class="badge">${esc(p.sector)}</span>` : ""} <span class="meta">${esc(p.main)}</span></div>
      ${(p.reasons || []).slice(0, 2).map((r) => `<div class="meta">${esc(r)}</div>`).join("")}${link}</div>
      <div class="r ${sign(p.r5)}">${pct(p.r5)}<div class="meta">오늘 ${pct(p.r1)}</div></div></li>`;
  };
  const part = (rows, head) => rows && rows.length ? `<h3 class="muted" style="margin:10px 0 4px">${head}</h3><ul class="list">${rows.map(row).join("")}</ul>` : "";
  const body = part(mv.up, "▲ 많이 오른 종목") + part(mv.down, "▼ 많이 내린 종목");
  return `<section class="card"><h2>왜 움직였나 <small>최근 5거래일 · ${mv.count}개 종목 중</small></h2>
    ${body || `<p class="empty">최근 5거래일 ±3% 넘게 움직인 종목이 없어요.</p>`}
    <p class="muted" style="margin:10px 0 0">이유는 시장·같이 움직인 종목·거래량·뉴스 제목으로 짐작한 거예요. 사기 전에 기사 원문을 확인하세요.</p></section>`;
}

function widePicksCard(d) {
  if (market !== "kr" || !d.signal || !d.signal.wide) return "";
  const picks = d.signal.wide;
  const items = picks.map((p, i) => `<li><div class="l"><div class="name">${i + 1}. ${esc(p.name)} <span class="meta">${esc(p.code)}</span></div>
      <div class="meta">RSI2 ${p.rsi2} · 손절 참고 ${num(p.stop)}원</div></div><div class="r">${num(p.close)}원</div></li>`).join("");
  return `<section class="card"><h2>넓은 범위 후보 <small>참고 · 코스피 상위 200</small></h2>
    ${items ? `<ul class="list">${items}</ul>` : `<p class="empty">오늘은 넓은 범위에서도 조건에 맞는 종목이 없어요.</p>`}
    <p class="muted" style="margin:10px 0 0">같은 조건을 2015년 이후 커진 회사까지 넓혀 봤어요. 검증 전이라 가상계좌엔 안 넣고 성과 화면 추천 성과로만 기록해요.</p></section>`;
}

// 내 판단 기록장 (텔레그램 '메모 삼성전자 산다')
function memoCard() {
  const m = DATA.memos;
  if (!m) {
    return `<section class="card"><h2>내 판단 기록장</h2><p class="empty">텔레그램 봇에 '메모 삼성전자 산다 (이유)'처럼 보내면 20거래일 뒤 맞혔는지 여기서 보여 줘요.</p></section>`;
  }
  const s = m.score;
  const head = s ? `<div class="stats">
      <div class="stat"><span>맞힌 비율</span><b>${Math.round(s.hit * 100)}%</b></div>
      <div class="stat"><span>'산다' 평균</span><b class="${sign(s.buy_avg)}">${s.buy_avg == null ? "-" : pct(s.buy_avg)}</b></div>
      <div class="stat"><span>'안 산다' 평균</span><b class="${sign(s.skip_avg)}">${s.skip_avg == null ? "-" : pct(s.skip_avg)}</b></div>
    </div>` : `<p class="muted">아직 20거래일 지난 판단이 없어요.</p>`;
  const items = m.recent.map((x) => `<li><div class="l"><div class="name">${esc(x.name)} ${x.view > 0 ? "산다" : "안 산다"}</div>
      <div class="meta">${md(x.date)} · ${money(x.market, x.price)}${x.note ? ` · ${esc(x.note)}` : ""}</div></div>
      <div class="r ${x.ret == null ? "" : sign(x.ret)}">${x.ret == null ? "-" : pct(x.ret)}</div></li>`).join("");
  return `<section class="card"><h2>내 판단 기록장 <small>${m.count}개</small></h2>${head}<ul class="list" style="margin-top:12px">${items}</ul></section>`;
}

function healthCard() {
  const h = DATA.health;
  if (!h) return "";
  const rows = h.workflows.map((w) => `<li><div class="l"><div class="name">${w.ok ? "✅" : "⚠️"} ${esc(w.label)}</div>
      <div class="meta">성공 ${w.success}회${w.expected ? `/${w.expected}회 예정` : ""}${w.failure ? ` · 실패 ${w.failure}회` : ""}</div></div></li>`).join("");
  return `<section class="card"><h2>자동 실행 점검 <small>${md(h.checked.slice(0, 10))} 기준 지난 7일</small></h2><ul class="list">${rows}</ul></section>`;
}

function rulesCard(d) {
  return `<section class="card"><details><summary>${esc(d.name)} 규칙 보기</summary>
    <ol>${d.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details></section>`;
}

// ---------------------------------------------------------------- 종목 화면 (차트 + 재무제표)
// 자료는 종목마다 stocks/<시장>/<코드>.json (배포 때 stock_pages.py가 만듦). 처음 열 때 받아서 앱을 닫을 때까지 기억해요.
const STOCK_FRAMES = FRAMES;  // 상장일부터 받은 일봉이라 년봉까지 봐요
let stockFrame = "d";
let fundMode = "annual";
const STOCK_DATA = new Map();   // "kr/005930" → 받는 중인 Promise
const STOCK_READY = new Map();  // "kr/005930" → 받은 자료
let stockDrawn = null;          // 차트를 마지막으로 그린 종목 (바뀌면 보던 구간을 처음으로)
let alertOpen = false;          // 종목 화면의 가격 알림 칸을 펼쳤는지

function stockData(m, code) {
  const key = `${m}/${code}`;
  if (!STOCK_DATA.has(key)) {
    STOCK_DATA.set(key, fetch(`stocks/${m}/${encodeURIComponent(code)}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (x) STOCK_READY.set(key, x); else STOCK_DATA.delete(key);  // 못 받았으면 다음에 다시 받아요
        return x;
      }));
  }
  return STOCK_DATA.get(key);
}

function stockHeadCard(d) {
  const code = stockCode;
  const s = stocksOf(d).find((x) => x.code === code);
  const x = STOCK_READY.get(`${market}/${code}`);
  const name = (s && s.name) || (x && x.name) || code;
  const on = WATCH[market].includes(code);
  const sig = d.signal || {};
  const badges = [];
  if ((sig.picks || []).some((p) => p.code === code)) badges.push(`<span class="badge good">오늘 매수 후보</span>`);
  if ((sig.rulebook || []).some((p) => p.code === code)) badges.push(`<span class="badge">규칙표 후보</span>`);
  if (s && s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const kind = s && s.extra ? kindName(market, [code, name, s.exch || "", s.kind || "s"])
    : market === "kr" ? "코스피" : code === "SPY" ? "미국 ETF" : "미국 주식";
  const c3 = s && s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <div class="stock-title"><div class="l"><h2 class="stock-name">${esc(name)}</h2>
      <div class="meta">${esc(code)} · ${kind}${badges.join("")}</div>${sectorTags(d, code)}</div>
      <button type="button" class="star" data-star="${esc(code)}" aria-pressed="${on}"
        aria-label="${esc(name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></div>
    ${s && s.close != null ? `<p class="hero">${cnt(s.close, "price", price(market, s.close))}</p>
      <p class="sub"><span class="nowrap"><b class="${sign(s.d1)}">${cnt(s.d1, "pct2", pct(s.d1, 2))}</b> 전일 대비</span>${c3 == null ? ""
        : ` · <span class="nowrap">3개월 <b class="${sign(c3)}">${cnt(c3, "pct", pct(c3))}</b></span>`} · <span class="nowrap">${md(s.day)} 종가</span></p>`
      : s && s.extra ? `<p class="sub">시세는 대시보드가 다시 올라갈 때 받아요.</p>` : ""}
    ${alertBox(d, code, s)}
  </section>`;
}

// 종목 화면: 이 종목 업종과 연관 업종(공급망·수요)의 흐름·호재·악재를 한꺼번에 (sectors.py)
function sectorLine(x, why) {
  const n = (x.news || []).find((k) => k.tone) || (x.news || [])[0];
  const tag = n && n.tone > 0 ? `<span class="badge good">호재</span> ` : n && n.tone < 0 ? `<span class="badge bad">악재</span> ` : "";
  return `<li data-sector-go="${esc(x.name)}"><div class="l"><div class="name">${esc(x.name)}${toneBadge(x)}</div>
      ${why ? `<div class="meta">${esc(why)}</div>` : ""}
      ${n ? `<div class="meta">${tag}${esc(n.title)}</div>` : ""}</div>
      <div class="r ${sign(x.r5)}">${pct(x.r5)}<div class="meta">20일 ${pct(x.r20)}</div></div></li>`;
}
// 종목 이름 아래 작은 업종 키워드: #이 종목 업종 + 연관 업종 (누르면 아래 '업종과 연관 업종' 칸으로)
function sectorTags(d, code) {
  const sig = d.signal || {};
  const name = (sig.sector_of || {})[code];
  if (!name) return "";
  const rel = ((sig.sector_links || {})[name] || []).map(([n]) => n);
  const tag = (n, main) => `<span class="tag${main ? " main" : ""}">#${esc(n)}</span>`;
  return `<a class="tags" href="#stock-sector" data-tags>${tag(name, true)}${rel.map((n) => tag(n)).join("")}</a>`;
}

function stockSectorCard(d) {
  const sig = d.signal || {};
  const secs = sig.sectors || [];
  const name = (sig.sector_of || {})[stockCode];
  const mine = secs.find((x) => x.name === name);
  if (!mine) return "";
  const links = ((sig.sector_links || {})[name] || [])
    .map(([n, why]) => [secs.find((x) => x.name === n), why]).filter(([x]) => x);
  const peers = mine.codes.filter((c) => c !== stockCode)
    .map((c) => stocksOf(d).find((x) => x.code === c)).filter(Boolean).slice(0, 5);
  return `<section class="card" id="stock-sector"><h2>업종과 연관 업종 <small>최근 5거래일 · 참고</small></h2>
    <ul class="list">${sectorLine(mine, `이 종목 업종 · ${mine.count}종목 중간값${mine.vs_index == null ? "" : `, 지수보다 ${pct(mine.vs_index)}p`}`)}</ul>
    ${links.length ? `<h3 class="muted" style="margin:12px 0 4px">같이 보면 좋은 연관 업종</h3>
      <ul class="list">${links.map(([x, why]) => sectorLine(x, `${why}로 이어져요`)).join("")}</ul>` : ""}
    ${peers.length ? `<h3 class="muted" style="margin:12px 0 4px">같은 업종 대형주</h3>
      <ul class="list">${peers.map((x) => stockRow(x, d)).join("")}</ul>` : ""}
    <p class="muted" style="margin:10px 0 0">업종을 누르면 홈 '업종별 호재·악재'에서 그 업종 뉴스와 종목을 자세히 봐요. 호재·악재는 뉴스 제목으로 짐작한 거예요.</p></section>`;
}

// 가격 알림: 텔레그램 봇이 15분마다 야후 5분봉을 보고, 정한 가격에 닿으면 텔레그램으로 알려 줘요.
// 여기서는 봇에게 보낼 명령을 시작 링크로 만들어 줘요 (앱이 직접 알림을 저장하지는 못해요).
function alertBox(d, code, s) {
  const mine = (d.alerts || []).filter((a) => a.code === code);
  const rows = mine.map((a) => {
    const del = tgLink(`알림 삭제 ${a.id}`);
    return `<li><span><b>${price(market, a.price)}</b> ${a.dir === "up" ? "이상" : "이하"}</span>
      <small>${md(String(a.created || "").slice(0, 10))} 등록</small>${del ? `<a class="linkish" href="${esc(del)}" target="_blank" rel="noopener">지우기</a>` : ""}</li>`;
  }).join("");
  const drop = s && s.extra ? tgLink(`관심 빼기 ${market} ${code}`) : null;
  return `<div class="alert-box">
    <button type="button" class="alert-toggle" data-alert-toggle aria-expanded="${alertOpen}">
      <span>가격 알림${mine.length ? ` <b>${mine.length}개</b>` : ""}</span><span class="pm" aria-hidden="true">${alertOpen ? "−" : "+"}</span></button>
    ${mine.length ? `<ul class="alert-list">${rows}</ul>` : ""}
    ${alertOpen ? alertForm(s) : ""}
    ${drop ? `<p class="muted" style="margin:8px 0 0">텔레그램으로 넣은 종목이에요. <a class="linkish" href="${esc(drop)}" target="_blank" rel="noopener">대시보드에서 빼기</a></p>` : ""}
  </div>`;
}

function alertForm(s) {
  if (!(DATA && DATA.bot)) return `<p class="muted">텔레그램 봇이 연결되면(telegram-bot 워크플로가 한 번 돌면) 여기서 알림을 만들 수 있어요.</p>`;
  const now = s && s.close != null ? s.close : null;
  const v = now == null ? "" : market === "kr" ? String(Math.round(now)) : now.toFixed(2);
  return `<div class="alert-form">
      <label class="alert-input"><input id="alert-price" type="text" inputmode="decimal" autocomplete="off" value="${v}"
        aria-label="알림 받을 가격"><span>${market === "kr" ? "원" : "달러"}</span></label>
      <a class="add" id="alert-send" target="_blank" rel="noopener">텔레그램으로 알림 받기</a></div>
    <p class="muted" id="alert-hint" style="margin:8px 0 0"></p>`;
}

// '30만', '300,000원', '$250.5' → 숫자
function readPrice(t) {
  const m = String(t || "").replace(/[,\s원$달러]/g, "").match(/^(\d+(?:\.\d+)?)(만|천)?$/);
  return m ? parseFloat(m[1]) * (m[2] === "만" ? 1e4 : m[2] === "천" ? 1e3 : 1) : null;
}

function bindAlert(s) {
  const toggle = $("[data-alert-toggle]");
  if (toggle) toggle.addEventListener("click", () => { alertOpen = !alertOpen; render(); if (alertOpen) { const i = $("#alert-price"); if (i) i.focus(); } });
  const input = $("#alert-price"), send = $("#alert-send"), hint = $("#alert-hint");
  if (!input || !send || !hint) return;
  const now = s && s.close != null ? s.close : null;
  const update = () => {
    const v = readPrice(input.value);
    if (!(v > 0)) {
      send.removeAttribute("href");
      send.setAttribute("aria-disabled", "true");
      hint.textContent = "가격을 숫자로 넣어 주세요. 30만처럼 써도 돼요.";
      return;
    }
    const value = market === "kr" ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
    send.href = tgLink(`알림 ${market} ${stockCode} ${value}`);
    send.removeAttribute("aria-disabled");
    const where = now == null ? "" : v > now ? `최근 종가(${price(market, now)})보다 높아서, ${price(market, v)} 이상이 되면 알려 드려요. `
      : v < now ? `최근 종가(${price(market, now)})보다 낮아서, ${price(market, v)} 이하가 되면 알려 드려요. ` : "최근 종가와 같아요. 조금 높거나 낮게 넣어 주세요. ";
    hint.textContent = `${where}버튼을 누르면 텔레그램이 열려요. 시작(START)을 누르면 보통 30분 안에 등록되고 답장이 와요.`;
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  update();
}

function stockChartCard() {
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  const buttons = STOCK_FRAMES.map(([key, label]) =>
    `<button type="button" data-sframe="${key}" aria-pressed="${key === stockFrame}">${label}</button>`).join("");
  return `<section class="card"><h2>차트 <small id="stock-since">${esc(sinceLabel(x && x.candles))}</small></h2>
    <div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips((x && x.candles) || { v: [1] })}
    <p class="muted" id="stock-change" style="margin:8px 0 4px"></p>${candleLegend()}
    <div class="chart candle" id="stock-chart"><p class="empty">차트를 불러오는 중이에요…</p></div>
    <p class="muted" id="stock-all" style="margin:8px 0 0"></p>
    <p class="muted" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요.</p>${indHelp()}</section>`;
}

// 차트 제목 옆: 자료가 시작하는 달. 보통 상장일이고, 야후 자료가 거기까지만 있는 오래된 종목
// (국장 2000년 1월, 미장 1962년 1월)은 그때부터예요.
function sinceLabel(c) {
  if (!c || !c.dates || !c.dates.length) return "";
  const first = c.dates[0], ym = `${first.slice(0, 4)}.${first.slice(5, 7)}`;
  if (!c.full) return `${ym}부터`;
  const oldest = market === "kr" ? first <= "2000-01-31" : first <= "1962-01-31";
  return oldest ? `${ym}부터 전체 (야후 자료 시작)` : `${ym} 상장 이후 전체`;
}

// 차트 아래 한 줄: 자료 첫날부터 지금까지 오른 비율과 전체 최고·최저 (보이는 구간과 상관없이)
function allTimeLine(c) {
  const n = c.dates.length;
  let hi = 0, lo = 0;
  for (let i = 1; i < n; i++) { if (c.h[i] > c.h[hi]) hi = i; if (c.l[i] < c.l[lo]) lo = i; }
  const ch = c.c[n - 1] / c.o[0] - 1, d = (s) => s.slice(2).replace(/-/g, ".");  // 첫날 시가부터 (차트 위 기간 수익률과 같은 기준)
  return `<span class="nowrap">${d(c.dates[0])}부터 <b class="${sign(ch)}">${pct(ch)}</b></span>`
    + ` · <span class="nowrap">전체 최고 ${px(market, c.h[hi])} (${d(c.dates[hi])})</span>`
    + ` · <span class="nowrap">최저 ${px(market, c.l[lo])} (${d(c.dates[lo])})</span>`;
}

function bindStock() {
  const key = `${market}/${stockCode}`;
  bindAlert(stocksOf(DATA.markets[market]).find((x) => x.code === stockCode));
  const fill = (x) => {
    if (screen !== "stock" || `${market}/${stockCode}` !== key) return;  // 받는 사이 다른 화면으로 갔으면 안 그려요
    drawStock(x, false);
  };
  if (STOCK_READY.has(key)) fill(STOCK_READY.get(key));
  else stockData(market, stockCode).then(fill);
  document.querySelectorAll("[data-sframe]").forEach((b) => b.addEventListener("click", () => {
    stockFrame = b.dataset.sframe;
    document.querySelectorAll("[data-sframe]").forEach((y) => y.setAttribute("aria-pressed", String(y === b)));
    if (STOCK_READY.has(key)) drawStock(STOCK_READY.get(key), true);
  }));
}

function drawStock(x, reset) {
  const el = $("#stock-chart");
  if (!el) return;
  const key = `${market}/${stockCode}`;
  if (x && x.candles && x.candles.dates.length > 1) {
    const f = frameCandles(x.candles, stockFrame);
    const show = (STOCK_FRAMES.find((y) => y[0] === stockFrame) || STOCK_FRAMES[0])[2];
    candleChart(el, f, show, reset || stockDrawn !== key, (txt) => { const r = $("#stock-change"); if (r) r.innerHTML = txt; },
      { fmt: (v) => px(market, v), name: x.name });
    stockDrawn = key;
    const all = $("#stock-all"), since = $("#stock-since");
    if (all) all.innerHTML = allTimeLine(x.candles);
    if (since) since.textContent = sinceLabel(x.candles);
  } else {
    el.innerHTML = `<p class="empty">${x ? "이 종목은 차트 자료를 못 받았어요." : "이 종목 자료를 아직 못 받았어요."} 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`;
  }
  fillFund(x && x.fund);
}

function fillFund(f) {
  const card = $("#fund-card");
  if (!card) return;
  card.innerHTML = fundHtml(f);
  card.querySelectorAll("[data-fund]").forEach((b) => b.addEventListener("click", () => {
    fundMode = b.dataset.fund;
    fillFund(f);
  }));
}

// 큰 금액은 조·억 단위로 (원이든 달러든 숫자만, 단위는 따로 적어요)
function bigNum(x) {
  if (x == null) return "-";
  const a = Math.abs(x);
  if (a >= 1e12) return `${(x / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: a >= 1e14 ? 0 : 1 })}조`;
  if (a >= 1e8) return `${Math.round(x / 1e8).toLocaleString("ko-KR")}억`;
  return `${Math.round(x / 1e4).toLocaleString("ko-KR")}만`;
}
const periodLabel = (p) => (p.length === 4 ? `${p}년` : `${p.slice(2, 4)}.${p.slice(5, 7)}`);  // 2025 → 2025년, 2026-06 → 26.06
const hasOp = (s) => s.op.some((v) => v != null);

function fundHtml(f) {
  const ent = stocksOf(DATA.markets[market]).find((x) => x.code === stockCode);
  const etf = stockCode === "SPY" || !!(ent && ent.kind === "e");
  if (!f) {
    return `<h2>재무제표</h2><p class="empty">${etf ? "ETF라 매출·영업이익 같은 재무제표가 없어요." : "재무 자료가 아직 없어요. 매주 토요일에 받아요."}</p>`;
  }
  const usd = market === "us";
  const tile = (label, value, note) => `<div class="stat"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div>`;
  const tiles = [
    tile("PER", f.loss ? "적자" : f.per != null ? `${f.per.toFixed(1)}배` : "-", "주가 ÷ 이익"),
    tile("PBR", f.pbr != null ? `${f.pbr.toFixed(2)}배` : "-", "주가 ÷ 순자산"),
    tile(`시가총액(${usd ? "달러" : "원"})`, bigNum(f.cap), ""),
    tile("배당수익률", f.div != null ? `${f.div.toFixed(2)}%` : "-", "배당 ÷ 주가"),
    tile("ROE", f.roe != null ? `${Math.round(f.roe * 100)}%` : "-", "이익 ÷ 자본"),
    tile("부채비율", f.financial ? "금융사" : f.debt != null ? `${Math.round(f.debt)}%` : "-", f.financial ? "원래 높아서 안 봐요" : "부채 ÷ 자본"),
  ].join("");
  const g = f.grade || { checks: [] };
  const good = g.checks.filter((c) => c[1]).map((c) => c[0]), bad = g.checks.filter((c) => !c[1]).map((c) => c[0]);
  const gradeLine = g.score == null ? "펀더멘탈부: 자료가 부족해서 등급을 매기지 않았어요."
    : `펀더멘탈부 등급 <b>${esc(g.grade)}</b> (${g.score}/${g.total})${good.length ? ` · 좋음: ${esc(good.join(", "))}` : ""}${bad.length ? ` · 약함: ${esc(bad.join(", "))}` : ""}`;
  let body;
  if (!f.annual && !f.quarterly) {
    body = `<p class="muted" style="margin:12px 0 0">${etf ? "ETF라 매출·영업이익 같은 재무제표가 없어요." : "야후에 이 종목 재무제표가 없어요."}</p>`;
  } else {
    if (!f[fundMode]) fundMode = f.annual ? "annual" : "quarterly";
    const s = f[fundMode];
    const modes = [["annual", "연간"], ["quarterly", "분기"]].filter(([k]) => f[k])
      .map(([k, label]) => `<button type="button" data-fund="${k}" aria-pressed="${k === fundMode}">${label}</button>`).join("");
    const second = hasOp(s) ? ["fin-op", "영업이익"] : ["fin-net", "순이익"];
    body = `<div class="period" role="group" aria-label="재무 기간" style="margin-top:14px">${modes}</div>
      <div class="legend" style="margin:10px 0 0"><span class="key"><i class="sw fin-revenue"></i>매출</span>
        <span class="key"><i class="sw ${second[0]}"></i>${second[1]}</span></div>
      ${fundBars(s)}${fundTable(s, usd)}${growthLine(s)}`;
  }
  return `<h2>재무제표 <small>${md(f.asof)} 받음</small></h2><div class="stats">${tiles}</div>
    <p class="sub" style="margin:12px 0 0">${gradeLine}</p>${body}
    <p class="muted" style="margin:10px 0 0">야후 파이낸스 무료 자료라 늦거나 빠진 값이 있을 수 있어요. PER은 최근 4분기 순이익 기준이에요.</p>`;
}

// 매출과 영업이익(없으면 순이익) 막대. 적자는 0 아래로.
function fundBars(s) {
  const keys = ["revenue", hasOp(s) ? "op" : "net"];
  const vals = keys.flatMap((k) => s[k]).filter((v) => v != null);
  if (!vals.length) return "";
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const W = 320, H = 140, t = 8, b = 20, ih = H - t - b, n = s.dates.length;
  const Y = (v) => t + ((hi - v) / (hi - lo || 1)) * ih;
  const gw = W / n, bw = Math.min(22, gw * 0.3);
  let bars = "";
  s.dates.forEach((p, i) => keys.forEach((k, j) => {
    const v = s[k][i];
    if (v == null) return;
    const x = i * gw + gw / 2 + (j === 0 ? -bw - 1 : 1), y = Math.min(Y(v), Y(0));
    bars += `<rect class="fin-${k}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - Y(0))).toFixed(1)}" rx="2"/>`;
  }));
  const labels = s.dates.map((p, i) => `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(periodLabel(p))}</text>`).join("");
  return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="매출과 ${keys[1] === "op" ? "영업이익" : "순이익"} 막대그래프">
    <line class="gridline" x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>${bars}${labels}</svg>`;
}

function fundTable(s, usd) {
  const row = (label, vals, f) => `<tr><th scope="row">${label}</th>${vals.map((v, i) => `<td class="${v != null && v < 0 ? "down" : ""}">${f(v, i)}</td>`).join("")}</tr>`;
  const margin = (v, i) => (v != null && s.revenue[i] ? `${((v / s.revenue[i]) * 100).toFixed(1)}%` : "-");
  return `<div class="fin-wrap"><table class="fin"><thead><tr><th scope="col">${usd ? "달러" : "원"}</th>
    ${s.dates.map((p) => `<th scope="col">${esc(periodLabel(p))}</th>`).join("")}</tr></thead><tbody>
    ${row("매출", s.revenue, bigNum)}${hasOp(s) ? row("영업이익", s.op, bigNum) : ""}${row("순이익", s.net, bigNum)}
    ${hasOp(s) ? row("영업이익률", s.op, margin) : ""}</tbody></table></div>`;
}

// 최근 기간이 바로 앞 기간보다 얼마나 늘었는지 (앞 기간이 적자면 비율이 의미 없어서 빼요)
function growthLine(s) {
  const n = s.dates.length;
  if (n < 2) return "";
  const g = (k) => { const a = s[k][n - 2], b = s[k][n - 1]; return a != null && b != null && a > 0 ? b / a - 1 : null; };
  const parts = [["revenue", "매출"], hasOp(s) ? ["op", "영업이익"] : ["net", "순이익"]]
    .map(([k, label]) => [label, g(k)]).filter(([, v]) => v != null)
    .map(([label, v]) => `${label} <b class="${sign(v)}">${pct(v)}</b>`);
  if (!parts.length) return "";
  return `<p class="sub" style="margin:8px 0 0">${esc(periodLabel(s.dates[n - 1]))} ${fundMode === "annual" ? "전년 대비" : "직전 분기 대비"} ${parts.join(" · ")}</p>`;
}

// 캔들 차트 (SVG). 가격 축은 오른쪽, 보이는 구간의 최고·최저를 표시해요.
// 한 손가락으로 옆으로 밀면 과거로, 두 손가락 벌리기·오므리기(또는 마우스 휠)로 확대·축소, 짧게 누르면 그 캔들 값.
// 길게 누른 채 움직이거나, 이미 뜬 세부정보 선을 잡고 밀면 세부정보가 손가락을 따라와요.
const VIEW = {};  // 차트별 보기 상태 (보이는 캔들 수, 마지막 캔들 위치)
const MAX_SHOW = 1300;  // 한 화면 최대 캔들 수 (상장일부터 일봉은 1만 개가 넘어서, 다 그리면 폰이 버벅여요. 더 길게는 주봉·월봉으로)
// c = frameCandles()가 만든 캔들 (일봉·주봉·월봉·년봉), show = 처음 보이는 캔들 수
// opts: fmt = 가격 표시, name = 차트 이름, ind = 켜 둔 보조지표 (이동평균선·볼린저밴드는 캔들 위에,
// 거래량·RSI는 캔들 아래 칸에 같은 날짜 축으로 그려요)
function candleChart(el, c, show, reset, onRange, { fmt = num, name = "지수", ind = IND } = {}) {
  if (!el) return;
  const n = c.keys.length;
  const { ma50, ma200, bb, rsi } = c;
  const key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n || VIEW[key].frame !== c.frame) {
    VIEW[key] = { count: Math.min(show, n), end: n - 1, n, frame: c.frame, pick: null };
  }
  const v = VIEW[key];
  let W = 0, H = 0, pad, iw, ih, cw, start, lo, hi, bottom;
  let volOn = false;

  const draw = () => {
    volOn = Boolean(ind.vol && c.v && c.v.some((x) => x > 0));
    W = Math.max(el.clientWidth, 260);
    pad = { l: 6, r: 62, t: 22, b: 22 };
    // 아래 칸(거래량·RSI)을 켜면 캔들 칸을 조금 줄여서 한 화면에 더 많이 보이게 해요
    const paneH = (volOn ? 82 : 0) + (ind.rsi ? 90 : 0);
    iw = W - pad.l - pad.r;
    ih = Math.round(Math.max(paneH ? 260 : 300, window.innerHeight * 0.55 - paneH * 0.6)) - pad.t - pad.b;
    const panes = [];
    bottom = pad.t + ih;
    if (volOn) { panes.push({ kind: "vol", top: bottom + 26, h: 56 }); bottom += 26 + 56; }
    if (ind.rsi) { panes.push({ kind: "rsi", top: bottom + 26, h: 64 }); bottom += 26 + 64; }
    H = bottom + pad.b;
    v.count = Math.max(Math.min(5, n), Math.min(n, MAX_SHOW, v.count));
    v.end = Math.max(v.count - 1, Math.min(n - 1, v.end));
    const endI = Math.round(v.end);
    start = endI - Math.round(v.count) + 1;
    cw = iw / Math.round(v.count);
    let hiI = start, loI = start;
    for (let i = start; i <= endI; i++) { if (c.h[i] > c.h[hiI]) hiI = i; if (c.l[i] < c.l[loI]) loI = i; }
    hi = c.h[hiI]; lo = c.l[loI];
    if (ind.bb) {  // 볼린저밴드가 잘리지 않게 세로 범위를 넓혀요
      for (let i = start; i <= endI; i++) if (bb.up[i] != null) { hi = Math.max(hi, bb.up[i]); lo = Math.min(lo, bb.lo[i]); }
    }
    // 보이는 구간에서 값이 8배 넘게 차이 나면(상장 이후 전체처럼) 로그 눈금: 같은 비율로 오르면 같은 높이라
    // 오래전 작은 값도 납작해지지 않아요. 가격은 0 아래로 내려가지 않게 해요.
    const logY = lo > 0 && hi / lo >= 8;
    if (logY) { const r = Math.log(hi / lo) * 0.08; hi *= Math.exp(r); lo /= Math.exp(r); } else {
      const span = hi - lo || hi * 0.01; hi += span * 0.08; lo = lo >= 0 ? Math.max(0, lo - span * 0.08) : lo - span * 0.08;
    }
    const sc = logY ? (p) => Math.log(Math.max(p, lo / 10)) : (p) => p, sLo = sc(lo), sHi = sc(hi);
    const X = (i) => pad.l + (i - start + 0.5) * cw;
    const Y = (p) => pad.t + (1 - (sc(p) - sLo) / (sHi - sLo)) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => sLo + (sHi - sLo) * (0.06 + 0.88 * f)).map((t) => (logY ? Math.exp(t) : t));
    const lastY = Y(c.c[n - 1]);
    const grid = ticks.map((t) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>
      ${Math.abs(Y(t) - lastY) < 16 ? "" : `<text x="${pad.l + iw + 6}" y="${Y(t) + 4}">${esc(fmt(t))}</text>`}`).join("");
    const bw = Math.max(1, cw * 0.7);
    let bodies = "";
    for (let i = start; i <= endI; i++) {
      const o = c.o[i], cl = c.c[i];
      const cls = cl > o ? "up" : cl < o ? "down" : "flat";
      const x = X(i), top = Y(Math.max(o, cl)), bh = Math.max(1, Math.abs(Y(o) - Y(cl)));
      bodies += `<line class="wick ${cls}" x1="${x}" x2="${x}" y1="${Y(c.h[i])}" y2="${Y(c.l[i])}"/>`
        + (cw >= 3 ? `<rect class="body ${cls}" x="${x - bw / 2}" y="${top}" width="${bw}" height="${bh}"/>` : "");
    }
    const line = (vals, cls, Yf = Y) => {
      let dstr = "", pen = false;
      for (let i = start; i <= endI; i++) {
        const val = vals[i]; if (val == null) { pen = false; continue; }
        dstr += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Yf(val).toFixed(1)}`; pen = true;
      }
      return dstr ? `<path class="${cls}" d="${dstr}"/>` : "";
    };
    // 볼린저밴드: 위·아래 선 사이를 옅게 칠하고 가운데(20개 평균)는 점선
    let bands = "";
    if (ind.bb) {
      const idx = [];
      for (let i = start; i <= endI; i++) if (bb.up[i] != null) idx.push(i);
      if (idx.length > 1) {
        const upper = idx.map((i) => `${X(i).toFixed(1)},${Y(bb.up[i]).toFixed(1)}`);
        const lower = idx.slice().reverse().map((i) => `${X(i).toFixed(1)},${Y(bb.lo[i]).toFixed(1)}`);
        bands = `<path class="bb-fill" d="M${upper.join("L")}L${lower.join("L")}Z"/>`
          + line(bb.up, "bb") + line(bb.lo, "bb") + line(bb.mid, "bb bb-mid");
      }
    }
    const mas = ind.ma ? line(ma200, "ma ma200") + line(ma50, "ma ma50") : "";
    // 최고·최저 표시 (캔들 옆에 가격). 글자 길이를 어림해서 오른쪽 가격 축을 덮지 않는 쪽에 써요.
    const mark = (i, price, label, above) => {
      const text = `${label} ${fmt(price)} (${frameLabel(c, i, "short")})`;
      const w = [...text].reduce((sum, ch) => sum + (/[가-힣]/.test(ch) ? 11 : 6.5), 0);
      const x = X(i), y = Y(price), right = x + 6 + w <= pad.l + iw || x - 6 - w < pad.l;
      const tx = right ? x + 6 : x - 6, ty = above ? y - 6 : y + 14;
      return `<line class="mark" x1="${x}" x2="${right ? x + 4 : x - 4}" y1="${y}" y2="${y}"/>
        <text class="mark-text" x="${tx}" y="${ty}" text-anchor="${right ? "start" : "end"}">${esc(text)}</text>`;
    };
    // 지금 값 표시 (오른쪽 축, 마지막 캔들 색)
    const last = c.c[n - 1], lastCls = last >= c.o[n - 1] ? "up" : "down";
    const ly = Math.min(pad.t + ih, Math.max(pad.t, Y(last)));
    const nowTag = `<line class="now ${lastCls}" x1="${pad.l}" x2="${pad.l + iw}" y1="${ly}" y2="${ly}"/>
      <rect class="tag ${lastCls}" x="${pad.l + iw + 1}" y="${ly - 9}" width="${pad.r - 2}" height="18" rx="3"/>
      <text class="tag-text" x="${pad.l + iw + 6}" y="${ly + 4}">${esc(fmt(last))}</text>`;
    const clip = `cc-${key}`;
    // 아래 칸: 거래량 막대(캔들 색) + 20개 평균선, RSI 선 + 70·30 기준선
    const paneSvg = panes.map((p) => {
      const head = `<text class="pane-label" x="${pad.l}" y="${p.top - 7}">${p.kind === "vol" ? "거래량 (선: 20개 평균)" : "RSI(14) · 70 위 과열, 30 아래 침체"}</text>
        <line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${p.top + p.h}" y2="${p.top + p.h}"/>`;
      if (p.kind === "vol") {
        let vmax = 1;
        for (let i = start; i <= endI; i++) vmax = Math.max(vmax, c.v[i] || 0, (c.vma && c.vma[i]) || 0);
        const Yv = (x) => p.top + p.h - (x / vmax) * p.h;
        let bars = "";
        for (let i = start; i <= endI; i++) {
          const cls = c.c[i] > c.o[i] ? "up" : c.c[i] < c.o[i] ? "down" : "flat", y = Yv(c.v[i] || 0);
          bars += `<rect class="vol ${cls}" x="${X(i) - bw / 2}" y="${y}" width="${bw}" height="${p.top + p.h - y}"/>`;
        }
        return `${head}<g clip-path="url(#${clip}-p)">${bars}${c.vma ? line(c.vma, "vol-ma", Yv) : ""}</g>`;
      }
      const Yr = (x) => p.top + (1 - x / 100) * p.h;
      const now = rsi[n - 1];
      const guide = (lv) => `<line class="guide" x1="${pad.l}" x2="${pad.l + iw}" y1="${Yr(lv)}" y2="${Yr(lv)}"/>`
        + (now != null && Math.abs(Yr(now) - Yr(lv)) < 14 ? "" : `<text x="${pad.l + iw + 6}" y="${Yr(lv) + 4}">${lv}</text>`);
      // 지금 RSI는 가격처럼 오른쪽에 색 딱지로 (딱지와 겹치는 70·30 숫자는 빼요)
      const tag = now == null ? "" : `<rect class="rsi-tag" x="${pad.l + iw + 1}" y="${Yr(now) - 8}" width="34" height="16" rx="3"/>
        <text class="tag-text" x="${pad.l + iw + 6}" y="${Yr(now) + 4}">${Math.round(now)}</text>`;
      return `${head}${guide(70)}${guide(30)}<g clip-path="url(#${clip}-p)">${line(rsi, "rsi", Yr)}</g>${tag}`;
    }).join("");
    const xs = [start, Math.round((start + endI) / 2), endI];
    const xl = xs.map((i, k) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${esc(frameLabel(c, i, "axis"))}</text>`).join("");
    const picked = v.pick != null && v.pick >= start && v.pick <= endI;
    const pickSvg = `<line class="cross" x1="${picked ? X(v.pick) : 0}" x2="${picked ? X(v.pick) : 0}" y1="${pad.t}" y2="${bottom}"${picked ? "" : ' style="display:none"'}/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(name)} ${(FRAMES.find((x) => x[0] === c.frame) || FRAMES[0])[1]} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath>
        <clipPath id="${clip}-p"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${bottom - pad.t + 4}"/></clipPath></defs>
      ${grid}<g clip-path="url(#${clip})">${bands}${mas}${bodies}</g>${paneSvg}${pickSvg}
      ${mark(hiI, c.h[hiI], "최고", true)}${mark(loI, c.l[loI], "최저", false)}${nowTag}${xl}
      ${logY ? `<text class="pane-label" x="${pad.l + iw + 6}" y="${pad.t - 8}">로그 눈금</text>` : ""}</svg>
      <div class="tip" style="display:none"></div>`;
    const first = start > 0 ? c.c[start - 1] : c.o[start];
    const ch = c.c[endI] / first - 1;
    onRange(`${esc(frameLabel(c, start, "axis"))} ~ ${esc(frameLabel(c, endI, "axis"))} (${Math.round(v.count)}${UNIT[c.frame]}) `
      + `<b class="${sign(ch)}">${pct(ch)}</b> · 최고 ${fmt(c.h[hiI])} · 최저 ${fmt(c.l[loI])}`);
    if (picked) showTip(v.pick, X(v.pick));
  };

  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const prev = i > 0 ? c.c[i - 1] : c.o[i], ch = c.c[i] / prev - 1;
    const row = (label, val) => `<div class="row">${label} <b>${val}</b></div>`;
    let more = "";
    if (ind.ma) more += (ma50[i] ? row("50일선", fmt(ma50[i])) : "") + (ma200[i] ? row("200일선", fmt(ma200[i])) : "");
    if (ind.bb && bb.up[i] != null) more += row("볼린저 위", fmt(bb.up[i])) + row("볼린저 아래", fmt(bb.lo[i]));
    if (volOn && c.vma && c.vma[i]) more += row("거래량", `평소의 ${(c.v[i] / c.vma[i]).toFixed(1)}배`);
    if (ind.rsi && rsi[i] != null) more += row("RSI", Math.round(rsi[i]));
    tip.innerHTML = `<div class="muted">${esc(frameLabel(c, i, "full"))}</div>
      ${row("시가", fmt(c.o[i]))}${row("고가", fmt(c.h[i]))}${row("저가", fmt(c.l[i]))}
      <div class="row">종가 <b>${fmt(c.c[i])}</b> <span class="${sign(ch)}">${pct(ch, 2)}</span></div>${more}`;
    tip.style.display = "";
    const r = el.getBoundingClientRect(), left = (x / W) * r.width, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `${pad.t}px`;
  };

  // 손가락·마우스 조작
  const pts = new Map();
  let gesture = null, raf = 0, hold = 0;
  const HOLD_MS = 280;  // 이만큼 가만히 누르고 있으면 세부정보가 손가락을 따라가요
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const scale = () => el.getBoundingClientRect().width / W;
  const svgX = (clientX) => (clientX - el.getBoundingClientRect().left) / scale();
  const candleAt = (clientX) => Math.round(start + (svgX(clientX) - pad.l) / cw - 0.5);
  const stopHold = () => { clearTimeout(hold); hold = 0; };
  // 고른 캔들만 바꿔요 (차트 전체를 다시 그리지 않고 선과 세부정보만 옮겨서 손가락을 바로 따라가요)
  const movePick = (clientX) => {
    const i = Math.max(start, Math.min(Math.round(v.end), candleAt(clientX)));
    if (i === v.pick && $(".tip", el).style.display !== "none") return;
    v.pick = i;
    const x = pad.l + (i - start + 0.5) * cw, cross = $("line.cross", el);
    if (cross) { cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.display = ""; }
    showTip(i, x);
  };
  const scrub = (clientX) => {
    stopHold();
    gesture.type = "scrub";
    el.classList.add("scrubbing");
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* 진동 없는 폰 */ }
    movePick(clientX);
  };
  const endScrub = () => { el.classList.remove("scrubbing"); };
  el.onpointerdown = (e) => {
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopHold();
    if (pts.size === 1) {
      gesture = { type: "tap", x0: e.clientX, y0: e.clientY, end0: v.end };
      // 세부정보가 떠 있으면 그 선 근처를 잡고 밀어서 바로 옮길 수 있어요
      const onLine = v.pick != null && v.pick >= start && v.pick <= Math.round(v.end)
        && Math.abs(svgX(e.clientX) - (pad.l + (v.pick - start + 0.5) * cw)) <= Math.max(cw, 28 / scale());
      if (onLine) gesture.grab = true;
      else hold = setTimeout(() => { if (gesture && gesture.type === "tap" && pts.size === 1) scrub(pts.values().next().value.x); }, HOLD_MS);
    }
    if (pts.size === 2) {
      endScrub();
      const [a, b] = [...pts.values()];
      gesture = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, count0: v.count };
    }
  };
  el.onpointermove = (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === "pinch" && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      v.count = gesture.count0 * gesture.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
      redraw();
    } else if (gesture.type === "scrub") {
      movePick(e.clientX);
    } else if (gesture.type !== "pinch") {
      const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
      if (gesture.type === "tap" && gesture.grab && Math.hypot(dx, dy) > 4) { scrub(e.clientX); return; }
      if (gesture.type === "tap" && Math.hypot(dx, dy) > 6) stopHold();
      if (gesture.type === "tap" && Math.abs(dx) > 6) gesture.type = "pan";
      if (gesture.type === "pan") { v.end = gesture.end0 - dx / (cw * scale()); redraw(); }
    }
  };
  // 세부정보가 손가락을 따라가는 동안(또는 선을 잡은 동안)은 화면이 위아래로 움직이지 않게 해요
  el._lockScroll = () => Boolean(gesture && (gesture.type === "scrub" || (gesture.type === "tap" && gesture.grab)));
  if (!el._noScroll) {
    el._noScroll = true;
    el.addEventListener("touchmove", (e) => { if (e.cancelable && el._lockScroll()) e.preventDefault(); }, { passive: false });
  }
  const up = (e) => {
    stopHold();
    if (gesture && gesture.type === "tap" && pts.size === 1) {
      const i = candleAt(e.clientX);
      v.pick = i >= start && i <= Math.round(v.end) && v.pick !== i ? i : null;
      if (v.pick == null) $(".tip", el).style.display = "none";
      draw();
    }
    // 손을 떼도 마지막 캔들의 세부정보는 남겨 둬요 (다시 누르면 닫혀요)
    if (gesture && gesture.type === "scrub") endScrub();
    pts.delete(e.pointerId);
    if (pts.size === 0) gesture = null;
    else if (pts.size === 1) { const [p] = [...pts.values()]; gesture = { type: "pan", x0: p.x, y0: p.y, end0: v.end }; }
  };
  el.onpointerup = up;
  el.onpointercancel = (e) => { stopHold(); endScrub(); pts.delete(e.pointerId); if (!pts.size) gesture = null; };
  el.onwheel = (e) => { e.preventDefault(); v.count *= e.deltaY > 0 ? 1.15 : 1 / 1.15; redraw(); };
  draw();
  // 화면 폭이 바뀌면(폰 돌리기) 지금 고른 기간으로 다시 그려요. 탭을 바꿔 사라진 예전 차트는 다시 그리지 않아요
  // (안 그러면 예전 차트가 위의 기간·최고·최저 문구를 덮어써요).
  el._draw = draw;
  if (!el._ro) {
    let w = el.clientWidth;
    el._ro = new ResizeObserver(() => {
      if (!el.isConnected) { el._ro.disconnect(); return; }
      if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; el._draw(); }
    });
    el._ro.observe(el);
  }
}

// 선 차트 (SVG). 같은 단위 시리즈만 한 축에 그려요. 손가락으로 좌우로 밀면 그날 값이 보여요.
function lineChart(el, { dates, series, fmt, zero, tall, xfmt = (s) => s.slice(2).replace(/-/g, ".") }) {
  if (!el) return;
  const draw = () => {
    const W = Math.max(el.clientWidth, 260);
    const H = tall ? Math.round(Math.max(300, window.innerHeight * 0.55)) : 190;  // 크게: 화면 높이의 55%
    const pad = { l: 48, r: 54, t: 8, b: 22 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = dates.length;
    const all = series.filter((s) => s.scale !== false).flatMap((s) => s.values).filter((v) => v != null);
    if (zero) all.push(0);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-9) { lo -= Math.abs(lo) * 0.01 + 0.01; hi += Math.abs(hi) * 0.01 + 0.01; }
    const span = hi - lo; lo -= span * 0.06; hi += span * 0.06;
    const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
    const ticks = (tall ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]).map((f) => lo + (hi - lo) * (0.1 + 0.8 * f));
    const grid = ticks.map((v) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join("");
    const xl = (n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]).map((i, k, arr) =>
      `<text x="${x(i)}" y="${H - 6}" text-anchor="${arr.length === 1 ? "middle" : k === 0 ? "start" : k === arr.length - 1 ? "end" : "middle"}">${esc(xfmt(dates[i]))}</text>`).join("");
    const paths = series.map((s) => {
      let dstr = "", pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        dstr += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
      });
      // 점이 적으면(1주·1개월) 하루하루가 보이게 점도 찍어요
      const dot = n <= 30 && s.scale !== false ? s.values.map((v, i) => v == null ? "" :
        `<circle cx="${x(i)}" cy="${y(v)}" r="${n === 1 ? 4 : 3}" fill="${s.color}"/>`).join("") : "";
      return `<path d="${dstr}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dot}`;
    }).join("");
    // 오른쪽 끝 직접 라벨 (겹치면 위아래로 벌려요)
    const ends = series.map((s) => {
      let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--;
      if (i < 0) return null;
      const yy = y(s.values[i]), top = pad.t + 6, bottom = pad.t + ih - 2;
      const arrow = yy < top ? "↑ " : yy > bottom ? "↓ " : "";  // 세로축 밖에 있는 선
      return { s, v: s.values[i], y: Math.min(bottom, Math.max(top, yy)), arrow };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    const labels = ends.map((e) => `<text x="${pad.l + iw + 6}" y="${e.y + 4}" style="fill:var(--text-secondary)">${e.arrow}${esc(fmt(e.v))}</text>`).join("");
    const zl = zero ? `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(0)}" y2="${y(0)}"/>` : "";
    const clip = `clip${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(", "))} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l - 4}" y="${pad.t}" width="${iw + 8}" height="${ih}"/></clipPath></defs>
      ${grid}${zl}<g clip-path="url(#${clip})">${paths}</g>${labels}${xl}
      <g class="hover" style="display:none"><line class="cross" y1="${pad.t}" y2="${pad.t + ih}"/>
        ${series.map((s) => `<circle r="4.5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`).join("")}</g>
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" style="display:none"></div>`;
    const svg = $("svg", el), g = $(".hover", el), tip = $(".tip", el);
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
      g.style.display = "";
      const cx = x(i);
      $("line", g).setAttribute("x1", cx); $("line", g).setAttribute("x2", cx);
      g.querySelectorAll("circle").forEach((c, k) => {
        const v = series[k].values[i];
        c.style.display = v == null || y(v) < pad.t || y(v) > pad.t + ih ? "none" : "";
        if (v != null) { c.setAttribute("cx", cx); c.setAttribute("cy", y(v)); }
      });
      tip.innerHTML = `<div class="muted">${esc(dates[i])}</div>` + series.map((s) =>
        `<div class="row"><i class="sw" style="background:${s.color}"></i>${esc(s.name)} <b>${esc(s.values[i] == null ? "-" : fmt(s.values[i]))}</b></div>`).join("");
      tip.style.display = "";
      const tw = tip.offsetWidth, left = (cx / W) * r.width;
      tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    };
    const hide = () => { g.style.display = "none"; tip.style.display = "none"; };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", hide);
  };
  draw();
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }  // 화면을 바꿔 사라진 차트
    if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); }
  });
  ro.observe(el);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => selectMarket(b.dataset.market)));
$(".search-btn").addEventListener("click", () => go("search"));
document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.screen)));
window.addEventListener("popstate", () => {
  const h = fromHash();
  if (h.s === "stock" && h.code) stockCode = h.code;
  go(h.s, true);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();  // 데이터가 오기 전에도 주소에 맞는 시장·화면 버튼을 표시해요
load();
