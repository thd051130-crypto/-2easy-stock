"use strict";
// ---------------------------------------------------------------- 추천 종목 성과

// 도구 화면 선택 바: [키, 이름, 그 묶음의 칸들]. 처음엔 적립식 계산기, 고른 건 이 폰에 기억해요
const PERF_TABS = [
  ["asset", "자산 기록", () => [assetCard(), divCalCard()]],
  ["sav", "적립식 계산기", () => [savingsCard()]],
  ["lab", "포트폴리오 실험실", () => [labCard()]],
  ["cal", "수익률 달력", (d) => [retCalendarCard(d)]],
  ["stress", "폭락 대비", (d) => [stressCard(d)]],
  ["goal", "목표", () => [goalCard()]],
];
let perfTabKey = "sav";
try { perfTabKey = localStorage.getItem("tools_tab") || "sav"; } catch (e) { /* 처음 */ }
// 묶음 칸이 오류 나도 탭은 보여요 (그 칸 자리에 오류 안내가 떠요, view.js paintCards)
const tabHas = (cards, d) => { try { return cards(d).some(Boolean); } catch (e) { return true; } };
const perfTabList = (d) => PERF_TABS.filter(([k, , cards]) => k === "sav" || tabHas(cards, d)).map(([k, label, cards]) => ({ k, label, cards }));
function perfTab(d) {
  const list = perfTabList(d);
  return list.find((t) => t.k === perfTabKey) || list[0];
}
function perfTabsBar(d) {
  const cur = perfTab(d).k;
  return `<nav class="chips idx-chips perf-tabs" aria-label="도구 고르기">${perfTabList(d).map((t) =>
    `<button type="button" data-perf-tab="${t.k}" aria-pressed="${t.k === cur}">${esc(t.label)}</button>`).join("")}</nav>`;
}

// 홈 '더 보기': 칸마다 제목 + 한 줄 요약만 보이고, 누르면 그 칸만 있는 화면(#kr/more/<칸>)으로 넘어가요 (사용자 2026-10-24)
const upDown = (r) => (r == null ? "" : `<b class="${sign(r)}">${pct(r)}</b>`);
function homeMoreRows(d, only) {
  const s = d.daily || {};
  const rows = [];
  // 칸 HTML은 함수로 받아서, 칸 화면(only)을 열 땐 그 칸만 만들어요 (예전엔 홈·칸 화면마다 13칸을 전부 만들었어요)
  // only: 칸 하나(글자) 또는 여러 칸(Set, 홈 편집에서 '홈에 펼치기'로 고른 칸들)
  const want = !only ? () => true : typeof only === "string" ? (k) => k === only : (k) => only.has(k);
  const add = (key, icon, title, sum, html) => {
    if (!want(key)) return;
    const h = html();
    if (h) rows.push({ key, icon, title, sum, html: h });
  };
  // 지금 뉴스: 안 읽은 🔥 핫 뉴스가 있으면 그걸, 없으면 가장 최근 뉴스 한 줄 (30분마다 따로 받아요)
  const N = newsOf(market), n1 = N && N[0], hot = hotOf(market);
  const nBad = hot.filter(isBad).length;  // 악재가 있으면 요약 줄에 먼저 (hotOf가 악재를 앞에 둬요)
  add("news", "📰", "지금 뉴스", hot.length ? `${nBad ? `⚠️ <b>악재 ${nBad}건</b> · ` : ""}🔥 <b>${hot.length}건</b> · ${esc(hot[0].title)}`
    : n1 ? `${esc(n1.title)} · ${ago(n1.at)}` : NEWS ? "최근 뉴스 없음" : "받는 중", () => newsCard());
  // 투자 공부: 용어집·움직이는 이유·대처법, '오늘 왜?'는 앱 자료로 매일 새로 (사용자 2026-10-24)
  add("learn", "📚", "투자 공부", learnSummary(), () => learnView(d));
  const dn = dropNow(d);
  add("drop", "⚠️", "급락 점검", dn ? `${esc(dn.name)} ${dn.weekly ? `한 주 ${upDown(dn.w1)}` : `1년 고점 대비 ${upDown(dn.dd)}`}` : "", () => dropCard(d));
  // 다가오는 일정: 가장 가까운 큰 일정
  const ev = calNear(CAL_DAYS).filter((e) => !STOCK_KINDS.includes(e.kind));
  const ev1 = ev.find((e) => e.big) || ev[0];  // 큰 발표가 있으면 그걸 먼저
  add("cal", "📅", "다가오는 일정", ev1 ? `${md(ev1.date)} ${esc(ev1.title)} · ${dday(ev1.date)}` : "2주 안 큰 일정 없음", () => calendarCard());
  // 실적·배당 발표: 가장 가까운 내 종목 일정
  const er = calNear(EARN_DAYS).filter((e) => STOCK_KINDS.includes(e.kind) && calMine(e));
  add("earn", "📢", "실적·배당 발표", er.length ? `${md(er[0].date)} ${esc(er[0].title)} · ${dday(er[0].date)}${er.length > 1 ? ` 외 ${er.length - 1}건` : ""}` : "한 달 안 내 종목 일정 없음", () => earningsCard());
  const mine = myStocks(d);
  add("watch", "⭐", "관심종목", mine.length ? `${mine.length}개 · ${esc(mine[0].name)}${mine.length > 1 ? " 외" : ""}` : "", () => homeWatchCard(d));
  const mv = s.movers;
  const top = (l) => (l && l[0] ? `${esc(l[0].name)} ${upDown(l[0].r5)}` : "");
  add("movers", "❓", "왜 움직였나", mv ? [top(mv.up), top(mv.down)].filter(Boolean).join(" · ") || "크게 움직인 종목 없음" : "", () => moversCard(d));
  const all = stocksOf(d).filter((x) => !x.extra && x.d1 != null);
  const ups = all.filter((x) => x.d1 > 0).length, downs = all.filter((x) => x.d1 < 0).length;
  add("heat", "🟥", "시장 히트맵", `오늘 오른 <b class="up">${ups}</b> · 내린 <b class="down">${downs}</b>`, () => heatmapCard(d));
  const secs = (s.sectors || []).filter((x) => x.r5 != null);
  const sb = secs.length ? [...secs].sort((a, b) => b.r5 - a.r5) : [];
  add("sectors", "🏭", "업종별 호재·악재", sb.length ? `${esc(sb[0].name)} ${upDown(sb[0].r5)} · ${esc(sb[sb.length - 1].name)} ${upDown(sb[sb.length - 1].r5)}` : "", () => sectorsCard(d));
  // 정부 정책은 업종 호재·악재 바로 아래 (둘이 서로 연결돼서, 사용자 2026-10-18)
  const P = DATA && DATA.policies;
  add("policy", "🏛️", "정부 정책", P && P.items ? `${P.items.length}개 정리${P.stale ? " · ⚠️ 오래됨" : ""}` : "", () => policyCard());
  const f = market === "kr" && d.flows;
  add("flows", "🏦", "외국인·기관 수급", f ? ((f.warn || []).length ? `⚠️ 같이 파는 종목 ${f.warn.length}개` : "같이 파는 종목 없음") : "", () => flowsCard(d));
  if (market === "kr" && d.disclosures) {
    const since = new Date(Date.parse(TODAY()) - 7 * 864e5).toISOString().slice(0, 10);
    const n = d.disclosures.filter((x) => x.day >= since && x.tone === "warn").length;
    add("disclose", "📄", "최근 공시", n ? `⚠️ 주의 공시 ${n}건` : "주의 공시 없음", () => discloseHomeCard(d));
  }
  const q = s.quiet_volume;
  add("quiet", "🔍", "주가 그대로·거래량 급증", q ? (q.total ? `${q.total}개 · ${esc(q.rows[0].name)}` : "오늘은 없음") : "", () => quietVolumeCard(d));
  const m = DATA && DATA.macro;
  add("macro", "🌡️", "경기 국면", m ? `${esc(m.regime)} · 경고 ${m.score}/${m.total}개` : "", () => macroCard());
  return rows;
}
function homeMoreCard(d, rows) {
  rows = rows || homeMoreRows(d);
  return `<section class="card home-more"><h2>더 보기 <small>누르면 넘어가요</small></h2>${rows.map((r) =>
    `<button type="button" class="hm" data-more="${r.key}"><span class="hm-ico" aria-hidden="true">${r.icon}</span>
      <span class="hm-t"><b>${r.title}</b>${r.sum ? `<span class="hm-s">${r.sum}</span>` : ""}</span><span class="hm-arrow" aria-hidden="true">›</span></button>`).join("") ||
    `<p class="muted">더 보기에 넣은 칸이 없어요.</p>`}</section>`;
}

// ---------------------------------------------------------------- 홈 화면 편집 (사용자 2026-11-22 "화면 편집 기능을 만들자")
// 홈 칸마다 어디에 둘지(홈에 펼치기 · 더 보기 한 줄 · 숨기기)와 순서를 고르고, 이 폰에 기억해요 (home_layout)
// [키, 아이콘, 이름, 고를 수 있는 자리, 홈에 그릴 칸(맨 위 칸만), 국장만]
// 더 보기 줄의 아이콘·이름은 homeMoreRows의 add()와 같게 맞춰 두기
const HOME_ITEMS = [
  ["big", "🚨", "큰 발표·지수 급변", "home off", () => bigEventsCard(), false],
  ["status", "🕒", "장 상황", "home off", () => marketStatusCard(), false],
  ["world", "🌏", "세계 지수·환율", "home off", () => worldHomeCard(), false],
  ["more", "📂", "더 보기 칸", "home", null, false],
  ["report", "📰", "오늘의 리포트", "home off", () => homeReportCard(), false],
  ["news", "📰", "지금 뉴스"], ["learn", "📚", "투자 공부"], ["drop", "⚠️", "급락 점검"], ["cal", "📅", "다가오는 일정"],
  ["earn", "📢", "실적·배당 발표"], ["watch", "⭐", "관심종목"], ["movers", "❓", "왜 움직였나"], ["heat", "🟥", "시장 히트맵"],
  ["sectors", "🏭", "업종별 호재·악재"], ["policy", "🏛️", "정부 정책"], ["flows", "🏦", "외국인·기관 수급", "home more off", null, true],
  ["disclose", "📄", "최근 공시", "home more off", null, true], ["quiet", "🔍", "주가 그대로·거래량 급증"], ["macro", "🌡️", "경기 국면"],
].map(([key, icon, title, can = "home more off", card = null, krOnly = false]) => ({ key, icon, title, can: can.split(" "), card, krOnly }));
const HOME_ITEM = Object.fromEntries(HOME_ITEMS.map((x) => [x.key, x]));
const homeDefMode = (it) => (it.can.includes("more") ? "more" : "home");
// 저장된 순서·자리 + 새로 생긴 칸(기본 자리, 기본 순서의 앞 칸 바로 뒤)
function homeLayout() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("home_layout") || "null"); } catch (e) { /* 처음 */ }
  const order = ((saved && saved.order) || []).filter((k) => HOME_ITEM[k]);
  HOME_ITEMS.forEach((it, i) => {
    if (order.includes(it.key)) return;
    const prev = i ? order.indexOf(HOME_ITEMS[i - 1].key) : -1;
    order.splice(prev + 1, 0, it.key);
  });
  const mode = {};
  order.forEach((k) => { const m = saved && saved.mode && saved.mode[k]; mode[k] = HOME_ITEM[k].can.includes(m) ? m : homeDefMode(HOME_ITEM[k]); });
  return { order, mode };
}
function saveHomeLayout(L) { remember("home_layout", JSON.stringify(L)); }
const homeIsDefault = (L) => HOME_ITEMS.every((it, i) => L.order[i] === it.key && L.mode[it.key] === homeDefMode(it));

// 홈 화면 칸들: 편집에서 고른 순서대로. 펼친 칸은 원래 칸 그대로, 더 보기 칸 안은 고른 순서대로 한 줄씩
function homeCards(d) {
  const L = homeLayout();
  const homeRows = new Set(L.order.filter((k) => !HOME_ITEM[k].card && k !== "more" && L.mode[k] === "home"));
  const moreRows = new Set(L.order.filter((k) => L.mode[k] === "more"));
  let open = {}, rows = [];
  const pick = () => {  // 줄 요약·칸은 한 번만 만들어요
    if (rows.length || !(homeRows.size + moreRows.size)) return;
    const all = homeMoreRows(d, new Set([...homeRows, ...moreRows]));
    open = Object.fromEntries(all.filter((r) => homeRows.has(r.key)).map((r) => [r.key, r.html]));
    const at = Object.fromEntries(all.map((r) => [r.key, r]));
    rows = L.order.filter((k) => moreRows.has(k) && at[k]).map((k) => at[k]);
  };
  const out = [];
  for (const k of L.order) {
    const it = HOME_ITEM[k];
    if (L.mode[k] !== "home") continue;
    if (it.card) out.push(it.card);
    else if (k === "more") out.push(() => { pick(); return homeMoreCard(d, rows); });
    else out.push(() => { pick(); return open[k] || ""; });
  }
  out.push(`<div class="home-edit"><button type="button" class="he-open" data-more="edit">✏️ 홈 화면 편집</button></div>`);
  return out;
}

const HE_MODES = [["home", "홈"], ["more", "더 보기"], ["off", "숨김"]];
function homeEditCard() {
  const L = homeLayout(), n = L.order.length;
  const row = (k, i) => {
    const it = HOME_ITEM[k], m = L.mode[k];
    const note = k === "more" ? "더 보기로 보낸 칸이 이 안에 이 순서로 들어가요" : it.card ? "홈 위쪽 칸" : it.krOnly ? "국장만 있는 칸" : "";
    return `<li class="he-row${m === "off" ? " he-off" : ""}">
      <div class="he-top"><span class="hm-ico" aria-hidden="true">${it.icon}</span>
        <span class="he-name"><b>${esc(it.title)}</b>${note ? `<small>${note}</small>` : ""}</span>
        <span class="he-move"><button type="button" data-he-move="${k}:-1" aria-label="${esc(it.title)} 위로" ${i ? "" : "disabled"}>▲</button><button type="button" data-he-move="${k}:1" aria-label="${esc(it.title)} 아래로" ${i < n - 1 ? "" : "disabled"}>▼</button></span></div>
      ${it.can.length > 1 ? `<div class="period he-mode" role="group" aria-label="${esc(it.title)} 자리">${HE_MODES.filter(([v]) => it.can.includes(v)).map(([v, label]) =>
        `<button type="button" data-he-mode="${k}:${v}" aria-pressed="${m === v}">${label}</button>`).join("")}</div>` : ""}</li>`;
  };
  return `<section class="card home-edit-card"><h2>✏️ 홈 화면 편집 <small>이 폰에만 저장</small></h2>
    <p class="muted">칸마다 <b>홈</b>(홈에 펼쳐 보기) · <b>더 보기</b>(더 보기 칸에 한 줄) · <b>숨김</b>을 고르고, ▲▼로 순서를 바꿔요.</p>
    <ol class="he-list">${L.order.map(row).join("")}</ol>
    <div class="he-foot"><button type="button" class="he-reset" data-he-reset ${homeIsDefault(L) ? "disabled" : ""}>처음 상태로 되돌리기</button></div></section>`;
}
function bindHomeEdit(app) {
  const change = (fn) => { const L = homeLayout(); fn(L); saveHomeLayout(L); render(); };
  app.querySelectorAll("[data-he-mode]").forEach((b) => b.addEventListener("click", () => {
    const [k, v] = b.dataset.heMode.split(":");
    change((L) => { L.mode[k] = v; });
  }));
  app.querySelectorAll("[data-he-move]").forEach((b) => b.addEventListener("click", () => {
    const [k, dir] = b.dataset.heMove.split(":");
    change((L) => {
      const i = L.order.indexOf(k), j = i + Number(dir);
      if (i < 0 || j < 0 || j >= L.order.length) return;
      [L.order[i], L.order[j]] = [L.order[j], L.order[i]];
    });
  }));
  app.querySelectorAll("[data-he-reset]").forEach((b) => b.addEventListener("click", () => {
    try { localStorage.removeItem("home_layout"); } catch (e) { /* 괜찮아요 */ }
    render();
  }));
}

// 더 보기에서 연 칸 화면: 맨 위 ‹ 더 보기(뒤로) + 원래 칸 그대로
function moreView(d) {
  const back = `<div class="more-back"><button type="button" class="back" data-back>‹ ${moreKey === "edit" ? "홈" : stockFrom === "home" ? "더 보기" : "뒤로"}</button></div>`;
  if (moreKey === "edit") return [back, homeEditCard()];
  if (moreKey === "learn" && !learnReady() && DATA.reading_days) {  // 공부 자료를 아직 받는 중
    loadLearn();
    return [back, `<section class="card"><h2>📚 투자 공부</h2><p class="muted">공부 자료 불러오는 중…</p></section>`];
  }
  const r = homeMoreRows(d, moreKey)[0];
  return [back,
    r ? r.html : `<section class="card"><p class="empty">이 칸은 지금 ${market === "kr" ? "국장" : "미장"}에 자료가 없어요.</p></section>`];
}

// 몇 분 전에 받은 뉴스인지
function ago(at) {
  const t = Date.parse(at);
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 6e4));
  return m < 2 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
}
const hm = (at) => (at ? `${at.slice(11, 16)}` : "");
function newsLi(n) {
  const t = /^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title);
  return `<li${isBad(n) ? ` class="news-bad"` : ""}><div class="l"><div class="name news-t">${badTag(n)}${n.topic ? `<span class="badge">${esc(n.topic)}</span> ` : ""}${t}</div>
    <div class="meta">${esc(n.source || "")}${n.at ? ` · ${md(n.at.slice(0, 10))} ${hm(n.at)} (${ago(n.at)})` : ""}</div></div></li>`;
}
// 24시간 지난 기사는 화면에서도 빼요 (뉴스 작업이 한동안 못 돌아 예전 파일이 남아 있을 때)
const NEWS_HOURS = 24;
const newsOf = (m) => (NEWS && Array.isArray(NEWS[m]) ? NEWS[m].filter((n) => Date.now() - Date.parse(n.at) < NEWS_HOURS * 36e5) : null);
// 증시에 영향 줄 만한 사건 뉴스 (금리·환율·관세·유가·전쟁 등). 종목 하나하나 뉴스는 안 받아요 (사용자 2026-10-24)
function hotLi(n, read) {
  const id = esc(hotId(n));
  const t = /^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener"${read ? "" : ` data-hot-read="${id}"`}>${esc(n.title)}</a>` : esc(n.title);
  return `<li data-hot="${id}"${isBad(n) ? ` class="news-bad"` : ""}><div class="l"><div class="name news-t">${badTag(n)}${n.topic ? `<span class="badge">${esc(n.topic)}</span> ` : ""}${t}</div>
    <div class="meta">언론 ${n.sources || "여러"}곳 · ${n.since ? `처음 ${md(n.since.slice(0, 10))} ${hm(n.since)}` : ""}${n.at ? ` · 최근 기사 ${ago(n.at)}` : ""}</div></div>
    ${read ? `<button type="button" class="hot-ok" data-hot-undo="${id}" aria-label="안 읽음으로 되돌리기">안 읽음</button>`
      : `<button type="button" class="hot-ok" data-hot-ok="${id}" aria-label="읽음으로 표시">읽음</button>`}</li>`;
}
// 같은 주제 핫 뉴스는 한 줄로 묶고, 누르면 펼쳐요 (사용자 2026-10-25 "겹치는 주제 있으면 하나로 합쳐서 접기기능처럼 공간확보").
// 주제가 없거나 그 주제가 1건이면 그대로 한 줄. 묶음 자리는 그 주제의 가장 앞 기사 자리예요
const HOT_GRP_OPEN = new Set();  // 펼친 주제 (아래 메뉴를 누르면 접혀요)
function hotGroups(H) {
  const out = [], at = new Map();
  for (const n of H) {
    const k = n.topic || "";
    if (k && at.has(k)) out[at.get(k)].push(n);
    else { if (k) at.set(k, out.length); out.push([n]); }
  }
  return out;
}
function hotGrpLi(g) {
  const k = esc(g[0].topic), src = g.reduce((a, n) => a + (n.sources || 0), 0);
  return `<li class="hot-grp"><details class="hot-grp-d" data-hot-grp="${k}"${HOT_GRP_OPEN.has(g[0].topic) ? " open" : ""}>
    <summary><div class="l"><div class="name news-t">${g.some(isBad) ? `<span class="badge bad">⚠️ 악재</span> ` : ""}<span class="badge">${k}</span> ${esc(g[0].title)}</div>
      <div class="meta">같은 주제 ${g.length}건${src ? ` · 언론 ${src}곳` : ""}${g[0].at ? ` · 최근 기사 ${ago(g[0].at)}` : ""}</div></div>
      <span class="hot-grp-n"><span class="fold-more">${g.length}건</span><span class="fold-less">접기</span></span></summary>
    <ul class="list">${g.map((n) => hotLi(n)).join("")}</ul></details></li>`;
}
function hotCard() {
  const H = hotOf(market), R = hotReadOf(market);
  if (!H.length && !R.length) return "";
  return `<section class="card hot-card${H.length ? "" : " all-read"}${hotFold ? " folded" : ""}" id="hot-card">
    <h2 class="hot-h"><button type="button" class="hot-fold" data-hot-fold aria-expanded="${!hotFold}" aria-controls="hot-body">
      <span class="hot-h-t">🔥 핫 뉴스 <small>안 읽은 ${H.length}건</small></span><span class="hot-fold-t"><span class="fold-less">접기</span><span class="fold-more">펼치기</span></span></button></h2>
    ${H.length ? `<p class="hot-peek">${esc(H[0].title)}</p>` : ""}
    <div class="hot-body" id="hot-body">
    ${H.length ? `<ul class="list">${hotGroups(H).map((g) => (g.length > 1 ? hotGrpLi(g) : hotLi(g[0]))).join("")}</ul>` : `<p class="empty">안 읽은 핫 뉴스가 없어요.</p>`}
    ${H.length > 1 ? `<button type="button" class="more" data-hot-all><b class="hot-all-t">모두 읽음</b><span aria-hidden="true">✓</span></button>` : ""}
    ${R.length ? `<details class="more-list hot-read-list"${hotReadOpen ? " open" : ""}><summary>읽은 핫 뉴스 ${R.length}건 <small>7일 동안 남아요</small></summary>
      <ul class="list">${R.map((n) => hotLi(n, true)).join("")}</ul></details>` : ""}
    <p class="muted note" style="margin:10px 0 0">여러 언론이 같이 다루는 사건이에요. 같은 주제는 한 줄로 묶고, 누르면 펼쳐요. 기사를 누르거나 '읽음'을 누를 때까지 위에 남아요. 읽은 건 아래 '읽은 핫 뉴스'에서 '안 읽음'으로 되돌릴 수 있어요. 제목을 누르면 칸을 접어요.</p></div></section>`;
}
function newsCard() {
  const N = newsOf(market);
  if (!N) return DATA.news_url ? `${hotCard()}<section class="card"><h2>지금 뉴스</h2><p class="empty">뉴스를 아직 못 받았어요. 잠시 뒤 다시 열어 주세요.</p></section>` : "";
  return `${hotCard()}<section class="card" id="news-card"><h2>지금 뉴스 <small>${ago(NEWS.updated)} 받음 · 30분마다</small></h2>
    ${N.length ? `<ul class="list">${N.map(newsLi).join("")}</ul>` : `<p class="empty">최근 24시간 큰 뉴스가 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">금리·환율·관세·유가·전쟁처럼 ${market === "kr" ? "국장" : "미장"} 전체에 영향 줄 만한 뉴스 제목을 30분마다 새로 받아 바꿔요 (GitHub 사정으로 더 늦을 때도 있어요). 24시간 지난 기사는 빼요. 주제 표시는 제목 낱말로 짐작한 거예요. 기사 원문을 꼭 확인하세요.</p></section>`;
}
