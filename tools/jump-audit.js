// 버튼 누르기 점검: 화면마다 누를 수 있는 걸 전부 눌러 보고, 누른 요소의 화면 높이가 변했는지 재요 (사용자 규칙: 눌러도 화면 그대로)
//
//   python dashboard.py --out _site && (cd _site && python -m http.server 8765 &)
//   node tools/jump-audit.js                 # 전체 점검 (PR 때 GitHub Actions가 이걸 돌려요)
//   node tools/jump-audit.js --changed       # 빠른 점검: main과 다른 코드가 쓰이는 화면만, 같은 종류 버튼은 3개까지만
//   node tools/jump-audit.js home,more:news  # 고른 화면만 (앞부분만 맞아도 돼요: more = 더 보기 칸 전부)
//
// 옵션: --workers N (동시에 여는 브라우저 화면 수, 기본 CPU 수, 최대 6) · --base <git 기준, 기본 origin/main>
//       --quick (같은 종류 버튼 3개까지만) · --base-url http://127.0.0.1:8765/ · --allow tools/jump-audit-allow.txt
// 끝나면 MOVE(화면이 밀린 버튼)가 허용 목록에 없을 때 종료 코드 1이에요.
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
  ...['news', 'learn', 'drop', 'cal', 'earn', 'watch', 'movers', 'heat', 'sectors', 'policy', 'flows', 'disclose', 'quiet', 'macro'].map((k) => ['more:' + k, 'kr']),
  ['more:sectors', 'us'], ['more:heat', 'us'], ['report', 'kr'], ['watch', 'kr'], ['watch', 'us'],
  ['tools:asset', 'kr'], ['tools:sav', 'kr'], ['tools:lab', 'kr'], ['tools:lab', 'us'], ['tools:cal', 'kr'], ['tools:stress', 'kr'], ['tools:goal', 'kr'],
  ['chart', 'kr'], ['chart', 'us'], ['search', 'kr'], ['map', 'kr'], ['inbox', 'kr'], ['world', 'kr'], ['help', 'kr'], ['feedback', 'kr'],
  ['stock:005930', 'kr'], ['stock:AAPL', 'us'],
];
const SEL = '#app button, #app summary, #app [role=button], #app li[data-stock], #app a, #app input[type=checkbox], #app input[type=radio], #app label';

// ---------------------------------------------------------------- 빠른 점검: 바뀐 코드가 쓰이는 화면 고르기
// app.js를 맨 왼쪽에서 시작하는 정의(function X / const X = ...)로 나누고, 화면마다 그리는 함수에서 부르는 함수를 따라가요.
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
  const other = site.filter((f) => f !== 'site/app.js');
  if (other.length) { console.log(`app.js 말고도 바뀜(${other.join(', ')}) → 전부 점검`); return null; }
  const src = fs.readFileSync(path.join(ROOT, 'site/app.js'), 'utf8');
  const { defs } = splitDefs(src);
  const diff = execSync(`git diff -U0 ${GIT_BASE} -- site/app.js`, { cwd: ROOT }).toString();
  const lines = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const a = Number(m[1]), n = m[2] == null ? 1 : Number(m[2]);
    for (let k = 0; k < Math.max(n, 1); k++) lines.push(a + k);  // 지운 줄만 있으면 그 자리 한 줄
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
async function auditScreen(browser, sc, m) {
  const t0 = Date.now(), out = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  page.on('pageerror', (e) => out.push(`ERR  ${sc}/${m} ${e.message}`));
  // 처음 쓰는 사람 사용법 안내가 화면을 덮지 않게 이미 본 걸로 해요
  await page.addInitScript((m) => { try { localStorage.setItem('market', m); localStorage.setItem('guide_v1', '1'); } catch (e) {} }, m);
  await page.goto(BASE);
  await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA);
  const [s, arg] = sc.split(':');
  // 화면이 다 그려질 때까지(높이가 0.4초 동안 그대로) 기다려요. 종목 화면은 차트·재무제표가 늦게 와서 넉넉히
  const settle = async (min, max) => {
    await page.evaluate(([min, max]) => new Promise((res) => {
      const st = performance.now(); let h = -1, since = st;
      const tick = () => {
        const now = performance.now(), H = document.documentElement.scrollHeight;
        if (H !== h) { h = H; since = now; }
        if ((now - st >= min && now - since >= 400) || now - st >= max) res(); else setTimeout(tick, 50);
      };
      tick();
    }), [min, max]);
  };
  const open = async () => {
    await page.evaluate(([s, arg, m]) => {
      if (market !== m) selectMarket(m);
      if (s === 'tools' && arg) { perfTabKey = arg; }
      if (s === 'stock') { openStock(arg); } else if (s === 'more') { openMore(arg); } else { if (screen === s) { lastView = ''; render(); } else go(s); }
    }, [s, arg, m]);
    await (s === 'stock' ? settle(1500, 3000) : settle(400, 2000));
  };
  await open();
  const kinds = {};
  let pressed = 0;
  for (let i = 0; i < 600; i++) {
    const info = await page.evaluate(([SEL, i]) => {
      const el = document.querySelectorAll(SEL)[i];
      if (!el) return { end: i >= document.querySelectorAll(SEL).length };
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') return null;
      // 닫힌 details 안이면 못 누르니 건너뛰어요
      const det = el.parentElement && el.parentElement.closest('details:not([open])');
      if (det && !(el.tagName === 'SUMMARY' && el.parentElement === det)) return null;
      window.scrollBy(0, r.top - 380);
      const r2 = el.getBoundingClientRect();
      const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      const dn = el.getAttributeNames().filter((a) => a.startsWith('data-'));
      const data = dn.map((a) => a + '=' + el.getAttribute(a)).join('&');
      window.__el = el;
      const chain = []; for (let x = el.parentElement; x && x.id !== 'app'; x = x.parentElement) if (x.id || x.tagName === 'DETAILS' || x.tagName === 'SECTION') chain.push(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (x.className ? '.' + String(x.className).split(' ')[0] : ''));
      return { chain: chain.slice(0, 4).join('<'), H: document.documentElement.scrollHeight, top: r2.top, y: scrollY, tag: el.tagName, txt, data, kind: el.tagName + dn.join('&') + '@' + chain.slice(0, 2).join('<') + (dn.length ? '' : '|' + txt), scr: screen, hash: location.hash };
    }, [SEL, i]);
    if (!info) continue;
    if (info.end) break;
    if (s === 'tools' && /data-perf-tab/.test(info.data)) continue;
    // 빠른 점검: 같은 칸의 같은 종류 버튼(종목 줄 ★ 등)은 3개까지만 눌러요
    if (QUICK) { kinds[info.kind] = (kinds[info.kind] || 0) + 1; if (kinds[info.kind] > 3) continue; }
    // 고정된 칸(일정 달력 .ec-pin, 위 막대·아래 메뉴 등 sticky/fixed)에 가려져 있으면 아래로 옮겨 다시 보고, 그래도 가려지면 건너뛰어요 (가린 걸 대신 눌러 버려서)
    // 가로 줄 밖으로 밀려난 버튼은 줄을 밀어서 화면 끝에 반쯤 걸치게 해요 (사람이 누르는 자리)
    const covered = await page.evaluate(() => {
      const el = window.__el;
      const row = el.parentElement && el.parentElement.closest('.idx-chips, .wt-tabs, .ec-months');
      if (row) { const r = el.getBoundingClientRect(), rr = row.getBoundingClientRect(); if (r.left > rr.right - 20) row.scrollLeft += r.left - (rr.right - 30); else if (r.right < rr.left + 20) row.scrollLeft -= (rr.left + 30) - r.right; }
      const pinned = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'sticky' || p === 'fixed') return true; } return false; };
      const hit = () => { const r = el.getClientRects()[0] || el.getBoundingClientRect(); const e = document.elementFromPoint(Math.min(Math.max(r.left + Math.min(r.width / 2, 20), 1), innerWidth - 2), r.top + Math.min(r.height / 2, 10)); return !e || el === e || el.contains(e) || !pinned(e) || pinned(el); };
      if (hit()) return false;
      window.scrollBy(0, el.getBoundingClientRect().top - 600);
      return !hit();
    });
    if (covered) { out.push(`skip ${sc}/${m} #${i} ${info.tag} "${info.txt}" (가려져서 못 누름)`); continue; }
    // 누르기 전 위치를 tapSig 방식으로 기억 (다시 그리면 요소가 바뀌어서) + 누를 자리
    const pre = await page.evaluate(() => {
      const el = window.__el, r = el.getBoundingClientRect(), w = Math.min(r.right, innerWidth - 2) - r.left;
      const sig = tapSig(el), box = typeof tapBox === 'function' ? tapBox(el) : '';
      window.__probe = { sig, box, idx: tapAll(sig, box).indexOf(el), top: r.top };
      return { x: r.left, y: r.top, width: Math.max(2, Math.min(r.width, w)), height: r.height, top: r.top, sy: scrollY };
    });
    info.y = pre.sy;
    await page.mouse.click(pre.x + pre.width / 2, pre.y + Math.min(pre.height / 2, 20));
    pressed++;
    // 화면이 멈출 때까지 기다려요: 앱이 0.25초 뒤에 한 번 더 맞추니(keepTap) 최소 0.35초, 위치·스크롤이 0.15초 그대로면 끝 (부드럽게 내려가는 중이면 끝날 때까지), 길어도 2초
    const after = await page.evaluate(() => new Promise((res) => {
      const p = window.__probe, st = performance.now();
      let last = null, since = st;
      const snap = () => {
        const again = tapAll(p.sig, p.box)[p.idx];
        return { top: again ? again.getBoundingClientRect().top : null, y: scrollY, scr: screen, hash: location.hash, sheet: !!document.querySelector('.term-sheet'), H: document.documentElement.scrollHeight };
      };
      const tick = () => {
        const s = snap(), now = performance.now(), k = `${s.top}|${s.y}|${s.scr}|${s.hash}`;
        if (k !== last) { last = k; since = now; }
        if ((now - st >= 350 && now - since >= 150) || now - st >= 2000) res(s); else setTimeout(tick, 30);
      };
      setTimeout(tick, 30);
    }));
    const moved = after.scr !== info.scr || after.hash !== info.hash;
    const dy = after.top == null ? null : Math.round(after.top - pre.top);
    const dScroll = Math.round(after.y - info.y);
    const bad = !moved && (dy == null ? Math.abs(dScroll) > 2 : Math.abs(dy) > 2);
    out.push(`${bad ? 'MOVE' : moved ? 'NAV ' : 'ok  '} ${sc}/${m} #${i} ${info.tag} [${info.data}] "${info.txt}" dy=${dy} dScroll=${dScroll}${moved ? ' -> ' + after.scr : ''}${bad ? ` H ${info.H}->${after.H} y ${info.y} in ${info.chain}` : ''}`);
    if (after.sheet) await page.evaluate(() => closeTerm());
    if (moved) await open();
    // 입력칸에 포커스가 가면 키보드 없이 그대로
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  }
  await ctx.close();
  return { sc, m, out, pressed, ms: Date.now() - t0 };
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
  const heavy = (sc) => { const i = ['inbox', 'search', 'map', 'tools:asset', 'more:learn', 'more:heat', 'more:cal'].findIndex((x) => sc.startsWith(x)); return i < 0 ? 99 : i; };
  const queue = [...list].sort((a, b) => heavy(a[0]) - heavy(b[0]));
  const results = [];
  await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
    while (queue.length) {
      const [sc, m] = queue.shift();
      try { results.push(await auditScreen(browser, sc, m)); }
      catch (e) { results.push({ sc, m, out: [`ERR  ${sc}/${m} 점검 실패: ${e.message.split('\n')[0]}`], pressed: 0, ms: 0 }); }
    }
  }));
  await browser.close();
  const order = (r) => list.findIndex(([sc, m]) => sc === r.sc && m === r.m);
  results.sort((a, b) => order(a) - order(b));
  const lines = results.flatMap((r) => r.out);
  console.log(lines.join('\n'));
  console.log('\n화면별 시간');
  results.forEach((r) => console.log(`  ${(r.ms / 1000).toFixed(1).padStart(6)}초  ${String(r.pressed).padStart(4)}번  ${r.sc}/${r.m}`));
  // 허용 목록: 일부러 화면이 움직이는 버튼(정책 ↔ 업종 이동 등). 한 줄에 정규식 하나, # 뒤는 설명
  const allow = fs.existsSync(ALLOW) ? fs.readFileSync(ALLOW, 'utf8').split('\n').map((l) => l.replace(/\s+#.*$/, '').trim()).filter((l) => l && !l.startsWith('#')).map((l) => new RegExp(l)) : [];
  const moves = lines.filter((l) => l.startsWith('MOVE'));
  const bad = moves.filter((l) => !allow.some((re) => re.test(l)));
  const errs = lines.filter((l) => l.startsWith('ERR'));
  const total = results.reduce((a, r) => a + r.pressed, 0);
  console.log(`\n누른 버튼 ${total}개 · 화면 밀림 ${moves.length}개(허용 ${moves.length - bad.length}) · 오류 ${errs.length}개 · 걸린 시간 ${((Date.now() - T0) / 1000).toFixed(0)}초`);
  if (bad.length) { console.log('\n허용 목록에 없는 화면 밀림:'); bad.forEach((l) => console.log('  ' + l)); }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 버튼 누르기 점검\n\n누른 버튼 ${total}개 · 화면 밀림 ${bad.length}개 · 오류 ${errs.length}개 · ${((Date.now() - T0) / 1000).toFixed(0)}초\n\n${[...bad, ...errs].map((l) => `- \`${l.replace(/`/g, "'")}\``).join('\n')}\n`);
  }
  process.exitCode = bad.length || errs.length ? 1 : 0;
})();
