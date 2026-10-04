// 이지스톡 대시보드: data.json(dashboard.py가 매일 만듦)을 읽어 국장·미장 화면을 그려요.
"use strict";

const NEXT_RUN = { kr: "평일 한국시간 17:30쯤", us: "화~토 한국시간 07:30쯤" };
const US_ACTION = {
  buy: ["매수 신호", "다음 거래일 시가에 계좌의 50%를 S&P500 ETF로 사요."],
  hold: ["보유 유지", "계좌의 50%는 S&P500 ETF, 나머지는 현금으로 둬요."],
  sell: ["매도 신호", "추세가 꺾여서 다음 거래일 시가에 ETF를 전부 팔아요."],
  cash: ["현금 유지", "S&P500 추세 조건이 아니라서 사지 않아요."],
};

let DATA = null;
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
  app.innerHTML = [signalCard(d), watchCard(d), conditionsCard(d), accountCard(d), positionsCard(d), tradesCard(d), trendCard(d),
    rulesCard(d)].join("");
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
    });
  }
  const s = d.signal && d.signal.series;
  if (s && s.dates.length) {
    lineChart($("#trend-chart"), {
      dates: s.dates,
      series: [
        { name: d.index_name, color: "var(--series-1)", values: s.close },
        { name: "50일선", color: "var(--series-2)", values: s.ma50 },
        { name: "200일선", color: "var(--series-3)", values: s.ma200 },
      ],
      fmt: (v) => num(v),
    });
  }
}

function signalCard(d) {
  const s = d.signal;
  if (!s) {
    return `<section class="card"><h2>오늘의 신호</h2>
      <p class="empty">아직 계산된 신호가 없어요. ${NEXT_RUN[market]} 자동으로 계산되면 여기에 떠요.</p></section>`;
  }
  const chip = s.ok
    ? `<span class="chip good">● 추세 조건 충족</span>`
    : `<span class="chip wait">■ 추세 조건 미달</span>`;
  const gap = s.index / s.ma200 - 1;
  const idx = `<p class="sub">${esc(d.index_name)} ${num(s.index)} · 50일선 ${num(s.ma50)} · 200일선 ${num(s.ma200)} (${pct(gap)})</p>`;
  const marketChecks = checkChips([
    { label: `${d.index_name} 200일선 위`, ok: s.index > s.ma200 },
    market === "us" ? { label: "50일선 > 200일선", ok: s.ma50 > s.ma200 } : { label: `${d.index_name} 50일선 위`, ok: s.index > s.ma50 },
  ]);
  let body;
  if (market === "us") {
    const [title, desc] = US_ACTION[s.action] || ["-", ""];
    const etf = s.etf_close ? `<p class="muted">${esc(s.etf)} 종가 ${price("us", s.etf_close)} · ${money("us", d.capital)} 계좌면 ${money("us", d.capital / 2)} ≈ ${(d.capital / 2 / s.etf_close).toFixed(3)}주</p>` : "";
    body = `<p class="headline">${title}</p><p class="sub">${desc}</p>${idx}${etf}${opinion(s.opinion)}`;
  } else if (!s.ok) {
    body = `<p class="headline">신규 매수 쉬는 날</p><p class="sub">코스피가 50일선이나 200일선 아래라 새로 사지 않아요.</p>${idx}`;
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
  return `<section class="card"><h2>오늘의 신호 <small>${md(s.day)} 종가 기준</small></h2>${chip}${body}${marketChecks}</section>`;
}

// 규칙으로 만든 매매 의견 (이유, 위험 등). 예전 기록엔 없을 수 있어요.
function opinion(lines) {
  if (!lines || !lines.length) return "";
  return lines.map((l) => `<div class="opinion">${esc(l)}</div>`).join("");
}

// 조건 하나하나를 ✓/✗ 칩으로 (색만으로 구분하지 않게 기호를 같이 써요)
function checkChips(checks) {
  return `<div class="checks">${checks.map((c) => `<span class="check ${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✗"} ${esc(c.label)}${
    c.detail ? ` <em>${esc(c.detail)}</em>` : ""}</span>`).join("")}</div>`;
}

function conditionRow(r, unit) {
  if (r.missing) {
    return `<li><div class="l"><div class="name">${esc(r.name)} <span class="meta">${esc(r.code)}</span></div>
      <div class="meta">시세를 못 찾았어요. watchlist.txt의 종목코드를 확인해 주세요.</div></div></li>`;
  }
  const badge = r.signal ? `<span class="chip good">● ${market === "us" ? "추세 충족" : "신호"}</span>` : `<span class="count">${r.met}/${r.total}</span>`;
  return `<li class="cond"><div class="l" style="width:100%">
      <div class="row-top"><div class="name">${esc(r.name)} <span class="meta">${esc(r.code)}</span></div>
        <div class="r">${badge} <span class="meta">${unit(r.close)}</span></div></div>
      ${checkChips(r.checks)}
      ${r.todo.map((t) => `<div class="meta todo">→ ${esc(t)}</div>`).join("")}</div></li>`;
}

function watchCard(d) {
  const s = d.signal;
  if (!s || !s.watch) return "";
  const unit = (x) => price(market, x);
  const note = market === "us"
    ? "S&P500에 쓰는 추세 조건을 이 종목에 대 본 참고용이에요. 가상계좌는 지수 ETF만 사요."
    : "국장 규칙 조건을 그대로 채점했어요. 대상 30종목 밖이면 가상계좌는 사지 않아요.";
  const body = s.watch.length
    ? `<ul class="list">${s.watch.map((r) => conditionRow(r, unit)).join("")}</ul>`
    : `<p class="empty">아직 관심종목이 없어요.</p>`;
  return `<section class="card"><h2>관심종목 <small>${s.watch.length}개</small></h2>${body}
    <p class="muted" style="margin:8px 0 0">${note} 종목은 저장소의 watchlist.txt에서 바꿔요.</p></section>`;
}

function conditionsCard(d) {
  const s = d.signal;
  if (!s || !s.checks || !s.checks.length) return "";
  const unit = (x) => price(market, x);
  const top = s.checks.slice(0, 5), rest = s.checks.slice(5);
  return `<section class="card"><h2>신호 조건 <small>신호에 가까운 순</small></h2>
    <ul class="list">${top.map((r) => conditionRow(r, unit)).join("")}</ul>
    ${rest.length ? `<details style="margin-top:8px"><summary>나머지 ${rest.length}종목 보기</summary>
      <ul class="list" style="margin-top:8px">${rest.map((r) => conditionRow(r, unit)).join("")}</ul></details>` : ""}
    <p class="muted" style="margin:8px 0 0">4가지가 모두 ✓이면 다음 거래일 시가에 사요.</p></section>`;
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
  return `<section class="card"><h2>${esc(d.index_name)} 추세 <small>최근 1년</small></h2>
    <div class="legend">
      <span class="key"><i class="sw" style="background:var(--series-1)"></i>${esc(d.index_name)}</span>
      <span class="key"><i class="sw" style="background:var(--series-2)"></i>50일선</span>
      <span class="key"><i class="sw" style="background:var(--series-3)"></i>200일선</span></div>
    <div class="chart" id="trend-chart"></div>
    <p class="muted" style="margin:8px 0 0">지수가 두 이동평균선 위에 있을 때만 새로 사요.</p></section>`;
}

function rulesCard(d) {
  return `<section class="card"><details><summary>${esc(d.name)} 규칙 보기</summary>
    <ol>${d.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></details></section>`;
}

// 선 차트 (SVG). 같은 단위 시리즈만 한 축에 그려요. 손가락으로 좌우로 밀면 그날 값이 보여요.
function lineChart(el, { dates, series, fmt, zero }) {
  if (!el) return;
  const draw = () => {
    const W = Math.max(el.clientWidth, 260), H = 190;
    const pad = { l: 48, r: 54, t: 8, b: 22 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = dates.length;
    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    if (zero) all.push(0);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-9) { lo -= Math.abs(lo) * 0.01 + 0.01; hi += Math.abs(hi) * 0.01 + 0.01; }
    const span = hi - lo; lo -= span * 0.06; hi += span * 0.06;
    const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
    const ticks = [0, 0.5, 1].map((f) => lo + (hi - lo) * (0.1 + 0.8 * f));
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
      const dot = n === 1 && s.values[0] != null ? `<circle cx="${x(0)}" cy="${y(s.values[0])}" r="4" fill="${s.color}"/>` : "";
      return `<path d="${dstr}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dot}`;
    }).join("");
    // 오른쪽 끝 직접 라벨 (겹치면 위아래로 벌려요)
    const ends = series.map((s) => {
      let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--;
      return i < 0 ? null : { s, v: s.values[i], y: y(s.values[i]) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    const labels = ends.map((e) => `<text x="${pad.l + iw + 6}" y="${e.y + 4}" style="fill:var(--text-secondary)">${esc(fmt(e.v))}</text>`).join("");
    const zl = zero ? `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(0)}" y2="${y(0)}"/>` : "";
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(", "))} 차트">
      ${grid}${zl}${paths}${labels}${xl}
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
        c.style.display = v == null ? "none" : "";
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
