// 화면 비교: 두 주소(보통 main 코드 빌드 vs 지금 코드 빌드, 자료는 같음)의 같은 화면을 찍어 픽셀을 비교해요.
//   node tools/screen-diff.js <기준 주소> <새 주소> <사진 폴더> [--quick]
//   보통은 python tools/check.py diff 가 두 빌드를 띄우고 이걸 불러요.
// 시계는 같은 시각으로 멈추고(가짜 시계), 움직임은 끄고, 밖으로 나가는 주소는 막아요 → 코드가 같으면 사진도 같아요.
// 달라진 화면은 <폴더>/<화면>-before.png · -after.png · -diff.png(다른 곳 빨강)로 남겨요. 달라도 실패는 아니고 알려 줘요.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const [A, B, OUT] = args.filter((a) => !a.startsWith('--'));
const SCREENS = QUICK
  ? [['home', 'kr'], ['home', 'us'], ['report', 'kr'], ['watch', 'kr'], ['chart', 'kr'], ['tools:asset', 'kr'], ['world', 'kr'], ['stock:005930', 'kr']]
  : [['home', 'kr'], ['home', 'us'], ...['news', 'learn', 'drop', 'cal', 'movers', 'heat', 'sectors', 'policy', 'macro'].map((k) => ['more:' + k, 'kr']),
    ['report', 'kr'], ['watch', 'kr'], ['watch', 'us'], ['chart', 'kr'], ['chart', 'us'], ['search', 'kr'], ['map', 'kr'], ['inbox', 'kr'], ['world', 'kr'], ['help', 'kr'], ['feedback', 'kr'],
    ...['asset', 'sav', 'lab', 'cal', 'stress', 'goal'].map((k) => ['tools:' + k, 'kr']), ['stock:005930', 'kr'], ['stock:AAPL', 'us']];
const NOW = new Date(Date.now() - (Date.now() % 3600000));  // 두 빌드가 같은 시각을 보게

async function shoot(browser, base, sc, m) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
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
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 24) { diff++; out.data[i] = 255; out.data[i + 3] = 255; } else { out.data[i] = out.data[i + 1] = out.data[i + 2] = db[i] * 0.3 + 160; out.data[i + 3] = 255; }
    }
    x.putImageData(out, 0, 0);
    const blob = await c.convertToBlob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { diff, total: w * h, sizeA: `${ia.width}x${ia.height}`, sizeB: `${ib.width}x${ib.height}`, png: btoa(s) };
  }, [a.toString('base64'), b.toString('base64')]);
  await page.close();
  return r;
}

(async () => {
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
        console.log(`다름  ${name}: 픽셀 ${(100 * r.diff / r.total).toFixed(2)}%${r.sizeA !== r.sizeB ? ` · 크기 ${r.sizeA} → ${r.sizeB}` : ''}`);
      } catch (e) { errors++; console.log(`ERR   ${name}: ${e.message.split('\n')[0]}`); }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  await browser.close();
  console.log(`화면 ${SCREENS.length}개 중 달라짐 ${changed}${changed ? ` (사진: ${OUT})` : ''}${errors ? ` · 오류 ${errors}` : ''}`);
  process.exit(errors ? 1 : 0);
})();
