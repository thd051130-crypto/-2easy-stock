"use strict";
const SAV_FIXED = [
  { key: "dep", name: "예금", price: 0, div: 3, mdd: 0, fee: 0, tax: "dep", note: "이자 연 3% 가정" },
  { key: "mine", name: "직접 입력", price: null, div: null, mdd: null, fee: 0, tax: "other", note: "아래에서 바꿔요" },
];
// 검색 아래 '자주 찾는' 버튼
const SAV_QUICK = ["kr:360750", "kr:069500", "kr:133690", "kr:458730", "kr:441680", "us:SCHD", "us:JEPI", "us:QYLD", "us:TLT", "us:TQQQ"];
const SAV_OLD = { sp500: "kr:360750", kospi: "kr:069500", ndx: "kr:133690", divg: "kr:458730", cc: "kr:441680", lev: "us:SSO",
  kolev: "kr:122630", krbond: "kr:114260", usbond: "us:TLT" };  // 예전 버튼 → 실제 종목
const SAV_ACCTS = [["isa", "ISA"], ["pension", "연금저축"], ["irp", "IRP"]];
// each: 종목마다 따로 정한 값 {종목: {mode: "sh"(주 수로), amt·start(만 원), sh·ssh(주), every(주 수로 살 때 w 매주·d 매일, 없으면 매달), from(N년 뒤부터), len(N년 동안)}}. 없는 값은 위 기본값을 따라가요.
const SAV = { monthly: 50, years: 10, start: 0, accts: ["isa"], taxOn: true, reinvest: true, picks: ["dep", "kr:360750", "us:SCHD"], price: 6, div: 2, mdd: 30, each: {} };
const savOk = (k) => SAV_FIXED.some((p) => p.key === k) || /^(kr|us):[0-9A-Z.\-^=]+$/.test(k);
try {
  const s = JSON.parse(localStorage.getItem("savings") || "{}") || {};
  if (s.rate != null) { if (s.price == null) s.price = s.rate; delete s.rate; }  // 예전 계산기 '내 가정' 수익률 → 직접 입력 주가 상승
  if (s.acct != null && s.accts == null) s.accts = s.acct === "isa" ? ["isa"] : [];  // 예전엔 계좌 하나만 골랐어요
  delete s.acct;
  Object.assign(SAV, s);
  SAV.accts = (Array.isArray(SAV.accts) ? SAV.accts : []).filter((k) => SAV_ACCTS.some(([a]) => a === k));
  SAV.picks = [...new Set((SAV.picks || []).map((k) => SAV_OLD[k] || k))].filter(savOk);
  if (!SAV.picks.length) SAV.picks = ["kr:360750"];
  if (!SAV.each || typeof SAV.each !== "object" || Array.isArray(SAV.each)) SAV.each = {};
} catch (e) { /* 처음 */ }
const PENSION_TAX = 0.055;  // 55세 이후 연금으로 받을 때 연금소득세 (70세 전 5.5%, 그 뒤 4.4%·3.3%)
const TAX = 0.154;  // 이자·배당소득세 (국내 상장 해외 ETF 매매차익도 배당소득으로 15.4%)
const KR_TAXED = /미국|나스닥|s&p|다우|글로벌|중국|차이나|일본|인도|베트남|유로|선진|신흥|채권|국채|국고채|회사채|금리|cd|kofr|머니마켓|달러|엔화|골드|금선물|은선물|원유|구리|농산물|원자재|리츠|커버드콜|합성|tdf|tif|혼합|채혼|nasdaq|s&p|dow|covered|treasury|bond|gold|global|china|japan|india/i;
const LEVER = /레버리지|인버스|2x|3x|2배|3배|ultra|leveraged|bull 3|bear|daily .*(bull|bear)/i;
function savProduct(key) {
  const fixed = SAV_FIXED.find((x) => x.key === key);
  if (fixed) {
    return fixed.key === "mine" ? { ...fixed, price: +SAV.price || 0, div: +SAV.div || 0, mdd: -(+SAV.mdd || 0),
      note: `주가 연 ${SAV.price}% · 배당 ${SAV.div}% · 최대 낙폭 -${SAV.mdd}% 가정` } : fixed;
  }
  const [m, code] = key.split(":");
  const row = symRow(m, code), st = RET[m] && RET[m][code];
  const name = row ? row[1] : code;
  const all = row ? `${row[1]} ${row[4] || ""}` : code;
  if (!st) return { key, m, code, name, missing: true, note: RET[m] ? "상장 1년이 안 됐거나 야후에 자료가 없어요" : "수익률 자료 불러오는 중" };
  const tax = m === "us" ? "us" : row && row[3] === "e" && KR_TAXED.test(all) ? "other" : "kr";
  return { key, m, code, name, price: st[1], div: st[2], mdd: st[3], fee: 0, tax, lever: LEVER.test(all), since: st[0], yrs: st[4],
    note: `최근 ${st[4]}년 실제: 주가 연 ${st[1] >= 0 ? "+" : ""}${st[1]}%, 배당 ${st[2]}% · ${st[0].slice(0, 4)}년부터 자료${m === "us" ? " · 달러 기준" : ""}` };
}
// 한 상품을 매달 시뮬레이션. 돈은 원 단위, 매달 초에 넣고 그달 오른 만큼·배당을 받아요.
// 반환: 넣은 돈, 마지막 잔고(세전), 받은 배당, 세금, 세후 금액, 매달 잔고(series)와 넣은 돈(paidSeries)
function savSim(p, { monthly, years, start, acct, taxOn, reinvest }) {
  const m = Math.round(years * 12);
  const put = Array.isArray(monthly) ? (i) => monthly[i] || 0 : () => monthly;  // 달마다 넣는 돈 (계좌 나누기면 배열)
  const g = Math.pow(1 + p.price / 100, 1 / 12) * Math.pow(1 - p.fee / 100, 1 / 12);
  const dy = p.div / 100 / 12;
  const us = p.tax === "us";
  const isa = acct === "isa" && !us, pension = (acct === "pension" || acct === "irp") && !us;
  const payTax = taxOn && !isa && !pension;  // 일반 계좌만 배당 받을 때 바로 떼요 (미국 상장은 ISA로 못 사서 일반 계좌로)
  const divRate = us ? 0.15 : TAX;  // 미국 배당은 미국에서 15% 떼고 끝
  let val = start, cash = 0, paid = start, basis = start, divs = 0, divTax = 0;
  // 지금 다 판다면 낼 세금 (배당 세금은 받을 때 이미 뗐어요)
  const sellTax = () => {
    if (!taxOn) return 0;
    if (isa) return Math.max(0, val + cash - paid - 2e6) * 0.099;
    if (pension) return Math.max(0, val + cash - paid) * PENSION_TAX;  // 연금으로 받는다고 치고 번 돈에만 (공제 안 받은 원금은 세금 없음)  // ISA 일반형: 이익(배당 포함) 200만 원까지 비과세, 넘는 부분 9.9%
    if (us) return Math.max(0, val - basis - 2.5e6) * 0.22;         // 해외 주식 양도세: 한 해 250만 원 넘는 차익에 22% (한 번에 판다고 쳐요)
    if (p.tax === "other") return Math.max(0, val - basis) * TAX;    // 팔 때 차익에 15.4% (국내 주식·주식형 ETF는 비과세)
    return 0;
  };
  // 그래프 선은 세금을 켜면 '그때 다 팔고 세금 낸 뒤' 금액이에요
  const series = [val], paidSeries = [paid];
  for (let i = 1; i <= m; i++) {
    const add = put(i);
    val += add; paid += add; basis += add;
    val *= g;
    const d = val * dy, dt = payTax ? d * divRate : 0;
    divs += d; divTax += dt;
    if (reinvest) { val += d - dt; basis += d - dt; } else cash += d - dt;
    series.push(val + cash - sellTax()); paidSeries.push(paid);
  }
  const saleTax = sellTax();
  const bal = val + cash;
  return { paid, bal, divs, divTax, cash, tax: divTax + saleTax, after: bal - saleTax, series, paidSeries };
}
// 넣는 돈을 고른 절세 계좌 한도대로 나눠요: ISA 한 해 2,000만·총 1억, 연금저축+IRP 합쳐 한 해 1,800만, 남는 건 일반 계좌.
// 미국 상장 종목은 절세 계좌로 못 사서 전부 일반 계좌예요. 처음 넣는 돈은 첫해 한도에서 먼저 써요.
// items: [{flow: 달마다 넣는 돈(0번은 처음 넣는 돈), us}]. 여러 개를 같이 넣으면 한도를 위 종목부터 나눠 써요.
function savSplit(items) {
  const m = items[0].flow.length - 1, order = SAV.taxOn ? SAV_ACCTS.map(([k]) => k).filter((k) => SAV.accts.includes(k)) : [];
  const outs = items.map((it) => { const o = {}; [...(it.us ? [] : order), "normal"].forEach((k) => { o[k] = new Array(m + 1).fill(0); }); return o; });
  let isaAll = 0, year = -1, isaY = 0, penY = 0;
  for (let i = 0; i <= m; i++) {
    const y = i === 0 ? 0 : Math.floor((i - 1) / 12);
    if (y !== year) { year = y; isaY = 0; penY = 0; }
    items.forEach((it, j) => {
      let left = it.flow[i];
      if (!it.us) for (const k of order) {
        if (left <= 0) break;
        const room = k === "isa" ? Math.min(2e7 - isaY, 1e8 - isaAll) : 1.8e7 - penY;
        const take = Math.max(0, Math.min(left, room));
        if (!take) continue;
        if (k === "isa") { isaY += take; isaAll += take; } else penY += take;
        outs[j][k][i] += take;
        left -= take;
      }
      if (left > 0) outs[j].normal[i] += left;
    });
  }
  return outs;
}
// 계좌별로 따로 굴린 뒤 더해요
function savSimSplit(p, split, o) {
  const parts = Object.entries(split).filter(([, f]) => f.some(Boolean))
    .map(([k, f]) => ({ k, r: savSim(p, { ...o, acct: k, start: f[0], monthly: f }) }));
  if (!parts.length) return { ...savSim(p, { ...o, acct: "normal", start: 0, monthly: 0 }), by: [] };
  const sum = (f) => parts.reduce((a, x) => a + x.r[f], 0);
  const r = { paid: sum("paid"), bal: sum("bal"), divs: sum("divs"), divTax: sum("divTax"), cash: sum("cash"), tax: sum("tax"), after: sum("after"),
    series: parts[0].r.series.map((_, i) => parts.reduce((a, x) => a + x.r.series[i], 0)),
    paidSeries: parts[0].r.paidSeries.map((_, i) => parts.reduce((a, x) => a + x.r.paidSeries[i], 0)) };
  r.by = parts.map(({ k, r: x }) => ({ k, paid: x.paid }));
  return r;
}
const SAV_FREQ = { m: ["매달", 1], w: ["매주", 52 / 12], d: ["매일", 252 / 12] };
// 한 종목을 어떻게 넣는지: 따로 정한 값이 없으면 위 기본값(매달·처음에, 지금부터 끝까지)
function savPlan(k, p) {
  const e = SAV.each[k] || {}, q = savPx(p);
  const sh = e.mode === "sh" && !!q;
  const every = sh && SAV_FREQ[e.every] ? e.every : "m";
  const monthly = sh ? (e.sh ?? 1) * q.won * SAV_FREQ[every][1] : (e.amt ?? (+SAV.monthly || 0)) * 1e4;
  const start = sh ? (e.ssh ?? 0) * q.won : (e.start ?? (+SAV.start || 0)) * 1e4;
  const from = e.from ?? 0, len = e.len ?? null;
  return { custom: !!SAV.each[k], sh, shN: e.sh ?? 1, sshN: e.ssh ?? 0, every, monthly, start, from, len, end: from + (len ?? 0) };
}
// 달마다 넣는 돈: from년 뒤에 처음 돈을 넣고, 그다음 달부터 len년 동안(없으면 끝까지) 매달
function savFlow(plan, m) {
  const f = new Array(m + 1).fill(0), a = Math.min(m, Math.round(plan.from * 12));
  const b = plan.len == null ? m : Math.min(m, a + Math.round(plan.len * 12));
  if (a === 0) f[0] = plan.start; else if (a < m) f[a + 1] += plan.start;
  for (let i = a + 1; i <= b; i++) f[i] += plan.monthly;
  return f;
}
// 종목마다 따로 정한 게 하나라도 있으면 '내 계획'으로 보고 모두 합쳐요 (절세 계좌 한도도 같이 나눠 써요).
// 아니면 예전처럼 같은 돈을 종목마다 넣었을 때를 나란히 비교해요.
function savRun() {
  const all = SAV.picks.map((k, i) => { const p = savProduct(k); return { k, p, color: savColor(i), plan: savPlan(k, p) }; });
  const ok = all.filter((x) => !x.p.missing);
  const plan = ok.some((x) => x.plan.custom);
  const years = Math.min(60, Math.max(SAV.years, ...ok.map((x) => Math.ceil(x.plan.end))));
  const m = Math.round(years * 12);
  const items = ok.map((x) => ({ flow: savFlow(x.plan, m), us: x.p.tax === "us" }));
  const splits = !items.length ? [] : plan ? savSplit(items) : items.map((it) => savSplit([it])[0]);
  const o = { years, taxOn: SAV.taxOn, reinvest: SAV.reinvest };
  return { o, all, plan, years, list: ok.map((x, j) => ({ ...x, r: savSimSplit(x.p, splits[j], o) })) };
}
// 계좌마다 얼마씩 들어갔는지 한 줄 (국내 상장 종목 기준, 미국 상장은 전부 일반 계좌)
function savSplitLine(list, plan) {
  if (!SAV.taxOn || !SAV.accts.length) return "";
  let x = list.find((l) => l.p.tax !== "us");
  if (plan && x) {  // 내 계획이면 국내 상장 종목을 다 더해서
    const by = {};
    list.filter((l) => l.p.tax !== "us").forEach((l) => l.r.by.forEach((b) => { by[b.k] = (by[b.k] || 0) + b.paid; }));
    x = { r: { by: [...SAV_ACCTS.map(([k]) => k), "normal"].filter((k) => by[k]).map((k) => ({ k, paid: by[k] })) } };
  }
  if (!x || x.r.by.length < 2) return x && x.r.by.length === 1 ? `<p class="muted" style="margin:8px 0 0">넣은 돈 전부 ${ACCT_NAME[x.r.by[0].k]}에 들어가요.</p>` : "";
  return `<p class="muted" style="margin:8px 0 0">계좌별 넣은 돈: ${x.r.by.map((b) => `${ACCT_NAME[b.k]} ${savWon(b.paid)}`).join(" · ")}</p>`;
}
const ACCT_NAME = { isa: "ISA", pension: "연금저축", irp: "IRP", normal: "일반 계좌" };
const savWon = (x) => {
  const a = Math.abs(x), s = x < 0 ? "-" : "";
  if (a >= 1e8) { const man = Math.round((a % 1e8) / 1e4); return `${s}${Math.floor(a / 1e8)}억${man ? ` ${man.toLocaleString("ko-KR")}만` : ""}원`; }
  return `${s}${Math.round(a / 1e4).toLocaleString("ko-KR")}만원`;
};
// 지금 가격이면 매달 넣는 돈(처음 넣는 돈)으로 몇 주 사는지. 주 수로 정했으면 그게 얼마인지.
function savShares(p, plan, r, years) {
  const q = savPx(p);
  if (!q) return "";
  const cnt = (v) => (v < 0.1 ? "0.1주 미만" : v >= 100 ? `${Math.round(v).toLocaleString("ko-KR")}주` : `${v.toFixed(1)}주`);
  const n = (won) => cnt(won / q.won);
  const parts = [`${q.day ? `${md(q.day)} 종가` : "지금"} ${price(p.m, q.px)}`];
  if (plan.sh) {
    if (plan.monthly) parts.push(`${SAV_FREQ[plan.every][0]} ${savDec(plan.shN)}주 ≈ ${plan.every === "m" ? "" : "한 달 "}${savWon(plan.monthly)}`);
    if (plan.start) parts.push(`처음 ${savDec(plan.sshN)}주 ≈ ${savWon(plan.start)}`);
  } else {
    if (plan.monthly) parts.push(`매달 ${savWon(plan.monthly)} ≈ ${n(plan.monthly)}`);
    if (plan.start) parts.push(`처음 ${savWon(plan.start)} ≈ ${n(plan.start)}`);
  }
  // 총 몇 주인지: 넣은 돈 전부와 끝 금액을 지금 주가로 나눠요 (미래 주가는 가정하지 않아요).
  const total = `<div class="meta"><b>넣은 돈 ${savWon(r.paid)} ≈ ${n(r.paid)} · ${years}년 뒤 ${savWon(r.after)} ≈ ${n(r.after)}</b> (지금 주가로)</div>`;
  return `<div class="meta">${parts.join(" · ")}${p.m === "us" ? ` (환율 ${num(q.fx)}원)` : ""}</div>${total}`;
}
// 종목마다 넣는 방법 한 줄 요약
const savDec = (x) => (+x).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
function savEachSum(k) {
  const p = savProduct(k), pl = savPlan(k, p);
  const how = [pl.sh ? `${SAV_FREQ[pl.every][0]} ${savDec(pl.shN)}주(≈${pl.every === "m" ? "" : "월 "}${savWon(pl.monthly)})` : `매달 ${savWon(pl.monthly)}`];
  if (pl.start) how.push(pl.sh ? `처음 ${savDec(pl.sshN)}주` : `처음 ${savWon(pl.start)}`);
  if (pl.from) how.push(`${savDec(pl.from)}년 뒤부터`);
  if (pl.len != null) how.push(`${savDec(pl.len)}년 동안`);
  return `${pl.custom ? "" : "기본 · "}${how.join(" · ")}`;
}
// 종목마다 정하기: 금액이나 주 수, 처음 넣는 돈, 언제부터 몇 년 동안. 비운 칸은 위 기본값을 따라가요.
const SAV_OPEN = new Set();
function savEachRow(k, i) {
  const p = savProduct(k), e = SAV.each[k] || {}, q = savPx(p), sh = e.mode === "sh" && !!q;
  const inp = (f, label, unit, ph) => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-sav-e="${f}" type="text" inputmode="decimal"
    value="${e[f] ?? ""}" placeholder="${ph}"><span>${unit}</span></span></label>`;
  const mode = q ? `<div class="chips" role="group" aria-label="넣는 방법"><button type="button" data-sav-m="won" aria-pressed="${!sh}">금액으로</button>
    <button type="button" data-sav-m="sh" aria-pressed="${sh}">주 수로</button></div>` : "";
  const every = sh && SAV_FREQ[e.every] ? e.every : "m";
  const freq = sh ? `<div class="chips sav-freq" role="group" aria-label="얼마나 자주">${Object.entries(SAV_FREQ).map(([f, [l]]) =>
    `<button type="button" data-sav-f="${f}" aria-pressed="${every === f}">${l}</button>`).join("")}</div>` : "";
  const amt = sh ? inp("sh", SAV_FREQ[every][0], "주", 1) + inp("ssh", "처음에", "주", 0) : inp("amt", "매달", "만 원", SAV.monthly) + inp("start", "처음에", "만 원", SAV.start);
  return `<details class="sav-each" data-sav-k="${esc(k)}" style="--c:${savColor(i)}"${SAV_OPEN.has(k) ? " open" : ""}>
    <summary><i class="sw"></i><span class="nm">${esc(p.name)}</span><span class="sum">${esc(savEachSum(k))}</span></summary>
    <div class="sav-each-b">${mode}${freq}<div class="sav-grid">${amt}</div>
      <div class="sav-grid">${inp("from", "시작", "년 뒤부터", 0)}${inp("len", "넣는 기간", "년 동안", "끝까지")}</div>
      <p class="muted sav-each-note">${sh ? `지금 가격 1주 ${savWon(q.won)}으로 쳐서 금액으로 바꿔요${every === "w" ? " (한 달 약 4.3주)" : every === "d" ? " (장 서는 날만, 한 달 약 21일)" : ""}. ` : ""}비운 칸은 위 기본값을 따라가요. 넣는 기간이 끝나도 넣은 돈은 끝까지 그대로 굴려요.</p>
      <button type="button" class="sav-clear" data-sav-reset${SAV.each[k] ? "" : " hidden"}>이 종목 기본값으로</button></div></details>`;
}
function savEachList() {
  return SAV.picks.map((k, i) => savEachRow(k, i)).join("");
}
let savQuery = "";
// 고른 종목 (× 로 빼요)
function savPicked() {
  return SAV.picks.map((k, i) => { const p = savProduct(k);
    return `<span class="sav-pick" style="--c:${savColor(i)}"><i class="sw"></i><span>${esc(p.name)}${p.code ? ` <small>${esc(p.code)}</small>` : ""}</span>
      <button type="button" data-sav-x="${esc(k)}" aria-label="${esc(p.name)} 빼기">×</button></span>`; }).join("")
    + (SAV.picks.length > 1 ? `<button type="button" class="sav-clear" data-sav-clear>모두 빼기</button>` : "");
}
function savQuick() {
  const btn = (k, label) => `<button type="button" data-sav-p="${esc(k)}" aria-pressed="${SAV.picks.includes(k)}">${esc(label)}</button>`;
  return SAV_FIXED.map((p) => btn(p.key, p.name)).join("") + SAV_QUICK.map((k) => { const [m, code] = k.split(":"), row = symRow(m, code);
    return row ? btn(k, row[1]) : ""; }).join("");
}
const savStat = (m, code) => { const st = RET[m] && RET[m][code];
  return st ? `주가 연 ${st[1] >= 0 ? "+" : ""}${st[1]}% · 배당 ${st[2]}% · 최대 낙폭 ${st[3]}%` : RET[m] ? "자료 부족" : ""; };
function savResults() {
  const q = savQuery.trim();
  if (!q) return "";
  if (!SYM.kr || !SYM.us) return `<p class="muted" style="margin:8px 0 0">종목 목록 불러오는 중…</p>`;
  const qs = queryKeys(q), hits = [];
  for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => { const sc = scoreOf(e.row, e.keys, qs); if (sc != null) hits.push({ m, sc, i, row: e.row }); });
  hits.sort((a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i);
  if (!hits.length) return `<p class="muted" style="margin:8px 0 0">'${esc(q)}'에 맞는 종목이 없어요.</p>`;
  return `<ul class="sav-res">${hits.slice(0, 7).map(({ m, row }) => { const k = `${m}:${row[0]}`, on = SAV.picks.includes(k);
    return `<li><button type="button" data-sav-p="${esc(k)}" aria-pressed="${on}"><span class="l"><b>${esc(row[1])}</b>
      <small>${esc(row[0])} · ${esc(kindName(m, row))}</small><small>${esc(savStat(m, row[0]))}</small></span><span class="add">${on ? "✓" : "+"}</span></button></li>`; }).join("")}</ul>`;
}
function savingsCard() {
  const inp = (k, label, unit) => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-sav="${k}" type="text" inputmode="decimal" value="${SAV[k]}"><span>${unit}</span></span></label>`;
  const yrs = [1, 3, 5, 10, 20, 30].map((y) => `<button type="button" data-sav-y="${y}" aria-pressed="${SAV.years === y}">${y}년</button>`).join("");
  const tog = (k, label, sub) => `<label class="sav-tog"><input type="checkbox" data-sav-c="${k}" ${SAV[k] ? "checked" : ""}><span class="sw-t" aria-hidden="true"></span><span><b>${label}</b><small>${sub}</small></span></label>`;
  const accts = SAV_ACCTS.map(([k, l]) => `<button type="button" data-sav-a="${k}" aria-pressed="${SAV.accts.includes(k)}">${l}</button>`).join("");
  return `<section class="card" id="sav-card"><h2>적립식 ${term("복리")} 계산기 <small>무엇에 매달 넣으면 얼마가 될까</small></h2>
    <div class="sav-grid">${inp("monthly", "매달", "만 원")}${inp("start", "처음에", "만 원")}</div>
    <div class="period" role="group" aria-label="기간" style="margin:10px 0 0">${yrs}</div>
    <h3 class="sav-h">종목 넣기 <small class="muted">몇 개든 같이 비교</small></h3>
    <div class="sav-picked" id="sav-picked">${savPicked()}</div>
    <input id="sav-q" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="종목·ETF 검색 (예: 슈드, 코덱스 200, 삼성전자, TQQQ)" aria-label="계산기에 넣을 종목 검색" value="${esc(savQuery)}">
    <div id="sav-res">${savResults()}</div>
    <div class="sav-quick"><span class="muted">자주 찾는</span><div class="chips" id="sav-quick">${savQuick()}</div></div>
    <h3 class="sav-h"><span style="white-space:nowrap">종목마다 정하기</span> <small class="muted">금액·주 수·기간 따로, 누르면 펼쳐져요</small></h3>
    <div class="sav-eachs" id="sav-each">${savEachList()}</div>
    <details class="sav-mine" ${SAV.picks.includes("mine") ? "open" : ""}><summary>직접 입력 값 바꾸기</summary>
      <div class="sav-grid sav-grid3" style="margin-top:8px">${inp("price", "주가 상승", "%/년")}${inp("div", "배당·이자", "%/년")}${inp("mdd", "최대 낙폭", "%")}</div></details>
    <div class="sav-togs">${tog("reinvest", "배당 재투자", "받은 배당·이자로 다시 사요")}${tog("taxOn", "세금 반영", "배당·이자·차익 세금을 떼요")}</div>
    <div id="sav-acct" style="margin:8px 0 0;${SAV.taxOn ? "" : "display:none"}"><p class="muted" style="margin:0 0 6px;font-size:13px">절세 계좌 <small>여러 개 가능 · 한도 넘는 돈은 다음 계좌, 마지막은 일반 계좌로</small></p>
      <div class="chips" role="group" aria-label="절세 계좌">${accts}</div></div>
    <div id="sav-out">${savOut()}</div>
    <p class="muted note" style="margin:12px 0 0">종목 숫자는 최근 10년(상장이 더 짧으면 상장 뒤) 실제 주가 상승률과 배당률이고, 최대 낙폭은 상장 뒤 월말 기준이에요. ETF 보수는 가격에 이미 빠져 있어요.
      ${term("ISA")}(일반형)는 3년 이상 유지하면 이익 200만 원까지 세금이 없고, 넘는 부분은 9.9%예요. 한 해 2,000만 원까지 넣을 수 있어요.
      연금저축·IRP는 합쳐서 한 해 1,800만 원까지 넣고, 55세 이후 연금으로 받으면 번 돈에 5.5%(나이 들수록 3.3%까지)만 내요.
      일반 계좌는 배당·이자를 받을 때 15.4%, 해외·채권·커버드콜 ETF는 팔 때 차익에도 15.4%예요. 국내 주식과 국내 주식형 ETF 차익은 세금이 없어요.
      미국 상장 종목은 ISA로 못 사서 일반 계좌로 계산해요(배당 15%, 한 해 250만 원 넘는 차익 22%). 달러 기준이라 환율 변화는 빠져 있어요.
      과거 10년이 앞으로도 그대로 이어진다는 보장이 없어요. 특히 많이 오른 종목일수록 숫자가 부풀어 보일 수 있어요.</p></section>`;
}
function savOut() {
  const { all, list, plan, years } = savRun();
  const missing = all.filter((x) => x.p.missing).map((x) => `<p class="muted" style="margin:8px 0 0">${esc(x.p.name)}: ${esc(x.p.note)}</p>`).join("");
  if (!list.length) return missing || `<p class="muted" style="margin:12px 0 0">위에서 종목을 하나 이상 넣어 주세요.</p>`;
  const paid = list[0].r.paid;
  const warn = [];
  const has = (k) => SAV.taxOn && SAV.accts.includes(k);
  if (has("isa") && years < 3) warn.push("ISA는 3년 전에 깨면 비과세 혜택이 없어요.");
  if (has("pension") || has("irp")) warn.push(`${[has("pension") && term("연금저축"), has("irp") && term("IRP")].filter(Boolean).join("·")}는 55세 이후 연금으로 받는다고 치고 번 돈에 5.5%를 뗐어요. 그전에 빼면 16.5%예요. 소득이 있을 때 받는 세액공제(최대 16.5%)는 빠져 있어요.`);
  if (has("irp")) warn.push("IRP는 소득이 있어야 만들 수 있어요(전역 후 취업하고 나서).");
  if (has("pension") && has("irp")) warn.push("연금저축과 IRP는 합쳐서 한 해 1,800만 원까지라 연금저축을 먼저 채우고 남는 한도를 IRP에 넣어요.");
  if (plan && list.some((x) => x.plan.from >= years)) warn.push(`보는 기간(${years}년)보다 늦게 시작하는 종목은 넣은 돈이 없어요. 기간 버튼을 늘려 보세요.`);
  if (SAV.taxOn && SAV.accts.length && list.some((x) => x.p.tax === "us")) warn.push("미국 상장 종목은 ISA·연금 계좌로 못 사서 일반 계좌 세금으로 계산했어요. 절세 계좌에선 같은 지수를 따르는 국내 상장 ETF를 사요.");
  if (list.some((x) => x.p.lever)) warn.push(`${term("레버리지")}·인버스 ETF는 폭락 때 회복이 아주 느리고, 낙폭 최소화 원칙과 맞지 않아요. 비교용으로만 보세요.`);
  if (list.some((x) => x.p.price >= 20)) warn.push("최근 10년 주가가 연 20% 넘게 오른 종목이 있어요. 그만큼 계속 오르기는 어려워서 결과가 부풀어 보일 수 있어요.");
  const max = Math.max(...list.map(({ r }) => r.paid + Math.max(0, r.bal - r.paid - (r.divs - r.divTax)) + r.divs - r.divTax));
  const rows = list.map(({ k, p, color, r, plan: pl }) => {
    const profit = r.after - r.paid;
    const divNet = r.divs - r.divTax;
    const priceGain = r.bal - r.paid - divNet;  // 재투자로 불어난 몫은 '주가 상승'에 같이 들어가요
    const seg = (v, cls, label) => (v > 0 ? `<i class="${cls}" style="width:${(v / max) * 100}%" title="${label} ${savWon(v)}"></i>` : "");
    const lossW = priceGain < 0 ? Math.min(-priceGain, r.paid) : 0;
    const bar = `<div class="sav-bar" role="img" aria-label="넣은 돈 ${savWon(r.paid)}, 주가 ${savWon(priceGain)}, 배당 ${savWon(divNet)}, 세금 ${savWon(r.tax)}">
      ${seg(r.paid - lossW, "b-paid", "넣은 돈")}${seg(lossW, "b-loss", "주가 하락")}${seg(Math.max(0, priceGain), "b-gain", "주가 상승")}${seg(divNet, "b-div", "배당")}</div>`;
    const worst = p.mdd ? `<div class="meta">나쁜 때 잔고가 잠깐 ${savWon(r.bal * (1 + p.mdd / 100))}까지 (${Math.round(p.mdd)}%)</div>` : "";
    const cash = !SAV.reinvest && r.cash > 0 ? ` · 쌓인 배당 현금 ${savWon(r.cash)}` : "";
    return `<li class="sav-row" style="--c:${color}"><div class="sav-top"><div class="name"><i class="sw" style="background:${color}"></i> ${esc(p.name)}</div>
        <div class="r"><b>${savWon(r.after)}</b><div class="meta ${sign(profit)}">${profit >= 0 ? "+" : ""}${savWon(profit)} (${r.paid ? `${profit >= 0 ? "+" : ""}${Math.round((profit / r.paid) * 100)}%` : "-"})</div></div></div>
      ${bar}
      <div class="meta">${[r.divs > 0 ? `배당·이자 ${savWon(r.divs)}` : "배당 없음", cash.slice(3), r.tax > 0 ? `세금 ${savWon(r.tax)}` : "",
        p.fee ? `${term("총보수")} 연 ${p.fee}%` : ""].filter(Boolean).join(" · ")}</div>
      ${plan ? `<div class="meta">📅 ${esc(savEachSum(k))}</div>` : ""}${savShares(p, pl, r, years)}<div class="meta">${esc(p.note)}</div>${worst}</li>`;
  }).join("");
  const tPaid = list.reduce((a, x) => a + x.r.paid, 0), tAfter = list.reduce((a, x) => a + x.r.after, 0);
  const hero = plan
    ? `<div class="sav-hero"><div><small>넣은 돈 합계 (${years}년)</small><b>${savWon(tPaid)}</b></div>
      <div><small>${SAV.taxOn ? "세금 뗀 뒤" : "세전"} 합계</small><b class="${sign(tAfter - tPaid)}">${savWon(tAfter)}</b></div></div>
      <p class="muted" style="margin:8px 0 0">종목마다 정한 대로 ${list.length}개를 모두 합친 금액이에요 (${tPaid ? `${tAfter >= tPaid ? "+" : ""}${Math.round(((tAfter - tPaid) / tPaid) * 100)}%` : "-"})${SAV.taxOn && SAV.accts.length ? ". 절세 계좌 한도는 위 종목부터 나눠 써요" : ""}.</p>`
    : `<div class="sav-hero"><div><small>넣은 돈 (${years}년)</small><b>${savWon(paid)}</b></div>
      <div><small>${SAV.taxOn ? "세금 뗀 뒤" : "세전"} 최고</small><b class="${sign(Math.max(...list.map((x) => x.r.after)) - paid)}">${savWon(Math.max(...list.map((x) => x.r.after)))}</b></div></div>`;
  return `${hero}
    ${savSplitLine(list, plan)}${warn.map((w) => `<p class="caution" style="margin:8px 0 0">⚠️ ${w}</p>`).join("")}${missing}
    <p class="muted sav-cap">${SAV.taxOn ? "그래프는 그때 다 팔고 세금을 낸 뒤 손에 쥐는 금액이에요" : "그래프는 세금을 떼기 전 금액이에요"}</p>
    <div class="chart sav-chart" id="sav-chart"></div>
    <div class="legend sav-legend"><span class="key"><i class="sw b-paid"></i>넣은 돈</span><span class="key"><i class="sw b-gain"></i>주가 상승</span><span class="key"><i class="sw b-div"></i>배당·이자</span><span class="key"><i class="sw b-loss"></i>주가 하락</span>${plan && list.length > 1 ? `<span class="key"><i class="sw sav-tot-key"></i>합계(점선)</span>` : ""}</div>
    <ul class="list sav-list">${rows}</ul>`;
}
// 부드러운 곡선(단조 3차): 값이 튀지 않게 이어요
function smoothPath(pts) {
  const n = pts.length;
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  let s = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1][0] - pts[i][0]) / 3;
    s += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + m[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - m[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return s;
}
function drawSavings() {
  const el = $("#sav-chart");
  if (!el) return;
  const run = savRun();
  if (!run.list.length) return;
  // 내 계획이면 모두 합친 선도 그려요
  const sumOf = (f) => run.list[0].r[f].map((_, i) => run.list.reduce((a, x) => a + x.r[f][i], 0));
  const paidS = run.plan ? sumOf("paidSeries") : run.list[0].r.paidSeries;
  const list = run.plan && run.list.length > 1 ? [...run.list, { p: { name: "합계" }, color: "var(--text-primary)", total: true, r: { series: sumOf("series") } }] : run.list;
  const draw = (anim) => {
    const W = Math.max(el.clientWidth, 260), H = 230;
    const pad = { l: 8, r: 82, t: 14, b: 24 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = list[0].r.series.length, months = n - 1;
    const step = Math.max(1, Math.ceil(months / 120));  // 점이 너무 많으면 솎아요 (끝점은 꼭)
    const idx = [...Array(n).keys()].filter((i) => i % step === 0 || i === n - 1);
    const hi = Math.max(...list.flatMap((x) => x.r.series), paidS[n - 1]) * 1.06 || 1;
    const x = (i) => pad.l + (months ? (i / months) * iw : iw / 2);
    const y = (v) => pad.t + (1 - v / hi) * ih;
    const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map((k) => k * e).find((k) => k >= v); };
    const tick = nice(hi / 4);
    const ticks = []; for (let v = tick; v < hi; v += tick) ticks.push(v);
    const grid = ticks.map((v) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${pad.l + 2}" y="${y(v) - 4}">${esc(bigNum(v))}</text>`).join("");
    const yrs = run.years, yStep = yrs <= 5 ? 1 : yrs <= 10 ? 2 : yrs <= 20 ? 5 : 10;
    const xl = [...Array(Math.floor(yrs / yStep) + 1).keys()].map((k) => k * yStep).map((yv) =>
      `<text x="${x(yv * 12)}" y="${H - 6}" text-anchor="${yv === 0 ? "start" : yv === yrs ? "end" : "middle"}">${yv === 0 ? "지금" : `${yv}년`}</text>`).join("");
    const pts = (arr) => idx.map((i) => [x(i), y(arr[i])]);
    const uid = Math.random().toString(36).slice(2, 8);
    const grads = list.map((s, k) => `<linearGradient id="sg${uid}${k}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${s.total ? 0 : k ? (list.length > 3 ? 0 : 0.10) : 0.28}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join("");
    const base = y(0);
    const areas = list.map((s, k) => { const p = pts(s.r.series), line = smoothPath(p);
      return `<path class="sav-area" d="${line}L${p[p.length - 1][0].toFixed(1)},${base}L${p[0][0].toFixed(1)},${base}Z" fill="url(#sg${uid}${k})"/>`; }).reverse().join("");
    const lines = list.map((s) => `<path class="sav-line${s.total ? " sav-total" : ""}" d="${smoothPath(pts(s.r.series))}" stroke="${s.color}"/>`).reverse().join("");
    const paidLine = `<path class="sav-paid" d="${pts(paidS).map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("")}"/>`;
    // 끝 점 + 값 알약 (겹치면 벌려요)
    // 종목이 많으면 금액 알약은 큰 순서로 6개까지만 (점은 다 찍어요). 아래로 넘치면 위로 밀어 올려요
    const dots = list.map((s) => `<circle class="sav-end" cx="${x(n - 1)}" cy="${y(s.r.series[n - 1])}" r="3.5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="1.5"/>`).join("");
    const ends = list.map((s) => ({ s, v: s.r.series[n - 1], y: y(s.r.series[n - 1]) - 9 })).sort((a, b) => b.v - a.v).slice(0, 6).sort((a, b) => a.y - b.y);
    for (let k = 0; k < ends.length; k++) ends[k].y = Math.max(k ? ends[k - 1].y + 20 : 0, ends[k].y);
    for (let k = ends.length - 1; k >= 0; k--) ends[k].y = Math.min(k < ends.length - 1 ? ends[k + 1].y - 20 : pad.t + ih - 18, ends[k].y);
    const short = (v) => savWon(v).replace(/원$/, "");
    const pills = ends.map((e) => { const t = short(e.v), w = Math.min(pad.r - 8, t.length * 7 + 12), px = pad.l + iw + 6;
      return `<g class="sav-end" transform="translate(${px},${e.y.toFixed(1)})"><rect width="${w}" height="18" rx="9" fill="${e.s.color}"/>
        <text x="${w / 2}" y="13" text-anchor="middle" class="sav-pill"${e.s.total ? ' style="fill:var(--surface-1)"' : ""}>${esc(t)}</text></g>`; }).join("") + dots;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(list.map((s) => s.p.name).join(", "))} 적립 잔고 차트">
      <defs>${grads}</defs>${grid}<line class="sav-base" x1="${pad.l}" x2="${pad.l + iw}" y1="${base}" y2="${base}"/>
      ${areas}${paidLine}${lines}${pills}${xl}
      <g class="hover" style="display:none"><line class="cross" y1="${pad.t}" y2="${pad.t + ih}"/>
        ${list.map((s) => `<circle r="5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`).join("")}</g>
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" style="display:none"></div>`;
    const svg = $("svg", el), g = $(".hover", el), tip = $(".tip", el);
    if (anim) drawIn(svg, { x0: pad.l, w: iw, sel: ".sav-area, .sav-paid, .sav-line", late: ".sav-end" });
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(months, Math.round(((px - pad.l) / iw) * months)));
      const cx = x(i);
      g.style.display = "";
      $("line", g).setAttribute("x1", cx); $("line", g).setAttribute("x2", cx);
      g.querySelectorAll("circle").forEach((c, k) => { c.setAttribute("cx", cx); c.setAttribute("cy", y(list[k].r.series[i])); });
      const when = i === 0 ? "지금" : `${Math.floor(i / 12) ? `${Math.floor(i / 12)}년` : ""}${i % 12 ? ` ${i % 12}개월` : ""} 뒤`.trim();
      tip.innerHTML = `<div class="muted">${esc(when)} · 넣은 돈 ${esc(savWon(paidS[i]))}${SAV.taxOn ? " · 세금 뗀 뒤" : ""}</div>` + [...list].sort((a, b) => b.r.series[i] - a.r.series[i]).map((s) =>
        `<div class="row"><i class="sw" style="background:${s.color}"></i>${esc(s.p.name)} <b>${esc(savWon(s.r.series[i]))}</b></div>`).join("");
      tip.style.display = "";
      const tw = tip.offsetWidth, left = (cx / W) * r.width;
      tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    };
    const hide = () => { g.style.display = "none"; tip.style.display = "none"; };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", hide);
  };
  draw(drawSoon(el));
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); }
  });
  ro.observe(el);
}
function bindSavings() {
  const card = $("#sav-card");
  if (!card) return;
  const save = () => { remember("savings", JSON.stringify(SAV)); };
  // 종목마다 정하기 칸은 입력 중에 다시 그리지 않고 요약·기본값 안내만 바꿔요 (키보드가 안 닫혀요)
  const updEach = () => card.querySelectorAll(".sav-each").forEach((d) => {
    const k = d.dataset.savK, sum = $(".sum", d), rs = $("[data-sav-reset]", d);
    if (sum) sum.textContent = savEachSum(k);
    if (rs) rs.hidden = !SAV.each[k];
    const a = $('[data-sav-e="amt"]', d), b = $('[data-sav-e="start"]', d);
    if (a) a.placeholder = SAV.monthly; if (b) b.placeholder = SAV.start;
  });
  const refresh = () => { save(); updEach(); const out = $("#sav-out"); if (out) { out.innerHTML = savOut(); drawSavings(); } };
  // 고른 종목·검색 결과·자주 찾는 버튼만 다시 그려요 (검색창은 그대로 둬서 키보드가 안 닫혀요)
  const redrawPicks = () => {
    const a = $("#sav-picked"), b = $("#sav-res"), c = $("#sav-quick");
    if (a) a.innerHTML = savPicked();
    if (b) b.innerHTML = savResults();
    if (c) c.innerHTML = savQuick();
    const e = $("#sav-each"); if (e) e.innerHTML = savEachList();
    const d = $(".sav-mine"); if (d && SAV.picks.includes("mine")) d.open = true;
  };
  card.querySelectorAll("[data-sav]").forEach((i) => i.addEventListener("input", () => {
    const v = parseFloat(i.value.replace(/[,\s]/g, ""));
    const k = i.dataset.sav, neg = k === "price";  // 주가 상승은 마이너스도 돼요
    SAV[k] = Number.isFinite(v) && (neg || v >= 0) ? Math.max(-50, Math.min(v, k === "mdd" ? 99 : k === "price" || k === "div" ? 50 : 1e6)) : 0;
    refresh();
  }));
  const pick = (attr, key, cast) => card.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener("click", () => {
    SAV[key] = cast(b.getAttribute(attr));
    card.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    refresh();
  }));
  pick("data-sav-y", "years", Number);
  // 절세 계좌는 여러 개 같이 고를 수 있어요 (눌러서 켜고 끄기)
  card.querySelectorAll("[data-sav-a]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.savA;
    SAV.accts = SAV.accts.includes(k) ? SAV.accts.filter((a) => a !== k) : SAV_ACCTS.map(([a]) => a).filter((a) => a === k || SAV.accts.includes(a));
    b.setAttribute("aria-pressed", String(SAV.accts.includes(k)));
    refresh();
  }));
  // 종목 넣기·빼기: 검색 결과·자주 찾는 버튼은 눌러서 넣고 다시 누르면 빼요
  card.addEventListener("click", (e) => {
    const x = e.target.closest("[data-sav-x]"), p = e.target.closest("[data-sav-p]");
    const mb = e.target.closest("[data-sav-m]"), rs = e.target.closest("[data-sav-reset]"), fb = e.target.closest("[data-sav-f]");
    if (mb || rs || fb) {  // 금액으로·주 수로 바꾸기, 기본값으로: 그 종목 칸만 다시 그려요 (누른 버튼은 제자리)
      const d = e.target.closest(".sav-each"), k = d.dataset.savK, i = SAV.picks.indexOf(k);
      if (rs) delete SAV.each[k];
      else if (fb) {  // 매달·매주·매일: 주 수는 그대로 두고 자주 사는 만큼 금액이 늘어요
        const ed = SAV.each[k] || (SAV.each[k] = {});
        if (fb.dataset.savF === "m") delete ed.every; else ed.every = fb.dataset.savF;
      } else {
        const p = savProduct(k), q = savPx(p), pl = savPlan(k, p), ed = SAV.each[k] || (SAV.each[k] = {});
        if (mb.dataset.savM === "sh") {
          // 처음 주 수로 바꿀 때는 지금 금액이 몇 주인지로 채워요
          if (q && ed.sh == null) ed.sh = Math.max(1, Math.round(pl.monthly / q.won));
          if (q && ed.ssh == null && pl.start) ed.ssh = Math.round(pl.start / q.won);
          ed.mode = "sh";
        } else delete ed.mode;
        if (!Object.keys(ed).length) delete SAV.each[k];
      }
      SAV_OPEN.add(k);
      d.outerHTML = savEachRow(k, i);
      refresh();
      return;
    }
    if (e.target.closest("[data-sav-clear]")) {
      SAV.picks = [];
    } else if (x) {
      SAV.picks = SAV.picks.filter((k) => k !== x.dataset.savX);
    } else if (p) {
      const k = p.dataset.savP, at = SAV.picks.indexOf(k);
      if (at >= 0) SAV.picks.splice(at, 1); else SAV.picks.push(k);
    } else return;
    // 위에 고른 종목 줄이 늘거나 줄어도 누른 버튼(검색창 아래)이 제자리에 있게 화면을 맞춰요.
    // 고른 종목 줄의 ×를 눌렀으면 그 줄이 제자리예요 (검색창에 맞추면 화면이 올라가요)
    const q = e.target.closest("#sav-picked") ? $("#sav-picked") : $("#sav-q"), top = q && q.getBoundingClientRect().top;
    redrawPicks(); refresh();
    if (q) window.scrollBy(0, q.getBoundingClientRect().top - top);
  });
  card.addEventListener("input", (ev) => {
    const i = ev.target.closest("[data-sav-e]");
    if (!i) return;
    const k = i.closest(".sav-each").dataset.savK, f = i.dataset.savE;
    const raw = i.value.replace(/[,\s]/g, ""), v = parseFloat(raw);
    const ed = SAV.each[k] || (SAV.each[k] = {});
    if (raw === "" || !Number.isFinite(v) || v < 0) delete ed[f];
    else ed[f] = Math.min(v, f === "from" || f === "len" ? 50 : 1e6);
    if (!Object.keys(ed).length) delete SAV.each[k];
    refresh();
  });
  // 펼친 종목은 다시 그려도 펼친 채로
  card.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (!d.classList || !d.classList.contains("sav-each")) return;
    if (d.open) SAV_OPEN.add(d.dataset.savK); else SAV_OPEN.delete(d.dataset.savK);
  }, true);
  const q = $("#sav-q");
  if (q) q.addEventListener("input", () => { savQuery = q.value; const b = $("#sav-res"); if (b) b.innerHTML = savResults(); });
  card.querySelectorAll("[data-sav-c]").forEach((c) => c.addEventListener("change", () => {
    SAV[c.dataset.savC] = c.checked;
    const a = $("#sav-acct"); if (a) a.style.display = SAV.taxOn ? "" : "none";
    refresh();
  }));
  drawSavings();
  // 종목 목록·수익률 파일은 처음 열 때 받아요
  if (!RET.kr || !SYM.kr || !SYM.us) Promise.all([loadSymbols(), loadReturns()]).then(() => { if (card.isConnected) { redrawPicks(); refresh(); } });
  // 몇 주인지 보려면 지금 가격이 필요해요 (전 종목 종가 _quotes.json)
  if (!QUOTES.kr || !QUOTES.us) Promise.all([loadQuotes("kr"), loadQuotes("us")]).then(() => { if (card.isConnected) { redrawPicks(); refresh(); } });
}
