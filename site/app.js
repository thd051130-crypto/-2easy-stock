// 이지스톡 대시보드: data.json(dashboard.py가 매일 만듦)을 읽어 국장·미장 화면을 그려요.
"use strict";

const NEXT_RUN = { kr: "평일 한국시간 17:30쯤", us: "화~토 한국시간 07:30쯤" };
const US_ACTION = {
  buy: ["매수 신호", "다음 거래일 시가에 계좌의 50%를 S&P500 ETF로 사요."],
  hold: ["보유 유지", "계좌의 50%는 S&P500 ETF, 나머지는 현금으로 둬요."],
  sell: ["매도 신호", "추세가 꺾여서 다음 거래일 시가에 ETF를 전부 팔아요."],
  cash: ["현금 유지", "S&P500 추세가 약하거나 변동성이 커서 사지 않아요."],
};

const PERIODS = [["1w", "1주", 5], ["1m", "1개월", 21], ["1y", "1년", 260]];  // 거래일 수
let DATA = null;
let period = "1m";
try { period = localStorage.getItem("period") || "1m"; } catch (e) { /* 기본값 */ }
let market = "kr";
try { market = localStorage.getItem("market") || "kr"; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
if (location.hash === "#us" || location.hash === "#kr") market = location.hash.slice(1);

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
const md = (d) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");
const shares = (q) => (Number.isInteger(q) ? `${q}주` : `${q.toFixed(3)}주`);

async function load() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $("#app").innerHTML = `<div class="card"><p class="empty">데이터를 못 불러왔어요. 인터넷 연결을 확인하고 다시 열어 주세요.</p></div>`;
    return;
  }
  $("#updated").textContent = `화면 데이터 갱신: ${DATA.built.replace("T", " ").slice(0, 16)} (한국시간)`;
  render();
}

function selectTab(m) {
  market = m;
  try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ }
  history.replaceState(null, "", `#${m}`);
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === m)));
  render();
}

function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === market)));
  if (!DATA) return;
  const d = DATA.markets[market];
  const app = $("#app");
  app.innerHTML = [signalCard(d), desksCard(d), accountCard(d), positionsCard(d), tradesCard(d), rulebookCard(d),
    trendCard(d), rulesCard(d)].join("");
  const acc = d.account;
  if (acc && acc.curve.length) {
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
  drawTrend(d);
  document.querySelectorAll(".period button").forEach((b) => b.addEventListener("click", () => {
    period = b.dataset.period;
    try { localStorage.setItem("period", period); } catch (e) { /* 무시 */ }
    document.querySelectorAll(".period button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawTrend(d, true);
  }));
}

// 지수 추세: 고른 기간(1주·1개월·1년)만 잘라 그려요. 짧은 기간은 지수 움직임이 보이게 지수 기준으로 세로축을 맞춰요.
// 캔들 데이터가 있으면 캔들 차트, 없으면(예전 기록) 종가 선 그래프
function drawTrend(d, reset) {
  const c = d.signal && d.signal.candles;
  const days = (PERIODS.find((p) => p[0] === period) || PERIODS[1])[2];
  if (c && c.dates.length) {
    candleChart($("#trend-chart"), c, days, reset, (txt) => { $("#trend-change").innerHTML = txt; });
    return;
  }
  drawTrendLine(d);
}

function drawTrendLine(d) {
  const s = d.signal && d.signal.series;
  if (!s || !s.dates.length) return;
  const days = (PERIODS.find((p) => p[0] === period) || PERIODS[2])[2];
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
  const label = (PERIODS.find((p) => p[0] === period) || PERIODS[2])[1];
  $("#trend-change").innerHTML = first && last
    ? `최근 ${label} <b class="${sign(last / first - 1)}">${pct(last / first - 1)}</b> (${num(first)} → ${num(last)})` : "";
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
    const items = s.picks.map((p, i) => `<li><div class="l">
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
    return `<section class="card"><h2>가상계좌 <small>${money(market, d.capital)}로 시작</small></h2>
      <p class="empty">아직 첫 기록 전이에요. ${NEXT_RUN[market]} 첫 자동 실행부터 신호대로 샀다고 치고 날마다 기록해요.</p></section>`;
  }
  const pending = [];
  if (a.pending_buys.length) pending.push(`다음 거래일 시가 매수 예정: ${a.pending_buys.map(esc).join(", ")}`);
  if (a.pending_sells.length) pending.push(`다음 거래일 시가 매도 예정: ${a.pending_sells.map(esc).join(", ")}`);
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
    ${pending.map((p) => `<p class="muted" style="margin:8px 0 0">${p}</p>`).join("")}
  </section>`;
}

function positionsCard(d) {
  const a = d.account;
  if (!a) return "";
  const items = a.positions.map((p) => `<li><div class="l"><div class="name">${esc(p.name)}</div>
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
  const buttons = PERIODS.map(([key, label]) =>
    `<button type="button" data-period="${key}" aria-pressed="${key === period}">${label}</button>`).join("");
  return `<section class="card"><h2>${esc(d.index_name)} 추세</h2>
    <div class="period" role="group" aria-label="기간">${buttons}</div>
    <p class="muted" id="trend-change" style="margin:8px 0 4px"></p>
    ${d.signal.candles ? `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--up)"></i>상승</span>
      <span class="key"><i class="sw" style="background:var(--down)"></i>하락</span>
      <span class="key"><i class="sw" style="background:var(--ma50)"></i>50일선</span>
      <span class="key"><i class="sw" style="background:var(--ma200)"></i>200일선</span></div>` : `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--series-1)"></i>${esc(d.index_name)}</span>
      <span class="key"><i class="sw" style="background:var(--series-2)"></i>50일선</span>
      <span class="key"><i class="sw" style="background:var(--series-3)"></i>200일선</span></div>`}
    <div class="chart candle" id="trend-chart"></div>
    <p class="muted" style="margin:8px 0 0">${d.signal.candles
      ? "옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 시가·고가·저가·종가가 보여요. "
      : ""}지수가 두 이동평균선 위에 있을 때만 새로 사요.</p></section>`;
}

// 내 매매 규칙표: 알림과 따로 가상계좌로 검증 중 (예전 데이터엔 없을 수 있어요)
function rulebookCard(d) {
  const rb = d.rulebook;
  if (!rb) return "";
  const picks = (d.signal && d.signal.rulebook) || [];
  const unit = market === "kr" ? "원" : "달러";
  const items = picks.map((p, i) => `<li><div class="l">
      <div class="name">${i + 1}. ${esc(p.name)} <span class="meta">${esc(p.code)}</span></div>${opinion(p.opinion)}</div>
      <div class="r">${num(p.close)}${unit}</div></li>`).join("");
  const a = rb.account;
  const main = d.account;
  const acc = a
    ? `<div class="stats">
        <div class="stat"><span>규칙표 계좌</span><b class="${sign(a.gain)}">${pct(a.gain)}</b></div>
        <div class="stat"><span>알림 규칙 계좌</span><b class="${main ? sign(main.gain) : ""}">${main ? pct(main.gain) : "-"}</b></div>
        <div class="stat"><span>최대 낙폭</span><b>${pct(a.mdd)}</b></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${money(market, a.equity)} · 끝난 거래 ${a.trade_count}건${a.trade_count ? ` · 승률 ${Math.round(a.win_rate * 100)}%` : ""} · 보유 ${a.positions.length}종목</p>`
    : `<p class="empty">${NEXT_RUN[market]} 첫 자동 실행부터 기록해요.</p>`;
  return `<section class="card"><h2>내 규칙표 검증 <small>가상계좌</small></h2>${acc}
    <p class="sub" style="margin-top:12px">오늘 규칙표 후보 ${picks.length}개</p>
    ${items ? `<ul class="list">${items}</ul>` : `<p class="empty">오늘은 규칙표 조건에 맞는 종목이 없어요.</p>`}
    <details><summary>규칙표 보기</summary><ol>${rb.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details>
  </section>`;
}

function rulesCard(d) {
  return `<section class="card"><details><summary>${esc(d.name)} 규칙 보기</summary>
    <ol>${d.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details></section>`;
}

// 캔들 차트 (SVG). 가격 축은 오른쪽, 보이는 구간의 최고·최저를 표시해요.
// 한 손가락으로 옆으로 밀면 과거로, 두 손가락 벌리기·오므리기(또는 마우스 휠)로 확대·축소, 짧게 누르면 그날 값.
const VIEW = {};  // 차트별 보기 상태 (보이는 캔들 수, 마지막 캔들 위치)
function candleChart(el, c, days, reset, onRange) {
  if (!el) return;
  const n = c.dates.length;
  const ma = (k) => { const out = new Array(n).fill(null); let sum = 0;
    for (let i = 0; i < n; i++) { sum += c.c[i]; if (i >= k) sum -= c.c[i - k]; if (i >= k - 1) out[i] = sum / k; } return out; };
  const ma50 = ma(50), ma200 = ma(200);
  const key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n) VIEW[key] = { count: Math.min(days, n), end: n - 1, n, pick: null };
  const v = VIEW[key];
  const fmt = (x) => num(x);
  let W = 0, H = 0, pad, iw, ih, cw, start, lo, hi;

  const draw = () => {
    W = Math.max(el.clientWidth, 260);
    H = Math.round(Math.max(300, window.innerHeight * 0.55));
    pad = { l: 6, r: 62, t: 22, b: 22 };
    iw = W - pad.l - pad.r; ih = H - pad.t - pad.b;
    v.count = Math.max(5, Math.min(n, v.count));
    v.end = Math.max(v.count - 1, Math.min(n - 1, v.end));
    const endI = Math.round(v.end);
    start = endI - Math.round(v.count) + 1;
    cw = iw / Math.round(v.count);
    let hiI = start, loI = start;
    for (let i = start; i <= endI; i++) { if (c.h[i] > c.h[hiI]) hiI = i; if (c.l[i] < c.l[loI]) loI = i; }
    hi = c.h[hiI]; lo = c.l[loI];
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
    const line = (vals, cls) => {
      let dstr = "", pen = false;
      for (let i = start; i <= endI; i++) {
        const val = vals[i]; if (val == null) { pen = false; continue; }
        dstr += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(val).toFixed(1)}`; pen = true;
      }
      return `<path class="${cls}" d="${dstr}"/>`;
    };
    // 최고·최저 표시 (캔들 옆에 가격, 화면 밖으로 안 나가게 좌우를 골라요)
    const mark = (i, price, label, above) => {
      const x = X(i), y = Y(price), right = x < pad.l + iw * 0.6;
      const tx = right ? x + 6 : x - 6, ty = above ? y - 6 : y + 14;
      return `<line class="mark" x1="${x}" x2="${right ? x + 4 : x - 4}" y1="${y}" y2="${y}"/>
        <text class="mark-text" x="${tx}" y="${ty}" text-anchor="${right ? "start" : "end"}">${label} ${esc(fmt(price))} (${md(c.dates[i])})</text>`;
    };
    // 지금 값 표시 (오른쪽 축, 마지막 캔들 색)
    const last = c.c[n - 1], lastCls = last >= c.o[n - 1] ? "up" : "down";
    const ly = Math.min(pad.t + ih, Math.max(pad.t, Y(last)));
    const nowTag = `<line class="now ${lastCls}" x1="${pad.l}" x2="${pad.l + iw}" y1="${ly}" y2="${ly}"/>
      <rect class="tag ${lastCls}" x="${pad.l + iw + 1}" y="${ly - 9}" width="${pad.r - 2}" height="18" rx="3"/>
      <text class="tag-text" x="${pad.l + iw + 6}" y="${ly + 4}">${esc(fmt(last))}</text>`;
    const xs = [start, Math.round((start + endI) / 2), endI];
    const xl = xs.map((i, k) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${esc(c.dates[i].slice(2).replace(/-/g, "."))}</text>`).join("");
    const clip = `cc-${key}`;
    let pickSvg = "";
    if (v.pick != null && v.pick >= start && v.pick <= endI) {
      pickSvg = `<line class="cross" x1="${X(v.pick)}" x2="${X(v.pick)}" y1="${pad.t}" y2="${pad.t + ih}"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="지수 캔들 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath></defs>
      ${grid}<g clip-path="url(#${clip})">${line(ma200, "ma ma200")}${line(ma50, "ma ma50")}${bodies}${pickSvg}</g>
      ${mark(hiI, c.h[hiI], "최고", true)}${mark(loI, c.l[loI], "최저", false)}${nowTag}${xl}</svg>
      <div class="tip" style="display:none"></div>`;
    const first = start > 0 ? c.c[start - 1] : c.o[start];
    const ch = c.c[endI] / first - 1;
    onRange(`${c.dates[start].slice(2).replace(/-/g, ".")} ~ ${c.dates[endI].slice(2).replace(/-/g, ".")} (${Math.round(v.count)}일) `
      + `<b class="${sign(ch)}">${pct(ch)}</b> · 최고 ${fmt(c.h[hiI])} · 최저 ${fmt(c.l[loI])}`);
    if (v.pick != null && v.pick >= start && v.pick <= endI) showTip(v.pick, X(v.pick));
  };

  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const prev = i > 0 ? c.c[i - 1] : c.o[i], ch = c.c[i] / prev - 1;
    tip.innerHTML = `<div class="muted">${esc(c.dates[i])}</div>
      <div class="row">시가 <b>${fmt(c.o[i])}</b></div><div class="row">고가 <b>${fmt(c.h[i])}</b></div>
      <div class="row">저가 <b>${fmt(c.l[i])}</b></div><div class="row">종가 <b>${fmt(c.c[i])}</b> <span class="${sign(ch)}">${pct(ch, 2)}</span></div>
      ${ma50[i] ? `<div class="row">50일선 <b>${fmt(ma50[i])}</b></div>` : ""}${ma200[i] ? `<div class="row">200일선 <b>${fmt(ma200[i])}</b></div>` : ""}`;
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
  let w = el.clientWidth;
  if (!el._ro) {
    el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } });
    el._ro.observe(el);
  }
}

// 선 차트 (SVG). 같은 단위 시리즈만 한 축에 그려요. 손가락으로 좌우로 밀면 그날 값이 보여요.
function lineChart(el, { dates, series, fmt, zero, tall }) {
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
      `<text x="${x(i)}" y="${H - 6}" text-anchor="${arr.length === 1 ? "middle" : k === 0 ? "start" : k === arr.length - 1 ? "end" : "middle"}">${esc(dates[i].slice(2).replace(/-/g, "."))}</text>`).join("");
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
  new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } }).observe(el);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.market)));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
load();
