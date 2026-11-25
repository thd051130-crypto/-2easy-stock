"use strict";
// ---------------------------------------------------------------- 투자 공부 (사용자 2026-10-24 "용어집부터 증시가 변한 이유·요인·대처법까지 교육자료")
// 홈 '더 보기' 📚 투자 공부 → #kr/more/learn. 위 가로 줄에서 네 묶음 중 하나: 오늘 왜? · 움직이는 이유 · 대처법 · 용어집.
// '오늘 왜?'는 앱이 이미 받은 자료(세계 지수·경기 국면·큰 발표·뉴스·업종·수급·리포트)로 열 때마다 새로 만들어요. 나머지는 고정 글.
// 사고팔기 신호는 안 줘요 (매매 규칙은 사용자가 없앴어요). 숫자는 참고용, 원인은 '후보'로만 말해요.
const LEARN_TABS = [["why", "오늘 왜 움직였나"], ["cases", "사례집"], ["drivers", "움직이는 이유"], ["read", "전문가 리포트"], ["cope", "대처법"], ["terms", "용어집"]];
let learnTab = "why";
try { learnTab = localStorage.getItem("learn_tab") || "why"; } catch (e) { /* 처음 */ }
const LEARN_OPEN = new Set();  // 펼친 요인·상황 (아래 버튼을 누르면 접혀요)
let learnQ = "";               // 용어집 찾기 글자
const wItem = (sym) => ((DATA && DATA.world && DATA.world.groups) || []).flatMap((g) => g.items).find((x) => x.sym === sym) || null;
const bp = (x) => (x == null ? "-" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}bp`);  // 금리 변화 (0.01%p = 1bp)
const recent = (at, h) => { const t = Date.parse(at); return t && Date.now() - t < h * 36e5 && t <= Date.now(); };
const soon = (at, h) => { const t = Date.parse(at); return t && t > Date.now() && t - Date.now() < h * 36e5; };
// 큰 발표(CPI·고용·FOMC): 최근 결과(72시간)나 곧 있을 발표(72시간)
function learnEvents(group) {
  const ev = ((DATA && DATA.events && DATA.events.events) || []).filter((e) => e.group === group && (e.tier1 || group === "rate"));
  const done = ev.filter((e) => e.actual && recent(e.at, 72));
  const next = ev.filter((e) => soon(e.at, 72));
  return { done, next };
}
const evDone = (e) => `${esc(e.ko)} 실제 <b>${esc(e.actual)}</b>${e.forecast ? ` (예상 ${esc(e.forecast)})` : ""}`;
const evNext = (e) => `${md(e.date)} ${esc(e.at.slice(11, 16))} ${esc(e.ko)} 발표 예정${e.forecast ? ` (예상 ${esc(e.forecast)})` : ""}`;
// 최근 24시간 뉴스에서 주제별 기사 (핫 뉴스 먼저)
function newsTopic(topic) {
  const seen = new Set(), out = [];
  [...hotOf(market), ...(newsOf(market) || [])].forEach((n) => { if (n.topic === topic && !seen.has(n.title)) { seen.add(n.title); out.push(n); } });
  return out;
}
const newsHit = (topic) => { const n = newsTopic(topic); return n.length ? { n: n.length, line: `뉴스 ${n.length}건 · ${esc(n[0].title)}` } : null; };
// 하루·1주 변화가 최근 120거래일 보통 크기(표준편차)의 몇 배인지 (learn_cases.py Series.z와 같아요).
// 시장이 늘 크게 출렁이는 때엔 '큰 움직임' 기준도 같이 커져요. 2배↑ 크게, 1.5배↑ 움직임
function zOf(r, diff) {
  const c = (r && r.closes || []).filter((x) => x != null).slice(-126);
  if (c.length < 31) return 0;
  const ch = (a, b) => (diff ? a - b : b ? a / b - 1 : 0);
  const d1 = [], d5 = [];
  for (let k = 1; k < c.length; k++) d1.push(ch(c[k], c[k - 1]));
  for (let k = 5; k < c.length; k++) d5.push(ch(c[k], c[k - 5]));
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  const s1 = sd(d1.slice(0, -1)), s5 = sd(d5.slice(0, -1));
  return Math.max(s1 ? Math.abs(d1[d1.length - 1]) / s1 : 0, s5 ? Math.abs(d5[d5.length - 1]) / s5 : 0);
}
const zHit = (z) => (z >= 2 ? 2 : z >= 1.5 ? 1 : 0);
const zText = (z) => (z >= 1 ? ` (평소의 ${z.toFixed(1)}배)` : "");
const chg = (r, k = "d1") => (r && r[k] != null ? `<b class="${sign(r[k])}">${pct(r[k], 1)}</b>` : "-");

// 시장을 움직이는 요인. now(m)은 오늘 자료로 본 이 요인의 모습: {hit 0~2, text, dir}. hit 2 = 크게 의심, 1 = 있음, 0 = 조용
const DRIVERS = [
  { key: "rate", quiz: "미국 10년 금리가 한 주에 0.3%p 뛰었어요. 은행주와 성장 기술주 중 버티기 쉬운 쪽은?", answer: "은행주예요. 예금·대출 금리 차이로 버는 이자가 늘 수 있어요. 성장주는 먼 미래 이익의 지금 값이 깎여서 더 크게 빠지기 쉬워요.", icon: "🏦", title: "금리", one: "금리가 오르면 주식 값은 내려가기 쉬워요.",
    chain: ["금리가 오르면 예금·채권만 들고 있어도 이자를 더 받아요", "그만큼 위험한 주식을 살 이유가 줄고, 회사는 빌린 돈 이자가 늘어요", "먼 미래에 돈을 벌 회사(성장주)일수록 지금 값이 크게 깎여요"],
    good: "은행·보험 (이자로 더 벌어요)", bad: "기술·바이오 같은 성장주, 건설·부동산·리츠 (빚이 많거나 이익이 먼 미래)",
    ex: "2022년 미국이 0%대 금리를 한 해 만에 4%대로 올리자 나스닥이 그해 30% 넘게 빠졌어요.",
    terms: ["기준금리", "국채 금리", "장단기 금리 역전"], go: ["world", "세계 지수 · 채권 금리 보기"],
    now: (m) => {
      const r = wItem("^TNX"), k = wItem("KR3Y");
      if (!r) return null;
      const z = zOf(r, true);
      const text = `미국 10년 ${r.last.toFixed(2)}% · 1주 ${bp(r.w1)}${zText(z)}${m === "kr" && k ? ` / 한국 3년 ${k.last.toFixed(2)}% · 1주 ${bp(k.w1)}` : ""}`;
      return { hit: zHit(z), text, dir: (r.w1 || 0) > 0 ? "금리가 올라 주식엔 부담 쪽" : "금리가 내려 숨통 쪽" };
    } },
  { key: "infl", quiz: "CPI가 3.5%로 지난달(3.7%)보다 낮아졌는데 주가가 빠졌어요. 왜 그럴까요?", answer: "예상치가 3.3%였다면 '예상보다 높게' 나온 거라서요. 시장은 지난달보다 예상과의 차이에 반응해요.", icon: "🛒", title: "물가", one: "물가가 예상보다 높게 나오면 '금리 더 오르겠네' 걱정에 주가가 빠져요.",
    chain: ["물가가 높으면 중앙은행이 금리를 올리거나 내리지 못해요", "그 걱정에 국채 금리가 먼저 뛰어요", "그다음 주식, 특히 성장주가 빠져요"],
    tip: "숫자 자체보다 예상치와의 차이가 중요해요. 3.7%라도 예상이 3.6%였으면 '높게 나왔다'예요.",
    good: "에너지·원자재 (물가 오를 때 같이 올라요)", bad: "성장주, 소비 관련주",
    ex: "2022년 6월 미국 물가가 1년 9.1%로 40년 만에 가장 높았고, 연준은 한 번에 0.75%p씩 금리를 올렸어요.",
    terms: ["CPI", "근원 물가", "PCE"], go: ["more:cal", "다가오는 일정 보기"],
    now: () => {
      const { done, next } = learnEvents("inflation");
      const cpi = ((DATA.macro && DATA.macro.us_economy) || []).find((x) => x.key === "cpi");
      if (done.length) return { hit: 2, text: done.slice(0, 2).map(evDone).join(" · "), dir: "발표 결과가 나왔어요" };
      if (next.length) return { hit: 1, text: evNext(next[0]), dir: "발표를 앞두고 눈치 보기" };
      return cpi ? { hit: 0, text: `${esc(cpi.name)} ${esc(cpi.value)} · ${esc(cpi.note)}`, dir: "" } : null;
    } },
  { key: "jobs", quiz: "일자리가 예상의 두 배로 늘었는데 주가가 빠졌어요. 말이 되나요?", answer: "돼요. 경기가 너무 뜨거우면 연준이 금리를 못 내리거나 더 올릴 거라고 보거든요. 그래서 고용은 '적당히'가 제일 좋아요.", icon: "👷", title: "고용", one: "일자리 숫자는 '경기가 괜찮나'와 '금리가 어떻게 될까'를 같이 알려 줘요.",
    chain: ["일자리가 너무 많이 늘면 임금·물가가 올라 금리 걱정이 커져요", "너무 적게 늘거나 실업률이 뛰면 경기 침체 걱정이 커져요", "그래서 '적당히'가 제일 좋고, 예상과 크게 다르면 어느 쪽이든 출렁여요"],
    good: "적당할 때: 대부분 업종", bad: "약할 때: 경기에 민감한 업종(소비·산업재), 강할 때: 성장주",
    ex: "2024년 8월 초 미국 고용이 예상보다 크게 약하게 나와 경기 걱정이 번졌고, 엔화 강세까지 겹쳐 8월 5일 코스피가 하루 -8.8%, 일본 닛케이가 -12.4% 빠졌어요.",
    terms: ["비농업 고용", "실업률", "삼 법칙"], go: ["more:macro", "경기 국면 보기"],
    now: () => {
      const { done, next } = learnEvents("jobs");
      const sahm = ((DATA.macro && DATA.macro.us_economy) || []).find((x) => x.key === "unrate");
      if (done.length) return { hit: 2, text: done.slice(0, 2).map(evDone).join(" · "), dir: "발표 결과가 나왔어요" };
      if (next.length) return { hit: 1, text: evNext(next[0]), dir: "발표를 앞두고 눈치 보기" };
      return sahm ? { hit: 0, text: `${esc(sahm.name)} ${esc(sahm.value)} · ${esc(sahm.note)}`, dir: "" } : null;
    } },
  { key: "cb", quiz: "연준이 모두가 예상한 대로 금리를 0.25%p 내렸는데 주가가 빠졌어요. 왜일까요?", answer: "인하는 이미 주가에 들어 있었고, 의장이 '앞으로는 천천히 내리겠다'고 하면 실망할 수 있어요. 결과보다 다음 방향이 중요해요.", icon: "🏛️", title: "중앙은행 회의", one: "금리를 정하는 날엔 결과보다 '앞으로 어떻게 하겠다'는 말에 더 크게 움직여요.",
    chain: ["미국 연준(FOMC)·한국은행(금통위)이 1년에 8번 기준금리를 정해요", "시장은 결과를 미리 짐작해서 주가에 넣어 둬요", "예상과 다르거나 의장 말에서 다음 방향이 바뀌면 크게 움직여요"],
    tip: "모두가 아는 인상·인하는 발표 날 오히려 반대로 움직이기도 해요 (소문에 사고 뉴스에 판다).",
    good: "인하 쪽: 성장주·부동산", bad: "인상 쪽: 성장주·빚 많은 회사",
    ex: "2022년 연준은 한 해에 7번 금리를 올렸어요.",
    terms: ["FOMC", "금통위", "기준금리", "양적 긴축"], go: ["more:cal", "다가오는 일정 보기"],
    now: () => {
      const { done, next } = learnEvents("rate");
      const kr = ((DATA && DATA.calendar) || []).filter((e) => e.kind === "rate" && e.date >= TODAY() && Date.parse(e.date) - Date.parse(TODAY()) <= 3 * 864e5);
      if (done.length) return { hit: 2, text: done.slice(0, 1).map((e) => `${esc(e.ko)} ${e.actual ? `<b>${esc(e.actual)}</b>` : ""}`).join(""), dir: "결과가 나왔어요" };
      if (next.length) return { hit: 1, text: evNext(next[0]), dir: "회의를 앞두고 눈치 보기" };
      if (kr.length) return { hit: 1, text: `${md(kr[0].date)} ${esc(kr[0].title)} · ${dday(kr[0].date)}`, dir: "회의를 앞두고 눈치 보기" };
      return { hit: 0, text: "3일 안 금리 회의 없음", dir: "" };
    } },
  { key: "fx", quiz: "원/달러가 1,300원에서 1,400원이 됐어요. 외국인이 산 국장 주식 값이 원화로 그대로라면 달러로는 이익일까요?", answer: "손해예요. 같은 원화 금액을 달러로 바꾸면 약 7% 줄어요 (1,300 ÷ 1,400). 그래서 원화가 약할 때 외국인이 팔기 쉬워요.", icon: "💱", title: "환율", one: "원/달러 환율이 뛰면(원화 약세) 외국인이 국장을 팔기 쉬워요.",
    chain: ["외국인은 달러를 원화로 바꿔 국장 주식을 사요", "원화 값이 떨어지면 주가가 그대로여도 달러로 치면 손해(환차손)예요", "그래서 원화가 약할 땐 외국인 매도가 늘고, 원화가 강해지면 사러 들어오기 쉬워요"],
    tip: "미장에선 달러인덱스를 봐요. 달러가 강해지면 미국 회사의 해외 매출이 줄어 보이고, 신흥국에서 돈이 빠져요.",
    good: "원화 약세: 수출 회사 (자동차·조선·반도체 — 같은 달러 매출이 원화로 커져요)", bad: "원화 약세: 원료를 사 오는 회사 (항공·정유·음식료), 외국인이 많이 가진 대형주",
    ex: "2022년 원/달러가 1,440원대까지 오르는 동안 외국인 매도가 이어지며 코스피가 크게 빠졌어요.",
    terms: ["환율", "원화 약세", "달러인덱스"], go: ["world", "세계 지수 · 환율 보기"],
    now: (m) => {
      const r = m === "kr" ? wItem("KRW=X") : wItem("DX-Y.NYB");
      if (!r) return null;
      const z = zOf(r);
      const text = (m === "kr" ? `원/달러 ${num(r.last)}원 · 하루 ${chg(r)} · 1주 ${chg(r, "w1")}` : `달러인덱스 ${r.last.toFixed(1)} · 1주 ${chg(r, "w1")}`) + zText(z);
      return { hit: zHit(z), text,
        dir: m === "kr" ? ((r.w1 || 0) > 0 ? "원화가 약해지는 쪽 (외국인엔 부담)" : "원화가 강해지는 쪽 (외국인엔 도움)") : ((r.w1 || 0) > 0 ? "달러가 강해지는 쪽" : "달러가 약해지는 쪽") };
    } },
  { key: "oil", quiz: "유가가 한 달에 30% 올랐어요. 항공사와 정유사 중 웃는 쪽은?", answer: "정유사예요. 파는 기름 값이 올라요. 항공사는 연료비가 늘어 이익이 줄기 쉬워요.", icon: "🛢️", title: "유가", one: "유가가 급하게 오르면 물가가 오르고 회사 비용이 늘어 증시엔 대체로 부담이에요.",
    chain: ["유가가 오르면 기름값·운송비·원료비가 올라요", "물가가 올라 금리 걱정이 커지고, 사람들은 다른 데 쓸 돈이 줄어요", "정유·에너지 회사는 더 벌지만 항공·운송·화학은 비용이 늘어요"],
    good: "에너지·정유", bad: "항공·운송·화학",
    ex: "2022년 러시아가 우크라이나를 침공한 뒤 WTI가 한때 배럴당 120달러를 넘었어요.",
    terms: ["WTI", "스태그플레이션"], go: ["world", "세계 지수 · 원자재 보기"],
    now: () => {
      const r = wItem("CL=F");
      if (!r) return null;
      const z = zOf(r);
      return { hit: zHit(z),
        text: `WTI ${r.last.toFixed(1)}달러 · 하루 ${chg(r)} · 1주 ${chg(r, "w1")} · 1년 ${chg(r, "y1")}${zText(z)}`,
        dir: (r.y1 || 0) > 0.5 ? "1년 새 50% 넘게 올라 경기 경고 중" : (r.w1 || 0) > 0 ? "오르는 쪽" : "내리는 쪽" };
    } },
  { key: "chip", quiz: "밤사이 미국 반도체 지수가 -5% 빠졌어요. 다음 날 아침 국장에서 가장 먼저 볼 종목은?", answer: "삼성전자·SK하이닉스예요. 코스피에서 비중이 커서 이 둘이 빠지면 지수 전체가 끌려 내려가기 쉬워요.", icon: "💾", title: "반도체·대형 기술주", one: "코스피는 반도체 비중이 커서 미국 반도체 주가를 많이 따라가요.",
    chain: ["삼성전자·SK하이닉스가 코스피 시가총액의 큰 몫을 차지해요", "두 회사 실적은 세계 반도체 경기(메모리 값, AI 서버 투자)에 달려 있어요", "그래서 전날 밤 미국 반도체 지수(SOX)가 크게 움직이면 다음 날 국장도 따라가기 쉬워요"],
    tip: "미장도 비슷해요. 엔비디아·애플·마이크로소프트 같은 큰 기술주 몇 개가 S&P500의 큰 몫이라 이들이 흔들리면 지수 전체가 흔들려요.",
    good: "AI·반도체 경기가 좋을 때: 반도체·장비·전력", bad: "반도체 값이 꺾일 때: 반도체 비중 큰 지수 전체",
    terms: ["필라델피아 반도체", "코스피", "나스닥"], go: ["world", "세계 지수 보기"],
    now: () => {
      const r = wItem("^SOX");
      if (!r) return null;
      const z = zOf(r);
      return { hit: zHit(z),
        text: `필라델피아 반도체 하루 ${chg(r)} · 1주 ${chg(r, "w1")} · 1달 ${chg(r, "m1")}${zText(z)}`, dir: (r.w1 || 0) > 0 ? "반도체가 오르는 쪽" : "반도체가 내리는 쪽" };
    } },
  { key: "global", quiz: "미국·일본은 조용했는데 코스피만 -3% 빠졌어요. 원인을 어디서 찾을까요?", answer: "한국만의 이유예요. 환율 급등, 국내 정책·정치 뉴스, 반도체 같은 특정 업종 소식, 외국인 대량 매도를 먼저 봐요.", icon: "🌏", title: "다른 나라 증시", one: "세계 돈은 이어져 있어서 큰 나라 증시가 흔들리면 같이 흔들려요.",
    chain: ["국장은 밤사이 미국 마감을 보고 아침을 시작해요", "미장도 아시아·유럽에서 먼저 터진 큰 사건에 반응해요", "다른 나라는 멀쩡한데 우리만 빠졌다면 우리만의 이유(환율·정책·특정 업종)를 찾아봐요"],
    good: "", bad: "",
    terms: ["S&P500", "나스닥"], go: ["world", "세계 지수 보기"],
    now: (m) => {
      const pair = m === "kr" ? [wItem("^GSPC"), wItem("^IXIC")] : [wItem("^N225"), wItem("^STOXX50E")];
      const [a, b] = pair;
      if (!a) return null;
      const own = wItem(OWN_IDX[m]);
      const z = Math.max(zOf(a), b ? zOf(b) : 0);
      const alone = own && own.d1 != null && zOf(own) >= 1.5 && z < 1;
      return { hit: zHit(z),
        text: `${esc(a.name)} ${chg(a)}${b ? ` · ${esc(b.name)} ${chg(b)}` : ""}`,
        dir: alone ? `다른 나라는 조용한데 ${m === "kr" ? "국장" : "미장"}만 크게 움직였어요 → 우리만의 이유 쪽` : "" };
    } },
  { key: "trade", quiz: "미국이 한국 자동차에 관세를 올린다는 뉴스가 나왔어요. 가장 먼저 영향받는 업종은?", answer: "자동차와 자동차 부품이에요. 관세는 어느 품목이냐에 따라 업종마다 다르게 맞아요.", icon: "🚢", title: "관세·무역", one: "한국은 수출로 먹고사는 나라라 관세·무역 분쟁 소식에 특히 민감해요.",
    chain: ["관세가 붙으면 수출품 값이 비싸져 덜 팔리거나 이익이 줄어요", "어느 나라·어느 품목이냐에 따라 업종별로 다르게 맞아요 (반도체·자동차·철강 등)", "협상 타결·유예 소식이 나오면 반대로 크게 오르기도 해요"],
    good: "협상 타결: 수출주 전반", bad: "관세 강화: 그 품목 수출 회사",
    ex: "2025년 4월 미국이 거의 모든 나라에 상호관세를 발표하자 S&P500이 이틀 만에 10% 넘게 빠졌고, 일주일 뒤 90일 유예 발표 날엔 하루 +9.5% 올랐어요.",
    terms: ["안전자산"], go: ["more:policy", "정부 정책 보기"],
    now: () => { const n = newsHit("무역·관세"); return n ? { hit: n.n >= 3 ? 2 : 1, text: n.line, dir: "" } : { hit: 0, text: "최근 24시간 관세·무역 뉴스 조용", dir: "" }; } },
  { key: "geo", quiz: "중동에서 전쟁이 났어요. 같이 오르기 쉬운 것 두 가지는?", answer: "유가와 금값이에요. 원유 공급 걱정에 유가가, 불안해서 안전자산인 금으로 돈이 가요.", icon: "⚔️", title: "전쟁·지정학", one: "전쟁·분쟁 소식은 앞을 안 보이게 만들어 '일단 팔고 보자'는 심리를 키워요.",
    chain: ["불확실하면 투자자는 주식을 줄이고 안전자산(달러·금·국채)으로 가요", "중동이면 유가가, 대만·북한이면 반도체·국장이 특히 흔들려요", "다만 과거엔 충격이 생각보다 빨리 회복된 경우가 많았어요"],
    good: "방산·에너지, 금", bad: "항공·여행, 위험이 큰 성장주",
    terms: ["안전자산", "VIX"], go: ["more:news", "지금 뉴스 보기"],
    now: () => {
      const n = newsHit("지정학"), g = wItem("GC=F");
      const gold = g && (g.d1 || 0) >= 0.015;
      if (!n && !gold) return { hit: 0, text: "최근 24시간 전쟁·분쟁 뉴스 조용", dir: "" };
      return { hit: n && n.n >= 3 ? 2 : 1, text: [n && n.line, gold && `금값 하루 ${chg(g)} (안전자산으로 돈이 감)`].filter(Boolean).join(" · "), dir: "" };
    } },
  { key: "fear", quiz: "VIX가 15에서 35로 뛰었어요. 무슨 뜻일까요?", answer: "시장이 앞으로 한 달 크게 출렁일 거라고 겁먹었다는 뜻이에요. 30을 넘으면 큰 공포예요. 언제 가라앉을지는 미리 알 수 없어요.", icon: "😨", title: "공포·심리", one: "겁이 커지면 이유를 따지기 전에 다 같이 팔아요. VIX(공포 지수)로 그 정도를 봐요.",
    chain: ["나쁜 소식이 겹치면 VIX가 뛰어요", "빚내서 산 사람들의 주식이 강제로 팔리면(반대매매) 하락이 더 커져요", "공포가 가라앉으면 좋은 회사부터 먼저 회복하는 경우가 많아요"],
    good: "", bad: "빚(신용)이 많이 낀 종목, 작은 회사",
    ex: "2020년 3월 코로나 때 VIX가 80을 넘었어요 (평소 12~20).",
    terms: ["VIX", "패닉 셀", "반대매매", "FOMO"], go: ["world", "세계 지수 · VIX 보기"],
    now: () => {
      const r = wItem("^VIX");
      if (!r) return null;
      const z = (r.d1 || 0) > 0 ? zOf(r) : 0;  // 공포는 오를 때만
      return { hit: r.last >= 30 ? 2 : Math.max(zHit(z), r.last >= 22 ? 1 : 0),
        text: `VIX ${r.last.toFixed(1)} · 하루 ${chg(r)}`, dir: r.last >= 30 ? "큰 공포" : r.last >= 20 ? "불안한 편" : "평온한 편 (보통 12~20)" };
    } },
  { key: "macro", quiz: "장단기 금리가 역전됐어요. 바로 주가가 빠질까요?", answer: "꼭 그렇진 않아요. 과거엔 역전 뒤 침체까지 1~2년 걸리기도 했고, 그동안 주가가 오른 때도 있었어요. 경고 신호로만 봐요.", icon: "🌡️", title: "경기 흐름", one: "길게 보면 주가는 회사 이익을, 이익은 경기를 따라가요.",
    chain: ["경기가 식으면 사람들이 덜 사고 회사 이익이 줄어요", "시장은 미리 알아채려고 금리 차·신용·구리 값 같은 신호를 봐요", "이 앱 '경기 국면' 칸이 그런 신호 7개를 매일 점검해요"],
    good: "확장기: 산업재·소재·금융", bad: "위축기: 경기 민감주 (방어주·채권이 상대적으로 버텨요)",
    terms: ["경기 침체", "장단기 금리 역전", "구리/금 비율", "하이일드", "섹터 로테이션"], go: ["more:macro", "경기 국면 보기"],
    now: () => {
      const m = DATA.macro;
      if (!m) return null;
      const warns = (m.signals || []).filter((s) => s.warn).map((s) => s.name);
      return { hit: m.score >= 4 ? 2 : m.score >= 2 ? 1 : 0, text: `${esc(m.regime)} · 경고 ${m.score}/${m.total}${warns.length ? ` (${esc(warns.join(", "))})` : ""}`,
        dir: m.prev_regime && m.prev_regime !== m.regime ? `${esc(m.prev_regime)}에서 바뀜` : "" };
    } },
  { key: "earn", quiz: "영업이익이 작년보다 50% 늘었는데 주가가 -8% 빠졌어요. 왜일까요?", answer: "시장 예상(컨센서스)이 +70%였거나, 다음 분기 전망(가이던스)이 나빴을 수 있어요. 주가는 예상과의 차이에 반응해요.", icon: "📢", title: "실적", one: "주가에는 '이 정도 벌겠지' 예상이 들어 있어서, 실적 날엔 예상과의 차이에 움직여요.",
    chain: ["회사는 3달마다 실적을 발표해요 (실적 시즌)", "예상보다 좋으면 오르고 나쁘면 빠져요", "지난 실적보다 앞으로의 전망(가이던스)에 더 크게 반응하기도 해요"],
    good: "", bad: "",
    terms: ["실적 시즌", "어닝 서프라이즈", "가이던스", "컨센서스"], go: ["more:earn", "실적·배당 발표 보기"],
    now: (m) => {
      const er = calNear(5).filter((e) => e.kind === "earn" && e.market === m);
      const n = newsHit("실적");
      if (!er.length && !n) return { hit: 0, text: "5일 안 큰 실적 발표 없음", dir: "" };
      return { hit: er.length >= 3 ? 1 : 0, text: [er.length && `5일 안 ${er.length}건: ${er.slice(0, 3).map((e) => `${md(e.date)} ${esc(e.title.replace(/ 실적 발표$/, ""))}`).join(", ")}`, n && n.line].filter(Boolean).join(" · "), dir: er.length >= 3 ? "실적 시즌" : "" };
    } },
  { key: "flows", quiz: "외국인이 5일 연속 삼성전자를 팔고 있어요. 먼저 확인할 것은?", answer: "환율(원화 약세인지), 미국 반도체 흐름, 실적 전망이에요. 외국인은 회사 하나보다 나라·업종 전체를 보고 비중을 바꿀 때가 많아요.", icon: "🏦", title: "외국인·기관 수급", only: "kr", one: "국장은 외국인·기관 같은 큰손이 한쪽으로 몰려 사고팔면 크게 움직여요.",
    chain: ["큰손은 한 번에 많이 사고팔아 주가를 밀어요", "외국인은 환율·미국 금리·세계 경기를 보고 국장 비중을 정해요", "외국인·기관이 같이 계속 판다면 그 이유(환율·실적·업종 전망)를 확인해 봐요"],
    good: "", bad: "",
    terms: ["순매수", "외국인 보유율", "공매도"], go: ["more:flows", "외국인·기관 수급 보기"],
    now: (m) => {
      const f = m === "kr" && DATA.markets.kr.flows;
      if (!f) return null;
      const w = (f.warn || []).length;
      return { hit: w >= 8 ? 2 : w >= 4 ? 1 : 0, text: w ? `외국인·기관이 같이 파는 종목 ${w}개` : "같이 파는 종목 없음", dir: "" };
    } },
  { key: "policy", quiz: "정부가 어느 업종 지원책을 '발표'했어요. 이제 확실한 호재일까요?", answer: "아직 아니에요. 국회 통과, 예산, 시행 날짜까지 가야 해요. 발표 날 크게 오른 뒤 실제 시행이 늦어지면 빠지기도 해요.", icon: "📜", title: "정부 정책", one: "세금·규제·예산 같은 정부 정책은 업종마다 호재와 악재가 갈려요.",
    chain: ["정부가 돈을 쓰거나 세금을 깎아 주는 업종은 이익이 늘 거라 기대해요", "규제가 생기거나 세금이 늘면 그 업종은 부담이에요", "발표 뒤 실제로 시행되는지(국회 통과, 날짜)를 끝까지 봐야 해요"],
    good: "", bad: "",
    ex: "2026년 자사주 소각 의무화·배당 분리과세 같은 주주 친화 정책이 금융·지주 회사에 호재로 꼽혔어요 (앱 정부 정책 칸).",
    terms: ["자사주 매입", "배당수익률"], go: ["more:policy", "정부 정책 보기"],
    now: () => { const n = newsHit("정책"); return n ? { hit: n.n >= 3 ? 1 : 0, text: n.line, dir: "" } : { hit: 0, text: "최근 24시간 정책 뉴스 조용", dir: "" }; } },
];
const driversFor = (m) => DRIVERS.filter((x) => !x.only || x.only === m);
function driverNow(x, m = market) { try { return x.now(m); } catch (e) { return null; } }

// 지수가 오늘 얼마나 '큰' 움직임이었나: 지난 1년 하루 변화 중 이만큼 이상 움직인 날 수
function idxStory(sym) {
  const r = wItem(sym);
  if (!r || !r.closes || r.closes.length < 30) return null;
  const cl = r.closes, rets = [];
  for (let i = 1; i < cl.length; i++) if (cl[i - 1]) rets.push(cl[i] / cl[i - 1] - 1);
  const d1 = r.d1 ?? rets[rets.length - 1];
  const hi = Math.max(...cl.slice(-252)), dd = cl[cl.length - 1] / hi - 1;
  const past = rets.slice(0, -1);
  const same = past.filter((x) => (d1 < 0 ? x <= d1 : x >= d1)).length;
  const over1 = past.filter((x) => Math.abs(x) >= 0.01).length;
  return { r, d1, dd, same, over1, days: past.length };
}
const sizeWord = (s) => (Math.abs(s.d1) < 0.005 ? "조용한 날" : s.same <= 3 ? "1년에 몇 번 없는 아주 큰 움직임" : s.same <= 12 ? "큰 움직임" : Math.abs(s.d1) >= 0.01 ? "자주 있는 크기" : "작은 움직임");
const stageWord = (dd) => (dd <= -0.2 ? ["약세장 구간", "bad"] : dd <= -0.1 ? ["조정 구간", "bad"] : dd <= -0.05 ? ["살짝 빠진 구간", ""] : ["고점 근처", "good"]);

function learnTabsBar() {
  return `<nav class="chips idx-chips perf-tabs learn-tabs" aria-label="공부 묶음 고르기">${LEARN_TABS.map(([k, label]) =>
    `<button type="button" data-learn-tab="${k}" aria-pressed="${k === learnTab}">${esc(label)}</button>`).join("")}</nav>`;
}
const termChips = (ts) => (ts && ts.length ? `<div class="learn-terms">${ts.filter((t) => TERMS[t]).map((t) =>
  `<button type="button" class="learn-term" data-term="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : "");
function goBtn(go) {
  if (!go) return "";
  const [where, label] = go;
  return where.startsWith("more:") ? `<button type="button" class="more" data-more="${esc(where.slice(5))}">${esc(label)}<span aria-hidden="true">›</span></button>`
    : `<button type="button" class="more" data-go="${esc(where)}">${esc(label)}<span aria-hidden="true">›</span></button>`;
}

// ── 오늘 왜?
function learnWhyCards(d) {
  const m = market, mk = MK_NAME[m];
  const syms = m === "kr" ? ["^KS11", "^KQ11"] : ["^GSPC", "^IXIC"];
  const stories = syms.map(idxStory).filter(Boolean);
  if (!stories.length) return [`<section class="card"><p class="empty">아직 지수 자료가 없어요.</p></section>`];
  const s0 = stories[0], [stage, stageTone] = stageWord(s0.dd);
  const head = `<section class="card learn-today"><h2>📍 ${mk} 지금 어디쯤? <small>${md(s0.r.day)} 종가</small></h2>
    <div class="stats">${stories.map((s) => `<div class="stat"><span>${esc(s.r.name)}</span><b class="${sign(s.d1)}">${pct(s.d1, 2)}</b>
      <small>1주 ${pct(s.r.w1)} · 1달 ${pct(s.r.m1)}</small></div>`).join("")}
      <div class="stat"><span>1년 고점 대비</span><b class="${sign(s0.dd)}">${pct(s0.dd)}</b><small class="${stageTone}">${stage}</small></div></div>
    <ul class="brief learn-read">
      <li>${esc(s0.r.name)} 하루 ${pct(s0.d1, 2)}는 <b>${sizeWord(s0)}</b>예요.${Math.abs(s0.d1) >= 0.01 ? ` 지난 1년 ${s0.days}거래일 중 이만큼 ${s0.d1 < 0 ? "빠진" : "오른"} 날은 ${s0.same}일.` : ""}</li>
      <li>하루 ±1% 넘게 움직인 날은 1년에 ${s0.over1}일 있었어요. 하루 1%는 생각보다 흔한 일이에요.</li>
      <li>고점에서 -10%면 '조정', -20%면 '약세장'이라고 불러요. 지금은 <b>${stage}</b>.</li></ul></section>`;
  // 원인 후보 점검
  const rows = driversFor(m).map((x) => ({ x, n: driverNow(x, m) })).filter((r) => r.n);
  const hits = rows.filter((r) => r.n.hit > 0).sort((a, b) => b.n.hit - a.n.hit), calm = rows.filter((r) => r.n.hit === 0);
  const sus = (r) => `<li class="learn-sus${r.n.hit > 1 ? " strong" : ""}"><div class="l"><div class="name">${r.x.icon} ${esc(r.x.title)}
      <span class="badge${r.n.hit > 1 ? " bad" : ""}">${r.n.hit > 1 ? "크게 움직임" : "움직임 있음"}</span></div>
      <div class="meta">${r.n.text}${r.n.dir ? ` · ${r.n.dir}` : ""}</div><div class="learn-why1">${esc(r.x.one)}</div></div>
      <button type="button" class="hot-ok" data-learn-go="${r.x.key}" aria-label="${esc(r.x.title)} 더 배우기">배우기</button></li>`;
  const shocks = (((DATA.events || {}).shocks) || []).filter((x) => recent(x.at, 72) && (m === "kr" ? /KS11|KQ11|코스/.test(x.symbol + x.label) : !/KS11|KQ11|코스/.test(x.symbol + x.label)));
  const heads = [...shocks.flatMap((x) => (x.news || []).slice(0, 2).map((n) => ({ ...n, tag: `${x.label} ${pct(x.move)} 급변 때` }))),
    ...hotOf(m).slice(0, 3).map((n) => ({ ...n, tag: `🔥 ${n.topic || "핫 뉴스"}` }))].filter((n, i, all) => all.findIndex((x) => x.title === n.title) === i).slice(0, 4);
  const sus2 = `<section class="card" id="learn-sus"><h2>🔎 원인 후보 점검 <small>${hits.length}개 움직임</small></h2>
    ${hits.length ? `<ul class="list">${hits.map(sus).join("")}</ul>` : `<p class="empty">오늘은 크게 튄 요인이 없어요. 이런 날은 업종·종목 소식이 더 중요해요.</p>`}
    ${calm.length ? `<details class="more-list"${LEARN_OPEN.has("calm") ? " open" : ""} data-learn-open="calm"><summary>조용했던 요인 ${calm.length}개</summary>
      <ul class="list">${calm.map((r) => `<li><div class="l"><div class="name">${r.x.icon} ${esc(r.x.title)}</div><div class="meta">${r.n.text}</div></div></li>`).join("")}</ul></details>` : ""}
    ${heads.length ? `<h3 class="brief-h">같은 때 나온 뉴스</h3><ul class="brief">${heads.map((n) => `<li><small class="muted">${esc(n.tag)}</small> ${/^https:\/\//.test(n.link || "")
      ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title)}</li>`).join("")}</ul>` : ""}
    <p class="muted note" style="margin:10px 0 0">같은 시기에 크게 움직인 숫자를 맞춰 본 거라 '후보'예요. 진짜 원인은 기사로 확인하세요. '배우기'를 누르면 그 요인이 왜 주가를 움직이는지 볼 수 있어요.</p></section>`;
  // 업종으로 보면 (리포트 업종팀 자료)
  const rp = DATA.report || {}, sec = (rp.sectors || {})[m], tilt = ((rp.market || {}).tilt) || [];
  const why = (name) => { const t = tilt.find((x) => x.sector === name); return t ? ` · ${t.tone > 0 ? "호재" : "악재"}: ${esc(t.why)}` : ""; };
  const secLi = (x) => `<li><div class="l"><div class="name">${esc(x.name)} <b class="${sign(x.r5)}">${pct(x.r5)}</b></div>
    <div class="meta">20일 ${pct(x.r20)}${why(x.name)}${x.match ? ` · 정책·경기 예상과 ${esc(x.match)}` : ""}</div></div></li>`;
  const secCard = sec && (sec.strong.length || sec.weak.length) ? `<section class="card"><h2>🏭 업종으로 보면 <small>5일 흐름 · 리포트 업종팀</small></h2>
    <h3 class="brief-h">강한 업종</h3><ul class="list">${sec.strong.slice(0, 3).map(secLi).join("")}</ul>
    <h3 class="brief-h">약한 업종</h3><ul class="list">${sec.weak.slice(0, 3).map(secLi).join("")}</ul>
    <p class="muted" style="margin:10px 0 0">같은 날에도 업종마다 반대로 움직여요. 유가가 오르면 정유는 웃고 항공은 우는 것처럼, 한 가지 원인이 업종마다 다르게 작용하거든요.
      '정책·경기 예상과 엇갈림'은 예상과 다르게 움직였다는 뜻이라, 따로 이유(실적·수주 등)가 있을 수 있어요.</p>
    ${goBtn(["more:sectors", "업종별 호재·악재 보기"])}</section>` : "";
  // 그래서 어떻게?
  const big = ((DATA.events || {}).events || []).filter((e) => e.tier1 && soon(e.at, 48));
  const situ = s0.dd <= -0.2 ? "bear" : s0.d1 <= -0.02 ? "drop" : big.length ? "event" : s0.d1 >= 0.02 ? "rally" : "calm";
  const c = COPE.find((x) => x.key === situ);
  const todo = `<section class="card"><h2>🧭 이럴 때 어떻게? <small>${esc(c.title)}</small></h2>${copeBody(c)}
    <button type="button" class="more" data-learn-tab="cope">상황별 대처법 전부 보기<span aria-hidden="true">›</span></button></section>`;
  return [head, storyCard("learn"), learnNoteCard(), sus2, learnBrokerCard(), learnCaseCard(), secCard, todo];
}
// 증권사가 본 이유: 전문가 리포트 중 최근 시황·전략 리포트의 첫머리 (미장 탭은 미국 이야기만)
function learnBrokerCard() {
  const R = DATA.reading, items = (R && R.items) || {};
  const usRe = /미국|뉴욕|미 증시|S&P|나스닥|다우|연준|FOMC|빅테크/;
  const pick = [...(items.market || []), ...(items.invest || [])].filter((x) => x.summary && recent(x.date, 24 * 5) && (market === "kr" || usRe.test(x.title + x.summary)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);
  if (!pick.length) return "";
  return `<section class="card" id="learn-broker"><h2>🏦 증권사가 본 이유 <small>최근 시황 리포트</small></h2>
    ${pick.map((x) => `<div class="learn-rep-q"><div class="meta"><b>${esc(x.broker || "증권사")}</b> · ${md(x.date)} · ${esc(x.title)}</div>
      <p class="learn-p">${esc((x.summary || "").split("\n").slice(0, 3).join(" ").slice(0, 200))}${(x.summary || "").length > 200 ? "…" : ""}</p>
      ${/^https:\/\//.test(x.url || "") ? `<a class="more" href="${esc(x.url)}" target="_blank" rel="noopener">원문 보기<span aria-hidden="true">›</span></a>` : ""}</div>`).join("")}
    <button type="button" class="more" data-learn-tab="read">리포트 전부 보기<span aria-hidden="true">›</span></button>
    <p class="muted note" style="margin:10px 0 0">위 '원인 후보'는 숫자로 맞춰 본 거고, 이건 증권사 사람이 기사·수급까지 보고 쓴 설명이에요. 둘이 같은 이야기를 하면 더 믿을 만해요. 증권사마다 해석이 다를 수 있어요.</p></section>`;
}

// ── 움직이는 이유
function lessonBody(x, n) {
  return `<ol class="learn-chain">${x.chain.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
    ${x.tip ? `<p class="learn-tip">💡 ${esc(x.tip)}</p>` : ""}
    ${x.good || x.bad ? `<div class="learn-gb">${x.good ? `<div><span class="badge good">유리</span> ${esc(x.good)}</div>` : ""}${x.bad ? `<div><span class="badge bad">불리</span> ${esc(x.bad)}</div>` : ""}</div>` : ""}
    ${x.ex ? `<p class="learn-ex">📜 ${esc(x.ex)}</p>` : ""}
    ${n ? `<p class="learn-now"><b>지금 앱 자료</b> ${n.text}${n.dir ? ` · ${n.dir}` : ""}</p>` : ""}
    ${x.quiz ? `<details class="learn-quiz"><summary><b>🤔 확인 문제</b> ${esc(x.quiz)} <span class="learn-quiz-open">답 보기</span></summary><p>${esc(x.answer)}</p></details>` : ""}
    ${termChips(x.terms)}${goBtn(x.go)}`;
}
function learnDriverCards() {
  const list = driversFor(market).map((x) => {
    const n = driverNow(x), open = LEARN_OPEN.has(`d:${x.key}`);
    return `<details class="lesson" data-learn-open="d:${x.key}" id="lesson-${x.key}"${open ? " open" : ""}><summary><span class="hm-ico" aria-hidden="true">${x.icon}</span>
      <span class="hm-t"><b>${esc(x.title)}${n && n.hit ? ` <span class="badge${n.hit > 1 ? " bad" : ""}">오늘 ${n.hit > 1 ? "크게" : "움직임"}</span>` : ""}</b><span class="lesson-one">${esc(x.one)}</span></span></summary>
      <div class="lesson-body">${lessonBody(x, n)}</div></details>`;
  }).join("");
  return [`<section class="card" id="learn-drivers"><h2>🧩 증시를 움직이는 것들 <small>${driversFor(market).length}가지</small></h2>${list}
    <p class="muted note" style="margin:10px 0 0">하나만으로 움직이는 날은 드물어요. 보통 금리·환율·실적 같은 몇 가지가 겹쳐요. '오늘 움직임' 표시는 오늘 앱 자료에서 그 요인이 크게 바뀌었다는 뜻이에요.</p></section>`];
}

// ── 대처법: 사고팔기 신호가 아니라 '낙폭을 줄이는' 습관 (사용자 성향: 낙폭 최소화)
const COPE = [
  { key: "drop", icon: "📉", title: "하루에 크게 빠진 날 (-2% 넘게)",
    check: ["원인 후보를 먼저 봐요: 나라 전체 일(금리·환율·전쟁)인지, 업종·종목 일인지", "내 관심종목이 지수보다 더 빠졌는지 (더 보기 → 급락 점검)", "빚(신용·미수)을 쓰고 있다면 반대매매 선까지 얼마나 남았는지"],
    avoid: ["장 시작 직후 겁에 질려 한꺼번에 팔기 (패닉 셀)", "'싸졌다'며 계획에 없던 돈을 한 번에 넣기"],
    try: ["미리 정한 비중·규칙이 있으면 그대로", "적립식이면 원래 날짜에 원래 금액 그대로 (내린 날 더 많이 사져요)"],
    go: ["more:drop", "급락 점검 보기"] },
  { key: "bear", icon: "🐻", title: "고점에서 -20% 넘게 (약세장)",
    check: ["경기 국면 칸의 경고가 늘고 있는지 (경기 침체 걱정인지, 일시적 충격인지)", "도구 → 폭락 대비에서 내 종목이 과거 위기 때 얼마나 빠졌는지", "생활비·비상금은 주식과 따로 있는지"],
    avoid: ["손실을 한 번에 만회하려는 레버리지 상품", "바닥을 맞히려는 몰빵"],
    try: ["분할 매수: 여러 번 나눠서 (바닥은 지나고 나서야 알아요)", "리밸런싱: 주식 비중이 너무 줄었으면 정한 비율로 되돌리기", "회복엔 몇 달에서 몇 년이 걸린 적도 있어서, 버틸 수 있는 비중인지 다시 보기"],
    go: ["tool:stress", "도구 → 폭락 대비 보기"] },
  { key: "event", icon: "🚨", title: "큰 발표(CPI·고용·FOMC) 앞둔 날",
    check: ["발표 시각(한국시간 밤 9:30, FOMC는 새벽 3시)과 예상치", "결과가 예상보다 높을지 낮을지에 따라 어느 업종이 영향을 받는지 (움직이는 이유 → 물가·고용)"],
    avoid: ["결과를 맞히려는 베팅", "발표 직후 첫 몇 분의 급등락을 따라가기 (금방 뒤집히기도 해요)"],
    try: ["발표 전후엔 평소대로 두고, 결과가 나온 다음 날 차분히 보기"],
    go: ["more:cal", "다가오는 일정 보기"] },
  { key: "single", icon: "🎯", title: "내 종목만 크게 빠진 날",
    check: ["공시(유상증자·전환사채 등)가 있었는지 (더 보기 → 최근 공시)", "실적 발표·가이던스가 나왔는지", "같은 업종 다른 회사도 빠졌는지 (업종 일이면 회사 문제는 아닐 수 있어요)"],
    avoid: ["이유를 모른 채 물타기", "커뮤니티 소문만 보고 결정하기"],
    try: ["처음 산 이유가 아직 맞는지 한 줄로 적어 보기", "한 종목 비중이 너무 크면 나눠 담기 (분산투자)"],
    go: ["more:disclose", "최근 공시 보기"] },
  { key: "rally", icon: "🚀", title: "다 같이 크게 오를 때 (따라 사고 싶을 때)",
    check: ["이미 1년 고점 근처인지, RSI가 70 넘게 과열인지 (차트)", "오른 이유가 실적인지, 기대·소문인지"],
    avoid: ["나만 놓칠까 봐 한 번에 사기 (FOMO)", "레버리지 상품으로 추격"],
    try: ["사고 싶으면 나눠서 (분할 매수)", "오른 만큼 비중이 커졌다면 정한 비율로 덜어 내기 (리밸런싱)"],
    go: ["chart", "차트 보기"] },
  { key: "calm", icon: "🌤️", title: "평소 (조용한 날)",
    check: ["주식·채권·현금 비중을 정해 뒀는지 (자산배분)", "다음 큰 일정이 언제인지 (다가오는 일정)", "한 번에 -30%가 와도 버틸 비중인지 (도구 → 폭락 대비)"],
    avoid: ["매일 계좌를 보며 사고팔기 (수수료·세금·실수가 쌓여요)"],
    try: ["적립식으로 꾸준히", "분기·반기에 한 번 리밸런싱", "모르는 말은 용어집에서 하나씩"],
    go: ["tool:sav", "도구 → 적립식 계산기 보기"] },
];
function copeBody(c) {
  const ul = (cls, label, xs) => (xs.length ? `<h3 class="brief-h">${label}</h3><ul class="brief ${cls}">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const go = c.go && c.go[0].startsWith("tool:") ? `<button type="button" class="more" data-learn-tool="${esc(c.go[0].slice(5))}">${esc(c.go[1])}<span aria-hidden="true">›</span></button>` : goBtn(c.go);
  return `${ul("", "✅ 먼저 확인", c.check)}${ul("", "🚫 피할 것", c.avoid)}${ul("", "🙂 해볼 만한 것", c.try)}${go}`;
}
// 과거 큰 하락과 회복 (종가 기준 대략값)
const CRASH_HISTORY = [
  ["2000~2002 닷컴 버블", "나스닥 -78%", "전 고점 회복 약 15년 (2015년)", "비싸게 오른 유행 업종은 회복이 아주 오래 걸릴 수 있어요."],
  ["2007~2009 금융위기", "S&P500 -57% · 코스피 -50%대", "S&P500 전 고점 회복 약 5년 반 (2013년)", "빚이 많던 은행·부동산에서 터져 경제 전체로 번졌어요."],
  ["2020년 2~3월 코로나", "S&P500 한 달 남짓 -34% · 코스피 -35%쯤", "S&P500 약 5개월 만에 회복", "아주 빨리 빠지고 빨리 회복했어요. 정부·중앙은행이 돈을 크게 풀었어요."],
  ["2022년 금리 인상", "S&P500 -25% · 나스닥 -35% · 코스피 -35%쯤", "S&P500 약 2년 (2024년 초)", "금리가 빠르게 오르면 성장주가 특히 크게 빠져요."],
  ["2024년 8월 5일 엔 캐리 청산", "코스피 하루 -8.8% · 닛케이 -12.4%", "다음 날 코스피 +3%대 반등", "하루 폭락은 빚으로 투자한 돈이 한꺼번에 빠질 때 나와요. 그날 다 판 사람이 가장 손해였어요."],
  ["2025년 4월 상호관세", "S&P500 이틀 -10% 넘게", "유예 발표 날 하루 +9.5%, 약 3달 만에 회복", "정책 뉴스 하나에 위아래로 크게 출렁일 수 있어요."],
];
function learnCopeCards() {
  const rule = `<section class="card"><h2>🛡️ 기본 원칙 다섯 가지 <small>낙폭 줄이기가 먼저</small></h2>
    <ol class="learn-chain learn-rules">
      <li><b>떨어져도 버틸 만큼만.</b> 생활비·비상금은 주식과 따로 두고, -30%가 와도 잠을 잘 수 있는 비중으로.</li>
      <li><b>나눠서 사고, 나눠 담기.</b> 한 번에 다 사지 않고(분할 매수·적립식), 한 종목·한 업종에 몰지 않기(분산투자).</li>
      <li><b>빚과 레버리지는 조심.</b> 빠질 때 강제로 팔리거나(반대매매) 손실이 쌓여(음의 복리) 회복할 기회를 잃어요.</li>
      <li><b>규칙은 평소에 정하기.</b> 비중·리밸런싱 날짜·팔 조건을 조용할 때 적어 두면 급락 날 감정에 덜 흔들려요.</li>
      <li><b>원인을 먼저 확인.</b> 나라 전체 일인지, 업종 일인지, 그 회사 일인지에 따라 할 일이 달라요 (오늘 왜 움직였나).</li></ol>
    ${termChips(["분산투자", "분할 매수", "적립식", "리밸런싱", "레버리지", "반대매매"])}</section>`;
  const losses = [0.1, 0.2, 0.3, 0.5, 0.8];
  const math = `<section class="card"><h2>➗ 잃은 만큼 회복하려면 <small>낙폭이 왜 무서운가</small></h2>
    <div class="learn-math">${losses.map((l) => `<div class="stat"><span>-${Math.round(l * 100)}% 빠지면</span><b class="up">+${Math.round((1 / (1 - l) - 1) * 100)}%</b><small>올라야 원금</small></div>`).join("")}</div>
    <p class="muted" style="margin:10px 0 0">빠진 만큼보다 더 많이 올라야 원금이 돼요. -50%면 두 배(+100%)가 필요해요. 그래서 이 앱은 수익보다 최대 낙폭을 작게 하는 걸 먼저 봐요.</p></section>`;
  const situ = `<section class="card" id="learn-cope"><h2>🧭 상황별 대처 <small>신호가 아니라 점검표예요</small></h2>${COPE.map((c) =>
    `<details class="lesson" data-learn-open="c:${c.key}"${LEARN_OPEN.has(`c:${c.key}`) ? " open" : ""}><summary><span class="hm-ico" aria-hidden="true">${c.icon}</span>
      <span class="hm-t"><b>${esc(c.title)}</b></span></summary><div class="lesson-body">${copeBody(c)}</div></details>`).join("")}</section>`;
  const hist = `<section class="card"><h2>📜 과거 큰 하락과 회복 <small>대략값</small></h2><ul class="list">${CRASH_HISTORY.map(([t, drop, back, lesson]) =>
    `<li><div class="l"><div class="name">${esc(t)}</div><div class="meta"><b class="down">${esc(drop)}</b> → ${esc(back)}</div><div class="learn-why1">${esc(lesson)}</div></div></li>`).join("")}</ul>
    <p class="muted" style="margin:10px 0 0">큰 하락은 몇 년에 한 번은 와요. 회복은 몇 달에서 15년까지 제각각이라 미리 알 수 없어요. 그래서 '버틸 수 있는 비중'이 가장 중요해요.</p>
    <button type="button" class="more" data-learn-tool="stress">내 관심종목이 그때 얼마나 빠졌을까 (폭락 대비)<span aria-hidden="true">›</span></button></section>`;
  return [rule, math, situ, hist];
}

// ── 용어집: 분야별로, 위 칸에 치면 바로 걸러져요 (다시 그리지 않고 숨기기만 해서 화면이 안 움직여요)
function learnTermCards() {
  const used = new Set(TERM_GROUPS.flatMap((g) => g[1]));
  const groups = [...TERM_GROUPS, ["🔤 그 밖에", Object.keys(TERMS).filter((t) => !used.has(t))]];
  const q = learnQ.trim().toLowerCase();
  const hit = (t) => !q || t.toLowerCase().includes(q) || TERMS[t].toLowerCase().includes(q);
  const body = groups.map(([g, ts]) => {
    const list = ts.filter((t) => TERMS[t]);
    if (!list.length) return "";
    return `<div class="learn-group"${list.some(hit) ? "" : " hidden"}><h3 class="brief-h">${esc(g)}</h3>${list.map((t) =>
      `<details class="gloss" data-gloss="${esc(t)}"${hit(t) ? "" : " hidden"}><summary>${esc(t)}</summary><p>${esc(TERMS[t])}</p></details>`).join("")}</div>`;
  }).join("");
  return [`<section class="card" id="learn-terms"><h2>📖 용어집 <small>${Object.keys(TERMS).length}개</small></h2>
    <input id="learn-q" class="search" type="search" autocomplete="off" spellcheck="false" placeholder="찾을 말 (예: 금리, 환율)" aria-label="용어 찾기" value="${esc(learnQ)}">
    <p class="empty learn-none"${groups.some(([, ts]) => ts.some((t) => TERMS[t] && hit(t))) ? " hidden" : ""} style="margin-top:10px">맞는 말이 없어요.</p>
    ${body}</section>`];
}

// ── 사례 일지: learn_cases.py가 날마다 쌓은 '그날 지수와 원인 후보' (매일 장 마감 뒤 한 줄씩 늘어요)
const DRIVER_ICON = () => Object.fromEntries(DRIVERS.map((x) => [x.key, x.icon]));
function learnCaseCard() {
  const L = DATA.learn_cases && DATA.learn_cases[market];
  if (!L || !L.length) return "";
  const ic = DRIVER_ICON(), show = L.slice(0, 12);
  const row = (c) => {
    const big = c.causes.filter((x) => x.hit > 1), some = c.causes.filter((x) => x.hit === 1);
    const local = !big.length && !some.length && Math.abs(c.d1) >= 0.015;  // 해외·금리·환율은 평소대로인데 지수만 크게
    const tags = [...big, ...some].slice(0, 4).map((x) => `<span class="learn-tag${x.hit > 1 ? " strong" : ""}">${ic[x.key] || ""} ${esc(x.title)}</span>`).join("")
      || (local ? `<span class="learn-tag local">🏠 ${c.index === "코스피" ? "국내" : "미국 안"} 사정 쪽</span>` : "");
    const open = LEARN_OPEN.has(`case:${c.day}`);
    return `<details class="lesson learn-case" data-learn-open="case:${esc(c.day)}"${open ? " open" : ""}><summary><span class="learn-case-d">${md(c.day)}</span>
      <span class="hm-t"><b>${esc(c.index)} <span class="${sign(c.d1)}">${pct(c.d1, 2)}</span></b><span class="learn-tags">${tags || `<span class="muted">크게 튄 요인 없음</span>`}</span></span></summary>
      <div class="lesson-body"><ul class="brief">${c.causes.map((x) => `<li>${ic[x.key] || ""} <b>${esc(x.title)}</b> ${esc(x.text)}${x.z != null ? ` <small class="muted">평소의 ${x.z.toFixed(1)}배${x.hit ? "" : " (조금)"}</small>` : ""}</li>`).join("")
        || "<li>금리·환율·유가·해외 증시 모두 평소 크기였어요.</li>"}</ul>
        ${local ? `<p class="learn-tip">💡 해외·금리·환율은 평소대로인데 ${esc(c.index)}만 ${pct(c.d1, 1)} 움직였어요. 이럴 땐 ${c.index === "코스피" ? "국내 정책·정치, 외국인·기관 수급, 특정 업종(반도체 등) 소식" : "미국 안 소식(실적·정책·특정 종목)"}을 먼저 찾아봐요.</p>` : ""}
        ${(c.strong || []).length ? `<p class="learn-why1">강한 업종 ${c.strong.map((x) => `${esc(x.name)} ${pct(x.r5)}`).join(", ")} · 약한 업종 ${(c.weak || []).map((x) => `${esc(x.name)} ${pct(x.r5)}`).join(", ")}</p>` : ""}
        ${(c.news || []).map((n) => `<p class="learn-why1">📰 ${/^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title)}</p>`).join("")}
        <p class="learn-why1">1년 고점 대비 ${pct(c.dd)} · 1주 ${pct(c.w1)}</p></div></details>`;
  };
  // 오늘 가장 크게 움직인 원인이 지난 반년 동안 크게 움직인 날엔 지수가 보통 얼마나 움직였나
  const top = (L[0].causes.find((x) => x.hit > 1) || {}).key;
  let same = "";
  if (top) {
    const days = L.slice(1).filter((c) => c.causes.some((x) => x.key === top && x.hit > 1));
    if (days.length >= 3) {
      const avg = days.reduce((a, c) => a + Math.abs(c.d1), 0) / days.length, all = L.reduce((a, c) => a + Math.abs(c.d1), 0) / L.length;
      const name = (DRIVERS.find((x) => x.key === top) || {}).title || top;
      same = `<p class="learn-tip">💡 지난 ${L.length}거래일 중 '${esc(name)}'이(가) 크게 움직인 날은 ${days.length}일. 그날 ${esc(L[0].index)}는 평균 ±${(avg * 100).toFixed(1)}% 움직였어요 (모든 날 평균 ±${(all * 100).toFixed(1)}%).
        ${avg > all * 1.2 ? "이 요인이 움직이는 날은 지수도 더 크게 출렁이는 편이었어요." : "이 요인만으로 지수가 크게 출렁이진 않았어요."}</p>`;
    }
  }
  return `<section class="card" id="learn-cases"><h2>📒 사례 일지 <small>최근 ${L.length}거래일 · 매일 늘어요</small></h2>${same}${show.map(row).join("")}
    <p class="muted note" style="margin:10px 0 0">장 마감 뒤마다 그날 지수 움직임과 같은 때 움직인 숫자(금리·환율·유가·반도체·해외 증시·VIX·큰 발표)를 한 줄씩 적어 둬요.
      크다·작다는 그 숫자가 최근 반년 동안 보통 움직이던 크기와 비교해요 (2배 넘으면 '크게'). 국장은 그 전날 밤 미국 자료로 맞춰 봐요. 원인 후보일 뿐이에요.</p></section>`;
}

// ── 전문가 리포트: reading.py가 매일 받은 증권사 무료 리포트(PDF) 목록. 고른 묶음은 이 폰에 기억해요
let readCat = "all";
try { readCat = localStorage.getItem("read_cat") || "all"; } catch (e) { /* 처음 */ }
const READ_Q = ["핵심 주장이 뭔가요? 한 줄로 적어 봐요", "그 주장을 받치는 숫자·근거는?", "어떤 전제(금리·환율·수요)를 깔고 있나요?", "그 전제가 바뀌면 결론이 틀리나요?",
  "지금 주가·금리·환율이 이미 그 이야기를 반영했나요?", "이득 보는 업종과 손해 보는 업종은?", "반대 의견은 뭐가 있을까요?", "쓴 날 뒤에 새로 나온 자료로 결론이 바뀌나요?"];
function learnReadCards() {
  const R = DATA.reading, cats = (R && R.cats) || [];
  const items = (R && R.items) || {};
  const all = cats.flatMap(([k, n]) => (items[k] || []).map((x) => ({ ...x, cat: n }))).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const list = readCat === "all" ? all : (items[readCat] || []).map((x) => ({ ...x, cat: (cats.find((c) => c[0] === readCat) || [])[1] }));
  const li = (x) => {
    const url = /^https:\/\//.test(x.url || "") ? x.url : "";
    const open = LEARN_OPEN.has(`r:${x.id}`);
    return `<details class="lesson learn-rep" data-learn-open="r:${esc(x.id || x.title)}"${open ? " open" : ""}><summary><span class="hm-t"><b>${esc(x.title)}</b>
      <span class="lesson-one"><span class="badge">${esc(x.sector || x.cat || "")}</span> ${esc(x.broker || "증권사 미상")}${x.analyst ? ` ${esc(x.analyst)}` : ""} · ${md(x.date)}</span></span></summary>
      <div class="lesson-body">${x.summary ? `<p class="learn-p learn-sum">${esc(x.summary)}</p>` : ""}
        ${url ? `<a class="more" href="${esc(url)}" target="_blank" rel="noopener">원문 보기<span aria-hidden="true">›</span></a>` : ""}</div></details>`;
  };
  const chips = `<div class="chips">${[["all", "전체"], ...cats].map(([k, n]) => `<button type="button" data-read-cat="${k}" aria-pressed="${k === readCat}">${esc(n)}</button>`).join("")}</div>`;
  const body = !R ? `<p class="empty">리포트 목록을 아직 못 받았어요. 매일 장 마감 뒤 받아요.</p>`
    : list.length ? `${list.slice(0, 12).map(li).join("")}${list.length > 12 ? `<details class="more-list"${LEARN_OPEN.has(`read:${readCat}`) ? " open" : ""} data-learn-open="read:${readCat}"><summary>${list.length - 12}개 더 보기</summary>${list.slice(12).map(li).join("")}</details>` : ""}`
    : `<p class="empty">이 묶음엔 최근 리포트가 없어요.</p>`;
  return [`<section class="card" id="learn-read"><h2>📑 증권사 무료 리포트 <small>${R ? `${ago(R.updated)} 받음 · 매일` : "매일 받아요"}</small></h2>
    ${chips}<div style="margin-top:12px">${body}</div>
    ${R && /^https:\/\//.test(R.home || "") ? `<a class="more" href="${esc(R.home)}" target="_blank" rel="noopener">네이버 리서치에서 전체 보기<span aria-hidden="true">›</span></a>` : ""}
    <p class="muted note" style="margin:10px 0 0">${esc((R && R.source) || "네이버페이 증권 리서치")}에 증권사가 무료로 올린 리포트예요. 누르면 증권사가 쓴 첫머리 요약이 펼쳐져요. 최근 30일 것만 남겨요. 리포트는 그 증권사의 전망·의견이라 사실과 구분해서 읽어요. 종목 매수·목표주가 리포트는 일부러 뺐어요.</p></section>`,
  `<section class="card"><h2>🧠 리포트 읽는 법 <small>질문 8개</small></h2><ol class="learn-chain">${READ_Q.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
    <p class="learn-tip">💡 '확인된 사실'(지난 실적·발표된 숫자)과 '전망'(앞으로 이럴 것)과 '의견'(사라·팔라)을 따로 표시하며 읽으면 덜 휘둘려요.</p>
    ${termChips(["컨센서스", "목표주가", "가이던스", "밸류에이션"])}</section>`];
}
// 오늘의 용어: 날짜마다 하나씩 돌아가요 (같은 날엔 같은 말)
function termOfDay() {
  const keys = Object.keys(TERMS), day = Math.floor(Date.parse(TODAY()) / 864e5);
  return keys[((day * 37) % keys.length + keys.length) % keys.length];
}

// ── 공부 노트: paper/learn_notes.json에 평일 장 마감 뒤 한 편씩 더해요 (그날 사례 일지·리포트·뉴스로 쓴 해설 + 확인 문제 + 새 용어)
const learnNotes = () => ((DATA && DATA.learn_notes) || []).filter((n) => !n.market || n.market === "both" || n.market === market)
  .sort((a, b) => (b.day || "").localeCompare(a.day || ""));
let notesMerged = null;
function mergeNoteTerms() {  // 노트의 새 용어를 용어집에 더해요 (자료를 새로 받을 때마다 한 번)
  if (!DATA || notesMerged === DATA) return;
  notesMerged = DATA;
  for (const n of DATA.learn_notes || []) for (const [t, v] of Object.entries(n.terms || {})) if (!TERMS[t]) TERMS[t] = v;
}
// '이런 상황' 꼬리표: 변동이 큰 장도 모양은 되풀이돼요 (사용자 2026-11-18 "미래에 비슷한 상황이 있으려나")
// [키, 아이콘, 이름, 한 줄 설명, 닮은 과거 사례(site/casebook.js id)]
const NOTE_PATS = [
  ["priced", "🎯", "선반영·재료 소멸", "좋은 소식이 나왔는데 오히려 빠지는 날. 기대가 이미 가격에 들어가 있었어요.", ["nvda-2024", "battery-2023"]],
  ["rate_fear", "🏦", "금리 걱정", "경제 지표가 좋거나 물가가 높으면 '금리 못 내린다'는 걱정에 성장주가 빠져요.", ["cpi-2022", "fed-2022", "taper-2013"]],
  ["split", "↔️", "업종마다 반대로", "같은 소식인데 어떤 업종은 오르고 어떤 업종은 빠져요. 누가 이득이고 누가 손해인지 나눠 보세요.", ["hbm-2024", "deepseek-2025", "oil-2022"]],
  ["rebound", "↩️", "급락 뒤 반등", "크게 빠진 다음 날 되돌림. 반등의 크기보다 '무엇이 바뀌었나'가 중요해요.", ["covid-2020", "yen-2024", "tariff-2025"]],
  ["panic", "🚨", "투매·사이드카", "겁이 겁을 부르는 날. 서킷브레이커·사이드카가 나오고 좋은 종목도 같이 빠져요.", ["yen-2024", "covid-2020", "tariff-2025"]],
  ["overnight", "🌙", "밤사이 미국 → 국장", "전날 밤 미국장 분위기가 다음 날 국장 출발을 정해요. 특히 반도체.", ["deepseek-2025", "yen-2024"]],
  ["event", "🗓", "큰 일정 앞뒤", "선거·FOMC·실적 발표 앞에선 눈치 보고, 발표 뒤엔 결과보다 '예상과의 차이'로 움직여요.", ["cpi-2022", "martial-2024", "tariff-2025"]],
  ["flows", "💸", "수급이 만든 날", "뉴스보다 외국인·기관이 사고판 양이 지수를 끌고 간 날이에요.", ["martial-2024", "yen-2024"]],
  ["ai_money", "🤖", "AI 돈·빚 걱정", "AI 투자가 돈을 벌까, 빚이 너무 크진 않을까. 이 걱정에 반도체·빅테크가 출렁여요.", ["deepseek-2025", "nvda-2024"]],
  ["breadth", "🌊", "넓게/좁게 오른 날", "몇 종목만 오른 건지, 다 같이 오른 건지. 지수만 보면 놓쳐요.", ["hbm-2024", "battery-2023"]],
];
const NOTE_PAT = Object.fromEntries(NOTE_PATS.map((x) => [x[0], x]));
let notePat = null;  // 사례집 '상황별 공부 노트'에서 고른 상황
const patNotes = (k) => learnNotes().filter((n) => (n.patterns || []).includes(k));
function noteBody(n, inCases) {
  const ic = DRIVER_ICON();
  const pats = (n.patterns || []).filter((k) => NOTE_PAT[k]);
  return `${(n.tags || []).length ? `<div class="learn-tags" style="margin-bottom:8px">${n.tags.map((k) => `<button type="button" class="learn-tag" data-learn-go="${esc(k)}">${ic[k] || ""} ${esc((DRIVERS.find((x) => x.key === k) || {}).title || k)}</button>`).join("")}</div>` : ""}
    ${pats.length && !inCases ? `<p class="note-pats"><b>🔁 이런 상황</b> ${pats.map((k) => { const c = patNotes(k).length - 1;
      return `<button type="button" class="learn-tag pat" data-note-pat="${k}">${NOTE_PAT[k][1]} ${esc(NOTE_PAT[k][2])}${c > 0 ? ` <small>+${c}편</small>` : ""}</button>`; }).join("")}</p>` : ""}
    ${(n.body || []).map((p) => `<p class="learn-p">${esc(p)}</p>`).join("")}
    ${n.quiz ? `<details class="learn-quiz"><summary><b>🤔 확인 문제</b> ${esc(n.quiz[0])} <span class="learn-quiz-open">답 보기</span></summary><p>${esc(n.quiz[1])}</p></details>` : ""}
    ${termChips(Object.keys(n.terms || {}))}`;
}
function learnNoteCard() {
  const N = learnNotes();
  if (!N.length) return "";
  const [n, ...old] = N;
  return `<section class="card" id="learn-note"><h2>📝 공부 노트 <small>${md(n.day)} · 평일 장 마감 뒤 새로</small></h2>
    <h3 class="learn-note-t">${esc(n.title)}</h3>${noteBody(n)}
    ${old.length ? `<details class="more-list"${LEARN_OPEN.has("notes") ? " open" : ""} data-learn-open="notes"><summary>지난 노트 ${old.length}편</summary>${old.map((x) =>
      `<details class="lesson" data-learn-open="note:${esc(x.day)}"${LEARN_OPEN.has(`note:${x.day}`) ? " open" : ""}><summary><span class="learn-case-d">${md(x.day)}</span><span class="hm-t"><b>${esc(x.title)}</b></span></summary>
        <div class="lesson-body">${noteBody(x)}</div></details>`).join("")}</details>` : ""}</section>`;
}

// ── 분석팀 '오늘의 연결 고리' (market_story.py → report.json story): A 때문에 B, B 때문에 C·D (사용자 2026-11-10 "상관관계, 전문가처럼")
// 숫자로 맞춰 본 연결이에요. ✓는 예상한 방향으로 움직였다는 뜻이지 원인을 증명한 건 아니에요.
const STORY_VERDICT = { "확인": ["숫자로 이어짐", "good"], "엇갈림": ["일부만 이어짐", "bad"], "반대": ["반대로 감", "bad"], "미미": ["거의 안 전해짐", ""] };
const STORY_OPEN = new Set();  // 펼친 사슬·사례 (아래 메뉴를 누르면 접혀요)
const CASE_GO = { infl: "infl", jobs: "jobs", cb: "cb", rate: "rate", chip: "chip", fx: "fx", oil: "oil", fear: "fear", global: "global", local: "flows", expect: "earn" };
document.addEventListener("toggle", (e) => {
  const x = e.target;
  if (!x || !x.dataset || !x.dataset.storyOpen) return;
  const k = x.dataset.storyOpen;
  if (x.open) { STORY_OPEN.add(k); STORY_OPEN.delete(`${k}:x`); } else { STORY_OPEN.delete(k); STORY_OPEN.add(`${k}:x`); }
}, true);
// 연결 그림: 칸 → (이유) → 칸 → … → 갈라진 결과 칸들
// cause: 출발점의 원인 뉴스 (market_story.causes_of) — 없으면 칸 없음, null이면 '못 찾음'
function causeHtml(c) {
  if (c === undefined) return "";
  if (!c) return `<div class="flow-cause none">📰 원인 뉴스 못 찾음 <small>그날 모은 뉴스에 같은 주제 제목이 없어요</small></div>`;
  const t = /^https:\/\//.test(c.link || "") ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title);
  return `<div class="flow-cause">📰 <span class="flow-cause-t">${t}</span><small>${c.sources > 1 ? `언론 ${c.sources}곳 · ` : c.source ? `${esc(c.source)} · ` : ""}뉴스 제목으로 짝지은 것, 확정 원인은 아니에요</small></div>`;
}
function flowHtml(nodes, why, ends, cause) {
  const n = (x) => `<div class="flow-n${x.s > 0 ? " up-b" : x.s < 0 ? " down-b" : ""}"><b>${esc(x.t)}</b>${x.v ? ` <span class="${x.s > 0 ? "up" : x.s < 0 ? "down" : "muted"}">${esc(x.v)}</span>` : ""}</div>`;
  const a = (w) => `<div class="flow-a"><span class="flow-arr" aria-hidden="true">↓</span>${w ? `<span class="flow-why">${esc(w)}</span>` : ""}</div>`;
  const okText = (e) => (e.ok === true ? "✓ 예상대로" : e.ok === false ? "✗ 반대로" : e.ok === null && e.want != null ? "· 거의 그대로" : "");
  const e = (x) => `<div class="flow-e${x.ok === true ? " ok" : x.ok === false ? " no" : ""}"><span class="flow-et">${esc(x.t)}</span>
    <b class="${x.s > 0 ? "up" : x.s < 0 ? "down" : ""}">${esc(x.v || (x.s > 0 ? "▲" : x.s < 0 ? "▼" : ""))}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}${okText(x) ? `<em>${okText(x)}</em>` : ""}</div>`;
  return `<div class="flow">${nodes.map((x, i) => n(x) + (i ? "" : causeHtml(cause)) + a(why[i])).join("")}<div class="flow-ends">${ends.map(e).join("")}</div></div>`;
}
// 분석가 시각 (analyst_view.py): 쉽게 말하면 → 오늘의 성격 → 해석(주인공·조연·엇박자·함정) → 확인할 것 → 시나리오 → 내일 볼 것
function proBox(s, where) {
  const p = s.pro;
  if (!p) return "";
  const ck = (c) => `<li class="pro-ck"><span class="pro-ck-i ${c.good === true ? "ok" : c.good === false ? "no" : ""}">${c.good === true ? "✓" : c.good === false ? "✗" : "?"}</span>
    <div class="l"><div class="name">${esc(c.q)} <small class="muted">${esc(c.now)}</small></div><div class="meta">${esc(c.why)}</div></div></li>`;
  const key = `${where}:${s.day}:pro`, open = STORY_OPEN.has(key) || !STORY_OPEN.has(`${key}:x`);
  return `<div class="pro"><p class="pro-plain"><b>쉽게 말하면</b> ${esc(p.plain)}</p>
    ${(p.nature || []).length ? `<div class="learn-tags pro-nat">${p.nature.map((n) => `<span class="learn-tag strong">${esc(n.t)}</span>`).join("")}</div>
      <ul class="brief">${p.nature.map((n) => `<li>${esc(n.x)}</li>`).join("")}</ul>` : ""}
    ${p.history ? `<p class="learn-tip">📊 <b>분석팀 성적표</b> ${esc(p.history.text)}</p>` : ""}
    <details class="lesson pro-more" data-story-open="${esc(key)}"${open ? " open" : ""}><summary><span class="hm-t"><b>🎙 분석가의 해석</b><small class="muted">주인공·엇박자·함정 · 확인할 것 ${esc(p.score)} · 시나리오${(p.watch || []).length ? " · 내일 볼 것" : ""}</small></span></summary>
      <div class="lesson-body">${(p.points || []).map((x) => `<p class="learn-p"><b class="pro-h">${esc(x.h)}</b> ${esc(x.t)}</p>`).join("")}
        ${(p.checks || []).length ? `<h3 class="brief-h">✅ 오르는 힘을 받으려면 <small class="muted">${esc(p.score)} 우호</small></h3><ul class="list">${p.checks.map(ck).join("")}</ul>` : ""}
        ${(p.scenarios || []).length ? `<h3 class="brief-h">🧭 시나리오 <small class="muted">사고팔기 신호 아님</small></h3><div class="pro-scen">${p.scenarios.map((x) =>
          `<div class="pro-sc"><b>${esc(x.name)}</b><span>신호: ${esc(x.sign)}</span><small>${esc(x.then)}</small></div>`).join("")}</div>` : ""}
        ${(p.watch || []).length ? `<h3 class="brief-h">📅 내일 볼 것</h3>${p.watch.map((w) => `<div class="pro-w"><b>${esc(w.when)} ${esc(w.what)}</b>${w.forecast ? ` <small class="muted">예상 ${esc(w.forecast)}</small>` : ""}
          <div class="pro-w2"><span class="up">▲ 예상보다 높으면</span> ${esc(w.hi)}</div><div class="pro-w2"><span class="down">▼ 낮으면</span> ${esc(w.lo)}</div><small class="muted">${esc(w.tip)}</small></div>`).join("")}` : ""}
      </div></details></div>`;
}
const caseById = (id) => (typeof CASEBOOK !== "undefined" ? CASEBOOK : []).find((c) => c.id === id);
function storyCard(where) {
  const s = ((DATA.report || {}).story || {})[market];
  if (!s) return "";
  const chainBox = (c, i) => {
    const [vt, vc] = STORY_VERDICT[c.verdict] || [c.verdict, ""];
    const key = `${where}:${s.day}:${c.key}`, open = STORY_OPEN.has(key) || (i === 0 && !STORY_OPEN.has(`${key}:x`));
    return `<details class="lesson story-chain" data-story-open="${esc(key)}"${open ? " open" : ""}><summary><span class="story-no">${"①②③④"[i]}</span>
      <span class="hm-t"><b>${esc(c.title)}</b> <span class="badge ${vc}">${esc(vt)}</span></span></summary>
      <div class="lesson-body">${flowHtml(c.nodes, c.why, c.ends, c.cause)}
        ${c.leaders ? `<div class="story-lead"><b>🏃 ${esc(c.leaders.sector)} ${c.leaders.stocks.reduce((a, x) => a + x.r1, 0) >= 0 ? "앞장선 종목" : "가장 많이 빠진 종목"}</b><div class="story-lead-row">${c.leaders.stocks.map((x) =>
          `<span class="story-lead-s" data-stock="${esc(x.code)}" role="button"><span>${esc(x.name)}</span><b class="${sign(x.r1)}">${pct(x.r1)}</b><small>20일 ${pct(x.r20)}</small></span>`).join("")}</div>
          ${c.leaders.text ? `<p class="learn-why1">${esc(c.leaders.text)}</p>` : ""}</div>` : ""}
        ${c.spill ? `<div class="story-lead"><b>🔁 연결 산업으로 번졌나</b><ul class="brief">${c.spill.rows.map((x) =>
          `<li>${esc(c.spill.src)} → <b>${esc(x.sector)}</b> <small class="muted">(${esc(x.why)})</small> <span class="${sign(x.r1)}">${pct(x.r1)}</span>
            <small class="muted">${x.ok === true ? "✓ 따라감" : x.ok === false ? "✗ 반대로" : "· 거의 그대로"}</small></li>`).join("")}</ul>
          <p class="learn-why1">${esc(c.spill.text)}</p></div>` : ""}
        ${c.note ? `<p class="learn-tip">💡 ${esc(c.note)}</p>` : ""}
        <p class="learn-why1">📌 ${esc(c.lesson)}</p>
        ${CASE_GO[c.kind] ? `<button type="button" class="hot-ok story-learn" data-learn-go="${CASE_GO[c.kind]}">이 경로 배우기</button>` : ""}</div></details>`;
  };
  const ex = (s.expect || []).map((x) => `<li><div class="l"><div class="name">${x.code ? `<span data-stock="${esc(x.code)}" role="button">${esc(x.name)}</span>` : esc(x.name)}
      <b class="${sign(x.r1)}">${pct(x.r1)}</b> <span class="badge">${esc(x.title)}</span></div><div class="meta">${x.sector && x.code ? `${esc(x.sector)} · ` : ""}${esc(x.text)}</div></div></li>`).join("");
  const sim = (s.similar || []).map(caseById).filter(Boolean);
  return `<section class="card story" id="story-${where}"><h2>🧠 오늘의 연결 고리 <small>${md(s.day)} · 분석팀</small></h2>
    <p class="story-title">${esc(s.title)}</p>${proBox(s, where)}
    <h3 class="brief-h">🔗 무엇이 무엇으로 이어졌나</h3>
    ${(s.chains || []).length ? s.chains.map(chainBox).join("") : `<p class="empty">금리·환율·반도체·유가·해외 증시가 모두 평소 크기였어요. 이런 날은 업종·종목 소식이 주인공이에요.</p>`}
    ${ex ? `<h3 class="brief-h">🎯 기대와 반영 <small class="muted">이미 가격에 들어 있던 기대</small></h3><ul class="list">${ex}</ul>` : ""}
    ${sim.length ? `<h3 class="brief-h">📚 닮은 과거 사례</h3><div class="story-sim">${sim.map((c) => `<button type="button" class="learn-tag" data-case-go="${esc(c.id)}">${esc(c.date.slice(0, 4))} ${esc(c.title.split(" · ")[0])}</button>`).join("")}</div>` : ""}
    <p class="muted note" style="margin:10px 0 0">시장이 잘 알려진 길(금리 → 성장주, 반도체 → 코스피, 환율 → 외국인…)로 움직였는지 숫자로 맞춰 봤어요.
      업종은 지수보다 더(덜) 움직였는지로 봐요. ✓는 '그 방향으로 움직였다'는 뜻이지 원인 증명은 아니에요. 사고팔기 신호가 아니에요.</p></section>`;
}
// 리포트 화면의 '이 경로 배우기': 투자 공부 → 움직이는 이유에서 그 요인을 펼쳐요 (투자 공부 화면 안에서는 bindLearn이 해요)
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("#app [data-learn-go]");
  if (!b || (screen === "more" && moreKey === "learn")) return;
  learnTab = "drivers";
  remember("learn_tab", learnTab);
  LEARN_OPEN.add(`d:${b.dataset.learnGo}`);
  lastTap = null;
  openMore("learn");
  requestAnimationFrame(() => { const x = $(`#lesson-${CSS.escape(b.dataset.learnGo)}`); if (x) { x.scrollIntoView(); window.scrollBy(0, -70); } });
});
// 사례집으로 가서 그 사례를 펼쳐요 (이동하는 버튼이라 '화면 그대로'에서 빼요)
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-case-go]");
  if (!b) return;
  const id = b.dataset.caseGo;
  learnTab = "cases"; caseKind = "all";
  remember("learn_tab", learnTab);
  STORY_OPEN.add(`case:${id}`);
  lastTap = null;
  if (screen === "more" && moreKey === "learn") { lastView = ""; render(); } else openMore("learn");
  requestAnimationFrame(() => { const x = document.getElementById(`case-${id}`); if (x) { x.scrollIntoView(); window.scrollBy(0, -70); } });
});

// ── 사례집: 큰 사건을 '사건 → 연결 → 결과 → 그 뒤 → 배운 점'으로 (site/casebook.js) + 앱이 날마다 기록한 최근 사건 (paper/story_log.json)
let caseKind = "all";
const KIND_OF_CHAIN = { infl: "rate", jobs: "rate", cb: "rate", rate: "rate", chip: "chip", fx: "fx", oil: "fear", fear: "fear", global: "fear", local: "policy", expect: "expect" };
function afterMove(day) {  // 그날 종가 → 5거래일 뒤, 지금까지 지수 변화
  const r = wItem(OWN_IDX[market]);
  if (!r || !r.dates) return null;
  const i = r.dates.indexOf(day);
  if (i < 0) return null;
  const c0 = r.closes[i], c5 = r.closes[i + 5], cl = r.closes[r.closes.length - 1];
  return { d5: c5 != null && c0 ? c5 / c0 - 1 : null, now: i < r.closes.length - 1 && c0 ? cl / c0 - 1 : null, name: r.name };
}
function learnCaseCards() {
  const todaySim = new Set((((DATA.report || {}).story || {})[market] || {}).similar || []);
  const kindOk = (ks) => caseKind === "all" || ks.includes(caseKind);
  const chips = `<nav class="chips idx-chips case-kinds" aria-label="사례 묶음 고르기">${CASE_KINDS.map(([k, label]) =>
    `<button type="button" data-case-kind="${k}" aria-pressed="${k === caseKind}">${esc(label)}</button>`).join("")}</nav>`;
  const head = `<section class="card"><h2>🗂 사례집 <small>사건별 공부 자료</small></h2>
    <p class="muted" style="margin:0 0 8px">시장을 크게 움직인 사건을 <b>사건 → 연결 → 결과 → 그 뒤 → 배운 점</b> 순서로 정리했어요.
      위에는 앱이 장 마감마다 기록한 최근 사건, 아래는 꼭 알아 둘 과거 사건이에요.</p>${chips}</section>`;
  // 앱이 기록한 최근 사건: 지수가 1% 넘게 움직였거나 '기대 반영'이 나온 날
  const log = ((DATA.story_log || {})[market] || []).filter((r) => Math.abs(r.d1 || 0) >= 0.01 || (r.expect || []).length)
    .filter((r) => kindOk([...r.chains.map((c) => KIND_OF_CHAIN[c.kind]), ...((r.expect || []).length ? ["expect"] : [])])).slice(0, 12);
  const logRow = (r) => {
    const key = `log:${r.day}`, aft = afterMove(r.day);
    return `<details class="lesson" data-story-open="${esc(key)}"${STORY_OPEN.has(key) ? " open" : ""}><summary><span class="learn-case-d">${md(r.day)}</span>
      <span class="hm-t"><b>${esc(r.title)}</b></span></summary><div class="lesson-body">
      <ul class="brief">${r.chains.map((c) => `<li><span class="badge ${(STORY_VERDICT[c.verdict] || [])[1] || ""}">${esc((STORY_VERDICT[c.verdict] || [c.verdict])[0])}</span> ${esc(c.text.replace(/ \[[^\]]+\]$/, ""))}</li>`).join("")}</ul>
      ${r.plain ? `<p class="learn-p"><b>쉽게 말하면</b> ${esc(r.plain)}</p>` : ""}
      ${(r.expect || []).length ? `<p class="learn-why1">🎯 ${r.expect.map((x) => `${esc(x.name)} ${pct(x.r1)} ${esc(x.title)}`).join(" · ")}</p>` : ""}
      ${aft && (aft.d5 != null || aft.now != null) ? `<p class="learn-tip">⏩ 그 뒤: ${esc(aft.name)} ${aft.d5 != null ? `5거래일 뒤 <b class="${sign(aft.d5)}">${pct(aft.d5)}</b>` : "5거래일이 아직 안 지났어요"}${aft.now != null ? ` · 지금까지 <b class="${sign(aft.now)}">${pct(aft.now)}</b>` : ""}</p>` : ""}
      ${r.chains[0] ? `<p class="learn-why1">📌 ${esc(r.chains[0].lesson)}</p>` : ""}</div></details>`;
  };
  const logCard = `<section class="card" id="case-log"><h2>📒 앱이 기록한 최근 사건 <small>장 마감마다 늘어요</small></h2>
    ${log.length ? log.map(logRow).join("") : `<p class="empty">아직 기록된 사건이 없어요. 장 마감 뒤 분석팀이 하루씩 쌓아요.</p>`}
    <p class="muted note" style="margin:10px 0 0">'그 뒤'는 그날 종가에서 지수가 얼마나 더 움직였는지예요. 같은 사슬이 다시 나오면 지난번엔 어떻게 됐는지 비교해 보세요.</p></section>`;
  // 과거 큰 사건: 오늘과 닮은 사례를 먼저
  const book = (typeof CASEBOOK !== "undefined" ? CASEBOOK : []).filter((c) => kindOk(c.kind))
    .sort((a, b) => (todaySim.has(b.id) ? 1 : 0) - (todaySim.has(a.id) ? 1 : 0));
  const kindName = Object.fromEntries(CASE_KINDS);
  const caseBox = (c) => {
    const key = `case:${c.id}`;
    return `<details class="lesson case-box" id="case-${esc(c.id)}" data-story-open="${esc(key)}"${STORY_OPEN.has(key) ? " open" : ""}><summary><span class="learn-case-d">${esc(c.date.length > 4 ? `${c.date.slice(2, 4)}.${c.date.slice(5, 7)}` : c.date)}</span>
      <span class="hm-t"><b>${esc(c.title)}</b><span class="learn-tags">${todaySim.has(c.id) ? `<span class="learn-tag strong">오늘과 닮음</span>` : ""}${c.kind.map((k) => `<span class="learn-tag">${esc(kindName[k] || k)}</span>`).join("")}</span></span></summary>
      <div class="lesson-body"><p class="learn-p"><b>한 줄 요약</b> ${esc(c.one)}</p>
        ${flowHtml(c.chain.map(([t]) => ({ t })), c.chain.map(([, w]) => w), c.ends.map(([t, s]) => ({ t, s })))}
        <p class="learn-tip">⏩ 그 뒤: ${esc(c.after)}</p>
        ${c.pro ? `<p class="learn-p"><b class="pro-h">🎙 분석가의 눈</b> ${esc(c.pro)}</p>` : ""}
        ${c.myth ? `<p class="learn-p"><b class="pro-h">⚠️ 흔한 착각</b> ${esc(c.myth)}</p>` : ""}
        <h3 class="brief-h">📌 배운 점</h3><ul class="brief">${c.lesson.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${(c.go || []).length ? `<div class="learn-tags" style="margin-top:8px">${c.go.map((k) => { const d = DRIVERS.find((x) => x.key === k);
          return d ? `<button type="button" class="learn-tag" data-learn-go="${esc(k)}">${d.icon} ${esc(d.title)} 배우기</button>` : ""; }).join("")}</div>` : ""}</div></details>`;
  };
  const bookCard = `<section class="card" id="case-book"><h2>📜 꼭 알아 둘 과거 사건 <small>${book.length}개 · 대략값</small></h2>
    ${book.length ? book.map(caseBox).join("") : `<p class="empty">이 묶음엔 아직 사례가 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">숫자는 널리 알려진 대략값(종가 기준)이에요. 사건을 외우기보다 '무엇이 무엇으로 이어졌나'를 보세요. 다음에 비슷한 출발점이 보이면 같은 길을 떠올릴 수 있어요.</p></section>`;
  return [head, noteCaseCard(), logCard, bookCard];
}
// 사례집 '상황별 공부 노트': 같은 상황의 노트끼리 모아 보고, 닮은 과거 큰 사건으로 이어져요
function noteCaseCard() {
  const N = learnNotes();
  const cnt = (k) => N.filter((n) => (n.patterns || []).includes(k)).length;
  const pats = NOTE_PATS.filter((p) => cnt(p[0]));
  if (!pats.length) return "";
  if (!notePat || !cnt(notePat)) notePat = ((N.find((n) => (n.patterns || []).some((k) => NOTE_PAT[k])) || {}).patterns || []).find((k) => NOTE_PAT[k]) || pats[0][0];
  const [k, icon, name, one, cases] = NOTE_PAT[notePat];
  const list = N.filter((n) => (n.patterns || []).includes(k));
  const book = typeof CASEBOOK !== "undefined" ? CASEBOOK : [];
  const rel = cases.map((id) => book.find((c) => c.id === id)).filter(Boolean);
  return `<section class="card" id="case-notes"><h2>📝 상황별 공부 노트 <small>${N.length}편 · 비슷한 날끼리</small></h2>
    <p class="muted" style="margin:0 0 8px">변동이 큰 장도 모양은 되풀이돼요. 같은 상황이었던 날을 모아 보면 '이번엔 어디가 다른가'가 보여요.</p>
    <nav class="chips idx-chips note-pat-row" aria-label="상황 고르기">${pats.map(([pk, pi, pn]) =>
      `<button type="button" data-note-pick="${pk}" aria-pressed="${pk === k}">${pi} ${esc(pn)} <small>${cnt(pk)}</small></button>`).join("")}</nav>
    <p class="learn-why1" style="margin:10px 0 6px">${icon} <b>${esc(name)}</b> · ${esc(one)}</p>
    ${list.map((n) => { const key = `pnote:${n.day}`;
      return `<details class="lesson" data-learn-open="${esc(key)}"${LEARN_OPEN.has(key) ? " open" : ""}><summary><span class="learn-case-d">${md(n.day)}</span><span class="hm-t"><b>${esc(n.title)}</b></span></summary>
        <div class="lesson-body">${noteBody(n, true)}</div></details>`; }).join("")}
    ${rel.length ? `<h3 class="brief-h">📜 같은 모양의 과거 큰 사건</h3><div class="story-sim">${rel.map((c) =>
      `<button type="button" class="learn-tag" data-case-go="${esc(c.id)}">${esc(c.date.slice(0, 4))} ${esc(c.title.split(" · ")[0])}</button>`).join("")}</div>` : ""}
    <p class="muted note" style="margin:10px 0 0">꼬리표는 그날 노트를 쓰며 붙인 거라 정답이 아니라 '비슷한 모양' 표시예요. 다음에 같은 모양이 보이면 지난번 노트부터 다시 읽어 보세요.</p></section>`;
}
// 노트의 '이런 상황' 칩: 사례집의 상황별 노트로 가요 (이동하는 버튼이라 '화면 그대로'에서 빼요)
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-note-pat]");
  if (!b) return;
  notePat = b.dataset.notePat;
  learnTab = "cases"; caseKind = "all";
  remember("learn_tab", learnTab);
  lastTap = null;
  if (screen === "more" && moreKey === "learn") { lastView = ""; render(); } else openMore("learn");
  requestAnimationFrame(() => { const x = document.getElementById("case-notes"); if (x) { x.scrollIntoView(); window.scrollBy(0, -70); } });
});

function learnView(d) {
  mergeNoteTerms();
  const cards = learnTab === "drivers" ? learnDriverCards() : learnTab === "read" ? learnReadCards() : learnTab === "cope" ? learnCopeCards() : learnTab === "terms" ? learnTermCards() : learnTab === "cases" ? learnCaseCards() : learnWhyCards(d);
  return [`<section class="card learn-head"><h2>📚 투자 공부 <small>${MK_NAME[market]} 자료로</small></h2>
    <p class="muted" style="margin:0 0 4px">앱이 모은 자료로 '왜 움직였나'를 매일 새로 풀어 줘요. 사고팔기 신호는 아니에요.</p>
    <p class="learn-tod">📌 오늘의 용어 <button type="button" class="learn-term" data-term="${esc(termOfDay())}">${esc(termOfDay())}</button></p>${learnTabsBar()}</section>`, ...cards].join("");
}
// 홈 '더 보기' 한 줄: 오늘 지수와 움직인 요인 수
function learnSummary() {
  mergeNoteTerms();
  const nt = learnNotes()[0];
  if (nt && nt.day >= TODAY()) return `📝 새 노트 · ${esc(nt.title)}`;
  const s = idxStory(OWN_IDX[market]);
  const n = driversFor(market).map((x) => driverNow(x)).filter((x) => x && x.hit > 0).length;
  const R = DATA.reading, r = R && R.items ? Object.values(R.items).flat().filter((x) => x.date === TODAY()).length : (DATA.reading_days || {})[TODAY()] || 0;
  return `${s ? `${esc(s.r.name)} ${upDown(s.d1)} 왜? · 원인 후보 ${n}개` : "대처법"}${r ? ` · 오늘 리포트 ${r}개` : ""} · 오늘의 용어 ${esc(termOfDay())}`;
}
function bindLearn() {
  const app = $("#app");
  keepRow($(".learn-tabs", app), "learn");
  app.querySelectorAll("[data-learn-tab]").forEach((b) => b.addEventListener("click", () => {
    const toCope = b.classList.contains("more");  // 아래쪽 '대처법 전부 보기'는 이동하는 버튼이라 맨 위로
    learnTab = b.dataset.learnTab;
    remember("learn_tab", learnTab);
    if (toCope) { lastTap = null; lastView = ""; window.scrollTo(0, 0); }
    render();
  }));
  app.querySelectorAll("details[data-learn-open]").forEach((x) => x.addEventListener("toggle", () => {
    if (x.open) LEARN_OPEN.add(x.dataset.learnOpen); else LEARN_OPEN.delete(x.dataset.learnOpen);
  }));
  // '배우기': 움직이는 이유에서 그 요인을 펼쳐 보여 줘요 (이동하는 버튼이라 '화면 그대로'에서 빼요)
  app.querySelectorAll("[data-learn-go]").forEach((b) => b.addEventListener("click", () => {
    learnTab = "drivers";
    remember("learn_tab", learnTab);
    LEARN_OPEN.add(`d:${b.dataset.learnGo}`);
    lastTap = null;
    render();
    const x = $(`#lesson-${CSS.escape(b.dataset.learnGo)}`);
    if (x) { x.scrollIntoView(); window.scrollBy(0, -70); }
  }));
  app.querySelectorAll("[data-learn-tool]").forEach((b) => b.addEventListener("click", () => {
    perfTabKey = b.dataset.learnTool;
    remember("tools_tab", perfTabKey);
    go("tools");
  }));
  keepRow($(".case-kinds", app), "case-kinds");
  app.querySelectorAll("[data-case-kind]").forEach((b) => b.addEventListener("click", () => { caseKind = b.dataset.caseKind; render(); }));
  keepRow($(".note-pat-row", app), "note-pats");
  app.querySelectorAll("[data-note-pick]").forEach((b) => b.addEventListener("click", () => { notePat = b.dataset.notePick; render(); }));
  app.querySelectorAll("[data-read-cat]").forEach((b) => b.addEventListener("click", () => {
    readCat = b.dataset.readCat;
    remember("read_cat", readCat);
    render();
  }));
  const q = $("#learn-q", app);
  if (q) q.addEventListener("input", () => {
    learnQ = q.value;
    const s = learnQ.trim().toLowerCase();
    let any = false;
    app.querySelectorAll(".learn-group").forEach((g) => {
      let n = 0;
      g.querySelectorAll("details[data-gloss]").forEach((x) => {
        const t = x.dataset.gloss, ok = !s || t.toLowerCase().includes(s) || (TERMS[t] || "").toLowerCase().includes(s);
        x.hidden = !ok; if (ok) n++;
      });
      g.hidden = !n; if (n) any = true;
    });
    const none = $(".learn-none", app);
    if (none) none.hidden = any;
  });
}
// 용어 설명 창의 '용어집 전체 보기': 투자 공부 → 용어집에서 그 말을 펼쳐 보여 줘요
function openTerm(t) {
  learnTab = "terms";
  learnQ = "";
  openMore("learn");
  requestAnimationFrame(() => {
    const x = $(`details[data-gloss="${CSS.escape(t)}"]`);
    if (x) { x.open = true; x.scrollIntoView(); window.scrollBy(0, -80); }
  });
}
