// ---------------------------------------------------------------- 배당 계산기 (도구 → 배당 계산기, 2026-11-28)
// 사용자 "내가 가진 주식 배당 계산기": 자산 기록에 적은 종목만, 주 수를 바꿔 보면 '가장 최근 1회 배당'으로 1년에 얼마 받는지 세전/세후.
// 시작 주 수 = 지금 보유(자산 기록 마지막 달, dvHold). 등락 = 최근 배당이 직전 배당보다 ↑↓ (색 없이 글자만, 자산 기록 규칙).
// 목표 배당금(선택, 켜기): 보유 종목만으로 '지금 비중 그대로 늘리기' 또는 '모자란 만큼 같은 돈씩 사기'로 몇 주 더 필요한지.
// 자료: symbols/<시장>_returns.json r[6] 최근 12개월·r[7] 그 전 12개월 [배당락 달, 1주당 배당] (야후 무료, 매주 토요일) + 종가(_quotes.json).
// 배당 달력(asset.js dvHold·dvHist·DV_TAX)을 같이 써요. 주 수·설정은 이 폰에만 저장 (localStorage divcalc).
let DC = { q: {}, net: true, goal: false, amt: "", per: "m", way: "keep" };
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
  const freq = dvHist(h.m, h.code).length;
  const lastD = s[s.length - 1] || null, prevD = s.length > 1 ? s[s.length - 2] : null;
  const p = savPx(h);
  // 최근 1회가 평소(그 전 배당들 가운데 값)의 3배 넘으면 특별 배당일 수 있어 1년 계산은 평소 크기로 해요 (최근 값은 그대로 보여 줘요)
  let base = lastD ? lastD.amt : 0, odd = 0;
  if (lastD && s.length >= 3) {
    const v = s.slice(0, -1).map((x) => x.amt).sort((a, b) => a - b), mid = v[Math.floor((v.length - 1) / 2)];
    if (base > mid * 3) { odd = base / mid; base = mid; }
  }
  const year = base * freq * fx * tax;
  return { h, lastD, prevD, freq, base, odd, once: base * fx * tax, year, px: p ? p.won : null };
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
const dcWhen = (f) => (f >= 12 ? "매달" : f === 4 ? "분기마다" : f === 2 ? "반년마다" : f === 1 ? "1년에 한 번" : `1년에 ${f}번`);

// 목표: 1년 T원 받으려면 (보유 종목만, 팔지는 않아요)
// keep = 지금 주 수 비율 그대로 늘리기, same = 모자란 만큼을 종목마다 같은 돈씩 사기 (가격 아는 종목만)
function dcPlan(xs, T) {
  const pay = xs.filter((x) => x.year > 0);
  const now = pay.reduce((a, x) => a + x.year * x.h.qty, 0);
  if (!pay.length) return { err: "배당 주는 보유 종목이 없어요." };
  if (now >= T) return { done: true, now };
  let add;
  if (DC.way === "keep" && now > 0) {
    const f = T / now;
    add = pay.map((x) => Math.max(0, Math.ceil(x.h.qty * f) - x.h.qty));
  } else {
    const ok = pay.filter((x) => x.px);
    if (!ok.length) return { err: "가격을 아는 종목이 없어 계산할 수 없어요." };
    const M = (T - now) / ok.reduce((a, x) => a + x.year / x.px, 0);  // 종목마다 넣을 돈
    add = pay.map((x) => (x.px ? Math.ceil(M / x.px) : 0));
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
  const head = `<h2 class="goal-h"><span>🧮 배당 계산기</span><span class="goal-h-r"><small>최근 배당 기준</small></span></h2>`;
  if (typeof dvHold !== "function") return `<section class="card" id="dc-card">${head}<p class="muted" style="margin:6px 0 0">불러오는 중…</p></section>`;
  const { ym, list } = dvHold();
  if (!list.length) return `<section class="card" id="dc-card">${head}
    <p class="muted" style="margin:6px 0 0;font-size:13px">'자산 기록' 탭에 종목과 주 수를 적으면, 그 종목들로 배당을 계산해요.</p></section>`;
  if (!RET.kr || !RET.us) return `<section class="card" id="dc-card">${head}<p class="muted" style="margin:6px 0 0">배당 자료 불러오는 중…</p></section>`;
  const xs = list.map(dcInfo).sort((a, b) => b.year * b.h.qty - a.year * a.h.qty);
  const rows = xs.map((x) => {
    const k = dcKey(x.h);
    return `<li class="dc-row"><div class="ast-mix-t"><b>${esc(x.h.name)}</b><small class="muted">${x.h.m === "kr" ? "국장" : "미장"}${x.freq ? ` · ${dcWhen(x.freq)}` : ""}</small></div>
      ${x.lastD ? `<small class="dv-sub">최근 ${x.lastD.mo}월 1주 <b>${dcPer1(x.h, x.lastD.amt)}</b>${x.lastD.fix ? " (튀는 값이라 보통 크기로 봄)" : ""}${x.odd ? ` <span class="muted">(평소의 ${Math.round(x.odd)}배라 특별 배당일 수 있어요. 1년 계산은 평소 ${dcPer1(x.h, x.base)})</span>` : ""} ${dcChg(x)}${x.px && x.year ? ` · <span class="muted">배당률 ${(x.year / (DC.net ? 1 - DV_TAX[x.h.m] : 1) / x.px * 100).toFixed(1)}%</span>` : ""}</small>` : ""}
      <div class="dc-qty"><button type="button" class="ast-btn dc-pm" data-dc-pm="${k}" data-d="-1" aria-label="1주 빼기">−</button>
        <span class="alert-input"><input data-dc-q="${k}" type="text" inputmode="decimal" value="${dcQty(x.h)}" aria-label="${esc(x.h.name)} 주 수"><span>주</span></span>
        <button type="button" class="ast-btn dc-pm" data-dc-pm="${k}" data-d="1" aria-label="1주 더하기">+</button></div>
      <small class="dc-out" data-dc-out="${k}">${dcOut(x)}</small>
      <small class="muted dc-have">보유 ${astQty(x.h.qty)}</small></li>`;
  }).join("");
  const changed = xs.some((x) => dcQty(x.h) !== x.h.qty);
  const goal = DC.goal ? `<div class="dc-goal"><div class="dc-goal-in"><span class="alert-input"><input data-dc-amt type="text" inputmode="numeric" value="${esc(DC.amt)}" placeholder="예: 300000" aria-label="목표 배당금"><span>원</span></span>
        <nav class="chips"><button type="button" data-dc-per="m" aria-pressed="${DC.per === "m"}">한 달</button><button type="button" data-dc-per="y" aria-pressed="${DC.per === "y"}">1년</button></nav></div>
      <nav class="chips"><button type="button" data-dc-way="keep" aria-pressed="${DC.way === "keep"}">지금 비중 그대로</button><button type="button" data-dc-way="same" aria-pressed="${DC.way === "same"}">모자란 만큼 같은 돈씩</button></nav>
      <div data-dc-goal-out>${dcGoalOut(xs)}</div></div>` : "";
  return `<section class="card" id="dc-card">${head}
    <nav class="chips"><button type="button" data-dc-tax="0" aria-pressed="${!DC.net}">세전</button><button type="button" data-dc-tax="1" aria-pressed="${DC.net}">세후</button></nav>
    <div class="sav-hero ast-hero" data-dc-hero>${dcHero(xs)}</div>
    <ul class="ast-mix dc-list">${rows}</ul>
    ${changed ? `<button type="button" class="ast-btn" data-dc-reset style="margin-top:10px">보유 주 수로 되돌리기</button>` : ""}
    <button type="button" class="alert-toggle dc-goal-sw" data-dc-goal aria-expanded="${DC.goal}"><span>🎯 목표 배당금으로 포트폴리오 짜기</span><b>${DC.goal ? "끄기" : "켜기"}</b></button>
    ${goal}
    <p class="muted note" style="margin:10px 0 0">${ymName(ym)} 자산 기록 종목 기준. 1년 배당 = 가장 최근 1회 배당 × 1년에 주는 횟수 × 주 수예요. 회사가 배당을 바꾸면 달라지고, 받을 돈을 약속하는 숫자가 아니에요.
      ${tx === "세후" ? "세후" : "세후로 바꾸면"} = 국장 15.4%(배당소득세 14% + 지방세 1.4%), 미장 15%(미국에서 먼저 뗌) 뺀 값. ISA·연금 계좌는 다르고, 1년 금융소득 2천만 원이 넘으면 종합과세돼요.
      미장은 환율 ${num(dvFx())}원. 직전 대비는 바로 앞 배당과 비교 (1년에 한 번 주는 종목은 작년). 자료: 야후 파이낸스(무료).</p></section>`;
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
    setQ(k, Math.floor(dcNum(i.value)) + +b.dataset.d);
    redraw();
  }));
  card.querySelectorAll("[data-dc-tax]").forEach((b) => b.addEventListener("click", () => { DC.net = b.dataset.dcTax === "1"; redraw(); }));
  const rs = card.querySelector("[data-dc-reset]");
  if (rs) rs.addEventListener("click", () => { DC.q = {}; redraw(); });
  card.querySelector("[data-dc-goal]").addEventListener("click", () => { DC.goal = !DC.goal; redraw(); });
  const amt = card.querySelector("[data-dc-amt]");
  if (amt) amt.addEventListener("input", () => { DC.amt = amt.value.replace(/[^0-9]/g, ""); soft(); });
  card.querySelectorAll("[data-dc-per]").forEach((b) => b.addEventListener("click", () => { DC.per = b.dataset.dcPer; redraw(); }));
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
