"use strict";
const RET = { kr: null, us: null };  // {코드: [시작, 주가 %, 배당 %, 낙폭 %, 햇수]}
let retLoading = null;
function loadReturns() {
  if (!retLoading) {
    retLoading = Promise.all(["kr", "us"].map((m) => fetch(`symbols/${m}_returns.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => {
        RET[m] = (x && x.s) || {};
        RET_IDX[m] = (x && x.idx) || null;  // 폭락 대비 점검: 지수의 하락장 낙폭
        if (x && x.crises) CRISES = x.crises;
      })));
  }
  return retLoading;
}
// 국내 ETF 중 해외 주식·채권·원자재·커버드콜(합성)은 차익에 세금이 붙어요. 이름으로 가려요
// 지금 가격(원화로 1주 얼마). 미장은 환율로 바꿔요. 예금·직접 입력처럼 가격이 없으면 null
function savPx(p) {
  if (!p.m || !p.code) return null;
  const q = QUOTES[p.m] && QUOTES[p.m].q[p.code];
  const dash = !q && DATA.markets[p.m] && stocksOf(DATA.markets[p.m]).find((x) => x.code === p.code);
  const px = (q && q[0]) || (dash && dash.close);
  if (!px) return null;
  const day = q ? QUOTES[p.m].day : DATA.markets[p.m].daily && DATA.markets[p.m].daily.day;
  const fx = p.m === "us" ? DATA.fx || 1350 : 1;
  return { px, fx, day, won: px * fx };
}
// 주 수로 살 때 얼마나 자주: 한 달에 몇 번인지 (매주는 52주/12달, 매일은 장 서는 날 252일/12달)

// ---------------------------------------------------------------- 폭락 대비 점검
// 2008 금융위기·2020 코로나·2022 금리 인상 때 각 종목이 실제로 얼마나 빠졌는지(returns.py가 매주 월봉으로 계산)를
// 관심종목(똑같이 나눠 샀다고 치고)에 그대로 대입해요. 그때 상장 전이면 지수 값으로 대신해요.
const RET_IDX = { kr: null, us: null };  // 지수 하락장 [[낙폭 %, 회복 개월] | null] × 3
let CRISES = ["2008 금융위기", "2020 코로나", "2022 금리 인상"];
function crisisOf(m, code) {
  const r = RET[m] && RET[m][code];
  return (r && r[5]) || null;
}
// 종목들 [{code, name, w(비중 0~1)}] → 하락장마다 {dd, rec, worst, proxies}
function stressRun(m, items, cash) {
  const idx = RET_IDX[m] || [];
  return CRISES.map((name, k) => {
    let dd = 0, rec = 0, slow = false, worst = null;
    const proxies = [];
    items.forEach((it) => {
      const own = crisisOf(m, it.code);
      let c = own && own[k];
      if (!c) { c = idx[k]; if (c) proxies.push(it.name); }
      if (!c) return;
      dd += it.w * c[0];
      if (c[1] == null) slow = true; else rec = Math.max(rec, c[1]);
      if (!worst || c[0] < worst.dd) worst = { name: it.name, dd: c[0] };
    });
    return { name, dd: dd * (1 - cash), rec, slow, worst, proxies, index: idx[k] };
  });
}
function stressCard(d) {
  if (!RET[market]) {
    return `<section class="card" id="stress-card"><h2>폭락 대비 점검</h2><p class="muted">과거 하락장 자료를 불러오는 중이에요…</p></section>`;
  }
  const list = stocksOf(d).filter((s) => WATCH[market].includes(s.code));
  const items = list.map((s) => ({ code: s.code, name: s.name, w: 1 / list.length })), cash = 0;
  const base = market === "kr" ? 1e7 : 7470;
  const what = `관심종목 ${list.length}개에 ${money(market, base)}을 똑같이 나눠 넣었다면`;
  const empty = list.length ? "" : "관심 화면에서 ☆를 눌러 종목을 넣으면 계산해요.";
  const res = stressRun(market, items, cash);
  const worstDd = Math.min(...res.map((r) => r.dd), 0);
  const rows = res.map((r) => {
    const w = Math.min(100, Math.abs(r.dd));
    const iw = r.index ? Math.min(100, Math.abs(r.index[0])) : 0;
    const loss = base * r.dd / 100;
    return `<li class="stress-row"><div class="stress-top"><b>${esc(r.name)}</b>
        <span class="${sign(r.dd)}">${items.length ? `${Math.round(r.dd)}%` : "0%"}${items.length ? ` <small class="muted">(${money(market, Math.round(loss))})</small>` : ""}</span></div>
      <div class="stress-bar" role="img" aria-label="${esc(r.name)} 낙폭 ${Math.round(r.dd)}%, ${esc(d.index_name)} ${r.index ? r.index[0] : "-"}%">
        <i class="me" style="width:${w}%"></i>${r.index ? `<i class="idx" style="left:${iw}%" title="${esc(d.index_name)}"></i>` : ""}</div>
      <div class="meta">${items.length ? `${r.slow ? "아직 회복 못 한 종목 있음" : r.rec ? `가장 늦은 종목 회복 ${r.rec}개월` : "바로 회복"}${r.worst ? ` · 가장 많이 빠진 ${esc(r.worst.name)} ${r.worst.dd}%` : ""} · ` : ""}${esc(d.index_name)} ${r.index ? `${r.index[0]}% (회복 ${r.index[1] == null ? "아직" : `${r.index[1]}개월`})` : "자료 없음"}</div></li>`;
  }).join("");
  const proxies = [...new Set(res.flatMap((r) => r.proxies))];
  const verdict = !items.length ? "" : worstDd > -15 ? `<p class="good-line">✅ 가장 나빴던 때도 ${Math.round(worstDd)}%예요. 버틸 만한 수준이에요.</p>`
    : worstDd > -30 ? `<p class="caution">⚠️ 가장 나빴던 때 ${Math.round(worstDd)}%까지 빠져요. 현금 비중을 늘리거나 종목을 나누는 걸 생각해 보세요.</p>`
      : `<p class="caution">🚨 가장 나빴던 때 ${Math.round(worstDd)}%예요. 낙폭 최소화 원칙보다 훨씬 커요.</p>`;
  return `<section class="card" id="stress-card"><h2>폭락 대비 점검 <small>그때 같은 폭락이 오면</small></h2>
    <p class="muted" style="margin:10px 0 6px">${what}</p>
    ${empty ? `<p class="empty">${empty}</p>` : ""}
    <ul class="list stress-list">${rows}</ul>
    <div class="legend" style="margin:8px 0 0"><span class="key"><i class="sw" style="background:var(--down)"></i>${items.length ? "내 계산" : ""}</span><span class="key"><i class="sw idx-key"></i>${esc(d.index_name)}</span></div>
    ${verdict}
    ${proxies.length ? `<p class="muted" style="margin:8px 0 0">그때 상장 전이라 ${esc(d.index_name)} 값으로 대신 계산: ${proxies.slice(0, 6).map(esc).join(", ")}${proxies.length > 6 ? ` 외 ${proxies.length - 6}개` : ""}</p>` : ""}
    <p class="muted note" style="margin:10px 0 0">낙폭은 하락장 직전 월말 고점에서 월중 최저가까지예요. 회복은 다시 그 고점 종가를 넘기까지 걸린 달이에요(배당 빼고 주가만).
      과거 폭락이 그대로 반복된다는 뜻은 아니에요.</p></section>`;
}
function bindStress() { /* 고를 대상이 관심종목 하나뿐이라 묶을 버튼이 없어요 */ }

// ---------------------------------------------------------------- 사기 전 체크리스트
// 종목 화면 맨 위 신호등. 이미 있는 숫자(지수 추세, 종목 일봉, 재무 등급, 실적 일정)를 한눈에 모아요. 참고용이에요.
const VOL_MAX = { kr: 0.45, us: 0.45 };  // 이보다 크게 출렁이면 주의 (연율)
const SEASONS = [[1, 20, 2, 15], [4, 20, 5, 15], [7, 20, 8, 14], [10, 20, 11, 14]];  // 국장 분기 실적 발표가 몰리는 때
function inSeason(day) {
  const m = +day.slice(5, 7), dd = +day.slice(8, 10);
  return SEASONS.some(([m1, d1, m2, d2]) => (m === m1 && dd >= d1) || (m === m2 && dd <= d2));
}
function checks(d, x) {
  const sig = d.daily || {};
  const out = [];
  const add = (label, state, why) => out.push({ label, state, why });
  const lastOf = (a) => (a || []).filter((v) => v != null).pop();
  const ma50 = lastOf(sig.series && sig.series.ma50), ma200 = lastOf(sig.series && sig.series.ma200);
  if (sig.index && ma50 && ma200) {
    const up = sig.index > ma200 && sig.index > ma50;
    add("시장 추세", up ? "ok" : sig.index > ma200 ? "warn" : "bad",
      `${esc(d.index_name)}가 50일선 ${sig.index > ma50 ? "위" : "아래"}, 200일선 ${sig.index > ma200 ? "위" : "아래"}`);
  } else add("시장 추세", "na", "지수 자료 없음");
  const c = x && x.candles;
  const cl = c && c.c && c.c.length > 30 ? c.c : null;
  if (cl && cl.length >= 200) {
    const ma = cl.slice(-200).reduce((a, b) => a + b, 0) / 200, last = cl[cl.length - 1];
    add("종목 200일선", last > ma ? "ok" : "bad", `종가가 200일선보다 ${pct(last / ma - 1)}`);
  } else add("종목 200일선", "na", cl ? "상장 200일이 안 됐어요" : "일봉 자료 없음");
  if (cl) {
    const r = rsiOf(cl, 14).filter((v) => v != null);
    const v = r[r.length - 1];
    if (v != null) add("과열 아님", v >= 70 ? "bad" : v >= 60 ? "warn" : "ok", `${term("RSI", "RSI14")} ${Math.round(v)} (70 넘으면 과열)`);
    const hi = Math.max(...cl.slice(-250)), last = cl[cl.length - 1], off = last / hi - 1;
    add("고점 대비", off >= -0.15 ? "ok" : off >= -0.3 ? "warn" : "bad", `52주 고점보다 ${pct(off)}${off < -0.3 ? " (떨어지는 칼날 조심)" : ""}`);
    const rets = cl.slice(-21).map((v2, i, a) => (i ? Math.log(v2 / a[i - 1]) : null)).filter((v2) => v2 != null);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(252);
    add("변동성", vol <= VOL_MAX[market] * 0.7 ? "ok" : vol <= VOL_MAX[market] ? "warn" : "bad", `최근 20일 연 ${Math.round(vol * 100)}% 출렁임 (주의 기준 ${Math.round(VOL_MAX[market] * 100)}%)`);
  }
  const f = (x && x.fund) || (d.funds || {})[stockCode] || {};
  const earn = f.events && f.events.earn;
  const today = TODAY();
  const nEarn = earn ? Math.round((Date.parse(earn) - Date.parse(today)) / 864e5) : null;
  if (nEarn != null && nEarn >= 0 && nEarn <= 7) add("실적 발표", "bad", `실적 발표 ${ymd(earn)} (${dday(earn)}). 발표 직후 크게 움직일 수 있어요`);
  else if (market === "kr" && inSeason(today)) add("실적 발표", "warn", "국장 실적 시즌이에요. 발표 뒤 크게 움직이는 종목이 많아요");
  else add("실적 발표", "ok", earn && nEarn > 0 ? `다음 발표 ${ymd(earn)} (${dday(earn)})` : "가까운 발표 없음");
  const g = f.grade;
  if (g && g[2]) {
    const r = g[1] / g[2];
    add("재무 등급", f.loss ? "bad" : r >= 0.8 ? "ok" : r >= 0.6 ? "warn" : "bad", `${esc(g[0] || "")} ${g[1]}/${g[2]}${f.loss ? " · 적자" : ""}`);
  } else if (f.grade && f.grade.total) {
    const r = f.grade.score / f.grade.total;
    add("재무 등급", f.loss ? "bad" : r >= 0.8 ? "ok" : r >= 0.6 ? "warn" : "bad", `${esc(f.grade.grade || "")} ${f.grade.score}/${f.grade.total}${f.loss ? " · 적자" : ""}`);
  } else add("재무 등급", "na", "재무 자료 없음 (ETF거나 아직 못 받음)");
  return out;
}
const LIGHT = { ok: ["🟢", "통과"], warn: ["🟡", "주의"], bad: ["🔴", "걸림"], na: ["⚪", "모름"] };
function checkCard(d) {
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  if (!x && STOCK_DATA.has(`${market}/${stockCode}`)) {
    return `<section class="card" id="check-card"><h2>사기 전 체크리스트</h2><p class="muted">종목 자료를 불러오는 중이에요…</p></section>`;
  }
  const list = checks(d, x);
  const known = list.filter((c) => c.state !== "na");
  const okN = known.filter((c) => c.state === "ok").length, badN = known.filter((c) => c.state === "bad").length;
  const head = !known.length ? "판단할 자료가 없어요" : badN ? `${known.length}개 중 ${okN}개 통과, ${badN}개 걸림`
    : okN === known.length ? `${known.length}개 모두 통과` : `${known.length}개 중 ${okN}개 통과, 나머지 주의`;
  return `<section class="card" id="check-card"><h2>사기 전 체크리스트 <small>${head}</small></h2>
    <ul class="checks">${list.map((c) => `<li class="ck-${c.state}"><span class="ck-dot" aria-hidden="true">${LIGHT[c.state][0]}</span>
      <span class="ck-l"><b>${c.label}</b> <span class="sr">${LIGHT[c.state][1]}</span><small>${c.why}</small></span></li>`).join("")}</ul>
    <p class="muted note" style="margin:10px 0 0">빨간 불이 하나라도 있으면 기다리는 게 보수적인 선택이에요. 모두 초록이어도 매수 추천은 아니에요. 지수 추세는 매일 자료, 나머지는 일봉·재무(매주 갱신) 기준이에요.</p></section>`;
}
function fillCheck() {
  const el = $("#check-card");
  if (el && DATA) el.outerHTML = checkCard(DATA.markets[market]);
}

// ---------------------------------------------------------------- 목표 트래커
// 목표 이름·날짜·지금 모은 돈·매달 저축·목표를 넣으면 남은 날, 진척도, 그 속도로 그날 얼마인지 세 가지로 보여줘요 (이 폰에만 저장).
// src: "asset" = 지금 모은 돈을 자산 기록의 마지막 달 총자산으로 자동, "manual" = 직접 입력, "" = 아직 안 고름 (사용자 2026-11-20)
const GOAL_START = { title: "목표", end: "", now: 0, monthly: 50, target: 0, src: "" };
const GOAL = { ...GOAL_START };
// 화살표가 원을 그리는 '처음으로' 아이콘 (사용자 2026-10-24)
const RESET_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>`;
try { Object.assign(GOAL, JSON.parse(localStorage.getItem("goal") || "{}")); } catch (e) { /* 처음 */ }
["now", "monthly", "target"].forEach((k) => { GOAL[k] = Number.isFinite(+GOAL[k]) ? +GOAL[k] : GOAL_START[k]; });  // 깨진 숫자면 처음 값 (NaN 글자 막기)
const GOAL_PLANS = [
  ["예금", 0.03 * (1 - 0.154), "연 3% 예금 (이자세 15.4% 뗀 뒤)"],
  ["S&P500 그냥 적립", null, "TIGER 미국S&P500 최근 10년 실제 상승률·분배율 (낙폭 -30% 안팎을 견뎌야 해요)"],
];
function goalRate(p) {
  if (p[1] != null) return p[1];
  const r = RET.kr && RET.kr["360750"];
  return r ? (r[1] + r[2]) / 100 : 0.12;
}
const goalTitle = () => (GOAL.title || "").trim() || "목표";
// 자산 기록에서 총자산(투자금+예수금)을 적은 마지막 달
const goalAstYm = () => astLastYm();
// 아직 안 골랐으면: 자산 기록이 있고 직접 넣은 돈이 없을 때 자동으로 시작해요
const goalSrc = () => (GOAL.src === "asset" || GOAL.src === "manual" ? GOAL.src : goalAstYm() && !(GOAL.now > 0) ? "asset" : "manual");
// 목표 계산에 쓰는 '지금 모은 돈' (만 원)
function goalNow() {
  if (goalSrc() !== "asset") return GOAL.now;
  const ym = goalAstYm();
  if (!ym) return 0;
  return (AST_LIVE ? astEval(ym).total : astSum(ym).total) / 1e4;  // 시세 평가를 켰으면 지금 시세로
}
function goalAstNote() {
  const ym = goalAstYm();
  if (!ym) return `<p class="goal-src-note">자산 기록에 아직 적은 달이 없어요. <button type="button" class="linkish" data-goal-open-ast>자산 기록 열기</button></p>`;
  const s = astSum(ym), old = ym < ymNow();
  if (AST_LIVE) {
    const e = astEval(ym);
    return `<p class="goal-src-note" id="goal-src-note"><b>${ymName(ym)}</b> 기록을 ${astReady() ? esc(astDay(e.day)) : "지금 시세"}로 평가 · 주식 ${astMan(e.val)} + 예수금 ${astMan(e.cash)} = <b>${astMan(e.total)}</b>
      ${old ? `<br>이번 달을 기록하면 바로 바뀌어요.` : ""} <span class="muted">산 돈 기준 ${astMan(s.total)}. 자산 기록에서 시세 평가를 끄면 산 돈으로 계산해요.</span></p>`;
  }
  return `<p class="goal-src-note" id="goal-src-note"><b>${ymName(ym)}</b> 기록 · 투자금 ${astMan(s.cost)} + 예수금 ${astMan(s.cash)} = <b>${astMan(s.total)}</b>
    ${old ? `<br>이번 달을 기록하면 바로 바뀌어요.` : ""} <span class="muted">산 돈 기준이라 지금 시세와는 달라요.</span></p>`;
}
function monthsLeft() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(GOAL.end)) return null;
  const days = Math.round((Date.parse(GOAL.end) - Date.parse(TODAY())) / 864e5);
  if (!Number.isFinite(days)) return null;  // 2026-13-45처럼 없는 날짜면 'D-NaN' 대신 날짜 없음으로
  return { days, months: Math.max(0, days / 30.44) };
}
function futureValue(now, monthly, rate, months) {
  const r = Math.pow(1 + rate, 1 / 12) - 1;
  const n = Math.floor(months);
  let v = now;
  for (let i = 0; i < n; i++) v = v * (1 + r) + monthly;
  return v * (1 + r * (months - n));
}
const man = (v) => (Math.abs(v) >= 1e4 ? `${(v / 1e4).toFixed(Math.abs(v) >= 1e5 ? 0 : 1).replace(/\.0$/, "")}억` : `${Math.round(v).toLocaleString("ko-KR")}만`);
function goalOut() {
  const left = monthsLeft();
  if (!left) return `<p class="muted" style="margin:10px 0 0">목표 날짜를 넣으면 계산해요.</p>`;
  if (left.days < 0) return `<p class="good-line">🎉 목표 날짜가 지났어요. 새 날짜를 넣어 보세요.</p>`;
  const now = goalNow();
  const prog = GOAL.target > 0 ? Math.min(1, now / GOAL.target) : null;
  const plans = GOAL_PLANS.map((p) => ({ name: p[0], note: p[2], v: futureValue(now, GOAL.monthly, goalRate(p), left.months) }));
  const max = Math.max(GOAL.target || 0, ...plans.map((p) => p.v), 1);
  const need = GOAL.target > 0 ? (() => {
    const r = Math.pow(1 + GOAL_PLANS[0][1], 1 / 12) - 1, n = left.months;
    const gap = GOAL.target - now * Math.pow(1 + r, n);
    const k = r ? (Math.pow(1 + r, n) - 1) / r : n;
    return n >= 1 ? Math.max(0, gap / k) : null;
  })() : null;
  return `<div class="goal-top"><div><small>목표일까지</small><b>D-${left.days}</b><small>${Math.floor(left.months)}개월</small></div>
      <div><small>지금</small><b>${man(now)}원</b>${prog != null ? `<small>목표의 ${Math.round(prog * 100)}%</small>` : ""}</div>
      <div><small>매달</small><b>${man(GOAL.monthly)}원</b><small>${GOAL.target ? `목표 ${man(GOAL.target)}원` : "목표 없음"}</small></div></div>
    ${prog != null ? `<div class="goal-prog" role="img" aria-label="목표의 ${Math.round(prog * 100)}%"><i style="width:${prog * 100}%"></i></div>` : ""}
    <h3 class="sav-h">이 속도로 모으면 목표일에</h3>
    <ul class="list goal-list">${plans.map((p) => `<li><div class="l"><div class="name">${p.name}</div><div class="meta">${p.note}</div>
        <div class="goal-bar"><i style="width:${(p.v / max) * 100}%"></i>${GOAL.target ? `<em style="left:${(GOAL.target / max) * 100}%" title="목표"></em>` : ""}</div></div>
      <div class="r"><b>${man(p.v)}원</b>${GOAL.target ? `<div class="meta ${p.v >= GOAL.target ? "up" : ""}">${p.v >= GOAL.target ? "목표 달성" : `${man(GOAL.target - p.v)} 모자람`}</div>` : ""}</div></li>`).join("")}</ul>
    ${need != null && need > GOAL.monthly ? `<p class="caution">예금만으로 목표에 닿으려면 매달 ${man(need)}원(지금보다 ${man(need - GOAL.monthly)}원 더)이 필요해요.</p>`
      : need != null ? `<p class="good-line">✅ 예금만으로도 목표에 닿는 속도예요. 굳이 위험을 늘릴 필요가 없어요.</p>` : ""}`;
}
function goalCard() {
  const inp = (k, label, unit, type = "text") => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-goal="${k}" type="${type}" ${type === "text" ? `inputmode="decimal"` : ""} value="${esc(GOAL[k] || (type === "date" ? "" : 0))}">${unit ? `<span>${unit}</span>` : ""}</span></label>`;
  return `<section class="card" id="goal-card"><h2 class="goal-h"><span id="goal-title">${esc(goalTitle())}</span>
    <span class="goal-h-r"><small>이 폰에만 저장</small><button type="button" class="goal-reset" data-goal-reset aria-label="목표 초기화">${RESET_ICON}<span>한 번 더 누르면 초기화</span></button></span></h2>
    <label class="sav-in goal-name"><span>목표 이름</span><span class="alert-input"><input data-goal="title" type="text" maxlength="30" placeholder="목표" value="${esc(GOAL.title || "")}"></span></label>
    <div class="goal-src"><span>지금 모은 돈</span><div class="period" role="group" aria-label="지금 모은 돈 고르기">
      <button type="button" data-goal-src="asset" aria-pressed="${goalSrc() === "asset"}">자산 기록에서</button><button type="button" data-goal-src="manual" aria-pressed="${goalSrc() === "manual"}">직접 입력</button></div></div>
    ${goalSrc() === "asset" ? goalAstNote() : ""}
    <div class="sav-grid">${inp("end", "목표 날짜", "", "date")}${inp("target", "목표 금액", "만 원")}${goalSrc() === "manual" ? inp("now", "지금 모은 돈", "만 원") : ""}${inp("monthly", "매달 저축", "만 원")}</div>
    <div id="goal-out">${goalOut()}</div>
    <p class="muted note" style="margin:10px 0 0">세 가지 모두 과거 수익률을 그대로 가정한 계산이라 보장이 아니에요. 주식 쪽은 중간에 낙폭이 와도 팔지 않고 버틴다는 가정이에요.
      목표일이 가까우면(1~2년) 쓸 돈은 예금에 두는 게 보수적이에요.</p></section>`;
}
function bindGoal() {
  const card = $("#goal-card");
  if (!card) return;
  card.querySelectorAll("[data-goal]").forEach((i) => i.addEventListener(i.type === "date" ? "change" : "input", () => {
    const k = i.dataset.goal;
    GOAL.src = goalSrc();  // 직접 넣기 시작하면 지금 고른 쪽으로 굳혀요 (0을 넣어도 자동으로 안 바뀌게)
    if (k === "end") GOAL.end = i.value;
    else if (k === "title") { GOAL.title = i.value.slice(0, 30); const h = $("#goal-title"); if (h) h.textContent = goalTitle(); }
    else { const v = parseFloat(i.value.replace(/[,\s]/g, "")); GOAL[k] = Number.isFinite(v) && v >= 0 ? Math.min(v, 1e6) : 0; }
    remember("goal", JSON.stringify(GOAL));
    const out = $("#goal-out"); if (out) out.innerHTML = goalOut();
  }));
  // 초기화: 실수로 지우지 않게 한 번 누르면 '한 번 더 누르면 초기화'로 바뀌고, 3초 안에 다시 누르면 처음 상태로
  const rb = card.querySelector("[data-goal-reset]");
  if (rb) rb.addEventListener("click", () => {
    if (!rb.classList.contains("armed")) {
      rb.classList.add("armed");
      setTimeout(() => rb.classList.remove("armed"), 3000);
      return;
    }
    Object.keys(GOAL).forEach((k) => delete GOAL[k]);
    Object.assign(GOAL, GOAL_START);
    try { localStorage.removeItem("goal"); } catch (e) { /* 이번만 */ }
    holdHeight(); card.outerHTML = goalCard();
    bindGoal(); keepTap();
  });
  // 지금 모은 돈: 자산 기록에서 자동 | 직접 입력
  card.querySelectorAll("[data-goal-src]").forEach((b) => b.addEventListener("click", () => {
    if (goalSrc() === b.dataset.goalSrc) return;
    GOAL.src = b.dataset.goalSrc;
    remember("goal", JSON.stringify(GOAL));
    holdHeight(); card.outerHTML = goalCard();
    bindGoal(); keepTap();
  }));
  const oa = card.querySelector("[data-goal-open-ast]");
  if (oa) oa.addEventListener("click", () => { const t = document.querySelector('[data-perf-tab="asset"]'); if (t) t.click(); });
  // 시세 평가를 켰으면 전 종목 시세를 받은 뒤 숫자만 바꿔요
  if (goalSrc() === "asset" && AST_LIVE && goalAstYm() && !astReady()) astLoadQ().then(() => {
    const n = $("#goal-src-note"), o = $("#goal-out");
    if (n && n.isConnected) n.outerHTML = goalAstNote();
    if (o && o.isConnected) o.innerHTML = goalOut();
  });
}
// 홈 리포트 카드에 한 줄 (목표 날짜를 넣었을 때만)
function goalLine() {
  const left = monthsLeft();
  if (!left || left.days < 0) return "";
  const prog = GOAL.target > 0 ? ` · 목표의 ${Math.round(Math.min(1, goalNow() / GOAL.target) * 100)}%` : "";
  return `<p class="muted" style="margin:10px 0 0">🎯 ${esc(goalTitle())}까지 <b>D-${left.days}</b>${prog}</p>`;
}

// ---------------------------------------------------------------- 자산 기록
// 달마다 내 금융자산(계좌 → 종목·주 수·투자금·받은 배당)과 메모를 적어 두고, 지난 기록과 비교해요.
// 이 폰에만 저장해요 (localStorage 'assets'). 백업 파일(asset.js bkBox, 관심 종목·설정까지)로 다른 폰에 옮겨요 (사용자 2026-11-08·11-21)
// 단계: 증권사 → 계좌 → 종목 (사용자 2026-11-08). accts = [{ id, broker, name }] (순서 = 화면 순서, 같은 증권사끼리 붙여 둬요)
// months["2026-11"] = { memo, items: [{ id, acct(계좌 id), m, code, name, qty, cost(원), div(원) }], cash: { 계좌 id: 예수금(원) } }
const AST = { accts: [], months: {}, year: new Date().getFullYear() };
try { Object.assign(AST, JSON.parse(localStorage.getItem("assets") || "{}")); } catch (e) { /* 처음 */ }
const astFix = () => {
  // 예전 기록은 계좌가 이름(글자)뿐이라, 이름을 그대로 id로 써서 종목·예수금이 안 끊겨요
  if (!Array.isArray(AST.accts)) AST.accts = [];
  AST.accts = AST.accts.map((a) => (typeof a === "string" ? { id: a, broker: "내 증권사", name: a } : a))
    .filter((a) => a && a.id).map((a) => ({ id: String(a.id), broker: String(a.broker || "내 증권사").slice(0, 20), name: String(a.name || "계좌").slice(0, 20) }));
  if (!AST.accts.length) AST.accts = [{ id: "a0", broker: "내 증권사", name: "일반 계좌" }];
  if (!AST.months || typeof AST.months !== "object") AST.months = {};
  Object.values(AST.months).forEach((x) => { if (!Array.isArray(x.items)) x.items = []; if (typeof x.memo !== "string") x.memo = ""; if (!x.cash || typeof x.cash !== "object") x.cash = {}; });
  if (!Number.isFinite(+AST.year)) AST.year = new Date().getFullYear();
};
astFix();
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymNow = () => ymOf(new Date());
const ymName = (ym) => { const [y, m] = ym.split("-").map(Number); return `${y}년 ${m}월`; };
const astCashOf = (x) => (x && x.cash ? Object.values(x.cash).reduce((a, v) => a + (+v || 0), 0) : 0);
const astFilled = (ym) => { const x = AST.months[ym]; return !!(x && (x.items.length || astCashOf(x) > 0)); };
// 그 달보다 앞에서 종목을 적은 마지막 달 (빈 달은 건너뛰어요)
const astSum = (ym) => {
  const x = AST.months[ym], items = x ? x.items : [];
  const cost = items.reduce((a, i) => a + (+i.cost || 0), 0), cash = astCashOf(x);
  return { cost, cash, total: cost + cash, qty: items.reduce((a, i) => a + (+i.qty || 0), 0),
    div: items.reduce((a, i) => a + (+i.div || 0), 0), n: items.length };
};
// 마지막으로 적은 달 (이번 달까지). 지금 시세 평가·목표 칸이 이 달 기록을 써요
const astLastYm = () => Object.keys(AST.months).filter((k) => k <= ymNow() && astFilled(k)).sort().pop() || null;

// 지금 시세로 평가 (사용자 2026-11-20 "온오프 기능 만들어놔, 필요 없는 사람은 없앨 수 있게"). 기본은 켬, 끄면 산 돈 기준 화면 그대로.
// 마지막으로 적은 달의 종목 × 매일 받는 전 종목 종가(stocks/<시장>/_quotes.json, 미장은 환율로) + 예수금. 지난 달들은 그때 산 돈 그대로 둬요
let AST_LIVE = true;
try { AST_LIVE = localStorage.getItem("ast_live") !== "0"; } catch (e) { /* 처음 */ }
const astReady = () => !!(QUOTES.kr && QUOTES.us);
const astLoadQ = () => Promise.all([loadQuotes("kr"), loadQuotes("us")]);
function astEval(ym) {
  const x = AST.months[ym] || { items: [] }, rows = {};
  let val = 0, pc = 0, pv = 0, miss = 0, day = "";
  x.items.forEach((it) => {
    const qty = +it.qty || 0, cost = +it.cost || 0, q = qty > 0 ? savPx(it) : null;
    if (!q) { val += cost; if (qty > 0 || cost > 0) miss++; return; }  // 시세가 없으면 산 돈으로 셈
    const v = qty * q.won;
    val += v;
    if (cost > 0) { pc += cost; pv += v; }
    if (q.day && q.day > day) day = q.day;
    rows[it.id] = { px: q.px, us: it.m === "us", v, gain: cost > 0 ? v - cost : null, pct: cost > 0 ? v / cost - 1 : null };
  });
  const cash = astCashOf(x);
  return { val, cash, total: val + cash, gain: pv - pc, pct: pc ? pv / pc - 1 : null, miss, day, rows };
}
