"use strict";
// 지수 추세: 고른 캔들 기간(일봉·주봉·월봉·년봉)으로 그려요.
// 캔들 데이터가 있으면 캔들 차트, 없으면(예전 기록) 최근 1년 종가 선 그래프
function drawTrend(d, reset) {
  const r = d.daily ? chartIdx(d) : null;
  if (r && r.sym !== OWN_IDX[market]) { drawOtherIndex(r, reset); return; }
  const c = d.daily && d.daily.candles;
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
// 이동평균선(N일선)은 각 캔들 기간 마지막 거래일의 값이에요 (일봉이 있는 최근 몇 년만, 년봉엔 안 그려요).
// 캔들만 묶어요 (보조지표 없이). 비교 차트는 이것만 써요.
function frameBase(c, fr) {
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
  return f;
}
function frameCandles(c, fr) {
  const f = frameBase(c, fr);
  const lastDay = new Map();
  c.dates.forEach((dt, i) => lastDay.set(KEY[fr](dt), i));
  const pick = (vals) => f.keys.map((k) => (fr === "y" || !lastDay.has(k) ? null : vals[lastDay.get(k)]));
  // 켜 둔 이동평균선만 계산해요 (기간은 일 단위라 주봉·월봉에서도 N일선 그대로)
  const mas = MA_SET.map((m, i) => ({ ...m, color: MA_COLORS[i], cls: `ma${i + 1}` }))
    .filter((m) => m.on).map((m) => ({ ...m, vals: pick(smaOf(c.c, m.p)) }));
  return withIndicators({ ...f, mas, frame: fr });
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
// RSI: 서버 계산(marketdata.rsi)과 같은 방식 (오른 폭·내린 폭의 지수평균, 1/n씩 반영)
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
  const s = d.daily && d.daily.series;
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

// 비교 차트 (TradingView·토스처럼): 지수·종목을 최대 8개까지 같은 출발점(0%)에서 겹쳐 그려요.
// 지수 차트처럼 일봉·주봉·월봉·년봉, 옆으로 밀기·확대·축소, 길게 눌러 세부정보 (보조지표는 없어요). 화면에 보이는 첫날이 늘 0%예요.
// 항목 키: "i:^KS11"(지수) / "s:kr:005930"·"s:us:AAPL"(국장·미장 아무 종목). 옛 "s:005930"은 지금 시장 종목이에요. 시장마다 따로 기억해요.
const cmpColor = (i) => savColor(i);
const CMP_MAX = 8;
// 처음 보이는 길이: 일봉 1년, 주봉 5년, 월봉 20년, 년봉 전체 (지수 차트보다 길게. 더 길게는 밀거나 오므리거나 '처음부터')
const COMPARE = { kr: null, us: null };
let cmpF = "d";        // 일봉·주봉·월봉·년봉
let cmpLine = false;   // false면 캔들, true면 선
let cmpQuery = "";
let cmpDrawn = null;   // 마지막으로 그린 항목·기간 (바뀌면 보던 구간을 처음으로)
let cmpIdxOpen = false; // '지수 바로 넣기'를 펼쳐 뒀는지 (하나 넣어도 안 닫혀요)
try {
  Object.assign(COMPARE, JSON.parse(localStorage.getItem("compare") || "{}"));
  cmpF = localStorage.getItem("cmp_f") || "d"; cmpLine = localStorage.getItem("cmp_line") === "1";
} catch (e) { /* 처음 */ }
function cmpItems(d) {
  if (!COMPARE[market]) {
    const first = WATCH[market][0] || (stocksOf(d)[0] || {}).code;
    COMPARE[market] = [`i:${OWN_IDX[market]}`].concat(first ? [`s:${market}:${first}`] : []);
  }
  return COMPARE[market];
}
// 종목 키 → [시장, 코드]
function cmpStock(key) {
  const id = key.slice(2), m = /^(kr|us):(.+)$/.exec(id);
  return m ? [m[1], m[2]] : [market, id];
}
function cmpName(d, key) {
  if (key[0] === "i") { const id = key.slice(2); return (chartIndexes(d).find((r) => r.sym === id) || { name: id }).name; }
  const [m, code] = cmpStock(key);
  const s = m === market && stocksOf(d).find((x) => x.code === code);
  if (s) return s.name;
  const e = (SYM[m] || []).find((x) => x.row[0] === code), x = STOCK_READY.get(`${m}/${code}`);
  return (e && e.row[1]) || (x && x.name) || code;
}
const cmpHas = (items, m, code) => items.some((k) => k[0] === "s" && cmpStock(k).join(":") === `${m}:${code}`);
// 지수·종목 일봉 (종목 화면·지수 버튼과 같은 파일)
const cmpLoad = (key) => (key[0] === "i" ? idxData(key.slice(2)) : stockData(...cmpStock(key)));
const cmpReady = (key) => (key[0] === "i" ? IDX_READY.get(key.slice(2)) : STOCK_READY.get(cmpStock(key).join("/")));
// 검색 결과: 지수 이름 + 국장·미장 전 종목 (계산기·검색 화면과 같은 방식). 비어 있으면 관심종목·지수 바로 넣기 버튼.
function cmpResults(d) {
  const items = cmpItems(d), q = cmpQuery.trim();
  if (items.length >= CMP_MAX) return `<p class="muted" style="margin:8px 0 0">${CMP_MAX}개가 다 찼어요. 위에서 ×로 하나 빼면 더 넣을 수 있어요.</p>`;
  const btn = (k, label) => `<button type="button" data-cmp-add="${esc(k)}">+ ${esc(label)}</button>`;
  if (!q) {
    const watch = WATCH[market].filter((c) => !cmpHas(items, market, c)).map((c) => btn(`s:${market}:${c}`, cmpName(d, `s:${market}:${c}`))).join("");
    const idx = chartIndexes(d).filter((r) => !items.includes(`i:${r.sym}`)).map((r) => btn(`i:${r.sym}`, r.name)).join("");
    // 지수 버튼은 많아서 접어 둬요 (차트가 아래로 밀리지 않게)
    return (watch ? `<div class="sav-quick"><span class="muted">내 관심종목</span><div class="chips">${watch}</div></div>` : "")
      + `<details class="fold" id="cmp-idx" style="margin-top:6px"${cmpIdxOpen ? " open" : ""}><summary class="muted">지수 바로 넣기</summary><div class="chips">${idx}</div></details>`;
  }
  const qs = queryKeys(q), hits = [];
  chartIndexes(d).forEach((r, i) => {
    const sc = scoreOf([r.sym.replace(/^\^/, ""), r.name], [norm(r.name)], qs);
    if (sc != null && !items.includes(`i:${r.sym}`)) hits.push({ sc: sc - 0.5, i, key: `i:${r.sym}`, name: r.name, meta: "지수" });
  });
  if (!SYM.kr || !SYM.us) {
    if (!hits.length) return `<p class="muted" style="margin:8px 0 0">종목 목록 불러오는 중…</p>`;
  } else {
    for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => {
      const sc = scoreOf(e.row, e.keys, qs);
      if (sc != null && !cmpHas(items, m, e.row[0])) hits.push({ sc, i, m, key: `s:${m}:${e.row[0]}`, name: e.row[1],
        meta: [e.row[0], kindName(m, e.row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ") });
    });
  }
  hits.sort((a, b) => a.sc - b.sc || (a.m && a.m !== market ? 1 : 0) - (b.m && b.m !== market ? 1 : 0) || a.i - b.i);
  if (!hits.length) return `<p class="muted" style="margin:8px 0 0">'${esc(q)}'에 맞는 지수·종목이 없어요.</p>`;
  return `<ul class="sav-res">${hits.slice(0, 8).map((h) => `<li><button type="button" data-cmp-add="${esc(h.key)}"><span class="l"><b>${esc(h.name)}</b>
    <small>${esc(h.meta)}</small></span><span class="add">+</span></button></li>`).join("")}</ul>`;
}
function compareCard(d) {
  if (!d.daily) return "";
  const items = cmpItems(d);
  const chips = items.map((k, i) => `<button type="button" class="cmp-chip" data-cmp-del="${esc(k)}" aria-label="${esc(cmpName(d, k))} 빼기">
    <i class="sw" style="background:${cmpColor(i)}"></i>${esc(cmpName(d, k))} <span aria-hidden="true">×</span></button>`).join("");
  const frames = FRAMES.map(([k, label]) => `<button type="button" data-cmp-f="${k}" aria-pressed="${k === cmpF}">${label}</button>`).join("");
  return `<section class="card" id="cmp-card"><h2>비교 차트 <small>보이는 첫날 0%에서 출발</small></h2>
    <div class="chips" id="cmp-chips">${chips}</div>
    <input id="cmp-q" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:10px"
      placeholder="지수·종목 검색 (예: 나스닥, 엔비디아)" aria-label="비교 차트에 넣을 지수·종목 검색" value="${esc(cmpQuery)}">
    <div id="cmp-res">${cmpResults(d)}</div>
    <div class="period" role="group" aria-label="비교 기간" style="margin:10px 0 0">${frames}</div>
    <div class="chips" role="group" aria-label="모양"><button type="button" data-cmp-line="0" aria-pressed="${!cmpLine}">캔들</button><button type="button" data-cmp-line="1" aria-pressed="${cmpLine}">꺾은선</button></div>
    <p class="muted" id="cmp-range" style="margin:8px 0 4px"></p>
    <div class="chart candle" id="cmp-chart"><p class="empty">불러오는 중이에요…</p></div>
    <p class="muted note" id="cmp-note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들은 항목마다 자기 색이고, 오른 캔들은 꽉 차고 내린 캔들은 속이 비어요. 누르면 그날 각자 몇 % 올랐는지 보이고, 길게 누른 채 움직이면 세부정보가 손가락을 따라와요.
      넣은 것 중 가장 오래된 날부터 지금까지 한 화면에 보여요(일봉은 너무 길면 최근 ${num(MAX_SHOW)}일, 옆으로 밀면 더 과거).
      넣은 것이 다 같이 있는 첫날을 0%로 맞춰서 누가 더 올랐는지 봐요. 늦게 상장한 게 있으면 그날 '같이 출발' 점선이 생겨요. 8배 넘게 차이 나면 '로그 눈금'으로 그려요. ×를 누르면 빠져요. 최대 ${CMP_MAX}개까지 겹쳐요.</p></section>`;
}
// 항목마다 고른 기간 캔들(지수 차트와 같은 묶음)을 만들고, 모든 항목의 날짜를 합쳐 한 줄로 세워요.
// 쉬는 날(국장·미장 휴일이 달라요)은 직전 값으로 이어요.
// 지수는 상장일부터라 수만 칸이에요: 묶은 캔들은 자료마다 기억하고, 날짜는 이미 순서대로라 정렬 없이 한 번에 합쳐요
// (전에는 넣을 때마다 보조지표까지 다 계산하고 전체를 다시 정렬해서 폰에서 버벅였어요).
const CMP_FRAME = new WeakMap();  // 자료 → { 기간: 묶은 캔들 }
function cmpFrame(c, fr) {
  let m = CMP_FRAME.get(c);
  if (!m) CMP_FRAME.set(c, (m = {}));
  return m[fr] || (m[fr] = frameBase(c, fr));
}
const cmpGot = (items) => items.map((k) => { const x = cmpReady(k); return x && x.candles && x.candles.dates && x.candles.dates.length > 1 ? x.candles : null; });
function cmpRows(got, fr = cmpF) {
  const fs = got.map((x) => (x ? cmpFrame(x, fr) : null)), n = fs.length;
  const keys = [], first = [], last = [];
  const series = fs.map(() => ({ c: [], o: [], h: [], l: [] }));
  const at = new Array(n).fill(0), prev = new Array(n).fill(null);
  for (;;) {
    let k = null;
    for (let j = 0; j < n; j++) { const f = fs[j]; if (f && at[j] < f.keys.length && (k == null || f.keys[at[j]] < k)) k = f.keys[at[j]]; }
    if (k == null) break;
    let fi = null, la = null;
    for (let j = 0; j < n; j++) {
      const f = fs[j], s = series[j], i = f && at[j] < f.keys.length && f.keys[at[j]] === k ? at[j]++ : null;
      if (i != null) {
        prev[j] = i;
        if (fi == null || f.first[i] < fi) fi = f.first[i];
        if (la == null || f.last[i] > la) la = f.last[i];
        s.o.push(f.o[i]); s.h.push(f.h[i]); s.l.push(f.l[i]);
      } else { s.o.push(null); s.h.push(null); s.l.push(null); }  // 쉬는 날은 캔들 없이
      s.c.push(prev[j] == null ? null : f.c[prev[j]]);
    }
    keys.push(k); first.push(fi); last.push(la);
  }
  return { f: { keys, first, last, frame: fr }, series };
}
function drawCompare(d) {
  const el = $("#cmp-chart");
  if (!el) return;
  const items = cmpItems(d);
  if (!items.length) { el.innerHTML = `<p class="empty">위 검색창에서 지수나 종목을 찾아 넣어 주세요.</p>`; return; }
  const want = items.join(",") + cmpF + market;
  Promise.all(items.map(cmpLoad)).then(() => {
    if (screen !== "chart" || !$("#cmp-chart") || cmpItems(d).join(",") + cmpF + market !== want) return;  // 받는 사이 바뀌었으면 안 그려요
    const el2 = $("#cmp-chart");
    const got = cmpGot(items);
    if (!got.some(Boolean)) { el2.innerHTML = `<p class="empty">자료를 못 받았어요. 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`; return; }
    const { f, series } = cmpRows(got);
    const list = items.map((k, j) => {
      const m = k[0] === "i" ? null : cmpStock(k)[0];
      return { name: cmpName(d, k), color: cmpColor(j), ok: Boolean(got[j]), ...series[j],
        fmt: m ? (v) => px(m, v) : (v) => (Math.abs(v) >= 1000 ? num(v) : px("us", v)) };
    });
    // 처음 그릴 때는 넣은 것 중 가장 오래된 날부터 전부
    compareChart(el2, f, list, Infinity, cmpDrawn !== want, (txt) => { const t = $("#cmp-range"); if (t) t.innerHTML = txt; });
    cmpDrawn = want;
    const missing = list.filter((s) => !s.ok).map((s) => s.name);
    const note = $("#cmp-note");
    if (note && missing.length && !note.dataset.miss) { note.dataset.miss = "1"; note.insertAdjacentText("afterbegin", `${missing.join(", ")} 자료를 못 받았어요. `); }
  });
}
// 10배 넘게 오르면 %가 너무 길어서 (+43271.7%) '434배'로 써요 (오른쪽 딱지가 안 잘리게)
const cmpPct = (r) => (r != null && r >= 9 ? `${num(r + 1)}배` : pct(r));
// 비교 선 차트: 보이는 구간에서 모든 항목이 다 있는 첫 칸을 0%로 (밀거나 확대하면 다시 맞춰요). 조작은 캔들 차트와 같아요.
// 늦게 상장한 항목이 있으면 그날부터 같이 출발시켜서 공평하게 비교해요 (그 전 구간은 그날 대비 몇 %로 보여요).
function compareChart(el, f, list, show, reset, onRange) {
  const n = f.keys.length, key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n || VIEW[key].frame !== f.frame) {
    // 처음엔 넣은 것이 다 같이 있는 첫 칸부터 (오래된 지수 하나 때문에 비교 구간이 오른쪽 끝에 몰리지 않게). 그 전은 밀어서 봐요
    const firsts = list.map((x) => x.c.findIndex((c) => c != null)).filter((i) => i >= 0);
    const common = firsts.length ? Math.max(...firsts) : 0;
    VIEW[key] = { count: Math.min(show, n, Math.max(Math.min(5, n), n - common)), end: n - 1, n, frame: f.frame, pick: null };
  }
  const v = VIEW[key];
  let W = 0, pad, iw, ih, cw, start, base = [], Yp, from = 0;
  const draw = (anim) => {
    W = Math.max(el.clientWidth, 260);
    pad = { l: 6, r: 62, t: 22, b: 22 };
    iw = W - pad.l - pad.r;
    ih = Math.round(Math.max(170, Math.min(260, W * 0.62))) - pad.t - pad.b;  // 가로로 넓적하게 (지수 차트보다 낮게)
    const H = pad.t + ih + pad.b;
    v.count = Math.max(Math.min(5, n), Math.min(n, MAX_SHOW, v.count));
    v.end = Math.max(v.count - 1, Math.min(n - 1, v.end));
    const endI = Math.round(v.end);
    start = endI - Math.round(v.count) + 1;
    cw = iw / Math.round(v.count);
    // 다 같이 있는 첫 칸(from)의 값 = 0%
    const first = list.map((s) => { for (let i = start; i <= endI; i++) if (s.c[i] != null) return i; return null; });
    from = Math.max(start, ...first.filter((i) => i != null));
    base = list.map((s, j) => { if (first[j] == null) return null; for (let i = from; i <= endI; i++) if (s.c[i] != null) return s.c[i]; return null; });
    let lo = Infinity, hi = -Infinity;
    list.forEach((s, j) => {
      if (base[j] == null) return;
      for (let i = start; i <= endI; i++) {
        for (const val of cmpLine ? [s.c[i]] : [s.c[i], s.h[i], s.l[i]]) if (val != null) { const r = val / base[j]; if (r < lo) lo = r; if (r > hi) hi = r; }
      }
    });
    if (!Number.isFinite(lo)) { lo = 0.9; hi = 1.1; }
    lo = Math.min(lo, 1); hi = Math.max(hi, 1);
    const logY = lo > 0 && hi / lo >= 8;
    if (logY) { const r = Math.log(hi / lo) * 0.08; hi *= Math.exp(r); lo /= Math.exp(r); } else {
      const span = hi - lo || 0.02; hi += span * 0.08; lo -= span * 0.08;
    }
    const sc = logY ? (p) => Math.log(Math.max(p, lo / 10)) : (p) => p, sLo = sc(lo), sHi = sc(hi);
    const X = (i) => pad.l + (i - start + 0.5) * cw;
    const Y = (p) => pad.t + (1 - (sc(p) - sLo) / (sHi - sLo)) * ih;
    Yp = Y;
    // 눈금은 딱 떨어지는 % (0%는 점선이 있어서 글자만), 너무 붙으면 건너뛰어요
    let ticks;
    if (logY) {
      const cand = [];
      for (let e = -3; e <= 6; e++) [1, 2, 5].forEach((m) => cand.push(m * Math.pow(10, e)));
      [0.25, 0.5, 0.75].forEach((r) => cand.push(r));
      ticks = cand.filter((r) => r > lo && r < hi).sort((a, b) => a - b);
    } else {
      const raw = (hi - lo) / 6, e = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * e).find((k) => k >= raw);
      ticks = [];  // 비율이라 1이 0%: 1 + step의 배수
      for (let k = Math.ceil((lo - 1) / step); 1 + k * step < hi; k++) ticks.push(1 + k * step);
    }
    ticks = [1, ...ticks.filter((t) => Math.abs(t - 1) > 1e-9)];  // 0%를 먼저 남겨요
    ticks = ticks.reduce((kept, t) => (kept.every((u) => Math.abs(Y(u) - Y(t)) >= 18) ? [...kept, t] : kept), []);
    const grid = ticks.map((t) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>
      <text x="${pad.l + 2}" y="${Y(t) - 4}">${esc(cmpPct(t - 1).replace(/\.0%$/, "%"))}</text>`).join("");
    const path = (vals, j, extra) => {
      if (base[j] == null) return "";
      let dstr = "", pen = false;
      for (let i = start; i <= endI; i++) {
        const val = vals[i]; if (val == null) { pen = false; continue; }
        dstr += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(val / base[j]).toFixed(1)}`; pen = true;
      }
      return dstr ? `<path d="${dstr}" fill="none" stroke="${list[j].color}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>` : "";
    };
    // 캔들: 항목마다 자기 색. 오른 캔들은 꽉 채우고 내린 캔들은 속이 빈 테두리 (색이 겹쳐도 오르내림이 보여요)
    const bw = Math.max(1, cw * 0.6);
    const candles = (s, j) => {
      if (base[j] == null) return "";
      // 꼬리는 항목마다 path 하나로 (길게 보면 캔들이 수천 개라 하나씩 그리면 밀 때 버벅여요)
      let wick = "", out = "";
      for (let i = start; i <= endI; i++) {
        if (s.o[i] == null || s.c[i] == null) continue;
        const b = base[j], x = X(i), up = s.c[i] >= s.o[i];
        wick += `M${x.toFixed(1)},${Y(s.h[i] / b).toFixed(1)}V${Y(s.l[i] / b).toFixed(1)}`;
        if (cw < 3) continue;
        const top = Y(Math.max(s.o[i], s.c[i]) / b), bh = Math.max(1, Math.abs(Y(s.o[i] / b) - Y(s.c[i] / b)));
        out += `<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" stroke="${s.color}" stroke-width="1" fill="${up ? s.color : "var(--surface-1)"}"/>`;
      }
      return (wick ? `<path d="${wick}" stroke="${s.color}" stroke-width="1" fill="none"/>` : "") + out;
    };
    const lines = list.map((s, j) => (cmpLine ? path(s.c, j, 'stroke-width="2"') : candles(s, j))).join("");
    // 오른쪽 끝: 각자 지금 몇 % (선 색 딱지, 겹치면 위아래로 벌려요)
    const ends = list.map((s, j) => {
      let i = endI; while (i >= start && s.c[i] == null) i--;
      if (i < start || base[j] == null) return null;
      return { j, r: s.c[i] / base[j] - 1, y: Math.min(pad.t + ih - 9, Math.max(pad.t + 9, Y(s.c[i] / base[j]))) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 18) ends[k].y = ends[k - 1].y + 18;
    const tags = ends.map((e) => `<rect class="cmp-end" x="${pad.l + iw + 1}" y="${e.y - 9}" width="${pad.r - 2}" height="18" rx="3" fill="${list[e.j].color}"/>
      <text class="tag-text cmp-end" x="${pad.l + iw + 6}" y="${e.y + 4}">${esc(cmpPct(e.r))}</text>`).join("");
    const zero = `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(1)}" y2="${Y(1)}"/>`
      // 늦게 상장한 게 있으면 같이 출발한 칸에 세로 점선
      + (from > start ? `<line class="zero" x1="${X(from)}" x2="${X(from)}" y1="${pad.t}" y2="${pad.t + ih}"/>
        <text class="pane-label" x="${X(from) + 4}" y="${pad.t + ih - 4}">같이 출발</text>` : "");
    const xs = [start, Math.round((start + endI) / 2), endI];
    const xl = xs.map((i, k) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${esc(frameLabel(f, i, "axis"))}</text>`).join("");
    const picked = v.pick != null && v.pick >= start && v.pick <= endI;
    const clip = `cc-${key}`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(list.map((s) => s.name).join(", "))} 비교 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath></defs>
      ${grid}${zero}<g class="cmp-lines" clip-path="url(#${clip})">${lines}</g>
      <line class="cross" x1="${picked ? X(v.pick) : 0}" x2="${picked ? X(v.pick) : 0}" y1="${pad.t}" y2="${pad.t + ih}"${picked ? "" : ' style="display:none"'}/>
      ${tags}${xl}${logY ? `<text class="pane-label" x="${pad.l + iw + 6}" y="${pad.t - 8}">로그 눈금</text>` : ""}</svg>
      <div class="tip" style="display:none"></div>`;
    if (anim && cmpLine) drawIn($("svg", el), { x0: pad.l, w: iw, sel: ".cmp-lines > *", late: ".cmp-end" });
    const best = ends.slice().sort((a, b) => b.r - a.r)[0];
    onRange(`${esc(frameLabel(f, start, "axis"))} ~ ${esc(frameLabel(f, endI, "axis"))} (${Math.round(v.count)}${UNIT[f.frame]})`
      + (from > start ? ` · 다 같이 있는 ${esc(frameLabel(f, from, f.frame === "w" ? "axis" : "full"))}부터 비교` : "")
      + (best && ends.length > 1 ? ` · 가장 많이 오른 건 <b>${esc(list[best.j].name)}</b> <b class="${sign(best.r)}">${cmpPct(best.r)}</b>` : ""));
    if (picked) showTip(v.pick, X(v.pick));
  };
  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const rows = list.map((s, j) => {
      if (base[j] == null || s.c[i] == null) return "";
      const r = s.c[i] / base[j] - 1;
      return `<div class="row"><i class="sw" style="background:${s.color}"></i>${esc(s.name)} <b class="${sign(r)}">${cmpPct(r)}</b> <span class="muted">${esc(s.fmt(s.c[i]))}</span></div>`;
    }).join("");
    tip.innerHTML = `<div class="muted">${esc(frameLabel(f, i, "full"))}</div>${rows}`;
    tip.style.display = "";
    const r = el.getBoundingClientRect(), left = (x / W) * r.width, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `${pad.t}px`;
  };
  // 누른 곳 근처에 어느 항목이든 캔들(선이면 그 점)이 있는지: 없으면 빈 곳이라 세부정보를 닫아요
  const hit = (i, y) => Yp && list.some((s, j) => {
    if (base[j] == null || s.c[i] == null) return false;
    const top = Yp((cmpLine ? s.c[i] : s.h[i]) / base[j]), bot = Yp((cmpLine ? s.c[i] : s.l[i]) / base[j]);
    return y >= top - HIT_PX && y <= bot + HIT_PX;
  });
  chartGestures(el, v, () => ({ start, cw, pad, W, hit }), draw, showTip);
  draw(drawSoon(el));
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
function bindCompare(d) {
  const save = () => {
    try { localStorage.setItem("compare", JSON.stringify(COMPARE)); localStorage.setItem("cmp_f", cmpF); localStorage.setItem("cmp_line", cmpLine ? "1" : "0"); } catch (e) { /* 이번만 */ }
  };
  // 비교 차트 칸만 다시 그려요 (화면 전체를 다시 그리면 위 지수 차트까지 새로 그려서 느려요).
  // 새 차트가 준비될 때까지 보던 차트를 그대로 둬서 '불러오는 중'으로 깜빡이거나 칸이 줄었다 늘지 않아요.
  const redraw = () => {
    save();
    const card = $("#cmp-card");
    if (!card) { render(); return; }
    const y = window.scrollY, old = $("#cmp-chart"), keep = old && old.querySelector("svg") ? old.innerHTML : "";
    card.outerHTML = compareCard(d);
    const nc = $("#cmp-card");
    foldNotes(nc);
    if (keep) $("#cmp-chart").innerHTML = keep;
    bindCompare(d);
    window.scrollTo(0, y);
    keepTap();
  };
  document.querySelectorAll("[data-cmp-del]").forEach((b) => b.addEventListener("click", () => {
    COMPARE[market] = cmpItems(d).filter((k) => k !== b.dataset.cmpDel); redraw();
  }));
  const res = $("#cmp-res");
  if (res) res.addEventListener("toggle", (e) => { if (e.target.id === "cmp-idx") cmpIdxOpen = e.target.open; }, true);
  if (res) res.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmp-add]");
    if (!b) return;
    COMPARE[market] = cmpItems(d).concat(b.dataset.cmpAdd).slice(0, CMP_MAX);
    cmpQuery = ""; redraw();
  });
  // 글자를 칠 때는 결과 칸만 다시 그려요 (검색창은 그대로 둬서 키보드가 안 닫혀요)
  const q = $("#cmp-q");
  if (q) q.addEventListener("input", () => { cmpQuery = q.value; const r = $("#cmp-res"); if (r) r.innerHTML = cmpResults(d); });
  document.querySelectorAll("[data-cmp-f]").forEach((b) => b.addEventListener("click", () => { cmpF = b.dataset.cmpF; redraw(); }));
  document.querySelectorAll("[data-cmp-line]").forEach((b) => b.addEventListener("click", () => { cmpLine = b.dataset.cmpLine === "1"; redraw(); }));  // 보던 구간은 그대로
  drawCompare(d);
  // 전 종목 목록은 처음 열 때 받아요. 다른 시장 종목은 받은 뒤 이름을 채워요.
  if (!SYM.kr || !SYM.us) loadSymbols().then(() => {
    if (!$("#cmp-card")) return;
    const r = $("#cmp-res"); if (r) r.innerHTML = cmpResults(d);
    const c = $("#cmp-chips"); if (c && cmpItems(d).some((k) => k[0] === "s")) c.querySelectorAll("[data-cmp-del]").forEach((b, i) => {
      const k = b.dataset.cmpDel; b.childNodes[2].textContent = `${cmpName(d, k)} `; b.setAttribute("aria-label", `${cmpName(d, k)} 빼기`);
    });
  });
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
    <p class="muted note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려요.
      이 지수는 참고로만 봐요.</p>${indHelp()}</section>`;
}

function trendCard(d) {
  if (!d.daily) return "";
  const r = chartIdx(d);
  if (r.sym !== OWN_IDX[market]) return otherIndexCard(d, r);
  const cd = d.daily.candles;
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
    <p class="muted note" style="margin:8px 0 0">${cd
      ? "옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그 기간의 시가·고가·저가·종가가 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 세부정보가 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요. "
      : ""}</p>${cd ? indHelp() : ""}</section>`;
}

function candleLegend() {
  return `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--c-up)"></i>상승</span>
      <span class="key"><i class="sw" style="background:var(--c-down)"></i>하락</span>
      ${IND.ma ? maKeys() : ""}
      ${IND.bb ? `<span class="key"><i class="sw" style="background:var(--bb)"></i>볼린저밴드</span>` : ""}</div>${IND.ma && maOpen ? maPanel() : ""}`;
}

// 이동평균선 표시: 누르면 설정 창이 열리고 닫혀요
function maKeys() {
  const on = MA_SET.map((m, i) => (m.on ? `<span class="key"><i class="sw" style="background:${MA_COLORS[i]}"></i>${m.p}일선</span>` : "")).join("");
  return `<button type="button" class="ma-key ma-edit" aria-expanded="${maOpen}">${on || "이동평균선 꺼짐"}</button>`;
}
function maPanel() {
  const rows = MA_SET.map((m, i) => `<div class="ma-row">
      <i class="sw" style="background:${MA_COLORS[i]}"></i>
      <button type="button" class="ma-step" data-ma-step="${i}" data-d="-1" aria-label="${m.p}일선 기간 줄이기">−</button>
      <input type="number" inputmode="numeric" min="2" max="${MA_MAX}" value="${m.p}" data-ma-p="${i}" aria-label="${i + 1}번 선 기간(일)">
      <button type="button" class="ma-step" data-ma-step="${i}" data-d="1" aria-label="${m.p}일선 기간 늘리기">+</button>
      <span class="ma-unit">일선</span>
      <button type="button" class="ma-on" data-ma-on="${i}" aria-pressed="${m.on}">${m.on ? "켜짐" : "꺼짐"}</button>
    </div>`).join("");
  return `<div class="ma-panel" role="group" aria-label="이동평균선 설정">
    <div class="ma-head"><b>이동평균선</b><span class="muted">기간은 일 단위 (2~${MA_MAX}일)</span></div>${rows}
    <div class="ma-quick">${[[5, 20, 60, 120], [20, 60, 120, 200], [5, 20, 50, 200]].map((q) =>
      `<button type="button" data-ma-quick="${q.join(",")}">${q.join("·")}</button>`).join("")}</div>
    <div class="ma-foot"><button type="button" data-ma-reset>처음대로 (50·200)</button><button type="button" data-ma-close>닫기</button></div>
    <p class="muted note">모든 종목·지수 차트에 같이 적용되고 이 폰에 기억해요. 년봉엔 안 그려요.</p></div>`;
}
function saveMa() {
  remember("ma_set", JSON.stringify(MA_SET));
  render();  // 보던 구간·확대는 그대로 두고 선만 다시 그려요
}
function bindMa(root) {
  root.querySelectorAll(".ma-edit").forEach((b) => b.addEventListener("click", () => { maOpen = !maOpen; render(); }));
  root.querySelectorAll("[data-ma-close]").forEach((b) => b.addEventListener("click", () => { maOpen = false; render(); }));
  root.querySelectorAll("[data-ma-on]").forEach((b) => b.addEventListener("click", () => {
    const m = MA_SET[Number(b.dataset.maOn)]; m.on = !m.on; saveMa();
  }));
  root.querySelectorAll("[data-ma-step]").forEach((b) => b.addEventListener("click", () => {
    const m = MA_SET[Number(b.dataset.maStep)];
    m.p = Math.max(2, Math.min(MA_MAX, m.p + Number(b.dataset.d))); m.on = true; saveMa();
  }));
  root.querySelectorAll("[data-ma-p]").forEach((inp) => inp.addEventListener("change", () => {
    const m = MA_SET[Number(inp.dataset.maP)], v = Math.round(Number(inp.value));
    if (Number.isFinite(v) && v >= 2) { m.p = Math.min(MA_MAX, v); m.on = true; }
    saveMa();
  }));
  root.querySelectorAll("[data-ma-quick]").forEach((b) => b.addEventListener("click", () => {
    MA_SET = b.dataset.maQuick.split(",").map((p) => ({ p: Number(p), on: true })); saveMa();
  }));
  root.querySelectorAll("[data-ma-reset]").forEach((b) => b.addEventListener("click", () => {
    MA_SET = MA_DEFAULT.map((m) => ({ ...m })); saveMa();
  }));
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
// 종목 색: 앞 8개는 정해진 색, 그 뒤로는 색상환을 황금각(137.5°)씩 돌려 서로 멀게
const SAV_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--bb)", "var(--ma50)", "#d6457a", "#1f9fb8", "#8a6d3b"];
const savColor = (i) => SAV_COLORS[i] || `hsl(${Math.round((i * 137.5) % 360)} 60% 50%)`;
// 절세 계좌: 여러 개 같이 고를 수 있고, 위에서부터 한도만큼 채운 뒤 남는 돈은 다음 계좌, 마지막은 일반 계좌로 넣어요.
