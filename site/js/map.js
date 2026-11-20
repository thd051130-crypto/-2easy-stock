"use strict";
// ---------------------------------------------------------------- 산업 지도 (industry_map.py → industry.json)
// 산업 44개를 점으로, 서로 이어진 산업을 선으로. 산업을 누르면 그 산업이 가운데로 오고 연결된 산업만 둘레에 모여요.
let IMAP = null;  // { groups, kinds, nodes, links, flows?, corr?, hidden?, day? }
let imapLoading = null;
let mapColor = "group";
try { mapColor = localStorage.getItem("map_color") === "flow" ? "flow" : "group"; } catch (e) { /* 기본값 */ }
// 흐름 기간: 5거래일 또는 20거래일 (점 색·점 밑 숫자·목록이 다 이 기간으로 바뀌어요)
let mapDays = 5;
try { mapDays = localStorage.getItem("map_days") === "20" ? 20 : 5; } catch (e) { /* 기본값 */ }
const fv = (f) => (f ? (mapDays === 20 ? f.r20 : f.r5) : null);
// 강조 방식: "zoom" 누른 산업이 가운데로 오고 이어진 산업이 둘레로 모여요 / "spot" 모두 제자리에 두고
// 누른 산업·이어진 산업·그 사이 선만 밝게, 나머지는 거의 안 보이게 (사용자 2026-10-24)
let mapMode = "zoom";
try { mapMode = localStorage.getItem("map_mode") === "spot" ? "spot" : "zoom"; } catch (e) { /* 기본값 */ }
const MAP_W = 360, MAP_H = 660;  // 산업 44개 + 점 사이 빈 공간 넉넉히 (36개 땐 470)
const MAP_ANCHOR = { tech: [92, 104], energy: [270, 128], industry: [180, 332], consumer: [96, 534], finance: [272, 552] };
const MAP_MINOR = 0.8;
// 제자리 방식은 선이 잘 보이게 점 사이를 더 넓게 퍼뜨린 지도 (세로로 길게, 사용자 2026-10-24 '테마를 더 넓게 퍼뜨려')
const MAP_H_SPOT = 880, MAP_SPOT_S = 0.8;  // 제자리 방식은 점을 0.8배로 작게 (사용자 2026-10-24 '퍼뜨리니 너무 커 보여')
const mapH = () => (mapMode === "spot" ? MAP_H_SPOT : MAP_H);
const MAP_KIND = { s: "공급망", c: "같은 요인", n: "반대", h: "주가로 찾음" };
function loadMap() {
  if (!imapLoading) {
    imapLoading = fetch("industry.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (!x || !Array.isArray(x.nodes)) { imapLoading = null; return; }
        x.at = new Map(x.nodes.map((n, i) => [n.name, i]));
        x.nodes.forEach((n) => { n.w = textW(n.short) + 26; n.fw = textW(n.short) * 1.18 + 30; });
        x.lays = {};
        IMAP = x;
      });
  }
  return imapLoading;
}
// 점 크기: 산업 크기(관련 종목 시가총액 합)를 로그로 나눠 가장 큰 점이 가장 작은 점의 2.2배쯤 되게 해요.
// 시총은 수백 배 차이라 그대로 그리면 작은 산업은 안 보여서, 순서·차이는 보이되 다 읽히게.
// 점들이 차지하는 넓이 합은 예전(다 1배, 세부 테마 0.8배)과 같게 맞춰서 지도 안에 겹치지 않고 들어가요.
// 크기 자료가 없으면 예전처럼 세부 테마(minor)만 0.8배
const MAP_S_MIN = 0.62, MAP_S_MAX = 1.36;
const mapSize = (name, m = market) => { const z = IMAP && IMAP.size && IMAP.size[m]; return z ? z[name] : null; };
function mapScales(m) {
  const z = IMAP.size && IMAP.size[m];
  const v = z ? Object.values(z).map((x) => x[0]).filter((x) => x > 0) : [];
  if (v.length < 5) return IMAP.nodes.map((n) => (n.minor ? MAP_MINOR : 1));
  const lo = Math.log(Math.min(...v)), hi = Math.log(Math.max(...v));
  const raw = IMAP.nodes.map((n) => {
    const c = z[n.name] && z[n.name][0];
    return c > 0 ? MAP_S_MIN + (MAP_S_MAX - MAP_S_MIN) * (Math.log(c) - lo) / (hi - lo || 1) : MAP_S_MIN;
  });
  const area = (sc) => IMAP.nodes.reduce((a, n, i) => a + n.w * sc[i] * sc[i], 0);
  const k = Math.min(1.15, Math.sqrt(area(IMAP.nodes.map((n) => (n.minor ? MAP_MINOR : 1))) / area(raw)));
  return raw.map((x) => x * k);
}
// 시장마다 점 크기가 달라서 자리도 시장마다 한 번 계산해 두고 써요
function mapReady() {
  if (IMAP.layFor === market) return;
  if (!IMAP.lays[market]) {
    const sc = mapScales(market);
    IMAP.nodes.forEach((n, i) => { n.s = sc[i]; });
    mapLayout(IMAP);
    IMAP.lays[market] = IMAP.nodes.map((n) => ({ s: n.s, ox: n.ox, oy: n.oy }));
  }
  IMAP.lays[market].forEach((l, i) => Object.assign(IMAP.nodes[i], l, { x: l.ox, y: l.oy }));
  mapShuffle(false);
  if (mapMode === "spot") IMAP.nodes.forEach((n) => { n.x = n.sx; n.y = n.sy; });
  // 확대 화면에선 켜진 산업을 다 같은 크기(점 크기 평균, 너무 작지 않게 0.95배 이상)로 그려서 작은 산업 글자도 잘 보여요 (사용자 2026-10-24)
  IMAP.sf = Math.min(1.1, Math.max(0.95, IMAP.nodes.reduce((a, n) => a + n.s, 0) / IMAP.nodes.length));
  IMAP.layFor = market;
}
// 제자리 방식 자리: 테마를 무작위로 섞어 넓게 흩어 놓아요 (사용자 2026-10-24 '무작위로 섞어놔야 시각적으로 좋을 것').
// 시장마다 한 번 섞어 두고, '제자리' 버튼을 다시 누르면 새로 섞어요
function mapShuffle(fresh) {
  IMAP.spot = IMAP.spot || {};
  if (fresh || !IMAP.spot[market]) {
    const keep = IMAP.nodes.map((n) => [n.x, n.y]);  // 지금 그려진 자리는 그대로 두고 (여기서 새 자리로 움직여요)
    IMAP.nodes.forEach((n) => { n.s *= MAP_SPOT_S * 1.14; });  // 작게 그리는 크기로 자리 계산 (누른 산업 1.12배·물결만큼 여유)
    mapLayout(IMAP, { spot: true, shuffle: true, h: MAP_H_SPOT, gap: 30 });
    IMAP.spot[market] = IMAP.nodes.map((n) => [n.sx, n.sy]);
    IMAP.nodes.forEach((n, i) => { [n.x, n.y] = keep[i]; n.s /= MAP_SPOT_S * 1.14; });
  }
  IMAP.spot[market].forEach(([x, y], i) => { IMAP.nodes[i].sx = x; IMAP.nodes[i].sy = y; });
}
// 시가총액 글자: 국장 원, 미장 달러
function capText(v, m = market) {
  if (m === "us") return v >= 1e12 ? `${(v / 1e12).toFixed(1)}조 달러` : `${num(v / 1e8)}억 달러`;
  return v >= 1e12 ? `${num(v / 1e12)}조원` : `${num(v / 1e8)}억원`;
}

// 글자 폭 어림 (12px 글꼴): 한글 12px, 영문·숫자 7px, 기호 4px
const textW = (s) => [...s].reduce((a, c) => a + (/[가-힣]/.test(c) ? 12 : /[A-Za-z0-9]/.test(c) ? 7.2 : 4), 0);

// 전체 지도 자리: 묶음마다 중심으로 당기고, 이어진 산업끼리 당기고, 겹치면 밀어내요 (처음 한 번, 매번 같은 결과)
function mapLayout(x, o = {}) {
  const N = x.nodes;
  const MH = o.h || MAP_H, ky = MH / MAP_H, REST = o.rest || 100;
  const anchor = (g) => { const a = MAP_ANCHOR[g]; return a ? [a[0], a[1] * ky] : [MAP_W / 2, MH / 2]; };
  const groupIdx = {};
  N.forEach((n) => {
    const k = (groupIdx[n.group] = (groupIdx[n.group] || 0) + 1);
    const total = N.filter((m) => m.group === n.group).length;
    const a = (k / total) * Math.PI * 2;
    const [ax, ay] = anchor(n.group);
    n.x = ax + Math.cos(a) * 46; n.y = ay + Math.sin(a) * 34 * ky;
    // 섞기(제자리 방식): 묶음 상관없이 지도 아무 곳에서 출발해서 서로 밀어내기만 해요
    if (o.shuffle) { n.x = Math.random() * MAP_W; n.y = Math.random() * MH; }
  });
  const E = x.links.map((l) => [x.at.get(l.a), x.at.get(l.b)]).filter(([a, b]) => a != null && b != null);
  const H = 26, GAP = o.gap || 14, ROUNDS = 600;  // GAP: 점 사이 최소 빈 공간 (빈 곳 누르기·두 손가락 벌리기 자리)
  // 지도 밖으로 나간 점은 안으로 (밀어낸 뒤마다 해야 끝에 가장자리에서 겹치지 않아요)
  const clamp = () => N.forEach((n) => {
    n.x = Math.max(n.w * n.s / 2 + 2, Math.min(MAP_W - n.w * n.s / 2 - 2, n.x));
    n.y = Math.max(H * n.s / 2 + 2, Math.min(MH - H * n.s / 2 - 2, n.y));
  });
  for (let it = 0; it < ROUNDS; it++) {
    const cool = 1 - it / ROUNDS;
    if (!o.shuffle && it < ROUNDS - 120) {
      for (const [a, b] of E) {
        const p = N[a], q = N[b], dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 1;
        const f = ((dist - REST) / dist) * 0.01 * cool;
        p.x += dx * f; p.y += dy * f; q.x -= dx * f; q.y -= dy * f;
      }
      N.forEach((n) => {
        const [ax, ay] = anchor(n.group);
        n.x += (ax - n.x) * 0.03 * cool; n.y += (ay - n.y) * 0.03 * cool;
      });
    }
    for (let sweep = it < ROUNDS - 120 ? 1 : 3; sweep > 0; sweep--) for (let i = 0; i < N.length; i++) {
      for (let j = i + 1; j < N.length; j++) {
        const p = N[i], q = N[j];
        const ox = (p.w * p.s + q.w * q.s) / 2 + GAP - Math.abs(q.x - p.x), oy = H * (p.s + q.s) / 2 + GAP - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) { const s = (q.x >= p.x ? 1 : -1) * ox / 2; p.x -= s; q.x += s; }
        else { const s = (q.y >= p.y ? 1 : -1) * oy / 2; p.y -= s; q.y += s; }
      }
      clamp();
    }
  }
  if (o.spot) N.forEach((n) => { n.sx = n.x; n.sy = n.y; });
  else N.forEach((n) => { n.ox = n.x; n.oy = n.y; });
}

// 고른 산업과 이어진 산업 [{ name, kind, why, role, corr }]: 사람이 이은 선 + 이 시장에서 주가로 찾은 연결
function mapNeighbors(name) {
  const out = [];
  const corr = (IMAP.corr && IMAP.corr[market]) || {};
  IMAP.links.forEach((l) => {
    if (l.a !== name && l.b !== name) return;
    const other = l.a === name ? l.b : l.a;
    const role = l.kind !== "s" ? MAP_KIND[l.kind] : l.a === name ? "고객 산업" : "공급 산업";
    out.push({ name: other, kind: l.kind, why: l.why, role, corr: corr[`${l.a}|${l.b}`] });
  });
  ((IMAP.hidden && IMAP.hidden[market]) || []).forEach(([a, b, v]) => {
    if (a !== name && b !== name) return;
    out.push({ name: a === name ? b : a, kind: "h", why: "최근 6개월 주가가 유난히 같이 움직였어요. 이유는 뉴스로 직접 확인해 보세요",
      role: "주가로 찾음", corr: v });
  });
  const g = IMAP.groups.map((x) => x.id);
  const ord = (n) => { const node = IMAP.nodes[IMAP.at.get(n.name)]; return g.indexOf(node.group) * 100 + IMAP.nodes.indexOf(node); };
  return out.sort((a, b) => ord(a) - ord(b));
}
// 고른 산업은 가운데, 이어진 산업은 둘레(타원)에. 많으면 안쪽·바깥쪽 번갈아. 나머지는 제자리에서 흐리게.
function mapTargets(focus = mapFocus) {
  const T = IMAP.nodes.map((n) => (mapMode === "spot" ? { x: n.sx, y: n.sy, on: !focus, center: false } : { x: n.ox, y: n.oy, on: !focus, center: false }));
  if (!focus || !IMAP.at.has(focus)) return T;
  if (mapMode === "spot") {
    T[IMAP.at.get(focus)].on = T[IMAP.at.get(focus)].center = true;
    mapNeighbors(focus).forEach((x) => { T[IMAP.at.get(x.name)].on = true; });
    return T;
  }
  const cx = MAP_W / 2, cy = MAP_H / 2;
  T[IMAP.at.get(focus)] = { x: cx, y: cy, on: true, center: true };
  const nb = mapNeighbors(focus);
  const many = nb.length > 8;
  // 둘레 거리: 이어진 산업이 적으면 가깝게, 많을수록 조금씩 넓게 (지도 끝까지 퍼지면 선이 너무 길어요)
  const ry = Math.min(MAP_H / 2 - 36, (many ? 150 : 110) + nb.length * 9);
  const c = IMAP.nodes[IMAP.at.get(focus)];
  const ch = (c.w * IMAP.sf * 1.18) / 2;  // 가운데 산업 반폭 (크게 그려요)
  nb.forEach((x, i) => {
    const a = -Math.PI / 2 + (i / nb.length) * Math.PI * 2;
    const k = many && i % 2 ? 0.66 : 1;
    const node = IMAP.nodes[IMAP.at.get(x.name)];
    const half = (node.w * IMAP.sf) / 2;
    // 옆(왼쪽·오른쪽)에 오는 산업이 큰 가운데 산업과 겹치지 않게, 그래도 지도 밖으로는 안 나가게
    const rx = Math.min(MAP_W / 2 - half - 2, Math.max((MAP_W / 2 - half - 4) * (many ? 1 : 0.9), ch + half + 10));
    T[IMAP.at.get(x.name)] = { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k, on: true, center: false };
  });
  return T;
}

function mapFlow(name, m = market) {
  return IMAP && IMAP.flows && IMAP.flows[m] && IMAP.flows[m][name];
}
// 흐름 색: 오르면 빨강, 내리면 파랑. 5일은 ±1%·3%·6%, 20일은 ±2%·6%·12%에서 진해져요
function heat(r, days = 5) {
  if (r == null) return "";
  const k = days === 20 ? 2 : 1;
  const a = Math.abs(r), lv = a >= 0.06 * k ? 3 : a >= 0.03 * k ? 2 : a >= 0.01 * k ? 1 : 0;
  return lv ? ` heat ${r > 0 ? "up" : "down"} h${lv}` : " heat";
}

function mapSvg() {
  mapReady();
  const hidden = (IMAP.hidden && IMAP.hidden[market]) || [];
  const edges = IMAP.links.map((l, i) => `<polyline class="edge k-${l.kind}" data-e="${i}" points=""/>`).join("")
    + hidden.map((h, i) => `<polyline class="edge k-h" data-h="${i}" points=""/>`).join("");
  const nodes = IMAP.nodes.map((n, i) => {
    const f = mapFlow(n.name);
    const cls = `node g-${n.group}${n.minor ? " minor" : ""}${mapColor === "flow" ? heat(fv(f), mapDays) : ""}`;
    const z = mapSize(n.name);
    const hw = Math.max(n.fw, n.w * n.s * 1.18) + 8, hh = Math.max(36, 26 * n.s * 1.18 + 6);
    return `<g class="${cls}" data-n="${i}" role="button" tabindex="0" aria-label="${esc(n.name)}${z ? ` 시가총액 ${capText(z[0])}` : ""}${f ? ` ${mapDays}일 ${pct(fv(f))}` : ""}">
      <rect class="hit" x="${(-hw / 2).toFixed(1)}" y="${(-hh / 2).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}"/>
      <g class="pill" style="--s:${n.s.toFixed(3)}"><rect x="${-n.w / 2}" y="-13" width="${n.w}" height="26" rx="13"/>
      <circle cx="${-n.w / 2 + 11}" cy="0" r="4"/><text x="${7}" y="4.2">${esc(n.short)}</text></g>
      <text class="flow ${sign(fv(f))}" y="${(13 * IMAP.sf * 1.18 + 11).toFixed(1)}">${f ? pct(fv(f)) : ""}</text></g>`;
  }).join("");
  // 원래 자리 표시: 확대하면 이어진 산업은 둘레로 옮겨 가요. 전체 지도에서 어디 있던 산업인지 보이게 원래 자리에 흐린 모양을 남겨요
  const ghosts = IMAP.nodes.map((n, i) => `<g class="ghost g-${n.group}" data-gh="${i}" transform="translate(${n.ox.toFixed(1)},${n.oy.toFixed(1)})">
      <g class="pill" style="--s:${n.s.toFixed(3)}"><rect x="${-n.w / 2}" y="-13" width="${n.w}" height="26" rx="13"/>
      <circle cx="${-n.w / 2 + 11}" cy="0" r="4"/><text x="${7}" y="4.2">${esc(n.short)}</text></g></g>`).join("");
  return `<svg class="imap${mapFocus ? " focused" : ""}${mapMode === "spot" ? " spot" : ""}" style="--sf:${IMAP.sf.toFixed(3)}" viewBox="0 0 ${MAP_W} ${mapH()}" role="img" aria-label="산업 연관 지도">
    <defs><marker id="imap-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M1 1 9 5 1 9z"/></marker></defs>
    <g class="ghosts" aria-hidden="true">${ghosts}</g><g class="edges">${edges}</g><g class="nodes">${nodes}</g></svg>`;
}

// 점·선을 새 자리로 (0.45초). 동작 줄이기를 켰으면 바로.
let mapAnim = 0;
function placeMap(svg, animate, slow = false) {
  const T = mapTargets();
  const vb = svg.viewBox.baseVal, h0 = vb.height, h1 = mapH();  // 지도 높이도 점과 같이 늘어나거나 줄어요
  const N = IMAP.nodes;
  const from = N.map((n) => ({ x: n.x, y: n.y }));
  const hidden = (IMAP.hidden && IMAP.hidden[market]) || [];
  const fi = mapFocus ? IMAP.at.get(mapFocus) : null;
  N.forEach((n, i) => {
    const g = svg.querySelector(`[data-n="${i}"]`);
    g.classList.toggle("dim", !T[i].on);
    g.classList.toggle("center", T[i].center);
    g.classList.toggle("near", !!mapFocus && T[i].on && !T[i].center);
    const gh = svg.querySelector(`[data-gh="${i}"]`);
    if (gh) gh.classList.toggle("on", !!mapFocus && T[i].on);
  });
  IMAP.links.forEach((l, i) => {
    const e = svg.querySelector(`[data-e="${i}"]`);
    const on = fi == null || l.a === mapFocus || l.b === mapFocus;
    e.classList.toggle("off", !on);
    e.classList.toggle("lit", fi != null && on);
    if (fi != null && on && l.kind === "s") e.setAttribute("marker-mid", "url(#imap-arrow)"); else e.removeAttribute("marker-mid");
  });
  hidden.forEach(([a, b], i) => {
    const e = svg.querySelector(`[data-h="${i}"]`);
    const on = fi != null && (a === mapFocus || b === mapFocus);
    e.classList.toggle("off", !on);
    e.classList.toggle("lit", on);
  });
  const draw = (k) => {
    N.forEach((n, i) => {
      n.x = from[i].x + (T[i].x - from[i].x) * k;
      n.y = from[i].y + (T[i].y - from[i].y) * k;
    });
    mapPaint(svg);
    if (h0 !== h1) svg.setAttribute("viewBox", `0 0 ${MAP_W} ${(h0 + (h1 - h0) * k).toFixed(1)}`);
  };
  cancelAnimationFrame(mapAnim);
  if (!animate || calm()) { draw(1); return; }
  // 강조 방식을 바꿀 땐 지도 전체가 퍼지거나 모이니 더 천천히, 천천히 시작해서 천천히 멈춰요
  const t0 = performance.now(), dur = slow ? 2000 : 450;
  const ease = slow ? (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) : (t) => 1 - (1 - t) ** 3;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    draw(ease(t));
    if (t < 1) mapAnim = requestAnimationFrame(step);
  };
  mapAnim = requestAnimationFrame(step);
}

// 점·선 그리기: 자리(n.x, n.y)에 물결 움직임을 더해요. 선 끝도 점을 따라가요
function mapPaint(svg) {
  const N = IMAP.nodes, t = performance.now() / 1000, a = MAP_WAVE.amp;
  const P = N.map((n) => {
    if (!a) return [n.x, n.y];
    // 물결: 자리마다 출발이 조금씩 달라서 지도 위를 파도가 지나가듯 움직여요 (가로 2px, 세로 3px 안쪽)
    const ph = (n.sx || n.ox) * 0.018 + (n.sy || n.oy) * 0.011;
    return [n.x + a * 2 * Math.sin(t * 0.9 + ph * 1.3), n.y + a * 3 * Math.sin(t * 1.15 + ph)];
  });
  N.forEach((n, i) => svg.querySelector(`[data-n="${i}"]`).setAttribute("transform", `translate(${P[i][0].toFixed(1)},${P[i][1].toFixed(1)})`));
  const line = (e, x, y) => {
    const p = P[IMAP.at.get(x)], q = P[IMAP.at.get(y)];
    if (!e || !p || !q) return;
    e.setAttribute("points", `${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}`);
  };
  IMAP.links.forEach((l, i) => line(svg.querySelector(`[data-e="${i}"]`), l.a, l.b));
  ((IMAP.hidden && IMAP.hidden[market]) || []).forEach(([x, y], i) => line(svg.querySelector(`[data-h="${i}"]`), x, y));
}
// 제자리 방식에서 산업을 누르면 별자리를 그리듯 그 산업에서 선이 하나씩 뻗어 나가고, 선이 닿는 순간 그 산업이 켜져요.
// 가까운 산업부터 차례로, 긴 선은 조금 더 천천히 (사용자 2026-10-24 '별자리 그리듯 퍼져나가게', 빠르기 0.8배)
let mapStars = [];
function mapConstellation(svg, name, wait = 0) {
  mapStars.forEach((a) => a.cancel());
  mapStars = [];
  if (calm() || mapMode !== "spot" || !name || !IMAP.at.has(name)) return;
  const c = IMAP.nodes[IMAP.at.get(name)];
  const items = [];
  const add = (e, a, b) => { if (e && (a === name || b === name)) items.push({ e, other: a === name ? b : a, fromEnd: b === name }); };
  IMAP.links.forEach((l, i) => add(svg.querySelector(`[data-e="${i}"]`), l.a, l.b));
  ((IMAP.hidden && IMAP.hidden[market]) || []).forEach(([a, b], i) => add(svg.querySelector(`[data-h="${i}"]`), a, b));
  items.forEach((it) => {
    const i = IMAP.at.get(it.other), o = IMAP.nodes[i];
    it.d = o ? Math.hypot(o.sx - c.sx, o.sy - c.sy) : 0;
    it.g = svg.querySelector(`[data-n="${i}"]`);
  });
  items.sort((a, b) => a.d - b.d);
  const done = new Set();
  items.forEach((it, k) => {
    const L = it.e.getTotalLength() * 1.15 + 12;  // 물결로 선 길이가 조금 바뀌어도 끝까지 덮게
    const delay = wait + 250 + k * 275, dur = 625 + it.d * 2;
    it.e.style.strokeDasharray = `${L} ${L}`;
    const mk = it.e.getAttribute("marker-mid");  // 화살표는 선이 다 그려진 뒤에
    if (mk) it.e.removeAttribute("marker-mid");
    const line = it.e.animate([{ strokeDashoffset: it.fromEnd ? -L : L }, { strokeDashoffset: 0 }],
      { duration: dur, delay, easing: "cubic-bezier(.35,.1,.25,1)", fill: "backwards" });
    line.onfinish = line.oncancel = () => {
      it.e.style.strokeDasharray = "";
      if (mk && it.e.classList.contains("lit") && !it.e.hasAttribute("marker-mid")) it.e.setAttribute("marker-mid", mk);
    };
    mapStars.push(line);
    if (it.g && !done.has(it.g)) {
      done.add(it.g);
      mapStars.push(it.g.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 625, delay: delay + dur * 0.85, easing: "ease-out", fill: "backwards" }));
    }
  });
}
// 제자리 방식에선 점들이 물결처럼 천천히 떠다녀요 (사용자 2026-10-24 '너무 정적이지 않게'). 방식을 바꾸면 서서히 멈추거나 시작해요.
// 지도 화면을 떠나거나 동작 줄이기를 켰으면 안 움직여요
const MAP_WAVE = { amp: 0, raf: 0 };
function mapWave(svg) {
  cancelAnimationFrame(MAP_WAVE.raf);
  const tick = () => {
    if (!svg.isConnected) { MAP_WAVE.amp = 0; return; }
    const goal = mapMode === "spot" && !calm() ? 1 : 0;
    MAP_WAVE.amp += (goal - MAP_WAVE.amp) * 0.04;
    if (Math.abs(goal - MAP_WAVE.amp) < 0.01) MAP_WAVE.amp = goal;
    if (!document.hidden) mapPaint(svg);
    if (MAP_WAVE.amp || goal) MAP_WAVE.raf = requestAnimationFrame(tick);
  };
  MAP_WAVE.raf = requestAnimationFrame(tick);
}

function mapCard() {
  const head = `<button type="button" class="back" data-back>‹ 뒤로</button><h2 class="stock-name">산업 연관 지도</h2>`;
  if (!IMAP) {
    return `<section class="card">${head}<p class="muted" id="map-wait">지도를 불러오는 중이에요…</p></section>`;
  }
  const legend = IMAP.groups.map((g) => `<span class="lg g-${g.id}"><i></i>${esc(g.name)}</span>`).join("");
  const sized = !!(IMAP.size && IMAP.size[market]);
  const minorNote = IMAP.nodes.some((n) => n.minor) ? `<span class="muted">${sized ? "흐린 점" : "작고 흐린 점"}: 큰 틀 밖 세부 테마</span>` : "";
  const colors = [["group", "묶음 색"], ["flow", "흐름 색"]].map(([k, label]) =>
    `<button type="button" data-mapcolor="${k}" aria-pressed="${mapColor === k}">${label}</button>`).join("");
  const modes = [["zoom", "확대"], ["spot", "제자리"]].map(([k, label]) =>
    `<button type="button" data-mapmode="${k}" aria-pressed="${mapMode === k}">${label}</button>`).join("");
  const days = [5, 20].map((d) => `<button type="button" data-mapdays="${d}" aria-pressed="${mapDays === d}">${d}일</button>`).join("");
  const has = !!(IMAP.flows && IMAP.flows[market]);
  return `<section class="card map-card">${head}
    <p class="sub map-sub${mapFocus ? " focused" : ""}${mapMode === "spot" ? " spot" : ""}" id="map-sub"><span class="all">${MAP_SUB_ALL}</span><span class="foc">${MAP_SUB_FOCUS}</span>
      <span class="all spot">${MAP_SUB_SPOT_ALL}</span><span class="foc spot">${MAP_SUB_SPOT_FOCUS}</span></p>
    <div class="map-tools"><div class="period" role="group" aria-label="강조 방식">${modes}</div>
      <div class="period" role="group" aria-label="점 색">${colors}</div>
      <div class="period" role="group" aria-label="흐름 기간">${days}</div>
      <button type="button" class="map-all${mapFocus ? "" : " off"}" data-mapall>‹ 전체 보기</button></div>
    <div class="imap-wrap">${mapSvg()}</div>
    <div class="map-legend">${mapColor === "flow" && has ? `<span class="lg"><i class="up"></i>${mapDays}일 오름</span><span class="lg"><i class="down"></i>${mapDays}일 내림</span><span class="muted">${MK_NAME[market]} 대표 종목 중간값</span>`
      : legend + minorNote}</div>
    <div class="map-legend lines"><span><svg viewBox="0 0 28 8"><path class="k-s" d="M1 4h26"/></svg>공급망·수요</span>
      <span><svg viewBox="0 0 28 8"><path class="k-c" d="M1 4h26"/></svg>같은 요인</span>
      <span><svg viewBox="0 0 28 8"><path class="k-n" d="M1 4h26"/></svg>반대</span>
      <span><svg viewBox="0 0 28 8"><path class="k-h" d="M1 4h26"/></svg>주가로 찾음</span></div>
    ${mapSizeLegend()}
    ${mapColor === "flow" && !has ? `<p class="muted" style="margin:6px 0 0">${MK_NAME[market]} 흐름 자료가 아직 없어요. 다음 배포 때 생겨요.</p>` : ""}</section>`;
}

// 점 크기 기준: 가장 큰·작은 산업을 숫자로 (사용자 2026-10-24 '산업 크기에 따라 크기 차등')
function mapSizeLegend() {
  const z = IMAP.size && IMAP.size[market];
  if (!z || Object.keys(z).length < 5) return "";
  const r = Object.entries(z).sort((a, b) => b[1][0] - a[1][0]);
  const short = (name) => { const n = IMAP.nodes[IMAP.at.get(name)]; return esc(n ? n.short : name); };
  const [big, small] = [r[0], r[r.length - 1]];
  return `<p class="map-size"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span><b>점 크기 = 산업 크기</b> (관련 종목 시가총액 합)<br>
    가장 큼 ${short(big[0])} ${capText(big[1][0])} · 가장 작음 ${short(small[0])} ${capText(small[1][0])}</span></p>`;
}

const together = (v) => (v == null ? "" : v >= 0.6 ? "주가 많이 같이 움직임" : v >= 0.3 ? "주가 조금 같이 움직임"
  : v > -0.3 ? "주가는 따로 움직임" : "주가가 반대로 움직임");

function mapStockRow(m, [code, ko, close, r5, , r20]) {
  const rv = mapDays === 20 ? r20 : r5;  // 20일 등락률은 새 industry.json부터 있어요
  const mine = stocksOf(DATA.markets[m]).some((s) => s.code === code);
  return `<li ${mine ? `data-open="${m}/${esc(code)}"` : `data-mapsearch="${esc(code)}"`}><div class="l"><div class="name">${esc(ko)}</div>
    <div class="meta">${esc(code)}${mine ? " · 누르면 차트" : " · 누르면 검색"}</div></div>
    <div class="r">${price(m, close)}<div class="meta ${sign(rv)}">${mapDays}일 ${pct(rv)}</div></div></li>`;
}

function mapDetailCard() {
  if (!IMAP) return "";
  const day = IMAP.day && IMAP.day[market];
  if (!mapFocus || !IMAP.at.has(mapFocus)) {
    const fl = (IMAP.flows && IMAP.flows[market]) || {};
    const ranked = Object.entries(fl).filter(([, f]) => fv(f) != null).sort((a, b) => fv(b[1]) - fv(a[1]));
    const other = mapDays === 20 ? 5 : 20;
    const row = ([name, f]) => `<li data-mapgo="${esc(name)}"><div class="l"><div class="name">${esc(name)}</div>
      <div class="meta">대표 ${f.n}종목 · ${other}일 ${pct(other === 20 ? f.r20 : f.r5)}</div></div><div class="r ${sign(fv(f))}">${pct(fv(f))}</div></li>`;
    const body = ranked.length >= 6 ? `<h3 class="muted" style="margin:4px 0">많이 오른 산업</h3><ul class="list">${ranked.slice(0, 3).map(row).join("")}</ul>
      <h3 class="muted" style="margin:12px 0 4px">많이 내린 산업</h3><ul class="list">${ranked.slice(-3).reverse().map(row).join("")}</ul>`
      : `<p class="empty">${MK_NAME[market]} 산업 흐름 자료가 아직 없어요. 다음 배포 때 생겨요.</p>`;
    return `<section class="card"><h2>${MK_NAME[market]} 산업 흐름 <small>최근 ${mapDays}거래일${day ? ` · ${md(day)}` : ""}</small></h2>${body}
      <p class="muted note" style="margin:10px 0 0">산업마다 대표 종목 5개의 ${mapDays}거래일 등락률 중간값이에요. 누르면 지도에서 그 산업의 연결을 보여 줘요.
      연결은 사람이 정리한 참고 자료라 매매 규칙은 안 바꿔요.</p></section>`;
  }
  const node = IMAP.nodes[IMAP.at.get(mapFocus)];
  const group = IMAP.groups.find((g) => g.id === node.group);
  const f = mapFlow(mapFocus);
  const nb = mapNeighbors(mapFocus);
  const lines = nb.map((x) => {
    const xf = mapFlow(x.name);
    const badge = `<span class="badge k-${x.kind}">${esc(x.role)}</span>`;
    return `<li data-mapgo="${esc(x.name)}"><div class="l"><div class="name">${esc(x.name)}${badge}</div>
      <div class="meta">${esc(x.why)}${x.corr == null ? "" : ` · ${together(x.corr)} (${x.corr.toFixed(2)})`}</div></div>
      <div class="r ${sign(fv(xf))}">${xf ? pct(fv(xf)) : "-"}<div class="meta">${mapDays}일</div></div></li>`;
  }).join("");
  const stocks = f ? f.stocks.map((s) => mapStockRow(market, s)).join("") : "";
  const z = mapSize(mapFocus);
  const zs = (IMAP.size && IMAP.size[market]) || {};
  const rank = z ? Object.values(zs).filter((x) => x[0] > z[0]).length + 1 : 0;
  const sizeLine = z ? `<p class="map-cap"><span class="muted">산업 크기</span> <b>${capText(z[0])}</b>
    <small class="muted">${MK_NAME[market]} ${Object.keys(zs).length}개 산업 중 ${rank}위 · 관련 종목 ${z[1]}개 시가총액 합</small></p>` : "";
  return `<section class="card"><h2>${esc(mapFocus)} <small>${esc(group ? group.name : "")} · 참고</small></h2>
    <p class="sub">${esc(node.why)}</p>${sizeLine}
    ${f ? `<p class="headline ${sign(fv(f))}" style="margin-top:10px">${pct(fv(f))} <small class="muted" style="font-size:13px;font-weight:400">${MK_NAME[market]} ${mapDays}일 중간값 · ${mapDays === 20 ? `5일 ${pct(f.r5)}` : `20일 ${pct(f.r20)}`}</small></p>` : ""}
    <h3 class="map-sec">🔗 이어진 산업 ${nb.length}개 <small>누르면 그 산업으로</small></h3>
    <ul class="list">${lines}</ul>
    <div class="map-stocks">
    ${stocks ? `<h3 class="map-sec stk">📈 ${MK_NAME[market]} 대표 종목 <small>${day ? `${md(day)} 종가` : ""}</small></h3><ul class="list">${stocks}</ul>`
      : `<p class="muted" style="margin:0">${MK_NAME[market]} 대표 종목 시세가 아직 없어요.</p>`}</div>
    <button type="button" class="more" data-mapq="${esc(node.q)}">${esc(mapFocus)} 관련 종목 전체 보기 (국장·미장)<span aria-hidden="true">›</span></button>
    <p class="muted note" style="margin:10px 0 0">주가 동행은 최근 120거래일 하루 등락률의 상관계수(1이면 똑같이, 0이면 따로)예요.
      연결은 사람이 정리한 참고 자료라 사라는 뜻이 아니고 매매 규칙도 안 바꿔요.</p></section>`;
}
const MAP_SUB_ALL = "산업을 누르거나 두 손가락으로 벌리면 이어진 산업만 선으로 모아 보여 줘요.";
const MAP_SUB_FOCUS = "가운데 산업에 이어진 산업만 모았어요. 둘레 산업을 누르거나 벌리면 그 산업으로, 빈 곳을 누르거나 오므리면 이전으로 가요.";
const MAP_SUB_SPOT_ALL = "산업을 누르면 제자리에서 이어진 산업과 선만 밝게 보여 줘요. 나머지는 흐려져요.";
const MAP_SUB_SPOT_FOCUS = "누른 산업과 이어진 산업만 밝혔어요. 다른 산업(흐린 것도)을 누르면 그 산업으로, 빈 곳을 누르면 이전으로 가요.";
function setMapFocus(name, back = false) {
  if (!back) {
    if (!name) mapTrail = [];
    else if (mapFocus && name !== mapFocus) mapTrail.push(mapFocus);
  }
  mapFocus = name;
  history.replaceState(history.state, "", hashFor());
  const svg = $(".imap");
  if (!svg) { render(); return; }
  svg.classList.toggle("focused", !!name);
  placeMap(svg, true);
  mapConstellation(svg, name);
  // 위 설명·'전체 보기' 버튼은 자리를 그대로 차지한 채 글자만 바꿔요. 높이가 바뀌면 지도가 밀려서 화면이 움직여요 (사용자 2026-10-24)
  const sub = $("#map-sub");
  if (sub) sub.classList.toggle("focused", !!name);
  const all = $("[data-mapall]");
  if (all) all.classList.toggle("off", !name);
  const old = $("#map-detail");
  if (old) { holdHeight(); old.innerHTML = mapDetailCard(); bindMapDetail(old); }
}
function bindMapDetail(el) {
  el.querySelectorAll("[data-mapgo]").forEach((b) => b.addEventListener("click", () => {
    // 아래 '산업 흐름' 칸에서 눌러도 화면은 그 자리 그대로예요 (위 지도로 올라가지 않게, 사용자 요청 2026-10-17)
    const y = window.scrollY;
    setMapFocus(b.dataset.mapgo);
    window.scrollTo(0, y);
  }));
  el.querySelectorAll("[data-mapq]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = `${b.dataset.mapq} 관련 종목`;
    go("search");
  }));
  el.querySelectorAll("[data-mapsearch]").forEach((b) => b.addEventListener("click", () => {
    searchQuery = b.dataset.mapsearch;
    go("search");
  }));
  bindResults(el);
}
// 두 손가락 확대·축소: 벌리면 손가락 사이에 가장 가까운 산업으로 들어가 연관 산업만 모이고 나머지는 흐려져요.
// 이미 들어가 있으면 둘레 산업 중 가까운 것으로 한 단계 더. 오므리면 이전으로 (빈 곳 누르기와 같아요).
// 손가락을 벌리는 만큼 산업들이 새 자리로 조금씩 옮겨 가고(흐려질 산업은 서서히 흐려지고), 손을 떼면
// 그 자리에서 이어서 끝까지 가요. 덜 벌렸으면 원래 자리로 부드럽게 돌아와요. 노트북 터치패드(ctrl+휠)도 같아요.
const PINCH_FULL_IN = 2, PINCH_FULL_OUT = 0.5;   // 이만큼 벌리거나 오므리면 미리보기가 끝까지 가요
const PINCH_COMMIT = 0.3;                          // 미리보기가 30% 넘게 갔으면(1.3배·0.85배) 손 뗄 때 그쪽으로
function mapPinchPick(svg, cx, cy) {
  // 화면 좌표 → 지도 좌표, 진한 산업 중 가장 가까운 것 (가운데 산업은 빼요: 그 산업 둘레로 더 들어가요)
  const m = svg.getScreenCTM();
  const pt = m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : { x: MAP_W / 2, y: MAP_H / 2 };
  let best = null, bd = Infinity;
  IMAP.nodes.forEach((n, i) => {
    const g = svg.querySelector(`[data-n="${i}"]`);
    if (!g || g.classList.contains("dim") || n.name === mapFocus) return;
    const d = Math.hypot(n.x - pt.x, n.y - pt.y);
    if (d < bd) { bd = d; best = n.name; }
  });
  return best;
}
// 미리보기: from(손가락 대기 전 자리) → focus로 갔을 때 자리 사이 k(0~1)만큼. 선도 같이 따라가요
function mapPreview(svg, from, focus, k) {
  const T = mapTargets(focus);
  const N = IMAP.nodes;
  N.forEach((n, i) => {
    n.x = from[i].x + (T[i].x - from[i].x) * k;
    n.y = from[i].y + (T[i].y - from[i].y) * k;
    const g = svg.querySelector(`[data-n="${i}"]`);
    g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
    const lo = mapMode === "spot" ? 0.12 : 0.07;  // 흐린 산업 진하기 (CSS .node.dim과 같게)
    const a = from[i].dim ? lo : 1, b = T[i].on ? 1 : lo;
    g.style.transition = "none";
    g.style.opacity = (a + (b - a) * k).toFixed(3);
  });
  const line = (e, a, b) => {
    const p = N[IMAP.at.get(a)], q = N[IMAP.at.get(b)];
    if (!e || !p || !q) return;
    e.setAttribute("points", `${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + q.x) / 2).toFixed(1)},${((p.y + q.y) / 2).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
  };
  // 선: 갈 곳과 상관없는 선은 서서히 사라지고, 이어질 선은 서서히 나타나요
  const fade = (e, on) => {
    if (!e) return;
    const a = e.classList.contains("off") ? 0 : 1, b = on ? 1 : 0;
    e.style.transition = "none";
    e.style.opacity = (a + (b - a) * k).toFixed(3);
  };
  IMAP.links.forEach((l, i) => {
    const e = svg.querySelector(`[data-e="${i}"]`);
    line(e, l.a, l.b);
    fade(e, !focus || l.a === focus || l.b === focus);
  });
  ((IMAP.hidden && IMAP.hidden[market]) || []).forEach(([a, b], i) => {
    const e = svg.querySelector(`[data-h="${i}"]`);
    line(e, a, b);
    fade(e, !!focus && (a === focus || b === focus));
  });
}
function mapPreviewClear(svg) {
  svg.querySelectorAll("[data-n], .edge").forEach((g) => { g.style.transition = ""; g.style.opacity = ""; });
}
function bindMapPinch(svg) {
  let start = null;  // { d, cx, cy, from, inTo, outTo, ratio }
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  // 벌림(ratio>1)·오므림(ratio<1)마다 갈 곳과 진행 정도(0~1)
  const goal = (s) => {
    if (s.ratio > 1) {
      if (s.inTo === undefined) s.inTo = mapPinchPick(svg, s.cx, s.cy);
      return s.inTo ? { to: s.inTo, back: false, k: Math.min(1, (s.ratio - 1) / (PINCH_FULL_IN - 1)) } : null;
    }
    if (!mapFocus) return null;
    return { to: mapTrail.length ? mapTrail[mapTrail.length - 1] : "", back: true, k: Math.min(1, (1 - s.ratio) / (1 - PINCH_FULL_OUT)) };
  };
  svg.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2) return;
    const t = e.touches;
    cancelAnimationFrame(mapAnim);
    start = { d: dist(t) || 1, cx: (t[0].clientX + t[1].clientX) / 2, cy: (t[0].clientY + t[1].clientY) / 2, ratio: 1,
      from: IMAP.nodes.map((n, i) => ({ x: n.x, y: n.y, dim: svg.querySelector(`[data-n="${i}"]`).classList.contains("dim") })) };
  }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    if (!start || e.touches.length !== 2) return;
    e.preventDefault();  // 화면 전체 확대 대신 지도 확대
    start.ratio = dist(e.touches) / start.d;
    const g = goal(start);
    // 갈 곳이 없으면(전체 보기에서 오므리기 등) 제자리
    mapPreview(svg, start.from, g ? g.to : mapFocus, g ? g.k : 0);
  }, { passive: false });
  const end = (e) => {
    if (!start || e.touches.length) return;
    const s0 = start;
    start = null;
    svg.dataset.pinched = "1";  // 손 뗄 때 생기는 클릭은 무시
    setTimeout(() => { delete svg.dataset.pinched; }, 350);
    const g = goal(s0);
    mapPreviewClear(svg);
    if (g && g.k >= PINCH_COMMIT) {
      if (g.back) mapTrail.pop();
      setMapFocus(g.to, g.back);  // 지금 자리(미리보기 중간)에서 이어서 움직여요
    } else {
      placeMap(svg, true);  // 덜 벌렸으면 원래 자리로
    }
  };
  svg.addEventListener("touchend", end);
  svg.addEventListener("touchcancel", end);
  // 노트북 터치패드 두 손가락 확대(ctrl+휠): 한 번에 한 단계씩
  let wheelAt = 0;
  svg.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 500) return;
    wheelAt = now;
    if (e.deltaY < 0) { const to = mapPinchPick(svg, e.clientX, e.clientY); if (to) setMapFocus(to); }
    else if (mapFocus) setMapFocus(mapTrail.pop() || "", true);
  }, { passive: false });
}

function bindMap() {
  if (!IMAP) {
    loadMap().then(() => {
      if (screen !== "map") return;
      if (IMAP) render();
      else { const w = $("#map-wait"); if (w) w.textContent = "지도를 못 불러왔어요. 잠시 뒤 다시 열어 보세요."; }
    });
    return;
  }
  if (mapFocus && !IMAP.at.has(mapFocus)) mapFocus = "";
  const svg = $(".imap");
  MAP_WAVE.amp = 0;
  placeMap(svg, false);
  mapWave(svg);
  svg.querySelectorAll("[data-n]").forEach((g) => {
    const pick = () => {
      if (svg.dataset.pinched) return;
      const name = IMAP.nodes[Number(g.dataset.n)].name;
      if (mapFocus && g.classList.contains("dim") && mapMode !== "spot") return;  // 확대 방식에선 흐린 산업은 빈 곳처럼 (CSS로 터치를 안 받아요)
      setMapFocus(name === mapFocus ? "" : name);
    };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  // 빈 곳(또는 흐린 산업)을 누르면 이전 산업으로, 처음 고른 산업이었으면 전체 보기로
  svg.addEventListener("click", (e) => {
    if (svg.dataset.pinched || !mapFocus || e.target.closest(mapMode === "spot" ? "[data-n]" : "[data-n]:not(.dim)")) return;
    setMapFocus(mapTrail.pop() || "", true);
  });
  bindMapPinch(svg);
  const all = $("[data-mapall]");
  if (all) all.addEventListener("click", () => setMapFocus(""));
  // 강조 방식 바꾸기: 다시 그리지 않고 지금 지도에서 점만 새 자리로 옮겨요 (화면 위치 그대로)
  document.querySelectorAll("[data-mapmode]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mapmode === "spot") mapShuffle(true);  // 누를 때마다 새로 섞어요
    mapMode = b.dataset.mapmode === "spot" ? "spot" : "zoom";
    remember("map_mode", mapMode);
    document.querySelectorAll("[data-mapmode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mapmode === mapMode)));
    svg.classList.toggle("spot", mapMode === "spot");
    const sub = $("#map-sub");
    if (sub) sub.classList.toggle("spot", mapMode === "spot");
    svg.classList.add("moving");  // 점 크기도 퍼지는 동안 같이 천천히 바뀌어요
    clearTimeout(svg.movingT);
    svg.movingT = setTimeout(() => svg.classList.remove("moving"), 2100);
    placeMap(svg, true, true);
    mapWave(svg);  // 지도 위쪽은 그대로, 아래로만 길어지거나 짧아져요
    mapConstellation(svg, mapFocus, 2000);  // 다 퍼진 뒤에 선을 그어요
  }));
  document.querySelectorAll("[data-mapdays]").forEach((b) => b.addEventListener("click", () => {
    mapDays = Number(b.dataset.mapdays) === 20 ? 20 : 5;
    remember("map_days", String(mapDays));
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  document.querySelectorAll("[data-mapcolor]").forEach((b) => b.addEventListener("click", () => {
    mapColor = b.dataset.mapcolor;
    remember("map_color", mapColor);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const detail = $("#map-detail");
  if (detail) bindMapDetail(detail);
}
