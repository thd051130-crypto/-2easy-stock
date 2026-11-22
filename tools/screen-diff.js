// 화면 비교: 두 주소(보통 main 코드 빌드 vs 지금 코드 빌드, 자료는 같음)의 같은 화면을 찍어 픽셀을 비교해요.
//   node tools/screen-diff.js <기준 주소> <새 주소> <사진 폴더> [--quick]
//   보통은 python tools/check.py diff 가 두 빌드를 띄우고 이걸 불러요.
// 시계는 같은 시각으로 멈추고(가짜 시계), 움직임은 끄고, 밖으로 나가는 주소는 막아요 → 코드가 같으면 사진도 같아요.
// 달라진 화면은 <폴더>/<화면>-before.png · -after.png · -diff.png(다른 곳 빨강)로 남겨요. 달라도 실패는 아니고 알려 줘요.
// 토큰 아끼기: <화면>-crop.png = 달라진 곳(최대 4곳, 곳마다 220px)만 잘라 전(왼쪽)·후(오른쪽)를 붙인 작은 사진. Claude는 이것만 열어 봐요.
// 검수 사진 모드: node tools/screen-diff.js --shots <주소> <폴더> [home:kr,tools:asset:kr]
//   → <화면>-light.png · -dark.png (2배 선명도, 사용자 검수용). 파일 이름만 찍고 Claude는 안 열어 봐요.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const SHOTS = args.includes('--shots');
const [A, B, OUT] = args.filter((a) => !a.startsWith('--'));
const SCREENS = QUICK
  ? [['home', 'kr'], ['home', 'us'], ['report', 'kr'], ['watch', 'kr'], ['chart', 'kr'], ['tools:asset', 'kr'], ['world', 'kr'], ['stock:005930', 'kr']]
  : [['home', 'kr'], ['home', 'us'], ...['news', 'learn', 'drop', 'cal', 'movers', 'heat', 'sectors', 'policy', 'macro'].map((k) => ['more:' + k, 'kr']),
    ['report', 'kr'], ['watch', 'kr'], ['watch', 'us'], ['chart', 'kr'], ['chart', 'us'], ['search', 'kr'], ['map', 'kr'], ['inbox', 'kr'], ['world', 'kr'], ['help', 'kr'], ['feedback', 'kr'],
    ...['asset', 'sav', 'lab', 'cal', 'stress', 'goal'].map((k) => ['tools:' + k, 'kr']), ['stock:005930', 'kr'], ['stock:AAPL', 'us']];
const NOW = new Date(Date.now() - (Date.now() % 3600000));  // 두 빌드가 같은 시각을 보게

async function shoot(browser, base, sc, m, scheme = 'light', scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, colorScheme: scheme, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const origin = new URL(base).origin;
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript((m) => { try { localStorage.setItem('market', m); localStorage.setItem('guide_v1', '1'); } catch (e) {} }, m);
  await page.clock.install({ time: NOW });
  await page.goto(base);
  const settle = async (ms) => {
    for (let t = 0; t < ms; t += 200) {
      await page.clock.runFor(200);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  await settle(1500);
  await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA, null, { polling: 50 });
  const [s, arg] = sc.split(':');
  await page.evaluate(([s, arg, m]) => {
    if (market !== m) selectMarket(m);
    if (s === 'tools' && arg) perfTabKey = arg;
    if (s === 'report' && arg) rpTab = arg;
    if (s === 'stock') openStock(arg); else if (s === 'more') openMore(arg); else { if (screen === s) { lastView = ''; render(); } else go(s); }
  }, [s, arg, m]);
  await settle(s === 'stock' ? 4000 : 2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  const png = await page.screenshot({ fullPage: true });
  await ctx.close();
  return png;
}

// 픽셀 비교는 브라우저 캔버스로 (따로 설치할 것 없이)
async function compare(browser, a, b) {
  const page = await browser.newPage();
  const r = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const get = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = get(ia), db = get(ib), c = new OffscreenCanvas(w, h), x = c.getContext('2d'), out = x.createImageData(w, h);
    let diff = 0;
    const rows = new Uint8Array(h);
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 24) { diff++; out.data[i] = 255; out.data[i + 3] = 255; rows[(i / 4 / w) | 0] = 1; }
      else { out.data[i] = out.data[i + 1] = out.data[i + 2] = db[i] * 0.3 + 160; out.data[i + 3] = 255; }
    }
    x.putImageData(out, 0, 0);
    const b64 = async (cv) => {
      const buf = new Uint8Array(await (await cv.convertToBlob()).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
    // 달라진 줄 묶음(40px 넘게 떨어지면 다른 묶음)을 최대 4개, 묶음마다 최대 220px만 잘라 전(왼)·후(오)를 나란히 쌓아요
    const bands = [];
    for (let y = 0; y < h; y++) {
      if (!rows[y]) continue;
      const last = bands[bands.length - 1];
      if (last && y - last[1] <= 40) last[1] = y; else bands.push([y, y]);
    }
    let crop = null;
    const pick = bands.slice(0, 4).map(([a, b]) => { const top = Math.max(0, a - 16); return [top, Math.min(h, b + 16, top + 220)]; });
    if (pick.length) {
      const H = pick.reduce((s, [a, b]) => s + (b - a) + 6, 0), cc = new OffscreenCanvas(w * 2 + 6, H), cx = cc.getContext('2d');
      cx.fillStyle = '#f0f'; cx.fillRect(0, 0, w * 2 + 6, H);
      let at = 0;
      for (const [a, b] of pick) {
        cx.drawImage(ia, 0, a, w, b - a, 0, at, w, b - a);
        cx.drawImage(ib, 0, a, w, b - a, w + 6, at, w, b - a);
        at += b - a + 6;
      }
      crop = await b64(cc);
    }
    const box = bands.length ? bands.slice(0, 4).map(([a, b]) => `${a}~${b}`).join(' ') + (bands.length > 4 ? ` 외 ${bands.length - 4}곳` : '') : '';
    return { diff, total: w * h, sizeA: `${ia.width}x${ia.height}`, sizeB: `${ib.width}x${ib.height}`, png: await b64(c), crop, box };
  }, [a.toString('base64'), b.toString('base64')]);
  await page.close();
  return r;
}

async function shots(url, out, list) {
  const screens = list ? list.split(',').map((s) => { const p = s.split(':'); const m = ['kr', 'us'].includes(p[p.length - 1]) ? p.pop() : 'kr'; return [p.join(':'), m]; }) : SCREENS.slice(0, 8);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  let n = 0, errors = 0;
  for (const [sc, m] of screens) {
    for (const scheme of ['light', 'dark']) {
      const name = `${sc.replace(/:/g, '-')}-${m}-${scheme}.png`;
      try { fs.writeFileSync(path.join(out, name), await shoot(browser, url, sc, m, scheme, 2)); n++; console.log(`찍음  ${name}`); } catch (e) { errors++; console.log(`ERR   ${name}: ${e.message.split('\n')[0]}`); }
    }
  }
  await browser.close();
  console.log(`검수 사진 ${n}장 저장: ${out}${errors ? ` · 오류 ${errors}` : ''} (Claude는 안 열어 봄, 바뀐 곳은 diff의 -crop.png로)`);
  process.exit(errors ? 1 : 0);
}

(async () => {
  if (SHOTS) return shots(A, B, OUT);
  if (!A || !B || !OUT) { console.log('쓰는 법: node tools/screen-diff.js <기준 주소> <새 주소> <사진 폴더> [--quick]'); process.exit(2); }
  fs.rmSync(OUT, { recursive: true, force: true });
  const browser = await chromium.launch();
  let changed = 0, errors = 0;
  // 화면 4개씩 동시에
  const queue = SCREENS.slice();
  const work = async () => {
    for (let job; (job = queue.shift());) {
      const [sc, m] = job, name = `${sc.replace(':', '-')}-${m}`;
      try {
        const [pa, pb] = await Promise.all([shoot(browser, A, sc, m), shoot(browser, B, sc, m)]);
        if (pa.equals(pb)) { console.log(`같음  ${name}`); continue; }
        const r = await compare(browser, pa, pb);
        if (!r.diff && r.sizeA === r.sizeB) { console.log(`같음  ${name}`); continue; }
        changed++;
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${name}-before.png`), pa);
        fs.writeFileSync(path.join(OUT, `${name}-after.png`), pb);
        fs.writeFileSync(path.join(OUT, `${name}-diff.png`), Buffer.from(r.png, 'base64'));
        if (r.crop) fs.writeFileSync(path.join(OUT, `${name}-crop.png`), Buffer.from(r.crop, 'base64'));
        const where = r.box ? ` · 위치 ${r.box}px → ${name}-crop.png` : '';
        console.log(`다름  ${name}: 픽셀 ${(100 * r.diff / r.total).toFixed(2)}%${r.sizeA !== r.sizeB ? ` · 크기 ${r.sizeA} → ${r.sizeB}` : ''}${where}`);
      } catch (e) { errors++; console.log(`ERR   ${name}: ${e.message.split('\n')[0]}`); }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  await browser.close();
  console.log(`화면 ${SCREENS.length}개 중 달라짐 ${changed}${changed ? ` (사진: ${OUT})` : ''}${errors ? ` · 오류 ${errors}` : ''}`);
  process.exit(errors ? 1 : 0);
})();
