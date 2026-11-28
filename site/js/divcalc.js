// ---------------------------------------------------------------- 배당 계산기 (도구 → 배당 계산기, 2026-11-28)
// 사용자 "내가 가진 주식 배당 계산기": 자산 기록에 적은 종목만, 주 수를 바꿔 보면 '가장 최근 1회 배당'으로 1년에 얼마 받는지 세전/세후.
// 시작 주 수 = 지금 보유(자산 기록 마지막 달, dvHold). 등락 = 최근 배당이 직전 배당보다 ↑↓ (색 없이 글자만, 자산 기록 규칙).
// 목표 배당금(선택, 켜기): 보유 종목만으로 '지금 비중 그대로 늘리기' 또는 '모자란 만큼 같은 돈씩 사기'로 몇 주 더 필요한지.
// 자료: symbols/<시장>_returns.json r[6] 최근 12개월·r[7] 그 전 12개월 [배당락 달, 1주당 배당] (야후 무료, 매주 토요일) + 종가(_quotes.json).
// 배당 달력(asset.js dvHold·dvHist·DV_TAX)을 같이 써요. 주 수·설정은 이 폰에만 저장 (localStorage divcalc).
let DC = { q: {}, net: true, goal: false, amt: "", per: "m", way: "keep", frac: false };
try { DC = { ...DC, ...JSON.parse(localStorage.getItem("divcalc") || "{}") }; } catch (e) { /* 처음 */ }
const dcSave = () => remember("divcalc", JSON.stringify(DC));
const dcKey = (h) => `${h.m}:${h.code}`;
const dcNum = (s) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isFinite(v) ? v : 0; };
const dcQty = (h) => (dcKey(h) in DC.q ? DC.q[dcKey(h)] : h.qty);
// 최근 2년 배당을 오래된 순으로: [{mo, amt, fix}]. 한 번만 보통의 8배 넘게 튀면 보통 크기로 봐요 (배당 달력 dvHist와 같은 규칙)
function dcSeries(m, code) {
  const r = RET[m] && RET[m][code];
  if (!r || !Array.isArray(r[6]) || !r[6].length) return [];
  const last = (dvEv(m, code) || {}).div_last;
  const all = [...(Array.isArray(r[7]) ? r[7] : []), ...r[6]].filter(([mo, a]) => mo >= 1 && mo <= 12 && a > 0).map(([mo, amt]) => ({ mo, amt, fix: false }));
  if (all.length >= 3) {
    const v = all.map((x) => x.amt).sort((a, b) => a - b), low = v[Math.floor((v.length - 1) / 2)];
    all.forEach((x) => { if (x.amt > low * 8 && !(last && Math.abs(x.amt - last) <= x.amt * 0.05)) { x.amt = low; x.fix = true; } });
  }
  return all;
}
// 종목 하나: 최근 1회(1주, 원래 통화)·직전 1회·1년에 몇 번·1주 연 배당(원화, 세전/세후)·지금 가격
function dcInfo(h) {
  const s = dcSeries(h.m, h.code), fx = h.m === "us" ? dvFx() : 1;
  const tax = DC.net ? 1 - DV_TAX[h.m] : 1;
  const hist = dvHist(h.m, h.code), freq = hist.length;
  const lastD = s[s.length - 1] || null, prevD = s.length > 1 ? s[s.length - 2] : null;
  const p = savPx(h);
  // 최근 1회가 평소(그 전 배당들 가운데 값)의 3배 넘으면 특별 배당일 수 있어 1년 계산은 평소 크기로 해요 (최근 값은 그대로 보여 줘요)
  let base = lastD ? lastD.amt : 0, odd = 0;
  if (lastD && s.length >= 3) {
    const v = s.slice(0, -1).map((x) => x.amt).sort((a, b) => a - b), mid = v[Math.floor((v.length - 1) / 2)];
    if (base > mid * 3) { odd = base / mid; base = mid; }
  }
  const year = base * freq * fx * tax;
  return { h, lastD, prevD, freq, months: hist.map((x) => x.ex), base, odd, once: base * fx * tax, year, px: p ? p.won : null };
}
const dcPer1 = (h, amt) => (h.m === "us" ? `$${amt.toLocaleString("en-US", { maximumFractionDigits: 3 })}` : astWon(amt));
// 직전 대비: ↑ 3.1% / ↓ / 같음 (빨강·파랑 안 써요)
function dcChg(x) {
  if (!x.lastD) return "";
  if (!x.prevD) return `<span class="dc-chg">직전 기록 없음</span>`;
  const d = x.lastD.amt / x.prevD.amt - 1;
  const t = Math.abs(d) < 0.005 ? "→ 같음" : `${d > 0 ? "↑" : "↓"} ${Math.abs(d * 100).toFixed(1)}%`;
  return `<span class="dc-chg">${t}</span> <span class="muted">직전 ${x.prevD.mo}월 ${dcPer1(x.h, x.prevD.amt)}</span>`;
}
// 1년에 몇 번 주는지 한눈에: 매달 📅 · 분기 🍀(잎 4장) · 반년 🌗(반달) · 1년 1번 🎁
const DC_FREQ = { 12: ["📅", "매달"], 4: ["🍀", "분기"], 2: ["🌗", "반년"], 1: ["🎁", "1년 1번"] };
function dcFreqTag(f) {
  if (!f) return `<span class="dc-freq none">배당 없음</span>`;
  const [e, t] = DC_FREQ[f >= 12 ? 12 : f] || ["🔹", `1년 ${f}번`];
  return `<span class="dc-freq f${f >= 12 ? 12 : f}"><span aria-hidden="true">${e}</span> ${t}</span>`;
}
// 다음 배당락: 종목 자료에 앞으로 올 배당락일이 있으면 그 날(확정), 없으면 지난 1년 배당락 달로 짐작 (예상)
function dcNextEx(x) {
  const e = dvEv(x.h.m, x.h.code) || {};
  if (e.exdiv && e.exdiv >= TODAY()) return { t: `${+e.exdiv.slice(5, 7)}.${+e.exdiv.slice(8, 10)}`, sure: true };
  if (!x.months.length || !x.lastD) return null;
  const ms = x.months.slice().sort((a, b) => a - b), nx = ms.find((mo) => mo > x.lastD.mo) || ms[0];
  return { t: `${nx}월쯤`, sure: false };
}
// 최고점 대비: 종목 파일 일봉(최근 1년 종가 최고)이 있으면 그걸로, 없으면 전 종목 시세 요약(_quotes.json의 52주 고점 대비)
function dcDD(x, f) {
  const c = f && f.candles && f.candles.c;
  if (c && c.length > 20) { const w = c.slice(-252), hi = Math.max(...w); return hi ? { dd: w[w.length - 1] / hi - 1, hi } : null; }
  const q = QUOTES[x.h.m] && QUOTES[x.h.m].q[x.h.code];
  return q && q[4] != null ? { dd: q[4], hi: q[0] ? q[0] / (1 + q[4]) : null } : null;
}
const DC_BUY = -0.2;  // 최고점보다 20% 넘게 내려오면 '매수 신호' (사용자 2026-11-28)
const dcBuyTag = (d) => (d && d.dd <= DC_BUY ? `<span class="dc-buy" title="최고점 대비 ${(d.dd * 100).toFixed(0)}%">🛒 매수 신호</span>` : "");
const dcSecSum = (g) => `1년 ${astDivW(g.reduce((a, x) => a + x.year * dcQty(x.h), 0))}`;

// 목표: 1년 T원 받으려면 (보유 종목만, 팔지는 않아요)
// keep = 지금 주 수 비율 그대로 늘리기, same = 모자란 만큼을 종목마다 같은 돈씩 사기 (가격 아는 종목만)
// 더 살 주 수 올림: 보통 1주 단위, '소수점으로 사기'를 켜면 0.01주 단위 (소수점 거래 되는 증권사)
const dcUp = (v) => (v <= 1e-9 ? 0 : DC.frac ? Math.ceil(v * 100 - 1e-6) / 100 : Math.ceil(v - 1e-9));
function dcPlan(xs, T) {
  const pay = xs.filter((x) => x.year > 0);
  const now = pay.reduce((a, x) => a + x.year * x.h.qty, 0);
  if (!pay.length) return { err: "배당 주는 보유 종목이 없어요." };
  if (now >= T) return { done: true, now };
  let add;
  if (DC.way === "keep" && now > 0) {
    const f = T / now;
    add = pay.map((x) => Math.max(0, dcUp(x.h.qty * f - x.h.qty)));
  } else {
    const ok = pay.filter((x) => x.px);
    if (!ok.length) return { err: "가격을 아는 종목이 없어 계산할 수 없어요." };
    const M = (T - now) / ok.reduce((a, x) => a + x.year / x.px, 0);  // 종목마다 넣을 돈
    add = pay.map((x) => (x.px ? dcUp(M / x.px) : 0));
  }
  const rows = pay.map((x, i) => ({ x, add: add[i], cost: x.px ? add[i] * x.px : null })).filter((r) => r.add > 0);
  const end = pay.reduce((a, x, i) => a + x.year * (x.h.qty + add[i]), 0);
  const skip = DC.way === "same" || now <= 0 ? pay.filter((x) => !x.px).map((x) => x.h.name) : [];
  return { now, rows, end, cost: rows.reduce((a, r) => a + (r.cost || 0), 0), noPx: rows.some((r) => r.cost == null), add, pay, skip };
}
function dcGoalOut(xs) {
  const T = dcNum(DC.amt) * (DC.per === "m" ? 12 : 1);
  if (!T) return `<p class="muted" style="margin:8px 0 0;font-size:13px">목표 금액을 적으면 보유 종목만으로 몇 주씩 더 모으면 되는지 나와요.</p>`;
  const p = dcPlan(xs, T), tx = DC.net ? "세후" : "세전";
  if (p.err) return `<p class="muted" style="margin:8px 0 0">${p.err}</p>`;
  if (p.done) return `<p class="dc-goal-sum">지금 보유로도 1년 ${astDivW(p.now)} (${tx})라 목표를 넘어요.</p>`;
  return `<ul class="ast-mix dc-plan">${p.rows.map((r) => `<li><div class="ast-mix-t"><b>${esc(r.x.h.name)}</b><span>+${astQty(r.add)}</span></div>
      <small class="muted dv-sub">${astQty(r.x.h.qty)} → ${astQty(r.x.h.qty + r.add)} · ${r.cost == null ? "가격 몰라요" : `약 ${savWon(r.cost)} 더`} · 1년 ${astDivW(r.x.year * (r.x.h.qty + r.add))}</small></li>`).join("")}</ul>
    <p class="dc-goal-sum">더 필요한 돈 약 <b>${savWon(p.cost)}</b>${p.noPx ? " + 가격 모르는 종목" : ""} → 1년 ${astDivW(p.end)} · 한 달 ${astDivW(p.end / 12)} (${tx})</p>
    ${p.skip.length ? `<p class="muted" style="margin:6px 0 0;font-size:12px">가격을 몰라 빼고 계산: ${p.skip.map(esc).join(", ")}</p>` : ""}
    <button type="button" class="ast-btn" data-dc-use style="margin-top:8px">이 주 수를 위 계산기에 넣기</button>`;
}
function dcHero(xs) {
  const tot = xs.reduce((a, x) => a + x.year * dcQty(x.h), 0), now = xs.reduce((a, x) => a + x.year * x.h.qty, 0);
  const tx = DC.net ? "세후" : "세전";
  return `<div class="ast-tile dv-tile"><small>1년 배당 (${tx})</small><b>${astDivW(tot)}</b></div>
    <div class="ast-tile dv-tile"><small>한 달 평균</small><b>${astDivW(tot / 12)}</b></div>
    <div class="ast-tile dv-tile"><small>지금 보유일 때</small><b>${astDivW(now)}</b></div>
    <div class="ast-tile dv-tile"><small>보유보다</small><b>${Math.abs(tot - now) < 1 ? "같아요" : `${tot > now ? "+" : "−"}${astDivW(Math.abs(tot - now))}`}</b></div>`;
}
const dcOut = (x) => { const q = dcQty(x.h); return x.lastD ? `1회 ${astDivW(x.once * q)} · 1년 <b>${astDivW(x.year * q)}</b>` : "최근 1년 배당 없음"; };
function divCalcCard() {
  const tx = DC.net ? "세후" : "세전";
  const head = `<h2 class="goal-h"><span>🧮 배당 계산기</span><span class="goal-h-r"><small>최근 배당 기준</small><button type="button" class="goal-reset" data-dc-clear aria-label="자산 기록 주 수로 초기화">${RESET_ICON}<span>한 번 더 누르면 자산 기록대로</span></button></span></h2>`;
  if (typeof dvHold !== "function") return `<section class="card" id="dc-card">${head}<p class="muted" style="margin:6px 0 0">불러오는 중…</p></section>`;
  const { ym, list } = dvHold();
  if (!list.length) return `<section class="card" id="dc-card">${head}
    <p class="muted" style="margin:6px 0 0;font-size:13px">'자산 기록' 탭에 종목과 주 수를 적으면, 그 종목들로 배당을 계산해요.</p></section>`;
  if (!RET.kr || !RET.us) return `<section class="card" id="dc-card">${head}<p class="muted" style="margin:6px 0 0">배당 자료 불러오는 중…</p></section>`;
  const xs = list.map(dcInfo).sort((a, b) => b.year * b.h.qty - a.year * a.h.qty);
  const row = (x) => {
    const k = dcKey(x.h);
    return `<li class="dc-row"><div class="dc-row-h"><button type="button" class="dc-name" data-dc-open="${k}"><b>${esc(x.h.name)}</b><span aria-hidden="true">›</span></button>
        <span class="dc-tags">${dcBuyTag(dcDD(x))}${dcFreqTag(x.freq)}</span></div>
      ${x.lastD ? `<small class="dv-sub">최근 ${x.lastD.mo}월 1주 <b>${dcPer1(x.h, x.lastD.amt)}</b>${x.lastD.fix ? " (튀는 값이라 보통 크기로 봄)" : ""}${x.odd ? ` <span class="muted">(특별 배당일 수 있어 1년 계산은 평소 ${dcPer1(x.h, x.base)})</span>` : ""} ${dcChg(x)}${dcNextEx(x) ? ` · 배당락 <b>${dcNextEx(x).t}</b>` : ""}</small>` : ""}
      <div class="dc-qty"><button type="button" class="ast-btn dc-pm" data-dc-pm="${k}" data-d="-1" aria-label="1주 빼기">−</button>
        <span class="alert-input"><input data-dc-q="${k}" type="text" inputmode="decimal" value="${dcQty(x.h)}" aria-label="${esc(x.h.name)} 주 수"><span>주</span></span>
        <button type="button" class="ast-btn dc-pm" data-dc-pm="${k}" data-d="1" aria-label="1주 더하기">+</button></div>
      <small class="dc-out" data-dc-out="${k}">${dcOut(x)}</small>
      <small class="muted dc-have">보유 ${astQty(x.h.qty)}</small></li>`;
  };
  // 국장·미장 구역을 나눠요 (구역 제목에 그 시장 1년 배당 합)
  const rows = [["kr", "🇰🇷 국장"], ["us", "🇺🇸 미장"]].map(([m, t]) => {
    const g = xs.filter((x) => x.h.m === m);
    return g.length ? `<div class="dc-sec"><h3 class="dc-sec-h"><span>${t} <small class="muted">${g.length}종목</small></span><small data-dc-sec="${m}">${dcSecSum(g)}</small></h3>
      <ul class="ast-mix dc-list">${g.map(row).join("")}</ul></div>` : "";
  }).join("");
  const goal = DC.goal ? `<div class="dc-goal"><div class="dc-goal-in"><span class="alert-input"><input data-dc-amt type="text" inputmode="numeric" value="${esc(DC.amt)}" placeholder="예: 300000" aria-label="목표 배당금"><span>원</span></span>
        <nav class="chips"><button type="button" data-dc-per="m" aria-pressed="${DC.per === "m"}">한 달</button><button type="button" data-dc-per="y" aria-pressed="${DC.per === "y"}">1년</button></nav></div>
      <nav class="chips"><button type="button" data-dc-way="keep" aria-pressed="${DC.way === "keep"}">지금 비중 그대로</button><button type="button" data-dc-way="same" aria-pressed="${DC.way === "same"}">모자란 만큼 같은 돈씩</button></nav>
      <nav class="chips"><button type="button" data-dc-frac aria-pressed="${!!DC.frac}">소수점으로 사기 (0.01주)</button></nav>
      <div data-dc-goal-out>${dcGoalOut(xs)}</div></div>` : "";
  return `<section class="card" id="dc-card">${head}
    <nav class="chips"><button type="button" data-dc-tax="0" aria-pressed="${!DC.net}">세전</button><button type="button" data-dc-tax="1" aria-pressed="${DC.net}">세후</button></nav>
    <div class="sav-hero ast-hero" data-dc-hero>${dcHero(xs)}</div>
    ${rows}
    <button type="button" class="alert-toggle dc-goal-sw" data-dc-goal aria-expanded="${DC.goal}"><span>🎯 목표 배당금으로 포트폴리오 짜기</span><b>${DC.goal ? "끄기" : "켜기"}</b></button>
    ${goal}
    <p class="muted note" style="margin:10px 0 0">${ymName(ym)} 자산 기록 종목 기준. 1년 배당 = 가장 최근 1회 배당 × 1년에 주는 횟수 × 주 수예요. 회사가 배당을 바꾸면 달라지고, 받을 돈을 약속하는 숫자가 아니에요.
      ${tx === "세후" ? "세후" : "세후로 바꾸면"} = 국장 15.4%(배당소득세 14% + 지방세 1.4%), 미장 15%(미국에서 먼저 뗌) 뺀 값. ISA·연금 계좌는 다르고, 1년 금융소득 2천만 원이 넘으면 종합과세돼요.
      미장은 환율 ${num(dvFx())}원. 종목 이름을 누르면 가격·배당 내역·배당 성장률이 나와요. 직전 대비는 바로 앞 배당과 비교 (1년에 한 번 주는 종목은 작년). 자료: 야후 파이낸스(무료).</p></section>`;
}
function dcRefresh() {
  const c = $("#dc-card");
  if (!c) return;
  c.outerHTML = divCalcCard();
  bindDivCalc();
}
function bindDivCalc() {
  const card = $("#dc-card");
  if (!card) return;
  if (!RET.kr || !RET.us || !QUOTES.kr || !QUOTES.us)  // 배당 자료·종가(배당률·목표에 쓰는 가격)
    Promise.all([loadReturns(), loadQuotes("kr"), loadQuotes("us")]).then(() => { if (screen === "tools" && $("#dc-card")) dcRefresh(); });
  // 초기화: 바꿔 본 주 수를 전부 자산 기록에 적힌 보유 주 수로 (사용자 2026-11-28). 세전/세후·목표 설정은 그대로.
  // 실수로 누르지 않게 한 번 누르면 '한 번 더 누르면 초기화', 3초 안에 다시
  const cb = card.querySelector("[data-dc-clear]");
  if (cb) cb.addEventListener("click", () => {
    if (!cb.classList.contains("armed")) { cb.classList.add("armed"); setTimeout(() => cb.classList.remove("armed"), 3000); return; }
    DC.q = {};
    dcSave(); holdHeight(); dcRefresh(); keepTap();
  });
  if (!card.querySelector("[data-dc-goal]")) return;  // 불러오는 중·종목 없음
  const redraw = () => { dcSave(); holdHeight(); dcRefresh(); keepTap(); };
  const xsNow = () => dvHold().list.map(dcInfo);
  // 숫자만 바꿀 땐 칸을 다시 그리지 않아요 (입력하던 자리·글자판 유지)
  const soft = () => {
    dcSave();
    const xs = xsNow();
    const hero = card.querySelector("[data-dc-hero]");
    if (hero) hero.innerHTML = dcHero(xs);
    xs.forEach((x) => { const o = card.querySelector(`[data-dc-out="${CSS.escape(dcKey(x.h))}"]`); if (o) o.innerHTML = dcOut(x); });
    card.querySelectorAll("[data-dc-sec]").forEach((o) => { o.textContent = dcSecSum(xs.filter((x) => x.h.m === o.dataset.dcSec)); });
    const g = card.querySelector("[data-dc-goal-out]");
    if (g) { g.innerHTML = dcGoalOut(xs); bindUse(); }
  };
  const setQ = (k, v) => {
    const h = dvHold().list.find((x) => dcKey(x) === k);
    v = Math.max(0, Math.round(v * 10000) / 10000);
    if (h && v === h.qty) delete DC.q[k]; else DC.q[k] = v;
  };
  card.querySelectorAll("[data-dc-q]").forEach((i) => i.addEventListener("input", () => { setQ(i.dataset.dcQ, dcNum(i.value)); soft(); }));
  card.querySelectorAll("[data-dc-pm]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.dcPm, i = card.querySelector(`[data-dc-q="${CSS.escape(k)}"]`);
    setQ(k, dcNum(i.value) + +b.dataset.d);  // 소수점 주(0.37주 등)도 그대로 두고 1주씩 더하고 빼요
    redraw();
  }));
  card.querySelectorAll("[data-dc-open]").forEach((b) => b.addEventListener("click", () => {
    const x = xsNow().find((y) => dcKey(y.h) === b.dataset.dcOpen);
    if (x) dcPopOpen(x);
  }));
  card.querySelectorAll("[data-dc-tax]").forEach((b) => b.addEventListener("click", () => { DC.net = b.dataset.dcTax === "1"; redraw(); }));
  card.querySelector("[data-dc-goal]").addEventListener("click", () => { DC.goal = !DC.goal; redraw(); });
  const amt = card.querySelector("[data-dc-amt]");
  if (amt) amt.addEventListener("input", () => { DC.amt = amt.value.replace(/[^0-9]/g, ""); soft(); });
  card.querySelectorAll("[data-dc-per]").forEach((b) => b.addEventListener("click", () => { DC.per = b.dataset.dcPer; redraw(); }));
  const fr = card.querySelector("[data-dc-frac]");
  if (fr) fr.addEventListener("click", () => { DC.frac = !DC.frac; redraw(); });
  card.querySelectorAll("[data-dc-way]").forEach((b) => b.addEventListener("click", () => { DC.way = b.dataset.dcWay; redraw(); }));
  function bindUse() {
    const u = card.querySelector("[data-dc-use]");
    if (!u) return;
    u.addEventListener("click", () => {
      const T = dcNum(DC.amt) * (DC.per === "m" ? 12 : 1), p = dcPlan(xsNow(), T);
      if (!p.pay) return;
      p.pay.forEach((x, i) => setQ(dcKey(x.h), x.h.qty + p.add[i]));
      redraw();
    });
  }
  bindUse();
}

// ---------------------------------------------------------------- 종목 창 (배당 계산기에서 종목 이름을 누르면)
// 가격(종목 파일 마지막 종가)·배당 주기·연도별 1주 배당 막대(배당 성장률)·배당 내역. 화면 위에 떠서 뒤 화면 위치는 그대로예요.
// 배당 내역 = 종목 파일(stocks/<시장>/<코드>.json)의 divs: 최근 10년 [["YYYY-MM", 1주 배당]] (returns.py → stock_pages.py·all_stocks.py)
let dcPopKey = null;
const dcPct = (r) => (r == null ? "-" : Math.abs(r) < 0.0005 ? "→ 0%" : `${r > 0 ? "↑" : "↓"} ${Math.abs(r * 100).toFixed(1)}%`);
// 연도별 합: [{y, amt, n, part}] 오래된 순. 올해는 '진행 중'(part), 10년 창 맨 앞 해는 1월부터가 아니라 빼요
function dcYears(divs) {
  const thisY = new Date().getFullYear(), by = new Map();
  divs.forEach(([ym, a]) => { const y = +ym.slice(0, 4); if (y < thisY - 9) return; const o = by.get(y) || { y, amt: 0, n: 0 }; o.amt += a; o.n++; by.set(y, o); });
  const ys = [...by.values()].sort((a, b) => a.y - b.y);
  ys.forEach((o, i) => { o.part = o.y === thisY; o.g = i && !o.part && ys[i - 1].amt ? o.amt / ys[i - 1].amt - 1 : null; });
  return ys;
}
// 배당 성장률: 최근 5년(없으면 있는 만큼) 연평균, 몇 년 연속 늘었는지
function dcGrowth(ys) {
  const full = ys.filter((o) => !o.part);
  if (full.length < 2) return null;
  const k = Math.min(5, full.length - 1), a = full[full.length - 1 - k].amt, b = full[full.length - 1].amt;
  let up = 0;
  for (let i = full.length - 1; i > 0 && full[i].amt > full[i - 1].amt * 1.0005; i--) up++;
  return { cagr: a > 0 ? (b / a) ** (1 / k) - 1 : null, k, up, last: full[full.length - 1] };
}
function dcBars(h, ys) {
  if (!ys.length) return "";
  const W = 340, H = 150, top = 22, bot = 22, n = ys.length, gap = 6, bw = Math.min(34, (W - gap * (n - 1)) / n);
  const x0 = (W - (bw * n + gap * (n - 1))) / 2, max = Math.max(...ys.map((o) => o.amt)) || 1;
  const bars = ys.map((o, i) => {
    const bh = Math.max(2, ((H - top - bot) * o.amt) / max), x = x0 + i * (bw + gap), y = H - bot - bh;
    return `<rect class="dc-bar${o.part ? " part" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4"></rect>
      <text class="dc-bar-g" x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}">${o.part ? "진행 중" : o.g == null ? "" : Math.abs(o.g) < 0.005 ? "0%" : `${o.g > 0 ? "↑" : "↓"}${Math.abs(Math.round(o.g * 100))}%`}</text>
      <text class="dc-bar-y" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}">'${String(o.y).slice(2)}</text>`;
  }).join("");
  return `<svg class="dc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="연도별 1주 배당 막대, 위 숫자는 전년 대비 성장률">${bars}</svg>`;
}
function dcMonths(x) {
  const on = new Set(x.months);
  return `<div class="dc-mo" aria-label="배당락 달">${Array.from({ length: 12 }, (_, i) => `<span class="${on.has(i + 1) ? "on" : ""}">${i + 1}</span>`).join("")}</div>`;
}
function dcPopHtml(x, f) {
  const h = x.h, divs = (f && Array.isArray(f.divs) && f.divs) || null;
  const c = f && f.candles && f.candles.c && f.candles.c.length ? f.candles : null;
  const sp = savPx(h);
  const px = c ? c.c[c.c.length - 1] : sp && sp.px, day = c ? c.dates[c.dates.length - 1] : sp && sp.day;
  const pxTxt = px ? (h.m === "us" ? `$${px.toLocaleString("en-US", { maximumFractionDigits: 2 })} <small class="muted">약 ${astWon(px * dvFx())}</small>` : astWon(px)) : "가격 몰라요";
  const yld = px && x.base && x.freq ? (x.base * x.freq) / px : null;
  const ys = divs ? dcYears(divs) : [], g = dcGrowth(ys);
  const pay = divs ? divs.slice().reverse() : [];
  const cell = (d, i) => { const prev = pay[i + 1]; return `<li><small class="muted">${d[0].slice(2).replace("-", ".")}</small><b>${dcPer1(h, d[1])}</b><small class="dc-chg">${prev ? dcPct(d[1] / prev[1] - 1) : ""}</small></li>`; };
  const dd = dcDD(x, f), nx = dcNextEx(x);
  const ddTxt = dd ? `${dd.dd > -0.0005 ? "최고점" : `−${Math.abs(dd.dd * 100).toFixed(1)}%`}` : "-";
  const body = !f ? `<p class="muted">불러오는 중…</p>` : `
    <div class="sav-hero ast-hero"><div class="ast-tile dv-tile"><small>지금 가격${day ? ` (${+day.slice(5, 7)}.${+day.slice(8, 10)} 종가)` : ""}</small><b>${pxTxt}</b></div>
      <div class="ast-tile dv-tile"><small>배당률 (세전, 최근 배당)</small><b>${yld ? `${(yld * 100).toFixed(2)}%` : "-"}</b></div>
      <div class="ast-tile dv-tile"><small>1년 최고점 대비</small><b>${ddTxt}</b></div>
      <div class="ast-tile dv-tile"><small>다음 배당락</small><b>${nx ? `${nx.t} <small class="muted">${nx.sure ? "확정" : "예상"}</small>` : "-"}</b></div></div>
    ${dd && dd.dd <= DC_BUY ? `<p class="dc-buy-box">🛒 <b>매수 신호</b> · 1년 최고점${dd.hi ? ` ${dcPer1(h, dd.hi)}` : ""}보다 ${Math.abs(dd.dd * 100).toFixed(0)}% 내려왔어요. 배당이 그대로면 사는 값 대비 배당률이 높아지는 구간이에요.
      <small class="muted">단순 규칙(최고점 −20%)이라, 실적 악화·배당 축소 때문에 떨어진 건 아닌지 꼭 확인하세요.</small></p>` : ""}
    <div class="dc-pop-freq">${dcFreqTag(x.freq)}${dcMonths(x)}</div>
    <h4 class="dc-pop-h">배당 성장률</h4>
    ${divs ? `${g ? `<p class="dc-pop-g">최근 ${g.k}년 연평균 <b>${dcPct(g.cagr)}</b>${g.up ? ` · ${g.up}년 연속 늘림` : ""}</p>` : `<p class="muted dc-pop-g">비교할 해가 모자라요.</p>`}
      ${dcBars(h, ys)}
      <p class="muted" style="margin:2px 0 0;font-size:12px">막대 = 그해 1주 배당 합, 위 숫자 = 전년 대비 (올해는 진행 중).</p>
      <h4 class="dc-pop-h">최근 배당 <small class="muted">배당락 달 · 1주 · 직전 대비</small></h4>
      <ul class="dc-pay">${pay.slice(0, 4).map(cell).join("")}</ul>
      ${pay.length > 4 ? `<details class="dc-more"><summary>전체 내역 ${pay.length}번</summary><ul class="dc-pay">${pay.slice(4).map((d, i) => cell(d, i + 4)).join("")}</ul></details>` : ""}`
    : `<p class="muted" style="font-size:13px">10년 배당 내역은 매주 토요일 자료를 받은 뒤부터 나와요. 지금은 최근 배당만 있어요: ${x.lastD ? `${x.lastD.mo}월 1주 ${dcPer1(h, x.lastD.amt)} ${dcChg(x)}` : "최근 1년 배당 없음"}</p>`}
    <p class="muted" style="margin:12px 0 0;font-size:12px">야후 파이낸스(무료) 배당락 기준 1주 금액(세전). 앞으로도 이만큼 준다는 뜻은 아니에요.</p>`;
  return `<div class="dc-pop-bg" data-dc-close></div>
    <div class="dc-pop-box" role="dialog" aria-modal="true" aria-label="${esc(h.name)} 배당 정보">
      <div class="dc-pop-top"><div><b>${esc(h.name)}</b><small class="muted">${h.m === "kr" ? "국장" : "미장"} · ${esc(h.code)}</small></div>
        <button type="button" class="ast-btn dc-x" data-dc-close aria-label="닫기">✕</button></div>
      <div class="dc-pop-body">${body}</div></div>`;
}
function dcPopClose() {
  const p = $("#dc-pop");
  if (p) p.remove();
  dcPopKey = null;
  document.removeEventListener("keydown", dcPopEsc);
}
function dcPopEsc(e) { if (e.key === "Escape") dcPopClose(); }
function dcPopOpen(x) {
  dcPopClose();
  const k = dcKey(x.h);
  dcPopKey = k;
  const box = document.createElement("div");
  box.id = "dc-pop";
  box.className = "dc-pop";
  const paint = (f) => {
    if (dcPopKey !== k) return;
    box.innerHTML = dcPopHtml(x, f);
    box.querySelectorAll("[data-dc-close]").forEach((b) => b.addEventListener("click", dcPopClose));
  };
  paint(STOCK_READY.get(`${x.h.m}/${x.h.code}`) || null);
  document.body.appendChild(box);
  document.addEventListener("keydown", dcPopEsc);
  const x1 = box.querySelector(".dc-x");
  if (x1) x1.focus({ preventScroll: true });
  if (!STOCK_READY.has(`${x.h.m}/${x.h.code}`)) stockData(x.h.m, x.h.code).then((f) => paint(f || {}));
}
