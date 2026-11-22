// 버튼 누르기 점검: 화면마다 누를 수 있는 걸 전부 눌러 보고, 누른 요소의 화면 높이가 변했는지 재요 (사용자 규칙: 눌러도 화면 그대로)
//
//   python dashboard.py --out _site && (cd _site && python -m http.server 8765 &)
//   node tools/jump-audit.js                 # 전체 점검 (PR 때 GitHub Actions가 이걸 돌려요)
//   node tools/jump-audit.js --changed       # 빠른 점검: main과 다른 코드가 쓰이는 화면만, 같은 종류 버튼은 3개까지만
//   node tools/jump-audit.js home,more:news  # 고른 화면만 (앞부분만 맞아도 돼요: more = 더 보기 칸 전부)
//
// 옵션: --workers N (동시에 여는 브라우저 화면 수, 기본 CPU 수, 최대 6) · --base <git 기준, 기본 origin/main>
//       --quick (같은 종류 버튼 3개까지만) · --base-url http://127.0.0.1:8765/ · --allow tools/jump-audit-allow.txt
// 끝나면 아래 문제가 허용 목록에 없거나 오류(ERR)가 있을 때 종료 코드 1이에요.
//   MOVE 눌렀더니 화면이 밀림 · DEAD 눌렀는데 아무 반응 없음 · TEXT 화면에 NaN·undefined 같은 글자 · LINK 깨진 링크
//   ERR  화면 코드 오류·콘솔 오류·앱 파일 못 받음(404)·점검 실패
// 빠른 이유: 가짜 시계(page.clock)로 앱의 setTimeout·애니메이션 시간을 바로 돌리고(진짜로는 파일 받는 동안만 기다림),
//   밖으로 나가는 주소는 막고, 버튼 하나에 브라우저와 두 번만 주고받고, 버튼 많은 화면(메시지함)은 창 3개가 나눠 눌러요.
//   2026-11-20: 232초 → 31초 (CPU 4개, 화면 38개, 버튼 1,767개)
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const BASE = opt('--base-url', 'http://127.0.0.1:8765/');
const GIT_BASE = opt('--base', 'origin/main');
const ALLOW = opt('--allow', path.join(__dirname, 'jump-audit-allow.txt'));
const WORKERS = Math.max(1, Math.min(6, Number(opt('--workers', os.cpus().length)) || 1));
const CHANGED = flag('--changed');
const QUICK = flag('--quick') || CHANGED;
const only = args[0] ? args[0].split(',') : null;
const ROOT = path.join(__dirname, '..');

const SCREENS = [
  ['home', 'kr'], ['home', 'us'],
  ...['news', 'learn', 'drop', 'cal', 'earn', 'watch', 'movers', 'heat', 'sectors', 'policy', 'flows', 'disclose', 'quiet', 'macro', 'edit'].map((k) => ['more:' + k, 'kr']),
  ['more:sectors', 'us'], ['more:heat', 'us'], ['report', 'kr'], ['watch', 'kr'], ['watch', 'us'],
  ['tools:asset', 'kr'], ['tools:sav', 'kr'], ['tools:lab', 'kr'], ['tools:lab', 'us'], ['tools:cal', 'kr'], ['tools:stress', 'kr'], ['tools:goal', 'kr'],
  ['chart', 'kr'], ['chart', 'us'], ['search', 'kr'], ['map', 'kr'], ['inbox', 'kr'], ['world', 'kr'], ['help', 'kr'], ['feedback', 'kr'],
  ['stock:005930', 'kr'], ['stock:AAPL', 'us'],
];
const SEL = '#app button, #app summary, #app [role=button], #app li[data-stock], #app a, #app input[type=checkbox], #app input[type=radio], #app label';

// ---------------------------------------------------------------- 빠른 점검: 바뀐 코드가 쓰이는 화면 고르기
// 앱 코드(site/js/*.js)를 맨 왼쪽에서 시작하는 정의(function X / const X = ...)로 나누고, 화면마다 그리는 함수에서 부르는 함수를 따라가요.
// 바뀐 줄이 어느 화면에서도 안 쓰이면(또는 render처럼 모든 화면이 쓰는 곳이면) 안전하게 전부 점검해요.
const HUBS = new Set(['render', 'go', 'back', 'openMore', 'openStock', 'selectMarket', 'openMap', 'keepTap', 'holdHeight', 'releaseHold', 'keepRow', 'tapSig', 'tapBox', 'tapAll']);
function splitDefs(src) {
  const lines = src.split('\n'), defs = [];
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
  lines.forEach((ln, i) => { const m = ln.match(re); if (m) defs.push({ name: m[1] || m[2], from: i + 1 }); });
  defs.forEach((d, k) => { d.to = k + 1 < defs.length ? defs[k + 1].from - 1 : lines.length; d.body = lines.slice(d.from - 1, d.to).join('\n'); });
  return { lines, defs };
}
function callGraph(defs) {
  const names = new Set(defs.map((d) => d.name)), g = {};
  for (const d of defs) {
    const ids = new Set((d.body.match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => names.has(x) && x !== d.name));
    g[d.name] = new Set([...(g[d.name] || []), ...ids]);
  }
  return g;
}
function screenRoots(src, defs) {
  const names = new Set(defs.map((d) => d.name));
  const ids = (s) => (s.replace(/(^|\s)\/\/.*$/, '').match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => names.has(x) && !HUBS.has(x));
  const def = (n) => defs.find((d) => d.name === n) || { body: '' };
  const views = def('VIEWS').body, render = def('render').body, more = def('homeMoreRows').body, perf = def('PERF_TABS').body;
  const roots = {};
  for (const [sc] of SCREENS) {
    const [s, arg] = sc.split(':');
    const r = new Set();
    const vl = views.split('\n').filter((l) => new RegExp(`^\\s*${s}:`).test(l));
    // VIEWS 한 항목이 여러 줄이면 다음 항목 전까지 이어 붙여요
    const vi = views.split('\n').findIndex((l) => new RegExp(`^\\s*${s}:`).test(l));
    if (vi >= 0) { const vv = views.split('\n'); for (let j = vi + 1; j < vv.length && !/^\s*[a-z]+:\s*\(/.test(vv[j]) && !/^};/.test(vv[j]); j++) vl.push(vv[j]); }
    vl.forEach((l) => ids(l).forEach((x) => r.add(x)));
    render.split('\n').filter((l) => l.includes(`screen === "${s}"`) && (!/moreKey === "/.test(l) || l.includes(`moreKey === "${arg}"`))).forEach((l) => ids(l).forEach((x) => r.add(x)));
    // 더 보기 칸·도구 탭 화면은 그 칸만 그려요: 칸 목록(homeMoreRows·PERF_TABS)을 따라가면 다른 칸까지 다 딸려 와서 막아요
    r.block = new Set();
    if (s === 'more' && arg) { r.block.add('homeMoreRows'); r.add('moreView'); const ml = more.split('\n'), a0 = ml.findIndex((l) => l.includes(`add("${arg}"`));
      for (let j = a0; a0 >= 0 && j < ml.length && (j === a0 || !/\badd\("/.test(ml[j])) && !/^\s*\/\//.test(ml[j]); j++) ids(ml[j]).forEach((x) => r.add(x)); }
    if (s === 'tools' && arg) { r.block.add('PERF_TABS'); r.add('perfTabsBar'); perf.split('\n').filter((l) => l.includes(`["${arg}"`)).forEach((l) => ids(l).forEach((x) => r.add(x))); }
    roots[sc] = r;
  }
  return roots;
}
function reach(g, roots, block = new Set()) {
  const seen = new Set(), stack = [...roots];
  while (stack.length) { const n = stack.pop(); if (seen.has(n) || HUBS.has(n) || block.has(n)) continue; seen.add(n); (g[n] || []).forEach((x) => stack.push(x)); }
  return seen;
}
function changedScreens() {
  let files;
  try { files = execSync(`git diff --name-only ${GIT_BASE}...HEAD && git diff --name-only HEAD`, { cwd: ROOT }).toString().split('\n').filter(Boolean); }
  catch (e) { console.log(`git diff 실패 (${GIT_BASE}) → 전부 점검`); return null; }
  files = [...new Set(files)];
  const site = files.filter((f) => f.startsWith('site/') || f === 'dashboard.py' || f.startsWith('paper/'));
  if (!site.length) { console.log('화면 코드가 안 바뀌었어요 → 점검할 화면 없음'); return []; }
  // 앱 코드는 화면별 파일(site/js/*.js, 2026-11-20)이에요. 파일들을 한 줄로 이어 붙인 것처럼 줄 번호를 매겨요
  const other = site.filter((f) => !/^site\/js\/[\w-]+\.js$/.test(f));
  if (other.length) { console.log(`앱 코드(site/js) 말고도 바뀜(${other.join(', ')}) → 전부 점검`); return null; }
  const jsFiles = fs.readdirSync(path.join(ROOT, 'site/js')).filter((f) => f.endsWith('.js')).sort();
  const offset = {};
  let src = '';
  for (const f of jsFiles) { offset[`site/js/${f}`] = src ? src.split('\n').length : 0; src += (src ? '\n' : '') + fs.readFileSync(path.join(ROOT, 'site/js', f), 'utf8').replace(/\n$/, ''); }
  const { defs } = splitDefs(src);
  const lines = [];
  for (const f of site) {
    if (!(f in offset)) { console.log(`지운 파일(${f}) → 전부 점검`); return null; }
    const diff = execSync(`git diff -U0 ${GIT_BASE} -- ${f}`, { cwd: ROOT }).toString();
    for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const a = Number(m[1]), n = m[2] == null ? 1 : Number(m[2]);
      for (let k = 0; k < Math.max(n, 1); k++) lines.push(offset[f] + a + k);  // 지운 줄만 있으면 그 자리 한 줄
    }
  }
  const touched = new Set();
  for (const ln of lines) { const d = defs.find((x) => ln >= x.from && ln <= x.to); if (!d) { console.log(`정의 밖(${ln}번째 줄)이 바뀜 → 전부 점검`); return null; } touched.add(d.name); }
  const hub = [...touched].filter((n) => HUBS.has(n) || n === 'VIEWS' || n === 'SCREENS');
  if (hub.length) { console.log(`모든 화면이 쓰는 곳이 바뀜(${hub.join(', ')}) → 전부 점검`); return null; }
  const g = callGraph(defs), roots = screenRoots(src, defs);
  const pick = SCREENS.filter(([sc]) => { const r = reach(g, roots[sc], roots[sc].block); return [...touched].some((n) => r.has(n)); }).map(([sc]) => sc);
  const used = new Set(SCREENS.flatMap(([sc]) => [...reach(g, roots[sc], roots[sc].block)]));
  const orphan = [...touched].filter((n) => !used.has(n));
  if (orphan.length) { console.log(`어느 화면에서 쓰는지 못 찾음(${orphan.join(', ')}) → 전부 점검`); return null; }
  console.log(`바뀐 함수: ${[...touched].join(', ')}`);
  return [...new Set(pick)];
}

// ---------------------------------------------------------------- 화면 하나 점검
// 오작동 잡기: 누를 때마다 아래 것도 같이 봐요
//   ERR  화면 코드 오류(pageerror) · 콘솔 오류(console.error) · 앱 파일이 안 받아짐(404 등)
//   TEXT 화면 글자에 NaN·undefined·null·[object Object]·Infinity가 보임
//   DEAD 눌렀는데 아무 반응 없음(화면·주소·스크롤·포커스·새 창 전부 그대로) — 허용 목록에 없으면 실패
//   LINK 밖으로 나가는 링크 주소가 비었거나 이상함
// 빠르게: 가짜 시계(page.clock)로 앱의 setTimeout·requestAnimationFrame을 바로 돌려요 (0.25초 뒤 keepTap, 1.5초 뒤 holdHeight 등)
//   → 진짜로 기다리는 건 파일 받는 동안만. 밖으로 나가는 주소(뉴스 원문·텔레그램 등)는 받지 않고 막아요.
const NO_FILE_OK = /^\/(stocks|indexes)\//;
const SPLIT = { inbox: 3 };
const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|(?<![\w.])null(?![\w])|\bInfinity\b/;
async function auditScreen(browser, sc, m, part = 0, parts = 1) {
  const t0 = Date.now(), out = [], res = { sc, m, part, parts, out, pressed: 0, ms: 0, last: '' };
  try { await auditInner(browser, sc, m, res); }
  catch (e) { out.push(`ERR  ${sc}/${m} 점검 실패${res.last ? ` (${res.last} 누른 뒤)` : ''}: ${e.message.split('\n')[0]}`); }
  res.ms = Date.now() - t0;
  return res;
}
async function auditInner(browser, sc, m, res) {
  const out = res.out, seenText = new Set(), seenErr = new Set();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const origin = new URL(BASE).origin;
  // 밖으로 나가는 주소는 막아요 (진짜 뉴스 사이트를 여느라 느려지고, 클라우드는 막혀 있기도 해요)
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  let popups = 0;
  const page = await ctx.newPage();
  // 새 창이 생기면 세기만 해요 (가짜 시계가 창 전체에 걸려 있어서 닫으면 점검이 끊겨요)
  ctx.on('page', (p) => { if (p !== page) popups++; });
  const err = (msg) => { const k = msg.slice(0, 160); if (seenErr.has(k)) return; seenErr.add(k); out.push(`ERR  ${sc}/${m} ${k}`); };
  page.on('dialog', (d) => d.dismiss());
  page.on('crash', () => err(`화면이 멈춤(crash)${res.last ? ` — ${res.last} 누른 뒤` : ''}`));
  page.on('pageerror', (e) => err(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(msg.text())) err('콘솔: ' + msg.text()); });
  // stocks/·indexes/는 pages 워크플로에서 stock_pages.py가 시세를 받아 만드는 파일이라 점검용 빌드(dashboard.py만)엔 없어요
  page.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && !NO_FILE_OK.test(r.url().slice(origin.length))) err(`파일 못 받음 ${r.status()} ${r.url().slice(origin.length)}`); });
  // 받는 중인 파일 수(fetch)와 화면 바뀜 수를 세요: 다 받았는지, 누른 뒤 반응이 있었는지 알려고
  await page.addInitScript(([m, BAD]) => {
    try { localStorage.setItem('market', m); localStorage.setItem('guide_v1', '1'); } catch (e) {}
    window.__net = 0; window.__mut = 0;
    const f = window.fetch;
    window.fetch = function () { window.__net++; return f.apply(this, arguments).finally(() => { window.__net--; }); };
    window.open = () => { window.__opened = (window.__opened || 0) + 1; return null; };
    // 밖으로 나가는 링크(새 창)는 열지 않고 센 것만: 앱의 클릭 처리(핫 뉴스 읽음 표시 등)는 그대로 돌아요
    // 앱 안 링크가 # 주소가 아닌 다른 페이지로 가면(앱이 사라짐) 막고 고장으로 알려요
    window.__away = [];
    window.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      if (a.target === '_blank' || !a.href.startsWith(location.origin)) { e.preventDefault(); window.__opened = (window.__opened || 0) + 1; return; }
      const u = new URL(a.href); if (u.pathname !== location.pathname || u.search !== location.search) { e.preventDefault(); window.__opened = (window.__opened || 0) + 1; window.__away.push(a.getAttribute('href')); }
    }, true);
    window.__dirty = new Set();
    new MutationObserver((l) => { window.__mut += l.length; for (const r of l) { if (r.type === 'characterData') window.__dirty.add(r.target.parentElement); else r.addedNodes.forEach((n) => window.__dirty.add(n.nodeType === 1 ? n : n.parentElement)); } }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    window.__scan = (full) => {
      const re = new RegExp(BAD), found = [];
      const roots = full ? [document.querySelector('#app') || document.body] : [...window.__dirty].filter((n) => n && n.isConnected && n.closest && n.closest('#app'));
      window.__dirty = new Set();
      for (const root of roots) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const t = n.nodeValue; if (!re.test(t)) continue;
          const p = n.parentElement; if (!p || p.closest('script,style,[hidden]') || !p.getClientRects().length) continue;
          const mm = t.match(re), at = Math.max(0, mm.index - 18);
          found.push(t.slice(at, mm.index + 22).replace(/\s+/g, ' ').trim());
        }
        // 링크 주소도 봐요: 비었거나 undefined·null·NaN이 들어간 주소
        (root.matches && root.matches('a[href]') ? [root] : []).concat([...root.querySelectorAll('a[href]')]).forEach((a) => { const h = a.getAttribute('href'); if (!h || /undefined|null|NaN/.test(h) || (h.startsWith('http') && !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(h))) found.push('LINK ' + (a.textContent || '').trim().slice(0, 20) + ' → ' + h); });
      }
      return [...new Set(found)];
    };
  }, [m, BAD_TEXT.source]);
  await page.clock.install();
  await page.goto(BASE);
  // 가짜 시계에서는 앱 시간이 저절로 안 가요. 조금씩 앞으로 돌리면서 파일 다 받을 때까지
  const run = async (ms) => { await page.clock.runFor(ms); };
  const quiet = async (minMs, maxMs, probe) => {
    let spent = 0, last = null, same = 0;
    while (spent < maxMs) {
      const step = spent < minMs ? minMs - spent : 100;
      await run(step); spent += step;
      const s = await page.evaluate((probe) => {
        let top = null;
        if (probe && window.__probe) { const p = window.__probe, again = tapAll(p.sig, p.box)[p.idx]; top = again ? again.getBoundingClientRect().top : null; }
        // 지도·도구·의견 화면 파일은 열 때 받아요(core.js LAZY): 받는 동안도 기다려요
        const lazy = typeof screenReady === 'function' && typeof screen !== 'undefined' && !screenReady(screen);
        return { net: window.__net + (lazy ? 1 : 0), k: `${top}|${scrollY}|${typeof screen !== 'undefined' ? screen : ''}|${location.hash}|${document.documentElement.scrollHeight}` };
      }, probe);
      if (s.net > 0) { await new Promise((r) => setTimeout(r, 15)); last = null; same = 0; continue; }
      if (spent >= minMs) { if (s.k === last) { if (++same >= 1) return; } else same = 0; }
      last = s.k;
    }
  };
  await quiet(300, 5000);
  await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA, null, { polling: 30 });
  const [s, arg] = sc.split(':');
  const open = async () => {
    await page.evaluate(([s, arg, m]) => {
      if (market !== m) selectMarket(m);
      if (s === 'tools' && arg) { perfTabKey = arg; }
      if (s === 'stock') { openStock(arg); } else if (s === 'more') { openMore(arg); } else { if (screen === s) { lastView = ''; render(); } else go(s); }
    }, [s, arg, m]);
    await (s === 'stock' ? quiet(1500, 4000) : quiet(400, 3000));
  };
  // 이상한 글자 찾기: 처음엔 화면 전체, 누른 뒤엔 바뀐 곳만 봐요 (빠르게)
  const report = (hits, label) => { for (const h of hits) { if (seenText.has(h)) continue; seenText.add(h); out.push(`${h.startsWith('LINK ') ? 'LINK' : 'TEXT'} ${sc}/${m} "${h.replace(/^LINK /, '')}" (${label})`); } };
  const scanAll = async (label) => report(await page.evaluate(() => window.__scan(true)), label);
  await open();
  await scanAll('처음');
  for (let i = 0; i < 600; i++) {
    // 한 번에: 버튼 찾기 → 못 누르는 건 건너뛰기 → 화면 가운데로 → 가려졌는지 → 누를 자리·누르기 전 위치 기억 (전에는 4번 오갔어요)
    const info = await page.evaluate(([SEL, i, part, parts, quick, tools]) => {
      const el = document.querySelectorAll(SEL)[i];
      if (!el) return { end: i >= document.querySelectorAll(SEL).length };
      // 나눠 누르기: 긴 화면은 칸 안 묶음(#app 아래 두 번째 층)마다 번갈아 맡아요. 한 묶음 안 버튼은 한 창이 다 눌러요 (접힌 칸 열고 안쪽까지)
      if (parts > 1) { let x = el; while (x.parentElement && x.parentElement.parentElement && x.parentElement.parentElement.id !== 'app') x = x.parentElement; const g = x.parentElement && x.parentElement.parentElement && x.parentElement.parentElement.id === 'app' ? [...x.parentElement.children].indexOf(x) : 0; if (g % parts !== part) return null; }
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') return null;
      // 닫힌 details 안이면 못 누르니 건너뛰어요. 바깥 details까지 다 봐요 (크롬은 닫힌 칸 안도 크기를 돌려줘서, 전에는 접힌 메시지 안 '자세히'를 헛눌렀어요)
      const from = el.tagName === 'SUMMARY' && el.parentElement && el.parentElement.tagName === 'DETAILS' ? el.parentElement.parentElement : el.parentElement;
      if (from && from.closest('details:not([open])')) return null;
      const dn = el.getAttributeNames().filter((a) => a.startsWith('data-'));
      const data = dn.map((a) => a + '=' + el.getAttribute(a)).join('&');
      if (tools && /data-perf-tab/.test(data)) return null;
      const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      const chain = []; for (let x = el.parentElement; x && x.id !== 'app'; x = x.parentElement) if (x.id || x.tagName === 'DETAILS' || x.tagName === 'SECTION') chain.push(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (x.className ? '.' + String(x.className).split(' ')[0] : ''));
      // 빠른 점검: 같은 칸의 같은 종류 버튼(종목 줄 ★ 등)은 3개까지만 눌러요
      const kind = el.tagName + dn.join('&') + '@' + chain.slice(0, 2).join('<') + (dn.length ? '' : '|' + txt);
      if (quick) { const k = (window.__kinds = window.__kinds || {}); k[kind] = (k[kind] || 0) + 1; if (k[kind] > 3) return null; }
      window.scrollBy(0, r.top - 380);
      const H = document.documentElement.scrollHeight, y0 = scrollY;
      const base = { chain: chain.slice(0, 4).join('<'), H, y: y0, tag: el.tagName, txt, data, href: el.tagName === 'A' ? el.getAttribute('href') || '' : '', disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true', scr: screen, hash: location.hash };
      // 고정된 칸(일정 달력 .ec-pin, 위 막대·아래 메뉴 등 sticky/fixed)에 가려져 있으면 아래로 옮겨 다시 보고, 그래도 가려지면 건너뛰어요 (가린 걸 대신 눌러 버려서)
      // 가로 줄 밖으로 밀려난 버튼은 줄을 밀어서 화면 끝에 반쯤 걸치게 해요 (사람이 누르는 자리)
      const row = el.parentElement && el.parentElement.closest('.idx-chips, .wt-tabs, .ec-months');
      if (row) { const q = el.getBoundingClientRect(), rr = row.getBoundingClientRect(); if (q.left > rr.right - 20) row.scrollLeft += q.left - (rr.right - 30); else if (q.right < rr.left + 20) row.scrollLeft -= (rr.left + 30) - q.right; }
      const pinned = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'sticky' || p === 'fixed') return true; } return false; };
      const hit = () => { const q = el.getClientRects()[0] || el.getBoundingClientRect(); const e = document.elementFromPoint(Math.min(Math.max(q.left + Math.min(q.width / 2, 20), 1), innerWidth - 2), q.top + Math.min(q.height / 2, 10)); return !e || el === e || el.contains(e) || !pinned(e) || pinned(el); };
      if (!hit()) { window.scrollBy(0, el.getBoundingClientRect().top - 600); if (!hit()) return { ...base, covered: true }; }
      // 누를 자리: 가로로 미는 줄처럼 잘려 보이는 칸이면 보이는 부분 가운데를 눌러요 (전에는 줄 밖 잘린 곳을 헛눌렀어요)
      const r0 = el.getBoundingClientRect();
      let L = r0.left, R = Math.min(r0.right, innerWidth - 2);
      for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) { if (getComputedStyle(x).overflowX !== 'visible') { const b = x.getBoundingClientRect(); L = Math.max(L, b.left + 1); R = Math.min(R, b.right - 1); } }
      const w = Math.max(2, R - L), cx = L + w / 2, cy = r0.top + Math.min(r0.height / 2, 20);
      // 누르기 전 위치를 tapSig 방식으로 기억 (다시 그리면 요소가 바뀌어서) + 반응 세기 시작
      const sig = tapSig(el), box = typeof tapBox === 'function' ? tapBox(el) : '';
      window.__probe = { sig, box, idx: tapAll(sig, box).indexOf(el), top: r0.top };
      window.__mut = 0; window.__opened = 0; window.__dirty = new Set();
      const at = document.elementFromPoint(cx, cy);
      const hitAt = !at || at === el || el.contains(at) ? '' : at.tagName.toLowerCase() + (at.id ? '#' + at.id : '') + (at.className && typeof at.className === 'string' ? '.' + at.className.split(' ')[0] : '');
      return { ...base, y: scrollY, top: r0.top, cx, cy, hitAt, focus: /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) ? String(document.activeElement.outerHTML).slice(0, 80) : '' };
    }, [SEL, i, res.part, res.parts, QUICK, s === 'tools']);
    if (!info) continue;
    if (info.end) break;
    if (info.covered) { out.push(`skip ${sc}/${m} #${i} ${info.tag} "${info.txt}" (가려져서 못 누름)`); continue; }
    const pop0 = popups;
    await page.mouse.click(info.cx, info.cy);
    res.pressed++;
    res.last = `#${i} ${info.tag} "${info.txt}"`;
    // 앱이 0.25초 뒤에 한 번 더 맞추니(keepTap) 가짜 시계로 0.35초 돌리고, 위치·스크롤·높이가 그대로면 끝 (받는 파일이 있으면 받을 때까지), 길어도 앱 시간 3초
    await quiet(350, 3000, true);
    // 한 번에: 누른 뒤 위치 · 바뀐 곳 글자 검사 · 용어 풀이 닫기 · 입력칸 포커스 풀기
    const after = await page.evaluate(() => {
      const p = window.__probe, again = tapAll(p.sig, p.box)[p.idx];
      const a = { top: again ? again.getBoundingClientRect().top : null, y: scrollY, scr: screen, hash: location.hash, H: document.documentElement.scrollHeight, mut: window.__mut, opened: window.__opened || 0, focus: /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) ? String(document.activeElement.outerHTML).slice(0, 80) : '' };
      a.hits = (a.mut ? window.__scan(false) : []).concat(window.__away.splice(0).map((h) => 'LINK 앱 밖 페이지로 가는 링크 → ' + h));
      if (document.querySelector('.term-sheet') && typeof closeTerm === 'function') closeTerm();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return a;
    });
    const moved = after.scr !== info.scr || after.hash !== info.hash;
    const dy = after.top == null ? null : Math.round(after.top - info.top);
    const dScroll = Math.round(after.y - info.y);
    const bad = !moved && (dy == null ? Math.abs(dScroll) > 2 : Math.abs(dy) > 2);
    // 반응 없음: 화면 바뀜 0, 주소·스크롤 그대로, 입력칸 포커스 그대로(누른 버튼에 포커스 가는 건 반응 아님), 새 창 없음. 밖으로 나가는 링크(새 창)·막힌 버튼·입력칸은 빼요
    const reacted = moved || after.mut > 0 || Math.abs(dScroll) > 2 || after.opened || popups > pop0 || after.focus !== info.focus;
    const dead = !reacted && !info.disabled && !/^https?:/.test(info.href) && !/INPUT|LABEL/.test(info.tag);
    out.push(`${bad ? 'MOVE' : dead ? 'DEAD' : moved ? 'NAV ' : 'ok  '} ${sc}/${m} #${i} ${info.tag} [${info.data}] "${info.txt}" dy=${dy} dScroll=${dScroll}${moved ? ' -> ' + after.scr : ''}${bad ? ` H ${info.H}->${after.H} y ${info.y} in ${info.chain}` : ''}${dead ? ` in ${info.chain}${info.hitAt ? ` (누른 자리에 ${info.hitAt}가 덮고 있음)` : ''}` : ''}`);
    report(after.hits, `"${info.txt}" 누른 뒤`);
    if (moved) { await open(); await scanAll(`"${info.txt}" 누르고 간 화면`); }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 여러 화면을 나눠서 동시에
(async () => {
  const T0 = Date.now();
  let list = SCREENS;
  if (CHANGED) {
    const pick = changedScreens();
    if (pick) list = SCREENS.filter(([sc]) => pick.includes(sc));
  }
  if (only) list = list.filter(([sc]) => only.some((o) => sc === o || sc.startsWith(o + ':') || sc.startsWith(o)));
  console.log(`점검할 화면 ${list.length}개 · 동시에 ${WORKERS}개${QUICK ? ' · 빠른 점검(같은 종류 3개까지)' : ''}`);
  if (!list.length) return;
  const browser = await chromium.launch();
  // 오래 걸리는 화면(홈·관심·종목·검색·지도)을 먼저 꺼내야 끝에 한 화면만 혼자 도는 시간이 줄어요
  const heavy = (sc) => { const i = ['inbox', 'tools:asset', 'search', 'map', 'more:learn', 'more:heat', 'more:cal'].findIndex((x) => sc.startsWith(x)); return i < 0 ? 99 : i; };
  // 버튼이 아주 많은 화면은 여러 창이 나눠 눌러요 (메시지함 456개 → 창 3개). 나머지가 끝나길 혼자 기다리는 시간이 줄어요
  const queue = [...list].sort((a, b) => heavy(a[0]) - heavy(b[0])).flatMap(([sc, m]) => { const n = WORKERS > 1 ? SPLIT[sc] || 1 : 1; return Array.from({ length: n }, (_, k) => [sc, m, k, n]); });
  const results = [];
  await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
    while (queue.length) {
      const [sc, m, part, parts] = queue.shift();
      results.push(await auditScreen(browser, sc, m, part, parts));
    }
  }));
  await browser.close();
  const order = (r) => list.findIndex(([sc, m]) => sc === r.sc && m === r.m) * 10 + r.part;
  results.sort((a, b) => order(a) - order(b));
  const lines = results.flatMap((r) => r.out);
  console.log(lines.join('\n'));
  console.log('\n화면별 시간');
  results.forEach((r) => console.log(`  ${(r.ms / 1000).toFixed(1).padStart(6)}초  ${String(r.pressed).padStart(4)}번  ${r.sc}/${r.m}${r.parts > 1 ? ` (${r.part + 1}/${r.parts})` : ''}`));
  // 허용 목록: 일부러 화면이 움직이는 버튼(정책 ↔ 업종 이동 등)·일부러 반응 없는 버튼. 한 줄에 정규식 하나, # 뒤는 설명
  const allow = fs.existsSync(ALLOW) ? fs.readFileSync(ALLOW, 'utf8').split('\n').map((l) => l.replace(/\s+#.*$/, '').trim()).filter((l) => l && !l.startsWith('#')).map((l) => new RegExp(l)) : [];
  const ok = (l) => allow.some((re) => re.test(l));
  const pick = (k) => lines.filter((l) => l.startsWith(k));
  const moves = pick('MOVE'), dead = pick('DEAD'), texts = [...pick('TEXT'), ...pick('LINK')], errs = pick('ERR');
  const bad = [...moves, ...dead, ...texts].filter((l) => !ok(l));
  const total = results.reduce((a, r) => a + r.pressed, 0), secs = ((Date.now() - T0) / 1000).toFixed(0);
  const n = (arr) => `${arr.length}개${arr.some(ok) ? `(허용 ${arr.filter(ok).length})` : ''}`;
  const line = `누른 버튼 ${total}개 · 화면 밀림 ${n(moves)} · 반응 없음 ${n(dead)} · 이상한 글자·링크 ${n(texts)} · 오류 ${errs.length}개 · 걸린 시간 ${secs}초`;
  console.log('\n' + line);
  if (bad.length) { console.log('\n허용 목록에 없는 문제:'); bad.forEach((l) => console.log('  ' + l)); }
  if (errs.length) { console.log('\n오류:'); errs.forEach((l) => console.log('  ' + l)); }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 버튼 누르기 점검\n\n${line}\n\n${[...bad, ...errs].map((l) => `- \`${l.replace(/`/g, "'")}\``).join('\n')}\n`);
  }
  process.exitCode = bad.length || errs.length ? 1 : 0;
})();
