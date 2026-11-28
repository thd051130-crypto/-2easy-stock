"use strict";
const AST_PRESET = ["일반 계좌", "ISA", "연금저축", "IRP", "CMA", "해외주식"];
const AST_BROKERS = ["키움", "미래에셋", "삼성", "한국투자", "NH투자", "KB", "토스", "신한", "대신", "하나"];
const astA = (id) => AST.accts.find((a) => a.id === id);
const astLabel = (id) => { const a = astA(id); return a ? `${a.broker} · ${a.name}` : id; };
const astBrokers = () => AST.accts.map((a) => a.broker).filter((b, k, all) => all.indexOf(b) === k);
// 그 달에 쓰인 계좌 id 순서 (목록에 없는 옛 id도 끝에)
const astIds = (x) => AST.accts.map((a) => a.id).concat(x ? x.items.map((i) => i.acct).concat(Object.keys(x.cash || {})) : []).filter((a, k, all) => all.indexOf(a) === k);
const astToSel = (cur, attr) => `<select ${attr}>${astBrokers().map((b) => `<optgroup label="${esc(b)}">${AST.accts.filter((a) => a.broker === b)
  .map((a) => `<option value="${esc(a.id)}" ${a.id === cur ? "selected" : ""}>${esc(b)} · ${esc(a.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
let astOpen = null, astQuery = "", astTo = AST.accts[0].id, astAnim = false, astChart = null, astTip = null, astSumK = null;
const astSave = () => { remember("assets", JSON.stringify(AST)); };
const astPrevYm = (ym) => Object.keys(AST.months).filter((k) => k < ym && astFilled(k)).sort().pop() || null;
const astKey = (i) => `${i.acct}|${i.m}:${i.code}`;
const astWon = (x) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const astQty = (x) => `${(+x).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}주`;
const astSign = (x) => (x > 0 ? "+" : x < 0 ? "-" : "±");
// 자산 기록의 늘고 줄음은 빨강·파랑 없이 같은 색으로 (사용자 2026-11-08 "색깔 빼, 심리를 지켜야 해")
const astCls = () => "";
const astMan = (x) => (Math.abs(x) < 1e4 ? astWon(x) : savWon(x));  // 만 원 넘으면 만원 단위로 줄여서
const astDivW = (x) => (x < 1e6 ? astWon(x) : savWon(x));  // 배당은 작아서 100만 원 아래는 원 단위 그대로
const astWonD = (x) => `${astSign(x)}${astMan(Math.abs(x))}`;
const astQtyD = (x) => `${astSign(x)}${astQty(Math.abs(x))}`;
const astNum = (v) => { const x = parseFloat(String(v).replace(/[,\s원주]/g, "")); return Number.isFinite(x) && x >= 0 ? Math.min(x, 1e13) : 0; };
const astId = () => Math.random().toString(36).slice(2, 9);
const astPct = (p) => `${p > 0 ? "+" : p < 0 ? "-" : "±"}${Math.abs(p * 100).toFixed(1)}%`;
const astDay = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || "") ? `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일 종가` : "지금 시세");
const astLiveOn = (ym) => AST_LIVE && !!ym && ym === astLastYm();
function astLiveSw() {
  return `<div class="goal-src ast-live-sw"><span>📈 지금 시세로 평가</span><div class="period" role="group" aria-label="지금 시세로 평가 켜기·끄기">
    <button type="button" data-ast-live="1" aria-pressed="${AST_LIVE}">켜기</button><button type="button" data-ast-live="0" aria-pressed="${!AST_LIVE}">끄기</button></div></div>`;
}
// 달력 위: 마지막 기록 달을 지금 시세로 (불러오는 동안도 같은 높이라 화면이 안 밀려요)
function astLiveBox() {
  const ym = astLastYm();
  if (!AST_LIVE || !ym) return "";
  const ok = astReady(), e = astEval(ym), s = astSum(ym);
  const g = e.pct == null ? "" : `${astWonD(e.gain)} (${astPct(e.pct)})`;
  return `<div id="ast-live"><div class="sav-hero ast-hero ast-live">
      <div><small>지금 평가금액</small><b>${ok ? savWon(e.total) : "…"}</b><small class="muted">${ok ? `산 돈 기준 ${savWon(s.total)}` : "시세 불러오는 중"}</small></div>
      <div><small>산 돈보다</small><b>${ok ? g || "-" : "…"}</b><small class="muted">${ok ? `주식 ${savWon(e.val)} + 예수금 ${savWon(e.cash)}` : "&nbsp;"}</small></div></div>
    <p class="muted ast-live-note">${astDayName(ym)} 기록 종목 × ${ok ? esc(astDay(e.day)) : "지금 시세"}${e.miss ? ` · 시세 없는 ${e.miss}종목은 산 돈으로 셌어요` : ""}. 하루 2번 받는 종가라 장중 시세와 달라요.</p></div>`;
}
// 펼친 달(마지막 기록 달만): 종목 줄마다 지금 1주 가격·평가금액·수익
function astLiveTag(ym, it) {
  if (!astLiveOn(ym) || !astReady()) return "";
  const r = astEval(ym).rows[it.id];
  if (!r) return +it.qty > 0 ? `<span class="ast-tag">시세 없음</span>` : "";
  const px = r.us ? `$${r.px.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : astWon(r.px);
  return `<span class="ast-tag live">지금 1주 ${px} · 평가 ${astMan(r.v)}${r.gain != null ? ` · ${astWonD(r.gain)} (${astPct(r.pct)})` : ""}</span>`;
}
const astDeltaAll = (ym, it) => astDelta(ym, it) + astLiveTag(ym, it);
function astLiveLine(ym) {
  if (!astLiveOn(ym)) return "";
  if (!astReady()) return `<p class="ast-total ast-live-l">지금 시세로 <b>…</b> <small class="muted">· 불러오는 중</small></p>`;
  const e = astEval(ym);
  return `<p class="ast-total ast-live-l">지금 시세로 <b>${savWon(e.total)}</b>${e.pct != null ? ` <span>${astWonD(e.gain)} (${astPct(e.pct)})</span>` : ""} <small class="muted">· ${esc(astDay(e.day))}</small></p>`;
}

// 기록은 날마다 (사용자 2026-11-28 "기록 하고 싶은 날 기록"). 열쇠 = 기록한 날 "2026-11-22", 한 달에 여러 번 남길 수 있어요
const astEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };
const astRecDay = (k) => k;
// 그 달에 남긴 기록들 (날짜 순)
const astMonKeys = (ym) => Object.keys(AST.months).filter((k) => k.slice(0, 7) === ym).sort();
// 달력 칸·그래프에서 그 달을 대표하는 기록 = 그 달 마지막 기록 (종목·예수금이 없는 메모만 기록은 빼고)
const astMonKey = (ym) => astMonKeys(ym).filter(astFilled).pop() || null;
// 그 달에 받은 배당은 그 달 기록을 다 더해요
const astMonDiv = (ym) => astMonKeys(ym).reduce((a, k) => a + astSum(k).div, 0);
// 그 달 앞의 마지막 기록
const astBeforeYm = (ym) => astPrevYm(`${ym}-00`);
// 새 기록 날짜: 이번 달이면 오늘, 지난달이면 1일. 이미 있으면 다음 빈 날 (오늘·그 달 끝까지)
function astNewKey(ym, after) {
  const end = [astToday(), astEnd(ym)].sort()[0];
  let d = after ? after : ym === ymNow() ? astToday() : `${ym}-01`;
  const next = (x) => { const t = new Date(`${x}T00:00:00`); t.setDate(t.getDate() + 1); return `${ymOf(t)}-${String(t.getDate()).padStart(2, "0")}`; };
  if (after) d = next(d);
  while (AST.months[d] && d < end) d = next(d);
  return d <= end && !AST.months[d] ? d : null;
}
const astShort = (k, base) => `${base && k.slice(0, 4) !== base.slice(0, 4) ? `${k.slice(2, 4)}년 ` : ""}${+k.slice(5, 7)}.${+k.slice(8, 10)}`;
const astDot = (ds) => `${ds.slice(2, 4)}.${ds.slice(5, 7)}.${ds.slice(8)}`;
const astFirstYm = () => Object.keys(AST.months).filter(astFilled).sort()[0] || null;
// a → b 가 몇 달 며칠인지 (b가 앞이면 null)
function astSince(a, b) {
  const [ay, am, ad] = a.split("-").map(Number), [by, bm, bd] = b.split("-").map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (bd < ad) m--;
  if (m < 0) return null;
  const mid = new Date(ay, am - 1 + m, ad), end = new Date(by, bm - 1, bd);
  return { m, d: Math.round((end - mid) / 864e5) };
}
// 첫 기록 후 한 달이 지나면 표시 (사용자 2026-11-22 "첫 기록 이후 한달 경과하면 표시해줘")
function astSinceLine(to) {
  const f = astFirstYm();
  if (!f) return "";
  const s = astSince(astRecDay(f), to);
  if (!s || s.m < 1) return "";
  const y = Math.floor(s.m / 12), mm = s.m % 12;
  const t = `${y ? `${y}년 ` : ""}${mm ? `${mm}달` : ""}${s.d ? ` ${s.d}일` : ""}`.trim();
  return `<p class="ast-since">📅 첫 기록(${astDot(astRecDay(f))}) 후 <b>${t}</b> 지났어요</p>`;
}
function assetCard() {
  return `<section class="card" id="ast-card"><h2 class="goal-h"><span>자산 기록</span>
    <span class="goal-h-r"><small>이 폰에만 저장</small></span></h2>${astOpen ? astDetail(astOpen) : astGrid()}</section>`;
}

// 달력: 1~12월 칸마다 그 달 투자금, 지난 기록 대비, 받은 배당. 아래 막대는 올해 가장 많은 달 대비 높이
function astGrid() {
  const y = +AST.year, now = ymNow();
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  const mk = (ym) => astMonKey(ym);
  const max = Math.max(1, ...yms.map((ym) => (mk(ym) ? astSum(mk(ym)).total : 0)));
  const cells = yms.map((ym) => {
    const k = mk(ym), ks = astMonKeys(ym), s = k ? astSum(k) : null, p = astBeforeYm(ym), ps = p ? astSum(p) : null, has = !!k;
    const memo = ks.some((x) => AST.months[x].memo.trim()), div = astMonDiv(ym);
    const d = has && ps ? s.total - ps.total : null;
    return `<button type="button" class="ast-cell${ym === now ? " now" : ""}${has ? " has" : ""}" data-ast-m="${ym}" ${ym > now ? "disabled" : ""}>
      <span class="ast-mn">${+ym.slice(5)}월${ks.length > 1 ? ` <small class="ast-cnt">${ks.length}번</small>` : ""}${memo ? `<i class="ast-dot" aria-label="메모 있음"></i>` : ""}</span>
      ${has ? `<b>${savWon(s.total)}</b>${d != null ? `<small class="${astCls(d)}">${d ? astWonD(d) : "그대로"}</small>` : `<small class="muted">첫 기록</small>`}
        ${div ? `<small class="ast-div">배당 ${astDivW(div)}</small>` : ""}`
        : `<small class="muted">${ym > now ? "" : memo ? "메모만" : "＋ 적기"}</small>`}
      ${has ? `<i class="ast-bar" style="width:${Math.max(6, (s.total / max) * 100)}%"></i>` : ""}</button>`;
  }).join("");
  // 올해 요약: 첫 기록 → 마지막 기록, 올해 받은 배당 합계
  const done = yms.map(mk).filter(Boolean), first = done[0], last = done[done.length - 1];
  const divY = yms.reduce((a, ym) => a + astMonDiv(ym), 0);
  const base = first ? astPrevYm(first) : null;  // 작년 마지막 기록이 있으면 그걸 출발점으로
  const from = base ? astSum(base).total : first ? astSum(first).total : 0, to = last ? astSum(last).total : 0;
  const ls = last ? astSum(last) : null;
  // 4칸은 누르면 아래에 그 그래프가 열려요 (다시 누르면 닫혀요)
  const tile = (k, label, val, cls = "") => `<button type="button" class="ast-tile" data-ast-chart="${k}" aria-pressed="${astChart === k}">
      <small>${label}</small><b class="${cls}">${val}</b><span class="ast-tile-g" aria-hidden="true">${astChart === k ? "그래프 닫기 ▴" : "그래프 ▾"}</span></button>`;
  const sum = done.length ? `<div class="sav-hero ast-hero">
      ${tile("total", `${astShort(last)} 총자산`, savWon(to))}
      ${tile("chg", `${base ? `작년 ${+base.slice(5, 7)}월` : `${astShort(first)}`}보다`, astWonD(to - from), astCls(to - from))}
      ${tile("div", `${y}년 받은 배당`, astDivW(divY))}
      ${tile("cash", `${astShort(last)} 예수금`, savWon(ls.cash))}</div>
      ${astChart ? `<div id="ast-chart">${astChartHtml(y)}</div>` : ""}` : "";
  return `<div class="ast-year"><button type="button" class="ast-nav" data-ast-y="-1" aria-label="작년">‹</button><b>${y}년</b>
      <button type="button" class="ast-nav" data-ast-y="1" aria-label="다음 해" ${y >= new Date().getFullYear() ? "disabled" : ""}>›</button></div>
    ${astSinceLine(astToday())}${astLastYm() ? astLiveSw() + astLiveBox() : ""}${sum}<div class="ast-grid">${cells}</div>
    <p class="muted note" style="margin:10px 0 0">달을 누르면 크게 열려요. 한 달에 여러 날 남길 수 있고, 칸엔 그 달 마지막 기록이 나와요. 총자산 = 투자금(산 돈) + 예수금. 위 4칸을 누르면 달마다 그래프가 나와요.</p>
    ${bkBox()}`;
}

// ---------------------------------------------------------------- 백업 파일 (사용자 2026-11-21)
// 이 폰에만 저장된 값(자산 기록·관심 종목·설정)을 파일 하나로 내보내고, 다른 폰에서 그 파일로 되살려요. 로그인·서버 없음.
// github.io 주소는 다른 저장소 페이지와 저장소를 같이 써서, 이 앱이 쓰는 이름만 담아요 (remember(...)로 새 값을 만들면 여기에도)
const BK_KEYS = ["assets", "ast_bopen", "ast_live", "chart_idx", "cmp_f", "cmp_line", "compare", "divcal_off", "fb_draft", "filters", "frame",
  "goal", "guide_v1", "heat_p", "home_layout", "hot_fold", "hot_news", "hot_read", "inbox_seen", "inbox_y", "ind", "lab", "learn_tab", "ma_set", "map_color",
  "divcalc", "map_days", "map_mode", "market", "news_url", "pol_r", "read_cat", "savings", "scr_all", "sector", "tools_tab", "watchSort", "world_g", "world_p", "world_tab"];
const bkMine = (k) => BK_KEYS.includes(k) || /^(watch|seen_extras)_(kr|us)$/.test(k);
// JSON으로 저장하는 값은 열리는지·모양이 맞는지 봐요 (깨진 값이 들어가 앱이 안 열리는 일 막기). 글자 값(frame·market 등)은 그대로
const BK_JSON = { assets: "obj", ast_bopen: "arr", chart_idx: "obj", compare: "obj", filters: "arr", goal: "obj", home_layout: "obj", hot_news: "obj", hot_read: "obj",
  ind: "obj", lab: "obj", ma_set: "any", savings: "any", sector: "obj" };
function bkOk(k, v) {
  const want = /^(watch|seen_extras)_/.test(k) ? "arr" : BK_JSON[k];
  if (!want) return true;
  let j; try { j = JSON.parse(v); } catch (e) { return false; }
  if (want === "arr") return Array.isArray(j);
  if (want === "obj") return !!j && typeof j === "object" && !Array.isArray(j) && (k !== "assets" || (!!j.months && typeof j.months === "object"));
  return true;
}
let bkWait = null;
let bkDone = "";  // 방금 불러와서 새로 열렸으면 무엇을 불러왔는지 (칸을 펼쳐 알려 줘요)
try { bkDone = sessionStorage.getItem("bk_done") || ""; sessionStorage.removeItem("bk_done"); } catch (e) { /* 없음 */ }  // 불러온 파일 (덮어쓰기를 누르기 전까지)
function bkMake() {
  const keys = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (bkMine(k)) keys[k] = localStorage.getItem(k); } } catch (e) { /* 아래 자산만 */ }
  keys.assets = JSON.stringify(AST);
  return { app: "easystock-backup", v: 1, at: new Date().toISOString(), keys };
}
// 파일 글자 → { keys, at } 또는 null(이 앱 백업이 아님). 예전 '자산만 글자 복사'(easystock-assets)도 받아요
function bkRead(text) {
  let x = null;
  try { x = JSON.parse(text); } catch (e) { return null; }
  if (!x || typeof x !== "object") return null;
  if (x.app === "easystock-assets" && x.months && typeof x.months === "object")
    return { at: null, keys: { assets: JSON.stringify({ accts: x.accts, months: x.months, year: x.year }) } };
  if (x.app !== "easystock-backup" || !x.keys || typeof x.keys !== "object") return null;
  const keys = {};
  for (const [k, v] of Object.entries(x.keys)) if (bkMine(k) && typeof v === "string" && v.length < 500000 && bkOk(k, v)) keys[k] = v;
  if (x.keys.assets && !keys.assets) return null;  // 자산 기록이 깨진 파일은 통째로 거절
  return Object.keys(keys).length ? { at: x.at || null, keys } : null;
}
function bkCount(keys) {
  let months = 0, watch = 0;
  try { const a = JSON.parse(keys.assets || "{}"); months = Object.values(a.months || {}).filter((m) => (m.items || []).length || (m.memo || "").trim()).length; } catch (e) { /* 0 */ }
  for (const m of ["kr", "us"]) { try { watch += JSON.parse(keys[`watch_${m}`] || "[]").length; } catch (e) { /* 0 */ } }
  return { months, watch };
}
const bkDay = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
function bkAsk() {
  if (!bkWait) return "";
  const c = bkCount(bkWait.keys);
  const what = [bkWait.keys.assets ? `자산 기록 ${c.months}번` : "자산 기록 없음(지금 것 그대로)", c.watch ? `관심 종목 ${c.watch}개` : "", bkWait.keys.home_layout ? "홈 화면 편집" : ""].filter(Boolean).join(" · ");
  return `<div class="bk-ask"><b>이 파일로 덮어쓸까요?</b>
    <small>${bkWait.at ? `${esc(bkDay(bkWait.at))} 저장 · ` : ""}${esc(what)}</small>
    <small class="muted">지금 이 폰의 기록은 파일 내용으로 바뀌고, 앱이 한 번 새로 열려요.</small>
    <div class="ast-new"><button type="button" class="ast-btn armed" data-bk-yes>덮어쓰기</button><button type="button" class="ast-btn" data-bk-no>취소</button></div></div>`;
}
function bkBox() {
  let at = "";
  try { at = localStorage.getItem("bk_at") || ""; } catch (e) { /* 처음 */ }
  const done = bkDone;
  const ago = at ? Math.floor((Date.now() - new Date(at)) / 864e5) : null;
  const st = ago == null ? "아직 안 함" : ago < 1 ? "오늘 저장" : `${ago}일 전 저장`;
  return `<details class="sav-mine ast-backup"${bkWait || done ? " open" : ""}><summary>백업 파일 · 폰 바꿀 때 <small class="bk-st${ago == null || ago > 30 ? " old" : ""}">${st}</small></summary>
      <p class="muted bk-p">자산 기록·관심 종목·설정은 이 폰 브라우저에만 있어요. 폰을 바꾸거나 방문 기록을 지우면 사라지니 가끔 파일로 저장하고, 카톡 나에게 보내기나 클라우드에도 올려 두세요.</p>
      <div class="ast-new"><button type="button" class="ast-btn" data-bk-save>파일로 저장</button><button type="button" class="ast-btn" data-bk-open>파일 불러오기</button></div>
      <input type="file" id="bk-file" hidden>
      <div id="bk-ask">${bkAsk()}</div>
      <p class="muted bk-p" id="ast-bk-msg" aria-live="polite">${done ? `불러왔어요 · ${esc(done)}` : ""}</p>
      <details class="bk-txt"><summary>파일이 안 되면 글자로 옮기기</summary>
        <p class="muted bk-p">카톡 안 브라우저처럼 파일 저장이 막히면, 아래 글자를 복사해 나에게 보내기로 저장했다가 붙여 넣고 '불러오기'를 눌러요.</p>
        <textarea id="ast-json" rows="3" spellcheck="false" aria-label="백업 글자"></textarea>
        <div class="ast-new"><button type="button" class="ast-btn" data-ast-export>복사</button><button type="button" class="ast-btn" data-ast-import>불러오기</button></div></details></details>`;
}
function bindBk(card) {
  const bm = $("#ast-bk-msg", card), bj = $("#ast-json", card), fi = $("#bk-file", card), ask = $("#bk-ask", card);
  if (!bm) return;
  const say = (t) => { bm.textContent = t; bkDone = ""; };
  const saved = () => {
    const now = new Date().toISOString();
    remember("bk_at", now);
    const t = $(".bk-st", card); if (t) { t.textContent = "오늘 저장"; t.classList.remove("old"); }
  };
  const showAsk = () => { ask.innerHTML = bkAsk(); bindAsk(); };
  const take = (text) => {
    const r = bkRead(text);
    if (!r) { bkWait = null; showAsk(); say("이 앱 백업 파일이 아니에요. '파일로 저장'으로 만든 파일을 골라 주세요."); return; }
    bkWait = r; say(""); showAsk();
  };
  function bindAsk() {
    const y = $("[data-bk-yes]", ask), n = $("[data-bk-no]", ask);
    if (n) n.addEventListener("click", () => { bkWait = null; showAsk(); say("불러오지 않았어요"); });
    if (y) y.addEventListener("click", () => {
      try {
        for (const [k, v] of Object.entries(bkWait.keys)) localStorage.setItem(k, v);
        localStorage.setItem("tools_tab", "asset");
        const c = bkCount(bkWait.keys);
        try { sessionStorage.setItem("bk_done", [`자산 기록 ${c.months}번`, c.watch ? `관심 종목 ${c.watch}개` : ""].filter(Boolean).join(" · ")); } catch (e) { /* 문구만 빠짐 */ }
      } catch (e) { say("이 브라우저에 저장할 수 없어요 (비공개 모드인지 확인해 주세요)"); return; }
      say("불러왔어요. 새로 여는 중…");
      location.reload();
    });
  }
  bindAsk();
  $("[data-bk-save]", card).addEventListener("click", () => {
    const name = `easystock-backup-${new Date().toISOString().slice(0, 10)}.json`, text = JSON.stringify(bkMake());
    // 아이폰 '홈 화면에 추가'한 앱은 다운로드가 조용히 안 돼서 공유 창(파일에 저장·카톡)으로 보내요
    let file = null;
    try { file = new File([text], name, { type: "application/json" }); } catch (e) { /* 옛 브라우저 */ }
    if (navigator.standalone && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(() => { saved(); say("보냈어요. '파일에 저장'이나 나에게 보내기로 남겨 두세요."); },
        (e) => say(e && e.name === "AbortError" ? "저장하지 않았어요" : "공유 창이 안 열려요. 아래 '글자로 옮기기'를 써 주세요."));
      return;
    }
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    saved();
    say(`${name} 저장을 시작했어요. 다운로드 폴더(아이폰은 파일 앱)에서 확인해 주세요. 안 보이면 아래 '글자로 옮기기'를 써요.`);
  });
  $("[data-bk-open]", card).addEventListener("click", () => { fi.value = ""; fi.click(); });
  fi.addEventListener("change", () => {
    const f = fi.files && fi.files[0];
    if (!f) return;
    if (f.size > 2000000) { say("파일이 너무 커요. 이 앱 백업 파일이 맞는지 확인해 주세요."); return; }
    const rd = new FileReader();
    rd.onload = () => take(String(rd.result || ""));
    rd.onerror = () => say("파일을 읽지 못했어요");
    rd.readAsText(f);
  });
  // 글자로 옮기기 (파일이 막힌 브라우저용)
  const bt = $(".bk-txt", card);
  bt.addEventListener("toggle", () => { if (bt.open && !bj.value) bj.value = JSON.stringify(bkMake()); });
  $("[data-ast-export]", card).addEventListener("click", () => {
    bj.value = JSON.stringify(bkMake());
    bj.select();
    const ok = () => { saved(); say("복사했어요. 나에게 보내기에 붙여 넣어 두세요."); }, no = () => { try { document.execCommand("copy"); ok(); } catch (e) { say("글자를 길게 눌러 복사해 주세요"); } };
    if (navigator.clipboard) navigator.clipboard.writeText(bj.value).then(ok, no); else no();
  });
  $("[data-ast-import]", card).addEventListener("click", () => take(bj.value));
}

// 위 4칸 그래프 (사용자가 보내 준 자산 앱 그래프 참고, 2026-11-08): 위에 큰 금액, 굵은 둥근 막대 + 흰 점 선, 눈금 없이 깔끔하게.
// 최근 12달(해를 넘어도), 앞쪽 빈 달은 빼고 최소 6칸. 막대를 누르면 그 달 숫자로 바뀌어요. 아래 '추이 | 구성' 버튼
const AST_CHART = {
  total: { title: "총자산", bar: "투자금", line: "총자산" },
  chg: { title: "그 달 늘어난 돈", bar: "그 달 증감", line: "쌓인 증감" },
  div: { title: "그 달 받은 배당", bar: "배당", line: "쌓인 배당" },
  cash: { title: "예수금", bar: "예수금", line: "현금 비중", pct: true },
  // 펼친 달 요약 칸용 (사용자 2026-11-22 "여기도 칸 누르면 그래프")
  cost: { title: "총 투자금", bar: "투자금", line: "총자산" },
  n: { title: "종목 수", bar: "종목 수", line: "" },
};
let astMode = "trend";
// 달마다 한 점: 그 달 마지막 기록 (펼친 기록이 있는 달은 그 기록까지), 배당은 그 달 기록 합계
function astSeries(y, k, endKey) {
  const end = endKey ? endKey.slice(0, 7) : String(y) === ymNow().slice(0, 4) ? ymNow() : `${y}-12`;
  const yms = Array.from({ length: 12 }, (_, i) => ymAdd(end, i - 11));
  let acc = 0, accD = 0;
  const pts = yms.map((ym) => {
    const key = endKey && ym === end ? (astFilled(endKey) ? endKey : null) : astMonKey(ym);
    if (!key) return { ym, bar: null, line: null };
    const s = { ...astSum(key) }, p = astPrevYm(key), ps = p ? astSum(p) : null;
    s.div = astMonKeys(ym).filter((x) => x <= key).reduce((a, x) => a + astSum(x).div, 0);
    if (k === "total" || k === "cost") return { ym, key, bar: s.cost, line: s.total, s };
    if (k === "n") return { ym, key, bar: s.n, line: null, s };
    if (k === "chg") { const d = ps ? s.total - ps.total : 0; acc += d; return { ym, key, bar: d, line: acc, s }; }
    if (k === "div") { accD += s.div; return { ym, key, bar: s.div, line: accD, s }; }
    return { ym, key, bar: s.cash, line: s.total ? (s.cash / s.total) * 100 : 0, s };
  });
  const first = pts.findIndex((p) => p.bar != null);
  return first < 0 ? [] : pts.slice(Math.max(0, Math.min(first, 6)));
}
const astFmt = (k, v) => (k === "n" ? `${v}개` : k === "div" ? astDivW(v) : k === "chg" ? `${v > 0 ? "+" : v < 0 ? "-" : ""}${astWon(Math.abs(v))}` : astWon(v));
// k·end를 주면 펼친 달 요약 칸 그래프 (그 달까지 12달)
function astChartHtml(y, k = astChart, end) {
  const cfg = AST_CHART[k], pts = astSeries(y, k, end), has = pts.filter((p) => p.bar != null);
  if (!has.length) return "";
  const sel = has.find((p) => p.ym === astTip) || has[has.length - 1];
  const head = k === "total" ? sel.line : sel.bar;
  const sub = k === "n" ? `${+sel.ym.slice(5)}월 기록 기준` : `${+sel.ym.slice(5)}월 · ${k === "total" ? cfg.bar : cfg.line} ${k === "total" ? savWon(sel.bar) : cfg.pct ? `${Math.round(sel.line)}%` : k === "chg" ? astWonD(sel.line) : astMan(sel.line)}`;
  const tabs = `<div class="period ast-mode" role="group" aria-label="그래프 보기"><button type="button" data-ast-mode="trend" aria-pressed="${astMode === "trend"}">추이</button><button type="button" data-ast-mode="mix" aria-pressed="${astMode === "mix"}">구성</button></div>`;
  const top = `<div class="ast-ch-top"><div><small>${esc(cfg.title)}</small><b class="${cfg.sign ? astCls(head) : ""}">${astFmt(k, head)}</b><span class="muted">${sub}</span></div>
    <div class="ast-leg"><span><i class="b${cfg.sign ? " sign" : ""}"></i>${cfg.bar}</span>${cfg.line ? `<span><i class="l"></i>${cfg.line}</span>` : ""}</div></div>`;
  if (k === "n") { /* 종목 수는 추이만 */ } else if (astMode === "mix") return `<div class="ast-chart">${top}${k === "div" ? astDivMix(sel.ym, sel.key) : astMix(sel.key)}${tabs}</div>`;
  const n = pts.length, W = 340, H = 172, L = 6, Rr = 6, T = 16, B = 24, iw = W - L - Rr, ih = H - T - B;
  // 막대와 선은 같은 눈금 (현금 비중 %만 따로 0~100%)
  const vals = has.flatMap((p) => (cfg.pct || p.line == null ? [p.bar] : [p.bar, p.line]));
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  hi += (hi - lo) * 0.06;
  const Y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih, Yp = (v) => T + ih - (v / 100) * ih * 0.94;
  const cw = iw / n, X = (i) => L + cw * i + cw / 2, bw = Math.min(30, cw * 0.62);
  const every = n > 8 ? 3 : n > 6 ? 2 : 1, lastI = pts.length - 1;
  const bars = pts.map((p, i) => {
    const on = p.ym === sel.ym;
    const lab = (i - lastI) % every === 0 || on ? `<text class="ast-ax${on ? " on" : ""}" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${+p.ym.slice(5)}월</text>` : "";
    const hit = `<rect class="ast-hit" data-ast-tip="${p.ym}" x="${(L + cw * i).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="${H}"/>`;
    if (p.bar == null) return lab + hit;
    const y0 = Y(0), y1 = Y(p.bar), h = Math.max(2, Math.abs(y1 - y0)), r = Math.min(bw / 2, 6, h / 2);
    const x0 = X(i) - bw / 2, up = p.bar >= 0, yt = up ? y0 - h : y0;
    // 끝만 둥근 막대 (바닥 쪽은 반듯하게)
    const d = up ? `M${x0} ${y0}V${yt + r}Q${x0} ${yt} ${x0 + r} ${yt}H${x0 + bw - r}Q${x0 + bw} ${yt} ${x0 + bw} ${yt + r}V${y0}Z`
      : `M${x0} ${y0}V${yt + h - r}Q${x0} ${yt + h} ${x0 + r} ${yt + h}H${x0 + bw - r}Q${x0 + bw} ${yt + h} ${x0 + bw} ${yt + h - r}V${y0}Z`;
    const cls = up ? "" : " neg";
    return `${lab}<path class="ast-b${cls}${on ? " on" : ""}" d="${d}"/>${hit}`;
  }).join("");
  const Ly = cfg.pct ? Yp : Y;
  const lp = pts.map((p, i) => (p.line == null ? null : { x: X(i), y: Ly(p.line), on: p.ym === sel.ym })).filter(Boolean);
  const line = `<path class="ast-cl" d="${lp.map((q, j) => `${j ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("")}"/>`
    + lp.map((q) => `<circle class="ast-cd${q.on ? " on" : ""}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${q.on ? 5.5 : 4}"/>`).join("");
  const base = `<line class="ast-gl z" x1="${L}" x2="${W - Rr}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
  return `<div class="ast-chart">${top}
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(cfg.bar)} 막대${cfg.line ? `와 ${esc(cfg.line)} 선` : ""} 그래프">${base}${bars}${lp.length ? line : ""}</svg>${k === "n" ? "" : tabs}</div>`;
}
// 배당 구성: 고른 달에 어느 종목(어느 증권사·계좌)에서 얼마 받았는지 (사용자 2026-11-08)
function astDivMix(ym, key) {
  const its = astMonKeys(ym).filter((k) => k <= key).flatMap((k) => AST.months[k].items), s = { div: its.reduce((a, i) => a + (+i.div || 0), 0) };
  if (!s.div) return `<p class="muted" style="margin:12px 0 0">${+ym.slice(5)}월엔 받은 배당이 없어요.</p>`;
  const rows = its.filter((i) => +i.div > 0).sort((p, q) => q.div - p.div);
  return `<ul class="ast-mix">${rows.map((i) => `<li><div class="ast-mix-t"><span class="ast-mix-n"><b>${esc(i.name)}</b><small>${esc(astLabel(i.acct))}</small></span>
    <span>${astWon(+i.div)} · ${Math.round((i.div / s.div) * 100)}%</span></div>
    <div class="ast-mix-bar"><i style="width:${((i.div / s.div) * 100).toFixed(1)}%"></i></div></li>`).join("")}</ul>
    <p class="muted ast-mix-leg">${+ym.slice(5)}월 배당 ${rows.length}건 · 합계 ${astWon(s.div)}</p>`;
}
// 구성: 고른 달의 계좌별 총자산(투자금+예수금) 비중 막대
function astMix(ym) {
  const x = AST.months[ym], s = astSum(ym);
  if (!x || !s.total) return `<p class="muted">그 달 기록이 없어요.</p>`;
  const rows = astIds(x).map((a) => {
    const cost = x.items.filter((i) => i.acct === a).reduce((v, i) => v + (+i.cost || 0), 0), cash = x.cash ? +x.cash[a] || 0 : 0;
    return { a: astLabel(a), cost, cash, t: cost + cash };
  }).filter((r) => r.t > 0).sort((p, q) => q.t - p.t);
  return `<ul class="ast-mix">${rows.map((r) => `<li><div class="ast-mix-t"><b>${esc(r.a)}</b><span>${savWon(r.t)} · ${Math.round((r.t / s.total) * 100)}%</span></div>
    <div class="ast-mix-bar"><i style="width:${((r.cost / s.total) * 100).toFixed(1)}%"></i><i class="c" style="width:${((r.cash / s.total) * 100).toFixed(1)}%"></i></div></li>`).join("")}</ul>
    <p class="muted ast-mix-leg"><i></i>투자금 <i class="c"></i>예수금 · ${astShort(ym)} 기록 기준</p>`;
}

// 증권사·계좌 관리: 증권사마다 이름·계좌 목록·계좌 더하기, 맨 아래 증권사 더하기. 입력칸은 form이라 폰 키보드 '완료'·엔터로도 돼요
let astEditOpen = false;
// 증권사 칸 접기·펼치기 (사용자 2026-11-08 '화면이 너무 길어'). 처음엔 다 접혀 있고, 펼친 증권사는 이 폰에 기억해요
const AST_BOPEN = new Set();
try { JSON.parse(localStorage.getItem("ast_bopen") || "[]").forEach((b) => AST_BOPEN.add(b)); } catch (e) { /* 처음 */ }
const astBSave = () => { remember("ast_bopen", JSON.stringify([...AST_BOPEN])); };
function astAcctEdit() {
  const brokers = astBrokers();
  return brokers.map((b, bi) => {
    const list = AST.accts.filter((a) => a.broker === b);
    const preset = AST_PRESET.filter((n) => !list.some((a) => a.name === n)).map((n) => `<button type="button" class="ast-add-a" data-ast-new="${esc(n)}" data-ast-b="${bi}">＋ ${esc(n)}</button>`).join("");
    return `<div class="ast-bedit"><form class="ast-new" data-ast-brename="${bi}"><input type="text" maxlength="20" value="${esc(b)}" aria-label="증권사 이름" class="ast-bname"><button type="submit" class="ast-btn">이름 저장</button></form>
      <ul class="ast-alist">${list.map((a) => `<li><form class="ast-new" data-ast-rename="${esc(a.id)}"><span class="ast-tree-i" aria-hidden="true">└</span><input type="text" maxlength="20" value="${esc(a.name)}" aria-label="${esc(b)} 계좌 이름">
        <button type="submit" class="ast-btn ast-btn-s">저장</button>${AST.accts.length > 1 ? `<button type="button" class="ast-x" data-ast-drop="${esc(a.id)}" aria-label="${esc(b)} ${esc(a.name)} 계좌 빼기">×</button>` : ""}</form></li>`).join("")}</ul>
      <div class="chips" style="margin-top:6px">${preset}</div>
      <form class="ast-new" data-ast-new-go="${bi}"><input type="text" maxlength="20" placeholder="${esc(b)}에 새 계좌 (예: 해외주식)" aria-label="${esc(b)}에 더할 계좌 이름"><button type="submit" class="ast-btn">계좌 추가</button></form></div>`;
  }).join("") + `<div class="ast-bedit ast-bnew"><b>증권사 추가</b>
    <div class="chips" style="margin-top:6px">${AST_BROKERS.filter((n) => !brokers.includes(n)).map((n) => `<button type="button" class="ast-add-a" data-ast-newb="${esc(n)}">＋ ${esc(n)}</button>`).join("")}</div>
    <form class="ast-new" data-ast-newb-go><input type="text" maxlength="20" placeholder="증권사 이름 (예: 키움)" aria-label="새 증권사 이름"><button type="submit" class="ast-btn">증권사 추가</button></form>
    <p class="muted" style="margin:6px 0 0;font-size:12px">증권사를 더하면 '일반 계좌'가 하나 같이 생겨요. 계좌를 빼면 그 계좌 종목·예수금은 맨 앞 계좌로 옮겨져요.</p></div>`;
}

// 펼친 달: 요약 → 메모 → 계좌별 종목 → 종목 넣기 → 사다리 그림
function astDetail(ym) {
  const x = AST.months[ym] || { memo: "", items: [] };
  const p = astPrevYm(ym), now = ymNow(), mon = ym.slice(0, 7);
  const copy = !astFilled(ym) && p ? `<button type="button" class="more ast-copy" data-ast-copy>📋 ${esc(astDayName(p))} 기록 종목·예수금 그대로 가져오기<span aria-hidden="true">›</span></button>` : "";
  // 이 달에 남긴 기록들: 누르면 그 기록으로, '＋ 다른 날'은 새 기록 (아직 안 적은 기록도 칩으로 보여요)
  const ks = astMonKeys(mon); if (!ks.includes(ym)) ks.push(ym); ks.sort();
  const nk = ks.includes(astToday()) || mon !== ymNow() ? astNewKey(mon, ks[ks.length - 1]) || astNewKey(mon) : astToday();
  const days = `<div class="ast-days" role="group" aria-label="${esc(ymName(mon))}에 남긴 기록"><span class="muted">이 달 기록</span>
    ${ks.map((k) => { const t = `${+k.slice(8, 10)}일${AST.months[k] ? "" : " <small>새로</small>"}`;
      return k === ym ? `<span class="ast-day" aria-current="true">${t}</span>` : `<button type="button" class="ast-day" data-ast-day="${k}">${t}</button>`; }).join("")}
    ${nk && AST.months[ym] ? `<button type="button" class="ast-day ast-day-add" data-ast-day="${nk}" aria-label="${esc(astDayName(nk))} 새 기록">＋ 다른 날</button>` : ""}</div>`;
  return `<div class="ast-detail${astAnim && !calm() ? " zoom" : ""}" id="ast-detail">
    <div class="ast-dh"><button type="button" class="back" data-ast-close>‹ 달력</button>
      <span class="ast-dm"><button type="button" class="ast-nav" data-ast-step="-1" aria-label="지난달">‹</button><b>${esc(ymName(mon))}</b>
      <button type="button" class="ast-nav" data-ast-step="1" aria-label="다음 달" ${mon >= now ? "disabled" : ""}>›</button></span></div>
    ${days}
    <div class="ast-date"><label><span class="muted">기록한 날짜</span>
      <input type="date" data-ast-date value="${ym}" max="${astToday()}" aria-label="${esc(astDayName(ym))} 기록한 날짜 (달력에서 고르면 이 기록이 그 날로 옮겨가요)"></label>
      ${ym !== astToday() && !AST.months[astToday()] ? `<button type="button" class="ast-btn ast-btn-s" data-ast-today>오늘로</button>` : ""}</div>
    <p class="muted ast-date-msg" id="ast-date-msg" aria-live="polite"></p>
    <div id="ast-since">${astFilled(ym) && ym !== astFirstYm() ? astSinceLine(ym) : ""}</div>
    <div id="ast-sum">${astSumHtml(ym)}</div>
    <label class="ast-memo"><span class="muted">메모</span><textarea data-ast-memo rows="3" maxlength="2000" placeholder="그날 있었던 일, 산 이유, 다음 계획…">${esc(x.memo)}</textarea></label>
    <h3 class="sav-h">증권사 · 계좌별 예수금·종목 <small class="muted">${x.items.length}종목</small></h3>
    <details class="sav-mine ast-acct-edit" ${astEditOpen ? "open" : ""}><summary>증권사·계좌 추가·이름 바꾸기</summary>${astAcctEdit()}</details>
    ${copy}
    <div id="ast-rows">${astRows(ym)}</div>
    <h3 class="sav-h">종목 넣기</h3>
    <label class="ast-to"><span>어느 계좌에?</span>${astToSel(astTo, `data-ast-to aria-label="종목을 넣을 계좌"`)}</label>
    <input id="ast-q" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="종목 이름 일부만 (예: 삼전, 슈드, 코덱스 200)" aria-label="기록할 종목 검색" value="${esc(astQuery)}" style="margin-top:8px">
    <div id="ast-res">${astResults(ym)}</div>
    <h3 class="sav-h">증권사 → 계좌 → 종목 나눠 보기 <small class="muted">총자산 비중</small></h3>
    <div id="ast-tree">${astTree(ym)}</div>
    <button type="button" class="goal-reset ast-clear" data-ast-clear ${astFilled(ym) || x.memo ? "" : "hidden"}>${RESET_ICON}<span class="t0">이 날 기록 지우기</span><span>한 번 더 누르면 지워요</span></button>
  </div>`;
}

// 요약 4칸: 총 투자금·예수금·주 수 합계(지난 기록 대비), 이번 달 받은 배당. 아래 한 줄은 총자산과 비교 기준
function astSumHtml(ym) {
  const s = astSum(ym), p = astPrevYm(ym), ps = p ? astSum(p) : null;
  const vs = (d, f) => (ps ? `<small class="${astCls(d)}">${d ? f(d) : "그대로"}</small>` : `<small class="muted">첫 기록</small>`);
  const pn = p ? astShort(p, ym) : "";
  // 칸을 누르면 바로 아래에 그 값의 달마다 그래프 (다시 누르면 닫혀요)
  const on = (k) => astSumK === k, g = (k) => `<span class="ast-tile-g" aria-hidden="true">${on(k) ? "그래프 닫기 ▴" : "그래프 ▾"}</span>`;
  const tile = (k, label, val, more) => `<button type="button" class="ast-tile" data-ast-sk="${k}" aria-pressed="${on(k)}"><small>${label}</small><b>${val}</b>${more}${g(k)}</button>`;
  const ch = astSumK && astFilled(ym) ? astChartHtml(+ym.slice(0, 4), astSumK, ym) : "";
  return `<div class="sav-hero ast-hero">
    ${tile("cost", "총 투자금", savWon(s.cost), vs(s.cost - (ps ? ps.cost : 0), astWonD))}
    ${tile("cash", "예수금", savWon(s.cash), vs(s.cash - (ps ? ps.cash : 0), astWonD))}
    ${tile("n", "종목 수", `${s.n}개`, vs(s.n - (ps ? ps.n : 0), (d) => `${d > 0 ? "+" : "-"}${Math.abs(d)}개`))}
    ${tile("div", "이 기록 배당", astDivW(s.div), s.div ? "" : `<small class="muted">없음</small>`)}</div>
    <button type="button" class="ast-total ast-total-b" data-ast-sk="total" aria-pressed="${on("total")}">총자산 <b>${savWon(s.total)}</b>${ps ? ` <span class="${astCls(s.total - ps.total)}">${s.total - ps.total ? astWonD(s.total - ps.total) : "그대로"}</span> <small class="muted">· ${pn} 기록과 비교</small>` : ` <small class="muted">· 첫 기록</small>`}
      <span class="ast-tile-g" aria-hidden="true">${on("total") ? "▴" : "그래프 ▾"}</span></button>
    ${ch ? `<div id="ast-schart">${ch}</div>` : ""}
    ${astLiveLine(ym)}${astQtyList(ym)}`;
}

// 종목별 주 수 증감 (전체 합계 대신, 사용자 2026-11-08): 같은 계좌의 같은 종목끼리 지난 기록과 비교, 빠진 종목도
function astQtyList(ym) {
  const x = AST.months[ym], p = astPrevYm(ym);
  if (!x || !x.items.length) return "";
  const prev = p ? AST.months[p].items : [];
  const rows = x.items.map((it) => {
    const was = prev.find((j) => astKey(j) === astKey(it));
    const d = (+it.qty || 0) - (was ? +was.qty || 0 : 0);
    return { it, d, tag: !p ? "" : !was ? "새로" : d ? astQtyD(d) : "그대로" };
  }).concat(prev.filter((j) => !x.items.some((i) => astKey(i) === astKey(j))).map((j) => ({ it: { ...j, qty: 0 }, d: -(+j.qty || 0), tag: `${astQtyD(-(+j.qty || 0))} (정리)` })));
  return `<ul class="ast-qty">${rows.map(({ it, tag }) => `<li><span class="l"><b>${esc(it.name)}</b><small>${esc(astLabel(it.acct))}</small></span>
    <span class="r"><b>${astQty(+it.qty || 0)}</b>${tag ? `<small>${tag}</small>` : ""}</span></li>`).join("")}</ul>
    ${p ? "" : `<p class="muted" style="margin:4px 0 0;font-size:12px">다음 기록을 남기면 종목마다 몇 주 늘었는지 보여요.</p>`}`;
}
// 지난 기록과 비교: 같은 계좌의 같은 종목끼리
function astDelta(ym, it) {
  const p = astPrevYm(ym);
  if (!p) return "";
  const was = AST.months[p].items.find((j) => astKey(j) === astKey(it));
  if (!was) return `<span class="ast-tag new">새로 담음</span>`;
  const dq = (+it.qty || 0) - (+was.qty || 0), dc = (+it.cost || 0) - (+was.cost || 0);
  if (!dq && !dc) return `<span class="ast-tag">지난 기록 그대로</span>`;
  return `<span class="ast-tag ${astCls(dq || dc)}">${dq ? astQtyD(dq) : "주 수 그대로"} · 투자금 ${dc ? astWonD(dc) : "그대로"}</span>`;
}
function astRows(ym) {
  const x = AST.months[ym] || { items: [] };
  const p = astPrevYm(ym);
  const gone = p ? AST.months[p].items.filter((j) => !x.items.some((i) => astKey(i) === astKey(j))) : [];
  const ids = astIds(x);
  const grp = (a) => {
    const its = x.items.filter((i) => i.acct === a);
    const tot = its.reduce((s, i) => s + (+i.cost || 0), 0), cash = x.cash ? +x.cash[a] || 0 : 0;
    return `<div class="ast-grp" data-ast-g="${esc(a)}"><div class="ast-gh"><b>${esc(astA(a) ? astA(a).name : a)}</b><small class="muted">${its.length ? `${its.length}종목 · ${savWon(tot)}` : "종목 없음"}</small></div>
      <label class="ast-cash"><span>예수금</span><span class="alert-input"><input data-ast-cash="${esc(a)}" type="text" inputmode="decimal" value="${cash ? cash.toLocaleString("ko-KR") : ""}" placeholder="0"><span>원</span></span></label>
      ${its.map((it) => {
        const inp = (k, label, unit) => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-ast-f="${k}" type="text" inputmode="decimal" value="${+it[k] ? (+it[k]).toLocaleString("ko-KR", { maximumFractionDigits: 4 }) : ""}" placeholder="0"><span>${unit}</span></span></label>`;
        const sel = astToSel(it.acct, `data-ast-acct aria-label="다른 계좌로 옮기기"`);
        return `<div class="ast-row" data-ast-id="${it.id}"><div class="ast-rh"><span class="l"><b>${esc(it.name)}</b>
          <small class="muted">${esc(it.code)} · ${esc(MK_NAME[it.m] || "")}</small></span>${sel}
          <button type="button" class="ast-x" data-ast-del aria-label="${esc(it.name)} 빼기">×</button></div>
          <div class="sav-grid ast-in3">${inp("qty", "주 수", "주")}${inp("cost", "투자금", "원")}${inp("div", "받은 배당", "원")}</div>
          <div class="ast-delta">${astDeltaAll(ym, it)}</div></div>`;
      }).join("")}</div>`;
  };
  // 증권사 칸 안에 계좌 칸 (사다리 1·2단계)
  const groups = astBrokers().concat(ids.some((a) => !astA(a)) ? ["(옛 계좌)"] : []).map((b) => {
    const list = ids.filter((a) => (astA(a) ? astA(a).broker : "(옛 계좌)") === b);
    if (!list.length) return "";
    const t = list.reduce((v, a) => v + x.items.filter((i) => i.acct === a).reduce((u, i) => u + (+i.cost || 0), 0) + (x.cash ? +x.cash[a] || 0 : 0), 0);
    const n = x.items.filter((i) => list.includes(i.acct)).length;
    return `<details class="ast-brk" data-ast-bk="${esc(b)}" ${AST_BOPEN.has(b) ? "open" : ""}><summary class="ast-bh"><b>🏦 ${esc(b)}</b>
      <small class="muted">계좌 ${list.length}개 · ${n}종목 · ${savWon(t)}</small><span class="ast-fold" aria-hidden="true"></span></summary>${list.map(grp).join("")}</details>`;
  }).join("");
  const goneH = gone.length ? `<div class="ast-gone"><small class="muted">${esc(astShort(p, ym))} 기록엔 있었는데 이번엔 없어요</small>
    ${gone.map((j) => `<span class="ast-tag">${esc(astLabel(j.acct))} · ${esc(j.name)} ${astQty(+j.qty || 0)}</span>`).join("")}</div>` : "";
  return groups + goneH + (x.items.length ? "" : `<p class="muted" style="margin:8px 0 0">아래에서 종목을 찾아 넣어 보세요.</p>`);
}
// 종목 검색 (검색 화면과 같은 너그러운 검색). 누르면 고른 계좌에 풀네임으로 들어가요
function astResults(ym) {
  const q = astQuery.trim();
  if (!q) return "";
  if (!SYM.kr || !SYM.us) return `<p class="muted" style="margin:8px 0 0">종목 목록 불러오는 중…</p>`;
  const qs = queryKeys(q), hits = [];
  for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => { const sc = scoreOf(e.row, e.keys, qs); if (sc != null) hits.push({ m, sc, i, row: e.row }); });
  hits.sort((a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i);
  if (!hits.length) return `<p class="muted" style="margin:8px 0 0">'${esc(q)}'에 맞는 종목이 없어요.</p>`;
  const x = AST.months[ym] || { items: [] };
  return `<ul class="sav-res">${hits.slice(0, 6).map(({ m, row }) => {
    const on = x.items.some((i) => i.acct === astTo && i.m === m && i.code === row[0]);
    return `<li><button type="button" data-ast-add="${m}:${esc(row[0])}" aria-pressed="${on}"><span class="l"><b>${esc(row[1])}</b>
      <small>${esc(row[0])} · ${esc(kindName(m, row))}</small></span><span class="add">${on ? "✓" : "+"}</span></button></li>`;
  }).join("")}</ul>`;
}

// 사다리 그림: 왼쪽 '내 자산' → 가운데 계좌 → 오른쪽 종목. 꺾인 선으로 갈라지고, 선 굵기·글자는 투자금 비중
function astTree(ym) {
  const x = AST.months[ym] || { items: [], cash: {} };
  if (!astFilled(ym)) return `<p class="muted" style="margin:6px 0 0">종목이나 예수금을 넣으면 증권사 → 계좌 → 종목으로 갈라지는 그림이 나와요.</p>`;
  // 내 자산 → 증권사 → 계좌 → 종목 (예수금은 그 계좌의 마지막 가지, 회색 점)
  const ids = astIds(x);
  const accts = ids.map((a) => {
    const its = x.items.filter((i) => i.acct === a).sort((p, q) => (+q.cost || 0) - (+p.cost || 0));
    const c = x.cash ? +x.cash[a] || 0 : 0;
    if (c > 0) its.push({ name: "예수금", cost: c, cash: true });
    const A = astA(a);
    return { a, b: A ? A.broker : "(옛 계좌)", n: A ? A.name : a, its, t: its.reduce((v, i) => v + (+i.cost || 0), 0) };
  }).filter((g) => g.its.length);
  const brk = accts.map((g) => g.b).filter((b, k, all) => all.indexOf(b) === k).map((b) => ({ b, gs: accts.filter((g) => g.b === b) }));
  const total = astSum(ym).total || 1;
  const RH = 32, AG = 8, BG = 16, W = 358, X0 = 52, B1 = 62, B2 = 120, A1 = 130, A2 = 190, S1 = 200;
  let y = 6;
  brk.forEach((B) => {
    B.gs.forEach((g) => { g.ys = g.its.map(() => { const v = y + RH / 2; y += RH; return v; }); g.y = (g.ys[0] + g.ys[g.ys.length - 1]) / 2; y += AG; });
    y += BG - AG;
    B.y = (B.gs[0].y + B.gs[B.gs.length - 1].y) / 2; B.t = B.gs.reduce((v, g) => v + g.t, 0);
  });
  const H = y - BG + 6, rootY = (brk[0].y + brk[brk.length - 1].y) / 2;
  const share = (v) => `${Math.round((v / total) * 100)}%`;
  const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const sw = (v) => (1.5 + 3.5 * Math.sqrt(v / total)).toFixed(1);
  let lines = "", boxes = "";
  const ln = (d, w, k) => `<path class="ast-ln" d="${d}" stroke-width="${w}" pathLength="1" style="--k:${k}"/>`;
  const box = (cls, x1, x2, yy, t1, t2, k) => `<g class="ast-node ${cls}" style="--k:${k}"><rect x="${x1}" y="${yy - 15}" width="${x2 - x1}" height="30" rx="8"/>
    <text x="${(x1 + x2) / 2}" y="${yy - 2}" text-anchor="middle" class="t1">${esc(t1)}</text><text x="${(x1 + x2) / 2}" y="${yy + 10}" text-anchor="middle" class="t2">${esc(t2)}</text></g>`;
  brk.forEach((B, bi) => {
    lines += ln(`M${X0} ${rootY}H${(X0 + B1) / 2}V${B.y}H${B1}`, sw(B.t), 0);
    boxes += box("brk", B1, B2, B.y, short(B.b, 5), share(B.t), bi);
    B.gs.forEach((g) => {
      lines += ln(`M${B2} ${B.y}H${(B2 + A1) / 2}V${g.y}H${A1}`, sw(g.t), 1);
      boxes += box("acct", A1, A2, g.y, short(g.n, 5), savWon(g.t), bi);
      g.its.forEach((it, j) => {
        const yy = g.ys[j];
        lines += ln(`M${A2} ${g.y}H${(A2 + S1) / 2}V${yy}H${S1}`, sw(+it.cost || 0), 2);
        boxes += `<g class="ast-node stock${it.cash ? " cash" : ""}" style="--k:${bi}"><circle cx="${S1 + 4}" cy="${yy}" r="3.5"/>
          <text x="${S1 + 12}" y="${yy - 2}" class="t1">${esc(short(it.name, 12))}</text>
          <text x="${S1 + 12}" y="${yy + 10}" class="t2">${it.cash ? "" : `${astQty(+it.qty || 0)} · `}${esc(savWon(+it.cost || 0))} · ${share(+it.cost || 0)}</text></g>`;
      });
    });
  });
  boxes += `<g class="ast-node root"><rect x="2" y="${rootY - 17}" width="${X0 - 2}" height="34" rx="9"/>
    <text x="${(X0 + 2) / 2}" y="${rootY - 3}" text-anchor="middle" class="t1">내 자산</text>
    <text x="${(X0 + 2) / 2}" y="${rootY + 10}" text-anchor="middle" class="t2">${esc(savWon(total))}</text></g>`;
  return `<svg class="ast-tree${astAnim && !calm() ? " grow" : ""}" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="증권사·계좌별 종목 나눠 보기">${lines}${boxes}</svg>`;
}

function bindAsset() {
  const card = $("#ast-card");
  if (!card) return;
  const redraw = (anim) => {  // 칸만 다시 그려요. 누른 버튼은 제자리 (화면 그대로 규칙)
    astAnim = !!anim;
    holdHeight();
    const c = $("#ast-card");
    c.outerHTML = assetCard();
    astAnim = false;
    bindAsset();
    dvRefresh();  // 종목·주 수가 바뀌면 아래 배당 달력도 같이
    keepTap();
  };
  const month = (ym) => AST.months[ym] || (AST.months[ym] = { memo: "", items: [], cash: {} });
  // 달력 화면: 위 4칸을 누르면 그래프 열기·닫기, 그래프 막대를 누르면 그 달 숫자
  card.querySelectorAll("[data-ast-chart]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.astChart;
    astChart = astChart === k ? null : k;
    astTip = null;
    redraw();
    const svg = $("#ast-chart svg");
    if (svg && !calm()) {
      drawIn(svg, { x0: 6, w: 328, sel: ".ast-cl", late: ".ast-cd", px: svg.getBoundingClientRect().width });
      svg.querySelectorAll(".ast-b").forEach((r, i) => r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 420, delay: i * 35, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
    }
  }));
  // 막대 누르기·추이/구성: 그래프 칸만 다시 그려요 (높이가 바뀌는 구성은 누른 버튼 제자리)
  const ch = $("#ast-chart");
  if (ch) ch.addEventListener("click", (e) => {
    const h = e.target.closest("[data-ast-tip]"), m = e.target.closest("[data-ast-mode]");
    if (!h && !m) return;
    if (h) astTip = h.dataset.astTip;
    if (m) { if (astMode === m.dataset.astMode) return; astMode = m.dataset.astMode; holdHeight(); }
    ch.innerHTML = astChartHtml(+AST.year);
    if (m) keepTap();
  });
  // 지금 시세로 평가 켜기·끄기
  card.querySelectorAll("[data-ast-live]").forEach((b) => b.addEventListener("click", () => {
    const on = b.dataset.astLive === "1";
    if (on === AST_LIVE) return;
    AST_LIVE = on; remember("ast_live", on ? "1" : "0");
    redraw();
  }));
  if (AST_LIVE && astLastYm() && !astReady()) astLoadQ().then(() => {
    const c = $("#ast-card");
    if (c !== card || !c.isConnected) return;
    const lb = $("#ast-live"); if (lb) lb.outerHTML = astLiveBox();
    if (astOpen && astLiveOn(astOpen)) {
      const sm = $("#ast-sum"); if (sm) sm.innerHTML = astSumHtml(astOpen);
      c.querySelectorAll(".ast-row").forEach((r) => { const x = AST.months[astOpen], it = x && x.items.find((i) => i.id === r.dataset.astId), d = $(".ast-delta", r); if (it && d) d.innerHTML = astDeltaAll(astOpen, it); });
    }
  });
  card.querySelectorAll("[data-ast-y]").forEach((b) => b.addEventListener("click", () => { AST.year = +AST.year + +b.dataset.astY; astTip = null; astSave(); redraw(); }));
  card.querySelectorAll("[data-ast-m]").forEach((b) => b.addEventListener("click", () => {
    const r = b.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const m = b.dataset.astM;
    astOpen = astMonKey(m) || astMonKeys(m).pop() || astNewKey(m) || `${m}-01`; astQuery = "";
    if (!astA(astTo)) astTo = AST.accts[0].id;
    lastTap = null;
    redraw(true);
    // 누른 달 칸 자리에서 커지는 것처럼 보여요
    const det = $("#ast-detail");
    if (det) det.style.transformOrigin = `${r.left - cr.left + r.width / 2}px ${r.top - cr.top + r.height / 2}px`;
    // 카드 맨 위가 화면 위로 지나가 있으면 펼친 달 맨 위가 보이게만 내려 줘요 (화면을 바꾸는 버튼이라 예외)
    const top = $("#ast-card").getBoundingClientRect().top;
    if (top < 56) window.scrollBy({ top: top - 64, behavior: calm() ? "auto" : "smooth" });
  }));
  bindBk(card);
  if (!astOpen) return;
  const ym = astOpen;
  // 펼친 달 요약 칸·총자산 줄 누르면 그래프 열기·닫기, 막대·추이/구성은 그래프만 (#ast-sum은 입력 중에도 그대로라 여기에 한 번만 걸어요)
  const sumBox = $("#ast-sum", card);
  if (sumBox) sumBox.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ast-sk]"), h = e.target.closest("[data-ast-tip]"), m = e.target.closest("[data-ast-mode]");
    if (t) {
      const k = t.dataset.astSk;
      astSumK = astSumK === k ? null : k; astTip = null;
      holdHeight();
      sumBox.innerHTML = astSumHtml(ym);
      keepTap();
      const svg = $("#ast-schart svg");
      if (svg && !calm()) {
        drawIn(svg, { x0: 6, w: 328, sel: ".ast-cl", late: ".ast-cd", px: svg.getBoundingClientRect().width });
        svg.querySelectorAll(".ast-b").forEach((r, i) => r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 420, delay: i * 35, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
      }
      return;
    }
    if (!h && !m) return;
    const sc = $("#ast-schart");
    if (!sc) return;
    if (h) astTip = h.dataset.astTip;
    if (m) { if (astMode === m.dataset.astMode) return; astMode = m.dataset.astMode; holdHeight(); }
    sc.innerHTML = astChartHtml(+ym.slice(0, 4), astSumK, ym);
    if (m) keepTap();
  });
  // 펼친 달 화면
  card.querySelector("[data-ast-close]").addEventListener("click", () => { AST.year = +ym.slice(0, 4); astOpen = null; astSave(); lastTap = null; redraw(); });
  const goMon = (m) => astMonKey(m) || astMonKeys(m).pop() || astNewKey(m) || `${m}-01`;
  card.querySelectorAll("[data-ast-step]").forEach((b) => b.addEventListener("click", () => { astOpen = goMon(ymAdd(ym.slice(0, 7), +b.dataset.astStep)); redraw(); }));
  // '＋ 다른 날'은 바로 앞 기록의 종목·주 수·투자금·예수금을 그대로 이어받아 만들어요 (사용자 2026-11-28 "종목 유지가 안되는데"). 배당·메모는 비워요
  card.querySelectorAll("[data-ast-day]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.astDay;
    if (b.classList.contains("ast-day-add") && !AST.months[k]) {
      const p = astPrevYm(k), px = p && AST.months[p];
      AST.months[k] = { memo: "", items: px ? px.items.map((i) => ({ ...i, id: astId(), div: 0 })) : [], cash: px ? { ...(px.cash || {}) } : {} };
      astSave();
    }
    astOpen = k; lastTap = null; redraw(); keepTap();
  }));
  const memo = card.querySelector("[data-ast-memo]");
  memo.addEventListener("input", () => { month(ym).memo = memo.value; astSave(); });
  const dt = card.querySelector("[data-ast-date]");
  // 날짜를 바꾸면 이 기록이 그 날로 옮겨가요 (그 날 기록이 이미 있으면 안 옮겨요)
  const setDate = (v) => {
    const msg = $("#ast-date-msg");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "") || v === ym) { dt.value = ym; return; }
    if (v > astToday()) { dt.value = ym; if (msg) msg.textContent = "오늘 뒤 날짜는 못 골라요"; return; }
    if (AST.months[v]) { dt.value = ym; if (msg) msg.textContent = `${astDayName(v)} 기록이 이미 있어요. 위 날짜 칸에서 그 기록을 열어 주세요.`; return; }
    if (AST.months[ym]) { AST.months[v] = AST.months[ym]; delete AST.months[ym]; astSave(); }
    astOpen = v; AST.year = +v.slice(0, 4); lastTap = null; redraw(); keepTap();
  };
  dt.addEventListener("change", () => setDate(dt.value));
  const td = card.querySelector("[data-ast-today]");
  if (td) td.addEventListener("click", () => setDate(astToday()));
  const live = () => {  // 입력하는 동안엔 요약·그림·비교만 바꿔요 (키보드가 안 닫혀요)
    const s = $("#ast-sum"); if (s) s.innerHTML = astSumHtml(ym);
    const t = $("#ast-tree"); if (t) t.innerHTML = astTree(ym);
    const sn = $("#ast-since"); if (sn) sn.innerHTML = astFilled(ym) && ym !== astFirstYm() ? astSinceLine(ym) : "";
    card.querySelectorAll(".ast-row").forEach((r) => { const it = month(ym).items.find((i) => i.id === r.dataset.astId), d = $(".ast-delta", r); if (it && d) d.innerHTML = astDeltaAll(ym, it); });
    const gh = card.querySelectorAll(".ast-grp");
    gh.forEach((g) => { const a = g.dataset.astG, its = month(ym).items.filter((i) => i.acct === a); $(".ast-gh small", g).textContent = its.length ? `${its.length}종목 · ${savWon(its.reduce((v, i) => v + (+i.cost || 0), 0))}` : "종목 없음"; });
    const cl = card.querySelector("[data-ast-clear]"); if (cl) cl.hidden = !astFilled(ym) && !month(ym).memo;
  };
  const rows = $("#ast-rows");
  rows.addEventListener("toggle", (e) => {  // toggle은 위로 안 올라와서 capture로 받아요
    const d = e.target.closest && e.target.closest("details[data-ast-bk]");
    if (!d || d !== e.target) return;
    if (d.open) AST_BOPEN.add(d.dataset.astBk); else AST_BOPEN.delete(d.dataset.astBk);
    astBSave();
  }, true);
  rows.addEventListener("input", (e) => {
    const c = e.target.closest("[data-ast-cash]");
    if (c) { const mo = month(ym); mo.cash[c.dataset.astCash] = astNum(c.value); astSave(); live(); return; }
    const f = e.target.closest("[data-ast-f]");
    if (!f) return;
    const it = month(ym).items.find((i) => i.id === f.closest(".ast-row").dataset.astId);
    if (!it) return;
    it[f.dataset.astF] = astNum(f.value);
    astSave(); live();
  });
  rows.addEventListener("focusout", (e) => {  // 다 쓰고 나면 1,234,000처럼 쉼표를 붙여 보여 줘요
    const f = e.target.closest("[data-ast-f], [data-ast-cash]");
    if (f) { const v = astNum(f.value); f.value = v ? v.toLocaleString("ko-KR", { maximumFractionDigits: 4 }) : ""; }
  });
  rows.addEventListener("change", (e) => {
    const s = e.target.closest("[data-ast-acct]");
    if (!s) return;
    const it = month(ym).items.find((i) => i.id === s.closest(".ast-row").dataset.astId);
    if (it) { it.acct = s.value; astSave(); redraw(); }
  });
  rows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ast-del]");
    if (!b) return;
    const id = b.closest(".ast-row").dataset.astId, m = month(ym);
    m.items = m.items.filter((i) => i.id !== id);
    astSave(); redraw();
  });
  const cp = card.querySelector("[data-ast-copy]");
  if (cp) cp.addEventListener("click", () => {  // 지난 기록 종목·주 수·투자금을 그대로 (배당은 달마다 달라서 비워요)
    const p = astPrevYm(ym);
    month(ym).items = AST.months[p].items.map((i) => ({ ...i, id: astId(), div: 0 }));
    month(ym).cash = { ...(AST.months[p].cash || {}) };
    astSave(); lastTap = null; redraw();
  });
  const ts = card.querySelector("select[data-ast-to]");
  if (ts) ts.addEventListener("change", () => { astTo = ts.value; const r = $("#ast-res"); if (r) r.innerHTML = astResults(ym); });
  const q = $("#ast-q"), res = $("#ast-res");
  const refresh = () => { res.innerHTML = astResults(ym); };
  q.addEventListener("input", () => { astQuery = q.value; refresh(); });
  q.addEventListener("focus", () => { if (!SYM.kr || !SYM.us) loadSymbols().then(() => { if (astQuery && res.isConnected) refresh(); }); }, { once: true });
  if (astQuery && (!SYM.kr || !SYM.us)) loadSymbols().then(() => { if (res.isConnected) refresh(); });
  res.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ast-add]");
    if (!b) return;
    const [m, code] = [b.dataset.astAdd.slice(0, 2), b.dataset.astAdd.slice(3)];
    const mo = month(ym), had = mo.items.find((i) => i.acct === astTo && i.m === m && i.code === code);
    if (had) mo.items = mo.items.filter((i) => i !== had);  // 다시 누르면 빼요
    else {
      const e2 = (SYM[m] || []).find((x) => x.row[0] === code);
      mo.items.push({ id: astId(), acct: astTo, m, code, name: e2 ? e2.row[1] : code, qty: 0, cost: 0, div: 0 });
      if (astA(astTo)) { AST_BOPEN.add(astA(astTo).broker); astBSave(); }  // 넣은 종목이 보이게 그 증권사는 펼쳐요
    }
    astSave();
    // 넣은 종목 칸·요약·그림만 다시 그리고 검색창은 그대로 (위 칸이 늘어난 만큼 누른 버튼 자리에 맞춰요)
    holdHeight();
    rows.innerHTML = astRows(ym);
    live(); refresh();
    const cl = card.querySelector("[data-ast-clear]"); if (cl) cl.hidden = !astFilled(ym) && !mo.memo;
    keepTap();
  });
  // 증권사·계좌 추가·이름 바꾸기·빼기 (form submit: 버튼·폰 키보드 '완료'·엔터 모두)
  const ed = card.querySelector(".ast-acct-edit");
  if (ed) ed.addEventListener("toggle", () => { astEditOpen = ed.open; });
  const after = () => { astEditOpen = true; astSave(); redraw(); };
  // 이름 칸이 비어 있으면 그 칸으로 커서를 옮겨요 (전에는 '계좌 추가'를 눌러도 아무 반응이 없었어요)
  const val = (f) => { const v = String(f.querySelector("input").value || "").trim().slice(0, 20); if (!v) f.querySelector("input").focus({ preventScroll: true }); return v; };
  // 저장해도 바뀌는 게 없을 때: 이름 칸 옆에 말풍선으로 알려 줘요 (전에는 눌러도 아무 반응이 없었어요, 2026-11-20)
  const astSay = (f, msg) => { const i = f.querySelector("input"); i.setCustomValidity(msg); i.reportValidity(); i.addEventListener("input", () => i.setCustomValidity(""), { once: true }); };
  const addAcct = (broker, name) => {
    if (!broker || !name || AST.accts.some((a) => a.broker === broker && a.name === name)) return;
    const id = astId(), last = AST.accts.map((a) => a.broker).lastIndexOf(broker);
    AST.accts.splice(last < 0 ? AST.accts.length : last + 1, 0, { id, broker, name });  // 같은 증권사 끝에
    astTo = id; after();
  };
  card.querySelectorAll("[data-ast-new]").forEach((b) => b.addEventListener("click", () => addAcct(astBrokers()[+b.dataset.astB], b.dataset.astNew)));
  card.querySelectorAll("form[data-ast-new-go]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const b = astBrokers()[+f.dataset.astNewGo], n = val(f);
    if (n && AST.accts.some((a) => a.broker === b && a.name === n)) return astSay(f, "이 증권사에 같은 이름 계좌가 있어요");
    addAcct(b, n);
  }));
  const addBroker = (n) => { if (n && !astBrokers().includes(n)) addAcct(n, "일반 계좌"); };
  card.querySelectorAll("[data-ast-newb]").forEach((b) => b.addEventListener("click", () => addBroker(b.dataset.astNewb)));
  const nb = card.querySelector("form[data-ast-newb-go]");
  if (nb) nb.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = val(nb);
    if (n && astBrokers().includes(n)) return astSay(nb, "이미 있는 증권사예요");
    addBroker(n);
  });
  card.querySelectorAll("form[data-ast-brename]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const old = astBrokers()[+f.dataset.astBrename], nw = val(f);
    if (!nw) return;
    if (nw === old || astBrokers().includes(nw)) return astSay(f, nw === old ? "지금 이름과 같아요" : "이미 있는 증권사 이름이에요");
    AST.accts.forEach((a) => { if (a.broker === old) a.broker = nw; });
    after();
  }));
  card.querySelectorAll("form[data-ast-rename]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const a = astA(f.dataset.astRename), nw = val(f);
    if (!a || !nw) return;
    if (nw === a.name || AST.accts.some((x) => x !== a && x.broker === a.broker && x.name === nw)) return astSay(f, nw === a.name ? "지금 이름과 같아요" : "이 증권사에 같은 이름 계좌가 있어요");
    a.name = nw; after();
  }));
  card.querySelectorAll("[data-ast-drop]").forEach((b) => b.addEventListener("click", () => {
    const old = b.dataset.astDrop;
    AST.accts = AST.accts.filter((a) => a.id !== old);
    const to = AST.accts[0].id;
    Object.values(AST.months).forEach((mo) => {
      mo.items.forEach((it) => { if (it.acct === old) it.acct = to; });
      if (mo.cash && old in mo.cash) { mo.cash[to] = (+mo.cash[to] || 0) + (+mo.cash[old] || 0); delete mo.cash[old]; }
    });
    if (astTo === old) astTo = to;
    after();
  }));
  // 이 날 기록 지우기: 한 번 누르면 '한 번 더 누르면…', 3초 안에 다시
  const cl = card.querySelector("[data-ast-clear]");
  cl.addEventListener("click", () => {
    if (!cl.classList.contains("armed")) { cl.classList.add("armed"); setTimeout(() => cl.classList.remove("armed"), 3000); return; }
    delete AST.months[ym]; astSave(); lastTap = null; redraw();
  });
}

// ---------------------------------------------------------------- 배당 달력 (자산 기록 종목)
// 자산 기록에 적은 마지막 달 종목·주 수로 앞으로 12달 언제 얼마 들어올지 보여요 (사용자 2026-11-20 "2번도 하자").
// 자료: symbols/<시장>_returns.json 최근 12개월 [배당락 달, 1주당 배당] (returns.py, 야후 무료·매주) + 종목 자료(funds)의 배당락일·지급일.
// 받는 달은 짐작해요: 국장 주식 12월 배당락 → 다음 해 4월, 3·6·9월 → 2달 뒤, 그 밖 → 다음 달 / 국장 ETF → 다음 달 /
// 미장 → 지급일을 알면 배당락과의 차이, 모르면 같은 달. 세후 = 국장 15.4%, 미장 15% 뺀 값. 미장은 오늘 환율로 원화.
// 카드 오른쪽 위 '끄기'로 접어 둘 수 있어요 (이 폰에 기억, divcal_off). 등락 색은 안 써요 (자산 기록 규칙).
let dvOn = true, dvPick = null;
try { dvOn = localStorage.getItem("divcal_off") !== "1"; } catch (e) { /* 처음 */ }
const DV_TAX = { kr: 0.154, us: 0.15 };
const dvFx = () => +DATA.fx || 1350;
const dvEtf = (m, code, name) => {
  const r = symRow(m, code);
  return r ? r[3] === "e" : m === "kr" && /^(KODEX|TIGER|ACE|SOL|RISE|PLUS|HANARO|KBSTAR|ARIRANG|KOSEF|TIMEFOLIO|KIWOOM|WON|BNK|1Q|마이다스|에셋플러스)/i.test(name || "");
};
const dvEv = (m, code) => { const f = ((DATA.markets[m] || {}).funds || {})[code]; return (f && f.events) || null; };
const dvDay = (s, n = 0) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return d; };
const dvMd = (d) => `${d.getMonth() + 1}.${d.getDate()}`;
// 지금 들고 있는 것: 오늘까지 종목을 적은 마지막 기록의 종목, 같은 종목은 계좌를 넘어 주 수를 합쳐요
function dvHold() {
  const ym = astLastYm();
  const by = new Map();
  if (ym) AST.months[ym].items.forEach((i) => {
    const q = +i.qty || 0;
    if (!q || !i.code) return;
    const k = `${i.m}:${i.code}`, h = by.get(k) || { m: i.m, code: i.code, name: i.name || i.code, qty: 0 };
    h.qty += q; by.set(k, h);
  });
  return { ym, list: [...by.values()] };
}
// 최근 12개월 배당 → 1년 패턴. 매달 주는데 몇 달 빠졌으면 채우고, 분기 배당 3번이면 빠진 1번을 채워요.
// 한 번만 보통의 8배 넘게 튀면 야후 자료 오류일 때가 많아 보통 크기로 봐요 (fix에 표시).
// 단 종목 자료의 '최근 1회 배당금'(div_last)과 같으면 진짜로 보고 그대로 둬요
function dvHist(m, code) {
  const last = (dvEv(m, code) || {}).div_last;
  const r = RET[m] && RET[m][code], per = {};
  (r && Array.isArray(r[6]) ? r[6] : []).forEach(([mo, a]) => { if (mo >= 1 && mo <= 12 && a > 0) per[mo] = (per[mo] || 0) + a; });
  const ms = Object.keys(per).map(Number);
  if (!ms.length) return [];
  const vals = ms.map((k) => per[k]).sort((a, b) => a - b), low = vals[Math.floor((vals.length - 1) / 2)];
  const fix = new Set();
  if (ms.length >= 3) ms.forEach((k) => { if (per[k] > low * 8 && !(last && Math.abs(per[k] - last) <= per[k] * 0.05)) { per[k] = low; fix.add(k); } });
  if (ms.length >= 9) for (let k = 1; k <= 12; k++) if (!per[k]) per[k] = low;
  if (ms.length === 3 && ms.every((k) => k % 3 === ms[0] % 3)) for (let k = ms[0] % 3 || 3; k <= 12; k += 3) if (!per[k]) per[k] = low;
  return Object.keys(per).map(Number).sort((a, b) => a - b).map((k) => ({ ex: k, amt: per[k], fix: fix.has(k) }));
}
// 배당락 달 → 내 계좌에 들어오는 달까지 몇 달
function dvLag(h, ex) {
  if (h.m === "us") {
    const e = dvEv(h.m, h.code);
    if (e && e.exdiv && e.paydiv) {
      const a = dvDay(e.exdiv), b = dvDay(e.paydiv, 2);
      const g = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      if (g >= 0 && g <= 2) return g;
    }
    return 0;
  }
  if (dvEtf(h.m, h.code, h.name)) return 1;
  return ex === 12 ? 4 : ex % 3 === 0 ? 2 : 1;
}
// 앞으로 12달(이번 달부터): months [{ym, net, gross, rows:[{h, ex, amt, gross, net, sure, fix}]}], none = 배당 기록 없는 종목
function dvPlan(list) {
  const n = new Date(), today = TODAY();
  const months = Array.from({ length: 12 }, (_, k) => ({ ym: ymOf(new Date(n.getFullYear(), n.getMonth() + k, 1)), net: 0, gross: 0, rows: [] }));
  const none = [];
  list.forEach((h) => {
    const hist = dvHist(h.m, h.code);
    if (!hist.length) { none.push(h); return; }
    const e = dvEv(h.m, h.code) || {};
    hist.forEach(({ ex, amt, fix }) => {
      const rm = ((ex - 1 + dvLag(h, ex)) % 12) + 1, slot = months.find((x) => +x.ym.slice(5) === rm);
      const gross = amt * h.qty * (h.m === "us" ? dvFx() : 1), net = gross * (1 - DV_TAX[h.m]);
      // 확정: 앞으로 올 지급일(미장)이 이 칸 달이거나, 앞으로 올 배당락일이 이 배당락 달이면
      let sure = "";
      if (e.paydiv && e.paydiv >= today && ymOf(dvDay(e.paydiv, 2)) === slot.ym) sure = `지급 ${dvMd(dvDay(e.paydiv))} 확정`;
      else if (e.exdiv && e.exdiv >= today && +e.exdiv.slice(5, 7) === ex && e.exdiv.slice(0, 7) <= slot.ym) sure = `배당락 ${dvMd(dvDay(e.exdiv))} 확정`;
      slot.rows.push({ h, ex, amt, gross, net, sure, fix });
      slot.gross += gross; slot.net += net;
    });
  });
  months.forEach((x) => x.rows.sort((p, q) => q.net - p.net));
  return { months, none };
}
const dvPer = (h, amt) => (h.m === "us" ? `$${amt.toLocaleString("en-US", { maximumFractionDigits: 3 })}` : astWon(amt));
function divCalCard() {
  const head = (on) => `<h2 class="goal-h"><span>💰 배당 달력</span><span class="goal-h-r"><small>${on ? "예상" : "꺼짐"}</small>
    <button type="button" class="ast-btn dv-sw" data-dv-sw aria-pressed="${on}">${on ? "끄기" : "켜기"}</button></span></h2>`;
  if (!dvOn) return `<section class="card" id="dv-card">${head(false)}
    <p class="muted" style="margin:6px 0 0;font-size:13px">꺼 두었어요. 켜면 자산 기록 종목이 언제 배당을 주고 얼마 들어올지 달마다 보여요.</p></section>`;
  const { ym, list } = dvHold();
  if (!list.length) return `<section class="card" id="dv-card">${head(true)}
    <p class="muted" style="margin:6px 0 0;font-size:13px">위 자산 기록에 종목과 주 수를 적으면, 앞으로 12달 언제 배당이 얼마 들어올지 여기 달력에 나와요.</p></section>`;
  if (!RET.kr || !RET.us) return `<section class="card" id="dv-card">${head(true)}<p class="muted" style="margin:6px 0 0">배당 자료 불러오는 중…</p></section>`;
  const { months, none } = dvPlan(list);
  const total = months.reduce((a, x) => a + x.net, 0), max = Math.max(1, ...months.map((x) => x.net));
  const best = months.reduce((a, x) => (x.net > a.net ? x : a), months[0]);
  if (dvPick && !months.some((x) => x.ym === dvPick)) dvPick = null;
  const y0 = months[0].ym.slice(0, 4);
  const cells = months.map((x, k) => `<button type="button" class="ast-cell dv-cell${x.net ? " has" : ""}${k === 0 ? " now" : ""}" data-dv-m="${x.ym}" aria-pressed="${dvPick === x.ym}">
      <span class="ast-mn">${+x.ym.slice(5)}월${x.ym.slice(0, 4) !== y0 ? ` <small class="muted">'${x.ym.slice(2, 4)}</small>` : ""}</span>
      ${x.net ? `<b>${astDivW(x.net)}</b><small class="muted">${x.rows.length}건${x.rows.some((r) => r.sure) ? " · 확정 있음" : ""}</small>
        <i class="ast-bar" style="width:${Math.max(6, (x.net / max) * 100)}%"></i>` : `<small class="muted">없음</small>`}</button>`).join("");
  const pick = dvPick && months.find((x) => x.ym === dvPick);
  const detail = pick ? `<div class="dv-detail"><h3>${ymName(pick.ym)} 들어올 배당 <small class="muted">세후 ${astWon(pick.net)}</small></h3>
      ${pick.rows.length ? `<ul class="ast-mix">${pick.rows.map((r) => `<li><div class="ast-mix-t"><b>${esc(r.h.name)}</b><span>${astWon(r.net)}</span></div>
        <small class="muted dv-sub">${astQty(r.h.qty)} × 1주 ${dvPer(r.h, r.amt)}${r.fix ? " (튀는 값이라 보통 크기로 봄)" : ""} · ${r.ex}월 배당락 · <span class="dv-tag${r.sure ? " sure" : ""}">${r.sure || "예상"}</span></small></li>`).join("")}</ul>`
        : `<p class="muted" style="margin:8px 0 0">이 달엔 들어올 배당이 없어요.</p>`}</div>` : "";
  return `<section class="card" id="dv-card">${head(true)}
    <div class="sav-hero ast-hero"><div class="ast-tile dv-tile"><small>앞으로 12달 (세후)</small><b>${astDivW(total)}</b></div>
      <div class="ast-tile dv-tile"><small>한 달 평균</small><b>${astDivW(total / 12)}</b></div>
      <div class="ast-tile dv-tile"><small>가장 많은 달</small><b>${best.net ? `${+best.ym.slice(5)}월 ${astDivW(best.net)}` : "-"}</b></div>
      <div class="ast-tile dv-tile"><small>배당 주는 종목</small><b>${list.length - none.length} / ${list.length}개</b></div></div>
    <div class="ast-grid">${cells}</div>${detail}
    ${none.length ? `<p class="muted" style="margin:10px 0 0;font-size:12px">최근 1년 배당 기록 없음: ${none.map((h) => esc(h.name)).join(", ")}</p>` : ""}
    <p class="muted note" style="margin:10px 0 0">${astDayName(ym)} 자산 기록 종목·주 수 기준이에요. 달을 누르면 종목별로 나와요. 최근 1년 배당을 그대로 다시 준다고 보고, 받는 달은 짐작한 거라 '예상'이에요 (국장 12월 배당은 보통 다음 해 4월, 분기 배당은 2달 뒤). 회사가 배당을 바꾸면 달라져요.
      세후 = 국장 15.4%, 미장 15% 뺀 값 (ISA·연금 계좌는 달라요). 미장은 환율 ${num(dvFx())}원으로 계산. 자료: 야후 파이낸스(무료).</p></section>`;
}
function dvRefresh() {
  const c = $("#dv-card");
  if (!c) return;
  c.outerHTML = divCalCard();
  bindDivCal();
}
function bindDivCal() {
  const card = $("#dv-card");
  if (!card) return;
  if (dvOn && (!RET.kr || !RET.us)) loadReturns().then(() => { if (screen === "tools") dvRefresh(); });
  const redraw = () => { holdHeight(); dvRefresh(); keepTap(); };
  card.querySelector("[data-dv-sw]").addEventListener("click", () => {
    dvOn = !dvOn; dvPick = null;
    remember("divcal_off", dvOn ? "0" : "1");
    redraw();
  });
  card.querySelectorAll("[data-dv-m]").forEach((b) => b.addEventListener("click", () => {
    dvPick = dvPick === b.dataset.dvM ? null : b.dataset.dvM;
    redraw();
  }));
}
