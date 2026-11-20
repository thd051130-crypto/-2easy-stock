"use strict";
// 작은 추세선 (축 없이 모양만). 기간 처음보다 오르면 빨강, 내리면 파랑.
// zero: 추천일(0)부터의 수익률이면 0 기준선을 점선으로 그려요. 값은 세로 눈금의 최소 폭(±zero)이라
// 1%도 안 움직인 종목은 거의 평평하게, 그보다 크게 움직이면 그래프 높이를 다 써서 모양이 보여요.
function spark(values, label, zero) {
  const v = (values || []).filter((x) => x != null);
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

// 급락 점검: 기준 지수가 한 주(5거래일)에 5% 넘게 빠졌거나 1년 고점에서 10% 넘게 내려와 있을 때만 홈 '더 보기'에 떠요.
// 지수 전체 기록(indexes/<지수>.json, 차트와 같은 파일)에서 비슷하게 빠졌던 때를 찾아 그 뒤 1개월~1년이 어땠는지 보여 줘요.
// 한 번 찾으면 3개월(63거래일)은 건너뛰어서 같은 하락을 여러 번 세지 않아요. 참고용이에요.
const DROP_AFTER = [[21, "1개월"], [63, "3개월"], [126, "6개월"], [252, "1년"]];
const DROP_GAP = 63;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
function dropNow(d) {
  const sym = OWN_IDX[market];
  const r = ((DATA.world && DATA.world.groups) || []).flatMap((g) => g.items).find((x) => x.sym === sym);
  if (!r || !r.closes || r.closes.length < 6) return null;
  const cl = r.closes, last = cl[cl.length - 1];
  const w1 = last / cl[cl.length - 6] - 1, dd = last / Math.max(...cl.slice(-252)) - 1;
  if (w1 > -0.05 && dd > -0.1) return null;
  return { sym, name: r.name || d.index_name, day: r.day, last, w1, dd, weekly: w1 <= -0.05 };
}
function dropStats(c, now) {
  const cl = c.c, dates = c.dates, n = cl.length;
  // 한 주 낙폭이면 지금의 3/4 넘게 빠진 주, 아니면 1년 고점 대비 지금의 3/4 넘게 내려온 날
  const thr = (now.weekly ? now.w1 : now.dd) * 0.75;
  const hiOf = (i) => { let h = 0; for (let k = Math.max(0, i - 251); k <= i; k++) if (cl[k] > h) h = cl[k]; return h; };
  const hit = now.weekly ? (i) => cl[i - 5] > 0 && cl[i] / cl[i - 5] - 1 <= thr : (i) => cl[i] / hiOf(i) - 1 <= thr;
  const ev = [];
  for (let i = 5; i < n - DROP_GAP; i++) if (cl[i] > 0 && hit(i)) { ev.push(i); i += DROP_GAP - 1; }  // 최근 3개월은 지금 하락이라 빼요
  const after = DROP_AFTER.map(([h, label]) => {
    const r = ev.filter((i) => i + h < n).map((i) => cl[i + h] / cl[i] - 1);
    return { label, n: r.length, med: r.length ? median(r) : null, up: r.length ? r.filter((x) => x > 0).length / r.length : null,
      worst: r.length ? Math.min(...r) : null };
  });
  const lows = ev.map((i) => Math.min(...cl.slice(i + 1, i + 1 + DROP_GAP)) / cl[i] - 1);
  let hiI = Math.max(0, n - 252);
  for (let k = hiI; k < n; k++) if (cl[k] > cl[hiI]) hiI = k;
  return { thr, from: dates[0], years: ev.map((i) => dates[i].slice(0, 4)), after, low: lows.length ? median(lows) : null,
    lowWorst: lows.length ? Math.min(...lows) : null, hiDay: dates[hiI], hi: cl[hiI] };
}
function dropCard(d) {
  const now = dropNow(d);
  if (!now) return "";
  const c = IDX_READY.get(now.sym);
  const head = `<p class="headline">${esc(now.name)} ${now.weekly ? `한 주 ${pct(now.w1)}` : `1년 고점 대비 ${pct(now.dd)}`}</p>`;
  let body;
  if (c === undefined) body = `<p class="muted">과거 비슷한 하락을 찾는 중이에요…</p>`;
  else if (!c || !c.candles) body = `<p class="muted">지수 기록을 못 받았어요. 차트 화면에서 지수를 열어 보세요.</p>`;
  else {
    const s = dropStats(c.candles, now);
    const what = now.weekly ? `한 주에 ${pct(s.thr)} 넘게 빠졌던 때` : `1년 고점에서 ${pct(s.thr)} 넘게 내려왔던 때`;
    const years = [...new Set(s.years)];
    body = `<p class="sub">1년 고점(${s.hiDay.slice(2, 4)}.${md(s.hiDay)} ${num(s.hi)})보다 ${pct(now.dd)}${now.weekly ? "" : ` · 한 주 ${pct(now.w1)}`}</p>
      ${s.years.length ? `<p class="muted" style="margin:10px 0 6px">${s.from.slice(0, 4)}년 이후 ${what} <b>${s.years.length}번</b>
        <small>(${years.join(", ")})</small>. 그 뒤 ${esc(now.name)}는</p>
      <table class="fin"><thead><tr><th></th><th>보통</th><th>오른 비율</th><th>가장 나쁠 때</th></tr></thead><tbody>
        ${s.after.filter((a) => a.n).map((a) => `<tr><th>${a.label} 뒤</th><td class="${sign(a.med)}">${pct(a.med)}</td>
          <td>${Math.round(a.up * 100)}%</td><td class="${sign(a.worst)}">${pct(a.worst)}</td></tr>`).join("")}</tbody></table>
      <p class="muted" style="margin:8px 0 0">그때도 바로 멈추지 않고 3개월 안에 보통 ${pct(s.low)}, 가장 심할 땐 ${pct(s.lowWorst)}까지 더 빠진 날이 있었어요.
        '보통'은 가운데 값이에요.</p>`
        : `<p class="muted" style="margin:10px 0 0">${s.from.slice(0, 4)}년 이후 이만큼 빠진 적이 없어서 비교할 때가 없어요.</p>`}`;
  }
  return `<section class="card" id="drop-card"><h2>급락 점검 <small>${md(now.day)} 종가 · 참고</small></h2>${head}${body}
    <p class="muted note" style="margin:10px 0 0">과거에 비슷하게 빠졌던 뒤 어땠는지 지수 기록으로 센 거예요. 과거가 앞으로를 보장하진 않아요.
      바닥은 지나서야 알 수 있어요.</p></section>`;
}
function bindDrop(d) {
  const now = dropNow(d);
  if (!now || IDX_READY.has(now.sym)) return;
  idxData(now.sym).then(() => {
    const el = $("#drop-card");
    if (el && screen === "more") el.outerHTML = dropCard(d);
  });
}

// 실전 첫 계좌 체크리스트: 판정표를 통과한 뒤 진짜 돈으로 넘어가는 순서. 1번은 판정표로 자동, 나머지는 눌러서 체크(이 폰에만 저장).
// 세계 지수·환율 (world.py, 국장·미장 같이). 보기용이고 매매 규칙엔 안 써요.
// 한눈에 보기 (사용자 2026-10-24): 묶음 탭 + 3칸 타일. 타일 색이 진할수록 많이 움직인 거예요. 누르면 아래에 그래프.
// 한국·미국 지수는 탭과 상관없이 늘 맨 위에 (사용자 2026-10-24 "이전처럼 두되")
const WORLD_FIXED = ["한국", "미국"];
const WORLD_TABS = [
  ["main", "주요", ["KRW=X", "^TNX", "US10Y2Y", "CL=F", "GC=F", "^VIX"]],
  ["asia_eu", "아시아·유럽", ["아시아", "유럽"]],
  ["fx", "환율", ["환율"]],
  ["rate", "금리", ["채권 금리"]],
  ["goods", "원자재·리츠", ["원자재", "리츠·부동산"]],
  ["coin", "공포·코인", ["공포·코인"]],
];
let worldTab = "main";
try { worldTab = localStorage.getItem("world_tab") || "main"; } catch (e) { /* 처음 */ }
if (!WORLD_TABS.some((t) => t[0] === worldTab)) worldTab = "main";  // 옛 '한국·미국' 탭은 주요로
// 타일엔 짧은 이름 (그래프를 펼치면 원래 이름)
const WORLD_SHORT = {
  "^SOX": "필라 반도체", "^N225": "닛케이225", "000001.SS": "상하이", "^HSI": "항셍", "^TWII": "대만 가권",
  "^STOXX50E": "유로스톡스50", "^GDAXI": "독일 DAX", "^FTSE": "영국 FTSE", "JPYKRW=X": "원/엔(100)",
  "US2Y": "미 2년 금리", "^TNX": "미 10년 금리", "US10Y2Y": "장단기 금리 차", "KR3Y": "국고채 3년", "KR10Y": "국고채 10년",
  "TLT": "미 장기채 TLT", "CL=F": "WTI 유가", "GC=F": "금", "HG=F": "구리", "VNQ": "미 리츠 VNQ", "329200.KS": "국내 리츠",
  "^VIX": "VIX 공포", "BTC-USD": "비트코인", "DX-Y.NYB": "달러인덱스",
};
function worldValue(r, short = false) {
  const big = Math.abs(r.last) >= 10000;
  const v = r.last.toLocaleString("ko-KR", { minimumFractionDigits: big && short ? 0 : 2, maximumFractionDigits: big && short ? 0 : 2 });
  if (short) return r.kind === "rate" ? `${v}%` : v;  // 타일은 좁아서 원·달러를 빼요 (이름에 있어요)
  return r.kind === "krw" ? `${v}원` : r.kind === "rate" ? `${v}%` : r.kind === "usd" ? `${v}달러` : v;
}
// 등락: 금리는 % 대신 몇 %p 바뀌었는지 (4%→4.5%는 +0.50%p)
const worldChg = (r, v) => (r.kind === "rate" ? (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%p`) : pct(v, 2));
const worldMove = (r, c) => (r.kind === "rate" ? c[c.length - 1] - c[0] : c[c.length - 1] / c[0] - 1);
// 타일 색: 기간마다 '가장 진한 색'이 되는 움직임 (오늘 2%, 1주 4%, 1개월 8%, 1년 25%. 금리는 %p로 그 1/20)
const WORLD_FULL = { d1: 0.02, w1: 0.04, m1: 0.08, y1: 0.25 };
function worldTint(r, v) {
  if (v == null || Math.abs(v) < 1e-9) return "";
  const full = WORLD_FULL[worldP] * (r.kind === "rate" ? 5 : 1);  // 금리 0.1%p(오늘)면 가장 진해요
  const a = Math.round((Math.min(1, Math.abs(v) / full) * 0.3 + 0.05) * 100);
  return `background:color-mix(in srgb, var(${v > 0 ? "--up" : "--down"}) ${a}%, var(--surface-0))`;
}
// 줄을 누르면 바로 아래에 그 지수·환율 그래프가 펼쳐져요 (다시 누르면 접혀요). 지수는 차트 화면 캔들로도 갈 수 있어요
let worldPicks = new Set(), worldTop = null;
const WORLD_G = [["m1", "1개월", 22], ["m3", "3개월", 66], ["m6", "6개월", 130], ["y1", "1년", 0]];
let worldG = "m3";
try { worldG = localStorage.getItem("world_g") || "m3"; } catch (e) { /* 처음 */ }
if (!WORLD_G.some((p) => p[0] === worldG)) worldG = "m3";
function worldTile(r, cur) {
  const [key] = WORLD_P.find((p) => p[0] === worldP);
  const open = cur === `t:${r.sym}`, v = r[key];
  return `<button type="button" class="wt${open ? " on" : ""}" data-world="t:${esc(r.sym)}" aria-expanded="${open}" style="${worldTint(r, v)}"
    aria-label="${esc(r.name)} ${worldValue(r)} ${worldChg(r, v)}"><span class="wt-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span>
    <b class="wt-v">${worldValue(r, true)}</b><span class="wt-c ${sign(v)}">${worldChg(r, v)}</span></button>`;
}
function worldGraph(r, id = "world-chart") {
  const [, , n] = WORLD_G.find((p) => p[0] === worldG);
  const c = n ? r.closes.slice(-n) : r.closes;
  const ch = c.length > 1 ? worldMove(r, c) : null;
  const hi = Math.max(...c), lo = Math.min(...c);
  const chips = WORLD_G.map(([k, l]) => `<button type="button" data-world-g="${k}" aria-pressed="${k === worldG}">${l}</button>`).join("");
  const toChart = r.kind === "idx" ? `<button type="button" class="more" data-world-chart="${esc(r.sym)}">${esc(r.name)} 캔들 차트로 크게 보기<span aria-hidden="true">›</span></button>` : "";
  return `<div class="world-graph"><div class="wg-head"><b>${esc(r.name)}</b><span class="muted">${worldValue(r)} · ${md(r.day)} 종가</span></div>
    <div class="period" role="group" aria-label="그래프 기간">${chips}</div>
    <p class="muted" style="margin:8px 0 4px">${ch == null ? "" : `이 기간 <b class="${sign(ch)}">${worldChg(r, ch)}</b> · `}최고 ${worldValue({ ...r, last: hi })} · 최저 ${worldValue({ ...r, last: lo })}</p>
    <div class="chart" id="${id}" data-sym="${esc(r.sym)}"></div>${toChart}</div>`;
}
function drawWorldGraph() {
  document.querySelectorAll("#app .world-graph .chart[data-sym]").forEach((el) => drawWorldChart(el, el.dataset.sym));
}
function drawWorldChart(el, sym) {
  const w = DATA && DATA.world;
  if (!el || !w) return;
  const r = w.groups.flatMap((g) => g.items).find((x) => x.sym === sym);
  if (!r) return;
  const [, , n] = WORLD_G.find((p) => p[0] === worldG);
  const c = n ? r.closes.slice(-n) : r.closes;
  // 옛 자료엔 날짜가 없어서 'N일 전'으로 써요 (world 워크플로가 한 번 돌면 날짜가 생겨요)
  const dates = r.dates && r.dates.length === r.closes.length ? (n ? r.dates.slice(-n) : r.dates) : c.map((_, i) => (i === c.length - 1 ? r.day : `${c.length - 1 - i}거래일 전`));
  const digits = Math.max(...c) >= 1000 ? 0 : 2;
  lineChart(el, {
    dates,
    xfmt: (s) => (/^\d{4}-/.test(s) ? s.slice(2).replace(/-/g, ".") : s),
    series: [{ name: r.name, color: c[c.length - 1] >= c[0] ? "var(--up)" : "var(--down)", values: c }],
    fmt: (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  });
}
// 홈 맨 위 얇은 바: 한국·미국 말고 나머지 지수·환율이 3초마다 하나씩 바뀌어요. 높이는 늘 같아서 화면이 안 밀려요 (바는 따라 내려오지 않아요)
let tickAt = 0, tickTimer = 0;
function tickItems() {
  const w = DATA && DATA.world;
  if (!w || !w.groups) return [];
  const all = w.groups.flatMap((g) => g.items);
  const order = WORLD_TABS.find((t) => t[0] === "main")[2].map((s) => all.find((r) => r.sym === s)).filter(Boolean);
  return order.concat(w.groups.filter((g) => !WORLD_FIXED.includes(g.name)).flatMap((g) => g.items).filter((r) => !order.includes(r)));
}
function tickHTML(r) {
  return `<span class="wk-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span><b class="wk-v">${worldValue(r, true)}</b><span class="wk-c ${sign(r.d1)}">${worldChg(r, r.d1)}</span>`;
}
function worldTicker() {
  const list = tickItems();
  if (!list.length) return "";
  tickAt %= list.length;
  return `<button type="button" class="wtick" data-go="world" aria-label="세계 지수·환율 전체 보기">
    <span class="wk-tag">세계</span><span class="wk-item" aria-live="off">${tickHTML(list[tickAt])}</span><span class="wk-go" aria-hidden="true">›</span></button>`;
}
function spinTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const el = $(".wtick .wk-item"), list = tickItems();
    if (!el || !list.length || screen !== "home") { clearInterval(tickTimer); return; }
    if (document.hidden) return;
    tickAt = (tickAt + 1) % list.length;
    if (calm()) { el.innerHTML = tickHTML(list[tickAt]); return; }
    el.classList.add("out");
    setTimeout(() => { el.innerHTML = tickHTML(list[tickAt]); el.classList.remove("out"); }, 220);
  }, 3000);
}
// 홈엔 한국·미국 지수만 (이전처럼). 나머지는 맨 위 바를 눌러 세계 지수 화면에서
function worldHomeCard() {
  const w = DATA.world;
  if (!w || !w.groups || !w.groups.length) return "";
  const [, label] = WORLD_P.find((p) => p[0] === worldP);
  const period = `<div class="period" role="group" aria-label="등락 기간">${WORLD_P.map(([k, l]) =>
    `<button type="button" data-world-p="${k}" aria-pressed="${k === worldP}">${l}</button>`).join("")}</div>`;
  const fixed = w.groups.filter((g) => WORLD_FIXED.includes(g.name)).flatMap((g) => g.items);
  if (!fixed.length) return "";
  const pickedFixed = worldTop && fixed.find((r) => `t:${r.sym}` === worldTop);
  const up = fixed.filter((r) => r[worldP] > 0).length, down = fixed.filter((r) => r[worldP] < 0).length;
  // 장 종료 기준: 나라마다 마지막으로 장이 끝난 날의 종가예요 (장중 값은 안 써요, 사용자 2026-11-06)
  const closeDay = w.groups.filter((g) => WORLD_FIXED.includes(g.name) && g.items.length)
    .map((g) => `${esc(g.name)} ${md(g.items[0].day)}`).join(" · ");
  return `<section class="card" id="world-card"><h2>한국·미국 지수 <small>${closeDay} 종가 기준</small></h2>
    <div class="wt-bar">${period}<span class="muted">${label} <span class="up">▲${up}</span> <span class="down">▼${down}</span></span></div>
    <div class="wt-grid">${fixed.map((r) => worldTile(r, worldTop)).join("")}</div>${pickedFixed ? worldGraph(pickedFixed, "world-chart-top") : ""}
    <button type="button" class="more" data-go="world">세계 지수·환율 전체 보기<span aria-hidden="true">›</span></button></section>`;
}
// 세계 지수 화면은 따로 열리는 넓은 공간이라 색칸 대신 한 줄에 하나씩 작은 그래프로 (사용자 2026-10-24)
function worldRow(r) {
  const [key, , n, glabel] = WORLD_P.find((p) => p[0] === worldP);
  const open = worldPicks.has(`t:${r.sym}`), v = r[key];
  const c = n ? r.closes.slice(-n) : r.closes;
  const line = spark(c, `${r.name} ${glabel} 흐름`);
  return `<button type="button" class="wr${open ? " on" : ""}" data-world="t:${esc(r.sym)}" aria-expanded="${open}"
    aria-label="${esc(r.name)} ${worldValue(r)} ${worldChg(r, v)}"><span class="wr-l"><span class="wr-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span>
    <b class="wr-v">${worldValue(r)}</b></span><span class="wr-s">${line}</span><span class="wr-c ${sign(v)}">${worldChg(r, v)}</span></button>${open ? worldGraph(r, `world-chart-${r.sym.replace(/[^A-Za-z0-9]/g, "_")}`) : ""}`;
}
// 세계 지수 화면: 묶음 탭 + 줄마다 작은 그래프 (한국·미국은 홈에 있어서 여기선 탭만)
function worldCard() {
  const w = DATA.world;
  if (!w || !w.groups || !w.groups.length) return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button><p class="empty">아직 세계 지수 기록이 없어요.</p></section>`;
  const all = w.groups.flatMap((g) => g.items);
  const [, label] = WORLD_P.find((p) => p[0] === worldP);
  const [, , pick] = WORLD_TABS.find((t) => t[0] === worldTab);
  // 주요 탭은 기호 목록, 나머지는 world.py 묶음 이름
  const items = worldTab === "main" ? pick.map((s) => all.find((r) => r.sym === s)).filter(Boolean)
    : w.groups.filter((g) => pick.includes(g.name)).flatMap((g) => g.items);
  const tabs = WORLD_TABS.filter(([k, , p]) => k === "main" || w.groups.some((g) => p.includes(g.name)))
    .map(([k, l]) => `<button type="button" data-world-tab="${k}" aria-pressed="${k === worldTab}">${l}</button>`).join("");
  const period = `<div class="period" role="group" aria-label="등락 기간">${WORLD_P.map(([k, l]) =>
    `<button type="button" data-world-p="${k}" aria-pressed="${k === worldP}">${l}</button>`).join("")}</div>`;
  const up = items.filter((r) => r[worldP] > 0).length, down = items.filter((r) => r[worldP] < 0).length;
  return `<section class="card" id="world-card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <h2 class="stock-name">세계 지수·환율 <small>장 끝난 종가 기준</small></h2>
    <div class="wt-tabs" role="group" aria-label="묶음 고르기">${tabs}</div>
    <div class="wt-bar">${period}<span class="muted">${label} <span class="up">▲${up}</span> <span class="down">▼${down}</span></span></div>
    <div class="wr-list">${items.map(worldRow).join("")}</div>
    <p class="muted note" style="margin:10px 0 0">줄마다 작은 그래프는 최근 ${WORLD_P.find((p) => p[0] === worldP)[3]} 흐름이에요. 누르면 큰 그래프가 열려요. 금리는 몇 %p 바뀌었는지, 장단기 금리 차가 마이너스면 '역전'(경기 침체 앞에 자주 나왔어요), VIX는 20을 넘으면 불안이 커진 거예요. 원/달러가 오르면 원화 약세예요. 미국 2년 금리·장단기 차는 FRED, 나머지는 야후 자료이고 나라마다 마감 시간이 달라 날짜가 다를 수 있어요.</p></section>`;
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
    <p class="muted note" style="margin:10px 0 0">경고 0~1개 확장, 2~3개 둔화, 4개↑ 위축 경고. 백테스트에서 이걸로 매수를 줄여도 낙폭이 안 줄어서 규칙은 안 바꿔요.</p></section>`;
}

// 정부 정책 (policies.py, paper/policies.json을 손으로 정리 + 매일 뉴스 제목). 접힌 줄엔 제목과 영향 업종만,
// 누르면 쉬운 설명·업종별 이유·다음 일정·최근 뉴스·출처가 펼쳐져요. 참고용이고 매매 규칙엔 안 써요.
const POL_REGION = { kr: ["🇰🇷", "국내"], us: ["🇺🇸", "미국"], world: ["🌍", "세계"] };
const POL_TONE = { 1: ["good", "▲", "호재"], "-1": ["bad", "▼", "악재"], 0: ["", "◆", "엇갈림"] };
let polR = "";
try { polR = localStorage.getItem("pol_r") || ""; } catch (e) { /* 처음 */ }
const POL_OPEN = new Set();
let polJump = null;
let polMore = false;
const POL_FIRST = 5;  // 처음엔 정책 5개만, 나머지는 '더 보기'
function polPill(e) {
  const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
  return `<span class="pol-pill ${cls}" title="${esc(word)}">${mark} ${esc(e.sector)}</span>`;
}
function policyRow(p) {
  const [flag, region] = POL_REGION[p.region] || ["", ""];
  const next = p.next ? ` · ${esc(p.next_note || "다음 일정")} ${md(p.next)} <b>${dday(p.next)}</b>` : p.next_note ? ` · 지켜볼 것: ${esc(p.next_note)}` : "";
  const fx = (p.effects || []).map((e) => {
    const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
    return `<li data-sector-go="${esc(e.sector)}"><div class="l"><div class="name"><span class="badge ${cls}">${mark} ${word}</span> ${esc(e.sector)}</div>
      <div class="meta">${esc(e.why)}</div></div><div class="r meta">업종 ›</div></li>`;
  }).join("");
  const link = (u, t) => /^https:\/\//.test(u || "") ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);
  const news = (p.news || []).map((n) => `<li><div class="l"><div class="meta">📰 ${link(n.link, n.title)}${n.source ? ` · ${esc(n.source)}` : ""}${n.date ? ` · ${md(n.date)}` : ""}</div></div></li>`).join("");
  const src = (p.sources || []).map((x) => link(x.url, x.name)).join(" · ");
  return `<details class="pol" data-pol="${esc(p.id)}"${POL_OPEN.has(p.id) ? " open" : ""}><summary>
      <div class="pol-title">${flag} ${esc(p.title)}</div>
      <div class="pol-sub"><span class="badge">${esc(p.status || region)}</span> ${md(p.date)}${p.next ? ` · 다음 ${md(p.next)} ${dday(p.next)}` : ""}</div>
      <div class="pol-fx">${(p.effects || []).map((e) => polPill(e)).join("")}</div></summary>
    <div class="pol-body">
      <p class="pol-sum">${esc(p.summary)}</p>
      <p class="meta" style="margin:6px 0 0">📅 ${region} · ${esc(p.status || "")} ${p.date}${next}</p>
      ${fx ? `<h3 class="muted" style="margin:12px 0 4px">영향 받는 업종 <small>누르면 업종 칸으로</small></h3><ul class="list">${fx}</ul>` : ""}
      ${news ? `<h3 class="muted" style="margin:12px 0 4px">최근 7일 뉴스</h3><ul class="list">${news}</ul>` : ""}
      ${src ? `<p class="meta pol-src">출처: ${src}</p>` : ""}
    </div></details>`;
}
function policyCard() {
  const P = DATA && DATA.policies;
  if (!P || !P.items || !P.items.length) return "";
  if (polR && !P.items.some((p) => p.region === polR)) polR = "";
  const shown = P.items.filter((p) => !polR || p.region === polR);
  const count = (r) => P.items.filter((p) => p.region === r).length;
  const chips = `<div class="chips" role="group" aria-label="지역 고르기" style="margin-bottom:8px">
    <button type="button" data-pol-r="" aria-pressed="${!polR}">전체</button>
    ${Object.entries(POL_REGION).filter(([r]) => count(r)).map(([r, [f, n]]) => `<button type="button" data-pol-r="${r}" aria-pressed="${polR === r}">${f} ${n}</button>`).join("")}</div>`;
  // 한눈에: 지금 고른 정책들로 업종마다 호재·악재 개수를 세서 많은 순으로
  const tally = {};
  shown.forEach((p) => (p.effects || []).forEach((e) => {
    const t = tally[e.sector] || (tally[e.sector] = [0, 0]);
    if (e.tone > 0) t[0] += 1; else if (e.tone < 0) t[1] += 1;
  }));
  const rows = Object.entries(tally);
  const top = (k) => rows.filter(([, t]) => t[k] > t[1 - k]).sort((a, b) => b[1][k] - a[1][k] || a[1][1 - k] - b[1][1 - k]).slice(0, 4)
    .map(([n, t]) => `<button type="button" class="pol-pill ${k ? "bad" : "good"}" data-sector-go="${esc(n)}">${k ? "▼" : "▲"} ${esc(n)} ${t[k]}</button>`).join("");
  const good = top(0), bad = top(1);
  const glance = good || bad ? `<div class="pol-glance">
      ${good ? `<div><span class="muted">호재 많은 업종</span><div class="pol-fx">${good}</div></div>` : ""}
      ${bad ? `<div><span class="muted">악재 많은 업종</span><div class="pol-fx">${bad}</div></div>` : ""}</div>` : "";
  const stale = P.stale ? `<p class="pol-stale">⚠️ 정책 목록을 ${md(P.reviewed)} 뒤로 다시 정리하지 않았어요. 바뀐 정책이 있을 수 있어요.</p>` : "";
  return `<section class="card" id="policy-card"><h2>정부 정책 <small>${md(P.reviewed)} 정리 · 참고</small></h2>${chips}${stale}${glance}
    <div class="pol-list">${shown.slice(0, POL_FIRST).map(policyRow).join("")}</div>
    ${shown.length > POL_FIRST ? `<details id="pol-more" class="more-list"${polMore || shown.slice(POL_FIRST).some((p) => POL_OPEN.has(p.id)) ? " open" : ""}><summary class="muted">정책 ${shown.length - POL_FIRST}개 더 보기</summary>
      <div class="pol-list">${shown.slice(POL_FIRST).map(policyRow).join("")}</div></details>` : ""}
    <p class="muted note" style="margin:10px 0 0">정책을 누르면 쉬운 설명·업종별 이유·다음 일정·출처가 펼쳐져요. ▲ 호재 ▼ 악재 ◆ 엇갈림은 정책 내용으로 짐작한 거예요. 정책 목록은 손으로 정리하고, 뉴스 제목은 매일 아침 자동으로 붙어요${P.news_day ? ` (${md(P.news_day)})` : ""}. 매매 규칙은 안 바꿔요.</p></section>`;
}
// 업종 칸·종목 화면에 붙는 '관련 정부 정책' (접어서)
function sectorPolicies(name, open) {
  const P = DATA && DATA.policies;
  if (!P || !name) return "";
  const mine = (P.items || []).map((p) => [p, (p.effects || []).find((e) => e.sector === name)]).filter(([, e]) => e);
  if (!mine.length) return "";
  const rows = mine.map(([p, e]) => {
    const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
    return `<li data-pol-go="${esc(p.id)}"><div class="l"><div class="name">${(POL_REGION[p.region] || [""])[0]} ${esc(p.title)}</div>
      <div class="meta"><span class="badge ${cls}">${mark} ${word}</span> ${esc(e.why)}</div></div></li>`;
  }).join("");
  const g = mine.filter(([, e]) => e.tone > 0).length, b = mine.filter(([, e]) => e.tone < 0).length;
  return `<details class="more-list pol-sec"${open ? " open" : ""}><summary>🏛️ 관련 정부 정책 ${mine.length}개 · ▲${g} ▼${b}</summary><ul class="list">${rows}</ul></details>`;
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
    <p class="muted note" style="margin:8px 0 0">⚠️ ${term("유상증자")}·${term("전환사채")}·최대주주 변경 같은 공시는 주가가 내릴 때가 많아요. 👍 ${term("자사주 매입")}·배당은 좋은 소식일 때가 많아요. 제목을 누르면 원문이 열려요.</p></section>`;
}
function discloseHomeCard(d) {
  if (market !== "kr" || !d.disclosures) return "";
  const since = new Date(Date.parse(TODAY()) - 7 * 864e5).toISOString().slice(0, 10);
  const mine = new Set([...WATCH.kr, ...(d.extras || []).map((e) => e.code)]);
  const rows = d.disclosures.filter((x) => x.day >= since && (x.tone === "warn" || x.tone === "check" || mine.has(x.code)));
  return `<section class="card"><h2>최근 공시 <small>7일 · 주의 공시와 내 종목</small></h2>
    ${rows.length ? `<ul class="list">${rows.slice(0, 8).map((x) => disRow(x, true)).join("")}</ul>` : `<p class="empty">최근 7일 동안 주의할 공시가 없어요.</p>`}
    <p class="muted note" style="margin:8px 0 0">평일 한 시간마다 금감원 전자공시를 봐요. ⚠️ 공시는 텔레그램으로 바로 와요.</p></section>`;
}

// 큰 발표 (big_events.py): CPI·고용·FOMC처럼 지수를 크게 흔드는 발표를 홈 맨 위에 눈에 띄게.
// 앞으로 48시간 일정(예상치·이전 값), 지난 24시간 결과(실제 값·예상과 비교·선물 반응), 24시간 안의 지수 급변.
// 아무것도 없으면 칸을 안 보여 줘요. 텔레그램으로도 전날·1시간 전·발표 뒤에 와요.
// 장 상황 한 줄: 지금 열렸는지(시계로 계산), 마지막 자료가 언제 건지. 자료가 평일 2일 넘게 밀리면 경고.
// 휴장일 표는 없어서, 평일인데 오늘 자료가 없으면 "휴장이었거나 늦어요"라고만 해요.
const MKT_HOURS = { kr: ["Asia/Seoul", 9 * 60, 15 * 60 + 30, "국장", "15:30"], us: ["America/New_York", 9 * 60 + 30, 16 * 60, "미장", "한국 새벽"] };
function zoneNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), weekend: p.weekday === "Sat" || p.weekday === "Sun" };
}
function weekdaysBetween(a, b) {  // a 다음 날부터 b까지 평일 수
  let n = 0;
  for (let t = Date.parse(`${a}T00:00Z`) + 864e5; t <= Date.parse(`${b}T00:00Z`); t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w !== 6) n++; }
  return n;
}
function marketStatus(m) {
  const [tz, open, close, name, closeAt] = MKT_HOURS[m];
  const now = zoneNow(tz);
  const md0 = DATA.markets && DATA.markets[m];
  const last = md0 && md0.daily && md0.daily.day;
  let state, cls = "";
  if (now.weekend) state = "주말이라 쉬어요";
  else if (now.min < open) state = "열기 전";
  else if (now.min < close) { state = `장 열림 (${closeAt} 마감)`; cls = "mkt-open"; }
  else state = last === now.day ? "오늘 장 마감" : "오늘 장 마감 · 자료는 아직이거나 휴장";
  // 마감된 마지막 평일보다 평일로 2일 넘게 밀렸으면 자동 실행이 멈췄을 수 있어요
  const doneDay = !now.weekend && now.min >= close ? now.day : null;
  const behind = last ? weekdaysBetween(last, doneDay || now.day) - (doneDay ? 0 : 1) : null;
  const stale = behind != null && behind >= 2;
  return { name, state, cls, last, stale };
}
function marketStatusCard() {
  if (!DATA || !DATA.markets) return "";
  const rows = ["kr", "us"].filter((m) => DATA.markets[m]).map(marketStatus);
  const warn = rows.filter((r) => r.stale);
  return `<section class="card mkt-status${warn.length ? " stale" : ""}" id="mkt-status">
    ${rows.map((r) => `<div class="mkt-row"><b>${r.name}</b><span class="${r.cls}">${r.state}</span><small class="muted">${r.last ? `${md(r.last)} 종가 기준` : "자료 없음"}</small></div>`).join("")}
    ${warn.length ? `<p class="mkt-warn">⚠️ ${warn.map((r) => `${r.name} 자료가 ${md(r.last)} 거예요`).join(", ")}. 연휴가 아니면 자동 실행이 멈춘 거라, 숫자를 오늘 값으로 보지 마세요.</p>` : ""}</section>`;
}
// 오늘·내일 증시 일정 (달력 DATA.calendar와 같은 자료): 만기일·지수 정기변경·휴장·배당락·리스크·금통위,
// 그리고 위 발표 줄(events.json)에 없는 같은 시각 발표 (한국 수출입처럼). 사용자 2026-11-19 "알아서 채워두도록"
const BIG_CAL_KINDS = ["expiry", "index", "holiday", "divday", "risk", "rate", "big"];
function bigCalRows(ev) {
  const today = TODAY(), tmr = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
  const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
  const shown = new Set(ev.map((e) => { const k = kst(e.at); return `${k.slice(0, 10)} ${k.slice(11, 16)}`; }));
  return ((DATA && DATA.calendar) || []).filter((e) => (e.date === today || e.date === tmr) && BIG_CAL_KINDS.includes(e.kind)
    && !(e.kind === "rate" && e.market === "us")  // FOMC는 위 발표 줄에 시각까지 있어요
    && !(e.kind === "big" && shown.has(`${e.date} ${((e.note || "").match(/\d\d:\d\d/) || [""])[0]}`)));
}
function bigCalHtml(cal) {
  if (!cal.length) return "";
  const today = TODAY(), flag = { kr: "🇰🇷", us: "🇺🇸", world: "🌐" };
  return ["오늘", "내일"].map((lab, i) => {
    const day = i ? new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10) : today;
    const xs = cal.filter((e) => e.date === day);
    if (!xs.length) return "";
    return `<li class="big-row big-cal${xs.some((e) => e.big) ? " tier1" : ""}"><div class="big-when"><b>${md(day)} 증시 일정</b> <span class="pill">${lab}</span></div>
      ${xs.map((e) => `<div class="big-item"><div class="name">${e.kind === "big" && !e.big ? "📌" : CAL_ICON[e.kind] || ""} ${flag[e.market] || ""} ${esc(e.title)}</div>${e.note ? `<div class="meta">${esc(e.note)}</div>` : ""}</div>`).join("")}</li>`;
  }).join("");
}
function bigEventsCard() {
  const data = (DATA && DATA.events) || {};
  const now = Date.now(), H = 3600e3;
  const ev = (data.events || []).filter((e) => { const t = Date.parse(e.at); return t > now - 24 * H && t < now + 48 * H; });
  const shocks = (data.shocks || []).filter((x) => Date.parse(x.at) > now - 24 * H);
  const cal = bigCalRows(ev);
  if (!ev.length && !shocks.length && !cal.length) return "";
  const days = "일월화수목금토";
  const when = (iso) => { const k = new Date(Date.parse(iso) + 9 * H); return `${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")}(${days[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; };
  // 하루 넘게 남으면 한국 날짜로 세요 (달력 D-n과 같게: 일요일 밤 → 화요일 새벽은 '2일 뒤')
  const kday = (t) => Math.floor((t + 9 * H) / 864e5);
  const left = (iso) => { const t = Date.parse(iso), m = Math.round((t - now) / 60e3); return m <= 0 ? "발표됨" : m < 60 ? `${m}분 뒤` : m < 24 * 60 ? `${Math.floor(m / 60)}시간 뒤` : `${kday(t) - kday(now)}일 뒤`; };
  const num = (t) => { const m = /^\s*([-+]?\d+(?:\.\d+)?)/.exec(t || ""); return m ? parseFloat(m[1]) : null; };
  const vs = (e) => {
    const a = num(e.actual), f = num(e.forecast);
    if (a === null || f === null) return "";
    const dec = ((e.forecast || "").split(".")[1] || "").replace(/[^0-9]/g, "").length;
    if (Math.abs(a - f) < Math.pow(10, -dec) / 2 + 1e-9) return `<span class="muted">예상과 같음</span>`;
    return a > f ? `<b class="big-hot">예상보다 높음</b>` : `<b class="big-cold">예상보다 낮음</b>`;
  };
  const groups = [];
  ev.forEach((e) => { const g = groups.find((x) => x.at === e.at); g ? g.items.push(e) : groups.push({ at: e.at, items: [e] }); });
  const rows = groups.map((g) => {
    const done = Date.parse(g.at) <= now, tier = g.items.some((e) => e.tier1);
    // 달력과 같은 등급 표시: 🚨 지수를 크게 흔드는 발표(1급), 📌 그 밖의 발표
    const mark = tier ? "🚨" : "📌";
    const items = g.items.map((e) => {
      const bits = [e.actual && done ? `실제 <b>${esc(e.actual)}</b>` : "", e.forecast ? `예상 ${esc(e.forecast)}` : "", e.previous ? `이전 ${esc(e.previous)}` : ""].filter(Boolean).join(" · ");
      return `<div class="big-item"><div class="name">${mark} ${esc(e.flag || "")} ${esc(e.ko)}</div>${bits ? `<div class="meta">${bits} ${done && e.actual ? vs(e) : ""}</div>` : ""}</div>`;
    }).join("");
    const g0 = g.items.find((e) => e.react && e.react.length) || {};
    const news = (g.items.find((e) => e.news && e.news.length) || {}).news || [];
    const extra = done ? `${g0.react ? `<div class="meta">📈 발표 뒤 ${g0.react.map(esc).join(" · ")}</div>` : ""}
      ${news.slice(0, 2).map((n) => `<div class="meta">📰 ${esc(n.title)} <span class="muted">${esc(n.source || "")}</span></div>`).join("")}` : "";
    return `<li class="big-row${tier ? " tier1" : ""}${done ? " done" : ""}"><div class="big-when"><b>${when(g.at)}</b> <span class="pill">${left(g.at)}</span></div>${items}${extra}</li>`;
  }).join("");
  const shockRows = shocks.map((x) => `<li class="big-row tier1"><div class="big-when"><b>⚡ ${when(x.at)}</b> <span class="pill">지수 급변</span></div>
      <div class="big-item"><div class="name">${esc(x.label)} 1시간 <span class="${x.move > 0 ? "up" : "down"}">${pct(x.move)}</span></div></div>
      ${(x.news || []).slice(0, 2).map((n) => `<div class="meta">📰 ${esc(n.title)} <span class="muted">${esc(n.source || "")}</span></div>`).join("")}</li>`).join("");
  return `<section class="card big-card" id="big-card"><h2>🚨 큰 발표·지수 급변 <small>한국시간 · 참고</small></h2>
    <ul class="list big-list">${shockRows}${rows}${bigCalHtml(cal)}</ul>
    <p class="muted note" style="margin:10px 0 0">🚨 물가(CPI)·고용·금리 결정처럼 지수를 크게 흔드는 발표, 📌 그 밖의 발표예요 (다가오는 일정 달력과 같은 기준). 만기일·지수 정기변경·휴장 같은 오늘·내일 증시 일정도 달력에서 같이 보여 줘요. 텔레그램으로 전날, 1시간 전, 발표 뒤 결과까지 와요.
      실제 값은 FRED(미국 연준 무료 자료)에서 계산해서 공식 발표와 소수 둘째 자리가 다를 수 있어요. 매매 규칙은 그대로예요.</p></section>`;
}

// 다가오는 일정 (econ_calendar.py): 경제 일정(큰 발표·금리 결정·만기일·실적 시즌)과 종목 실적·배당 발표를 두 칸으로 나눠요 (사용자 요청 2026-10-17).
// 실적·배당 칸은 내 관심종목(★)·텔레그램으로 넣은 종목만, 나머지 대형주 실적은 개수만.
const CAL_DAYS = 14;
const EARN_DAYS = 30;  // 실적·배당은 한 달 치
const CAL_ICON = { big: "🚨", rate: "🏦", expiry: "⏳", season: "📊", earn: "📢", exdiv: "💰", risk: "⚠️", index: "⚖️", holiday: "🛑", divday: "💰" };
const STOCK_KINDS = ["earn", "exdiv"];
let calAll = false;
const calMine = (e) => e.mine || (e.code && WATCH[e.market] && WATCH[e.market].includes(e.code));
function calNear(days) {
  const ev = (DATA && DATA.calendar) || [];
  const today = TODAY(), end = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  return ev.filter((e) => e.date >= today && e.date < end);
}
function calRows(list) {
  const flag = { kr: "🇰🇷", us: "🇺🇸", world: "🌐" }, days = "일월화수목금토";
  let last = "";
  return list.map((e) => {
    const head = e.date !== last ? `<li class="cal-day${e.date < TODAY() ? " past" : ""}"><b>${md(e.date)} (${days[new Date(e.date + "T00:00:00").getDay()]})</b> <span class="muted">${dday(e.date)}</span></li>` : "";
    last = e.date;
    const tap = e.code && e.market === market ? ` data-stock="${esc(e.code)}"` : "";
    const help = { rate: e.market === "us" ? "FOMC" : "금통위", expiry: e.big ? "네 마녀의 날" : "옵션 만기", season: "실적 시즌", exdiv: "배당락", divday: "배당락", index: "지수 정기변경" }[e.kind];
    const cls = [e.big ? "cal-big" : "", e.kind === "risk" ? "cal-risk" : "", e.date < TODAY() ? "past" : ""].filter(Boolean).join(" ");
    return `${head}<li${tap}${cls ? ` class="${cls}"` : ""}><div class="l"><div class="name">${e.kind === "big" && !e.big ? "📌" : CAL_ICON[e.kind] || ""} ${flag[e.market] || ""} ${help ? term(help, esc(e.title)) : esc(e.title)}${calMine(e) ? " ⭐" : ""}</div>
      ${e.note ? `<div class="meta">${esc(e.note)}</div>` : ""}</div></li>`;
  }).join("");
}
// 다가오는 일정 달력: 일정이 있는 모든 달(작년 1월~내년 12월). 지난달~5개월 뒤 버튼은 눈에 띄게.
// 칸엔 일정 표시, 아래엔 그달(또는 고른 날) 목록. 지난 일정은 연하게
const ECON_NEAR = 6;
let econMonth = null, econPick = null;
// 달력 칸 하나에 같이 보여 줄 날: 금요일 칸 = 그 주말까지, 달 첫날이 주말이면 첫 월요일 칸에 그 주말 (같은 달 안에서만).
// 전에는 금요일 + 1·2일을 글자로 붙여서 달 첫 주말(예: 토요일 1일 한국 수출입 동향)이 어느 칸에도 안 보였어요 (2026-11-20)
function ecWeek(key) {
  const t = Date.parse(`${key}T00:00:00Z`), wd = new Date(t).getUTCDay(), dd = Number(key.slice(8));
  const ks = wd === 5 ? [0, 1, 2] : wd === 1 && dd <= 3 ? [-2, -1, 0] : [0];
  return ks.map((k) => new Date(t + k * 864e5).toISOString().slice(0, 10)).filter((k) => k.slice(0, 7) === key.slice(0, 7));
}
const ymAdd = (ym, k) => { const [y, m] = ym.split("-").map(Number), t = new Date(Date.UTC(y, m - 1 + k, 1)); return t.toISOString().slice(0, 7); };
function calendarCard() {
  const all = ((DATA && DATA.calendar) || []).filter((e) => !STOCK_KINDS.includes(e.kind));
  if (!((DATA && DATA.calendar) || []).length) return "";
  const today = TODAY(), now = today.slice(0, 7), nearLo = ymAdd(now, -1), nearHi = ymAdd(now, ECON_NEAR - 1);
  const ms = all.map((e) => e.date.slice(0, 7));
  const lo = [nearLo, ...ms].reduce((a, b) => (b < a ? b : a)), hi = [nearHi, ...ms].reduce((a, b) => (b > a ? b : a));
  if (!econMonth || econMonth < lo || econMonth > hi) econMonth = now;
  const [y, m] = econMonth.split("-").map(Number);
  const byDay = {};
  all.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const icon = (e) => (e.kind === "big" && !e.big ? "📌" : CAL_ICON[e.kind] || "•");
  // 월~금 다섯 칸 (주말 일정은 거의 없어서 금요일 칸에 같이 보여 줘요)
  const first = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = "";
  const lead = (first.getUTCDay() + 6) % 7;
  if (lead < 5) cells += `<span class="cal-cell blank"></span>`.repeat(lead);
  for (let dd = 1; dd <= dim; dd++) {
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const key = `${econMonth}-${String(dd).padStart(2, "0")}`;
    const wk = ecWeek(key);
    const ev = wk.flatMap((k) => byDay[k] || []);
    const marks = [...new Set(ev.map(icon))].slice(0, 3).join("");
    const cls = ["cal-cell", "ec-cell", key < today ? "past" : "", key === today ? "today" : "", ev.some((e) => e.big) ? "big" : "", econPick === key ? "picked" : ""].filter(Boolean).join(" ");
    cells += `<button type="button" class="${cls}" data-ecday="${key}" aria-label="${m}월 ${dd}일 ${ev.length ? ev.map((e) => e.title).join(", ") : "일정 없음"}">
      <span class="cd">${dd}</span><span class="em">${marks}</span></button>`;
  }
  const months = [];
  for (let key = lo; key <= hi; key = ymAdd(key, 1)) {
    const n = all.filter((e) => e.date.startsWith(key)).length, near = key >= nearLo && key <= nearHi;
    const cls = ["cal-m", key === econMonth ? "on" : "", near ? "near" : key < now ? "past" : "", key === now ? "now" : ""].filter(Boolean).join(" ");
    const lab = key.endsWith("-01") || key === lo ? `<i>${key.slice(2, 4)}년</i>` : "";
    months.push(`<button type="button" class="${cls}" data-ecm="${key}"><span>${lab}${Number(key.slice(5))}월</span><b>${n ? `${n}개` : "-"}</b></button>`);
  }
  const pick = econPick && econPick.startsWith(econMonth) ? econPick : null;
  // 금요일을 누르면 그 주말 일정도 같이
  const pickDays = pick ? ecWeek(pick) : null;
  const pickList = all.filter((e) => (pickDays ? pickDays.includes(e.date) : e.date.startsWith(econMonth)));
  const rows = calRows(pickList);
  return `<section class="card" id="cal-card"><h2>다가오는 일정 <small>${Number(lo.slice(0, 4))}~${Number(hi.slice(0, 4))}년 · 경제 일정</small></h2>
    <div class="ec-months" aria-label="달 고르기">${months.join("")}</div>
    <div class="ec-pin"><div class="cal-head"><button type="button" class="cal-nav" data-ecstep="-1" aria-label="이전 달" ${econMonth <= lo ? "disabled" : ""}>‹</button>
      <div><b>${y}년 ${m}월</b><small>${pick ? `${Number(pick.slice(5, 7))}.${Number(pick.slice(8))} 일정 · 다시 누르면 한 달 전체` : `일정 ${all.filter((e) => e.date.startsWith(econMonth)).length}개 · 날짜를 누르면 그날만`}</small></div>
      <button type="button" class="cal-nav" data-ecstep="1" aria-label="다음 달" ${econMonth >= hi ? "disabled" : ""}>›</button></div>
    <div class="cal-grid"><span class="cal-w">월</span><span class="cal-w">화</span><span class="cal-w">수</span><span class="cal-w">목</span><span class="cal-w">금</span>${cells}</div></div>
    <div class="ec-list">${rows ? `<ul class="list cal">${rows}</ul>` : `<p class="empty">${pick ? "이날은 큰 일정이 없어요." : "이달엔 큰 일정이 없어요."}</p>`}</div>
    <p class="muted note" style="margin:10px 0 0">🚨 물가(CPI)·고용·PCE·GDP처럼 지수를 크게 흔드는 미국 발표와 네 마녀의 날·MSCI 정기변경, 📌 PPI·소매판매·ISM·FOMC 회의록·한국 수출입, 🏦 금리 결정, ⏳ 만기일, ⚖️ 지수 정기변경(코스피200·MSCI·S&P 500·러셀), 🛑 휴장·조기 폐장, 💰 연말 배당락, ⚠️ ELS 대량 만기 같은 리스크 일정이에요 (한국시간). 지난 일정은 연하게 보여요.
      위 달 버튼은 옆으로 밀면 작년·내년도 볼 수 있고, 지난달~5개월 뒤는 파랗게 표시돼요. 미국 발표·FOMC 날짜는 올라온 해까지만 있어서 먼 달은 비어 있을 수 있어요. 종목 실적·배당 발표는 바로 아래 칸에 따로 있어요.</p></section>`;
}
// 일정 화면: 달력(월 제목 + 칸)은 위 막대 바로 아래에 멈춰 있고, 그 아래 일정 목록만 움직여요 (사용자 2026-10-24, 이 화면만 sticky 예외)
// 목록 칸은 최소 '남은 화면 높이'라서 날짜를 눌러 목록이 짧아져도 달력이 멈춘 자리 그대로예요
const ecStuck = () => {
  const pin = $("#app .ec-pin");
  return pin && pin.previousElementSibling ? pin.previousElementSibling.getBoundingClientRect().bottom < pin.getBoundingClientRect().top - 1 : false;
};
function pinEcon() {
  const pin = $("#app .ec-pin"), list = $("#app .ec-list");
  if (!pin || !list) return;
  const top = $(".top"), nav = $(".nav"), topH = top ? top.offsetHeight : 0;
  pin.style.top = `${topH}px`;
  list.style.minHeight = `${Math.max(0, window.innerHeight - topH - pin.offsetHeight - (nav ? nav.offsetHeight : 0))}px`;
}
window.addEventListener("resize", pinEcon, { passive: true });
// 달력이 멈춘 채로 날짜·달을 바꾸면 새 목록의 맨 위부터 보여요. 아니면 보통처럼 화면 그대로
function renderEcon() {
  const stuck = ecStuck();
  render();
  if (!stuck) return;
  lastTap = null;
  const pin = $("#app .ec-pin"), list = $("#app .ec-list");
  if (pin && list) window.scrollTo(0, window.scrollY + list.getBoundingClientRect().top - pin.getBoundingClientRect().bottom);
}
function earningsCard() {
  if (!((DATA && DATA.calendar) || []).length) return "";
  const near = calNear(EARN_DAYS).filter((e) => STOCK_KINDS.includes(e.kind));
  const shown = near.filter((e) => calMine(e) || (calAll && e.kind === "earn"));
  const hidden = near.filter((e) => e.kind === "earn" && !calMine(e)).length;
  const rows = calRows(shown);
  const more = hidden ? `<button type="button" class="more" data-cal-all>${calAll ? "관심종목 실적만 보기" : `대형주 실적 발표 ${hidden}건 더 보기`}<span aria-hidden="true">›</span></button>` : "";
  return `<section class="card" id="earn-card"><h2>실적·배당 발표 <small>${EARN_DAYS}일 · 국장·미장</small></h2>
    ${rows ? `<ul class="list cal">${rows}</ul>` : `<p class="empty">앞으로 ${EARN_DAYS}일 동안 내 종목 실적·배당 일정이 없어요.</p>`}${more}
    <p class="muted note" style="margin:10px 0 0">📢 실적 발표, 💰 배당락이에요. ⭐는 내 관심종목이에요. 종목을 누르면 종목 화면으로 가요.</p></section>`;
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
// 네모 안을 넓이(무게)대로 나눠요 (squarified treemap). 결과는 0~100 비율
function squarify(items, x, y, w, h) {
  const out = [], total = items.reduce((a, it) => a + it.wt, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = items.map((it) => ({ it, a: it.wt * scale }));
  const worst = (row, side) => {
    const sum = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
    rest = rest.slice(i);
    const sum = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) {  // 왼쪽에 세로 줄
      const cw = rest.length ? sum / h : w;
      let cy = y;
      row.forEach((r, j) => { const ch = j === row.length - 1 ? y + h - cy : r.a / cw; out.push({ it: r.it, x, y: cy, w: cw, h: ch }); cy += ch; });
      x += cw; w -= cw;
    } else {       // 위에 가로 줄
      const ch = rest.length ? sum / w : h;
      let cx = x;
      row.forEach((r, j) => { const cw = j === row.length - 1 ? x + w - cx : r.a / ch; out.push({ it: r.it, x: cx, y, w: cw, h: ch }); cx += cw; });
      y += ch; h -= ch;
    }
  }
  return out;
}
function heatmapCard(d) {
  const all = stocksOf(d).filter((s) => !s.extra && s.close != null);
  if (all.length < 5) return "";
  if (!HEAT_P.some((x) => x[0] === heatP)) heatP = "d1";
  const funds = d.funds || {}, of = (d.daily && d.daily.sector_of) || {};
  const groups = new Map();
  all.forEach((s) => {
    const g = of[s.code] || (s.code === "SPY" ? "ETF" : "기타");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ s, cap: (funds[s.code] || {}).cap || 0, r: heatRet(s, heatP) });
  });
  // 크기: 시가총액을 조금 눌러서(0.6제곱) 작은 회사도 칸이 보이게
  const caps = all.map((s) => (funds[s.code] || {}).cap || 0).filter((c) => c > 0);
  const small = caps.length ? Math.min(...caps) : 1;
  groups.forEach((list) => list.forEach((x) => { x.wt = Math.pow((x.cap || small) / small, 0.6); }));
  const glist = [...groups.entries()].map(([g, list]) => {
    list.sort((a, b) => b.wt - a.wt);
    const avg = list.filter((x) => x.r != null);
    return { g, list, wt: list.reduce((a, x) => a + x.wt, 0), m: avg.length ? avg.reduce((a, x) => a + x.r, 0) / avg.length : null };
  }).sort((a, b) => b.wt - a.wt);
  const scale = heatP === "d1" ? 0.03 : heatP === "r5" ? 0.07 : 0.15;  // 이만큼 움직이면 가장 진한 색
  const P = (v) => `${+v.toFixed(3)}%`;
  const tile = ({ it: { s, r }, x, y, w, h }, gw, gh) => {
    const k = r == null ? 0 : Math.min(1, Math.abs(r) / scale), mix = Math.round(15 + k * 75);
    const flat = r == null || Math.abs(r) < 0.0005;
    const bg = flat ? "var(--surface-0)" : `color-mix(in srgb, var(${r > 0 ? "--up" : "--down"}) ${mix}%, var(--surface-0))`;
    const aw = (w * gw) / 100, ah = (h * gh) / 100;  // 전체 네모 기준 크기(%)
    const fs = Math.max(2.1, Math.min(3.6, Math.sqrt(aw * ah) / 4.6, aw / 3.6));  // 좁은 칸은 글자도 작게
    const fit = aw >= 7 && ah >= 4.5, two = fit && ah >= fs * 2.6;
    return `<button type="button" class="heat-tile${!flat && mix > 55 ? " strong" : ""}" style="left:${P(x)};top:${P(y)};width:${P(w)};height:${P(h)};background:${bg};font-size:${fs.toFixed(2)}cqw"
      data-stock="${esc(s.code)}" aria-label="${esc(s.name)} ${r == null ? "자료 없음" : pct(r)}">${fit ? `<span>${esc(s.name)}</span>` : ""}${two ? `<b>${r == null ? "-" : pct(r)}</b>` : ""}</button>`;
  };
  const HEAD = 4.4;  // 업종 이름 줄 높이(전체 네모 기준 %)
  const boxes = squarify(glist, 0, 0, 100, 100).map(({ it: G, x, y, w, h }) => {
    const head = w >= 16 && h >= 14;
    const hd = head ? (HEAD / h) * 100 : 0;
    const tiles = squarify(G.list, 0, hd, 100, 100 - hd).map((t) => tile(t, w, h)).join("");
    return `<div class="heat-grp" style="left:${P(x)};top:${P(y)};width:${P(w)};height:${P(h)}" title="${esc(G.g)}">
      ${head ? `<div class="heat-head" style="height:${P(hd)}"><span>${esc(G.g)}</span><b class="${sign(G.m)}">${G.m == null ? "" : pct(G.m)}</b></div>` : ""}${tiles}</div>`;
  }).join("");
  const chips = HEAT_P.map(([k, label]) => `<button type="button" data-heat="${k}" aria-pressed="${k === heatP}">${label}</button>`).join("");
  return `<section class="card" id="heat-card"><h2>시장 ${term("히트맵")} <small>${all.length}개 대형주 · ${md(all[0].day)}</small></h2>
    <div class="period" role="group" aria-label="기간" style="margin:4px 0 10px">${chips}</div><div class="heat-box">${boxes}</div>
    <p class="muted note" style="margin:10px 0 0">칸이 클수록 시가총액이 크고, 진할수록 많이 움직였어요. 굵은 선은 업종 경계예요. 작은 칸도 누르면 종목 화면이에요.</p></section>`;
}

function sectorsCard(d) {
  const secs = d.daily && d.daily.sectors;
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
      ${sectorPolicies(s.name, true)}
      ${news ? `<h3 class="muted" style="margin:12px 0 4px">최근 7일 뉴스 제목 · 호재 ${s.good} · 악재 ${s.bad}</h3><ul class="list">${news}</ul>`
        : `<p class="empty">최근 7일 뉴스 제목을 못 받았어요.</p>`}
      ${members ? `<h3 class="muted" style="margin:12px 0 4px">이 업종 대형주</h3><ul class="list">${members}</ul>` : ""}`;
  }
  return `<section class="card" id="sectors-card"><h2>업종별 호재·악재 <small>최근 5거래일 · 참고</small></h2>${chips}${body}
    <p class="muted note" style="margin:10px 0 0">호재·악재는 뉴스 제목 낱말로 짐작한 거예요. 고른 업종은 관심 화면 전체 종목에도 똑같이 걸려요.</p>
    <button type="button" class="more" data-map="">산업 연관 지도 (어떤 산업끼리 이어져 있나)<span aria-hidden="true">›</span></button></section>`;
}

// 많이 오른·내린 종목과 추정 이유 (movers.py). 예전 기록엔 없을 수 있어요.
function moversCard(d) {
  const mv = d.daily && d.daily.movers;
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
    <p class="muted note" style="margin:10px 0 0">이유는 시장·같이 움직인 종목·거래량·뉴스 제목으로 짐작한 거예요. 사기 전에 기사 원문을 확인하세요.</p></section>`;
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
    <p class="muted note" style="margin:10px 0 0">금액은 순매수 주식 수 × 그날 종가로 어림한 값이에요. 큰손이 판다고 꼭 내리는 건 아니라서 매매 규칙은 안 바꿨어요.</p></section>`;
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
    ${m.hold == null ? "" : `<p class="sub" style="margin:10px 0 0">${term("외국인 보유율")} <b>${m.hold.toFixed(2)}%</b>${m.hold_chg == null ? "" : ` (20일 전보다 <b class="${sign(m.hold_chg)}">${m.hold_chg > 0 ? "+" : ""}${m.hold_chg.toFixed(2)}%p</b>)`}</p>`}
    <div class="legend" style="margin:10px 0 0"><span class="key"><i class="sw flow-frg"></i>외국인</span><span class="key"><i class="sw flow-inst"></i>기관</span></div>
    ${flowBars(x)}
    <p class="muted note" style="margin:8px 0 0">하루 ${term("순매수")} 주식 수 막대예요. 금액은 주식 수 × 그날 종가로 어림했어요. 네이버 증권 무료 자료예요.</p>`;
}

// 주가는 그대로인데 거래량만 크게 늘어난 종목 (quiet_volume.py). 예전 기록엔 없을 수 있어요.
function quietVolumeCard(d) {
  const q = d.daily && d.daily.quiet_volume;
  if (!q) return "";
  const rows = (q.rows || []).map((r) => `<li data-stock="${esc(r.code)}"><div class="l"><div class="name">${esc(r.name)}</div>
      <div class="meta">거래량 평소의 ${r.ratio.toFixed(1)}배 · 가장 많은 날 ${r.peak.toFixed(1)}배${r.r20 == null ? "" : ` · 20일 ${pct(r.r20)}`}</div></div>
      <div class="r ${sign(r.r5)}">${pct(r.r5)}<div class="meta">5일 주가</div></div></li>`).join("");
  const more = q.total > (q.rows || []).length ? `<p class="muted" style="margin:6px 0 0">외 ${q.total - q.rows.length}개</p>` : "";
  return `<section class="card"><h2>주가 그대로·거래량 급증 <small>최근 ${q.days}거래일 · ${q.count}개 종목 중</small></h2>
    ${rows ? `<ul class="list">${rows}</ul>${more}` : `<p class="empty">오늘은 조건에 맞는 종목이 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">주가는 ±${Math.round(q.max_move * 100)}% 안인데 거래량이 평소(${q.base}일 평균)의 ${q.min_ratio}배 이상인 종목이에요.
      조용히 사 모으는 중인지 팔아 넘기는 중인지는 숫자만으론 몰라요. 참고용이고 매매 규칙은 안 바꿔요.</p></section>`;
}
