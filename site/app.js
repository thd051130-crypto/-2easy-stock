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
// 차트 화면 지수 버튼: 시장마다 고른 지수 (이 폰 브라우저에 기억해요). 기본은 그 시장 매매 기준 지수.
const OWN_IDX = { kr: "^KS11", us: "^GSPC" };
const CHART_IDX = { ...OWN_IDX };
try {
  const saved = JSON.parse(localStorage.getItem("chart_idx") || "{}");
  for (const m of ["kr", "us"]) if (typeof (saved && saved[m]) === "string") CHART_IDX[m] = saved[m];
} catch (e) { /* 기본값 */ }
let market = "kr";
try { market = localStorage.getItem("market") || "kr"; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
// 아래쪽 버튼으로 바꾸는 화면. 앱을 새로 열면 늘 홈부터 보여요. 주소 끝(#kr/chart)에 시장과 화면을 적어 둬요.
const SCREENS = ["home", "signal", "watch", "perf", "chart", "stock", "search", "map"];
let screen = "home";
// 종목 화면(#kr/stock/005930), 검색 화면(#kr/search), 산업 지도(#kr/map/조선)는 보던 화면 위에 한 겹 더 열려요 (뒤로 가면 보던 화면).
// 아래 버튼은 그 아래 깔린 화면(stockFrom)에 불이 들어와요.
const LAYERS = ["stock", "search", "map"];
let stockCode = null;
let stockFrom = "watch";
let searchQuery = "";
let mapStart = "";  // 주소로 바로 연 산업 지도의 고른 산업
const fromHash = () => {
  const [m, s, code] = location.hash.slice(1).split("/");
  let c = null;
  try { c = code ? decodeURIComponent(code) : null; } catch (e) { /* 이상한 주소 */ }
  return { m, s, code: c };
};
{
  const h = fromHash();
  if (h.m === "kr" || h.m === "us") market = h.m;
  if (SCREENS.includes(h.s) && (h.s !== "stock" || h.code)) {
    screen = h.s;
    if (h.s === "map") mapStart = h.code || "";
    else stockCode = h.code;
  }
}
const hashFor = () => `#${market}${screen === "home" ? "" : `/${screen}`}${screen === "stock" ? `/${encodeURIComponent(stockCode)}`
  : screen === "map" && mapFocus ? `/${encodeURIComponent(mapFocus)}` : ""}`;

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
  home: (d) => [homeSignalCard(d), worldCard(), macroCard(), calendarCard(d), discloseHomeCard(d), heatmapCard(d), sectorsCard(d), homeWatchCard(d), moversCard(d), flowsCard(d), quietVolumeCard(d), homePerfCard(d),
    homeIndexCard(d)],
  signal: (d) => [signalCard(d), desksCard(d), widePicksCard(d), rulebookPicksCard(d), rulesCard(d)],
  watch: (d) => [watchCard(d), screenerCard(d), dividendCard(d), allStocksCard(d)],
  perf: (d) => [trackCard(d), accountCard(d), positionsCard(d), tradesCard(d), etfAccountCard(d), readinessCard(d), savingsCard(),
    rulebookAccountCard(d), memoCard(), healthCard()],
  chart: (d) => [trendCard(d) || `<section class="card"><p class="empty">아직 지수 기록이 없어요.</p></section>`, compareCard(d)],
  stock: (d) => [stockHeadCard(d), discloseStockCard(d), stockSectorCard(d), stockChartCard(),
    market === "kr" ? `<section class="card" id="flow-card"><h2>외국인·기관 수급</h2><p class="muted">불러오는 중이에요…</p></section>` : "",
    `<section class="card" id="fund-card"><h2>재무제표</h2><p class="muted">불러오는 중이에요…</p></section>`],
  search: () => [searchCard(), `<div id="search-results" class="stack">${searchResults()}</div>`],
  map: () => [mapCard(), `<div id="map-detail" class="stack">${mapDetailCard()}</div>`],
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
  if (screen === "perf") { drawTrack(d); drawEquity(d); bindSavings(); }
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
  app.querySelectorAll("[data-cal-all]").forEach((b) => b.addEventListener("click", () => {
    calAll = !calAll;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-heat]").forEach((b) => b.addEventListener("click", () => {
    heatP = b.dataset.heat;
    try { localStorage.setItem("heat_p", heatP); } catch (e) { /* 이번만 기억 */ }
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
  if (screen === "map") bindMap();
  if (screen !== "search") app.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => openMap(b.dataset.map)));
  bindRows(app, d);
  if (screen === "chart") {
    app.querySelectorAll("[data-idx]").forEach((b) => b.addEventListener("click", () => {
      CHART_IDX[market] = b.dataset.idx;
      if (IDX_READY.get(b.dataset.idx) === null) IDX_READY.delete(b.dataset.idx);  // 못 받았던 지수는 다시 받아 봐요
      try { localStorage.setItem("chart_idx", JSON.stringify(CHART_IDX)); } catch (e) { /* 이번만 기억 */ }
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }));
    const row = app.querySelector(".idx-chips"), on = row && row.querySelector('[aria-pressed="true"]');
    if (on) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;  // 고른 지수 버튼이 보이게
    drawTrend(d);
    bindCompare(d);
    app.querySelectorAll(".period button[data-frame]").forEach((b) => b.addEventListener("click", () => {
      frame = b.dataset.frame;
      try { localStorage.setItem("frame", frame); } catch (e) { /* 무시 */ }
      app.querySelectorAll(".period button[data-frame]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawTrend(d, true);
    }));
  }
  app.querySelectorAll(".chips button[data-ind]").forEach((b) => b.addEventListener("click", () => {
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
function stockRow(s, d, { star = true, chart = false, meta: extraMeta = "" } = {}) {
  const sig = d.signal || {};
  const badges = [];
  if ((sig.picks || []).some((p) => p.code === s.code)) badges.push(`<span class="badge good">오늘 매수 후보</span>`);
  if ((sig.rulebook || []).some((p) => p.code === s.code)) badges.push(`<span class="badge">규칙표 후보</span>`);
  if (s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const on = WATCH[market].includes(s.code);
  // 작은 추세선과 같은 기간(최근 3개월) 등락률이라 선 색과 숫자가 맞아요
  const c3 = s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  const meta = extraMeta || [s.code, c3 == null ? "" : `3개월 ${pct(c3)}`].filter(Boolean).join(" · ");
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

// 조건 검색 (영웅문 조건검색처럼): 고른 조건을 모두 만족하는 종목만. 재무는 매주, 주가 조건은 매일 갱신
const FILTERS = [
  ["ma", "200일선 위", (s) => s.ma200 != null && s.ma200 > 0, (s) => `200일선 ${pct(s.ma200)}`],
  ["near", "52주 고점 -10% 안", (s) => s.hi52 != null && s.hi52 >= -0.1, (s) => `고점 대비 ${pct(s.hi52)}`],
  ["dip", "고점서 -20% 넘게 빠짐", (s) => s.hi52 != null && s.hi52 <= -0.2, (s) => `고점 대비 ${pct(s.hi52)}`],
  ["rsi", "RSI 30 미만", (s) => s.rsi14 != null && s.rsi14 < 30, (s) => `RSI ${Math.round(s.rsi14)}`],
  ["per", "PER 15배 미만", (s, f) => f.per != null && !f.loss && f.per < 15, (s, f) => `PER ${f.per.toFixed(1)}`],
  ["pbr", "PBR 1배 미만", (s, f) => f.pbr != null && f.pbr < 1, (s, f) => `PBR ${f.pbr.toFixed(2)}`],
  ["div", "배당 3% 이상", (s, f) => f.div != null && f.div >= 3, (s, f) => `배당 ${f.div.toFixed(1)}%`],
  ["roe", "ROE 10% 이상", (s, f) => f.roe != null && f.roe >= 0.1, (s, f) => `ROE ${Math.round(f.roe * 100)}%`],
  ["debt", "부채비율 100% 이하", (s, f) => !f.financial && f.debt != null && f.debt <= 100, (s, f) => `부채 ${Math.round(f.debt)}%`],
  ["tgt", "목표가 +20% 이상", (s, f) => !!(f.target && s.close && f.target.mean / s.close - 1 >= 0.2), (s, f) => `목표가 ${pct(f.target.mean / s.close - 1)}`],
  ["grade", "펀더멘탈 등급 75%+", (s, f) => !!(f.grade && f.grade[2] && f.grade[1] / f.grade[2] >= 0.75), (s, f) => `등급 ${f.grade[1]}/${f.grade[2]}`],
];
let FILTER_ON = [];
try { FILTER_ON = JSON.parse(localStorage.getItem("filters") || "[]").filter((k) => FILTERS.some((x) => x[0] === k)); } catch (e) { /* 처음 */ }
function screenerCard(d) {
  const funds = d.funds || {};
  const all = stocksOf(d).filter((s) => !s.extra);
  if (!all.length) return "";
  const chips = FILTERS.map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${FILTER_ON.includes(k)}">${label}</button>`).join("");
  const on = FILTERS.filter((x) => FILTER_ON.includes(x[0]));
  let body = `<p class="sub" style="margin:10px 0 0">조건을 하나 이상 누르면 모두 만족하는 종목만 보여요.</p>`;
  if (on.length) {
    const hits = all.filter((s) => on.every(([, , ok]) => ok(s, funds[s.code] || {})));
    hits.sort((a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
    body = `<p class="sub" style="margin:10px 0 4px"><b>${hits.length}개</b> / ${all.length}개 종목</p>`
      + (hits.length ? `<ul class="list">${hits.map((s) => stockRow(s, d, { meta: on.map(([, , , show]) => show(s, funds[s.code] || {})).join(" · ") })).join("")}</ul>`
        : `<p class="empty">조건을 모두 만족하는 종목이 없어요. 조건을 하나 빼 보세요.</p>`);
  }
  const noPrice = !all.some((s) => s.ma200 != null);
  return `<section class="card" id="screener"><h2>조건 검색 <small>${all.length}개 대형주 중</small></h2>
    <div class="chips">${chips}</div>${body}
    <p class="muted" style="margin:10px 0 0">재무 조건은 매주 토요일, 주가 조건은 장 마감 뒤 갱신돼요.${noPrice ? " 200일선·RSI·52주 고점 조건은 다음 장 마감 뒤부터 써요." : ""} 자료가 없는 종목은 빠져요.</p></section>`;
}

// 배당 달력: 관심종목(없으면 배당 주는 대형주 전체)의 배당락일·지급일·1주당 배당금 (야후 무료 자료, 매주 갱신)
function dividendCard(d) {
  const funds = d.funds || {};
  const all = stocksOf(d);
  const pick = WATCH[market].length ? all.filter((s) => WATCH[market].includes(s.code)) : all;
  const rows = pick.map((s) => ({ s, f: funds[s.code] || {}, e: (funds[s.code] || {}).events || {} }))
    .filter((r) => r.e.exdiv || r.e.div_rate);
  if (!rows.length) {
    return Object.keys(funds).length ? "" : `<section class="card"><h2>배당 달력</h2><p class="empty">배당 자료는 매주 토요일에 받아요.</p></section>`;
  }
  const today = TODAY();
  const next = rows.filter((r) => r.e.exdiv && r.e.exdiv >= today).sort((a, b) => a.e.exdiv.localeCompare(b.e.exdiv));
  const past = rows.filter((r) => !(r.e.exdiv && r.e.exdiv >= today)).sort((a, b) => (b.f.div ?? 0) - (a.f.div ?? 0));
  const cash = (v) => (v == null ? "-" : market === "kr" ? `${num(v)}원` : `$${v.toFixed(2)}`);
  const row = ({ s, f, e }, upcoming) => `<li data-stock="${esc(s.code)}"><div class="l"><div class="name">${esc(s.name)}</div>
      <div class="meta">${upcoming ? `배당락 ${ymd(e.exdiv)} (${dday(e.exdiv)})${e.paydiv && e.paydiv >= e.exdiv ? ` · 지급 ${ymd(e.paydiv)}` : ""}`
        : e.exdiv ? `지난 배당락 ${ymd(e.exdiv)}` : "배당락일 미정"}</div></div>
      <div class="r">${cash(e.div_last)}<div class="meta">1회 · 연 ${cash(e.div_rate)}${f.div != null ? ` (${f.div.toFixed(1)}%)` : ""}</div></div></li>`;
  return `<section class="card" id="div-card"><h2>배당 달력 <small>${WATCH[market].length ? "내 관심종목" : "대형주 전체 (☆ 누르면 관심종목만)"}</small></h2>
    ${next.length ? `<h3 class="muted" style="margin:6px 0 4px">다가오는 배당락</h3><ul class="list">${next.slice(0, 12).map((r) => row(r, true)).join("")}</ul>` : ""}
    ${past.length ? `<details${next.length ? "" : " open"}><summary class="muted" style="margin:10px 0 4px">배당 주는 종목 · 배당수익률 순 (${past.length}개)</summary>
      <ul class="list">${past.slice(0, 20).map((r) => row(r, false)).join("")}</ul></details>` : ""}
    <p class="muted" style="margin:10px 0 0">배당락일 전날까지 갖고 있어야 배당을 받아요(국장은 결산·이사회에 따라 기준일이 달라질 수 있어요). 1회 배당은 가장 최근 지급액이에요. 야후 무료 자료라 날짜가 늦게 바뀔 수 있어요.</p></section>`;
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
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.filter;
    FILTER_ON = FILTER_ON.includes(k) ? FILTER_ON.filter((x) => x !== k) : FILTER_ON.concat(k);
    try { localStorage.setItem("filters", JSON.stringify(FILTER_ON)); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
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
      .then((x) => { SYM[m] = x && Array.isArray(x.rows) ? x.rows.map((row) => ({ row, keys: nameKeys(row) })) : []; }))
      .concat(loadThemes()))
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
      spellcheck="false" placeholder="종목 이름, 또는 '전력 관련주'" aria-label="종목 검색" value="${esc(searchQuery)}">
    <p class="muted" style="margin:8px 0 0">국장·미장에 상장된 종목을 다 찾아요. '원전 관련주', '미국 AI 반도체'처럼 문장으로 치면 연관 종목을 모아 보여 줘요.</p></section>`;
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
      <li>문장으로 쳐도 돼요: '전력 관련분야 종목 찾아줘', '미국 원전주', '화장품 대장주'</li>
      <li>대시보드에 있는 종목은 누르면 차트와 재무제표가 나와요.</li>
      <li>없는 종목은 '추가'를 누르면 텔레그램이 열려요. 봇 화면에서 시작(START)을 누르면 보통 30분 안에 대시보드에 생기고 ★에 들어가요.</li></ul></section>
      ${themeChips("테마로 찾기")}`;
  }
  const ask = parseAsk(q);
  // 테마가 없으면 예전처럼 문장 전체로, 그래도 없으면 테마 낱말·군말을 뺀 나머지 말로 종목 이름을 찾아요
  let found = ask.themes.length ? { tracked: [], others: [] } : findStocks(q);
  if (!found.tracked.length && !found.others.length && ask.rest.length) found = findStocks(ask.rest.join(" "));
  const whole = ask.themes.length ? findStocks(q) : null;
  const nameFirst = whole && whole.tracked.concat(whole.others).some((x) => x.sc <= 1);
  if (nameFirst) found = whole;  // '한국전력', '삼성전기'처럼 종목 이름 그대로면 종목이 먼저
  const named = nameCards(found, loading);
  const themed = ask.themes.slice(0, 3).map((t) => themeCard(t, ask.only));
  if (!named.length && !themed.length) {
    if (loading) return `<section class="card"><p class="muted">전체 종목 목록을 불러오는 중이에요…</p></section>`;
    return `<section class="card"><p class="empty">"${esc(q)}"에 맞는 종목이나 테마가 없어요. 이름을 조금만 쳐 보거나 아래 테마를 눌러 보세요.</p></section>
      ${themeChips("이런 테마를 찾을 수 있어요")}`;
  }
  return (nameFirst ? named.concat(themed) : themed.concat(named)).join("");
}

function nameCards({ tracked, others }, loading) {
  const cards = [];
  if (tracked.length) {
    cards.push(`<section class="card"><h2>대시보드 종목 <small>누르면 차트·재무제표</small></h2>
      <ul class="list">${tracked.slice(0, 15).map(trackedRow).join("")}</ul></section>`);
  }
  if (others.length) {
    cards.push(`<section class="card"><h2>다른 상장 종목 <small>${others.length > 30 ? `${others.length}개 중 30개` : `${others.length}개`}</small></h2>
      <ul class="list">${others.slice(0, 30).map(otherRow).join("")}</ul>${botNote()}
      ${others.length > 30 ? `<p class="muted" style="margin:10px 0 0">더 자세히 쳐 보세요.</p>` : ""}</section>`);
  } else if (loading) {
    cards.push(`<section class="card"><p class="muted">전체 종목 목록을 불러오는 중이에요…</p></section>`);
  }
  return cards;
}
const botNote = () => (DATA && DATA.bot ? ""
  : `<p class="muted" style="margin:10px 0 0">텔레그램 봇이 아직 연결 전이라 '추가'를 못 눌러요. telegram-bot 워크플로가 한 번 돌면 켜져요.</p>`);

// ---------------------------------------------------------------- 문장 검색 ('전력 관련분야 종목 찾아줘')
// themes.json (themes.py): 테마 낱말 → 미리 고른 국장·미장 대표 종목. 유료 AI 없이 문장에서 테마 낱말을 찾아요.
let THEMES = null;  // { themes: [{ name, keys, why, sector, etf, kr: [[코드, 이름]], us, more_us }], filler: [...] }
let themesLoading = null;
function loadThemes() {
  if (!themesLoading) {
    themesLoading = fetch("themes.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (!x || !Array.isArray(x.themes)) { themesLoading = null; return; }
        x.themes.forEach((t) => { t.nkeys = uniq(t.keys.map(norm)); try { t.re = t.etf ? new RegExp(t.etf, "i") : null; } catch (e) { t.re = null; } });
        x.fill = uniq(x.filler.map(norm)).sort((a, b) => b.length - a.length);
        THEMES = x;
      });
  }
  return themesLoading;
}
const MK_ONLY = { kr: ["국장", "국내", "한국", "코스피", "코스닥", "국내주식"], us: ["미장", "미국", "해외", "나스닥", "미국주식", "해외주식"] };
const PARTICLE = /(이랑|하고|에서|으로|은|는|이|가|을|를|의|에|와|과|랑)$/;

// 문장 → { themes: 맞은 테마(문장 순서), rest: 테마 낱말·군말을 뺀 나머지 말, only: 'kr'|'us'|null }
function parseAsk(q) {
  const out = { themes: [], rest: [], only: null };
  if (!THEMES) return out;
  const mk = { kr: false, us: false };
  const toks = [];
  for (let w of String(q).toLowerCase().split(/\s+/).map(norm).filter(Boolean)) {
    // '미국반도체', '국장 원전주': 시장 말은 앞에 붙어 있거나 따로 있을 때만 (한국전력의 '한국'은 이름이라 그대로)
    for (const m of ["kr", "us"]) {
      for (const k of MK_ONLY[m]) {
        const bare = w.replace(PARTICLE, "");
        if (w === k || bare === k) { mk[m] = true; w = ""; }
        else if (m === "us" || k !== "한국") { if (w.startsWith(k) && w.length > k.length + 1) { mk[m] = true; w = w.slice(k.length); } }
      }
    }
    // 군말 빼기: '전력관련분야' → '전력', '종목' → 없음
    for (let again = true; again && w;) {
      again = false;
      for (const f of THEMES.fill) {
        if (w === f) { w = ""; break; }
        if (f.length >= 2 && w.endsWith(f) && w.length > f.length) { w = w.slice(0, -f.length); again = true; break; }
      }
    }
    if (w) toks.push(w);
  }
  if (mk.kr !== mk.us) out.only = mk.kr ? "kr" : "us";
  // 붙여 쓴 문장에서 긴 낱말부터: 'ai반도체'가 'ai'보다 먼저. 한 글자 낱말('금')은 따로 쓴 말일 때만
  const s = toks.join("");
  const starts = [];
  toks.reduce((a, w) => { starts.push([a, a + w.length, w]); return a + w.length; }, 0);
  const hits = [];
  THEMES.themes.forEach((t) => t.nkeys.forEach((k) => {
    for (let i = s.indexOf(k); i >= 0; i = s.indexOf(k, i + 1)) {
      if (k.length === 1 && !starts.some(([a, b, w]) => a === i && (b === i + 1 || w.replace(PARTICLE, "") === k))) continue;
      hits.push({ t, a: i, b: i + k.length });
    }
  }));
  hits.sort((x, y) => (y.b - y.a) - (x.b - x.a) || x.a - y.a);
  const used = new Array(s.length).fill(false);
  const picked = [];
  for (const h of hits) {
    if (used.slice(h.a, h.b).some(Boolean)) continue;
    for (let i = h.a; i < h.b; i++) used[i] = true;
    picked.push(h);
  }
  picked.sort((x, y) => x.a - y.a).forEach((h) => { if (!out.themes.includes(h.t)) out.themes.push(h.t); });
  // 남은 말: 테마 낱말이 안 덮은 글자들을 낱말별로
  starts.forEach(([a, b]) => {
    let w = "";
    for (let i = a; i < b; i++) if (!used[i]) w += s[i];
    if (w.length > 2) w = w.replace(/(이랑|하고|에서|으로|은|는|을|를|의)$/, "");  // '고양이'의 '이'는 그대로
    if (w && !THEMES.fill.includes(w) && !/^[가-힣]$/.test(w)) out.rest.push(w);
  });
  return out;
}

function themeChips(title) {
  if (!THEMES) return "";
  return `<section class="card"><h2>${esc(title)} <small>누르면 관련 종목</small></h2>
    <div class="chips theme-chips" role="group" aria-label="테마 고르기">${THEMES.themes.map((t) =>
      `<button type="button" data-theme-q="${esc(t.keys[0])} 관련 종목">${esc(t.name)}</button>`).join("")}</div>
    <button type="button" class="more" data-map="">산업 연관 지도로 보기<span aria-hidden="true">›</span></button></section>`;
}

const SYM_AT = { kr: null, us: null };  // 코드 → 목록 줄
function symRow(m, code) {
  if (!SYM_AT[m] && SYM[m] && SYM[m].length) SYM_AT[m] = new Map(SYM[m].map((e) => [e.row[0], e.row]));
  return SYM_AT[m] ? SYM_AT[m].get(code) : null;
}
// 테마 종목 한 줄: 대시보드에 있으면 시세·★, 없으면 '추가'
function themeRow(m, code, ko, mine) {
  const sym = symRow(m, code);
  const row = sym ? [code, ko || sym[1], sym[2], sym[3], sym[4]] : [code, ko || code, m === "kr" ? "KS" : "", "s", ""];
  const s = mine.get(code);
  return s ? trackedRow({ m, s, row }) : otherRow({ m, row });
}
function themeCard(t, only) {
  const mks = only ? [only] : market === "us" ? ["us", "kr"] : ["kr", "us"];
  const parts = mks.map((m) => {
    const d = DATA.markets[m];
    const mine = new Map(stocksOf(d).map((x) => [x.code, x]));
    const rows = t[m].map(([c, ko]) => themeRow(m, c, ko, mine));
    const etfs = t.re ? (SYM[m] || []).filter((e) => e.row[3] === "e" && t.re.test(`${e.row[1]} ${e.row[4]}`)).slice(0, 5)
      .map((e) => themeRow(m, e.row[0], "", mine)) : [];
    const more = m === "us" ? (t.more_us || []).map((c) => themeRow(m, c, "", mine)) : [];
    if (!rows.length && !etfs.length) return "";
    const sec = t.sector && ((d.signal && d.signal.sectors) || []).find((x) => x.name === t.sector);
    const secLine = sec ? `<li data-tsec="${m}/${esc(sec.name)}"><div class="l"><div class="name">${esc(sec.name)} 업종${toneBadge(sec)}</div>
        <div class="meta">${MK_NAME[m]} 업종 흐름 · 누르면 업종 뉴스</div></div>
        <div class="r ${sign(sec.r5)}">${pct(sec.r5)}<div class="meta">5일 중간값</div></div></li>` : "";
    return `<h3 class="theme-mk">${MK_NAME[m]} <small>${rows.length}종목${etfs.length ? ` · ETF ${etfs.length}개` : ""}</small></h3>
      ${secLine ? `<ul class="list">${secLine}</ul>` : ""}
      ${rows.length ? `<ul class="list">${rows.join("")}</ul>` : `<p class="muted">${MK_NAME[m]}엔 골라 둔 종목이 없어요.</p>`}
      ${etfs.length ? `<h3 class="muted" style="margin:12px 0 4px">관련 ETF</h3><ul class="list">${etfs.join("")}</ul>` : ""}
      ${more.length ? `<details class="more-list"><summary>같은 업종 미장 종목 ${more.length}개 더</summary><ul class="list">${more.join("")}</ul></details>` : ""}`;
  }).join("");
  return `<section class="card theme-card"><h2>${esc(t.name)} <small>테마 · 참고</small></h2>
    <p class="sub">${esc(t.why)}</p>${parts || `<p class="empty">이 시장엔 골라 둔 종목이 없어요.</p>`}
    <button type="button" class="more" data-map="${esc(t.name)}">산업 지도에서 이어진 산업 보기<span aria-hidden="true">›</span></button>
    ${botNote()}
    <p class="muted" style="margin:10px 0 0">미리 골라 둔 대표 종목이에요 (큰 회사부터). 사라는 뜻이 아니고 매매 규칙도 안 바꿔요.</p></section>`;
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
  if (el.id === "search-results") el.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => openMap(b.dataset.map)));
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
  el.querySelectorAll("[data-theme-q]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = b.dataset.themeQ;
    const input = $("#search-input");
    if (input) input.value = searchQuery;
    const list = $("#search-results");
    if (list) { list.innerHTML = searchResults(); bindResults(list); }
    window.scrollTo(0, 0);
  }));
  el.querySelectorAll("[data-tsec]").forEach((b) => b.addEventListener("click", () => {
    const [m, name] = b.dataset.tsec.split("/");
    if (m !== market) { market = m; try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ } }
    SECTOR[m] = name;
    try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
    jumpSectors = true;
    go("home");
  }));
  el.querySelectorAll("[data-req]").forEach((a) => a.addEventListener("click", () => {
    REQ[a.dataset.req] = Date.now();
    try { localStorage.setItem("req", JSON.stringify(REQ)); } catch (e) { /* 이번만 기억 */ }
    setTimeout(() => { if (screen === "search") { const list = $("#search-results"); if (list) { list.innerHTML = searchResults(); bindResults(list); } } }, 300);
  }));
}

// ---------------------------------------------------------------- 산업 지도 (industry_map.py → industry.json)
// 산업 36개를 점으로, 서로 이어진 산업을 선으로. 산업을 누르면 그 산업이 가운데로 오고 연결된 산업만 둘레에 모여요.
let IMAP = null;  // { groups, kinds, nodes, links, flows?, corr?, hidden?, day? }
let imapLoading = null;
let mapFocus = mapStart;
let mapColor = "group";
try { mapColor = localStorage.getItem("map_color") === "flow" ? "flow" : "group"; } catch (e) { /* 기본값 */ }
const MAP_W = 360, MAP_H = 470;
const MAP_ANCHOR = { tech: [92, 80], energy: [270, 100], industry: [180, 238], consumer: [96, 380], finance: [272, 392] };
const MAP_KIND = { s: "공급망", c: "같은 요인", n: "반대", h: "주가로 찾음" };
function loadMap() {
  if (!imapLoading) {
    imapLoading = fetch("industry.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (!x || !Array.isArray(x.nodes)) { imapLoading = null; return; }
        x.at = new Map(x.nodes.map((n, i) => [n.name, i]));
        x.nodes.forEach((n) => { n.w = textW(n.short) + 26; n.fw = textW(n.short) * 1.18 + 30; });
        mapLayout(x);
        IMAP = x;
      });
  }
  return imapLoading;
}
// 글자 폭 어림 (12px 글꼴): 한글 12px, 영문·숫자 7px, 기호 4px
const textW = (s) => [...s].reduce((a, c) => a + (/[가-힣]/.test(c) ? 12 : /[A-Za-z0-9]/.test(c) ? 7.2 : 4), 0);

// 전체 지도 자리: 묶음마다 중심으로 당기고, 이어진 산업끼리 당기고, 겹치면 밀어내요 (처음 한 번, 매번 같은 결과)
function mapLayout(x) {
  const N = x.nodes;
  const groupIdx = {};
  N.forEach((n) => {
    const k = (groupIdx[n.group] = (groupIdx[n.group] || 0) + 1);
    const total = N.filter((m) => m.group === n.group).length;
    const a = (k / total) * Math.PI * 2;
    const [ax, ay] = MAP_ANCHOR[n.group] || [MAP_W / 2, MAP_H / 2];
    n.x = ax + Math.cos(a) * 46; n.y = ay + Math.sin(a) * 34;
  });
  const E = x.links.map((l) => [x.at.get(l.a), x.at.get(l.b)]).filter(([a, b]) => a != null && b != null);
  const H = 26, GAP = 8, ROUNDS = 600;
  for (let it = 0; it < ROUNDS; it++) {
    const cool = 1 - it / ROUNDS;
    if (it < ROUNDS - 120) {
      for (const [a, b] of E) {
        const p = N[a], q = N[b], dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 1;
        const f = ((dist - 100) / dist) * 0.01 * cool;
        p.x += dx * f; p.y += dy * f; q.x -= dx * f; q.y -= dy * f;
      }
      N.forEach((n) => {
        const [ax, ay] = MAP_ANCHOR[n.group] || [MAP_W / 2, MAP_H / 2];
        n.x += (ax - n.x) * 0.03 * cool; n.y += (ay - n.y) * 0.03 * cool;
      });
    }
    for (let sweep = it < ROUNDS - 120 ? 1 : 3; sweep > 0; sweep--) for (let i = 0; i < N.length; i++) {
      for (let j = i + 1; j < N.length; j++) {
        const p = N[i], q = N[j];
        const ox = (p.w + q.w) / 2 + GAP - Math.abs(q.x - p.x), oy = H + GAP - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) { const s = (q.x >= p.x ? 1 : -1) * ox / 2; p.x -= s; q.x += s; }
        else { const s = (q.y >= p.y ? 1 : -1) * oy / 2; p.y -= s; q.y += s; }
      }
    }
    N.forEach((n) => {
      n.x = Math.max(n.w / 2 + 2, Math.min(MAP_W - n.w / 2 - 2, n.x));
      n.y = Math.max(H / 2 + 2, Math.min(MAP_H - H / 2 - 2, n.y));
    });
  }
  N.forEach((n) => { n.ox = n.x; n.oy = n.y; });
}

// 고른 산업과 이어진 산업 [{ name, kind, why, role, corr }]: 사람이 이은 선 + 이 시장에서 주가로 찾은 연결
function mapNeighbors(name) {
  const out = [];
  const corr = (IMAP.corr && IMAP.corr[market]) || {};
  IMAP.links.forEach((l) => {
    if (l.a !== name && l.b !== name) return;
    const other = l.a === name ? l.b : l.a;
    const role = l.kind !== "s" ? MAP_KIND[l.kind] : l.a === name ? "고객 산업" : "공급 산업";
    out.push({ name: other, kind: l.kind, why: l.why, role, corr: corr[`${l.a}|${l.b}`] });
  });
  ((IMAP.hidden && IMAP.hidden[market]) || []).forEach(([a, b, v]) => {
    if (a !== name && b !== name) return;
    out.push({ name: a === name ? b : a, kind: "h", why: "최근 6개월 주가가 유난히 같이 움직였어요. 이유는 뉴스로 직접 확인해 보세요",
      role: "주가로 찾음", corr: v });
  });
  const g = IMAP.groups.map((x) => x.id);
  const ord = (n) => { const node = IMAP.nodes[IMAP.at.get(n.name)]; return g.indexOf(node.group) * 100 + IMAP.nodes.indexOf(node); };
  return out.sort((a, b) => ord(a) - ord(b));
}
// 고른 산업은 가운데, 이어진 산업은 둘레(타원)에. 많으면 안쪽·바깥쪽 번갈아. 나머지는 제자리에서 흐리게.
function mapTargets() {
  const T = IMAP.nodes.map((n) => ({ x: n.ox, y: n.oy, on: !mapFocus, center: false }));
  if (!mapFocus || !IMAP.at.has(mapFocus)) return T;
  const cx = MAP_W / 2, cy = MAP_H / 2;
  T[IMAP.at.get(mapFocus)] = { x: cx, y: cy, on: true, center: true };
  const nb = mapNeighbors(mapFocus);
  const many = nb.length > 8;
  nb.forEach((x, i) => {
    const a = -Math.PI / 2 + (i / nb.length) * Math.PI * 2;
    const k = many && i % 2 ? 0.7 : 1;
    const node = IMAP.nodes[IMAP.at.get(x.name)];
    const rx = MAP_W / 2 - node.w / 2 - 4;
    T[IMAP.at.get(x.name)] = { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * (MAP_H / 2 - 36) * k, on: true, center: false };
  });
  return T;
}

function mapFlow(name, m = market) {
  return IMAP && IMAP.flows && IMAP.flows[m] && IMAP.flows[m][name];
}
// 5일 흐름 색: 오르면 빨강, 내리면 파랑. ±1%·3%·6%에서 진해져요
function heat(r5) {
  if (r5 == null) return "";
  const a = Math.abs(r5), lv = a >= 0.06 ? 3 : a >= 0.03 ? 2 : a >= 0.01 ? 1 : 0;
  return lv ? ` heat ${r5 > 0 ? "up" : "down"} h${lv}` : " heat";
}

function mapSvg() {
  const hidden = (IMAP.hidden && IMAP.hidden[market]) || [];
  const edges = IMAP.links.map((l, i) => `<polyline class="edge k-${l.kind}" data-e="${i}" points=""/>`).join("")
    + hidden.map((h, i) => `<polyline class="edge k-h" data-h="${i}" points=""/>`).join("");
  const nodes = IMAP.nodes.map((n, i) => {
    const f = mapFlow(n.name);
    const cls = `node g-${n.group}${mapColor === "flow" ? heat(f && f.r5) : ""}`;
    return `<g class="${cls}" data-n="${i}" role="button" tabindex="0" aria-label="${esc(n.name)}${f ? ` 5일 ${pct(f.r5)}` : ""}">
      <rect class="hit" x="${-n.fw / 2 - 4}" y="-18" width="${n.fw + 8}" height="36"/>
      <g class="pill"><rect x="${-n.w / 2}" y="-13" width="${n.w}" height="26" rx="13"/>
      <circle cx="${-n.w / 2 + 11}" cy="0" r="4"/><text x="${7}" y="4.2">${esc(n.short)}</text></g>
      <text class="flow ${sign(f && f.r5)}" y="27">${f ? pct(f.r5) : ""}</text></g>`;
  }).join("");
  return `<svg class="imap${mapFocus ? " focused" : ""}" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="산업 연관 지도">
    <defs><marker id="imap-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M1 1 9 5 1 9z"/></marker></defs>
    <g class="edges">${edges}</g><g class="nodes">${nodes}</g></svg>`;
}

// 점·선을 새 자리로 (0.45초). 동작 줄이기를 켰으면 바로.
let mapAnim = 0;
function placeMap(svg, animate) {
  const T = mapTargets();
  const N = IMAP.nodes;
  const from = N.map((n) => ({ x: n.x, y: n.y }));
  const hidden = (IMAP.hidden && IMAP.hidden[market]) || [];
  const fi = mapFocus ? IMAP.at.get(mapFocus) : null;
  N.forEach((n, i) => {
    const g = svg.querySelector(`[data-n="${i}"]`);
    g.classList.toggle("dim", !T[i].on);
    g.classList.toggle("center", T[i].center);
    g.classList.toggle("near", !!mapFocus && T[i].on && !T[i].center);
  });
  IMAP.links.forEach((l, i) => {
    const e = svg.querySelector(`[data-e="${i}"]`);
    const on = fi == null || l.a === mapFocus || l.b === mapFocus;
    e.classList.toggle("off", !on);
    e.classList.toggle("lit", fi != null && on);
    if (fi != null && on && l.kind === "s") e.setAttribute("marker-mid", "url(#imap-arrow)"); else e.removeAttribute("marker-mid");
  });
  hidden.forEach(([a, b], i) => {
    const e = svg.querySelector(`[data-h="${i}"]`);
    const on = fi != null && (a === mapFocus || b === mapFocus);
    e.classList.toggle("off", !on);
    e.classList.toggle("lit", on);
  });
  const draw = (k) => {
    N.forEach((n, i) => {
      n.x = from[i].x + (T[i].x - from[i].x) * k;
      n.y = from[i].y + (T[i].y - from[i].y) * k;
      svg.querySelector(`[data-n="${i}"]`).setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
    });
    const line = (e, a, b) => {
      const p = N[IMAP.at.get(a)], q = N[IMAP.at.get(b)];
      if (!p || !q) return;
      e.setAttribute("points", `${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + q.x) / 2).toFixed(1)},${((p.y + q.y) / 2).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
    };
    IMAP.links.forEach((l, i) => line(svg.querySelector(`[data-e="${i}"]`), l.a, l.b));
    hidden.forEach(([a, b], i) => line(svg.querySelector(`[data-h="${i}"]`), a, b));
  };
  cancelAnimationFrame(mapAnim);
  if (!animate || calm()) { draw(1); return; }
  const t0 = performance.now(), dur = 450;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    draw(1 - (1 - t) ** 3);
    if (t < 1) mapAnim = requestAnimationFrame(step);
  };
  mapAnim = requestAnimationFrame(step);
}

function mapCard() {
  const head = `<button type="button" class="back" data-back>‹ 뒤로</button><h2 class="stock-name">산업 연관 지도</h2>`;
  if (!IMAP) {
    return `<section class="card">${head}<p class="muted" id="map-wait">지도를 불러오는 중이에요…</p></section>`;
  }
  const legend = IMAP.groups.map((g) => `<span class="lg g-${g.id}"><i></i>${esc(g.name)}</span>`).join("");
  const colors = [["group", "묶음 색"], ["flow", "5일 흐름 색"]].map(([k, label]) =>
    `<button type="button" data-mapcolor="${k}" aria-pressed="${mapColor === k}">${label}</button>`).join("");
  const has = !!(IMAP.flows && IMAP.flows[market]);
  return `<section class="card map-card">${head}
    <p class="sub" id="map-sub">${mapFocus ? `<b>${esc(mapFocus)}</b>에 이어진 산업이에요. 둘레 산업을 누르면 그 산업으로 옮겨 가요.`
      : "산업을 누르면 이어진 산업만 선으로 모아 보여 줘요."}</p>
    <div class="map-tools"><div class="period" role="group" aria-label="점 색">${colors}</div>
      <button type="button" class="map-all" data-mapall ${mapFocus ? "" : "hidden"}>‹ 전체 보기</button></div>
    <div class="imap-wrap">${mapSvg()}</div>
    <div class="map-legend">${mapColor === "flow" && has ? `<span class="lg"><i class="up"></i>5일 오름</span><span class="lg"><i class="down"></i>5일 내림</span><span class="muted">${MK_NAME[market]} 대표 종목 중간값</span>`
      : legend}</div>
    <div class="map-legend lines"><span><svg viewBox="0 0 28 8"><path class="k-s" d="M1 4h26"/></svg>공급망·수요</span>
      <span><svg viewBox="0 0 28 8"><path class="k-c" d="M1 4h26"/></svg>같은 요인</span>
      <span><svg viewBox="0 0 28 8"><path class="k-n" d="M1 4h26"/></svg>반대</span>
      <span><svg viewBox="0 0 28 8"><path class="k-h" d="M1 4h26"/></svg>주가로 찾음</span></div>
    ${mapColor === "flow" && !has ? `<p class="muted" style="margin:6px 0 0">${MK_NAME[market]} 흐름 자료가 아직 없어요. 다음 배포 때 생겨요.</p>` : ""}</section>`;
}

const together = (v) => (v == null ? "" : v >= 0.6 ? "주가 많이 같이 움직임" : v >= 0.3 ? "주가 조금 같이 움직임"
  : v > -0.3 ? "주가는 따로 움직임" : "주가가 반대로 움직임");

function mapStockRow(m, [code, ko, close, r5]) {
  const mine = stocksOf(DATA.markets[m]).some((s) => s.code === code);
  return `<li ${mine ? `data-open="${m}/${esc(code)}"` : `data-mapsearch="${esc(code)}"`}><div class="l"><div class="name">${esc(ko)}</div>
    <div class="meta">${esc(code)}${mine ? " · 누르면 차트" : " · 누르면 검색"}</div></div>
    <div class="r">${price(m, close)}<div class="meta ${sign(r5)}">5일 ${pct(r5)}</div></div></li>`;
}

function mapDetailCard() {
  if (!IMAP) return "";
  const day = IMAP.day && IMAP.day[market];
  if (!mapFocus || !IMAP.at.has(mapFocus)) {
    const fl = (IMAP.flows && IMAP.flows[market]) || {};
    const ranked = Object.entries(fl).filter(([, f]) => f.r5 != null).sort((a, b) => b[1].r5 - a[1].r5);
    const row = ([name, f]) => `<li data-mapgo="${esc(name)}"><div class="l"><div class="name">${esc(name)}</div>
      <div class="meta">대표 ${f.n}종목 · 20일 ${pct(f.r20)}</div></div><div class="r ${sign(f.r5)}">${pct(f.r5)}</div></li>`;
    const body = ranked.length >= 6 ? `<h3 class="muted" style="margin:4px 0">많이 오른 산업</h3><ul class="list">${ranked.slice(0, 3).map(row).join("")}</ul>
      <h3 class="muted" style="margin:12px 0 4px">많이 내린 산업</h3><ul class="list">${ranked.slice(-3).reverse().map(row).join("")}</ul>`
      : `<p class="empty">${MK_NAME[market]} 산업 흐름 자료가 아직 없어요. 다음 배포 때 생겨요.</p>`;
    return `<section class="card"><h2>${MK_NAME[market]} 산업 흐름 <small>최근 5거래일${day ? ` · ${md(day)}` : ""}</small></h2>${body}
      <p class="muted" style="margin:10px 0 0">산업마다 대표 종목 5개의 5일 등락률 중간값이에요. 누르면 지도에서 그 산업의 연결을 보여 줘요.
      연결은 사람이 정리한 참고 자료라 매매 규칙은 안 바꿔요.</p></section>`;
  }
  const node = IMAP.nodes[IMAP.at.get(mapFocus)];
  const group = IMAP.groups.find((g) => g.id === node.group);
  const f = mapFlow(mapFocus);
  const nb = mapNeighbors(mapFocus);
  const lines = nb.map((x) => {
    const xf = mapFlow(x.name);
    const badge = `<span class="badge k-${x.kind}">${esc(x.role)}</span>`;
    return `<li data-mapgo="${esc(x.name)}"><div class="l"><div class="name">${esc(x.name)}${badge}</div>
      <div class="meta">${esc(x.why)}${x.corr == null ? "" : ` · ${together(x.corr)} (${x.corr.toFixed(2)})`}</div></div>
      <div class="r ${sign(xf && xf.r5)}">${xf ? pct(xf.r5) : "-"}<div class="meta">5일</div></div></li>`;
  }).join("");
  const stocks = f ? f.stocks.map((s) => mapStockRow(market, s)).join("") : "";
  return `<section class="card"><h2>${esc(mapFocus)} <small>${esc(group ? group.name : "")} · 참고</small></h2>
    <p class="sub">${esc(node.why)}</p>
    ${f ? `<p class="headline ${sign(f.r5)}" style="margin-top:10px">${pct(f.r5)} <small class="muted" style="font-size:13px;font-weight:400">${MK_NAME[market]} 5일 중간값 · 20일 ${pct(f.r20)}</small></p>` : ""}
    <h3 class="muted" style="margin:12px 0 4px">이어진 산업 ${nb.length}개 <small>누르면 그 산업으로</small></h3>
    <ul class="list">${lines}</ul>
    ${stocks ? `<h3 class="muted" style="margin:12px 0 4px">${MK_NAME[market]} 대표 종목${day ? ` · ${md(day)} 종가` : ""}</h3><ul class="list">${stocks}</ul>`
      : `<p class="muted" style="margin:10px 0 0">${MK_NAME[market]} 대표 종목 시세가 아직 없어요.</p>`}
    <button type="button" class="more" data-mapq="${esc(node.q)}">${esc(mapFocus)} 관련 종목 전체 보기 (국장·미장)<span aria-hidden="true">›</span></button>
    <p class="muted" style="margin:10px 0 0">주가 동행은 최근 120거래일 하루 등락률의 상관계수(1이면 똑같이, 0이면 따로)예요.
      연결은 사람이 정리한 참고 자료라 사라는 뜻이 아니고 매매 규칙도 안 바꿔요.</p></section>`;
}

function openMap(name) {
  mapFocus = name || "";
  go("map");
}
function setMapFocus(name) {
  mapFocus = name;
  history.replaceState(history.state, "", hashFor());
  const svg = $(".imap");
  if (!svg) { render(); return; }
  svg.classList.toggle("focused", !!name);
  placeMap(svg, true);
  const sub = $("#map-sub");
  if (sub) sub.innerHTML = name ? `<b>${esc(name)}</b>에 이어진 산업이에요. 둘레 산업을 누르면 그 산업으로 옮겨 가요.`
    : "산업을 누르면 이어진 산업만 선으로 모아 보여 줘요.";
  const all = $("[data-mapall]");
  if (all) all.hidden = !name;
  const old = $("#map-detail");
  if (old) { old.innerHTML = mapDetailCard(); bindMapDetail(old); }
}
function bindMapDetail(el) {
  el.querySelectorAll("[data-mapgo]").forEach((b) => b.addEventListener("click", () => {
    setMapFocus(b.dataset.mapgo);
    const card = $(".map-card");
    if (card) card.scrollIntoView({ behavior: calm() ? "auto" : "smooth" });
  }));
  el.querySelectorAll("[data-mapq]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = `${b.dataset.mapq} 관련 종목`;
    go("search");
  }));
  el.querySelectorAll("[data-mapsearch]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = b.dataset.mapsearch;
    go("search");
  }));
  bindResults(el);
}
function bindMap() {
  if (!IMAP) {
    loadMap().then(() => {
      if (screen !== "map") return;
      if (IMAP) render();
      else { const w = $("#map-wait"); if (w) w.textContent = "지도를 못 불러왔어요. 잠시 뒤 다시 열어 보세요."; }
    });
    return;
  }
  if (mapFocus && !IMAP.at.has(mapFocus)) mapFocus = "";
  const svg = $(".imap");
  placeMap(svg, false);
  svg.querySelectorAll("[data-n]").forEach((g) => {
    const pick = () => {
      const name = IMAP.nodes[Number(g.dataset.n)].name;
      if (mapFocus && g.classList.contains("dim")) return;  // 흐린 산업은 '전체 보기'에서
      setMapFocus(name === mapFocus ? "" : name);
    };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  const all = $("[data-mapall]");
  if (all) all.addEventListener("click", () => setMapFocus(""));
  document.querySelectorAll("[data-mapcolor]").forEach((b) => b.addEventListener("click", () => {
    mapColor = b.dataset.mapcolor;
    try { localStorage.setItem("map_color", mapColor); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const detail = $("#map-detail");
  if (detail) bindMapDetail(detail);
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
  const r = d.signal ? chartIdx(d) : null;
  if (r && r.sym !== OWN_IDX[market]) { drawOtherIndex(r, reset); return; }
  const c = d.signal && d.signal.candles;
  if (c && c.dates.length) {
    const f = frameCandles(c, frame);
    const show = (FRAMES.find((x) => x[0] === frame) || FRAMES[0])[2];
    document.querySelectorAll(".ma-key").forEach((k) => { k.style.display = frame === "y" ? "none" : ""; });
    candleChart($("#trend-chart"), f, show, reset || idxDrawn !== OWN_IDX[market], (txt) => { $("#trend-change").innerHTML = txt; }, { name: d.index_name });
    idxDrawn = OWN_IDX[market];
    return;
  }
  drawTrendLine(d);
}

function drawOtherIndex(r, reset) {
  const el = $("#trend-chart");
  if (!el) return;
  if (!IDX_READY.has(r.sym)) {
    idxData(r.sym).then(() => {
      if (screen === "chart" && chartIdx(DATA.markets[market]).sym === r.sym) render();  // 받는 사이 다른 화면으로 갔으면 안 그려요
    });
    return;
  }
  const x = IDX_READY.get(r.sym), c = x && x.candles;
  if (!c || c.dates.length < 2) {
    el.innerHTML = `<p class="empty">이 지수는 차트 자료를 아직 못 받았어요. 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`;
    return;
  }
  const f = frameCandles(c, frame);
  const show = (FRAMES.find((y) => y[0] === frame) || FRAMES[0])[2];
  candleChart(el, f, show, reset || idxDrawn !== r.sym, (txt) => { const t = $("#trend-change"); if (t) t.innerHTML = txt; },
    { name: r.name, fmt: (v) => (Math.abs(v) >= 1000 ? num(v) : px("us", v)) });  // 큰 지수는 소수점 없이 (가격 축이 안 잘리게)
  idxDrawn = r.sym;
  const all = $("#trend-all");
  if (all) all.innerHTML = allTimeLine(c);
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

// 세계 지수·환율(world.json)에 있는 지수들. 매매 기준 지수가 맨 앞이에요.
function chartIndexes(d) {
  const w = DATA.world;
  const all = w && w.groups ? w.groups.flatMap((g) => g.items).filter((r) => r.kind === "idx") : [];
  const own = OWN_IDX[market];
  return [{ sym: own, name: d.index_name || (all.find((r) => r.sym === own) || {}).name || own },
    ...all.filter((r) => r.sym !== own).map((r) => ({ sym: r.sym, name: r.name }))];
}
function chartIdx(d) {
  const list = chartIndexes(d);
  return list.find((r) => r.sym === CHART_IDX[market]) || list[0];
}
function idxChips(d) {
  const cur = chartIdx(d).sym;
  return `<div class="chips idx-chips" role="group" aria-label="지수 고르기">${chartIndexes(d).map((r) =>
    `<button type="button" data-idx="${esc(r.sym)}" aria-pressed="${r.sym === cur}">${esc(r.name)}</button>`).join("")}</div>`;
}

// 비교 차트 (TradingView·토스처럼): 지수·종목을 최대 4개까지 같은 출발점(0%)에서 겹쳐 그려요.
// 항목 키: "i:^KS11"(지수) / "s:005930"(지금 시장 종목). 시장마다 따로 기억해요.
const CMP_P = [["m1", "1개월", 21], ["m3", "3개월", 63], ["y1", "1년", 252], ["y3", "3년", 756], ["y10", "10년", 2520]];
const CMP_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--bb)"];
const CMP_MAX = 4;
const COMPARE = { kr: null, us: null };
let cmpP = "y1";
try { Object.assign(COMPARE, JSON.parse(localStorage.getItem("compare") || "{}")); cmpP = localStorage.getItem("cmp_p") || "y1"; } catch (e) { /* 처음 */ }
function cmpItems(d) {
  if (!COMPARE[market]) {
    const first = WATCH[market][0] || (stocksOf(d)[0] || {}).code;
    COMPARE[market] = [`i:${OWN_IDX[market]}`].concat(first ? [`s:${first}`] : []);
  }
  return COMPARE[market];
}
function cmpName(d, key) {
  const id = key.slice(2);
  if (key[0] === "i") return (chartIndexes(d).find((r) => r.sym === id) || { name: id }).name;
  return (stocksOf(d).find((x) => x.code === id) || { name: id }).name;
}
// 지수·종목 일봉 (종목 화면·지수 버튼과 같은 파일)
const cmpLoad = (key) => (key[0] === "i" ? idxData(key.slice(2)) : stockData(market, key.slice(2)));
const cmpReady = (key) => (key[0] === "i" ? IDX_READY.get(key.slice(2)) : STOCK_READY.get(`${market}/${key.slice(2)}`));
function compareCard(d) {
  if (!d.signal) return "";
  const items = cmpItems(d);
  const chips = items.map((k, i) => `<button type="button" class="cmp-chip" data-cmp-del="${esc(k)}" aria-label="${esc(cmpName(d, k))} 빼기">
    <i class="sw" style="background:${CMP_COLORS[i]}"></i>${esc(cmpName(d, k))} <span aria-hidden="true">×</span></button>`).join("");
  const opt = (k, label) => (items.includes(k) ? "" : `<option value="${esc(k)}">${esc(label)}</option>`);
  const watch = WATCH[market].map((c) => opt(`s:${c}`, cmpName(d, `s:${c}`))).join("");
  const others = stocksOf(d).filter((x) => !WATCH[market].includes(x.code)).sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((x) => opt(`s:${x.code}`, x.name)).join("");
  const idx = chartIndexes(d).map((r) => opt(`i:${r.sym}`, r.name)).join("");
  const add = items.length < CMP_MAX ? `<select class="cmp-add" aria-label="비교할 지수·종목 더하기"><option value="">+ 더하기</option>
      ${watch ? `<optgroup label="내 관심종목">${watch}</optgroup>` : ""}<optgroup label="지수">${idx}</optgroup>
      <optgroup label="전체 종목">${others}</optgroup></select>` : "";
  const periods = CMP_P.map(([k, label]) => `<button type="button" data-cmp-p="${k}" aria-pressed="${k === cmpP}">${label}</button>`).join("");
  return `<section class="card" id="cmp-card"><h2>비교 차트 <small>같은 날 0%에서 출발</small></h2>
    <div class="chips">${chips}${add}</div>
    <div class="period" role="group" aria-label="비교 기간" style="margin:10px 0 4px">${periods}</div>
    <div class="chart" id="cmp-chart"><p class="empty">불러오는 중이에요…</p></div>
    <p class="muted" id="cmp-note" style="margin:8px 0 0">고른 기간 첫날을 0%로 맞춰서 누가 더 올랐는지 봐요. ×를 누르면 빠져요. 최대 ${CMP_MAX}개까지 겹쳐요.</p></section>`;
}
function drawCompare(d) {
  const el = $("#cmp-chart");
  if (!el) return;
  const items = cmpItems(d);
  if (!items.length) { el.innerHTML = `<p class="empty">위 '+ 더하기'에서 지수나 종목을 골라 주세요.</p>`; return; }
  const want = items.join(",") + cmpP + market;
  Promise.all(items.map(cmpLoad)).then(() => {
    if (screen !== "chart" || cmpItems(d).join(",") + cmpP + market !== want) return;  // 받는 사이 바뀌었으면 안 그려요
    const got = items.map((k) => { const x = cmpReady(k); return x && x.candles && x.candles.dates && x.candles.dates.length ? x.candles : null; });
    const base = got.find(Boolean);
    if (!base) { el.innerHTML = `<p class="empty">자료를 못 받았어요. 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`; return; }
    // 모든 날짜를 합쳐서 기간 길이만큼 자르고, 쉬는 날은 직전 값으로 이어요 (국장·미장 휴일이 달라서)
    const n = (CMP_P.find((x) => x[0] === cmpP) || CMP_P[2])[2];
    const allDates = [...new Set(got.filter(Boolean).flatMap((c) => c.dates))].sort();
    const last = allDates[allDates.length - 1];
    const dates = allDates.filter((x) => x >= base.dates[Math.max(0, base.dates.length - 1 - n)] && x <= last);
    const step = Math.max(1, Math.ceil(dates.length / 400));  // 점이 너무 많으면 폰이 버벅여서 솎아요
    const shown = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);
    const series = items.map((k, j) => {
      const c = got[j];
      if (!c) return { name: cmpName(d, k), color: CMP_COLORS[j], values: shown.map(() => null) };
      const at = new Map(c.dates.map((x, i) => [x, c.c[i]]));
      let prev = null, start = null;
      const values = shown.map((x) => {
        if (at.has(x)) prev = at.get(x);
        if (prev == null) return null;
        if (start == null) start = prev;
        return prev / start - 1;
      });
      return { name: cmpName(d, k), color: CMP_COLORS[j], values };
    });
    lineChart(el, { dates: shown, series, fmt: (v) => pct(v), zero: true });
    const missing = items.filter((_, j) => !got[j]).map((k) => cmpName(d, k));
    const late = series.filter((s) => s.values[0] == null && s.values.some((v) => v != null)).map((s) => s.name);
    const note = $("#cmp-note");
    if (note) note.textContent = (missing.length ? `${missing.join(", ")} 자료를 못 받았어요. ` : "")
      + (late.length ? `${late.join(", ")}은(는) 이 기간 중간에 상장해서 상장일부터 0%예요. ` : "")
      + "고른 기간 첫날을 0%로 맞춰서 누가 더 올랐는지 봐요. ×를 누르면 빠져요.";
  });
}
function bindCompare(d) {
  const save = () => { try { localStorage.setItem("compare", JSON.stringify(COMPARE)); localStorage.setItem("cmp_p", cmpP); } catch (e) { /* 이번만 */ } };
  const redraw = () => { save(); const y = window.scrollY; render(); window.scrollTo(0, y); };
  document.querySelectorAll("[data-cmp-del]").forEach((b) => b.addEventListener("click", () => {
    COMPARE[market] = cmpItems(d).filter((k) => k !== b.dataset.cmpDel); redraw();
  }));
  const sel = $(".cmp-add");
  if (sel) sel.addEventListener("change", () => { if (sel.value) { COMPARE[market] = cmpItems(d).concat(sel.value).slice(0, CMP_MAX); redraw(); } });
  document.querySelectorAll("[data-cmp-p]").forEach((b) => b.addEventListener("click", () => { cmpP = b.dataset.cmpP; redraw(); }));
  drawCompare(d);
}

// 다른 지수 자료: indexes/<기호>.json (배포 때 stock_pages.py가 야후에서 처음부터 받은 일봉). 앱을 닫을 때까지 기억해요.
const indexFile = (sym) => sym.replace(/[^A-Za-z0-9.]/g, "");  // stock_pages.index_file과 같은 규칙
const IDX_DATA = new Map();   // 기호 → 받는 중인 Promise
const IDX_READY = new Map();  // 기호 → 받은 자료 (못 받았으면 null)
let idxDrawn = null;          // 마지막으로 그린 지수 (바뀌면 보던 구간을 처음으로)
function idxData(sym) {
  if (!IDX_DATA.has(sym)) {
    IDX_DATA.set(sym, fetch(`indexes/${encodeURIComponent(indexFile(sym))}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        IDX_READY.set(sym, x);
        if (!x) IDX_DATA.delete(sym);  // 버튼을 다시 누르면 다시 받아요
        return x;
      }));
  }
  return IDX_DATA.get(sym);
}

// 매매 기준이 아닌 지수의 차트 칸 (참고용, 규칙 설명 없이)
function otherIndexCard(d, r) {
  const x = IDX_READY.get(r.sym), cd = x && x.candles;
  const buttons = FRAMES.map(([key, label]) =>
    `<button type="button" data-frame="${key}" aria-pressed="${key === frame}">${label}</button>`).join("");
  const since = cd && cd.dates.length ? `${cd.dates[0].slice(0, 4)}.${cd.dates[0].slice(5, 7)}부터 전체` : "";
  return `<section class="card">${idxChips(d)}<h2>${esc(r.name)} 추세 <small>${since}</small></h2>
    <div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips(cd || { v: [1] })}
    <p class="muted" id="trend-change" style="margin:8px 0 4px"></p>${candleLegend()}
    <div class="chart candle" id="trend-chart"><p class="empty">차트를 불러오는 중이에요…</p></div>
    <p class="muted" id="trend-all" style="margin:8px 0 0"></p>
    <p class="muted" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려요.
      이 지수는 참고로만 봐요. 매수 규칙은 ${esc(chartIndexes(d)[0].name)}만 봐요.</p>${indHelp()}</section>`;
}

function trendCard(d) {
  if (!d.signal) return "";
  const r = chartIdx(d);
  if (r.sym !== OWN_IDX[market]) return otherIndexCard(d, r);
  const cd = d.signal.candles;
  const buttons = FRAMES.map(([key, label]) =>
    `<button type="button" data-frame="${key}" aria-pressed="${key === frame}">${label}</button>`).join("");
  return `<section class="card">${idxChips(d)}<h2>${esc(d.index_name)} 추세</h2>
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

// 적립식 복리 계산기: 매달 N만 원씩 넣으면 몇 년 뒤 얼마? 예금·우리 ETF 규칙·그냥 보유·내 가정을 나란히, 세금(일반·ISA) 반영.
// 수익률은 docs/etf-backtest.md 2011~ 원화 백테스트 값이에요. 과거 수익률이 미래를 보장하지 않아요.
const SAV_PLANS = [
  { key: "dep", name: "예금", rate: 0.03, mdd: 0, color: "var(--text-muted)", note: "연 3% 가정" },
  { key: "rule", name: "우리 ETF 규칙", rate: 0.071, mdd: -0.084, color: "var(--series-1)", note: "S&P500 ETF 50%+현금, 2011~ 백테스트" },
  { key: "hold", name: "S&P500 ETF 그냥 보유", rate: 0.15, mdd: -0.302, color: "var(--series-2)", note: "2011~ 백테스트. 미국 주식이 유난히 좋았던 기간이에요" },
  { key: "mine", name: "내 가정", rate: null, mdd: null, color: "var(--series-3)", note: "아래에서 바꿔요" },
];
const SAV = { monthly: 50, years: 10, start: 0, acct: "isa", rate: 8, mdd: 30 };
try { Object.assign(SAV, JSON.parse(localStorage.getItem("savings") || "{}")); } catch (e) { /* 처음 */ }
const TAX = 0.154;  // 이자·배당소득세 (국내 상장 해외 ETF 매매차익도 배당소득으로 15.4%)
// 한 계획의 해마다 잔고(세전)와 마지막 세후 금액. 돈은 원 단위, 매달 초에 넣어요.
function savSim(plan, { monthly, years, start, acct }) {
  const m = Math.round(years * 12), dep = plan.key === "dep";
  const net = dep && acct !== "isa" ? plan.rate * (1 - TAX) : plan.rate;  // 일반 계좌 예금은 이자에 매년 세금
  const g = Math.pow(1 + net, 1 / 12);
  let bal = start, paid = start;
  const byYear = [bal];
  for (let i = 1; i <= m; i++) {
    bal = (bal + monthly) * g; paid += monthly;
    if (i % 12 === 0 || i === m) byYear.push(bal);
  }
  const gain = Math.max(0, bal - paid);
  let tax = 0;
  if (acct === "isa") tax = Math.max(0, gain - 2e6) * 0.099;  // ISA 일반형: 200만 원까지 비과세, 넘는 부분 9.9%
  else if (!dep) tax = gain * TAX;                              // 일반 계좌 ETF: 팔 때 차익에 15.4%
  return { paid, bal, tax, after: bal - tax, byYear };
}
function savPlans() {
  return SAV_PLANS.map((p) => (p.key === "mine" ? { ...p, rate: SAV.rate / 100, mdd: -SAV.mdd / 100, note: `연 ${SAV.rate}% · 최대 낙폭 -${SAV.mdd}% 가정` } : p));
}
function savingsCard() {
  const inp = (k, label, unit, attrs) => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-sav="${k}" type="text" inputmode="decimal" value="${SAV[k]}" ${attrs || ""}><span>${unit}</span></span></label>`;
  const yrs = [1, 3, 5, 10, 20].map((y) => `<button type="button" data-sav-y="${y}" aria-pressed="${SAV.years === y}">${y}년</button>`).join("");
  const accts = [["isa", "ISA"], ["normal", "일반 계좌"]].map(([k, l]) => `<button type="button" data-sav-a="${k}" aria-pressed="${SAV.acct === k}">${l}</button>`).join("");
  return `<section class="card" id="sav-card"><h2>적립식 복리 계산기 <small>매달 넣으면 얼마가 될까</small></h2>
    <div class="sav-grid">${inp("monthly", "매달", "만 원")}${inp("start", "처음에", "만 원")}</div>
    <div class="period" role="group" aria-label="기간" style="margin:10px 0 0">${yrs}</div>
    <div class="period" role="group" aria-label="계좌" style="margin:8px 0 0">${accts}</div>
    <div id="sav-out">${savOut()}</div>
    <details style="margin-top:10px"><summary>내 가정 바꾸기</summary>
      <div class="sav-grid" style="margin-top:8px">${inp("rate", "연 수익률", "%")}${inp("mdd", "최대 낙폭", "%")}</div></details>
    <p class="muted" style="margin:10px 0 0">ISA(일반형)는 3년 이상 유지하면 이익 200만 원까지 세금이 없고, 넘는 부분은 9.9%예요. 한 해 2,000만 원까지 넣을 수 있어요.
      일반 계좌는 예금 이자·ETF 차익에 15.4%. 금융소득이 한 해 2,000만 원을 넘을 때 붙는 종합과세는 빼고 계산했어요.
      수익률은 과거 백테스트라 앞으로도 그렇다는 보장이 없어요. 매달 같은 비율로 오른다고 단순하게 셌어요.</p></section>`;
}
function savOut() {
  const o = { monthly: (+SAV.monthly || 0) * 1e4, start: (+SAV.start || 0) * 1e4, years: SAV.years, acct: SAV.acct };
  const plans = savPlans(), res = plans.map((p) => savSim(p, o));
  const won = (x) => (Math.abs(x) >= 1e8 ? `${Math.floor(x / 1e8)}억${Math.round((x % 1e8) / 1e4) ? ` ${Math.round((x % 1e8) / 1e4).toLocaleString("ko-KR")}만` : ""}원` : `${bigNum(x)}원`);
  const rows = plans.map((p, i) => {
    const r = res[i], profit = r.after - r.paid;
    const worst = p.mdd ? `<div class="meta">나쁜 때 잔고가 잠깐 ${won(r.bal * (1 + p.mdd))}까지 (${Math.round(p.mdd * 100)}%)</div>` : "";
    return `<li><div class="l"><div class="name"><i class="sw" style="background:${p.color}"></i> ${esc(p.name)}</div>
      <div class="meta">${esc(p.note)}${p.key === "dep" ? (SAV.acct === "isa" ? ", ISA라 이자 세금은 끝에 한 번" : ", 이자에 매년 15.4%") : ""}</div>${worst}</div>
      <div class="r"><b>${won(r.after)}</b><div class="meta ${sign(profit)}">${profit >= 0 ? "+" : ""}${won(profit)}${r.tax > 0 ? ` · 세금 ${won(r.tax)}` : ""}</div></div></li>`;
  }).join("");
  const paid = res[0].paid, perYear = o.monthly * 12 + o.start;
  const over = SAV.acct === "isa" && perYear > 2e7 ? `<p class="muted" style="margin:6px 0 0">⚠️ ISA는 한 해 2,000만 원까지만 넣을 수 있어요. 넘는 돈은 일반 계좌로 계산하는 게 맞아요.</p>` : "";
  return `<p class="hero" style="margin:12px 0 0">${won(paid)} <small class="muted" style="font-size:14px">넣은 돈 (${SAV.years}년)</small></p>${over}
    <ul class="list">${rows}</ul>
    <div class="chart" id="sav-chart"></div>`;
}
function drawSavings() {
  const el = $("#sav-chart");
  if (!el) return;
  const o = { monthly: (+SAV.monthly || 0) * 1e4, start: (+SAV.start || 0) * 1e4, years: SAV.years, acct: SAV.acct };
  const plans = savPlans(), res = plans.map((p) => savSim(p, o));
  const n = res[0].byYear.length;
  lineChart(el, {
    dates: Array.from({ length: n }, (_, i) => (i === 0 ? "지금" : `${i}년 뒤`)), xfmt: (x) => x,
    series: plans.map((p, i) => ({ name: p.name, color: p.color, values: res[i].byYear })),
    fmt: (v) => bigNum(v),
  });
}
function bindSavings() {
  const save = () => { try { localStorage.setItem("savings", JSON.stringify(SAV)); } catch (e) { /* 이번만 */ } };
  const refresh = () => { save(); const out = $("#sav-out"); if (out) { out.innerHTML = savOut(); drawSavings(); } };
  document.querySelectorAll("[data-sav]").forEach((i) => i.addEventListener("input", () => {
    const v = parseFloat(i.value.replace(/[,\s]/g, ""));
    SAV[i.dataset.sav] = Number.isFinite(v) && v >= 0 ? Math.min(v, i.dataset.sav === "mdd" ? 99 : 1e6) : 0;
    refresh();
  }));
  const pick = (attr, key, cast) => document.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener("click", () => {
    SAV[key] = cast(b.getAttribute(attr));
    document.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    refresh();
  }));
  pick("data-sav-y", "years", Number);
  pick("data-sav-a", "acct", String);
  drawSavings();
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
  return `<section class="card"><h2>ETF(원화) 계좌 <small>ISA·연금저축용 · 1,000만 원</small></h2>${body}
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
// 공시 (disclosures.py, 오픈DART). ⚠️ 주의(유상증자·전환사채 등), 🔍 지분 변동, 👍 좋은 편(자사주 매입·배당 등)
const DIS_ICON = { warn: "⚠️", check: "🔍", good: "👍" };
const DIS_LINK = (no) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(no)}`;
function disRow(x, withName) {
  return `<li><div class="l"><div class="name">${DIS_ICON[x.tone] || "📄"} ${withName ? `${esc(x.name)} · ` : ""}<a href="${DIS_LINK(x.no)}" target="_blank" rel="noopener">${esc(x.title)}</a></div>
    <div class="meta">${md(x.day)}${x.by && x.by !== x.name ? ` · ${esc(x.by)}` : ""}</div></div></li>`;
}
function discloseStockCard(d) {
  if (market !== "kr" || !d.disclosures) return "";
  const mine = d.disclosures.filter((x) => x.code === stockCode);
  if (!mine.length) return "";
  return `<section class="card"><h2>최근 공시 <small>30일 · 금감원 전자공시</small></h2><ul class="list">${mine.map((x) => disRow(x, false)).join("")}</ul>
    <p class="muted" style="margin:8px 0 0">⚠️ 유상증자·전환사채·최대주주 변경 같은 공시는 주가가 내릴 때가 많아요. 제목을 누르면 원문이 열려요.</p></section>`;
}
function discloseHomeCard(d) {
  if (market !== "kr" || !d.disclosures) return "";
  const since = new Date(Date.parse(TODAY()) - 7 * 864e5).toISOString().slice(0, 10);
  const mine = new Set([...WATCH.kr, ...(d.extras || []).map((e) => e.code), ...((d.account && d.account.positions) || []).map((p) => p.code)]);
  const rows = d.disclosures.filter((x) => x.day >= since && (x.tone === "warn" || x.tone === "check" || mine.has(x.code)));
  return `<section class="card"><h2>최근 공시 <small>7일 · 주의 공시와 내 종목</small></h2>
    ${rows.length ? `<ul class="list">${rows.slice(0, 8).map((x) => disRow(x, true)).join("")}</ul>` : `<p class="empty">최근 7일 동안 주의할 공시가 없어요.</p>`}
    <p class="muted" style="margin:8px 0 0">평일 한 시간마다 금감원 전자공시를 봐요. ⚠️ 공시는 텔레그램으로 바로 와요.</p></section>`;
}

// 다가오는 일정 (econ_calendar.py): 금리 결정·만기일·실적 시즌은 다 보여 주고, 종목 실적 발표·배당락은
// 내 관심종목(★)·텔레그램으로 넣은 종목·가상계좌 종목만. 나머지 대형주 실적은 개수만.
const CAL_DAYS = 14;
const CAL_ICON = { rate: "🏦", expiry: "⏳", season: "📊", earn: "📢", exdiv: "💰" };
let calAll = false;
function calendarCard(d) {
  const ev = (DATA && DATA.calendar) || [];
  if (!ev.length) return "";
  const today = TODAY(), end = new Date(Date.parse(today) + CAL_DAYS * 864e5).toISOString().slice(0, 10);
  const mineOf = (e) => e.mine || (e.code && WATCH[e.market].includes(e.code));
  const near = ev.filter((e) => e.date >= today && e.date < end);
  const shown = near.filter((e) => !["earn", "exdiv"].includes(e.kind) || mineOf(e) || (calAll && e.kind === "earn"));
  const hidden = near.filter((e) => e.kind === "earn" && !mineOf(e)).length;
  const flag = { kr: "🇰🇷", us: "🇺🇸" }, days = "일월화수목금토";
  let last = "";
  const rows = shown.map((e) => {
    const head = e.date !== last ? `<li class="cal-day"><b>${md(e.date)} (${days[new Date(e.date + "T00:00:00").getDay()]})</b> <span class="muted">${dday(e.date)}</span></li>` : "";
    last = e.date;
    const tap = e.code && e.market === market ? ` data-stock="${esc(e.code)}"` : "";
    return `${head}<li${tap}><div class="l"><div class="name">${CAL_ICON[e.kind] || ""} ${flag[e.market] || ""} ${esc(e.title)}${mineOf(e) ? " ⭐" : ""}</div>
      ${e.note ? `<div class="meta">${esc(e.note)}</div>` : ""}</div></li>`;
  }).join("");
  const more = hidden ? `<button type="button" class="more" data-cal-all>${calAll ? "관심종목 실적만 보기" : `대형주 실적 발표 ${hidden}건 더 보기`}<span aria-hidden="true">›</span></button>` : "";
  return `<section class="card" id="cal-card"><h2>다가오는 일정 <small>${CAL_DAYS}일 · 국장·미장</small></h2>
    ${rows ? `<ul class="list cal">${rows}</ul>` : `<p class="empty">앞으로 ${CAL_DAYS}일 동안 큰 일정이 없어요.</p>`}${more}
    <p class="muted" style="margin:10px 0 0">금리 결정·만기일 날엔 시장이 크게 출렁일 수 있어요. ⭐는 내 관심종목·가상계좌 종목이에요. 월요일 아침엔 텔레그램으로도 와요. 미국 물가·고용 발표일은 아직 못 넣었어요.</p></section>`;
}

// 시장 히트맵 (토스·TradingView처럼): 대형주를 업종별로 묶고, 크기는 시가총액, 색은 등락(빨강 오름·파랑 내림)
const HEAT_P = [["d1", "오늘", 1], ["r5", "5일", 5], ["r20", "20일", 20]];
let heatP = "d1";
try { heatP = localStorage.getItem("heat_p") || "d1"; } catch (e) { /* 처음 */ }
function heatRet(s, k) {
  if (k === "d1") return s.d1;
  const n = (HEAT_P.find((x) => x[0] === k) || [])[2], sp = s.spark || [];
  return sp.length > n ? sp[sp.length - 1] / sp[sp.length - 1 - n] - 1 : null;
}
function heatmapCard(d) {
  const all = stocksOf(d).filter((s) => !s.extra && s.close != null);
  if (all.length < 5) return "";
  if (!HEAT_P.some((x) => x[0] === heatP)) heatP = "d1";
  const funds = d.funds || {}, of = (d.signal && d.signal.sector_of) || {};
  const groups = new Map();
  all.forEach((s) => {
    const g = of[s.code] || (s.code === "SPY" ? "ETF" : "기타");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ s, cap: (funds[s.code] || {}).cap || 0, r: heatRet(s, heatP) });
  });
  const capOf = (rows) => rows.reduce((a, x) => a + x.cap, 0);
  const sorted = [...groups.entries()].sort((a, b) => capOf(b[1]) - capOf(a[1]) || b[1].length - a[1].length);
  const big = Math.max(...all.map((s) => (funds[s.code] || {}).cap || 0)) || 1;
  const scale = heatP === "d1" ? 0.03 : heatP === "r5" ? 0.07 : 0.15;  // 이만큼 움직이면 가장 진한 색
  const tile = ({ s, cap, r }) => {
    const k = r == null ? 0 : Math.min(1, Math.abs(r) / scale), mix = Math.round(15 + k * 75);
    const bg = r == null || Math.abs(r) < 0.0005 ? "var(--surface-0)" : `color-mix(in srgb, var(${r > 0 ? "--up" : "--down"}) ${mix}%, var(--surface-0))`;
    const grow = cap ? Math.max(1, Math.sqrt(cap / big) * 6) : 1;
    return `<button type="button" class="heat-tile${mix > 55 && r != null && Math.abs(r) >= 0.0005 ? " strong" : ""}" style="flex-grow:${grow.toFixed(2)};background:${bg}"
      data-stock="${esc(s.code)}" aria-label="${esc(s.name)} ${r == null ? "자료 없음" : pct(r)}"><span>${esc(s.name)}</span><b>${r == null ? "-" : pct(r)}</b></button>`;
  };
  const rows = sorted.map(([g, list]) => {
    list.sort((a, b) => b.cap - a.cap);
    const avg = list.filter((x) => x.r != null);
    const m = avg.length ? avg.reduce((a, x) => a + x.r, 0) / avg.length : null;
    return `<div class="heat-group"><div class="heat-head"><span>${esc(g)}</span><b class="${sign(m)}">${m == null ? "" : pct(m)}</b></div>
      <div class="heat-row">${list.map(tile).join("")}</div></div>`;
  }).join("");
  const chips = HEAT_P.map(([k, label]) => `<button type="button" data-heat="${k}" aria-pressed="${k === heatP}">${label}</button>`).join("");
  return `<section class="card" id="heat-card"><h2>시장 히트맵 <small>${all.length}개 대형주 · ${md(all[0].day)}</small></h2>
    <div class="period" role="group" aria-label="기간" style="margin:4px 0 10px">${chips}</div>${rows}
    <p class="muted" style="margin:10px 0 0">칸이 클수록 시가총액이 크고, 진할수록 많이 움직였어요. 누르면 종목 화면이에요.</p></section>`;
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
    <p class="muted" style="margin:10px 0 0">호재·악재는 뉴스 제목 낱말로 짐작한 거예요. 고른 업종은 관심 화면 전체 종목에도 똑같이 걸려요.</p>
    <button type="button" class="more" data-map="">산업 연관 지도 (어떤 산업끼리 이어져 있나)<span aria-hidden="true">›</span></button></section>`;
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

// 외국인·기관 수급 (flows.py, 네이버 무료 자료). 국장만. 홈은 '같이 파는 종목' 경고와 5일 많이 산·판 종목
const won = (x) => `${x < 0 ? "-" : "+"}${bigNum(Math.abs(x))}원`;
function flowsCard(d) {
  const f = market === "kr" && d.flows;
  if (!f) return "";
  const warn = (f.warn || []).map((r) => `<li data-stock="${esc(r.code)}"><div class="l"><div class="name">${esc(r.name)}</div>
      <div class="meta">외국인 ${r.frg_streak}일 연속 순매도 · 기관도 5일 순매도${r.hold == null ? "" : ` · 외국인 보유 ${r.hold.toFixed(1)}%`}</div></div>
      <div class="r down">${won(-r.sold)}<div class="meta">5일 합계</div></div></li>`).join("");
  const line = (rows, cls) => rows.map((r) => `<button type="button" class="chip-link ${cls}" data-stock="${esc(r.code)}">${esc(r.name)} ${won(r.won)}</button>`).join("");
  return `<section class="card"><h2>외국인·기관 수급 <small>${md(f.day)}까지 5거래일 · 참고</small></h2>
    ${warn ? `<h3 class="muted" style="margin:6px 0 4px">⚠️ 외국인·기관이 같이 파는 종목</h3><ul class="list">${warn}</ul>`
      : `<p class="sub" style="margin:6px 0 0">외국인이 3일 넘게 팔면서 기관도 파는 종목은 없어요.</p>`}
    ${(f.buy || []).length ? `<h3 class="muted" style="margin:12px 0 4px">많이 산 종목 (외국인+기관)</h3><div class="chip-row">${line(f.buy, "up")}</div>` : ""}
    ${(f.sell || []).length ? `<h3 class="muted" style="margin:12px 0 4px">많이 판 종목</h3><div class="chip-row">${line(f.sell, "down")}</div>` : ""}
    <p class="muted" style="margin:10px 0 0">금액은 순매수 주식 수 × 그날 종가로 어림한 값이에요. 큰손이 판다고 꼭 내리는 건 아니라서 매매 규칙은 안 바꿨어요.</p></section>`;
}

function flowBars(x) {
  const n = x.dates.length;
  const vals = [...x.frg, ...x.inst];
  const hi = Math.max(1, ...vals.map(Math.abs));
  const W = 320, H = 130, t = 6, b = 18, mid = t + (H - t - b) / 2, half = (H - t - b) / 2;
  const gw = W / n, bw = Math.max(2, Math.min(6, gw * 0.36));
  let bars = "";
  x.dates.forEach((_, i) => [["frg", -bw - 0.5], ["inst", 0.5]].forEach(([k, dx]) => {
    const v = x[k][i], h = Math.max(1, (Math.abs(v) / hi) * half);
    bars += `<rect class="flow-${k}" x="${(i * gw + gw / 2 + dx).toFixed(1)}" y="${(v >= 0 ? mid - h : mid).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>`;
  }));
  const lab = [[0, 0, "start"], [Math.floor((n - 1) / 2), null, "middle"], [n - 1, W, "end"]]
    .map(([i, at, a]) => `<text x="${(at ?? i * gw + gw / 2).toFixed(1)}" y="${H - 4}" text-anchor="${a}">${md(x.dates[i])}</text>`).join("");
  return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${n}거래일 외국인·기관 순매수 막대">
    <line class="gridline" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><text x="2" y="${t + 9}">순매수 ↑</text><text x="2" y="${H - b - 2}">순매도 ↓</text>${bars}${lab}</svg>`;
}

function fillFlows(x) {
  const card = $("#flow-card");
  if (!card) return;
  if (!x || !x.dates || !x.dates.length) {
    card.innerHTML = `<h2>외국인·기관 수급</h2><p class="empty">수급 자료가 아직 없어요. 평일 장 마감 뒤(17:30쯤) 받아요.</p>`;
    return;
  }
  const m = x.sum || {};
  const qty = (q) => `${q < 0 ? "-" : "+"}${Math.abs(q) >= 1e4 ? `${Math.round(Math.abs(q) / 1e4).toLocaleString("ko-KR")}만` : Math.abs(q).toLocaleString("ko-KR")}주`;
  const st = (v) => (!v ? "-" : `${Math.abs(v)}일 연속 ${v > 0 ? "순매수" : "순매도"}`);
  const tile = (label, w, q, sk) => `<div class="stat"><span>${label}</span><b class="${sign(w)}">${won(w)}</b><small>${qty(q)} · ${st(sk)}</small></div>`;
  card.innerHTML = `<h2>외국인·기관 수급 <small>${md(m.day)}까지 · 참고</small></h2>
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">${tile("외국인 5일", m.frg5_won, m.frg5, m.frg_streak)}${tile("기관 5일", m.inst5_won, m.inst5, m.inst_streak)}
      <div class="stat"><span>외국인 20일</span><b class="${sign(m.frg20_won)}">${won(m.frg20_won)}</b></div>
      <div class="stat"><span>기관 20일</span><b class="${sign(m.inst20_won)}">${won(m.inst20_won)}</b></div></div>
    ${m.hold == null ? "" : `<p class="sub" style="margin:10px 0 0">외국인 보유율 <b>${m.hold.toFixed(2)}%</b>${m.hold_chg == null ? "" : ` (20일 전보다 <b class="${sign(m.hold_chg)}">${m.hold_chg > 0 ? "+" : ""}${m.hold_chg.toFixed(2)}%p</b>)`}</p>`}
    <div class="legend" style="margin:10px 0 0"><span class="key"><i class="sw flow-frg"></i>외국인</span><span class="key"><i class="sw flow-inst"></i>기관</span></div>
    ${flowBars(x)}
    <p class="muted" style="margin:8px 0 0">하루 순매수 주식 수 막대예요. 금액은 주식 수 × 그날 종가로 어림했어요. 네이버 증권 무료 자료예요.</p>`;
}

// 주가는 그대로인데 거래량만 크게 늘어난 종목 (quiet_volume.py). 예전 기록엔 없을 수 있어요.
function quietVolumeCard(d) {
  const q = d.signal && d.signal.quiet_volume;
  if (!q) return "";
  const rows = (q.rows || []).map((r) => `<li data-stock="${esc(r.code)}"><div class="l"><div class="name">${esc(r.name)}</div>
      <div class="meta">거래량 평소의 ${r.ratio.toFixed(1)}배 · 가장 많은 날 ${r.peak.toFixed(1)}배${r.r20 == null ? "" : ` · 20일 ${pct(r.r20)}`}</div></div>
      <div class="r ${sign(r.r5)}">${pct(r.r5)}<div class="meta">5일 주가</div></div></li>`).join("");
  const more = q.total > (q.rows || []).length ? `<p class="muted" style="margin:6px 0 0">외 ${q.total - q.rows.length}개</p>` : "";
  return `<section class="card"><h2>주가 그대로·거래량 급증 <small>최근 ${q.days}거래일 · ${q.count}개 종목 중</small></h2>
    ${rows ? `<ul class="list">${rows}</ul>${more}` : `<p class="empty">오늘은 조건에 맞는 종목이 없어요.</p>`}
    <p class="muted" style="margin:10px 0 0">주가는 ±${Math.round(q.max_move * 100)}% 안인데 거래량이 평소(${q.base}일 평균)의 ${q.min_ratio}배 이상인 종목이에요.
      조용히 사 모으는 중인지 팔아 넘기는 중인지는 숫자만으론 몰라요. 참고용이고 매매 규칙은 안 바꿔요.</p></section>`;
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
  fillFlows(x && x.flows);
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
    <p class="sub" style="margin:12px 0 0">${gradeLine}</p>${eventsLine(f)}${targetBox(f, ent)}${body}
    <p class="muted" style="margin:10px 0 0">야후 파이낸스 무료 자료라 늦거나 빠진 값이 있을 수 있어요. PER은 최근 4분기 순이익 기준이에요.</p>`;
}

// 다음 실적 발표일·배당 일정 한 줄 (야후 무료 자료, 매주 토요일 갱신)
const TODAY = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);  // 한국 날짜
const dday = (d) => { const n = Math.round((Date.parse(d) - Date.parse(TODAY())) / 864e5); return n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 전`; };
const ymd = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
function eventsLine(f) {
  const e = f.events || {};
  const parts = [];
  if (e.earn) parts.push(`실적 발표 <b>${ymd(e.earn)}</b> (${dday(e.earn)})`);
  if (e.exdiv) parts.push(`배당락 ${ymd(e.exdiv)}${e.exdiv >= TODAY() ? ` (${dday(e.exdiv)})` : ""}`);
  if (e.div_rate) parts.push(`1주당 연 배당 ${market === "kr" ? `${num(e.div_rate)}원` : `$${e.div_rate.toFixed(2)}`}`);
  return parts.length ? `<p class="sub" style="margin:8px 0 0">📅 ${parts.join(" · ")}</p>` : "";
}

// 애널리스트 목표주가 (야후 무료 컨센서스): 최저~최고 막대 위에 지금 가격과 평균 목표가
function targetBox(f, ent) {
  const t = f.target;
  if (!t || !t.mean) return "";
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  const cc = x && x.candles && x.candles.c;
  const now = ent && ent.close != null ? ent.close : cc && cc.length ? cc[cc.length - 1] : null;
  const up = now ? t.mean / now - 1 : null;
  const lo = Math.min(t.low ?? t.mean, now ?? t.mean), hi = Math.max(t.high ?? t.mean, now ?? t.mean);
  const at = (v) => `${(((v - lo) / (hi - lo || 1)) * 100).toFixed(1)}%`;
  const bar = t.low != null && t.high != null ? `<div class="tgt-bar" aria-hidden="true">
      <span class="tgt-range" style="left:${at(t.low)};right:${(100 - parseFloat(at(t.high))).toFixed(1)}%"></span>
      <span class="tgt-mark mean" style="left:${at(t.mean)}"></span>${now ? `<span class="tgt-mark now" style="left:${at(now)}"></span>` : ""}</div>
    <div class="tgt-ends"><span>최저 ${px(market, t.low)}</span><span>최고 ${px(market, t.high)}</span></div>` : "";
  return `<div class="tgt"><h3 class="muted" style="margin:14px 0 6px">애널리스트 목표주가 <small>${t.n}명 평균</small></h3>
    <p class="sub" style="margin:0"><b>${price(market, t.mean)}</b>${up == null ? "" : ` · 지금보다 <b class="${sign(up)}">${pct(up)}</b>`}${t.rec ? ` · 의견 <b>${esc(t.rec)}</b>` : ""}</p>
    ${bar}<div class="legend" style="margin:4px 0 0"><span class="key"><i class="dot now"></i>지금 가격</span><span class="key"><i class="dot mean"></i>평균 목표가</span></div>
    <p class="muted" style="margin:6px 0 0">증권사 목표가는 대체로 낙관적이고 늦게 바뀌어요. 참고만 하세요.</p></div>`;
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
  if (h.s === "map") mapFocus = h.code || "";
  go(h.s, true);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();  // 데이터가 오기 전에도 주소에 맞는 시장·화면 버튼을 표시해요
load();
