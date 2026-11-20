"use strict";
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

let headHad = null;  // 종목 파일을 받은 뒤 머리 칸을 그린 종목 (대시보드 밖 종목은 받고 나서 이름·종가를 채워 한 번 더 그려요)
function stockHeadCard(d) {
  const code = stockCode;
  const x = STOCK_READY.get(`${market}/${code}`);
  if (x) headHad = `${market}/${code}`;
  const s = stocksOf(d).find((y) => y.code === code) || liteStock(market, code);
  const name = (s && s.name) || (x && x.name) || code;
  const on = WATCH[market].includes(code);
  const badges = [];
  if (s && s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const kind = s && s.extra ? kindName(market, [code, name, s.exch || "", s.kind || "s"])
    : x && x.lite ? kindName(market, [code, name, x.exch || "", x.kind || "s"])
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
  const sig = d.daily || {};
  const name = (sig.sector_of || {})[code];
  if (!name) return "";
  const rel = ((sig.sector_links || {})[name] || []).map(([n]) => n);
  const tag = (n, main) => `<span class="tag${main ? " main" : ""}">#${esc(n)}</span>`;
  return `<a class="tags" href="#stock-sector" data-tags>${tag(name, true)}${rel.map((n) => tag(n)).join("")}</a>`;
}

function stockSectorCard(d) {
  const sig = d.daily || {};
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
    ${sectorPolicies(name, false)}
    ${links.length ? `<h3 class="muted" style="margin:12px 0 4px">같이 보면 좋은 연관 업종</h3>
      <ul class="list">${links.map(([x, why]) => sectorLine(x, `${why}로 이어져요`)).join("")}</ul>` : ""}
    ${peers.length ? `<h3 class="muted" style="margin:12px 0 4px">같은 업종 대형주</h3>
      <ul class="list">${peers.map((x) => stockRow(x, d)).join("")}</ul>` : ""}
    <p class="muted note" style="margin:10px 0 0">업종을 누르면 홈 '업종별 호재·악재'에서 그 업종 뉴스와 종목을 자세히 봐요. 호재·악재는 뉴스 제목으로 짐작한 거예요.</p></section>`;
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
  if (toggle) toggle.addEventListener("click", () => { alertOpen = !alertOpen; render(); if (alertOpen) { const i = $("#alert-price"); if (i) i.focus({ preventScroll: true }); } });
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
    <p class="muted note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요.</p>${indHelp()}</section>`;
}

// 차트 제목 옆: 자료가 시작하는 달. 보통 상장일이고, 야후 자료가 거기까지만 있는 오래된 종목
// (국장 2000년 1월, 미장 1962년 1월)은 그때부터예요.
function sinceLabel(c) {
  if (!c || !c.dates || !c.dates.length) return "";
  const mo = c.monthly && c.monthly.dates.length ? c.monthly : null;  // 전 종목 파일: 일봉은 2년, 월봉은 처음부터
  const first = (mo || c).dates[0], ym = `${first.slice(0, 4)}.${first.slice(5, 7)}`;
  if (!c.full && !mo) return `${ym}부터`;
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
  const dash = stocksOf(DATA.markets[market]).find((x) => x.code === stockCode);
  bindAlert(dash || liteStock(market, stockCode));
  const fill = (x) => {
    if (screen !== "stock" || `${market}/${stockCode}` !== key) return;  // 받는 사이 다른 화면으로 갔으면 안 그려요
    if (!dash && x && headHad !== key) { render(); return; }  // 대시보드 밖 종목: 이름·종목 종류·종가를 채워서 다시
    drawStock(x, false);
    fillCheck();
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
    if (all) all.innerHTML = allTimeLine(x.candles.monthly && x.candles.monthly.dates.length ? x.candles.monthly : x.candles);
    if (since) since.textContent = sinceLabel(x.candles);
  } else {
    el.innerHTML = `<p class="empty">${x ? "이 종목은 차트 자료를 못 받았어요." : "이 종목 자료를 아직 못 받았어요."} 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`;
  }
  fillFund(x && x.fund, x);
  if (x && x.lite) { const fc = $("#flow-card"); if (fc) fc.remove(); }  // 수급은 대형주(대시보드 종목)만 받아요
  else fillFlows(x && x.flows);
}

function fillFund(f, x) {
  const card = $("#fund-card");
  if (!card) return;
  card.innerHTML = fundHtml(f, x) + retHtml(x && x.ret);
  card.querySelectorAll("[data-fund]").forEach((b) => b.addEventListener("click", () => {
    fundMode = b.dataset.fund;
    fillFund(f, x);
  }));
}

// 오래 들고 있었다면: returns.py(매주)가 월봉으로 계산한 최근 10년(짧으면 상장 뒤) 주가 상승률·배당률과 상장 뒤 최대 낙폭
function retHtml(r) {
  if (!r) return "";
  const [start, up, div, mdd, years] = r;
  const tile = (label, value, note) => `<div class="stat"><span>${label}</span><b>${value}</b><small>${note}</small></div>`;
  const signed = (v) => `${v > 0 ? "+" : ""}${v}%`;
  return `<h3 style="margin:16px 0 6px">오래 들고 있었다면 <small class="muted">최근 ${years}년 · 1년 평균</small></h3>
    <div class="stats">${tile("주가 상승", `<span class="${sign(up)}">${signed(up)}</span>`, "연 복리")}${tile("배당", `${div}%`, "연 평균")}
      ${tile(term("최대 낙폭"), `<span class="down">${mdd}%</span>`, `${start.replace("-", ".")} 이후`)}</div>
    <p class="muted note" style="margin:8px 0 0">월말 종가 기준이고 앞으로도 그렇다는 뜻은 아니에요. 적립식 계산기와 같은 숫자예요.</p>`;
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

function fundHtml(f, x) {
  const ent = stocksOf(DATA.markets[market]).find((y) => y.code === stockCode);
  const etf = stockCode === "SPY" || !!(ent && ent.kind === "e") || !!(x && x.lite && x.kind === "e");
  if (!f) {
    return `<h2>재무제표</h2><p class="empty">${etf ? "ETF라 매출·영업이익 같은 재무제표가 없어요."
      : x && x.lite ? "재무제표는 대형주(대시보드 종목)만 매주 받아요. 이 종목은 차트와 아래 숫자만 봐요."
        : "재무 자료가 아직 없어요. 매주 토요일에 받아요."}</p>`;
  }
  const usd = market === "us";
  const tile = (label, value, note) => `<div class="stat"><span>${term(label.replace(/\(.*\)$/, ""), esc(label))}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div>`;
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
    <p class="muted note" style="margin:10px 0 0">야후 파이낸스 무료 자료라 늦거나 빠진 값이 있을 수 있어요. PER은 최근 4분기 순이익 기준이에요.</p>`;
}

// 다음 실적 발표일·배당 일정 한 줄 (야후 무료 자료, 매주 토요일 갱신)
const TODAY = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);  // 한국 날짜
const dday = (d) => { const n = Math.round((Date.parse(d) - Date.parse(TODAY())) / 864e5); return n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 전`; };
const ymd = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
function eventsLine(f) {
  const e = f.events || {};
  const parts = [];
  if (e.earn) parts.push(`실적 발표 <b>${ymd(e.earn)}</b> (${dday(e.earn)})`);
  if (e.exdiv) parts.push(`${term("배당락")} ${ymd(e.exdiv)}${e.exdiv >= TODAY() ? ` (${dday(e.exdiv)})` : ""}`);
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
  return `<div class="tgt"><h3 class="muted" style="margin:14px 0 6px">애널리스트 ${term("목표주가")} <small>${t.n}명 평균</small></h3>
    <p class="sub" style="margin:0"><b>${price(market, t.mean)}</b>${up == null ? "" : ` · 지금보다 <b class="${sign(up)}">${pct(up)}</b>`}${t.rec ? ` · 의견 <b>${esc(t.rec)}</b>` : ""}</p>
    ${bar}<div class="legend" style="margin:4px 0 0"><span class="key"><i class="dot now"></i>지금 가격</span><span class="key"><i class="dot mean"></i>평균 목표가</span></div>
    <p class="muted note" style="margin:6px 0 0">증권사 목표가는 대체로 낙관적이고 늦게 바뀌어요. 참고만 하세요.</p></div>`;
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
const HIT_PX = 14;  // 캔들 위아래로 이만큼(화면 점)까지 누르면 그 캔들을 누른 걸로 쳐요
const MAX_SHOW = 1300;  // 한 화면 최대 캔들 수 (상장일부터 일봉은 1만 개가 넘어서, 다 그리면 폰이 버벅여요. 더 길게는 주봉·월봉으로)
// c = frameCandles()가 만든 캔들 (일봉·주봉·월봉·년봉), show = 처음 보이는 캔들 수
// opts: fmt = 가격 표시, name = 차트 이름, ind = 켜 둔 보조지표 (이동평균선·볼린저밴드는 캔들 위에,
// 거래량·RSI는 캔들 아래 칸에 같은 날짜 축으로 그려요)
function candleChart(el, c, show, reset, onRange, { fmt = num, name = "지수", ind = IND } = {}) {
  if (!el) return;
  const n = c.keys.length;
  const { mas: maLines = [], bb, rsi } = c;
  const key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n || VIEW[key].frame !== c.frame) {
    VIEW[key] = { count: Math.min(show, n), end: n - 1, n, frame: c.frame, pick: null };
  }
  const v = VIEW[key];
  let W = 0, H = 0, pad, iw, ih, cw, start, lo, hi, bottom, Yp;
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
    Yp = Y;
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
    const mas = ind.ma ? maLines.slice().reverse().map((m) => line(m.vals, `ma ${m.cls}`)).join("") : "";
    // 지금 값 (가장 최근 캔들 종가). 과거로 밀어 봐도 보이는 구간의 최고·최저를 지금 값과 비교해요.
    const last = c.c[n - 1], lastCls = last >= c.o[n - 1] ? "up" : "down";
    const vsNow = (price) => last / price - 1;  // 최고 대비는 0 또는 마이너스, 최저 대비는 0 또는 플러스
    // 최고·최저 표시 (캔들 옆에 가격 + 지금 값이 얼마나 떨어져 있는지). 글자 길이를 어림해서 오른쪽 가격 축을 덮지 않는 쪽에 써요.
    const mark = (i, price, label, above) => {
      const text = `${label} ${fmt(price)} (${frameLabel(c, i, "short")})`, diff = pct(vsNow(price)), tail = diff;
      const w = [...`${text} ${tail}`].reduce((sum, ch) => sum + (/[가-힣]/.test(ch) ? 11 : 6.5), 0);
      const x = X(i), y = Y(price), right = x + 6 + w <= pad.l + iw || x - 6 - w < pad.l;
      const tx = right ? x + 6 : x - 6, ty = above ? y - 6 : y + 14;
      return `<line class="mark" x1="${x}" x2="${right ? x + 4 : x - 4}" y1="${y}" y2="${y}"/>
        <text class="mark-text" x="${tx}" y="${ty}" text-anchor="${right ? "start" : "end"}">${esc(text)} <tspan class="mark-diff ${sign(vsNow(price))}">${esc(tail)}</tspan></text>`;
    };
    // 지금 값 표시 (오른쪽 축, 마지막 캔들 색)
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
      + `<b class="${sign(ch)}">${pct(ch)}</b><br>${hiLoLine(c.h[hiI], c.l[loI], c.c[n - 1], fmt)}`);
    if (picked) showTip(v.pick, X(v.pick));
  };

  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const prev = i > 0 ? c.c[i - 1] : c.o[i], ch = c.c[i] / prev - 1;
    const row = (label, val) => `<div class="row">${label} <b>${val}</b></div>`;
    let more = "";
    if (ind.ma) more += maLines.map((m) => (m.vals[i] ? row(`${m.p}일선`, fmt(m.vals[i])) : "")).join("");
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

  // 누른 곳이 캔들(고가~저가 근처)인지: 캔들 위아래 빈 곳을 누르면 세부정보를 닫아요. 아래 칸(거래량·RSI)은 캔들로 쳐요.
  const hit = (i, y) => y > pad.t + ih || (Yp && y >= Yp(c.h[i]) - HIT_PX && y <= Yp(c.l[i]) + HIT_PX);
  chartGestures(el, v, () => ({ start, cw, pad, W, hit }), draw, showTip);
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

// 보이는 구간 최고·최저와 지금 값 차이 (차트 위 한 줄): 최고 대비 얼마 내려와 있고, 최저 대비 얼마 올라와 있는지.
// 차이 금액은 가격과 같은 모양(fmt)으로, 앞에 +/-를 붙여요.
function hiLoLine(hi, lo, now, fmt) {
  const gap = (p) => {
    const d = now - p, r = now / p - 1;
    return `<span class="${sign(r)}">${d > 0 ? "+" : d < 0 ? "-" : ""}${esc(fmt(Math.abs(d)))} (${pct(r)})</span>`;
  };
  return `<span class="nowrap">최고 ${esc(fmt(hi))} 대비 ${gap(hi)}</span> · <span class="nowrap">최저 ${esc(fmt(lo))} 대비 ${gap(lo)}</span>`;
}

// 차트 손가락·마우스 조작 (캔들 차트·비교 차트 같이): 옆으로 밀기, 두 손가락 확대·축소, 누르면 세부정보,
// 길게 누른 채 움직이면 세부정보가 손가락을 따라가요. geo()는 지금 그린 차트의 첫 칸·칸 폭·여백·폭이에요.
function chartGestures(el, v, geo, draw, showTip) {
  const pts = new Map();
  let gesture = null, raf = 0, hold = 0;
  const HOLD_MS = 280;  // 이만큼 가만히 누르고 있으면 세부정보가 손가락을 따라가요
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const scale = () => el.getBoundingClientRect().width / geo().W;
  const svgX = (clientX) => (clientX - el.getBoundingClientRect().left) / scale();
  const xOf = (i) => { const { start, cw, pad } = geo(); return pad.l + (i - start + 0.5) * cw; };
  const svgY = (clientY) => (clientY - el.getBoundingClientRect().top) / scale();
  const candleAt = (clientX) => { const { start, cw, pad } = geo(); return Math.round(start + (svgX(clientX) - pad.l) / cw - 0.5); };
  // 세부정보 닫기 (선과 상자만 숨겨요)
  const closeTip = () => {
    if (v.pick == null) return;
    v.pick = null;
    const tip = $(".tip", el), cross = $("line.cross", el);
    if (tip) tip.style.display = "none";
    if (cross) cross.style.display = "none";
  };
  el._closeTip = closeTip;
  // 차트 밖 아무 데나 눌러도 닫혀요 (화면에 차트가 없어지면 그만 들어요)
  if (!el._outside) {
    el._outside = (e) => {
      if (!el.isConnected) { document.removeEventListener("pointerdown", el._outside, true); return; }
      if (!el.contains(e.target)) el._closeTip();
    };
    document.addEventListener("pointerdown", el._outside, true);
  }
  const stopHold = () => { clearTimeout(hold); hold = 0; };
  // 고른 캔들만 바꿔요 (차트 전체를 다시 그리지 않고 선과 세부정보만 옮겨서 손가락을 바로 따라가요)
  const movePick = (clientX) => {
    const i = Math.max(geo().start, Math.min(Math.round(v.end), candleAt(clientX)));
    if (i === v.pick && $(".tip", el).style.display !== "none") return;
    v.pick = i;
    const x = xOf(i), cross = $("line.cross", el);
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
      gesture = { type: "tap", x0: e.clientX, y0: e.clientY, end0: v.end, onTip: Boolean(e.target.closest && e.target.closest(".tip")) };
      // 세부정보가 떠 있으면 그 선 근처를 잡고 밀어서 바로 옮길 수 있어요
      const { start, cw } = geo();
      const onLine = v.pick != null && v.pick >= start && v.pick <= Math.round(v.end)
        && Math.abs(svgX(e.clientX) - xOf(v.pick)) <= Math.max(cw, 28 / scale());
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
      if (gesture.type === "pan") { v.end = gesture.end0 - dx / (geo().cw * scale()); redraw(); }
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
      // 캔들을 누르면 세부정보, 같은 캔들을 다시 누르거나 빈 곳·세부정보 상자를 누르면 닫혀요
      const i = candleAt(e.clientX), { hit } = geo();
      const onCandle = !gesture.onTip && i >= geo().start && i <= Math.round(v.end) && (!hit || hit(i, svgY(e.clientY)));
      v.pick = onCandle && v.pick !== i ? i : null;
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
}

// 선 차트 (SVG). 같은 단위 시리즈만 한 축에 그려요. 손가락으로 좌우로 밀면 그날 값이 보여요.
function lineChart(el, { dates, series, fmt, zero, tall, xfmt = (s) => s.slice(2).replace(/-/g, ".") }) {
  if (!el) return;
  const draw = (anim) => {
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
    const labels = ends.map((e) => `<text class="lc-end" x="${pad.l + iw + 6}" y="${e.y + 4}" style="fill:var(--text-secondary)">${e.arrow}${esc(fmt(e.v))}</text>`).join("");
    const zl = zero ? `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(0)}" y2="${y(0)}"/>` : "";
    const clip = `clip${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(", "))} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l - 4}" y="${pad.t}" width="${iw + 8}" height="${ih}"/></clipPath></defs>
      ${grid}${zl}<g class="lc-lines" clip-path="url(#${clip})">${paths}</g>${labels}${xl}
      <g class="hover" style="display:none"><line class="cross" y1="${pad.t}" y2="${pad.t + ih}"/>
        ${series.map((s) => `<circle r="4.5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`).join("")}</g>
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" style="display:none"></div>`;
    const svg = $("svg", el), g = $(".hover", el), tip = $(".tip", el);
    if (anim) drawIn(svg, { x0: pad.l, w: iw, sel: ".lc-lines > *", late: ".lc-end" });
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
  draw(drawSoon(el));
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }  // 화면을 바꿔 사라진 차트
    if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); }
  });
  ro.observe(el);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => selectMarket(b.dataset.market)));
$(".search-btn").addEventListener("click", () => go("search"));
$(".fb-open").addEventListener("click", () => go("feedback"));  // 맨 아래 '의견·수정 요청 보내기'

inboxHandle($(".inbox-btn"));
