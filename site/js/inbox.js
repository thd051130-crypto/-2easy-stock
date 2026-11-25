"use strict";
// ---------------------------------------------------------------- 메시지함
// 텔레그램으로 보낸 알림(오늘의 리포트·경기·큰 발표·가격 알림·주간 점검)을 앱에서도 봐요.
// inbox.json은 열 때만 받아요 (dashboard.py가 paper/inbox/ 최근 60일로 만들어요). 명령에 대한 봇 답장은 빼요.
// 안 읽은 알림: data.json의 inbox_last가 이 폰에서 마지막으로 본 시각보다 새로우면 버튼에 빨간 점.
let INBOX = null, inboxLoading = null, inboxOpen = null;
let inboxSeen = "";
try { inboxSeen = localStorage.getItem("inbox_seen") || ""; } catch (e) { /* 저장소를 못 쓰면 매번 새것 */ }
function loadInbox() {
  if (!inboxLoading) {
    inboxLoading = fetch(`inbox.json?t=${DATA ? DATA.built : Date.now()}`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { INBOX = (x && x.items) || []; });
  }
  return inboxLoading;
}
// 메시지함 버튼: 평소엔 오른쪽 가장자리 얇은 손잡이라 글자를 안 가려요 (사용자 2026-10-24, 폰 엣지 패널처럼).
// 손잡이를 누르거나 왼쪽으로 밀면 동그란 버튼이 나오고, 그걸 누르면 메시지함(열려 있으면 닫기). 오른쪽으로 밀거나 4초 지나면 다시 숨어요.
// 위아래로 끌면 옮겨지고, 위치는 이 폰에 기억해요 (화면 높이 비율). 키보드로 누르면 바로 열어요.
function inboxHandle(b) {
  let out = false, timer = 0, y = NaN, drag = null;
  try { y = parseFloat(localStorage.getItem("inbox_y")); } catch (e) { /* 기본 위치 */ }
  const range = () => {
    const top = ($(".top") || { offsetHeight: 60 }).offsetHeight + 12;
    return [top, window.innerHeight - ($(".nav") || { offsetHeight: 60 }).offsetHeight - 60];
  };
  const clamp = (t) => { const [lo, hi] = range(); return Math.min(Math.max(t, lo), Math.max(lo, hi)); };
  const place = () => { b.style.top = `${clamp(Number.isFinite(y) ? y * window.innerHeight : Infinity)}px`; };
  const set = (o) => {
    out = o;
    b.classList.toggle("tucked", !o);
    clearTimeout(timer);
    if (o) timer = setTimeout(() => set(false), 4000);
  };
  const open = () => { set(false); if (screen === "inbox") back(); else go("inbox"); };
  place();
  window.addEventListener("resize", place);
  b.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, top: b.offsetTop, moved: false, swiped: false };
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* 그냥 진행 */ }
  });
  b.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && !drag.swiped && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag.moved = true; b.classList.add("dragging"); clearTimeout(timer); }
    if (drag.moved) { b.style.top = `${clamp(drag.top + dy)}px`; e.preventDefault(); return; }
    if (!drag.swiped && dx < -14 && !out) { drag.swiped = true; set(true); }
    else if (!drag.swiped && dx > 14 && out) { drag.swiped = true; set(false); }
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    b.classList.remove("dragging");
    if (d.moved) {
      y = b.offsetTop / window.innerHeight;
      remember("inbox_y", y.toFixed(4));
      if (out) set(true);  // 옮긴 뒤 4초 다시 세기
      return;
    }
    if (d.swiped || e.type === "pointercancel") return;
    if (!out && screen !== "inbox") set(true); else open();
  };
  b.addEventListener("pointerup", end);
  b.addEventListener("pointercancel", end);
  b.addEventListener("click", (e) => { if (e.detail === 0) open(); });  // 키보드(Enter·Space)로 누를 때
}
function inboxDot() {
  const b = $(".inbox-btn");
  if (!b) return;
  if (screen === "inbox") b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  const last = DATA && DATA.inbox_last;
  b.querySelector(".unread").hidden = !(last && last > inboxSeen && screen !== "inbox");
}
// 텔레그램 HTML(굵게·기울임·링크·눌러서 펼치기)만 살리고 나머지 태그는 글자로. 펼치기는 <details>로 바꿔요
function tgHtml(html) {
  return String(html || "").split(/(<[^>]*>)/).map((part) => {
    if (!part.startsWith("<")) return part;  // 글자는 보낼 때 이미 이스케이프돼 있어요
    const t = part.toLowerCase();
    if (/^<\/?(b|i)>$/.test(t)) return t;
    if (t === "<blockquote expandable>" || t === "<blockquote>") return `<details><summary>자세히</summary><div>`;
    if (t === "</blockquote>") return "</div></details>";
    const a = part.match(/^<a href="(https?:[^"]*)">$/i);
    if (a) return `<a href="${a[1]}" target="_blank" rel="noopener">`;
    if (t === "</a>") return "</a>";
    return esc(part);
  }).join("").replace(/\n*<details>/g, "<details>").replace(/<\/details>\n+/g, "</details>");  // 접기 앞뒤 빈 줄은 빼요
}
const msgTime = (t) => t.slice(11, 16);
function msgDay(t) {
  const wd = new Date(`${t.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return `${Number(t.slice(5, 7))}.${Number(t.slice(8, 10))}(${"일월화수목금토"[wd]})`;
}
// 오늘의 리포트 (report_desks.py, paper/report.json): 다섯 팀이 앞 팀 자료를 넘겨받아 만든 한 장.
// 뉴스팀 → 시장팀 → 일정·정책팀 → 업종팀 → 종목팀 → 편집팀. 사고팔기 판단은 안 해요 (사용자 2026-10-24).
const REPORT_FLAG = { kr: "🇰🇷", us: "🇺🇸" };
const rpChg = (x, d = 1) => (x == null ? "-" : `<span class="${sign(x)}">${pct(x, d)}</span>`);
const rpTone = (t) => `<span class="badge${t === "강함" ? " good" : t === "약함" ? " bad" : ""}">${esc(t)}</span>`;
function reportDay() {
  const r = DATA.report;
  return r ? `${md(r.day)} ${esc((r.generated || "").slice(11, 16))}` : "";
}
function homeReportCard() {
  const r = DATA.report;
  if (!r) return `<section class="card"><h2>📰 오늘의 리포트</h2><p class="empty">아직 리포트가 없어요. ${NEXT_RUN[market]} 장 마감 뒤 자동으로 만들어요.</p>
    ${goalLine()}${healthLine()}</section>`;
  return `<section class="card"><h2>📰 오늘의 리포트 <small>${reportDay()} 기준</small></h2>
    <ul class="brief brief-top">${(r.headline || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    ${goalLine()}${healthLine()}${more("report", "리포트 자세히 보기")}${weeklyLine()}</section>`;
}
function rpSection(icon, title, sub, rows) {
  return rows.length ? `<section class="card"><h2>${icon} ${title} <small>${sub}</small></h2><ul class="brief">${rows.map((x) => `<li>${x}</li>`).join("")}</ul></section>` : "";
}
function reportCards(d) {
  const r = DATA.report;
  if (!r) return [homeReportCard()];
  const m = r.market || {}, p = r.policy || {}, sec = (r.sectors || {})[market], st = (r.stocks || {})[market];
  const flag = REPORT_FLAG[market], tone = (m.markets || {})[market];
  const head = `<section class="card"><h2>📰 오늘의 리포트 <small>${reportDay()} 기준</small></h2>
    <ul class="brief brief-top">${(r.headline || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <details class="brief-more"><summary>자료가 팀 사이로 넘어간 흐름</summary>
      <ol class="rp-chain">${(r.chain || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details></section>`;
  const facts = (m.facts || []).map((f) => f.kind === "rate" ? `<b>${esc(f.name)}</b> ${f.last.toFixed(2)}% <small class="muted">${f.d1 > 0 ? "+" : ""}${(f.d1 || 0).toFixed(2)}%p · 1달 ${f.m1 == null ? "-" : `${f.m1 > 0 ? "+" : ""}${f.m1.toFixed(2)}%p`}</small>` : `<b>${esc(f.name)}</b> ${f.kind === "krw" ? `${num(f.last)}원` : (f.last || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
    ${rpChg(f.d1, 2)} <small class="muted">1달 ${pct(f.m1)}</small>`)
    .map((x, i) => { const f = m.facts[i]; return f.day && f.day !== r.day ? `${x} <small class="muted">· ${md(f.day)} 종가</small>` : x; });
  if (tone) facts.unshift(`${flag} ${market === "kr" ? "국장" : "미장"} 분위기 ${rpTone(tone.tone)} <small class="muted">${esc(tone.index)} 1주 ${pct(tone.w1)} · 1달 ${pct(tone.m1)}</small>`);
  if (m.regime) facts.push(`경기 판정 <b>${esc(m.regime)}</b> <small class="muted">경고 ${esc(m.macro_score)}</small>`);
  (m.warns || []).forEach((w) => facts.push(`⚠️ <b>${esc(w.name)}</b> <small class="muted">${esc(w.now)} → 일정·정책팀에 넘김</small>`));
  const plan = [
    ...(p.big || []).slice(0, 6).map((e) => `${md(e.date)} ${esc(e.time)} ${e.flag || ""} <b>${esc(e.title)}</b>${e.forecast ? ` <small class="muted">예상 ${esc(e.forecast)}</small>` : ""}`),
    ...(p.earn || []).filter((e) => e.market === market).slice(0, 5).map((e) => `${md(e.date)} ${esc(e.title)}${e.mine ? " ⭐" : ""}`),
    ...(p.caution ? [`⚠️ ${esc(p.caution)}`] : []),
    ...((p.sectors || {})[market] || []).filter((x) => x.score).slice(0, 6).map((x) => `<b>${esc(x.sector)}</b> <span class="${x.score > 0 ? "up" : "down"}">${x.score > 0 ? "+" : ""}${x.score}</span>
      <small class="muted">${esc([...x.good, ...x.bad].slice(0, 2).join(" · "))}</small>`),
  ];
  const secRow = (label, x) => `${label} <b>${esc(x.name)}</b> ${rpChg(x.r5)} <small class="muted">20일 ${pct(x.r20)}${x.match ? ` · 정책·경기 ${x.tilt > 0 ? "+" : ""}${x.tilt} ${esc(x.match)}` : ""}</small>`;
  const secs = sec ? [...sec.strong.map((x) => secRow("상위", x)), ...sec.gap.map((x) => secRow("정책·경기와 반대", x)),
    ...sec.weak.map((x) => secRow("하위", x)), ...(sec.next.length ? [`<small class="muted">연결 산업: ${esc(sec.next.join(", "))}</small>`] : [])] : [];
  const stocks = st ? [...st.picks.map((x) => `<span data-stock="${esc(x.code)}" role="button"><b>${esc(x.name)}</b></span> <small class="muted">${esc(x.sector)}</small>
      ${rpChg(x.r5)}${x.notes.length ? `<br><small class="muted">${esc(x.notes.join(" · "))}</small>` : ""}`),
    ...st.quiet.map((q) => `🔍 <b>${esc(q.name)}</b> <small class="muted">주가 그대로(${pct(q.r5)})인데 거래량 ${q.ratio.toFixed(1)}배</small>`)] : [];
  // 뉴스팀 (2026-11-24 사용자 "젠슨 황 복귀로 폭등했는데 리포트에 싹 빠져 있다"): 언론이 많이 다룬 사건, 왜 움직였나
  const news = ((r.news || {})[market] || []).map((x) => `${/^https:\/\//.test(x.link || "") ? `<a href="${esc(x.link)}" target="_blank" rel="noopener"><b>${esc(x.title)}</b></a>` : `<b>${esc(x.title)}</b>`}
    <small class="muted">언론 ${x.sources}곳${x.topic ? ` · ${esc(x.topic)}` : ""}</small>`);
  return [head, rpSection("📰", "0. 뉴스팀", `${flag} 언론이 많이 다룬 사건 → 분석팀`, news), storyCard("report"),
    rpSection("🌏", "1. 시장팀", "지수·환율·경기 → 일정·정책팀", facts),
    rpSection("🗓", "2. 일정·정책팀", "7일 일정·업종 점수 → 업종팀", plan),
    rpSection("🏭", "3. 업종팀", `${flag} 5일 흐름과 정책 비교 → 종목팀`, secs),
    rpSection("🔎", "4. 종목팀", `${flag} 볼 업종 안의 종목`, stocks),
    `<section class="card"><p class="muted" style="margin:0">✍️ 분석팀이 숫자를 '원인 → 결과'로 잇고, 편집팀이 다섯 팀 자료를 묶어 맨 위 요약을 만들어요. 공개 자료로 만든 참고용 리포트예요.
      사고팔기 판단은 안 해요. 위 국장·미장 탭으로 업종·종목을 바꿔 봐요.</p>
      <button type="button" class="more" data-more="learn">📚 리포트에 나온 말과 원인 공부하기<span aria-hidden="true">›</span></button></section>`];
}
// 주간 리포트 (weekly.py, paper/weekly.json): 토요일 아침 한 주를 한 장으로. 리포트 화면 맨 위 '오늘·주간' 버튼으로 바꿔 봐요.
// 주말·월요일엔 새 주간 리포트가 있으면 처음부터 주간을 보여 줘요 (사용자 2026-10-24 '주간리포트로 하고')
let rpTab = null;
function weeklyFresh() {
  const w = DATA.weekly;
  if (!w || !w.day) return false;
  const age = (Date.now() - new Date(`${w.day}T09:00:00+09:00`).getTime()) / 864e5;
  return age >= 0 && age < 3;
}
function rpTabNow() {
  if (rpTab === "past" && DATA.reports_n) return "past";
  if (!DATA.weekly) return "day";
  if (rpTab && rpTab !== "past") return rpTab;
  return weeklyFresh() || !DATA.report ? "week" : "day";
}
function rpTabsBar() {
  const tabs = [["day", "📰 오늘의 리포트"], ...(DATA.weekly ? [["week", "🗞 주간 리포트"]] : []), ...(DATA.reports_n ? [["past", "📅 지난 리포트"]] : [])];
  if (tabs.length < 2) return "";
  const cur = rpTabNow();
  return `<nav class="chips rp-tabs" aria-label="리포트 고르기">${tabs.map(([k, label]) =>
    `<button type="button" data-rp-tab="${k}" aria-pressed="${k === cur}">${label}</button>`).join("")}</nav>`;
}
// 지난 리포트 (report_archive.py → _site/reports/): 만들 때마다 한 장씩 따로 남긴 오늘의 리포트·주간 리포트를 달력으로 (사용자 2026-11-17)
// 목록(index.json)은 탭을 열 때만, 리포트 한 장은 날짜를 누를 때만 받아요. 날짜를 눌러도 달력은 제자리, 아래 리포트만 바뀌어요
let PAST = null, pastLoading = null, pastMonth = null, pastDay = null, pastFile = null;
const PAST_DOC = {}, PAST_KIND = { kr: ["🇰🇷", "국장 마감 뒤"], us: ["🇺🇸", "미장 마감 뒤"], both: ["🇰🇷🇺🇸", "국장·미장"] };
function loadPast() {
  if (!pastLoading) {
    pastLoading = fetch(`reports/index.json?t=${DATA ? DATA.built : Date.now()}`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { PAST = (x && x.items) || []; if (screen === "report") render(); });
  }
  return pastLoading;
}
function loadPastDoc(f) {
  if (PAST_DOC[f]) return;
  PAST_DOC[f] = "loading";
  fetch(`reports/${f}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((x) => { PAST_DOC[f] = x || "fail"; if (screen === "report") render(); });
}
const PAST_ORDER = ["🇰🇷", "🇰🇷🇺🇸", "🇺🇸", "📰", "🗞"];
const pastMark = (e) => (e.k === "weekly" ? "🗞" : (PAST_KIND[e.m] || ["📰"])[0]);
const pastLabel = (e) => (e.k === "weekly" ? "🗞 주간 리포트" : e.m && PAST_KIND[e.m] ? `${PAST_KIND[e.m][0]} ${PAST_KIND[e.m][1]}` : "📰 오늘의 리포트");
// 그날 고를 리포트: 고른 게 없으면 지금 국장·미장 탭에 맞는 것 → 아니면 그날 마지막 것
function pastPick(list) {
  const hit = list.find((e) => e.f === pastFile);
  if (hit) return hit;
  return list.find((e) => e.k === "daily" && (e.m === market || e.m === "both")) || list[0];
}
function pastCards(d) {
  if (!PAST) {
    loadPast();
    return [`<section class="card past-card"><h2>📅 지난 리포트</h2><p class="empty">보관함을 불러오는 중이에요…</p></section>`];
  }
  if (!PAST.length) return [`<section class="card past-card"><h2>📅 지난 리포트</h2><p class="empty">아직 보관된 리포트가 없어요. 리포트를 만들 때마다 한 장씩 쌓여요.</p></section>`];
  const byDay = {};
  PAST.forEach((e) => (byDay[e.d] = byDay[e.d] || []).push(e));
  const days = Object.keys(byDay).sort(), first = days[0].slice(0, 7), last = days[days.length - 1].slice(0, 7);
  if (!pastMonth || pastMonth < first || pastMonth > last) pastMonth = last;
  if (!pastDay || !byDay[pastDay]) pastDay = days[days.length - 1];
  const [y, m] = pastMonth.split("-").map(Number), today = TODAY();
  // 월~일 일곱 칸 (주간 리포트가 토요일에 나와서 주말도 보여요)
  const firstD = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = `<span class="cal-cell blank"></span>`.repeat((firstD.getUTCDay() + 6) % 7);
  for (let dd = 1; dd <= dim; dd++) {
    const key = `${pastMonth}-${String(dd).padStart(2, "0")}`, list = byDay[key] || [];
    const marks = [...new Set(list.map(pastMark))].sort((a, b) => PAST_ORDER.indexOf(a) - PAST_ORDER.indexOf(b)).join("");  // 늘 🇰🇷 → 🇺🇸 → 🗞 순서
    const cls = ["cal-cell", "past-cell", list.length ? "" : "off", key === today ? "today" : "", pastDay === key ? "picked" : ""].filter(Boolean).join(" ");
    cells += list.length ? `<button type="button" class="${cls}" data-pastday="${key}" aria-label="${m}월 ${dd}일 리포트 ${list.length}장" aria-pressed="${pastDay === key}">
      <span class="cd">${dd}</span><span class="em">${marks}</span></button>`
      : `<span class="${cls}" aria-hidden="true"><span class="cd">${dd}</span><span class="em"></span></span>`;
  }
  const nMonth = PAST.filter((e) => e.d.startsWith(pastMonth)).length;
  const list = byDay[pastDay] || [], pick = pastPick(list);
  const cal = `<section class="card past-card" id="past-card"><h2>📅 지난 리포트 <small>보관 ${PAST.length}장 · ${md(days[0])}부터</small></h2>
    <div class="cal-head"><button type="button" class="cal-nav" data-paststep="-1" aria-label="이전 달" ${pastMonth <= first ? "disabled" : ""}>‹</button>
      <div><b>${y}년 ${m}월</b><small>${nMonth ? `리포트 ${nMonth}장 · 날짜를 누르면 그날 리포트` : "이달엔 보관된 리포트가 없어요"}</small></div>
      <button type="button" class="cal-nav" data-paststep="1" aria-label="다음 달" ${pastMonth >= last ? "disabled" : ""}>›</button></div>
    <div class="cal-grid past-grid">${"월화수목금토일".split("").map((w) => `<span class="cal-w">${w}</span>`).join("")}${cells}</div>
    <p class="past-legend muted">🇰🇷 국장 마감 뒤 · 🇺🇸 미장 마감 뒤 · 🗞 주간 리포트</p></section>`;
  // 맨 위는 고른 날 리포트, 달력은 맨 아래 (사용자 2026-11-18 '당일게 위로 오고 달력이 밑으로')
  const top = `<section class="card past-top"><h2>📅 ${wkDay(pastDay)} 리포트 <small>${list.length}장</small></h2>
    <div class="chips past-pick" aria-label="그날 리포트 고르기">${list.slice().reverse().map((e) => `<button type="button" data-pastfile="${esc(e.f)}" aria-pressed="${e === pick}">${pastLabel(e)} <small>${esc(e.t)}</small></button>`).join("")}</div>
    <button type="button" class="more" data-past-cal>📅 다른 날 보기 <small class="muted">맨 아래 달력</small><span aria-hidden="true">›</span></button></section>`;
  return [top, ...pastDocCards(d, pick), cal];
}
function pastDocCards(d, e) {
  const doc = PAST_DOC[e.f];
  if (!doc || doc === "loading") { loadPastDoc(e.f); return [`<section class="card past-doc"><p class="empty">리포트를 불러오는 중이에요…</p></section>`]; }
  if (doc === "fail") return [`<section class="card past-doc"><p class="empty">이 리포트를 못 불러왔어요. 잠시 뒤 다시 눌러 주세요.</p></section>`];
  // 화면 그리는 함수는 그대로 쓰고, 그동안만 그날 리포트로 바꿔 끼워요
  const key = e.k === "weekly" ? "weekly" : "report", keep = DATA[key];
  DATA[key] = doc;
  let cards;
  try {
    cards = e.k === "weekly" ? weeklyCards() : reportCards(d);
  } catch (err) {  // 아주 예전 형식이라 칸 일부가 없을 때는 요약만
    cards = [`<section class="card"><h2>📰 지난 리포트 <small>${md(doc.day)} ${esc((doc.generated || "").slice(11, 16))}</small></h2>
      <ul class="brief brief-top">${(doc.headline || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="muted note">예전 형식 리포트라 요약만 보여요.</p></section>`];
  } finally {
    DATA[key] = keep;
  }
  if (e.k !== "weekly") cards[0] = cards[0].replace("📰 오늘의 리포트", `📰 ${wkDay(e.d)} 리포트`);
  return cards.map((c, i) => (i === 0 ? c.replace('<section class="card', '<section class="card past-doc') : c));
}
function bindPast() {
  const app = $("#app");
  app.querySelectorAll("[data-paststep]").forEach((b) => b.addEventListener("click", () => {
    // 달만 넘겨요 (위 리포트는 그대로라 달력이 제자리). 달력 칸 수가 바뀌어도 아래쪽만 늘고 줄어요
    pastMonth = ymAdd(pastMonth, Number(b.dataset.paststep));
    render();
  }));
  // 날짜를 누르면 그날 리포트가 맨 위에 오니까, 맨 위로 올라가서 바로 보여 줘요 (화면을 바꾸는 버튼)
  app.querySelectorAll("[data-pastday]").forEach((b) => b.addEventListener("click", () => {
    pastDay = b.dataset.pastday; pastFile = null;
    lastTap = null;  // 누른 날짜 칸 자리로 되돌리지 않게
    render();
    window.scrollTo(0, 0);  // 바로 (부드럽게 올리면 리포트를 받아 다시 그릴 때 중간에서 멈춰요)
  }));
  app.querySelectorAll("[data-past-cal]").forEach((b) => b.addEventListener("click", () => {
    const c = $("#past-card");
    if (c) window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - (($(".top") || { offsetHeight: 0 }).offsetHeight + 8), behavior: calm() ? "auto" : "smooth" });
  }));
  app.querySelectorAll("[data-pastfile]").forEach((b) => b.addEventListener("click", () => { pastFile = b.dataset.pastfile; render(); }));
}
const wkDay = (day) => { const d = new Date(`${day.slice(0, 10)}T12:00:00Z`); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${"일월화수목금토"[d.getUTCDay()]})`; };
const wkRange = (w) => (w && w.week ? `${md(w.week[0])}~${md(w.week[1])}` : "");
function weeklyLine() {
  const w = DATA.weekly;
  return w && weeklyFresh() ? `<button type="button" class="more" data-rp-week>🗞 주간 리포트 보기 <small class="muted">${wkRange(w)}</small><span aria-hidden="true">›</span></button>` : "";
}
function weeklyCards() {
  const w = DATA.weekly;
  if (!w) return [`<section class="card"><p class="empty">아직 주간 리포트가 없어요. 토요일 아침에 만들어요.</p></section>`];
  const flag = REPORT_FLAG[market], ix = w.index || {}, sec = (w.sectors || {})[market];
  const ev = w.events || {}, nx = w.next || {};
  const facts = ix.facts || [], fact = (n) => facts.find((f) => f.name === n);
  const big = ["코스피", "코스닥", "S&P500", "나스닥"].map(fact).filter(Boolean);
  const chip = (v, d = 1) => `<span class="wk-pill ${sign(v)}">${pct(v, d)}</span>`;
  // 1. 한눈에: 큰 지수 네 개 1주 등락 + 요일별 막대 + 세 줄 요약
  const tiles = big.map((f) => `<div class="wk-tile ${sign(f.w1)}"><span>${esc(f.name)}</span><b>${pct(f.w1)}</b>
    <small>${(f.last || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} · 1달 ${pct(f.m1)}</small></div>`).join("");
  const dm = (ix.days || {})[market];
  const peak = dm && dm.days.length ? Math.max(...dm.days.map(([, v]) => Math.abs(v)), 0.005) : 1;
  const days = dm && dm.days.length ? `<p class="wk-sub">${flag} ${esc(dm.index)} 요일별</p><div class="wk-days" role="img" aria-label="${esc(dm.index)} 요일별 등락">${dm.days.map(([d, v]) =>
    `<div class="wk-day"><div class="wk-col"><i class="${sign(v)}" style="height:${(Math.abs(v) / peak * 100).toFixed(0)}%;${v < 0 ? "top:50%" : "bottom:50%"}"></i></div><b class="${sign(v)}">${pct(v)}</b><span>${esc(d)}</span></div>`).join("")}</div>` : "";
  const icons = ["🏭", "🗓", "⚡"];  // 첫 줄(지수)은 위 타일과 같아서 빼요
  const head = `<section class="card wk-hero"><h2>🗞 주간 리포트 <small>${wkRange(w)}</small></h2>
    <div class="wk-tiles">${tiles}</div>${days}
    <ul class="wk-sum">${(w.headline || []).filter((x) => !x.startsWith("이번 주:")).map((x, i) => `<li><span aria-hidden="true">${icons[i] || "•"}</span><p>${esc(x)}</p></li>`).join("")}</ul></section>`;
  // 2. 나머지 지표: 두 줄 격자
  const rest = facts.filter((f) => !big.includes(f)).map((f) => {
    const val = f.kind === "rate" ? `${f.last.toFixed(2)}%` : f.kind === "krw" ? `${num(f.last)}원` : (f.last || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    const chg = f.kind === "rate" ? `<span class="wk-pill ${sign(f.w1)}">${f.w1 == null ? "-" : `${f.w1 > 0 ? "+" : ""}${f.w1.toFixed(2)}%p`}</span>` : chip(f.w1);
    return `<div class="wk-cell"><span>${esc(f.name.replace(/ \(.+\)$/, ""))}</span><b>${val}</b>${chg}</div>`;
  }).join("");
  const restCard = rest ? `<section class="card"><h2>🌏 다른 지표 <small>1주 등락</small></h2><div class="wk-grid">${rest}</div></section>` : "";
  // 3. 업종: 0을 가운데 둔 막대
  const rows = sec ? [...sec.up, ...sec.down.slice().reverse()] : [];
  const top = Math.max(...rows.map((x) => Math.abs(x.r5 || 0)), 0.01);
  const secCard = rows.length ? `<section class="card"><h2>🏭 이번 주 업종 <small>${flag} 5일 상위·하위</small></h2>
    <ul class="wk-bars">${rows.map((x, i) => `${i === sec.up.length ? `<li class="wk-gap" aria-hidden="true"></li>` : ""}<li><div class="wk-bl"><b>${esc(x.name)}</b><small>${esc((x.r5 >= 0 ? x.best : x.worst) || "")}</small></div>
      <div class="wk-track"><i class="${sign(x.r5)}" style="width:${(Math.abs(x.r5) / top * 50).toFixed(1)}%"></i></div><b class="wk-bv ${sign(x.r5)}">${pct(x.r5)}</b></li>`).join("")}</ul></section>` : "";
  // 5. 사건: 시간 줄
  const tl = [...(ev.shocks || []).slice(0, 5).map((s) => ({ t: s.at, h: `⚡ <b>${esc(s.label)}</b> 급변 ${chip(s.move)}`, sub: s.news })),
    ...(ev.done || []).slice(0, 8).map((e) => ({ t: e.date, h: `${e.flag || ""} <b>${esc(e.title)}</b>${e.actual ? ` 실제 ${esc(e.actual)}` : ""}`, sub: e.forecast ? `예상 ${e.forecast}` : "" }))]
    .sort((a, b) => (a.t < b.t ? -1 : 1));
  const reg = ev.regime ? `<p class="wk-reg">🌡️ 경기 판정 <b>${esc(ev.regime)}</b>${ev.prev_regime && ev.prev_regime !== ev.regime ? ` <span class="badge bad">${esc(ev.prev_regime)}에서 바뀜</span>` : ` <span class="badge">그대로</span>`}${(ev.warns || []).length ? `<br><small class="muted">⚠️ ${esc(ev.warns.join(", "))}</small>` : ""}</p>` : "";
  const evCard = `<section class="card"><h2>⚡ 이번 주 사건 <small>지수 급변·발표 결과</small></h2>
    ${tl.length ? `<ol class="wk-tl">${tl.map((x) => `<li><time>${wkDay(x.t)}${x.t.length > 10 ? `<br>${esc(x.t.slice(11, 16))}` : ""}</time><div>${x.h}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</div></li>`).join("")}</ol>` : `<p class="empty">큰 사건 없음</p>`}${reg}</section>`;
  // 5-2. 이번 주 이슈: 한 주 동안 언론 여러 곳이 다룬 핫 뉴스 (경영자 사임·스캔들처럼 숫자 없는 사건도, 사용자 2026-11-15)
  const iss = (ev.issues || {})[market] || [];
  const issLink = (x) => /^https:\/\//.test(x.link || "") ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title);
  const issCard = ev.issues ? `<section class="card"><h2>🔥 이번 주 이슈 <small>${flag} 언론 여러 곳이 다룬 뉴스</small></h2>
    ${iss.length ? `<ol class="wk-tl">${iss.map((x) => `<li><time>${x.ongoing ? "지난주<br>부터" : wkDay(x.since || "")}</time><div>${badTag(x)}${x.topic ? `<span class="badge">${esc(x.topic)}</span> ` : ""}${issLink(x)}
      <small>언론 ${x.sources}곳${x.source ? ` · ${esc(x.source)}` : ""}${x.more ? ` · 비슷한 기사 묶음 ${x.more + 1}개` : ""}</small></div></li>`).join("")}</ol>` : `<p class="empty">이번 주엔 여러 언론이 같이 다룬 뉴스가 없어요</p>`}</section>` : "";
  // 6. 다음 주: 요일별 묶음 + 종류 표시
  const TAG = { big: ["발표", ""], rate: ["금리", "bad"], expiry: ["만기", ""], earn: ["실적", "good"], risk: ["⚠️ 리스크", "bad"], index: ["정기변경", ""], holiday: ["휴장", ""], divday: ["배당락", ""] };
  const items = [...(nx.big || []).map((e) => ({ d: e.date, k: "big", h: `${e.flag || ""} ${esc(e.title)}`, sub: [e.time, e.forecast ? `예상 ${e.forecast}` : ""].filter(Boolean).join(" · ") })),
    ...(nx.cal || []).map((c) => ({ d: c.date, k: c.kind, h: `${REPORT_FLAG[c.market] || ""} ${esc(c.title)}`, sub: c.note || "" })),
    ...(nx.earn || []).filter((c) => c.market === market).slice(0, 8).map((c) => ({ d: c.date, k: "earn", h: `${esc(c.title.replace(/ 실적 발표$/, ""))}${c.mine ? " ⭐" : ""}`, sub: "" }))];
  const byDay = {};
  items.forEach((x) => (byDay[x.d] = byDay[x.d] || []).push(x));
  const nxCard = `<section class="card"><h2>🗓 다음 주 일정 <small>${nx.start ? `${wkDay(nx.start)}~${wkDay(nx.end)}` : ""}</small></h2>
    ${items.length ? Object.keys(byDay).sort().map((d) => `<div class="wk-dayg"><p class="wk-dh">${wkDay(d)}</p><ul>${byDay[d].map((x) =>
      `<li><span class="badge ${TAG[x.k] ? TAG[x.k][1] : ""}">${TAG[x.k] ? TAG[x.k][0] : "일정"}</span><div>${x.h}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</div></li>`).join("")}</ul></div>`).join("")
    : `<p class="empty">아직 잡힌 큰 일정 없음</p>`}</section>`;
  return [head, secCard, evCard, issCard, nxCard, restCard];
}
function bindRpTabs() {
  $("#app").querySelectorAll("[data-rp-tab]").forEach((b) => b.addEventListener("click", () => { rpTab = b.dataset.rpTab; render(); }));
}
function briefCard() {
  return homeReportCard();
}
function inboxHeadCard() {
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button><h2 class="stock-name">메시지함</h2>
    <p class="muted" style="margin:0">오늘의 리포트 한 장과, 텔레그램으로 보낸 알림 최근 60일이에요.</p></section>`;
}
function inboxCard() {
  const head = `<h2>받은 알림 <small>${INBOX ? `${INBOX.length}통` : ""}</small></h2>`;
  if (!INBOX) return `<section class="card">${head}<p class="muted">불러오는 중이에요…</p></section>`;
  if (!INBOX.length) return `<section class="card">${head}<p class="empty">아직 모인 알림이 없어요. 다음 알림부터 여기에 쌓여요.</p></section>`;
  if (inboxOpen === null) inboxOpen = INBOX[0].t;  // 처음엔 가장 최근 것만 펼쳐요
  let day = "";
  const rows = INBOX.map((m) => {
    const dd = m.t.slice(0, 10), sep = dd !== day ? `<p class="inbox-day">${msgDay(m.t)}</p>` : "";
    day = dd;
    const fresh = m.t > inboxSeen ? `<span class="badge new">새</span>` : "";
    return `${sep}<details class="msg" data-t="${esc(m.t)}"${m.t === inboxOpen ? " open" : ""}><summary>${esc(m.title)}${fresh}<time>${msgTime(m.t)}</time></summary>
      <div class="msg-body">${m.photo ? `<p class="muted" style="margin:0 0 4px">📈 차트 사진은 텔레그램에서 볼 수 있어요</p>` : ""}${tgHtml(m.html)}</div></details>`;
  }).join("");
  return `<section class="card">${head}${rows}</section>`;
}
function bindInbox() {
  if (!INBOX) { loadInbox().then(() => { if (screen === "inbox") render(); }); return; }
  $("#app").querySelectorAll("details.msg").forEach((el) => el.addEventListener("toggle", () => { if (el.open) inboxOpen = el.dataset.t; }));
  const last = INBOX.length ? INBOX[0].t : "";
  if (last > inboxSeen) {  // 열어 봤으면 읽은 걸로 (지금 보이는 '새' 표시는 다음에 열 때 사라져요)
    remember("inbox_seen", last);
    setTimeout(() => { inboxSeen = last; inboxDot(); }, 0);
  }
}

// ---------------------------------------------------------------- 주간 점검 한 줄

// 지난 주간 점검에서 문제가 있었으면 홈에 한 줄
function healthLine() {
  const h = DATA.health;
  if (!h || h.ok) return "";
  const bad = h.workflows.filter((w) => !w.ok).map((w) => esc(w.label)).join(", ");
  return `<p class="caution">${md(h.checked)} 주간 점검, 지난 7일 자동 실행 확인 필요: ${bad}</p>`;
}

// 적립식 복리 계산기: 국장·미장 아무 종목·ETF나 검색해서 원하는 만큼 넣고, 매달 N만 원씩 넣으면 몇 년 뒤 얼마인지 나란히 봐요.
// 종목 숫자는 symbols/<시장>_returns.json (returns.py가 매주 야후 월봉으로 계산): 최근 10년 실제 주가 상승률·배당률, 상장 뒤 최대 낙폭.
// 세금(ISA·일반 계좌, 끌 수도 있어요)과 배당 재투자(안 하면 배당은 현금으로 쌓여요)를 고를 수 있어요. 과거 값이라 미래를 보장하지 않아요.
// tax: dep(예금 이자) · kr(국내 주식·국내 주식형 ETF, 매매차익 비과세) · other(국내 상장 해외·채권 ETF 등, 차익도 15.4%) · us(미국 상장, ISA 안 됨)
