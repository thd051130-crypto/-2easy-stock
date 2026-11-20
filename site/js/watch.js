"use strict";
// ---------------------------------------------------------------- 관심종목

// 종목 한 줄: 이름·코드·3개월 등락, 종가·전일 대비, ★. chart면 3개월 추세선도 (내 관심종목처럼 몇 개 안 될 때)
function stockRow(s, d, { star = true, chart = false, meta: extraMeta = "" } = {}) {
  const badges = [];
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
  const base = (d.daily && d.daily.stocks) || [];
  const have = new Set(base.map((s) => s.code));
  return base.concat((d.extras || []).filter((e) => !have.has(e.code)).map((e) => ({ ...e, extra: true })));
}

// 전 종목 파일(all_stocks.py, 최근 2년 일봉)로 만든 종목 줄: 대시보드 종목이 아닌 ☆ 종목도 종가·추세선을 보여요.
function liteStock(m, code) {
  const x = STOCK_READY.get(`${m}/${code}`);
  const c = x && x.candles;
  if (!c || !c.c || c.c.length < 2) return null;
  const n = c.c.length;
  return { code, name: x.name || code, day: c.dates[n - 1], close: c.c[n - 1], d1: c.c[n - 2] ? c.c[n - 1] / c.c[n - 2] - 1 : null,
    spark: c.c.slice(-64), lite: true };
}
// 대시보드 종목이 아닌 ☆ 종목은 종목 파일을 한 번씩 받아서 다시 그려요 (못 받은 종목은 다시 안 받아요).
const LITE_TRIED = new Set();
function loadLite(m, codes) {
  const todo = codes.filter((c) => !STOCK_READY.has(`${m}/${c}`) && !LITE_TRIED.has(`${m}/${c}`));
  if (!todo.length) return;
  todo.forEach((c) => LITE_TRIED.add(`${m}/${c}`));
  Promise.all(todo.map((c) => stockData(m, c))).then((got) => {
    if (!got.some(Boolean) || m !== market || !["home", "watch"].includes(screen)) return;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
}
// 내 관심종목(★) 줄: 대시보드 종목은 그 시세로, 나머지 상장 종목은 전 종목 파일로
function myStocks(d) {
  const all = stocksOf(d);
  const out = [], wait = [];
  for (const c of WATCH[market]) {
    // 텔레그램으로 넣은 종목은 stock_pages.py가 시세를 채워요. 그게 실패해 시세가 없으면 전 종목 파일로 보여요.
    const hit = all.find((x) => x.code === c);
    const s = hit && hit.close != null ? hit : liteStock(market, c) || hit;
    if (!s || s.close == null) wait.push(c);
    if (s) out.push(s);
  }
  loadLite(market, wait);
  return out;
}

function watchCard(d) {
  const all = stocksOf(d);
  if (!all.length) {
    return `<section class="card"><h2>관심종목</h2><p class="empty">종목 시세가 아직 없어요. ${NEXT_RUN[market]} 자동 실행 뒤에 생겨요.</p></section>`;
  }
  const mine = myStocks(d);
  return `<section class="card" id="watch-card"><h2>내 관심종목 <small>${mine.length}개 · ${md(all[0].day)} 종가</small></h2>
    ${mine.length ? `<ul class="list">${mine.map((s) => stockRow(s, d, { chart: true })).join("")}</ul>`
      : `<p class="empty">아래 전체 종목에서 ☆를 누르면 여기에 모여요.</p>`}
    <p class="muted note" style="margin:10px 0 0">종목을 누르면 차트와 재무제표가 나와요. ★ 목록은 이 폰 브라우저에만 저장돼요.
      아래 목록에 없는 종목도 위쪽 돋보기(검색)에서 찾아 ☆만 누르면 여기에 들어와요 (국장·미장 상장 종목 전부).</p></section>`;
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
// 조건 검색 범위: 대형주(대시보드 종목) 또는 전 종목(all_stocks.py가 매일 만드는 stocks/<시장>/_quotes.json, 주가 조건만)
let scrAll = false;
try { scrAll = localStorage.getItem("scr_all") === "1"; } catch (e) { /* 처음 */ }
const QUOTES = { kr: null, us: null };  // {day, q: {코드: [종가, 전일 대비, 3개월, 200일선 대비, 52주 고점 대비, RSI14]}}
const quoteLoading = {};
function loadQuotes(m) {
  if (!quoteLoading[m]) {
    quoteLoading[m] = fetch(`stocks/${m}/_quotes.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { QUOTES[m] = x && x.q ? x : { q: {} }; if (!x) quoteLoading[m] = null; });
  }
  return quoteLoading[m];
}
function quoteStocks(m) {
  const q = (QUOTES[m] || {}).q || {};
  const names = new Map((SYM[m] || []).map((e) => [e.row[0], e.row[1]]));
  return Object.entries(q).map(([code, v]) => ({ code, name: names.get(code) || code, day: QUOTES[m].day, close: v[0], d1: v[1],
    c3: v[2], ma200: v[3], hi52: v[4], rsi14: v[5] }));
}

function screenerCard(d) {
  const funds = d.funds || {};
  const big = stocksOf(d).filter((s) => !s.extra);
  if (!big.length) return "";
  const wide = scrAll && QUOTES[market] && Object.keys(QUOTES[market].q).length && SYM[market];
  if (scrAll && !wide) {
    Promise.all([loadQuotes(market), loadSymbols()]).then(() => {
      if (screen === "watch" && Object.keys((QUOTES[market] || { q: {} }).q).length) { const y = window.scrollY; render(); window.scrollTo(0, y); }
    });
  }
  const all = wide ? quoteStocks(market) : big;
  const scope = [["big", `대형주 ${big.length}개`], ["all", "전 종목"]].map(([k, label]) =>
    `<button type="button" data-scope="${k}" aria-pressed="${(k === "all") === scrAll}">${label}</button>`).join("");
  const chips = FILTERS.map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${FILTER_ON.includes(k)}">${label}</button>`).join("");
  const on = FILTERS.filter((x) => FILTER_ON.includes(x[0]));
  let body = `<p class="sub note" style="margin:10px 0 0">조건을 하나 이상 누르면 모두 만족하는 종목만 보여요.</p>`;
  if (scrAll && !wide) {
    body = `<p class="muted" style="margin:10px 0 0">전 종목 시세를 불러오는 중이에요… (처음 한 번은 몇 초 걸려요. 계속 안 뜨면 all-stocks 작업이 아직 안 돈 거예요)</p>`;
  } else if (on.length) {
    const hits = all.filter((s) => on.every(([, , ok]) => ok(s, funds[s.code] || {})));
    hits.sort((a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
    const cap = 50;
    body = `<p class="sub" style="margin:10px 0 4px"><b>${hits.length.toLocaleString("ko-KR")}개</b> / ${all.length.toLocaleString("ko-KR")}개 종목${hits.length > cap ? ` · 오늘 많이 오른 ${cap}개만 보여요` : ""}</p>`
      + (hits.length ? `<ul class="list">${hits.slice(0, cap).map((s) => stockRow(s, d, { meta: on.map(([, , , show]) => show(s, funds[s.code] || {})).join(" · ") })).join("")}</ul>`
        : `<p class="empty">조건을 모두 만족하는 종목이 없어요. 조건을 하나 빼 보세요.</p>`);
  }
  const noPrice = !all.some((s) => s.ma200 != null);
  return `<section class="card" id="screener"><h2>조건 검색 <small>${wide ? `상장 ${all.length.toLocaleString("ko-KR")}종목 중` : `${all.length}개 대형주 중`}</small></h2>
    <div class="period" role="group" aria-label="찾을 범위" style="margin:0 0 10px">${scope}</div>
    <div class="chips">${chips}</div>${body}
    ${scrAll ? `<p class="muted note" style="margin:10px 0 0">전 종목은 주가 조건(200일선·52주 고점·RSI)을 다 봐요. PER·배당 같은 재무 조건은 재무를 받는 대형주만 남아요.</p>` : ""}
    <p class="muted note" style="margin:10px 0 0">뜻이 궁금하면: ${["200일선", "52주 고점", "RSI", "PER", "PBR", "배당수익률", "ROE", "부채비율", "목표주가"].map((t) => term(t)).join(" · ")}</p>
    <p class="muted note" style="margin:6px 0 0">재무 조건은 매주 토요일, 주가 조건은 장 마감 뒤 갱신돼요.${noPrice ? " 200일선·RSI·52주 고점 조건은 다음 장 마감 뒤부터 써요." : ""} 자료가 없는 종목은 빠져요.</p></section>`;
}

// 관심 화면 업종 버튼: 대시보드 종목에 있는 업종만 (업종 지도 paper/sectors.json 기준)
function secList(d) {
  const of = (d.daily && d.daily.sector_of) || {};
  const have = new Set(stocksOf(d).map((s) => of[s.code]).filter(Boolean));
  const order = ((d.daily && d.daily.sectors) || []).map((s) => s.name);
  return order.filter((n) => have.has(n)).concat([...have].filter((n) => !order.includes(n)));
}
function allRows(d) {
  const q = watchQuery.trim().toLowerCase();
  const of = (d.daily && d.daily.sector_of) || {};
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
  document.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => {
    scrAll = b.dataset.scope === "all";
    remember("scr_all", scrAll ? "1" : "0");
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.filter;
    FILTER_ON = FILTER_ON.includes(k) ? FILTER_ON.filter((x) => x !== k) : FILTER_ON.concat(k);
    remember("filters", JSON.stringify(FILTER_ON));
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
    remember("watchSort", watchSort);
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
  const mine = myStocks(d);
  if (!mine.length) return "";
  return `<section class="card"><h2>관심종목 <small>${md(mine[0].day)} 종가</small></h2>
    <ul class="list">${mine.slice(0, 5).map((s) => stockRow(s, d, { star: false, chart: true })).join("")}</ul>
    ${more("watch", mine.length > 5 ? `관심종목 ${mine.length}개 모두 보기` : "관심종목 보기")}</section>`;
}
