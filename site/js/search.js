"use strict";
// ---------------------------------------------------------------- 종목 검색 (국장·미장 전체 상장 종목)
// 목록은 symbols/<시장>.json (매주 symbols.py가 야후에서 받음). 찾는 규칙은 symbols.py와 똑같이 맞춰요.
// 대시보드 종목은 상장일부터 차트·재무제표, 나머지 상장 종목은 전 종목 파일(최근 2년 일봉 + 월봉)로 바로 열고 ☆로 관심종목에 넣어요.
const CORP = /\(주\)|㈜|주식회사|\(유\)|유한회사/g;
const HANGUL = /[가-힣]/;
const LETTERS = { a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이",
  l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "지" };
const BRAND_KO = { 코덱스: "kodex", 타이거: "tiger", 에이스: "ace", 라이즈: "rise", 플러스: "plus", 하나로: "hanaro",
  아리랑: "arirang", 키움: "kiwoom", 코세프: "kosef", 쏠: "sol", 솔: "sol", 타임폴리오: "timefolio", 타임: "time", 킨덱스: "kindex",
  히어로즈: "heroes" };
// 같은 뜻 낱말 (한쪽으로 쳐도 다른 쪽 이름이 나와요)
const SYNONYMS = [["나스닥", "nasdaq"], ["에스앤피", "sp"], ["에스엔피", "sp"], ["snp", "sp"], ["미국", "us"], ["다우", "dow"],
  ["코스피", "kospi"], ["코스닥", "kosdaq"], ["반도체", "semicon"], ["커버드콜", "covered"], ["레버리지", "leverage"],
  ["인버스", "inverse"], ["배당", "dividend"], ["채권", "bond"], ["국채", "treasury"], ["비트코인", "bitcoin"],
  ["이더리움", "ethereum"], ["원유", "oil"], ["일본", "japan"], ["중국", "china"], ["인도", "india"],
  ["베트남", "vietnam"], ["리츠", "reit"], ["테크", "tech"], ["바이오", "bio"], ["헬스케어", "healthcare"],
  ["배터리", "battery"], ["액티브", "active"], ["선물", "futures"], ["골드", "gold"], ["커버드", "covered"],
  ["월배당", "monthly"], ["고배당", "highdividend"], ["이티에프", "etf"], ...Object.entries(BRAND_KO)];
// 붙여 쳐도 낱말로 나눠요 ('코덱스나스닥100' → 코덱스 / 나스닥100). 영문 브랜드는 맨 앞에 있을 때만.
const SPLIT_KO = new RegExp(`(${uniq(SYNONYMS.map((x) => x[0]).filter((k) => /^[가-힣]/.test(k) && k.length >= 2)).sort((a, b) => b.length - a.length).join("|")})`, "g");
const SPLIT_EN = uniq(Object.values(BRAND_KO)).sort((a, b) => b.length - a.length);
// 이름에 없어도 되는 낱말 ('미국 나스닥100'으로 QQQ도). 다 이런 낱말뿐이면 그때는 꼭 있어야 해요.
const OPTIONAL = new Set(["미국", "us", "etf", "이티에프", "주식", "종목", "국내", "한국", "우리나라"]);
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JAMO = /[ㄱ-ㅎ]/;
const norm = (s) => String(s || "").toLowerCase().replace(CORP, "").replace(/[^0-9a-z가-힣]/g, "");
// 한글 바로 옆 영문은 한글 읽기로도: 'sk하이닉스' → '에스케이하이닉스'
const spell = (s) => s.replace(/[a-z]+/g, (w, i) =>
  (HANGUL.test(s.slice(Math.max(0, i - 1), i) + s.slice(i + w.length, i + w.length + 1)) ? [...w].map((c) => LETTERS[c]).join("") : w));
// 한글은 첫 자음만: '삼성전자' → 'ㅅㅅㅈㅈ'
const chosung = (s) => s.replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]);
function uniq(a) { return a.filter((k, i) => k && a.indexOf(k) === i); }
function splitWords(w) {
  w = w.replace(SPLIT_KO, " $1 ").replace(/([a-z])(?=[가-힣ㄱ-ㅎ])|([가-힣ㄱ-ㅎ])(?=[a-z])/g, "$1$2 ");
  const out = [];
  for (let p of w.split(/\s+/).filter(Boolean)) {
    const b = SPLIT_EN.find((x) => p.startsWith(x) && p.length > x.length + 1);
    if (b) p = `${b} ${p.slice(b.length)}`;
    out.push(...p.split(" "));
  }
  return out;
}
function wordAlts(t) {
  const alts = [t, spell(t)];
  for (const [a, b] of SYNONYMS) {
    if (t.includes(a)) alts.push(t.split(a).join(b));
    if (t.includes(b)) alts.push(t.split(b).join(a));
  }
  return uniq(alts);
}
// 띄어 쓴 낱말마다 따로 찾아요 (순서 상관없이 다 들어 있으면). 초성만 친 낱말은 초성으로.
function queryTokens(q) {
  const raw = String(q || "").toLowerCase().replace(CORP, " ").replace(/[^0-9a-z가-힣ㄱ-ㅎ\s]/g, "").split(/\s+/).filter(Boolean);
  const toks = [];
  for (const t of uniq(raw.flatMap(splitWords))) {
    if (JAMO.test(t)) { if (t.length >= 2) toks.push({ alts: [], cho: chosung(t), opt: false, fz: null }); continue; }
    toks.push({ alts: wordAlts(t), cho: null, opt: OPTIONAL.has(t), fz: t.length >= 3 && !/^\d+$/.test(t) ? t : null });
  }
  if (toks.length && toks.every((t) => t.opt)) toks.forEach((t) => { t.opt = false; });
  toks.words = raw.filter((w) => !JAMO.test(w) && !OPTIONAL.has(w)).map(wordAlts);  // 친 그대로 다 붙어 있으면 더 앞에
  return toks;
}
// t가 s 안에 k글자 이하로 틀리게 들어 있나 (오타: 글자 하나 바뀜·빠짐·더함)
function near(t, s, k) {
  let have = 0;
  for (const c of t) if (s.includes(c)) have++;
  if (have < t.length - k) return false;
  const n = t.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let j = 0; j < s.length; j++) {
    cur[0] = 0;
    const c = s[j];
    for (let i = 1; i <= n; i++) cur[i] = Math.min(prev[i - 1] + (t[i - 1] === c ? 0 : 1), prev[i] + 1, cur[i - 1] + 1);
    if (cur[n] <= k) return true;
    [prev, cur] = [cur, prev];
  }
  return false;
}
let QK = null;  // 마지막 검색어 (화면마다 여러 번 불러요)
function queryKeys(q) {
  const ready = !!(SYM.kr && SYM.us);
  if (QK && QK.q === q && QK.ready === ready) return QK.qs;
  const n = norm(q);
  const keys = [n, spell(n)];
  for (const [ko, en] of Object.entries(BRAND_KO)) if (n.includes(ko)) keys.push(n.split(ko).join(en));
  const qs = JAMO.test(q) ? [] : uniq(keys);  // 초성이 섞여 있으면 통째로는 안 맞춰요 (낱말로만)
  qs.toks = queryTokens(q);
  qs.fuzzy = false;
  // 딱 맞는 종목이 하나도 없을 때만 오타를 허용해서 찾아요
  if (ready && qs.toks.some((t) => t.fz) && !["kr", "us"].some((m) => SYM[m].some((e) => scoreOf(e.row, e.keys, qs) != null))) qs.fuzzy = true;
  QK = { q, ready, qs };
  return qs;
}
function nameKeys(row) {
  const keys = [];
  for (const name of [row[1], ...String(row[4] || "").split("|")]) {
    const n = norm(name);
    if (!n) continue;
    keys.push(n, spell(n));
    if (n.includes("자동차")) keys.push(n.split("자동차").join("차"));
  }
  return uniq(keys);
}
// 작을수록 잘 맞아요: 0 코드 그대로, 1 이름 그대로, 2 이름 앞부분, 3 코드 앞부분, 4 이름 일부,
// 5 친 낱말이 다 들어 있음(순서 상관없이, 초성도), 6 붙여 친 낱말을 나눠서 다 들어 있음,
// 7 '미국' 같은 없어도 되는 낱말만 빠짐, 8 오타 허용으로 맞음. 안 맞으면 null. (symbols.py score와 같아요)
function scoreOf(row, keys, qs) {
  const code = row[0].toLowerCase();
  if (qs.includes(code)) return 0;
  let best = null;
  for (const q of qs) {
    for (const k of keys) {
      const sc = k === q ? 1 : k.startsWith(q) ? 2 : k.includes(q) ? 4 : null;
      if (sc != null && (best == null || sc < best)) best = sc;
    }
    if (code.startsWith(q) && (best == null || best > 3)) best = 3;
  }
  const toks = qs.toks;
  if (best != null || !toks || !toks.length) return best;
  const hay = keys.hay || (keys.hay = keys.join("|"));
  let miss = 0, typo = 0;
  for (const t of toks) {
    if (t.alts.some((a) => hay.includes(a))) continue;
    if (t.cho && (keys.cho || (keys.cho = chosung(hay))).includes(t.cho)) continue;
    if (t.opt) { miss++; continue; }
    if (qs.fuzzy && t.fz && near(t.fz, hay, t.fz.length >= 8 ? 2 : 1)) { typo++; continue; }
    return null;
  }
  if (miss === toks.length) return null;
  if (typo || miss) return typo ? 8 : 7;
  return toks.words.every((w) => w.some((a) => hay.includes(a))) ? 5 : 6;
}

const SYM = { kr: null, us: null };  // [{ row, keys }]
let symLoading = null;
function loadSymbols() {
  if (!symLoading) {
    symLoading = Promise.all(["kr", "us"].map((m) => fetch(`symbols/${m}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { SYM[m] = x && Array.isArray(x.rows) ? x.rows.map((row) => ({ row, keys: nameKeys(row) })) : []; }))
      .concat(loadThemes()))
      .then(() => { if (!SYM.kr.length && !SYM.us.length) symLoading = null; });  // 둘 다 못 받았으면 다음에 다시
  }
  return symLoading;
}

// 텔레그램 봇 시작 링크: 명령을 base64url로 담아요 (봇이 '/start c_…'로 받아서 그대로 처리)
function tgLink(cmd) {
  const bot = DATA && DATA.bot;
  if (!bot) return null;
  let bin = "";
  new TextEncoder().encode(cmd).forEach((b) => { bin += String.fromCharCode(b); });
  return `https://t.me/${encodeURIComponent(bot)}?start=c_${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
const kindName = (m, row) => (m === "kr" ? (row[3] === "e" ? "국내 ETF" : row[2] === "KQ" ? "코스닥" : "코스피")
  : (row[3] === "e" ? "미국 ETF" : "미국 주식"));
const MK_NAME = { kr: "국장", us: "미장" };

function searchCard() {
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <h2 class="stock-name">종목 검색</h2>
    <input id="search-input" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off"
      spellcheck="false" placeholder="종목 이름, 또는 '전력 관련주'" aria-label="종목 검색" value="${esc(searchQuery)}">
    <p class="muted note" style="margin:8px 0 0">국장·미장에 상장된 종목을 다 찾아요. '원전 관련주', '미국 AI 반도체'처럼 문장으로 치면 연관 종목을 모아 보여 줘요.</p></section>`;
}

// 용어 사전 (검색 화면 맨 아래). 누르면 펼쳐져요
function glossaryCard() {
  const rows = Object.entries(TERMS).map(([t, txt]) => `<details class="gloss"><summary>${esc(t)}</summary><p>${esc(txt)}</p></details>`).join("");
  return `<section class="card" id="glossary"><h2>용어 사전 <small>${Object.keys(TERMS).length}개</small></h2>${rows}
    <p class="muted note" style="margin:10px 0 0">앱 곳곳의 작은 ? 버튼을 눌러도 같은 설명이 나와요.</p>
    <button type="button" class="more" data-more="learn" data-learn-set="terms">📚 투자 공부에서 분야별로 보기<span aria-hidden="true">›</span></button></section>`;
}

// 대시보드에 있는 종목(시세 있음)과 다른 상장 종목으로 나눠서, 잘 맞는 순서(같으면 지금 시장, 시가총액 큰 순)로
function findStocks(q) {
  const qs = queryKeys(q);
  const tracked = [], others = [];
  if ((!qs.length && !qs.toks.length) || !DATA) return { tracked, others };
  for (const m of ["kr", "us"]) {
    const mine = stocksOf(DATA.markets[m]);
    const byCode = new Map(mine.map((x) => [x.code, x]));
    const seen = new Set();
    (SYM[m] || []).forEach((e, i) => {
      const sc = scoreOf(e.row, e.keys, qs);
      if (sc == null) return;
      const x = byCode.get(e.row[0]);
      seen.add(e.row[0]);
      (x ? tracked : others).push({ m, sc, i, s: x, row: e.row });
    });
    mine.forEach((x) => {  // 목록 파일에 없거나 아직 못 받았을 때도 대시보드 종목은 찾아요
      if (seen.has(x.code)) return;
      const row = [x.code, x.name, x.exch || (m === "kr" ? "KS" : ""), x.kind || (x.code === "SPY" ? "e" : "s"), ""];
      const sc = scoreOf(row, nameKeys(row), qs);
      if (sc != null) tracked.push({ m, sc, i: -1, s: x, row });
    });
  }
  const order = (a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i;
  return { tracked: tracked.sort(order), others: others.sort(order) };
}

function searchResults() {
  const q = searchQuery.trim();
  const loading = !SYM.kr || !SYM.us;
  if (!q) {
    return `<section class="card"><ul class="help" style="margin:0">
      <li>이름 일부만 쳐도 돼요: '하이닉스', '삼성sdi', '코덱스 200', '슈드'</li>
      <li>낱말 순서·띄어쓰기는 상관없고 '미국'은 빼도 돼요: 'kodex 나스닥100', '나스닥100 타이거'</li>
      <li>초성·별명·작은 오타도 찾아요: 'ㅅㅅㅈㅈ', '삼전', '하닉', '곱버스', '하이닉쓰'</li>
      <li>문장으로 쳐도 돼요: '전력 관련분야 종목 찾아줘', '미국 원전주', '화장품 대장주'</li>
      <li>어떤 상장 종목이든 누르면 차트가 나오고, ☆를 누르면 바로 관심종목에 들어가요. 하나씩 추가할 필요 없어요.</li>
      <li>대형주(대시보드 종목)는 재무제표·수급까지 나와요.</li></ul></section>
      ${themeChips("테마로 찾기")}`;
  }
  const ask = parseAsk(q);
  // 테마가 없으면 예전처럼 문장 전체로, 그래도 없으면 테마 낱말·군말을 뺀 나머지 말로 종목 이름을 찾아요
  let found = ask.themes.length ? { tracked: [], others: [] } : findStocks(q);
  if (!found.tracked.length && !found.others.length && ask.rest.length) found = findStocks(ask.rest.join(" "));
  const whole = ask.themes.length ? findStocks(q) : null;
  const nameFirst = whole && whole.tracked.concat(whole.others).some((x) => x.sc <= 1);
  if (nameFirst) found = whole;  // '한국전력', '삼성전기'처럼 종목 이름 그대로면 종목이 먼저
  const named = nameCards(found, loading);
  const themed = ask.themes.slice(0, 3).map((t) => themeCard(t, ask.only));
  if (!named.length && !themed.length) {
    if (loading) return `<section class="card"><p class="muted">전체 종목 목록을 불러오는 중이에요…</p></section>`;
    return `<section class="card"><p class="empty">"${esc(q)}"에 맞는 종목이나 테마가 없어요. 이름을 조금만 쳐 보거나 아래 테마를 눌러 보세요.</p></section>
      ${themeChips("이런 테마를 찾을 수 있어요")}`;
  }
  return (nameFirst ? named.concat(themed) : themed.concat(named)).join("");
}

function nameCards({ tracked, others }, loading) {
  const cards = [];
  if (tracked.length) {
    cards.push(`<section class="card"><h2>대시보드 종목 <small>누르면 차트·재무제표</small></h2>
      <ul class="list">${tracked.slice(0, 15).map(trackedRow).join("")}</ul></section>`);
  }
  if (others.length) {
    cards.push(`<section class="card"><h2>다른 상장 종목 <small>${others.length > 30 ? `${others.length}개 중 30개` : `${others.length}개`} · 누르면 차트</small></h2>
      <ul class="list">${others.slice(0, 30).map(otherRow).join("")}</ul>
      ${others.length > 30 ? `<p class="muted" style="margin:10px 0 0">더 자세히 쳐 보세요.</p>` : ""}</section>`);
  } else if (loading) {
    cards.push(`<section class="card"><p class="muted">전체 종목 목록을 불러오는 중이에요…</p></section>`);
  }
  return cards;
}

// ---------------------------------------------------------------- 문장 검색 ('전력 관련분야 종목 찾아줘')
// themes.json (themes.py): 테마 낱말 → 미리 고른 국장·미장 대표 종목. 유료 AI 없이 문장에서 테마 낱말을 찾아요.
let THEMES = null;  // { themes: [{ name, keys, why, sector, etf, kr: [[코드, 이름]], us, more_us }], filler: [...] }
let themesLoading = null;
function loadThemes() {
  if (!themesLoading) {
    themesLoading = fetch("themes.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (!x || !Array.isArray(x.themes)) { themesLoading = null; return; }
        x.themes.forEach((t) => { t.nkeys = uniq(t.keys.map(norm)); try { t.re = t.etf ? new RegExp(t.etf, "i") : null; } catch (e) { t.re = null; } });
        x.fill = uniq(x.filler.map(norm)).sort((a, b) => b.length - a.length);
        THEMES = x;
      });
  }
  return themesLoading;
}
const MK_ONLY = { kr: ["국장", "국내", "한국", "코스피", "코스닥", "국내주식"], us: ["미장", "미국", "해외", "나스닥", "미국주식", "해외주식"] };
const PARTICLE = /(이랑|하고|에서|으로|은|는|이|가|을|를|의|에|와|과|랑)$/;

// 문장 → { themes: 맞은 테마(문장 순서), rest: 테마 낱말·군말을 뺀 나머지 말, only: 'kr'|'us'|null }
function parseAsk(q) {
  const out = { themes: [], rest: [], only: null };
  if (!THEMES) return out;
  const mk = { kr: false, us: false };
  const toks = [];
  for (let w of String(q).toLowerCase().split(/\s+/).map(norm).filter(Boolean)) {
    // '미국반도체', '국장 원전주': 시장 말은 앞에 붙어 있거나 따로 있을 때만 (한국전력의 '한국'은 이름이라 그대로)
    for (const m of ["kr", "us"]) {
      for (const k of MK_ONLY[m]) {
        const bare = w.replace(PARTICLE, "");
        if (w === k || bare === k) { mk[m] = true; w = ""; }
        else if (m === "us" || k !== "한국") { if (w.startsWith(k) && w.length > k.length + 1) { mk[m] = true; w = w.slice(k.length); } }
      }
    }
    // 군말 빼기: '전력관련분야' → '전력', '종목' → 없음
    for (let again = true; again && w;) {
      again = false;
      for (const f of THEMES.fill) {
        if (w === f) { w = ""; break; }
        if (f.length >= 2 && w.endsWith(f) && w.length > f.length) { w = w.slice(0, -f.length); again = true; break; }
      }
    }
    if (w) toks.push(w);
  }
  if (mk.kr !== mk.us) out.only = mk.kr ? "kr" : "us";
  // 붙여 쓴 문장에서 긴 낱말부터: 'ai반도체'가 'ai'보다 먼저. 한 글자 낱말('금')은 따로 쓴 말일 때만
  const s = toks.join("");
  const starts = [];
  toks.reduce((a, w) => { starts.push([a, a + w.length, w]); return a + w.length; }, 0);
  const hits = [];
  THEMES.themes.forEach((t) => t.nkeys.forEach((k) => {
    for (let i = s.indexOf(k); i >= 0; i = s.indexOf(k, i + 1)) {
      if (k.length === 1 && !starts.some(([a, b, w]) => a === i && (b === i + 1 || w.replace(PARTICLE, "") === k))) continue;
      hits.push({ t, a: i, b: i + k.length });
    }
  }));
  hits.sort((x, y) => (y.b - y.a) - (x.b - x.a) || x.a - y.a);
  const used = new Array(s.length).fill(false);
  const picked = [];
  for (const h of hits) {
    if (used.slice(h.a, h.b).some(Boolean)) continue;
    for (let i = h.a; i < h.b; i++) used[i] = true;
    picked.push(h);
  }
  picked.sort((x, y) => x.a - y.a).forEach((h) => { if (!out.themes.includes(h.t)) out.themes.push(h.t); });
  // 남은 말: 테마 낱말이 안 덮은 글자들을 낱말별로
  starts.forEach(([a, b]) => {
    let w = "";
    for (let i = a; i < b; i++) if (!used[i]) w += s[i];
    if (w.length > 2) w = w.replace(/(이랑|하고|에서|으로|은|는|을|를|의)$/, "");  // '고양이'의 '이'는 그대로
    if (w && !THEMES.fill.includes(w) && !/^[가-힣]$/.test(w)) out.rest.push(w);
  });
  return out;
}

function themeChips(title) {
  if (!THEMES) return "";
  return `<section class="card"><h2>${esc(title)} <small>누르면 관련 종목</small></h2>
    <div class="chips theme-chips" role="group" aria-label="테마 고르기">${THEMES.themes.map((t) =>
      `<button type="button" data-theme-q="${esc(t.keys[0])} 관련 종목">${esc(t.name)}</button>`).join("")}</div>
    <button type="button" class="more" data-map="">산업 연관 지도로 보기<span aria-hidden="true">›</span></button></section>`;
}

const SYM_AT = { kr: null, us: null };  // 코드 → 목록 줄
function symRow(m, code) {
  if (!SYM_AT[m] && SYM[m] && SYM[m].length) SYM_AT[m] = new Map(SYM[m].map((e) => [e.row[0], e.row]));
  return SYM_AT[m] ? SYM_AT[m].get(code) : null;
}
// 테마 종목 한 줄: 대시보드에 있으면 시세·★, 없으면 '추가'
function themeRow(m, code, ko, mine) {
  const sym = symRow(m, code);
  const row = sym ? [code, ko || sym[1], sym[2], sym[3], sym[4]] : [code, ko || code, m === "kr" ? "KS" : "", "s", ""];
  const s = mine.get(code);
  return s ? trackedRow({ m, s, row }) : otherRow({ m, row });
}
function themeCard(t, only) {
  const mks = only ? [only] : market === "us" ? ["us", "kr"] : ["kr", "us"];
  const parts = mks.map((m) => {
    const d = DATA.markets[m];
    const mine = new Map(stocksOf(d).map((x) => [x.code, x]));
    const rows = t[m].map(([c, ko]) => themeRow(m, c, ko, mine));
    const etfs = t.re ? (SYM[m] || []).filter((e) => e.row[3] === "e" && t.re.test(`${e.row[1]} ${e.row[4]}`)).slice(0, 5)
      .map((e) => themeRow(m, e.row[0], "", mine)) : [];
    const more = m === "us" ? (t.more_us || []).map((c) => themeRow(m, c, "", mine)) : [];
    if (!rows.length && !etfs.length) return "";
    const sec = t.sector && ((d.daily && d.daily.sectors) || []).find((x) => x.name === t.sector);
    const secLine = sec ? `<li data-tsec="${m}/${esc(sec.name)}"><div class="l"><div class="name">${esc(sec.name)} 업종${toneBadge(sec)}</div>
        <div class="meta">${MK_NAME[m]} 업종 흐름 · 누르면 업종 뉴스</div></div>
        <div class="r ${sign(sec.r5)}">${pct(sec.r5)}<div class="meta">5일 중간값</div></div></li>` : "";
    return `<h3 class="theme-mk">${MK_NAME[m]} <small>${rows.length}종목${etfs.length ? ` · ETF ${etfs.length}개` : ""}</small></h3>
      ${secLine ? `<ul class="list">${secLine}</ul>` : ""}
      ${rows.length ? `<ul class="list">${rows.join("")}</ul>` : `<p class="muted">${MK_NAME[m]}엔 골라 둔 종목이 없어요.</p>`}
      ${etfs.length ? `<h3 class="muted" style="margin:12px 0 4px">관련 ETF</h3><ul class="list">${etfs.join("")}</ul>` : ""}
      ${more.length ? `<details class="more-list"><summary>같은 업종 미장 종목 ${more.length}개 더</summary><ul class="list">${more.join("")}</ul></details>` : ""}`;
  }).join("");
  return `<section class="card theme-card"><h2>${esc(t.name)} <small>테마 · 참고</small></h2>
    <p class="sub">${esc(t.why)}</p>${parts || `<p class="empty">이 시장엔 골라 둔 종목이 없어요.</p>`}
    <button type="button" class="more" data-map="${esc(t.name)}">산업 지도에서 이어진 산업 보기<span aria-hidden="true">›</span></button>
    <p class="muted note" style="margin:10px 0 0">미리 골라 둔 대표 종목이에요 (큰 회사부터). 사라는 뜻이 아니고 매매 규칙도 안 바꿔요.</p></section>`;
}

function trackedRow(x) {
  const { m, s } = x;
  const on = WATCH[m].includes(s.code);
  const meta = [s.code, kindName(m, x.row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ");
  return `<li class="stock" data-open="${m}/${esc(s.code)}">
    <div class="name">${esc(s.name)}${s.extra ? `<span class="badge">추가한 종목</span>` : ""}</div><div class="meta">${esc(meta)}</div>
    <div class="price">${price(m, s.close)}</div><div class="chg ${sign(s.d1)}">${pct(s.d1, 2)}</div>
    <button type="button" class="star" data-wstar="${m}/${esc(s.code)}" aria-pressed="${on}"
      aria-label="${esc(s.name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></li>`;
}

// 대시보드 밖 상장 종목: 누르면 종목 화면(전 종목 파일), ☆는 바로 관심종목
function otherRow(x) {
  const { m, row } = x;
  const on = WATCH[m].includes(row[0]);
  const meta = [row[0], kindName(m, row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ");
  return `<li class="stock other" data-open="${m}/${esc(row[0])}"><div class="name">${esc(row[1])}</div><div class="meta">${esc(meta)}</div>
    <button type="button" class="star" data-wstar="${m}/${esc(row[0])}" aria-pressed="${on}"
      aria-label="${esc(row[1])} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></li>`;
}

function bindSearch() {
  const input = $("#search-input");
  const list = $("#search-results");
  if (!input || !list) return;
  const refresh = () => { list.innerHTML = searchResults(); bindResults(list); };
  input.addEventListener("input", () => { searchQuery = input.value; refresh(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });  // 폰 키보드의 '검색'은 키보드만 내려요
  bindResults(list);
  if (!searchQuery) input.focus();
  if (!SYM.kr || !SYM.us) loadSymbols().then(() => { if (screen === "search") refresh(); });
}

function bindResults(el) {
  if (el.id === "search-results") el.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => openMap(b.dataset.map)));
  el.querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", () => {
    const [m, code] = row.dataset.open.split("/");
    if (m !== market) { market = m; remember("market", m); }
    openStock(code);
  }));
  el.querySelectorAll("[data-wstar]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const [m, code] = b.dataset.wstar.split("/");
    toggleWatch(code, m);
    const on = WATCH[m].includes(code);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "★" : "☆";
  }));
  el.querySelectorAll("[data-theme-q]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = b.dataset.themeQ;
    const input = $("#search-input");
    if (input) input.value = searchQuery;
    const list = $("#search-results");
    if (list) { holdHeight(); list.innerHTML = searchResults(); bindResults(list); }
    // 화면은 그 자리 그대로예요. 결과는 누른 칩 자리부터 보여요 (사용자 규칙 '버튼 눌러도 화면 고정')
  }));
  el.querySelectorAll("[data-tsec]").forEach((b) => b.addEventListener("click", () => {
    const [m, name] = b.dataset.tsec.split("/");
    if (m !== market) { market = m; remember("market", m); }
    SECTOR[m] = name;
    remember("sector", JSON.stringify(SECTOR));
    openMore("sectors");
  }));
}
