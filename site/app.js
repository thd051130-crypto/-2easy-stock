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
const SCREENS = ["home", "signal", "watch", "perf", "chart", "stock"];
let screen = "home";
// 종목 화면(#kr/stock/005930): 목록에서 종목을 누르면 열려요. 아래 버튼은 종목 화면을 연 화면에 불이 들어와요.
let stockCode = null;
let stockFrom = "watch";
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
function toggleWatch(code) {
  const list = WATCH[market];
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1); else list.push(code);
  try { localStorage.setItem(`watch_${market}`, JSON.stringify(list)); } catch (e) { /* 이번만 기억 */ }
}
let watchQuery = "";
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
  $("#updated").textContent = `화면 데이터 갱신: ${DATA.built.replace("T", " ").slice(0, 16)} (한국시간)`;
  render();
}

function selectMarket(m) {
  market = m;
  try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ }
  if (screen === "stock") screen = stockFrom;  // 종목 화면은 그 시장 종목이라, 시장을 바꾸면 보던 목록 화면으로
  history.replaceState(history.state, "", hashFor());
  render();
}

// 기록(history) 층: 홈 = 0층, 홈에서 다른 화면으로 가면 1층, 종목 화면은 한 층 더 쌓아요. 화면끼리는 바꿔치기.
// 그래서 폰의 뒤로 가기를 누르면 종목 → 보던 화면 → 홈 순서로 돌아오고, 앱이 바로 꺼지지 않아요.
// (예전 버전이 남긴 기록 {screen}은 1층으로 쳐요)
const depth = () => { const st = history.state; return st ? (st.depth ?? (st.screen ? 1 : 0)) : 0; };
function go(s, fromBack) {
  if (!SCREENS.includes(s) || (s === "stock" && !stockCode)) s = "home";
  if (!fromBack) {
    if (s === screen && s !== "stock") { window.scrollTo(0, 0); return; }  // 지금 화면 버튼을 또 누르면 맨 위로
    if (s === "home" && depth() > 0) { history.go(-depth()); return; }
    if (s === "stock") {
      if (screen !== "stock") stockFrom = screen;
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
  window.scrollTo(0, 0);
  render();
}

function openStock(code) {
  stockCode = code;
  go("stock");
}
// 종목 화면의 ‹ 뒤로: 쌓인 기록이 있으면 폰 뒤로 가기와 같고, 주소로 바로 열었으면 종목을 연 화면으로
function back() {
  if (depth() > 0) history.back();
  else go(stockFrom === "stock" ? "watch" : stockFrom);
}

const VIEWS = {
  home: (d) => [homeSignalCard(d), homeWatchCard(d), homePerfCard(d), homeIndexCard(d)],
  signal: (d) => [signalCard(d), desksCard(d), rulebookPicksCard(d), rulesCard(d)],
  watch: (d) => [watchCard(d), allStocksCard(d)],
  perf: (d) => [trackCard(d), accountCard(d), positionsCard(d), tradesCard(d), rulebookAccountCard(d)],
  chart: (d) => [trendCard(d) || `<section class="card"><p class="empty">아직 지수 기록이 없어요.</p></section>`],
  stock: (d) => [stockHeadCard(d), stockChartCard(), `<section class="card" id="fund-card"><h2>재무제표</h2><p class="muted">불러오는 중이에요…</p></section>`],
};

function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === market)));
  const lit = screen === "stock" ? stockFrom : screen;
  document.querySelectorAll(".nav button").forEach((b) => {
    if (b.dataset.screen === lit) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (!DATA) return;
  const d = DATA.markets[market];
  const app = $("#app");
  app.innerHTML = VIEWS[screen](d).join("");
  app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  app.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
  if (screen === "perf") { drawTrack(d); drawEquity(d); }
  if (screen === "watch") bindWatch(d);
  if (screen === "stock") bindStock();
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
  return `<section class="card"><h2>오늘의 신호 <small>${md(s.day)} 종가 기준</small></h2>${chip}
    <p class="headline">${esc(head)}</p><p class="sub">${esc(sub)}</p>${extra}${rbLine}
    ${more("signal", "신호 자세히 보기")}</section>`;
}

// 홈 성과 카드: 가상계좌 요약 + 추천 종목이 그 뒤 얼마나 올랐는지 한 줄
function homePerfCard(d) {
  const a = d.account;
  const rb = d.rulebook && d.rulebook.account;
  const acc = a
    ? `<p class="hero">${money(market, a.equity)}</p>
      <div class="stats">
        <div class="stat"><span>가상계좌</span><b class="${sign(a.gain)}">${pct(a.gain)}</b></div>
        <div class="stat"><span>${esc(d.index_name)}</span><b class="${sign(a.index_gain)}">${pct(a.index_gain)}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${pct(a.mdd)}</b></div>
      </div>
      ${rb ? `<p class="muted" style="margin:8px 0 0">내 규칙표 계좌 <b class="${sign(rb.gain)}">${pct(rb.gain)}</b></p>` : ""}
      ${pendingLines(a)}`
    : `<p class="empty">가상계좌는 아직 첫 기록 전이에요. ${NEXT_RUN[market]} 첫 자동 실행부터 날마다 기록해요.</p>`;
  const t = d.signal && d.signal.tracked;
  const src = t && pickSrc(t);
  const s = src && t.srcs[src];
  const h = s && (s.horizons.find((x) => x.days === 10 && x.n) || s.horizons.find((x) => x.n));
  const line = h ? `<div class="track-line"><span>추천 종목 ${h.days}거래일 뒤 평균 <small>${esc(s.label)} · ${h.n}개</small></span>
      <b class="${sign(h.avg)}">${pct(h.avg)}</b><span class="muted">${esc(d.index_name)} ${pct(h.index)} · 오른 종목 ${Math.round(h.win * 100)}%</span></div>` : "";
  return `<section class="card"><h2>성과 <small>${a ? `${md(a.last_day)} 종가` : `${money(market, d.capital)}${market === "kr" ? "으로" : "로"} 시작`}</small></h2>
    ${acc}${line}${more("perf", "성과 자세히 보기")}</section>`;
}

// ---------------------------------------------------------------- 관심종목

// 종목 한 줄: 이름·코드·3개월 등락, 종가·전일 대비, ★. chart면 3개월 추세선도 (내 관심종목처럼 몇 개 안 될 때)
function stockRow(s, d, { star = true, chart = false } = {}) {
  const sig = d.signal || {};
  const badges = [];
  if ((sig.picks || []).some((p) => p.code === s.code)) badges.push(`<span class="badge good">오늘 매수 후보</span>`);
  if ((sig.rulebook || []).some((p) => p.code === s.code)) badges.push(`<span class="badge">규칙표 후보</span>`);
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

const stocksOf = (d) => (d.signal && d.signal.stocks) || [];

function watchCard(d) {
  const all = stocksOf(d);
  if (!all.length) {
    return `<section class="card"><h2>관심종목</h2><p class="empty">종목 시세가 아직 없어요. ${NEXT_RUN[market]} 자동 실행 뒤에 생겨요.</p></section>`;
  }
  const mine = WATCH[market].map((c) => all.find((s) => s.code === c)).filter(Boolean);
  return `<section class="card" id="watch-card"><h2>내 관심종목 <small>${mine.length}개 · ${md(all[0].day)} 종가</small></h2>
    ${mine.length ? `<ul class="list">${mine.map((s) => stockRow(s, d, { chart: true })).join("")}</ul>`
      : `<p class="empty">아래 전체 종목에서 ☆를 누르면 여기에 모여요.</p>`}
    <p class="muted" style="margin:10px 0 0">종목을 누르면 차트와 재무제표가 나와요. ★ 목록은 이 폰 브라우저에만 저장돼요.</p></section>`;
}

function allStocksCard(d) {
  const all = stocksOf(d);
  if (!all.length) return "";
  const what = market === "kr" ? `코스피 대형주 ${all.length}개` : `미국 대형주와 SPY ${all.length}개`;
  const sorts = [["change", "오늘 등락순"], ["name", "이름순"]].map(([k, label]) =>
    `<button type="button" data-sort="${k}" aria-pressed="${watchSort === k}">${label}</button>`).join("");
  return `<section class="card"><h2>전체 종목 <small>${what}</small></h2>
    <input class="search" type="search" placeholder="이름이나 코드로 찾기" aria-label="종목 찾기" value="${esc(watchQuery)}">
    <div class="period" role="group" aria-label="정렬" style="margin:10px 0 6px">${sorts}</div>
    <ul class="list" id="all-list">${allRows(d)}</ul></section>`;
}

function allRows(d) {
  const q = watchQuery.trim().toLowerCase();
  const rows = stocksOf(d).filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  rows.sort(watchSort === "name" ? (a, b) => a.name.localeCompare(b.name, "ko") : (a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
  return rows.length ? rows.map((s) => stockRow(s, d)).join("") : `<li><p class="empty">"${esc(watchQuery)}"에 맞는 종목이 없어요.</p></li>`;
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
        <b class="${sign(h.avg)}">${h.n ? pct(h.avg) : "-"}</b>
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
      <p class="big">${num(last)}</p>
      <p class="sub nowrap"><b class="${sign(ch)}">${pct(ch, 2)}</b> 전일 대비</p>
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
  let f;
  if (fr === "d") f = groupCandles(c, KEY.d);
  else if (fr === "w") f = dropFirst(groupCandles(c, KEY.w));  // 첫 주는 중간부터일 수 있어서 빼요
  else if (c.monthly && c.monthly.dates.length) {
    f = groupCandles(c.monthly, fr === "m" ? KEY.m : KEY.y);
    if (fr === "y" && f.first[0].slice(5, 7) !== "01") f = dropFirst(f);  // 1월부터가 아닌 첫 해는 빼요
  } else f = dropFirst(groupCandles(c, KEY[fr]));  // 월봉이 없는 예전 기록: 일봉을 묶어요
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
  return `<section class="card"><h2>오늘의 신호 <small>${md(s.day)} 종가 기준</small></h2>${chip}${body}</section>`;
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
    <p class="hero">${money(market, a.equity)}</p>
    <p class="sub"><span class="${sign(a.gain)}">${pct(a.gain)}</span> · 시작 ${money(market, a.capital)} · 현금 ${money(market, a.cash)}</p>
    <div class="stats">
      <div class="stat"><span>가상계좌</span><b class="${sign(a.gain)}">${pct(a.gain)}</b></div>
      <div class="stat"><span>${esc(d.index_name)}</span><b class="${sign(a.index_gain)}">${pct(a.index_gain)}</b></div>
      <div class="stat"><span>최대 낙폭</span><b>${pct(a.mdd)}</b></div>
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
      ? "옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그 기간의 시가·고가·저가·종가가 보여요. "
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
        <div class="stat"><span>규칙표 계좌</span><b class="${sign(a.gain)}">${pct(a.gain)}</b></div>
        <div class="stat"><span>알림 규칙 계좌</span><b class="${main ? sign(main.gain) : ""}">${main ? pct(main.gain) : "-"}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${pct(a.mdd)}</b></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${money(market, a.equity)} · 끝난 거래 ${a.trade_count}건${a.trade_count ? ` · 승률 ${Math.round(a.win_rate * 100)}%` : ""} · 보유 ${a.positions.length}종목</p>`
    : `<p class="empty">${NEXT_RUN[market]} 첫 자동 실행부터 기록해요.</p>`;
  return `<section class="card"><h2>내 규칙표 검증 <small>가상계좌</small></h2>${body}</section>`;
}

function rulesCard(d) {
  return `<section class="card"><details><summary>${esc(d.name)} 규칙 보기</summary>
    <ol>${d.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details></section>`;
}

// ---------------------------------------------------------------- 종목 화면 (차트 + 재무제표)
// 자료는 종목마다 stocks/<시장>/<코드>.json (배포 때 stock_pages.py가 만듦). 처음 열 때 받아서 앱을 닫을 때까지 기억해요.
const STOCK_FRAMES = FRAMES.filter((f) => f[0] !== "y");  // 3년치 일봉이라 년봉은 빼요
let stockFrame = "d";
let fundMode = "annual";
const STOCK_DATA = new Map();   // "kr/005930" → 받는 중인 Promise
const STOCK_READY = new Map();  // "kr/005930" → 받은 자료
let stockDrawn = null;          // 차트를 마지막으로 그린 종목 (바뀌면 보던 구간을 처음으로)

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
  const kind = market === "kr" ? "코스피" : code === "SPY" ? "미국 ETF" : "미국 주식";
  const c3 = s && s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <div class="stock-title"><div class="l"><h2 class="stock-name">${esc(name)}</h2>
      <div class="meta">${esc(code)} · ${kind}${badges.join("")}</div></div>
      <button type="button" class="star" data-star="${esc(code)}" aria-pressed="${on}"
        aria-label="${esc(name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></div>
    ${s ? `<p class="hero">${price(market, s.close)}</p>
      <p class="sub"><span class="nowrap"><b class="${sign(s.d1)}">${pct(s.d1, 2)}</b> 전일 대비</span>${c3 == null ? ""
        : ` · <span class="nowrap">3개월 <b class="${sign(c3)}">${pct(c3)}</b></span>`} · <span class="nowrap">${md(s.day)} 종가</span></p>` : ""}
  </section>`;
}

function stockChartCard() {
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  const buttons = STOCK_FRAMES.map(([key, label]) =>
    `<button type="button" data-sframe="${key}" aria-pressed="${key === stockFrame}">${label}</button>`).join("");
  return `<section class="card"><h2>차트 <small>최근 3년</small></h2>
    <div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips((x && x.candles) || { v: [1] })}
    <p class="muted" id="stock-change" style="margin:8px 0 4px"></p>${candleLegend()}
    <div class="chart candle" id="stock-chart"><p class="empty">차트를 불러오는 중이에요…</p></div>
    <p class="muted" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요.</p>${indHelp()}</section>`;
}

function bindStock() {
  const key = `${market}/${stockCode}`;
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
  if (!f) return `<h2>재무제표</h2><p class="empty">재무 자료가 아직 없어요. 매주 토요일에 받아요.</p>`;
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
    body = `<p class="muted" style="margin:12px 0 0">${stockCode === "SPY" ? "ETF라 매출·영업이익 같은 재무제표가 없어요." : "야후에 이 종목 재무제표가 없어요."}</p>`;
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
const VIEW = {};  // 차트별 보기 상태 (보이는 캔들 수, 마지막 캔들 위치)
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
    v.count = Math.max(Math.min(5, n), Math.min(n, v.count));
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
    const span = hi - lo || hi * 0.01; hi += span * 0.08; lo -= span * 0.08;
    const X = (i) => pad.l + (i - start + 0.5) * cw;
    const Y = (p) => pad.t + (1 - (p - lo) / (hi - lo)) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * (0.06 + 0.88 * f));
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
    let pickSvg = "";
    if (v.pick != null && v.pick >= start && v.pick <= endI) {
      pickSvg = `<line class="cross" x1="${X(v.pick)}" x2="${X(v.pick)}" y1="${pad.t}" y2="${bottom}"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(name)} ${(FRAMES.find((x) => x[0] === c.frame) || FRAMES[0])[1]} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath>
        <clipPath id="${clip}-p"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${bottom - pad.t + 4}"/></clipPath></defs>
      ${grid}<g clip-path="url(#${clip})">${bands}${mas}${bodies}</g>${paneSvg}${pickSvg}
      ${mark(hiI, c.h[hiI], "최고", true)}${mark(loI, c.l[loI], "최저", false)}${nowTag}${xl}</svg>
      <div class="tip" style="display:none"></div>`;
    const first = start > 0 ? c.c[start - 1] : c.o[start];
    const ch = c.c[endI] / first - 1;
    onRange(`${esc(frameLabel(c, start, "axis"))} ~ ${esc(frameLabel(c, endI, "axis"))} (${Math.round(v.count)}${UNIT[c.frame]}) `
      + `<b class="${sign(ch)}">${pct(ch)}</b> · 최고 ${fmt(c.h[hiI])} · 최저 ${fmt(c.l[loI])}`);
    if (v.pick != null && v.pick >= start && v.pick <= endI) showTip(v.pick, X(v.pick));
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
  let gesture = null, raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const scale = () => el.getBoundingClientRect().width / W;
  el.onpointerdown = (e) => {
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) gesture = { type: "tap", x0: e.clientX, y0: e.clientY, end0: v.end };
    if (pts.size === 2) {
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
    } else if (gesture.type !== "pinch") {
      const dx = e.clientX - gesture.x0;
      if (gesture.type === "tap" && Math.abs(dx) > 6) gesture.type = "pan";
      if (gesture.type === "pan") { v.end = gesture.end0 - dx / (cw * scale()); redraw(); }
    }
  };
  const up = (e) => {
    if (gesture && gesture.type === "tap" && pts.size === 1) {
      const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / scale();
      const i = Math.round(start + (px - pad.l) / cw - 0.5);
      v.pick = i >= start && i <= Math.round(v.end) && v.pick !== i ? i : null;
      if (v.pick == null) $(".tip", el).style.display = "none";
      draw();
    }
    pts.delete(e.pointerId);
    if (pts.size === 0) gesture = null;
    else if (pts.size === 1) { const [p] = [...pts.values()]; gesture = { type: "pan", x0: p.x, y0: p.y, end0: v.end }; }
  };
  el.onpointerup = up;
  el.onpointercancel = (e) => { pts.delete(e.pointerId); if (!pts.size) gesture = null; };
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
