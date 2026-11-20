"use strict";
// ---------------------------------------------------------------- 움직임 (화면 전환, 숫자 올라가기, 새 신호 반짝임)
// 폰 설정에서 '동작 줄이기'(prefers-reduced-motion)를 켰으면 전부 꺼요.
const calm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// 선 그래프 그리기 (사용자 2026-10-25 "버튼 눌러서 그래프 바뀔 때마다 그려지는 모습, 속도는 산업지도랑 똑같이"):
// 버튼을 누르고 바로 그린 선 그래프는 선이 왼쪽에서 오른쪽으로 그려져요. 산업 지도 별자리 선과 같은 속도
// (625ms + 선 길이 1px당 2ms)·움직임(cubic-bezier(.35,.1,.25,1))이고, 끝 점·금액 딱지는 선이 85% 왔을 때 켜져요.
// 밀기·확대·화면 크기 바뀜·자료 받아서 다시 그릴 때는 그대로예요. 아래 메뉴로 화면만 옮길 때도 그대로.
let drawTap = 0;
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button, label, summary, [role=button], [data-sym]");
  if (t && !t.closest(".nav")) drawTap = performance.now();
}, true);
// 이 칸(el)이 방금 누른 버튼 때문에 다시 그려지는 거면 true (한 번 누를 때 한 번만)
function drawSoon(el) {
  if (!el || calm() || !drawTap || performance.now() - drawTap > 1500 || el._drawTap === drawTap) return false;
  el._drawTap = drawTap;
  return true;
}
const drawEase = (() => {  // cubic-bezier(.35,.1,.25,1)
  const [x1, y1, x2, y2] = [0.35, 0.1, 0.25, 1];
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => { let lo = 0, hi = 1, t = x; for (let k = 0; k < 20; k++) { t = (lo + hi) / 2; if (bz(t, x1, x2) < x) lo = t; else hi = t; } return bz(t, y1, y2); };
})();
// svg 안 sel 선들을 x0부터 w 폭만큼 왼쪽에서 오른쪽으로 드러내요. late는 다 그려질 때쯤 켜지는 것(끝 점·딱지).
// px는 화면에서 선 길이 (viewBox를 늘려 그리는 그래프는 화면 폭)
function drawIn(svg, { x0 = 0, w, sel, late = "", px = w }) {
  if (!svg) return;
  const lines = svg.querySelectorAll(sel);
  if (!lines.length) return;
  const ns = "http://www.w3.org/2000/svg", id = `dw${Math.random().toString(36).slice(2, 8)}`;
  const cp = document.createElementNS(ns, "clipPath"), r = document.createElementNS(ns, "rect");
  cp.id = id; cp.setAttribute("clipPathUnits", "userSpaceOnUse");
  const vb = svg.viewBox.baseVal, H = (vb && vb.height) || 1000;
  r.setAttribute("x", x0 - 4); r.setAttribute("y", -H); r.setAttribute("height", H * 3); r.setAttribute("width", 0);
  cp.appendChild(r);
  let defs = svg.querySelector("defs");
  if (!defs) { defs = document.createElementNS(ns, "defs"); svg.prepend(defs); }
  defs.appendChild(cp);
  lines.forEach((l) => l.setAttribute("clip-path", `url(#${id})`));
  svg.classList.add("drawing");
  const dur = 625 + px * 2, t0 = performance.now();
  const lateEls = late ? [...svg.querySelectorAll(late)] : [];
  lateEls.forEach((e) => e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 625, delay: dur * 0.85, easing: "ease-out", fill: "backwards" }));
  const step = (now) => {
    if (!svg.isConnected) return;
    const f = Math.min(1, (now - t0) / dur);
    r.setAttribute("width", (w + 8) * drawEase(f));
    if (f < 1) requestAnimationFrame(step);
    else { lines.forEach((l) => l.removeAttribute("clip-path")); cp.remove(); svg.classList.remove("drawing"); }
  };
  requestAnimationFrame(step);
}
// 다음 render()에서 쓸 화면 전환: rise(앱을 열 때 카드가 차례로), fade(아래 버튼), push(종목·검색 열기),
// pop(뒤로), swap(국장·미장 바꾸기). 별표·지표 버튼처럼 같은 화면을 다시 그릴 때는 비어 있어서 안 움직여요.
let motion = "rise";
const FX = ["fx-rise", "fx-fade", "fx-push", "fx-pop", "fx-swap"];
let fxTimer = 0;
function playMotion(app) {
  const kind = motion;
  motion = null;
  if (!kind || calm()) return;
  app.classList.add(`fx-${kind}`);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => app.classList.remove(...FX), 900);
  countUp(app);
}

// 숫자 올라가기: 0에서 최종 숫자까지 0.7초 (처음엔 빠르게, 끝에서 천천히). 화면을 열 때 보이는 숫자만 해요.
const CNT = {
  money: (v) => money(market, v), price: (v) => price(market, v), num: (v) => num(v),
  pct: (v) => pct(v), pct2: (v) => pct(v, 2),
};
const cnt = (v, f, text) => (v == null || !Number.isFinite(v) ? text : `<span class="cnt" data-v="${v}" data-f="${f}">${text}</span>`);
function countUp(root) {
  const items = [...root.querySelectorAll(".cnt")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }).map((el) => ({ el, to: Number(el.dataset.v), f: CNT[el.dataset.f], end: el.textContent }));
  if (!items.length) return;
  let done = false;
  const finish = () => { done = true; items.forEach((x) => { x.el.textContent = x.end; }); };
  const t0 = performance.now(), dur = 700;
  const step = (now) => {
    if (done) return;
    const t = (now - t0) / dur;
    if (t >= 1) { finish(); return; }
    const k = 1 - (1 - Math.max(0, t)) ** 3;
    items.forEach((x) => { x.el.textContent = x.f(x.to * k); });
    requestAnimationFrame(step);
  };
  items.forEach((x) => { x.el.textContent = x.f(0); });
  requestAnimationFrame(step);
  setTimeout(finish, dur + 400);  // 화면이 가려져 그리기가 멈춰도 최종 숫자는 꼭 보여요
}

const VIEWS = {
  // 홈 맨 위는 큰 발표·지수 급변 강조 칸(있을 때만), 그 아래는 세계 지수 → 더 보기 → 오늘의 리포트 요약.
  // 나머지(급락 점검 포함)는 '더 보기' 칸에 한 줄씩 접어 둬요. 매매 신호·가상계좌는 없앴어요 (사용자 2026-10-24)
  // 맨 위 얇은 지수 바는 세계 지수가 돌아가며 보이고, 누르면 세계 지수 화면(한 겹 위)이 열려요 (사용자 2026-10-24)
  home: (d) => [worldTicker(), bigEventsCard(), marketStatusCard(), worldHomeCard(), homeMoreCard(d), homeReportCard()],
  report: (d) => [rpTabsBar(), ...(rpTabNow() === "past" ? pastCards(d) : rpTabNow() === "week" ? weeklyCards() : reportCards(d))],
  watch: (d) => [watchCard(d), screenerCard(d), allStocksCard(d)],
  // 도구: 맨 위 가로로 미는 선택 바에서 고른 묶음 하나만 아래에 보여요 (사용자가 정함, 2026-10-17). 묶음은 PERF_TABS
  tools: (d) => [perfTabsBar(d), ...perfTab(d).cards(d)],
  chart: (d) => [trendCard(d) || `<section class="card"><p class="empty">아직 지수 기록이 없어요.</p></section>`, compareCard(d)],
  // 차트는 머리 칸 바로 아래, 사기 전 체크리스트보다 위 (사용자, 2026-11-19)
  stock: (d) => [stockHeadCard(d), stockChartCard(), checkCard(d), discloseStockCard(d), stockSectorCard(d),
    market === "kr" ? `<section class="card" id="flow-card"><h2>외국인·기관 수급</h2><p class="muted">불러오는 중이에요…</p></section>` : "",
    `<section class="card" id="fund-card"><h2>재무제표</h2><p class="muted">불러오는 중이에요…</p></section>`],
  search: () => [searchCard(), `<div id="search-results" class="stack">${searchResults()}</div>`, glossaryCard()],
  map: () => [mapCard(), `<div id="map-detail" class="stack">${mapDetailCard()}</div>`],
  inbox: () => [inboxHeadCard(), briefCard(), inboxCard()],
  world: () => [worldCard()],
  feedback: () => [feedbackCard()],
  help: () => [helpCard()],
  more: (d) => moreView(d),
};

let lastView = "", holdH = 0;
// 누른 버튼이 다시 그린 뒤에도 화면의 같은 높이에 있게 맞춰요 (위 칸 높이가 바뀌어도, 차트가 늦게 그려져도)
let lastTap = null;
const tapSig = (el) => {
  const data = el.getAttributeNames().filter((a) => a.startsWith("data-")).map((a) => `${a}=${el.getAttribute(a)}`).join("&");
  return `${el.tagName}|${data || (el.textContent || "").trim().slice(0, 40)}`;
};
// 같은 표시의 버튼이 여럿이면(예: '자세히') 몇 번째였는지로 찾아요.
// 같은 버튼이 다른 칸에도 있으면(예: 관심 화면 ★가 내 관심종목·전체 종목 두 곳) 누른 칸(id가 있는 가장 가까운 칸) 안에서만 찾아요.
// 안 그러면 ★를 넣는 순간 위 칸에 생긴 같은 ★ 자리로 화면이 올라가요 (사용자 2026-10-24)
const tapBox = (el) => { const b = el.parentElement && el.parentElement.closest("#app [id]"); return b ? b.id : ""; };
const tapAll = (sig, box) => {
  const root = (box && document.getElementById(box)) || $("#app");
  return root ? [...root.querySelectorAll(sig.split("|")[0])].filter((x) => tapSig(x) === sig) : [];
};
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("#app button, #app summary, #app li, #app [role=button]");
  if (!el) { lastTap = null; return; }
  const sig = tapSig(el), box = tapBox(el);
  lastTap = { sig, box, idx: tapAll(sig, box).indexOf(el), top: el.getBoundingClientRect().top, at: performance.now() };
}, true);
function keepTap() {
  const t = lastTap;
  if (!t || performance.now() - t.at > 1000) return;
  lastTap = null;
  const fix = () => {
    const el = tapAll(t.sig, t.box)[t.idx];
    if (el) { const dy = el.getBoundingClientRect().top - t.top; if (Math.abs(dy) > 1) window.scrollBy(0, dy); }
  };
  fix();
  requestAnimationFrame(fix);
  setTimeout(fix, 250);
}
// 페이지 아래쪽에서 칸이 줄면(접기, ★ 빼기, 다시 그리기) 브라우저가 화면을 끌어올려요. 그래서 높이를 붙잡아 두고,
// 1.5초 뒤부터는 보던 화면 아래에 빈칸이 안 보일 때(위로 올려 볼 때) 놓아요 (사용자 2026-10-24 '화면 돌아가지 않게')
let holdReady = false;
function holdHeight() {
  const app = $("#app");
  if (!app) return;
  app.style.minHeight = `${Math.max(app.offsetHeight, parseFloat(app.style.minHeight) || 0)}px`;
  holdReady = false;
  clearTimeout(holdH);
  holdH = setTimeout(() => { holdReady = true; releaseHold(); }, 1500);
}
function releaseHold() {
  const app = $("#app");
  if (!holdReady || !app || !app.style.minHeight) return;
  const last = app.lastElementChild;
  if (!last || last.getBoundingClientRect().bottom >= window.innerHeight) { app.style.minHeight = ""; holdReady = false; }
}
window.addEventListener("scroll", releaseHold, { passive: true });
// 펼친 칸(details)을 접기 직전에 높이를 붙잡아요
document.addEventListener("click", (e) => {
  const sum = e.target.closest && e.target.closest("#app summary");
  if (sum && sum.parentElement && sum.parentElement.open) holdHeight();
}, true);
// 가로로 미는 버튼 줄(차트 지수·도구·세계 지수 묶음·달 버튼): 다시 그려도 밀어 둔 가로 위치 그대로예요.
// 처음 열 때만 고른 버튼을 가운데로, 화면 끝에 반쯤 걸친 버튼을 누르면 그만큼만 부드럽게 밀어 보여 줘요 (사용자 2026-10-24 '화면이 확확 바뀌니 눈이 아파')
const ROW_X = {};
function keepRow(row, key) {
  if (!row) return;
  const on = row.querySelector('[aria-pressed="true"], .on');
  const rel = (b) => b.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
  if (ROW_X[key] != null) row.scrollLeft = ROW_X[key];
  else if (on) row.scrollLeft = Math.max(0, rel(on) - (row.clientWidth - on.offsetWidth) / 2);
  ROW_X[key] = row.scrollLeft;
  row.addEventListener("scroll", () => { ROW_X[key] = row.scrollLeft; }, { passive: true });
  if (!on) return;
  const l = rel(on) - row.scrollLeft, r = l + on.offsetWidth, pad = 12;
  const dx = l < 0 ? l - pad : r > row.clientWidth ? r - row.clientWidth + pad : 0;
  if (dx) row.scrollBy({ left: dx, behavior: calm() ? "auto" : "smooth" });
}
function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === market)));
  const sb = $(".search-btn");
  if (sb) { if (screen === "search") sb.setAttribute("aria-current", "page"); else sb.removeAttribute("aria-current"); }
  const mb = $(".map-btn");
  if (mb) { if (screen === "map") mb.setAttribute("aria-current", "page"); else mb.removeAttribute("aria-current"); }
  inboxDot();
  const fo = $(".fb-open");
  if (fo) fo.hidden = screen === "feedback";  // 의견 화면에선 맨 아래 버튼을 숨겨요
  const lit = LAYERS.includes(screen) ? stockFrom : screen;
  document.querySelectorAll(".nav button").forEach((b) => {
    if (b.dataset.screen === lit) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (!DATA) return;
  const d = DATA.markets[market];
  const app = $("#app");
  app.classList.remove(...FX);
  // 같은 화면을 다시 그릴 땐(버튼·칩·탭을 눌러서) 보던 위치 그대로예요. 화면을 바꾸면 go()가 맨 위로 올려요 (사용자 규칙 2026-10-17)
  const view = `${screen}|${market}|${stockCode}`, keepAt = view === lastView ? window.scrollY : null;
  lastView = view;
  // 다시 그리는 동안 차트·재무제표가 잠깐 비어 화면이 짧아지면 위치가 밀려요. 그동안만 높이를 붙잡아 둬요
  if (keepAt != null) holdHeight();
  else { clearTimeout(holdH); app.style.minHeight = ""; holdReady = false; }  // 다른 화면은 붙잡은 높이 없이
  app.innerHTML = VIEWS[screen](d).join("");
  if (keepAt != null) { window.scrollTo(0, keepAt); keepTap(); }
  app.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.learnSet) learnTab = b.dataset.learnSet;  // 검색 화면 용어 사전 → 투자 공부 용어집
    openMore(b.dataset.more);
  }));
  // 핫 뉴스: 기사를 누르면 읽음 (화면은 그대로, 연하게만 — 다음에 그릴 때 빠져요). '읽음'·'모두 읽음'은 바로 빼요
  app.querySelectorAll("[data-hot-read]").forEach((a) => a.addEventListener("click", () => {
    readHot([a.dataset.hotRead]);
    const li = a.closest("li");
    if (li) li.classList.add("read");
  }));
  app.querySelectorAll("[data-hot-ok]").forEach((b) => b.addEventListener("click", () => { readHot([b.dataset.hotOk], true); holdHeight(); render(); }));
  // 접기·펼치기는 제목 아래만 바뀌어서 다시 그리지 않아요 (누른 제목 줄은 제자리)
  app.querySelectorAll("[data-hot-fold]").forEach((b) => b.addEventListener("click", () => {
    hotFold = !hotFold;
    if (hotFold) holdHeight();  // 접기 전에 높이를 붙잡아요 (짧은 화면에서 접으면 스크롤이 위로 당겨져서)
    remember("hot_fold", hotFold ? "1" : "0");
    const card = b.closest(".hot-card");
    card.classList.toggle("folded", hotFold);
    b.setAttribute("aria-expanded", String(!hotFold));
  }));
  app.querySelectorAll(".hot-grp-d").forEach((x) => {
    x.querySelector("summary").addEventListener("click", () => { if (x.open) holdHeight(); });  // 접을 때 화면이 위로 당겨지지 않게
    x.addEventListener("toggle", () => { if (x.open) HOT_GRP_OPEN.add(x.dataset.hotGrp); else HOT_GRP_OPEN.delete(x.dataset.hotGrp); });
  });
  app.querySelectorAll(".hot-read-list").forEach((x) => x.addEventListener("toggle", () => { hotReadOpen = x.open; }));
  app.querySelectorAll("[data-hot-undo]").forEach((b) => b.addEventListener("click", () => { unreadHot([b.dataset.hotUndo]); holdHeight(); render(); }));
  // 모두 읽음: 실수로 누르지 않게 한 번 누르면 '한 번 더 누르면 모두 읽음'으로 바뀌고, 3초 안에 다시 눌러야 돼요
  app.querySelectorAll("[data-hot-all]").forEach((b) => b.addEventListener("click", () => {
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      const t = b.querySelector(".hot-all-t");
      t.textContent = "한 번 더 누르면 모두 읽음";
      setTimeout(() => { b.classList.remove("armed"); t.textContent = "모두 읽음"; }, 3000);
      return;
    }
    // 위 목록이 통째로 빠져서 그대로 두면 아래 '지금 뉴스'·빈칸이 올라와 맨 밑으로 간 것처럼 보여요 (사용자 2026-11-15).
    // 누른 버튼 자리에 '안 읽은 핫 뉴스가 없어요' 줄이 오게 맞추고, 붙잡은 높이(빈칸)는 바로 놓아요
    const top = b.getBoundingClientRect().top;
    readHot(hotOf(market).map(hotId), true); render();
    lastTap = null;
    clearTimeout(holdH); holdReady = false; $("#app").style.minHeight = "";
    const a = $("#hot-card .hot-body > .empty") || $("#hot-card");
    if (a) window.scrollBy(0, a.getBoundingClientRect().top - top);
  }));
  foldNotes(app);  // 설명 글씨는 바로 접어요. 나중에 접히면 위 칸이 줄어 화면이 밀려요 (업종 버튼 누를 때 튀던 이유)
  app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  app.querySelectorAll("[data-rp-week]").forEach((b) => b.addEventListener("click", () => { rpTab = "week"; go("report"); }));
  if (screen === "report") { bindRpTabs(); if (rpTabNow() === "past") bindPast(); }
  app.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
  if (screen === "tools") {
    keepRow($(".perf-tabs", app), "tools");
    app.querySelectorAll("[data-perf-tab]").forEach((b) => b.addEventListener("click", () => {
      perfTabKey = b.dataset.perfTab;
      remember("tools_tab", perfTabKey);
      render();
    }));
    bindSavings(); bindStress(d); bindGoal(); bindRetCal(d); bindLab(); bindAsset(); bindDivCal();
    if (!RET[market]) loadReturns().then(() => { if (screen === "tools") { const c = $("#stress-card"); if (c) { c.outerHTML = stressCard(d); bindStress(d); } } });
  }
  app.querySelectorAll("[data-tags]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const card = $("#stock-sector");
    if (card) { card.scrollIntoView({ behavior: calm() ? "auto" : "smooth" }); }
  }));
  app.querySelectorAll("[data-sector-go]").forEach((b) => b.addEventListener("click", () => {
    SECTOR[market] = b.dataset.sectorGo;
    remember("sector", JSON.stringify(SECTOR));
    lastTap = null;  // '화면 그대로' 규칙의 예외: 정책의 호재·악재는 누르면 업종 칸으로 이동해요 (사용자 2026-10-18)
    openMore("sectors");
  }));
  app.querySelectorAll("[data-sector]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    pickSector(b.dataset.sector);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-pol-r]").forEach((b) => b.addEventListener("click", () => {
    polR = b.dataset.polR;
    remember("pol_r", polR);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const pm = $("#pol-more");
  if (pm) pm.addEventListener("toggle", () => { polMore = pm.open; });
  app.querySelectorAll("details[data-pol]").forEach((x) => x.addEventListener("toggle", () => {
    if (x.open) POL_OPEN.add(x.dataset.pol); else POL_OPEN.delete(x.dataset.pol);
  }));
  app.querySelectorAll("[data-pol-go]").forEach((b) => b.addEventListener("click", () => {
    polJump = b.dataset.polGo;  // 홈이 다시 그려지면 그 정책을 펼쳐서 보여 줘요
    POL_OPEN.add(polJump);
    polR = "";
    lastTap = null;  // 이것도 이동하는 버튼이라 '화면 그대로'에서 빼요
    openMore("policy");
  }));
  if (screen === "more" && polJump) {
    const x = app.querySelector(`details[data-pol="${CSS.escape(polJump)}"]`);
    polJump = null;
    if (x) requestAnimationFrame(() => { x.scrollIntoView(); window.scrollBy(0, -70); });
  }
  app.querySelectorAll("[data-ecday]").forEach((b) => b.addEventListener("click", () => {
    econPick = econPick === b.dataset.ecday ? null : b.dataset.ecday;
    renderEcon();
  }));
  pinEcon();
  const ecBar = app.querySelector(".ec-months");
  if (ecBar) {
    keepRow(ecBar, "ec");  // 달 버튼 줄 (화면 세로 위치는 안 건드려요)
  }
  app.querySelectorAll("[data-ecm]").forEach((b) => b.addEventListener("click", () => { econMonth = b.dataset.ecm; econPick = null; renderEcon(); }));
  app.querySelectorAll("[data-ecstep]").forEach((b) => b.addEventListener("click", () => {
    econMonth = ymAdd(econMonth, Number(b.dataset.ecstep)); econPick = null; renderEcon();
  }));
  app.querySelectorAll("[data-cal-all]").forEach((b) => b.addEventListener("click", () => {
    calAll = !calAll;
    // 펼칠 땐 보던 화면 그대로 두고 아래로 줄이 늘어나요 (버튼을 따라가면 32줄 아래 끝으로 내려가 버려요)
    if (calAll) lastTap = null;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-heat]").forEach((b) => b.addEventListener("click", () => {
    heatP = b.dataset.heat;
    remember("heat_p", heatP);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-world-p]").forEach((b) => b.addEventListener("click", () => {
    worldP = b.dataset.worldP;
    remember("world_p", worldP);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const keepY = (f) => () => { const y = window.scrollY; f(); render(); window.scrollTo(0, y); };
  app.querySelectorAll("[data-world]").forEach((b) => b.addEventListener("click", keepY(() => {
    // 맨 위 한국·미국 그래프와 탭 쪽 그래프는 따로 열려요 (한쪽을 눌러도 다른 쪽이 접히지 않게)
    const top = DATA.world.groups.some((g) => WORLD_FIXED.includes(g.name) && g.items.some((r) => `t:${r.sym}` === b.dataset.world));
    if (top) worldTop = worldTop === b.dataset.world ? null : b.dataset.world;
    else if (!worldPicks.delete(b.dataset.world)) worldPicks.add(b.dataset.world);  // 세계 지수 화면은 여러 개 같이 펼쳐도 돼요
  })));
  app.querySelectorAll("[data-world-g]").forEach((b) => b.addEventListener("click", keepY(() => {
    worldG = b.dataset.worldG;
    remember("world_g", worldG);
  })));
  app.querySelectorAll("[data-world-chart]").forEach((b) => b.addEventListener("click", () => {
    CHART_IDX[market] = b.dataset.worldChart;
    remember("chart_idx", JSON.stringify(CHART_IDX));
    go("chart");
  }));
  drawWorldGraph();
  if (screen === "home") spinTicker();
  app.querySelectorAll("[data-world-tab]").forEach((b) => b.addEventListener("click", keepY(() => {
    worldTab = b.dataset.worldTab;
    worldPicks.clear();
    remember("world_tab", worldTab);
  })));
  // 탭 줄은 옆으로 밀어 둔 자리 그대로 (무엇을 눌러 다시 그려도 '주요' 쪽으로 돌아가지 않게)
  const wtBar = $(".wt-tabs");
  if (wtBar) {
    keepRow(wtBar, "world");
  }
  if (screen === "watch") {
    bindWatch(d);
  }
  if (screen === "more" && moreKey === "drop") bindDrop(d);
  if (screen === "more" && moreKey === "learn") bindLearn();
  if (screen === "stock") bindStock();
  if (screen === "search") bindSearch();
  if (screen === "map") bindMap();
  if (screen === "inbox") bindInbox();
  if (screen === "feedback") bindFeedback();
  if (screen !== "search") app.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => openMap(b.dataset.map)));
  bindRows(app, d);
  if (screen === "chart") {
    app.querySelectorAll("[data-idx]").forEach((b) => b.addEventListener("click", () => {
      CHART_IDX[market] = b.dataset.idx;
      if (IDX_READY.get(b.dataset.idx) === null) IDX_READY.delete(b.dataset.idx);  // 못 받았던 지수는 다시 받아 봐요
      remember("chart_idx", JSON.stringify(CHART_IDX));
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }));
    keepRow(app.querySelector(".idx-chips"), `chart:${market}`);
    drawTrend(d);
    bindCompare(d);
    app.querySelectorAll(".period button[data-frame]").forEach((b) => b.addEventListener("click", () => {
      frame = b.dataset.frame;
      remember("frame", frame);
      app.querySelectorAll(".period button[data-frame]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawTrend(d, true);
    }));
  }
  app.querySelectorAll(".chips button[data-ind]").forEach((b) => b.addEventListener("click", () => {
    IND[b.dataset.ind] = !IND[b.dataset.ind];
    remember("ind", JSON.stringify(IND));
    render();  // 보던 구간·확대는 그대로 두고 지표만 다시 그려요
  }));
  bindMa(app);
  playMotion(app);
}
