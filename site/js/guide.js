"use strict";
// ---------------------------------------------------------------- 처음 쓰는 사람 사용법 안내
// 사용자 2026-11-15 "맨 처음 사용시 사용법 간단히". 처음 홈을 열면 한 번만 떠요(이 폰에만 'guide_v1' 기억, 서버·추적 없음).
// 5장, 넘기기(옆으로 밀기·다음 버튼)·건너뛰기 가능, 맨 아래 '사용법 다시 보기'로 언제든 다시. 화면 위치는 건드리지 않아요.
// 남에게 안 되는 기능(텔레그램 알림 걸기 등)은 소개하지 않아요.
const GUIDE = [
  { t: "이지스톡에 오신 걸 환영해요", sel: ".tabs",
    b: "국장·미장 시세와 차트, 오늘의 리포트를 한 곳에서 보는 무료 앱이에요. 오른쪽 위 <b>국장 | 미장</b>을 눌러 시장을 바꿔요." },
  { t: "아래 메뉴 5개", sel: ".nav",
    b: `<ul class="guide-list"><li><b>홈</b> 오늘 시장 한눈에. 아래 '더 보기'에 뉴스·일정·투자 공부</li><li><b>리포트</b> 하루 한 장 정리한 시장 이야기</li><li><b>관심</b> ★ 찍은 종목만 모아 보기</li><li><b>도구</b> 적립식 계산기·자산 기록</li><li><b>차트</b> 지수 차트와 이동평균선</li></ul>` },
  { t: "종목 찾기", sel: ".search-btn",
    b: "돋보기를 눌러 이름이나 코드로 찾아요. 대충 써도 찾아 줘요. 종목 옆 <b>☆</b>를 누르면 관심에 담겨요." },
  { t: "메시지함", sel: ".inbox-btn",
    b: "오른쪽 가장자리의 작은 손잡이예요. 누르면 오늘의 리포트와 시장 알림을 모아 볼 수 있어요. 끌어서 위아래로 옮길 수도 있어요." },
  { t: "알아 두면 좋아요", sel: "",
    b: `<ul class="guide-list"><li>실시간이 아니에요. 대부분 장 마감 뒤 값이에요.</li><li>공개 자료로 만든 참고용이에요. 사고팔기는 직접 판단해요.</li><li>관심 종목·자산 기록은 이 폰에만 저장돼요.</li><li>맨 아래 <b>사용법</b>에서 이 안내와 자세한 설명을 다시 볼 수 있어요.</li></ul>
      <button type="button" class="linkish guide-more" data-g="help">📖 화면별 자세한 사용법 보기 ›</button>` },
];
let guideAt = -1;
function guideSeen() { try { return !!localStorage.getItem("guide_v1"); } catch (e) { return true; } }  // 저장소를 못 쓰면 매번 띄우지 않아요
function guideClose() {
  guideAt = -1;
  remember("guide_v1", "1");
  document.querySelectorAll(".guide-catch, .guide-spot, .guide-card").forEach((x) => x.remove());
  window.removeEventListener("resize", guidePlace);
  document.removeEventListener("keydown", guideKey);
}
function guideKey(e) {
  if (e.key === "Escape") guideClose();
  else if (e.key === "ArrowRight") guideShow(guideAt + 1);
  else if (e.key === "ArrowLeft") guideShow(guideAt - 1);
}
// 짚는 곳에 동그란 테두리(나머지는 어둡게), 안내 카드는 짚는 곳 반대쪽에
function guidePlace() {
  const s = GUIDE[guideAt], spot = $(".guide-spot"), card = $(".guide-card");
  if (!s || !spot || !card) return;
  const el = s.sel && $(s.sel);
  const r = el && el.getBoundingClientRect();
  if (r && r.width && r.height) {
    const pad = 6, W = window.innerWidth, H = window.innerHeight;  // 테두리가 화면 밖으로 잘리지 않게 안쪽으로
    const L = Math.max(3, r.left - pad), T = Math.max(3, r.top - pad), R = Math.min(W - 3, r.right + pad), B = Math.min(H - 3, r.bottom + pad);
    Object.assign(spot.style, { left: `${L}px`, top: `${T}px`, width: `${R - L}px`, height: `${B - T}px` });
    spot.classList.remove("none");
    const low = r.top + r.height / 2 > window.innerHeight / 2;
    card.classList.toggle("at-top", low);
    card.classList.toggle("at-bottom", !low);
  } else {
    spot.classList.add("none");
    card.classList.remove("at-top", "at-bottom");
  }
}
function guideShow(i) {
  if (i < 0) return;
  if (i >= GUIDE.length) { guideClose(); return; }
  if (guideAt < 0) {
    const c = document.createElement("div");
    c.className = "guide-catch";  // 뒤 화면이 눌리거나 밀리지 않게 막아요
    const sp = document.createElement("div");
    sp.className = "guide-spot";
    const card = document.createElement("div");
    card.className = "guide-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "사용법 안내");
    card.tabIndex = -1;
    document.body.append(c, sp, card);
    card.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.g === "skip") guideClose();
      else if (b.dataset.g === "next") guideShow(guideAt + 1);
      else if (b.dataset.g === "prev") guideShow(guideAt - 1);
      else if (b.dataset.g === "help") { guideClose(); go("help"); }
      else if (b.dataset.gDot != null) guideShow(+b.dataset.gDot);
    });
    let x0 = null;  // 옆으로 밀어서 넘기기
    card.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    card.addEventListener("pointerup", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) guideShow(guideAt + (dx < 0 ? 1 : -1));
    });
    window.addEventListener("resize", guidePlace);
    document.addEventListener("keydown", guideKey);
  }
  guideAt = i;
  const s = GUIDE[i], last = i === GUIDE.length - 1, card = $(".guide-card");
  card.innerHTML = `<div class="guide-head"><small class="muted">${i + 1} / ${GUIDE.length}</small>${last ? "" : `<button type="button" class="guide-skip" data-g="skip">건너뛰기</button>`}</div>
    <h2>${esc(s.t)}</h2><div class="guide-body">${s.b}</div>
    <div class="guide-foot"><div class="guide-dots">${GUIDE.map((_, k) => `<button type="button" data-g-dot="${k}" aria-label="${k + 1}번째 안내"${k === i ? ' aria-current="step"' : ""}></button>`).join("")}</div>
      <div class="guide-btns">${i ? `<button type="button" class="guide-prev" data-g="prev">이전</button>` : ""}<button type="button" class="add guide-next" data-g="next">${last ? "시작하기" : "다음"}</button></div></div>`;
  guidePlace();
  card.focus({ preventScroll: true });
}
function guideMaybe() { if (guideAt < 0 && screen === "home" && !guideSeen()) guideShow(0); }
$(".guide-open").addEventListener("click", () => guideShow(0));
$(".help-open").addEventListener("click", () => go("help"));

// 자세한 사용법(#kr/help): 더 알고 싶은 사람만 맨 아래나 안내 마지막 장에서 들어와요 (사용자 2026-11-15).
// 화면별로 접어 두고 누르면 펼쳐요. 남에게 안 되는 기능(텔레그램 알림 걸기 등)은 쓰지 않아요.
const HELP_OPEN = new Set();
const HELP = [
  ["home", "🏠", "홈", "오늘 시장을 한눈에", `<ul class="guide-list">
    <li><b>맨 위 얇은 줄</b>에 세계 지수·환율이 돌아가며 보여요. 누르면 세계 지수 화면이 열리고, 작은 그래프를 누르면 크게 보여요.</li>
    <li><b>큰 발표·지수 급변</b> 칸은 물가·금리 발표처럼 시장을 크게 흔드는 일정이 있을 때만 떠요.</li>
    <li><b>한국·미국 지수</b>는 오늘·1주·1개월·1년을 눌러 기간을 바꿔요.</li>
    <li><b>더 보기</b> 줄을 누르면 그 칸만 있는 화면으로 넘어가요. 지금 뉴스(장중 30분마다), 투자 공부, 다가오는 일정, 실적·배당, 왜 움직였나, 시장 히트맵, 업종별 호재·악재, 정부 정책, 경기 국면 등이 있어요.</li></ul>`],
  ["report", "📄", "리포트", "하루 한 장 시장 정리", `<ul class="guide-list">
    <li>국장은 오후 5시 반쯤, 미장은 아침 7시 반쯤 그날 시장을 한 장으로 정리해요.</li>
    <li>위 버튼으로 <b>주간 리포트</b>(토요일 아침, 한 주 묶음)로 바꿔 볼 수 있어요.</li></ul>`],
  ["watch", "⭐", "관심", "내 종목 모아 보기", `<ul class="guide-list">
    <li>종목 옆 <b>☆</b>를 누르면 ★이 되고 여기에 모여요. 다시 누르면 빠져요.</li>
    <li><b>조건 검색</b>으로 많이 오른 종목·배당 높은 종목 같은 조건을 골라 걸러 볼 수 있어요.</li>
    <li>관심 목록은 이 폰(이 브라우저)에만 저장돼요.</li></ul>`],
  ["tools", "🧮", "도구", "계산기와 기록장", `<ul class="guide-list">
    <li>맨 위 가로 줄을 옆으로 밀어 골라요.</li>
    <li><b>자산 기록</b> 달마다 증권사·계좌·종목별 투자금과 배당을 적어 둬요. 이 폰에만 저장되니 <b>백업</b> 글자를 복사해 두면 다른 폰으로 옮길 수 있어요.</li>
    <li><b>적립식 계산기</b> 매달 얼마씩 모으면 몇 년 뒤 얼마가 되는지 그래프로 보여 줘요.</li>
    <li><b>포트폴리오 실험실·수익률 달력·폭락 대비·목표</b>도 있어요. 모두 과거 자료로 계산한 참고값이에요.</li></ul>`],
  ["chart", "📈", "차트", "지수 차트 보기", `<ul class="guide-list">
    <li>위 버튼으로 코스피·나스닥 같은 지수를 고르고, 일봉·주봉·월봉·년봉으로 바꿔요.</li>
    <li>차트를 누르고 옆으로 움직이면 그날 값이 보여요.</li>
    <li><b>이동평균선</b> 설정과 <b>비교 차트</b>(여러 지수·종목 함께 보기)도 있어요.</li></ul>`],
  ["stock", "🔍", "종목 찾기·종목 화면", "돋보기에서 시작", `<ul class="guide-list">
    <li>맨 위 돋보기를 눌러 이름·코드로 찾아요. 띄어쓰기나 오타가 조금 있어도 찾아 줘요.</li>
    <li>종목을 누르면 가격 차트, 점검, 공시, 업종, 재무제표(국장은 외국인·기관 수급도)를 볼 수 있어요.</li>
    <li>어려운 말 옆 <b>?</b>를 누르면 뜻이 나와요. 검색 화면 아래 <b>용어집</b>도 있어요.</li></ul>`],
  ["map", "🕸️", "산업 지도", "산업끼리 어떻게 이어지나", `<ul class="guide-list">
    <li>맨 위 이지스톡 글자 옆 버튼이에요.</li>
    <li>점 하나가 산업 하나예요. 점이 클수록 관련 종목 시가총액이 커요. 누르면 이어진 산업과 종목이 보여요.</li></ul>`],
  ["inbox", "💬", "메시지함", "리포트·알림 모아 보기", `<ul class="guide-list">
    <li>화면 오른쪽 가장자리의 얇은 손잡이예요. 누르면 열려요.</li>
    <li>빨간 점이 있으면 새 소식이 있다는 뜻이에요. 손잡이는 끌어서 위아래로 옮길 수 있어요.</li></ul>`],
  ["install", "📱", "폰 홈 화면에 앱처럼 두기", "설치 없이", `<ul class="guide-list">
    <li><b>안드로이드(크롬)</b> 오른쪽 위 ⋮ → <b>홈 화면에 추가</b>(또는 앱 설치).</li>
    <li><b>아이폰(사파리)</b> 아래 공유 버튼 → <b>홈 화면에 추가</b>.</li>
    <li>그 뒤로는 홈 화면 아이콘으로 바로 열려요.</li></ul>`],
  ["note", "❗", "알아 둘 것", "자료와 저장", `<ul class="guide-list">
    <li>실시간이 아니에요. 대부분 장 마감 뒤 종가 기준이고, 늦거나 빠진 값이 있을 수 있어요.</li>
    <li>공개 자료로 만든 참고용이에요. 사고팔기 추천을 하지 않아요.</li>
    <li>로그인이 없어요. 관심 종목·자산 기록·설정은 이 폰에만 있어서, 브라우저 기록을 지우면 사라져요.</li>
    <li>고칠 곳이나 바라는 기능은 맨 아래 <b>의견·수정 요청 보내기</b>로 알려 주세요.</li></ul>`],
];
function helpCard() {
  return `<section class="card" id="help-card"><button type="button" class="back" data-back>‹ 뒤로</button><h2 class="stock-name">자세한 사용법</h2>
    <p class="muted" style="margin:0 0 6px">궁금한 화면을 눌러 펼쳐 보세요.</p>
    ${HELP.map(([k, ico, t, sub, body]) => `<details class="help-sec" data-help="${k}"${HELP_OPEN.has(k) ? " open" : ""}><summary><span class="hm-ico" aria-hidden="true">${ico}</span><span class="help-t"><b>${t}</b><small>${sub}</small></span></summary>
      <div class="guide-body">${body}</div></details>`).join("")}
    <button type="button" class="add help-tour" data-help-tour>처음 안내 다시 보기</button></section>`;
}
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d && d.classList && d.classList.contains("help-sec")) { if (d.open) HELP_OPEN.add(d.dataset.help); else HELP_OPEN.delete(d.dataset.help); }
}, true);
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-help-tour]")) guideShow(0); });
$(".home-link").addEventListener("click", (e) => { e.preventDefault(); go("home"); });  // 로고·이지스톡 글자 → 홈
// 맨 위 이지스톡 옆: 산업 지도 전체 보기로 (지도에 있으면 고른 산업을 풀고 맨 위로)
$(".map-btn").addEventListener("click", () => {
  if (screen === "map" && JS_GOT.has("map")) { mapTrail = []; setMapFocus(""); window.scrollTo(0, 0); } else openMap("");
});
// 아래 버튼: 펼쳐 둔 칸·자세히를 전부 접고 그 화면의 처음 모습으로 (사용자 2026-10-24: 많이 펼쳐 두면 어지러워서).
// 고른 탭·시장·기간·이동평균선 같은 설정은 그대로 둬요. 화면 안의 버튼은 지금처럼 '화면 그대로'.
function resetFolds() {
  [POL_OPEN, FOLD_OPEN, LEARN_OPEN, HOT_GRP_OPEN, STORY_OPEN, HELP_OPEN].forEach((x) => x.clear());
  caseKind = "all"; notePat = null;
  worldPicks.clear(); worldTop = null; hotReadOpen = false; for (const k in ROW_X) delete ROW_X[k]; polMore = false; polJump = null; calAll = false;
  cmpIdxOpen = false; maOpen = false; alertOpen = false; inboxOpen = null; econPick = null;
  // 도구 화면 파일(나중에 받는 것)을 받았을 때만
  if (JS_GOT.has("savings")) SAV_OPEN.clear();
  if (JS_GOT.has("lab")) calPick = null;
  if (JS_GOT.has("asset")) { AST_BOPEN.clear(); astEditOpen = false; }
  try { localStorage.removeItem("ast_bopen"); } catch (e) { /* 이번만 */ }
}
document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => {
  resetFolds();
  if (b.dataset.screen !== screen) { go(b.dataset.screen); return; }
  lastView = "";  // 지금 화면 버튼을 또 누르면 접어서 다시 그리고 맨 위로
  window.scrollTo(0, 0);
  render();
}));
window.addEventListener("popstate", () => {
  const h = fromHash();
  if (h.s === "stock" && h.code) stockCode = h.code;
  if (h.s === "map") mapFocus = h.code || "";
  if (h.s === "more" && h.code) moreKey = h.code;
  go(h.s, true);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
// ? 버튼: 줄 전체를 누른 것(종목 화면 열기)으로 번지지 않게 먼저 잡아서 설명 창을 띄워요
function closeTerm() { const x = $(".term-sheet"); if (x) x.remove(); }
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-term]");
  if (!b) { if (!e.target.closest || !e.target.closest(".term-sheet")) closeTerm(); return; }
  e.preventDefault();
  e.stopPropagation();
  closeTerm();
  const t = b.dataset.term;
  const box = document.createElement("div");
  box.className = "term-sheet";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", `${t} 뜻`);
  box.innerHTML = `<div class="term-head"><b>${esc(t)}</b><button type="button" class="term-x" aria-label="닫기">×</button></div><p>${esc(TERMS[t] || "")}</p>
    <button type="button" class="linkish term-all">용어집에서 분야별로 보기</button>`;
  document.body.appendChild(box);
  $(".term-x", box).addEventListener("click", closeTerm);
  $(".term-all", box).addEventListener("click", () => { closeTerm(); openTerm(t); });
  $(".term-x", box).focus({ preventScroll: true });
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTerm(); });
window.addEventListener("popstate", closeTerm);
// ---------------------------------------------------------------- 작은 설명 글씨 접기
// 설명·규칙 글씨(.note)와 도움말 목록(.help)은 처음엔 접어 두고 '자세히'를 누르면 펼쳐요.
// 붙어 있는 것끼리는 한 번에 접고, 펼친 건 화면이 다시 그려져도 앱을 닫기 전까지 펼친 채로 둬요.
const NOTE = ".note, ul.help";
const FOLD_OPEN = new Set();
function foldNotes(root) {
  root.querySelectorAll(NOTE).forEach((el) => {
    if (el.closest(".fold")) return;
    const run = [el];
    for (let n = el.nextElementSibling; n && n.matches(NOTE); n = n.nextElementSibling) run.push(n);
    const key = el.textContent.trim().slice(0, 24);
    const box = document.createElement("details");
    box.className = "fold";
    if (FOLD_OPEN.has(key)) box.open = true;
    box.innerHTML = `<summary><span class="fold-more">자세히</span><span class="fold-less">접기</span></summary>`;
    el.before(box);
    box.append(...run);
    box.addEventListener("toggle", () => { if (box.open) FOLD_OPEN.add(key); else FOLD_OPEN.delete(key); });
  });
}
new MutationObserver((recs) => {
  const hit = recs.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches(NOTE) || n.querySelector(NOTE))));
  if (hit) foldNotes($("#app"));
}).observe($("#app"), { childList: true, subtree: true });
