"use strict";
// ---------------------------------------------------------------- 포트폴리오 실험실
// ETF를 섞으면 과거에 얼마나 떨어졌나 (lab.py, symbols/lab.json 월말 수정 종가, 미국 자산은 원화로 환산).
// 비율을 바꾸면 폰에서 바로 다시 계산해요. 비율은 이 폰에만 저장. 사고팔기 판단은 안 해요 (사용자 2026-10-24 '포트폴리오 실험실 만들자')
const LAB_PRESETS = [
  ["stock", "주식만", { kospi: 100 }],
  ["us", "미국 주식만", { sp500: 100 }],
  ["6040", "주식 6 : 채권 4", { kospi: 30, sp500: 30, krbond: 20, usmid: 20 }],
  ["aw", "올웨더 비슷", { sp500: 30, uslong: 40, usmid: 15, gold: 15 }],
  ["calm", "낙폭 작게", { sp500: 20, krbond: 20, gold: 20, cash: 40 }],
];
const LAB_PERIODS = [["all", "전체"], ["10", "최근 10년"], ["5", "최근 5년"]];
let LABD = null, labLoading = null;
// w: 키 → 비율(%), list: 화면에 줄로 보이는 자산 순서, extra: 검색해서 넣은 ETF (키 "kr:069500"·"us:SCHD" → { m, code, name })
const LAB = { w: { ...LAB_PRESETS[2][2] }, list: null, extra: {}, reb: "y", per: "all" };
try { Object.assign(LAB, JSON.parse(localStorage.getItem("lab") || "{}")); } catch (e) { /* 처음 */ }
if (!Array.isArray(LAB.list)) LAB.list = Object.keys(LAB.w).filter((k) => LAB.w[k] > 0);
if (!LAB.extra || typeof LAB.extra !== "object") LAB.extra = {};
let labQuery = "";
// 검색해서 넣는 ETF 월 수익률 (etf_monthly.py, symbols/etfm/<시장>-<묶음>.json). 묶음 번호는 etf_monthly.shard와 같아요
const ETF_SHARDS = { kr: 16, us: 32 };
const etfShard = (code, n) => [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % n;
const ETFM = {}, ETFD = {};  // 묶음 파일 Promise, 키 → 달 목록에 맞춘 원화 월 수익률 (없으면 null)
function loadEtf(key) {
  const x = LAB.extra[key];
  if (!x || key in ETFD) return Promise.resolve();
  const f = `${x.m}-${etfShard(x.code, ETF_SHARDS[x.m])}`;
  ETFM[f] = ETFM[f] || fetch(`symbols/etfm/${f}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return ETFM[f].then((d) => {
    const v = d && d.s && d.s[x.code];
    if (!v) { ETFD[key] = null; return; }
    const [start, r] = v, M = LABD.months, mi = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
    const out = M.map(() => null), base = mi(start) - mi(M[0]);  // r[k]는 start에서 k달 뒤 수익률
    r.forEach((x2, k) => {
      const i = base + k;
      if (i < 0 || i >= M.length) return;
      if (x.m === "us") { const fx = LABD.fx && LABD.fx[i]; out[i] = fx == null ? null : ((1 + x2 / 100) * (1 + fx / 100) - 1) * 100; }
      else out[i] = x2;
    });
    const first = out.findIndex((v2) => v2 != null);
    ETFD[key] = first < 0 ? null : { start: M[first], r: out };
  });
}
// 키 → { k, name, note, start, r } (기본 자산 또는 검색해서 넣은 ETF). 아직 못 불러왔거나 자료가 없으면 null
function labAsset(k) {
  const a = LABD.assets.find((x) => x.k === k);
  if (a) return a;
  const x = LAB.extra[k], d = ETFD[k];
  return x && d ? { k, name: x.name, note: `${x.m === "us" ? "🇺🇸 원화로 환산" : "🇰🇷"} · ${x.code}`, start: d.start, r: d.r, extra: true } : null;
}
function loadLab() {
  if (!labLoading) labLoading = fetch("symbols/lab.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((x) => { LABD = x || { months: [], assets: [] }; });
  return labLoading;
}
const saveLab = () => { remember("lab", JSON.stringify(LAB)); };
const labSum = (w) => Object.values(w).reduce((a, b) => a + (b || 0), 0);
// 비율 w(%)로 섞어 한 달씩 굴려요. reb: 매년 12월 말에 처음 비율로 되돌리기. 같은 기간 계산을 위해 시작 달을 받을 수 있어요
function labRun(w, reb, from) {
  const A = Object.keys(w).filter((k) => w[k] > 0).map(labAsset).filter(Boolean), n = LABD.months.length, tot = A.reduce((a, x) => a + w[x.k], 0);
  if (!A.length || !tot) return null;
  let s = Math.max(...A.map((a) => a.r.findIndex((v) => v != null)));
  if (from != null) s = Math.max(s, from);
  if (s < 1 || s >= n) return null;
  let h = A.map((a) => w[a.k] / tot), v = 1, peak = 1, peakI = s - 1, mdd = 0, ddFrom = s - 1, ddTo = s - 1, under = 0, longest = 0, rec = null;
  const val = [1], dd = [0];
  for (let i = s; i < n; i++) {
    h = h.map((x, k) => x * (1 + (A[k].r[i] || 0) / 100));
    v = h.reduce((a, b) => a + b, 0);
    if (v >= peak) { peak = v; peakI = i; under = 0; } else { under++; longest = Math.max(longest, under); }
    const d = v / peak - 1;
    if (d < mdd) { mdd = d; ddFrom = peakI; ddTo = i; }
    val.push(v); dd.push(d);
    if (reb === "y" && LABD.months[i].endsWith("-12")) h = A.map((a) => v * w[a.k] / tot);
  }
  // 가장 크게 떨어졌던 때에서 원래 높이로 돌아오기까지
  for (let i = ddTo; i < n; i++) if (val[i - s + 1] >= val[ddFrom - s + 1]) { rec = i - ddFrom; break; }
  const years = (n - s) / 12;
  const yr = {};
  LABD.months.slice(s - 1).forEach((m, k) => { const y = m.slice(0, 4); yr[y] = yr[y] || [val[k], val[k]]; yr[y][1] = val[k]; });
  let worstY = null;
  Object.entries(yr).forEach(([y, [a, b]], k, all) => {  // 그 해 첫 값은 전년 말 값
    const start = k ? all[k - 1][1][1] : a, r = b / start - 1;
    if (k && (!worstY || r < worstY.r)) worstY = { y, r, part: k === all.length - 1 };
  });
  return { s, val, dd, cagr: Math.pow(v, 1 / years) - 1, mdd, ddFrom, ddTo, rec, longest, worstY, end: v, years };
}
const ym = (m) => `${m.slice(0, 4)}.${m.slice(5, 7)}`;
function labPath(arr, lo, hi, W, H) {
  const n = arr.length - 1 || 1;
  return arr.map((v, i) => `${i ? "L" : "M"}${(i / n * W).toFixed(1)},${(H - (v - lo) / (hi - lo || 1) * H).toFixed(1)}`).join("");
}
function labChart(me, base, months) {
  const W = 320, H = 120, D = 56;
  const all = [...me.val, ...(base ? base.val : [])].map((v) => Math.log(v));
  const lo = Math.min(...all), hi = Math.max(...all);
  const lg = (a) => a.map((v) => Math.log(v));
  const dlo = Math.min(me.mdd, base ? base.mdd : 0);
  const area = (a) => `${labPath(a, dlo, 0, W, D)}L${W},0L0,0Z`;
  const first = months[0], last = months[months.length - 1];
  return `<div class="lab-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="내 섞기와 비교 대상의 자산 흐름 (로그 눈금)">
      ${base ? `<path class="lab-base" d="${labPath(lg(base.val), lo, hi, W, H)}"/>` : ""}<path class="lab-me" d="${labPath(lg(me.val), lo, hi, W, H)}"/></svg>
    <p class="lab-cap">떨어진 폭 (고점 대비)</p>
    <svg viewBox="0 0 ${W} ${D}" preserveAspectRatio="none" role="img" aria-label="고점 대비 떨어진 폭">
      ${base ? `<path class="lab-dd-base" d="${area(base.dd)}"/>` : ""}<path class="lab-dd-me" d="${area(me.dd)}"/></svg>
    <div class="lab-x"><span>${ym(first)}</span><span>${ym(last)}</span></div></div>`;
}
function labCard() {
  const head = `<h2>포트폴리오 실험실 <small>섞으면 덜 떨어질까</small></h2>`;
  if (!LABD) return `<section class="card" id="lab-card">${head}<p class="muted">과거 자료를 불러오는 중이에요…</p></section>`;
  if (!LABD.assets.length) return `<section class="card" id="lab-card">${head}<p class="empty">아직 자료가 없어요. 토요일 아침에 받아 와요.</p></section>`;
  const tot = labSum(LAB.w), n = LABD.months.length;
  const from = LAB.per === "all" ? null : n - 1 - Number(LAB.per) * 12;
  const me = labRun(LAB.w, LAB.reb, from);
  const baseK = market === "us" ? "sp500" : "kospi", baseA = LABD.assets.find((a) => a.k === baseK);
  const base = me && baseA ? labRun({ [baseK]: 100 }, "n", me.s) : null;
  const sameAsBase = Object.keys(LAB.w).filter((k) => LAB.w[k] > 0).join() === baseK;
  const pre = LAB_PRESETS.find(([, , w]) => JSON.stringify(Object.entries(w).sort()) === JSON.stringify(Object.entries(LAB.w).filter(([, v]) => v > 0).sort()));
  const presets = `<nav class="chips" aria-label="섞기 예시">${LAB_PRESETS.map(([k, label]) =>
    `<button type="button" data-lab-preset="${k}" aria-pressed="${!!pre && pre[0] === k}">${label}</button>`).join("")}</nav>`;
  const rows = LAB.list.map((k) => { const v = LAB.w[k] || 0, a = labAsset(k), x = LAB.extra[k];
    if (!a) return x ? `<li class="lab-row"><div class="l"><div class="name">${esc(x.name)}</div><div class="meta">${k in ETFD ? "과거 월봉 자료가 없어서 계산에서 빠져요" : "불러오는 중이에요…"}</div></div>
      <button type="button" class="lab-del" data-lab-del="${esc(k)}" aria-label="${esc(x.name)} 빼기">✕</button></li>` : "";
    return `<li class="lab-row"><div class="l"><div class="name">${esc(a.name)}</div><div class="meta">${esc(a.note)} · ${ym(a.start)}~</div>
        <div class="lab-bar"><i style="width:${Math.min(100, v)}%"></i></div></div>
      <div class="lab-step"><button type="button" data-lab-w="${a.k}" data-d="-10" aria-label="${esc(a.name)} 10%p 줄이기"${v ? "" : " disabled"}>−</button>
        <b>${v}%</b><button type="button" data-lab-w="${a.k}" data-d="10" aria-label="${esc(a.name)} 10%p 늘리기"${tot >= 100 ? " disabled" : ""}>+</button>
        <button type="button" class="lab-del" data-lab-del="${esc(a.k)}" aria-label="${esc(a.name)} 빼기">✕</button></div></li>`; }).join("")
    || `<li><p class="empty">위에서 자산을 골라 넣어 주세요.</p></li>`;
  // 자산 고르기: 기본 자산은 눌러서 넣고 빼는 버튼, 그 밖의 ETF는 이름으로 찾아 넣어요.
  // 넣어도 이 칸 높이는 그대로라 화면이 안 밀려요 (줄은 아래 '내 비율'에 붙어요)
  const pick = `<h3 class="sav-h">자산 고르기</h3><nav class="chips lab-pick" aria-label="기본 자산">${LABD.assets.map((x) =>
    `<button type="button" data-lab-pick="${x.k}" aria-pressed="${LAB.list.includes(x.k)}">${esc(x.name)}</button>`).join("")}</nav>
    <input id="lab-q" class="search lab-q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="다른 ETF 찾기: 슈드, 나스닥100, 반도체, 국채…" aria-label="ETF 찾기" value="${esc(labQuery)}">
    <div id="lab-results">${labResults()}</div>`;
  const sumLine = tot === 100 ? `<p class="muted lab-sum">합계 <b>100%</b></p>`
    : `<p class="caution lab-sum">합계 ${tot}%예요. ${tot ? "100%로 맞춰(비율대로 늘려) 계산했어요." : "비율을 넣어 주세요."}</p>`;
  const opts = `<div class="lab-opts"><nav class="chips" aria-label="되돌리기">${[["y", "매년 비율 되돌리기"], ["n", "그냥 두기"]].map(([k, l]) =>
      `<button type="button" data-lab-reb="${k}" aria-pressed="${LAB.reb === k}">${l}</button>`).join("")}</nav>
    <nav class="chips" aria-label="기간">${LAB_PERIODS.map(([k, l]) => `<button type="button" data-lab-per="${k}" aria-pressed="${LAB.per === k}">${l}</button>`).join("")}</nav></div>`;
  let out = "";
  if (me) {
    const months = LABD.months.slice(me.s - 1);
    const won = (v) => `${man(v * 1000)}원`;
    const col = (r, label) => r ? `<div class="lab-col"><p class="lab-who">${label}</p>
      <div class="stat"><span>가장 크게 떨어진 폭</span><b class="${r.mdd < -0.2 ? "down" : ""}">${pct(r.mdd)}</b><small>${ym(LABD.months[r.ddFrom])}→${ym(LABD.months[r.ddTo])}</small></div>
      <div class="stat"><span>다시 회복까지</span><b>${r.rec == null ? "아직" : `${r.rec}개월`}</b><small>가장 길게 물린 ${r.longest}개월</small></div>
      <div class="stat"><span>연 수익률</span><b class="${sign(r.cagr)}">${pct(r.cagr)}</b><small>1,000만 원 → ${won(r.end)}</small></div>
      <div class="stat"><span>가장 나빴던 해</span><b class="${r.worstY ? sign(r.worstY.r) : ""}">${r.worstY ? pct(r.worstY.r) : "-"}</b><small>${r.worstY ? `${r.worstY.y}년${r.worstY.part ? " (올해 지금까지)" : ""}` : ""}</small></div></div>` : "";
    const verdict = !base || sameAsBase ? "" : me.mdd > base.mdd + 0.03
      ? `<p class="good-line">✅ ${esc(baseA.name)}만 들고 있을 때보다 가장 크게 떨어진 폭이 ${Math.round((me.mdd - base.mdd) * 100)}%p 작아요${me.cagr < base.cagr ? `. 대신 연 수익률은 ${((base.cagr - me.cagr) * 100).toFixed(1)}%p 낮아요` : ""}.</p>`
      : me.mdd < base.mdd - 0.03 ? `<p class="caution">⚠️ ${esc(baseA.name)}만 들고 있을 때보다 더 크게 떨어졌어요.</p>`
        : `<p class="muted">${esc(baseA.name)}만 들고 있을 때와 떨어진 폭이 비슷해요.</p>`;
    out = `<p class="muted lab-period">${ym(months[0])}~${ym(months[months.length - 1])} (${me.years.toFixed(1)}년) · 원화 기준 · 분배금 다시 넣음</p>
      ${labChart(me, sameAsBase ? null : base, months)}
      <div class="legend" style="margin:6px 0 0"><span class="key"><i class="sw" style="background:var(--accent)"></i>내 섞기</span>${base && !sameAsBase ? `<span class="key"><i class="sw" style="background:var(--text-muted)"></i>${esc(baseA.name)}만</span>` : ""}</div>
      <div class="lab-cols">${col(me, "내 섞기")}${sameAsBase ? "" : col(base, `${esc(baseA.name)}만`)}</div>${verdict}`;
  }
  return `<section class="card" id="lab-card">${head}
    <p class="muted" style="margin:8px 0 0">예시를 고르거나 자산을 넣고 + − 로 비율을 바꾸면, 과거에 그렇게 섞어 뒀을 때 얼마나 떨어지고 얼마 만에 회복했는지 보여 줘요.</p>
    ${presets}${pick}<h3 class="sav-h">내 비율</h3><ul class="list lab-list">${rows}</ul>${sumLine}${opts}${out}
    <p class="muted note" style="margin:10px 0 0">야후 파이낸스 월말 수정 종가(분배금 다시 넣은 값)로 계산해요. 미국 자산은 그달 원/달러로 바꿔서, 위기 때 원화가 약해지면 원화 기준 낙폭이 줄어든 것까지 들어 있어요.
      세금·환전 수수료는 빼지 않았어요. 기간이 짧은 자산을 넣으면 그 자산이 상장한 달부터 계산해요. 과거 숫자일 뿐 앞으로를 보장하지 않아요.</p></section>`;
}
// 넣기·빼기: 넣을 땐 100%가 안 찼으면 남은 만큼(최대 10%), 다 찼으면 0%로 넣어요
function labToggle(k) {
  if (LAB.list.includes(k)) { LAB.list = LAB.list.filter((x) => x !== k); delete LAB.w[k]; }
  else { LAB.list = [...LAB.list, k]; const left = 100 - LAB.list.reduce((a, x) => a + (LAB.w[x] || 0), 0); LAB.w = { ...LAB.w, [k]: Math.max(0, Math.min(10, left)) }; }
  saveLab(); labRedraw();
}
// 검색 결과: ETF만, 국장·미장 섞어서 잘 맞는 순 6개. 기본 자산과 같은 ETF는 그 버튼으로 넣어요
const LAB_SYM = () => Object.fromEntries((LABD ? LABD.assets : []).map((a) => [a.sym.replace(/\.K[SQ]$/, ""), a.k]));
function labResults() {
  const q = labQuery.trim();
  if (!q) return "";
  if (!SYM.kr || !SYM.us) return `<p class="muted lab-hint">종목 목록을 불러오는 중이에요…</p>`;
  const qs = queryKeys(q), hits = [];
  for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => {
    if (e.row[3] !== "e") return;
    const sc = scoreOf(e.row, e.keys, qs);
    if (sc != null) hits.push({ m, sc, i, row: e.row });
  });
  hits.sort((a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i);
  if (!hits.length) return `<p class="muted lab-hint">"${esc(q)}"에 맞는 ETF가 없어요.</p>`;
  const same = LAB_SYM();
  return `<ul class="lab-hits">${hits.slice(0, 6).map(({ m, row }) => {
    const k = (m === "kr" && same[row[0]]) || (m === "us" && same[row[0]]) || `${m}:${row[0]}`, on = LAB.list.includes(k);
    return `<li><span><b>${esc(row[1])}</b><small>${m === "kr" ? "🇰🇷" : "🇺🇸"} ${esc(row[0])}</small></span>
      <button type="button" data-lab-add="${esc(k)}" data-m="${m}" data-code="${esc(row[0])}" data-name="${esc(row[1])}" aria-pressed="${on}">${on ? "넣음 ✓" : "+ 넣기"}</button></li>`;
  }).join("")}</ul>`;
}
function bindLabResults(el) {
  el.querySelectorAll("[data-lab-add]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.labAdd;
    if (!LAB.list.includes(k) && !LABD.assets.some((a) => a.k === k)) LAB.extra[k] = { m: b.dataset.m, code: b.dataset.code, name: b.dataset.name };
    if (LAB.extra[k] && !(k in ETFD)) { b.textContent = "불러오는 중…"; loadEtf(k).then(() => labToggle(k)); }
    else labToggle(k);
  }));
}
function labRedraw() {
  const card = $("#lab-card");
  if (!card) return;
  holdHeight(); card.outerHTML = labCard();
  bindLab(); keepTap();
}
function bindLab() {
  const card = $("#lab-card");
  if (!card) return;
  if (!LABD) { loadLab().then(() => { if (screen === "tools") labRedraw(); }); return; }
  const lc = $(".lab-chart", card);
  if (drawSoon(lc)) lc.querySelectorAll("svg").forEach((svg) => drawIn(svg, { w: svg.viewBox.baseVal.width, sel: "path", px: svg.clientWidth }));
  card.querySelectorAll("[data-lab-preset]").forEach((b) => b.addEventListener("click", () => {
    LAB.w = { ...LAB_PRESETS.find(([k]) => k === b.dataset.labPreset)[2] }; LAB.list = Object.keys(LAB.w); saveLab(); labRedraw();
  }));
  card.querySelectorAll("[data-lab-pick]").forEach((b) => b.addEventListener("click", () => labToggle(b.dataset.labPick)));
  card.querySelectorAll("[data-lab-del]").forEach((b) => b.addEventListener("click", () => labToggle(b.dataset.labDel)));
  const q = $("#lab-q", card), res = $("#lab-results", card);
  if (q && res) {
    const refresh = () => { res.innerHTML = labResults(); bindLabResults(res); };
    q.addEventListener("input", () => { labQuery = q.value; refresh(); });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") q.blur(); });
    bindLabResults(res);
    if (labQuery && (!SYM.kr || !SYM.us)) loadSymbols().then(() => { if ($("#lab-results")) refresh(); });
    q.addEventListener("focus", () => { if (!SYM.kr || !SYM.us) loadSymbols().then(() => { if (labQuery && $("#lab-results")) refresh(); }); }, { once: true });
  }
  const todo = LAB.list.filter((k) => LAB.extra[k] && !(k in ETFD));
  if (todo.length) Promise.all(todo.map(loadEtf)).then(() => { if (screen === "tools") { lastTap = null; labRedraw(); } });
  card.querySelectorAll("[data-lab-w]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.labW, v = Math.max(0, Math.min(100, (LAB.w[k] || 0) + Number(b.dataset.d)));
    LAB.w = { ...LAB.w, [k]: v };
    saveLab(); labRedraw();
  }));
  card.querySelectorAll("[data-lab-reb]").forEach((b) => b.addEventListener("click", () => { LAB.reb = b.dataset.labReb; saveLab(); labRedraw(); }));
  card.querySelectorAll("[data-lab-per]").forEach((b) => b.addEventListener("click", () => { LAB.per = b.dataset.labPer; saveLab(); labRedraw(); }));
}

// ---------------------------------------------------------------- 수익률 달력
// 지수가 날마다 몇 % 움직였는지 달력 칸에 색으로 (오르면 빨강, 내리면 파랑). 최근 5년쯤.
// 관심종목 배당락일(💰)도 같이 찍어요.
let calSrc = "idx";
let calMonth = null;  // "YYYY-MM"
let calPick = null;   // 눌러 본 날
function calSources(d) {
  const out = [];
  if (d.daily && d.daily.candles) out.push(["idx", d.index_name]);
  return out;
}
// 고른 것 → {날짜: 그날 수익률}
function dailyReturns(d, src) {
  const out = {};
  const c = d.daily.candles;
  for (let i = 1; i < c.dates.length; i++) out[c.dates[i]] = c.c[i] / c.c[i - 1] - 1;
  return out;
}
function exdivDays(d) {
  const out = {};
  const funds = d.funds || {};
  const codes = new Set(WATCH[market]);
  const names = Object.fromEntries(stocksOf(d).map((s) => [s.code, s.name]));
  codes.forEach((c) => { const e = (funds[c] || {}).events; if (e && e.exdiv) (out[e.exdiv] = out[e.exdiv] || []).push(names[c] || c); });
  return out;
}
const calColor = (r) => {
  if (r == null) return "";
  if (Math.abs(r) < 0.00005) return "background:var(--surface-0)";  // 0.0%는 빨강·파랑 없이
  const a = Math.min(1, Math.abs(r) / 0.02) * 0.85 + 0.12;
  return `background:color-mix(in srgb, var(${r >= 0 ? "--up" : "--down"}) ${Math.round(a * 100)}%, transparent)`;
};
function compound(list) { return list.reduce((a, r) => a * (1 + r), 1) - 1; }
function retCalendarCard(d) {
  if (!chartsReady()) {  // 지수 일봉(charts.json)을 받는 중 — 받으면 다시 그려요
    loadCharts();
    return `<section class="card"><h2>수익률 달력</h2><p class="muted">지수 기록 불러오는 중…</p></section>`;
  }
  const srcs = calSources(d);
  if (!srcs.length) return "";
  if (!srcs.some((s) => s[0] === calSrc)) calSrc = srcs[0][0];
  const daily = dailyReturns(d, calSrc);
  const days = Object.keys(daily).sort();
  const last = days[days.length - 1] || TODAY();
  if (!calMonth || (days.length && (calMonth < days[0].slice(0, 7) || calMonth > last.slice(0, 7)))) calMonth = last.slice(0, 7);
  const [y, m] = calMonth.split("-").map(Number);
  const exd = exdivDays(d);
  const inMonth = days.filter((x) => x.startsWith(calMonth));
  const mret = inMonth.length ? compound(inMonth.map((x) => daily[x])) : null;
  const upN = inMonth.filter((x) => daily[x] > 0).length, downN = inMonth.filter((x) => daily[x] < 0).length;
  // 월~금 다섯 칸 (주말은 장이 없어서 빼요)
  const first = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = "";
  const lead = (first.getUTCDay() + 6) % 7;
  if (lead < 5) cells += `<span class="cal-cell blank"></span>`.repeat(lead);
  for (let dd = 1; dd <= dim; dd++) {
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const key = `${calMonth}-${String(dd).padStart(2, "0")}`;
    const r = daily[key];
    const ex = exd[key];
    cells += `<button type="button" class="cal-cell${r == null ? " off" : ""}${calPick === key ? " picked" : ""}" data-calday="${key}" style="${calColor(r)}"
      aria-label="${m}월 ${dd}일 ${r == null ? "기록 없음" : pct(r, 2)}${ex ? `, 배당락 ${ex.join(", ")}` : ""}">
      <span class="cd">${dd}${ex ? "<i>💰</i>" : ""}</span><span class="cr">${r == null ? "" : `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}`}</span></button>`;
  }
  const months = [];
  for (let k = 1; k <= 12; k++) {
    const key = `${y}-${String(k).padStart(2, "0")}`;
    const list = days.filter((x) => x.startsWith(key));
    const r = list.length ? compound(list.map((x) => daily[x])) : null;
    months.push(`<button type="button" class="cal-m${key === calMonth ? " on" : ""}" data-calm="${key}" ${list.length ? "" : "disabled"} style="${r == null ? "" : calColor(r / 3)}">
      <span>${k}월</span><b>${r == null ? "-" : `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%`}</b></button>`);
  }
  const yearDays = days.filter((x) => x.startsWith(`${y}-`));
  const yret = yearDays.length ? compound(yearDays.map((x) => daily[x])) : null;
  const pick = calPick && calPick.startsWith(calMonth) ? calPick : null;
  const pickLine = pick ? `<p class="cal-pick">${pick.slice(5, 7)}.${pick.slice(8)} ${daily[pick] == null ? "장이 없었거나 기록 전이에요" : `<b class="${sign(daily[pick])}">${pct(daily[pick], 2)}</b>`}${exd[pick] ? ` · 💰 배당락: ${exd[pick].map(esc).join(", ")}` : ""}</p>` : "";
  const firstM = days.length ? days[0].slice(0, 7) : calMonth;
  return `<section class="card" id="retcal-card"><h2>수익률 달력 <small>${esc(d.index_name)} 날마다 몇 %</small></h2>
    <div class="cal-head"><button type="button" class="cal-nav" data-calstep="-1" aria-label="이전 달" ${calMonth <= firstM ? "disabled" : ""}>‹</button>
      <div><b>${y}년 ${m}월</b><small>${mret == null ? "기록 없음" : `<span class="${sign(mret)}">${pct(mret)}</span> · 오른 날 ${upN} · 내린 날 ${downN}`}</small></div>
      <button type="button" class="cal-nav" data-calstep="1" aria-label="다음 달" ${calMonth >= last.slice(0, 7) ? "disabled" : ""}>›</button></div>
    <div class="cal-grid"><span class="cal-w">월</span><span class="cal-w">화</span><span class="cal-w">수</span><span class="cal-w">목</span><span class="cal-w">금</span>${cells}</div>
    ${pickLine}
    <h3 class="sav-h">${y}년 달별 <small class="muted">${yret == null ? "" : `한 해 ${pct(yret)}`}</small></h3>
    <div class="cal-months">${months.join("")}</div>
    <p class="muted note" style="margin:10px 0 0">칸 색이 진할수록 많이 움직인 날이에요(±2%면 가장 진해요). 지수 종가 기준이에요.
      💰는 관심종목의 다음 배당락일이에요(야후 무료 자료라 바뀔 수 있어요).</p></section>`;
}
function bindRetCal(d) {
  const card = $("#retcal-card");
  if (!card) return;
  const redraw = () => { const c = $("#retcal-card"); if (c) { c.outerHTML = retCalendarCard(d); bindRetCal(d); keepTap(); } };
  card.querySelectorAll("[data-calstep]").forEach((b) => b.addEventListener("click", () => {
    const [y, m] = calMonth.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + Number(b.dataset.calstep), 1));
    calMonth = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    redraw();
  }));
  card.querySelectorAll("[data-calm]").forEach((b) => b.addEventListener("click", () => { calMonth = b.dataset.calm; redraw(); }));
  card.querySelectorAll("[data-calday]").forEach((b) => b.addEventListener("click", () => { calPick = calPick === b.dataset.calday ? null : b.dataset.calday; redraw(); }));
}
