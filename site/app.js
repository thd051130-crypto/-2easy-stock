// 이지스톡 대시보드: data.json(dashboard.py가 매일 만듦)을 읽어 국장·미장 화면을 그려요.
"use strict";

const NEXT_RUN = { kr: "평일 한국시간 17:30쯤", us: "화~토 한국시간 07:30쯤" };


// 캔들 하나의 기간과 처음 보이는 캔들 수: 일봉 1개월, 주봉 6개월, 월봉 3년, 년봉 전체
const FRAMES = [["d", "일봉", 21], ["w", "주봉", 26], ["m", "월봉", 36], ["y", "년봉", 60]];
const UNIT = { d: "일", w: "주", m: "개월", y: "년" };
let DATA = null;
let frame = "d";
try { frame = localStorage.getItem("frame") || "d"; } catch (e) { /* 기본값 */ }
if (!FRAMES.some((f) => f[0] === frame)) frame = "d";
// 차트 보조지표 켜기·끄기 (이 폰 브라우저에 기억해요). 처음엔 이동평균선만 켜져 있어요.
const IND_KEYS = [["ma", "이동평균선"], ["bb", "볼린저밴드"], ["vol", "거래량"], ["rsi", "RSI"]];
const IND = { ma: true, bb: false, vol: false, rsi: false };
try {
  const saved = JSON.parse(localStorage.getItem("ind") || "{}");
  for (const [k] of IND_KEYS) if (typeof (saved && saved[k]) === "boolean") IND[k] = saved[k];
} catch (e) { /* 기본값 */ }
// 이동평균선 설정: 선 4개의 기간(일)과 켜기·끄기 (이 폰 브라우저에 기억해요, 종목·지수 캔들 차트 모두 같이).
// 처음엔 예전처럼 50일선·200일선만 켜져 있어요. 비교 차트에는 이동평균선을 안 그려요.
const MA_COLORS = ["var(--ma1)", "var(--ma2)", "var(--ma50)", "var(--ma200)"];
const MA_DEFAULT = [{ p: 5, on: false }, { p: 20, on: false }, { p: 50, on: true }, { p: 200, on: true }];
const MA_MAX = 300;
let MA_SET = MA_DEFAULT.map((m) => ({ ...m }));
try {
  const saved = JSON.parse(localStorage.getItem("ma_set") || "null");
  if (Array.isArray(saved) && saved.length === MA_DEFAULT.length) {
    MA_SET = saved.map((m, i) => ({
      p: Number.isInteger(m && m.p) && m.p >= 2 && m.p <= MA_MAX ? m.p : MA_DEFAULT[i].p,
      on: typeof (m && m.on) === "boolean" ? m.on : MA_DEFAULT[i].on,
    }));
  }
} catch (e) { /* 기본값 */ }
let maOpen = false;  // 이동평균선 설정 창이 열려 있는지 (다시 그려도 열린 채로)
// 차트 화면 지수 버튼: 시장마다 고른 지수 (이 폰 브라우저에 기억해요). 기본은 그 시장 매매 기준 지수.
const OWN_IDX = { kr: "^KS11", us: "^GSPC" };
const CHART_IDX = { ...OWN_IDX };
try {
  const saved = JSON.parse(localStorage.getItem("chart_idx") || "{}");
  for (const m of ["kr", "us"]) if (typeof (saved && saved[m]) === "string") CHART_IDX[m] = saved[m];
} catch (e) { /* 기본값 */ }
let market = "kr";
try { market = localStorage.getItem("market") || "kr"; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
// 아래쪽 버튼으로 바꾸는 화면. 앱을 새로 열면 늘 홈부터 보여요. 주소 끝(#kr/chart)에 시장과 화면을 적어 둬요.
const SCREENS = ["home", "report", "watch", "tools", "chart", "stock", "search", "map", "inbox", "world", "more"];
let screen = "home";
// 종목 화면(#kr/stock/005930), 검색 화면(#kr/search), 산업 지도(#kr/map/조선)는 보던 화면 위에 한 겹 더 열려요 (뒤로 가면 보던 화면).
// 아래 버튼은 그 아래 깔린 화면(stockFrom)에 불이 들어와요.
const LAYERS = ["stock", "search", "map", "inbox", "world", "more"];  // 메시지함(#kr/inbox), 세계 지수(#kr/world), 더 보기 칸(#kr/more/<칸>)도 한 겹 위
let stockCode = null;
let stockFrom = "watch";
let searchQuery = "";
let mapStart = "";  // 주소로 바로 연 산업 지도의 고른 산업
let moreKey = "";   // 홈 '더 보기'에서 연 칸 (#kr/more/<칸>)
let moreFromY = 0;  // 더 보기 칸을 열 때 홈에서 보던 높이 (뒤로 오면 그 자리로)
const fromHash = () => {
  const [m, s, code] = location.hash.slice(1).split("/");
  let c = null;
  try { c = code ? decodeURIComponent(code) : null; } catch (e) { /* 이상한 주소 */ }
  return { m, s, code: c };
};
{
  const h = fromHash();
  if (h.m === "kr" || h.m === "us") market = h.m;
  if (SCREENS.includes(h.s) && ((h.s !== "stock" && h.s !== "more") || h.code)) {
    screen = h.s;
    if (h.s === "map") mapStart = h.code || "";
    else if (h.s === "more") { moreKey = h.code; stockFrom = "home"; }  // 아래 메뉴는 '홈'에 불이 켜지게
    else stockCode = h.code;
  }
}
const hashFor = () => `#${market}${screen === "home" ? "" : `/${screen}`}${screen === "stock" ? `/${encodeURIComponent(stockCode)}`
  : screen === "map" && mapFocus ? `/${encodeURIComponent(mapFocus)}` : screen === "more" ? `/${encodeURIComponent(moreKey)}` : ""}`;

// 관심종목(★)은 이 폰 브라우저에 시장별로 저장해요. 저장소를 못 쓰면 앱을 닫을 때까지만 기억해요.
const WATCH = {};
for (const m of ["kr", "us"]) {
  try { WATCH[m] = JSON.parse(localStorage.getItem(`watch_${m}`) || "[]"); } catch (e) { WATCH[m] = []; }
  if (!Array.isArray(WATCH[m])) WATCH[m] = [];
}
function toggleWatch(code, m = market) {
  const list = WATCH[m];
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1); else list.push(code);
  try { localStorage.setItem(`watch_${m}`, JSON.stringify(list)); } catch (e) { /* 이번만 기억 */ }
}
// 텔레그램으로 넣은 종목(data.json의 extras)은 처음 보이면 ★에 자동으로 넣어요. 본 종목은 기억해서, ☆로 빼면 다시 안 넣어요.
const SEEN = {};
for (const m of ["kr", "us"]) {
  try { SEEN[m] = JSON.parse(localStorage.getItem(`seen_extras_${m}`) || "[]"); } catch (e) { SEEN[m] = []; }
  if (!Array.isArray(SEEN[m])) SEEN[m] = [];
}
function adoptExtras() {
  for (const m of ["kr", "us"]) {
    const fresh = ((DATA.markets[m] || {}).extras || []).map((e) => e.code).filter((c) => !SEEN[m].includes(c));
    if (!fresh.length) continue;
    for (const c of fresh) { SEEN[m].push(c); if (!WATCH[m].includes(c)) WATCH[m].push(c); }
    try {
      localStorage.setItem(`seen_extras_${m}`, JSON.stringify(SEEN[m]));
      localStorage.setItem(`watch_${m}`, JSON.stringify(WATCH[m]));
    } catch (e) { /* 이번만 기억 */ }
  }
}
let watchQuery = "";
// 세계 지수·환율 칸에서 고른 기간 (이 폰 브라우저에 기억해요)
const WORLD_P = [["d1", "오늘", 6, "1주"], ["w1", "1주", 22, "1개월"], ["m1", "1개월", 66, "3개월"], ["y1", "1년", 0, "1년"]];
let worldP = "d1";
try { worldP = localStorage.getItem("world_p") || "d1"; } catch (e) { /* 기본값 */ }
if (!WORLD_P.some((p) => p[0] === worldP)) worldP = "d1";
// 고른 업종 (홈 '업종별 호재·악재'와 관심 화면 '전체 종목'이 같이 써요). 시장마다 따로
const SECTOR = { kr: "", us: "" };
try { Object.assign(SECTOR, JSON.parse(localStorage.getItem("sector") || "{}")); } catch (e) { /* 기본값 */ }
function pickSector(name) {
  SECTOR[market] = SECTOR[market] === name ? "" : name;
  try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
}
let watchSort = "change";
try { watchSort = localStorage.getItem("watchSort") || "change"; } catch (e) { /* 기본값 */ }

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 용어 풀이: 어려운 말 옆 작은 ? 버튼을 누르면 아래에서 쉬운 설명이 올라와요. 검색 화면엔 용어 사전 전체.
const TERMS = {
  "PER": "주가 ÷ 1주당 순이익. 회사가 지금 버는 돈으로 주가만큼 벌려면 몇 년 걸리나예요. 낮을수록 싸다고 보지만, 업종마다 보통 수준이 달라요 (은행 5배, 반도체 15배, 성장주 30배+).",
  "PBR": "주가 ÷ 1주당 순자산. 1배 미만이면 회사를 지금 다 팔아 나눠도 주가보다 많이 받는다는 뜻이라 싸다고 봐요. 다만 돈을 못 버는 회사도 PBR이 낮아요.",
  "시가총액": "주가 × 주식 수 = 회사 전체 값. 클수록 큰 회사이고 보통 덜 출렁여요.",
  "배당수익률": "1년 배당금 ÷ 주가. 3%면 100만 원어치 갖고 있을 때 1년에 약 3만 원(세전)을 받아요. 배당은 줄거나 끊길 수 있어요.",
  "ROE": "순이익 ÷ 자기자본. 주주 돈 100원으로 1년에 몇 원을 버나예요. 10% 넘으면 잘 버는 편이에요.",
  "부채비율": "부채 ÷ 자기자본. 100%면 빚이 자기 돈만큼이에요. 높을수록 금리가 오르거나 경기가 나쁠 때 위험해요. 은행·보험은 원래 높아서 따로 봐요.",
  "최대 낙폭": "가장 높았던 때에서 가장 많이 떨어졌을 때까지의 비율(MDD). -30%면 1,000만 원이 잠깐 700만 원까지 줄었다는 뜻이에요. 우리 앱은 이걸 작게 하는 게 첫째 목표예요.",
  "200일선": "최근 200거래일(약 10개월) 종가 평균. 주가가 이 위면 긴 흐름이 오르는 중, 아래면 내리는 중으로 봐요.",
  "RSI": "최근 14일 오른 힘과 내린 힘을 0~100으로. 70 위면 많이 올라 과열, 30 아래면 많이 빠진 상태예요. 30 아래라고 바로 오르는 건 아니에요.",
  "52주 고점": "최근 1년 중 가장 높았던 종가. 고점 대비 -20%면 1년 중 꼭대기에서 20% 내려와 있다는 뜻이에요.",
  "목표주가": "증권사 애널리스트들이 1년 안에 갈 거라고 본 값의 평균. 대체로 낙관적이고 주가를 늦게 따라 바뀌어서 참고만 해요.",
  "순매수": "산 주식 수 - 판 주식 수. +면 그날 그쪽(외국인·기관)이 더 많이 샀고, -(순매도)면 더 많이 팔았어요.",
  "외국인 보유율": "그 회사 주식 중 외국인이 가진 비율. 꾸준히 늘면 외국인이 사 모으는 중이에요.",
  "배당락": "이날부터 사면 이번 배당을 못 받아요. 배당을 받으려면 배당락 전날까지 사 둬야 해요. 배당락 날엔 보통 배당금만큼 주가가 내려가요.",
  "ISA": "개인종합자산관리계좌. 3년 넘게 유지하면 이익 200만 원(서민형 400만 원)까지 세금이 없고 넘는 부분도 9.9%만 내요. 한 해 2,000만 원까지 넣을 수 있어요.",
  "연금저축": "노후 대비 절세 계좌. 55세 이후 연금으로 받으면 그동안 번 돈에 3.3~5.5%만 내요(중간에 빼면 16.5%). 소득이 있으면 한 해 600만 원까지 넣은 돈의 13.2~16.5%를 세금에서 돌려받아요. 미국 상장 종목은 못 사요.",
  "IRP": "개인형 퇴직연금. 연금저축과 비슷한 노후 절세 계좌인데 소득이 있어야 만들 수 있고 중간에 빼기가 거의 안 돼요. 연금저축과 합쳐 한 해 900만 원까지 세액공제, 1,800만 원까지 넣을 수 있어요.",
  "ETF": "여러 종목을 한 바구니에 담아 주식처럼 사고파는 상품. TIGER 미국S&P500은 미국 큰 회사 500개를 한 번에 사는 것과 같아요.",
  "FOMC": "미국 중앙은행(연준)의 금리 결정 회의. 1년에 8번. 금리를 올리면 보통 주가에 부담, 내리면 도움이 돼요. 한국시간 새벽에 발표돼요.",
  "금통위": "한국은행 금융통화위원회. 한국 기준금리를 정해요. 1년에 8번, 보통 목요일 오전에 발표해요.",
  "옵션 만기": "선물·옵션 계약이 끝나는 날(국장 매달 둘째 목요일, 미장 셋째 금요일). 큰손들이 계약을 정리하느라 장 막판에 주가가 출렁일 수 있어요.",
  "실적 시즌": "회사들이 분기 실적을 몰아서 발표하는 때. 예상보다 나쁘면 하루에 -10%도 나와요.",
  "유상증자": "회사가 새 주식을 찍어 돈을 받는 것. 주식 수가 늘어 내 몫이 줄어서(희석) 주가가 내릴 때가 많아요.",
  "전환사채": "나중에 주식으로 바꿀 수 있는 회사 빚(CB). 주식으로 바뀌면 주식 수가 늘어 주가에 부담이 돼요.",
  "자사주 매입": "회사가 자기 주식을 사는 것. 시장에 도는 주식이 줄어서 보통 주가에 좋은 소식이에요. 소각까지 하면 더 좋아요.",
  "공시": "회사가 투자자에게 꼭 알려야 하는 일을 금감원 전자공시(DART)에 올린 글. 실적·증자·지분 변동 등이 있어요.",
  "백테스트": "규칙을 과거 주가에 그대로 적용해 봤다면 어땠을지 계산한 것. 과거에 잘 됐다고 앞으로도 그렇다는 보장은 없어요.",
  "리포트 부서": "시장팀→일정·정책팀→업종팀→종목팀→편집팀이 앞 팀 자료를 넘겨받아 오늘의 리포트 한 장을 만들어요. 공개 자료로 만든 참고용이고 사고팔기 판단은 안 해요.",
  "복리": "번 돈을 다시 넣어 그 돈도 같이 불어나는 것. 기간이 길수록 차이가 커져요.",
  "총보수": "ETF 회사가 해마다 떼 가는 운용 비용. 0.07%면 1,000만 원에 1년 7,000원. 잔고에서 조금씩 빠져요.",
  "커버드콜": "주식을 들고 '오르면 넘겨줄 권리'를 팔아 그 값을 분배금으로 나눠 주는 상품. 매달 돈이 많이 나오는 대신 크게 오를 땐 덜 오르고, 내릴 땐 거의 같이 내려요.",
  "레버리지": "지수가 하루 1% 움직이면 2% 움직이는 상품. 오르내림을 반복하면 손실이 쌓여서(음의 복리) 오래 들면 2배가 안 나와요.",
  "히트맵": "종목을 네모 칸으로 그린 지도. 칸이 크면 큰 회사, 빨강은 오름, 파랑은 내림, 진할수록 많이 움직였어요.",
  // 투자 공부 화면 용어집에 더한 말 (사용자 2026-10-24)
  "코스피": "한국 유가증권시장 대표 지수. 삼성전자·SK하이닉스 같은 큰 회사 비중이 커서 이 회사들 주가에 크게 흔들려요.",
  "코스닥": "한국의 중소·성장 기업 시장 지수. 바이오·2차전지·IT 회사가 많아 코스피보다 더 크게 출렁여요.",
  "S&P500": "미국 큰 회사 500개를 담은 지수. 미국 증시 전체 흐름을 볼 때 가장 많이 봐요.",
  "나스닥": "기술 회사가 많은 미국 시장 지수. 금리가 오르내릴 때 S&P500보다 더 크게 움직여요.",
  "필라델피아 반도체": "미국 반도체 회사 지수(SOX). 삼성전자·SK하이닉스와 같이 움직일 때가 많아서 다음 날 국장 반도체를 가늠할 때 봐요.",
  "조정": "고점에서 10% 넘게 내려온 상태. 드물지 않게 나오고, 몇 달 안에 회복하는 경우가 많아요.",
  "약세장": "고점에서 20% 넘게 내려온 상태(베어마켓). 반대로 저점에서 20% 넘게 오르면 강세장(불마켓)이라고 불러요.",
  "서킷브레이커": "지수가 하루에 너무 많이 빠지면 거래를 잠깐 멈추는 장치. 국장은 8%·15% 빠져 1분 넘게 이어지면 20분 멈추고, 20%면 그날 장을 끝내요. 미장은 S&P500 7%·13%에 15분, 20%면 그날 끝.",
  "사이드카": "선물 가격이 급하게 움직이면(코스피200 선물 5%, 코스닥150 선물 6%가 1분 넘게) 컴퓨터 자동 주문(프로그램 매매)을 5분 멈추는 장치. 서킷브레이커보다 한 단계 약해요.",
  "공매도": "주식을 빌려 먼저 팔고, 나중에 사서 갚는 거래. 주가가 내리면 이익이라 공매도가 몰린 종목은 하락 압력을 받기도 해요.",
  "변동성": "주가가 얼마나 크게 오르내리는지. 변동성이 크면 같은 수익을 내도 중간에 더 크게 빠질 수 있어요.",
  "기준금리": "중앙은행이 정하는 기본 금리. 예금·대출 금리가 이걸 따라가요. 올리면 돈이 귀해져 주가에 보통 부담, 내리면 숨통이 트여요.",
  "국채 금리": "나라가 돈을 빌릴 때 주는 이자. 시장에서 매일 바뀌어요. 미국 10년 국채 금리는 전 세계 주식 값을 매기는 잣대처럼 쓰여요.",
  "장단기 금리 역전": "보통은 오래 빌릴수록 이자가 높은데, 짧은 금리가 긴 금리보다 높아진 것. 과거 미국 경기 침체 전에 자주 나와서 경기 경고로 봐요. 다만 침체까지 1~2년 걸리기도 하고 안 오기도 해요.",
  "CPI": "소비자물가지수. 장바구니 물건 값이 1년 전보다 얼마나 올랐나예요. 예상보다 높으면 금리 걱정에 주가가 빠지기 쉬워요. 미국은 매달 중순 한국시간 밤 9시 반(겨울 10시 반)에 나와요.",
  "근원 물가": "물가에서 값이 들쭉날쭉한 음식·에너지를 뺀 것. 중앙은행은 물가의 진짜 흐름을 볼 때 이걸 더 중요하게 봐요.",
  "PCE": "미국 개인소비지출 물가. 연준이 물가 목표 2%를 잴 때 공식으로 쓰는 물가예요.",
  "비농업 고용": "미국에서 한 달 동안 농업을 빼고 늘어난 일자리 수. 보통 매달 첫 금요일에 나와요. 너무 강하면 금리 걱정, 너무 약하면 경기 걱정이라 '적당히'가 제일 좋아요.",
  "실업률": "일하려는 사람 중 일자리가 없는 사람 비율. 빠르게 오르기 시작하면 경기가 식는 신호로 봐요.",
  "삼 법칙": "미국 실업률 3달 평균이 지난 1년 중 가장 낮았을 때보다 0.5%p 넘게 오르면 경기 침체가 이미 시작됐을 가능성이 높다는 규칙. 앱 '경기 국면' 칸에 나와요.",
  "GDP": "한 나라가 일정 기간 만든 것의 값을 다 더한 것. 성장률은 경제의 성적표예요.",
  "PMI": "회사 구매 담당자에게 경기를 물어 만든 숫자. 50보다 높으면 좋아지는 중, 낮으면 나빠지는 중이에요. 다른 지표보다 빨리 나와요.",
  "경기 침체": "경제가 뒷걸음질하는 때(리세션). 흔히 GDP가 두 분기 연속 줄면 그렇게 불러요. 회사 이익이 줄어 주가가 크게 빠질 때가 많아요.",
  "스태그플레이션": "경기는 나쁜데 물가는 오르는 상태. 금리를 내리기도 올리기도 어려워 주식·채권이 같이 힘들 수 있어요.",
  "연착륙": "물가를 잡으려고 금리를 올렸는데 침체 없이 경기가 천천히 식는 것. 반대로 갑자기 침체에 빠지면 경착륙이에요.",
  "양적 긴축": "중앙은행이 갖고 있던 채권을 줄여 시장에 풀린 돈을 거둬들이는 것(QT). 반대로 채권을 사서 돈을 푸는 건 양적 완화(QE).",
  "환율": "원/달러 1,300원이면 1달러를 사는 데 1,300원이 든다는 뜻. 숫자가 오르면 원화 값이 떨어진(원화 약세) 거예요.",
  "원화 약세": "환율이 올라 원화 값이 떨어지는 것. 수출 회사는 같은 달러를 벌어도 원화로 더 받지만, 외국인 투자자는 환차손이 나서 국장을 팔기 쉬워요.",
  "달러인덱스": "유로·엔 등 여러 나라 돈과 비교한 달러의 힘. 오르면 달러가 강해져 신흥국 증시엔 보통 부담이에요.",
  "WTI": "미국 서부 텍사스산 원유 값. 국제 유가를 볼 때 브렌트유와 함께 가장 많이 봐요.",
  "안전자산": "불안할 때 돈이 몰리는 곳. 미국 국채·달러·금·엔화 등이에요. 주가가 크게 빠지는 날엔 이쪽이 오르기 쉬워요.",
  "구리/금 비율": "경기에 민감한 구리 값 ÷ 안전자산인 금 값. 내려가면 시장이 경기를 어둡게 본다는 신호로 써요.",
  "하이일드": "신용이 낮은 회사가 높은 이자를 주고 빌린 채권. 이 채권 값이 국채보다 약해지면 회사들이 돈 빌리기 어려워진다는 신호예요.",
  "VIX": "S&P500이 앞으로 한 달 얼마나 출렁일지 옵션 값으로 계산한 '공포 지수'. 보통 12~20, 30을 넘으면 큰 공포예요. 언제 가라앉을지는 미리 알 수 없어요.",
  "패닉 셀": "겁에 질려 한꺼번에 파는 것. 이런 날은 좋은 회사도 같이 크게 빠져요.",
  "반대매매": "빚(신용·미수)으로 산 주식이 너무 빠지면 증권사가 강제로 파는 것. 하락장에서 매물이 더 쏟아지게 만들어요.",
  "FOMO": "나만 놓칠까 봐 급히 따라 사는 마음. 이미 많이 오른 뒤 사서 물리기 쉬워요.",
  "어닝 서프라이즈": "실적이 시장 예상보다 크게 좋은 것. 반대는 어닝 쇼크. 주가는 실적 자체보다 '예상과의 차이'에 반응해요.",
  "가이던스": "회사가 직접 내놓는 다음 분기·내년 실적 전망. 지난 실적이 좋아도 가이던스가 낮으면 주가가 빠지기도 해요.",
  "컨센서스": "증권사 전망치 평균. 뉴스에서 '예상치'라고 하면 보통 이걸 말해요.",
  "밸류에이션": "회사 값이 비싼지 싼지 따지는 것. PER·PBR 같은 숫자로 비교해요.",
  "분산투자": "여러 종목·자산·나라에 나눠 담는 것. 하나가 크게 빠져도 전체 손실이 작아요.",
  "분할 매수": "한 번에 다 사지 않고 여러 번 나눠 사는 것. 바닥을 몰라도 평균 값으로 사게 돼요.",
  "적립식": "정해진 날 정해진 돈을 꾸준히 넣는 것. 내릴 땐 같은 돈으로 더 많이 사게 돼요. 도구 → 적립식 계산기에서 결과를 볼 수 있어요.",
  "리밸런싱": "비중이 처음 정한 것에서 벗어나면 다시 맞추는 것. 예: 주식 60·채권 40으로 정했는데 주식이 올라 70이 되면 10만큼 채권으로 옮겨요.",
  "자산배분": "주식·채권·현금·금 등을 어떤 비율로 나눌지 정하는 것. 낙폭을 줄이는 가장 기본이에요.",
  "손절": "정해 둔 손실에 닿으면 팔아서 더 큰 손실을 막는 것. 미리 정하지 않으면 감정에 휘둘리기 쉬워요.",
  "물타기": "가진 종목이 내렸을 때 더 사서 평균 단가를 낮추는 것. 회사가 계속 나빠지는 중이면 손실만 커질 수 있어요.",
  "섹터 로테이션": "경기 단계에 따라 돈이 몰리는 업종이 바뀌는 것. 예: 금리가 내릴 땐 성장주, 물가가 오를 땐 에너지·원자재로.",
};
// 투자 공부 → 용어집에서 묶어 보여 줄 분야 (여기 없는 말은 '그 밖에')
const TERM_GROUPS = [
  ["📈 시장·지수", ["코스피", "코스닥", "S&P500", "나스닥", "필라델피아 반도체", "시가총액", "조정", "약세장", "최대 낙폭", "변동성", "서킷브레이커", "사이드카", "옵션 만기", "공매도", "히트맵"]],
  ["🏦 금리·경제 지표", ["기준금리", "국채 금리", "장단기 금리 역전", "FOMC", "금통위", "CPI", "근원 물가", "PCE", "비농업 고용", "실업률", "삼 법칙", "GDP", "PMI", "경기 침체", "스태그플레이션", "연착륙", "양적 긴축"]],
  ["💱 환율·원자재", ["환율", "원화 약세", "달러인덱스", "WTI", "안전자산", "구리/금 비율", "하이일드"]],
  ["😨 심리·수급", ["VIX", "패닉 셀", "반대매매", "FOMO", "순매수", "외국인 보유율"]],
  ["🏢 회사·실적", ["실적 시즌", "어닝 서프라이즈", "가이던스", "컨센서스", "밸류에이션", "PER", "PBR", "ROE", "부채비율", "배당수익률", "배당락", "목표주가", "공시", "유상증자", "전환사채", "자사주 매입"]],
  ["📊 차트", ["200일선", "RSI", "52주 고점"]],
  ["🛡️ 투자 방법·계좌", ["분산투자", "자산배분", "분할 매수", "적립식", "리밸런싱", "손절", "물타기", "섹터 로테이션", "복리", "ETF", "총보수", "커버드콜", "레버리지", "ISA", "연금저축", "IRP", "백테스트"]],
];
const term = (t, label) => (TERMS[t] ? `${label ?? esc(t)}<button type="button" class="q" data-term="${esc(t)}" aria-label="${esc(t)} 뜻">?</button>` : (label ?? esc(t)));

function money(m, x) {
  if (x == null) return "-";
  return m === "kr" ? `${Math.round(x).toLocaleString("ko-KR")}원`
    : `${x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}달러`;
}
function price(m, x) {
  if (x == null) return "-";
  return m === "kr" ? `${Math.round(x).toLocaleString("ko-KR")}원`
    : `${x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}달러`;
}
function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return "-";
  const v = Math.round(x * 10 ** (digits + 2)) / 10 ** (digits + 2);
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}
const sign = (x) => (x > 0.00005 ? "up" : x < -0.00005 ? "down" : "");
const num = (x) => (x == null ? "-" : Math.round(x).toLocaleString("ko-KR"));
const px = (m, x) => (x == null ? "-" : m === "kr" ? num(x)
  : x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const md = (d) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");
const shares = (q) => (Number.isInteger(q) ? `${q}주` : `${q.toFixed(3)}주`);
let siteVersion = null;  // 이 화면을 연 뒤 처음 받은 data.json의 화면 버전

// 장중 뉴스: news 워크플로가 30분마다 live 브랜치에 올리는 news.json (앱 배포와 따로라서 data.json보다 자주 바뀌어요)
let NEWS = null;
function loadNews(url) {
  if (!url) return Promise.resolve(null);
  return fetch(`${url}?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
    .then((x) => { if (x && x.updated) { NEWS = x; stashHot(x); } return x; }).catch(() => null);
}
// 🔥 핫 뉴스는 읽기(기사 누르기) 전까지 이 폰에 따로 남겨 둬요 (사용자 2026-10-24 "핫 뉴스는 따로, 읽기 전까지").
// 서버는 7일까지만 갖고 있어서, 받은 핫 뉴스를 시장별로 여기 모아 둬요. 30일 넘은 건 정리해요.
// 읽은 것도 바로 지우지 않고 '읽은 핫 뉴스' 접힌 칸에 7일 남겨서 다시 '안 읽음'으로 돌릴 수 있어요
// (사용자 2026-10-24 "모두 읽음 잘못 눌렀는데 다 날아갔네")
const HOT_KEEP_DAYS = 30, HOT_MAX = 40, HOT_READ_DAYS = 7;
let HOT = { kr: [], us: [] };
try { const h = JSON.parse(localStorage.getItem("hot_news") || "{}"); for (const m of ["kr", "us"]) if (Array.isArray(h[m])) HOT[m] = h[m]; } catch (e) { /* 처음 */ }
let HOT_READ = new Map();  // id → 읽은 시각(ms)
try {
  const r = JSON.parse(localStorage.getItem("hot_read") || "[]");
  // 예전 버전은 id 목록만 남겼어요 → 지금 읽은 걸로 쳐서 '읽은 핫 뉴스' 칸에 7일 보여요 (잘못 눌러 날아간 것 되살리기)
  HOT_READ = new Map(Array.isArray(r) ? r.map((id) => [id, Date.now()]) : Object.entries(r));
} catch (e) { /* 처음 */ }
const hotId = (n) => n.link || n.title;
function saveHot() {
  const cut = Date.now() - HOT_KEEP_DAYS * 864e5;
  for (const [id, t] of HOT_READ) if (t < cut) HOT_READ.delete(id);
  try {
    localStorage.setItem("hot_news", JSON.stringify(HOT));
    localStorage.setItem("hot_read", JSON.stringify(Object.fromEntries(HOT_READ)));
  } catch (e) { /* 이번만 기억 */ }
}
function stashHot(x) {
  const cut = Date.now() - HOT_KEEP_DAYS * 864e5, readCut = Date.now() - HOT_READ_DAYS * 864e5;
  for (const m of ["kr", "us"]) {
    const fresh = ((x.hot || {})[m] || []).filter((n) => n && n.title);
    // 같은 사건은 새로 받은 것으로 바꿔요 (핵심 낱말 2개 이상 겹치면 같은 사건, 서버와 같은 규칙)
    const same = (a, b) => (a.key || []).filter((w) => (b.key || []).includes(w)).length >= 2;
    const old = HOT[m].filter((o) => !fresh.some((n) => hotId(n) === hotId(o) || same(n, o)));
    HOT[m] = [...fresh, ...old].filter((n) => Date.parse(n.at || n.since) > cut && !(HOT_READ.get(hotId(n)) < readCut)).slice(0, HOT_MAX);
  }
  saveHot();
}
const hotOf = (m) => HOT[m].filter((n) => !HOT_READ.has(hotId(n)));
const hotReadOf = (m) => HOT[m].filter((n) => HOT_READ.has(hotId(n))).sort((a, b) => HOT_READ.get(hotId(b)) - HOT_READ.get(hotId(a)));
let hotUndo = null;  // 방금 읽음 처리한 id들 (되돌리기)
let hotReadOpen = false;  // '읽은 핫 뉴스' 칸을 펼쳤는지 (다시 그려도 그대로)
// 핫 뉴스 칸 전체 접기 (사용자 2026-10-25 "핫 이슈 접기 기능 넣어줘"). 고른 설정이라 이 폰에 기억하고, 아래 메뉴를 눌러도 그대로예요
let hotFold = false;
try { hotFold = localStorage.getItem("hot_fold") === "1"; } catch (e) { /* 처음 */ }
function readHot(ids, undo) {
  const now = Date.now();
  ids.forEach((id) => HOT_READ.set(id, now));
  saveHot();
  if (undo) undoBar(ids);
}
function unreadHot(ids) { ids.forEach((id) => HOT_READ.delete(id)); saveHot(); }
// 화면 아래에 잠깐 뜨는 '되돌리기' 줄 (화면 위에 떠서 칸 위치는 안 바뀌어요)
function undoBar(ids) {
  let bar = $(".undo-bar");
  if (!bar) { bar = document.createElement("div"); bar.className = "undo-bar"; bar.setAttribute("role", "status"); document.body.appendChild(bar); }
  hotUndo = ids;
  bar.innerHTML = `<span>핫 뉴스 ${ids.length}건 읽음</span><button type="button">되돌리기</button>`;
  bar.querySelector("button").addEventListener("click", () => {
    if (hotUndo) unreadHot(hotUndo);
    hotUndo = null; bar.remove(); render();
  });
  clearTimeout(undoBar.t);
  undoBar.t = setTimeout(() => { hotUndo = null; bar.remove(); }, 6000);
}

async function load() {
  let data;
  let news = null;
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    // 뉴스는 잠깐만 기다려요. 늦으면 화면을 먼저 그리고, 받은 뉴스는 다음에 그릴 때 보여요 (화면이 튀지 않게)
    news = loadNews(data.news_url);
    await Promise.race([news, new Promise((ok) => setTimeout(ok, 2500))]);
  } catch (e) {
    if (DATA) return;  // 이미 화면이 있으면 그대로 둬요
    $("#app").innerHTML = `<div class="card"><p class="empty">데이터를 못 불러왔어요. 인터넷 연결을 확인하고 다시 열어 주세요.</p></div>`;
    return;
  }
  // 앱을 열어 둔 사이에 새 화면이 배포됐으면 한 번 새로고침해서 새 화면으로 바꿔요.
  if (siteVersion && data.site_version && data.site_version !== siteVersion) {
    location.reload();
    return;
  }
  siteVersion = siteVersion || data.site_version || null;
  if (DATA && DATA.built !== data.built) { STOCK_DATA.clear(); STOCK_READY.clear(); INBOX = null; inboxLoading = null; }  // 새로 배포됐으면 종목 자료도 새로
  DATA = data;
  adoptExtras();
  $("#updated").textContent = `화면 데이터 갱신: ${DATA.built.replace("T", " ").slice(0, 16)} (한국시간)`;
  const had = NEWS && NEWS.updated;
  render();
  news.then(() => { if (NEWS && NEWS.updated !== had) paintNews(); });
}
// 늦게 도착한 뉴스: 홈 '더 보기'의 지금 뉴스 한 줄만 바꿔요 (칸 화면은 다음에 그릴 때. 보던 화면이 튀지 않게)
function paintNews() {
  if (screen !== "home" || !DATA) return;
  const row = homeMoreRows(DATA.markets[market]).find((r) => r.key === "news");
  const sum = document.querySelector('[data-more="news"] .hm-s');
  if (row && sum) sum.innerHTML = row.sum;
}

function selectMarket(m) {
  market = m;
  try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ }
  if (screen === "stock") screen = stockFrom;  // 종목 화면은 그 시장 종목이라, 시장을 바꾸면 보던 목록 화면으로
  history.replaceState(history.state, "", hashFor());
  if (DATA) motion = "swap";
  render();
}

// 기록(history) 층: 홈 = 0층, 홈에서 다른 화면으로 가면 1층, 종목 화면은 한 층 더 쌓아요. 화면끼리는 바꿔치기.
// 그래서 폰의 뒤로 가기를 누르면 종목 → 보던 화면 → 홈 순서로 돌아오고, 앱이 바로 꺼지지 않아요.
// (예전 버전이 남긴 기록 {screen}은 1층으로 쳐요)
const depth = () => { const st = history.state; return st ? (st.depth ?? (st.screen ? 1 : 0)) : 0; };
function go(s, fromBack) {
  if (!SCREENS.includes(s) || (s === "stock" && !stockCode) || (s === "more" && !moreKey)) s = "home";
  const prev = screen;
  if (!fromBack) {
    if (s === "search" && screen === "search") { const i = $("#search-input"); if (i) i.focus(); return; }
    if (s === screen && s !== "stock") { window.scrollTo(0, 0); return; }  // 지금 화면 버튼을 또 누르면 맨 위로
    if (s === "home" && depth() > 0) { history.go(-depth()); return; }
    if (LAYERS.includes(s)) {
      if (!LAYERS.includes(screen)) stockFrom = screen;
      screen = s;
      history.pushState({ depth: depth() + 1 }, "", hashFor());
    } else {
      const push = screen === "home";
      screen = s;
      if (push) history.pushState({ depth: 1 }, "", hashFor());
      else history.replaceState(history.state, "", hashFor());
    }
  } else {
    screen = s;
    history.replaceState(history.state, "", hashFor());
  }
  // 종목·검색은 옆에서 밀려 들어오고, 뒤로 가면 반대쪽에서 돌아와요. 아래 버튼으로 바꾸면 살짝 떠오르기.
  if (DATA) motion = fromBack ? (LAYERS.includes(prev) ? "pop" : "fade") : LAYERS.includes(screen) ? "push" : "fade";
  window.scrollTo(0, 0);
  render();
  // 더 보기 칸에서 뒤로 오면 홈의 '더 보기' 보던 자리로
  if (fromBack && prev === "more" && screen === "home" && moreFromY) window.scrollTo(0, moreFromY);
}

// 홈 '더 보기' 줄을 누르면 그 칸만 있는 화면으로 넘어가요 (사용자 2026-10-24: 펼치지 말고 다른 화면으로)
function openMore(key) {
  if (screen === "more") {  // 더 보기 칸 안에서 다른 칸으로 (정책 → 업종): 같은 층에서 바꿔치기
    moreKey = key;
    history.replaceState(history.state, "", hashFor());
    lastView = "";
    window.scrollTo(0, 0);
    render();
    return;
  }
  moreKey = key;
  if (screen === "home") moreFromY = window.scrollY;
  go("more");
}

function openStock(code) {
  if (code !== stockCode) alertOpen = false;
  stockCode = code;
  go("stock");
}
// 종목·검색 화면의 ‹ 뒤로: 쌓인 기록이 있으면 폰 뒤로 가기와 같고, 주소로 바로 열었으면 아래 깔린 화면으로
function back() {
  if (depth() > 0) history.back();
  else go(LAYERS.includes(stockFrom) ? "watch" : stockFrom, true);
}

// ---------------------------------------------------------------- 움직임 (화면 전환, 숫자 올라가기, 새 신호 반짝임)
// 폰 설정에서 '동작 줄이기'(prefers-reduced-motion)를 켰으면 전부 꺼요.
const calm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// 선 그래프 그리기 (사용자 2026-10-25 "버튼 눌러서 그래프 바뀔 때마다 그려지는 모습, 속도는 산업지도랑 똑같이"):
// 버튼을 누르고 바로 그린 선 그래프는 선이 왼쪽에서 오른쪽으로 그려져요. 산업 지도 별자리 선과 같은 속도
// (625ms + 선 길이 1px당 2ms)·움직임(cubic-bezier(.35,.1,.25,1))이고, 끝 점·금액 딱지는 선이 85% 왔을 때 켜져요.
// 밀기·확대·화면 크기 바뀜·자료 받아서 다시 그릴 때는 그대로예요. 아래 메뉴로 화면만 옮길 때도 그대로.
let drawTap = 0;
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button, label, summary, [role=button], [data-sym]");
  if (t && !t.closest(".nav")) drawTap = performance.now();
}, true);
// 이 칸(el)이 방금 누른 버튼 때문에 다시 그려지는 거면 true (한 번 누를 때 한 번만)
function drawSoon(el) {
  if (!el || calm() || !drawTap || performance.now() - drawTap > 1500 || el._drawTap === drawTap) return false;
  el._drawTap = drawTap;
  return true;
}
const drawEase = (() => {  // cubic-bezier(.35,.1,.25,1)
  const [x1, y1, x2, y2] = [0.35, 0.1, 0.25, 1];
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => { let lo = 0, hi = 1, t = x; for (let k = 0; k < 20; k++) { t = (lo + hi) / 2; if (bz(t, x1, x2) < x) lo = t; else hi = t; } return bz(t, y1, y2); };
})();
// svg 안 sel 선들을 x0부터 w 폭만큼 왼쪽에서 오른쪽으로 드러내요. late는 다 그려질 때쯤 켜지는 것(끝 점·딱지).
// px는 화면에서 선 길이 (viewBox를 늘려 그리는 그래프는 화면 폭)
function drawIn(svg, { x0 = 0, w, sel, late = "", px = w }) {
  if (!svg) return;
  const lines = svg.querySelectorAll(sel);
  if (!lines.length) return;
  const ns = "http://www.w3.org/2000/svg", id = `dw${Math.random().toString(36).slice(2, 8)}`;
  const cp = document.createElementNS(ns, "clipPath"), r = document.createElementNS(ns, "rect");
  cp.id = id; cp.setAttribute("clipPathUnits", "userSpaceOnUse");
  const vb = svg.viewBox.baseVal, H = (vb && vb.height) || 1000;
  r.setAttribute("x", x0 - 4); r.setAttribute("y", -H); r.setAttribute("height", H * 3); r.setAttribute("width", 0);
  cp.appendChild(r);
  let defs = svg.querySelector("defs");
  if (!defs) { defs = document.createElementNS(ns, "defs"); svg.prepend(defs); }
  defs.appendChild(cp);
  lines.forEach((l) => l.setAttribute("clip-path", `url(#${id})`));
  svg.classList.add("drawing");
  const dur = 625 + px * 2, t0 = performance.now();
  const lateEls = late ? [...svg.querySelectorAll(late)] : [];
  lateEls.forEach((e) => e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 625, delay: dur * 0.85, easing: "ease-out", fill: "backwards" }));
  const step = (now) => {
    if (!svg.isConnected) return;
    const f = Math.min(1, (now - t0) / dur);
    r.setAttribute("width", (w + 8) * drawEase(f));
    if (f < 1) requestAnimationFrame(step);
    else { lines.forEach((l) => l.removeAttribute("clip-path")); cp.remove(); svg.classList.remove("drawing"); }
  };
  requestAnimationFrame(step);
}
// 다음 render()에서 쓸 화면 전환: rise(앱을 열 때 카드가 차례로), fade(아래 버튼), push(종목·검색 열기),
// pop(뒤로), swap(국장·미장 바꾸기). 별표·지표 버튼처럼 같은 화면을 다시 그릴 때는 비어 있어서 안 움직여요.
let motion = "rise";
const FX = ["fx-rise", "fx-fade", "fx-push", "fx-pop", "fx-swap"];
let fxTimer = 0;
function playMotion(app) {
  const kind = motion;
  motion = null;
  if (!kind || calm()) return;
  app.classList.add(`fx-${kind}`);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => app.classList.remove(...FX), 900);
  countUp(app);
}

// 숫자 올라가기: 0에서 최종 숫자까지 0.7초 (처음엔 빠르게, 끝에서 천천히). 화면을 열 때 보이는 숫자만 해요.
const CNT = {
  money: (v) => money(market, v), price: (v) => price(market, v), num: (v) => num(v),
  pct: (v) => pct(v), pct2: (v) => pct(v, 2),
};
const cnt = (v, f, text) => (v == null || !Number.isFinite(v) ? text : `<span class="cnt" data-v="${v}" data-f="${f}">${text}</span>`);
function countUp(root) {
  const items = [...root.querySelectorAll(".cnt")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }).map((el) => ({ el, to: Number(el.dataset.v), f: CNT[el.dataset.f], end: el.textContent }));
  if (!items.length) return;
  let done = false;
  const finish = () => { done = true; items.forEach((x) => { x.el.textContent = x.end; }); };
  const t0 = performance.now(), dur = 700;
  const step = (now) => {
    if (done) return;
    const t = (now - t0) / dur;
    if (t >= 1) { finish(); return; }
    const k = 1 - (1 - Math.max(0, t)) ** 3;
    items.forEach((x) => { x.el.textContent = x.f(x.to * k); });
    requestAnimationFrame(step);
  };
  items.forEach((x) => { x.el.textContent = x.f(0); });
  requestAnimationFrame(step);
  setTimeout(finish, dur + 400);  // 화면이 가려져 그리기가 멈춰도 최종 숫자는 꼭 보여요
}

const VIEWS = {
  // 홈 맨 위는 큰 발표·지수 급변 강조 칸(있을 때만), 그 아래는 세계 지수 → 더 보기 → 오늘의 리포트 요약.
  // 나머지(급락 점검 포함)는 '더 보기' 칸에 한 줄씩 접어 둬요. 매매 신호·가상계좌는 없앴어요 (사용자 2026-10-24)
  // 맨 위 얇은 지수 바는 세계 지수가 돌아가며 보이고, 누르면 세계 지수 화면(한 겹 위)이 열려요 (사용자 2026-10-24)
  home: (d) => [worldTicker(), bigEventsCard(), marketStatusCard(), worldHomeCard(), homeMoreCard(d), homeReportCard()],
  report: (d) => [rpTabsBar(), ...(rpTabNow() === "week" ? weeklyCards() : reportCards(d))],
  watch: (d) => [watchCard(d), screenerCard(d), allStocksCard(d)],
  // 도구: 맨 위 가로로 미는 선택 바에서 고른 묶음 하나만 아래에 보여요 (사용자가 정함, 2026-10-17). 묶음은 PERF_TABS
  tools: (d) => [perfTabsBar(d), ...perfTab(d).cards(d)],
  chart: (d) => [trendCard(d) || `<section class="card"><p class="empty">아직 지수 기록이 없어요.</p></section>`, compareCard(d)],
  stock: (d) => [stockHeadCard(d), checkCard(d), discloseStockCard(d), stockSectorCard(d), stockChartCard(),
    market === "kr" ? `<section class="card" id="flow-card"><h2>외국인·기관 수급</h2><p class="muted">불러오는 중이에요…</p></section>` : "",
    `<section class="card" id="fund-card"><h2>재무제표</h2><p class="muted">불러오는 중이에요…</p></section>`],
  search: () => [searchCard(), `<div id="search-results" class="stack">${searchResults()}</div>`, glossaryCard()],
  map: () => [mapCard(), `<div id="map-detail" class="stack">${mapDetailCard()}</div>`],
  inbox: () => [inboxHeadCard(), briefCard(), inboxCard()],
  world: () => [worldCard()],
  more: (d) => moreView(d),
};

let lastView = "", holdH = 0;
// 누른 버튼이 다시 그린 뒤에도 화면의 같은 높이에 있게 맞춰요 (위 칸 높이가 바뀌어도, 차트가 늦게 그려져도)
let lastTap = null;
const tapSig = (el) => {
  const data = el.getAttributeNames().filter((a) => a.startsWith("data-")).map((a) => `${a}=${el.getAttribute(a)}`).join("&");
  return `${el.tagName}|${data || (el.textContent || "").trim().slice(0, 40)}`;
};
// 같은 표시의 버튼이 여럿이면(예: '자세히') 몇 번째였는지로 찾아요.
// 같은 버튼이 다른 칸에도 있으면(예: 관심 화면 ★가 내 관심종목·전체 종목 두 곳) 누른 칸(id가 있는 가장 가까운 칸) 안에서만 찾아요.
// 안 그러면 ★를 넣는 순간 위 칸에 생긴 같은 ★ 자리로 화면이 올라가요 (사용자 2026-10-24)
const tapBox = (el) => { const b = el.parentElement && el.parentElement.closest("#app [id]"); return b ? b.id : ""; };
const tapAll = (sig, box) => {
  const root = (box && document.getElementById(box)) || $("#app");
  return root ? [...root.querySelectorAll(sig.split("|")[0])].filter((x) => tapSig(x) === sig) : [];
};
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("#app button, #app summary, #app li, #app [role=button]");
  if (!el) { lastTap = null; return; }
  const sig = tapSig(el), box = tapBox(el);
  lastTap = { sig, box, idx: tapAll(sig, box).indexOf(el), top: el.getBoundingClientRect().top, at: performance.now() };
}, true);
function keepTap() {
  const t = lastTap;
  if (!t || performance.now() - t.at > 1000) return;
  lastTap = null;
  const fix = () => {
    const el = tapAll(t.sig, t.box)[t.idx];
    if (el) { const dy = el.getBoundingClientRect().top - t.top; if (Math.abs(dy) > 1) window.scrollBy(0, dy); }
  };
  fix();
  requestAnimationFrame(fix);
  setTimeout(fix, 250);
}
// 페이지 아래쪽에서 칸이 줄면(접기, ★ 빼기, 다시 그리기) 브라우저가 화면을 끌어올려요. 그래서 높이를 붙잡아 두고,
// 1.5초 뒤부터는 보던 화면 아래에 빈칸이 안 보일 때(위로 올려 볼 때) 놓아요 (사용자 2026-10-24 '화면 돌아가지 않게')
let holdReady = false;
function holdHeight() {
  const app = $("#app");
  if (!app) return;
  app.style.minHeight = `${Math.max(app.offsetHeight, parseFloat(app.style.minHeight) || 0)}px`;
  holdReady = false;
  clearTimeout(holdH);
  holdH = setTimeout(() => { holdReady = true; releaseHold(); }, 1500);
}
function releaseHold() {
  const app = $("#app");
  if (!holdReady || !app || !app.style.minHeight) return;
  const last = app.lastElementChild;
  if (!last || last.getBoundingClientRect().bottom >= window.innerHeight) { app.style.minHeight = ""; holdReady = false; }
}
window.addEventListener("scroll", releaseHold, { passive: true });
// 펼친 칸(details)을 접기 직전에 높이를 붙잡아요
document.addEventListener("click", (e) => {
  const sum = e.target.closest && e.target.closest("#app summary");
  if (sum && sum.parentElement && sum.parentElement.open) holdHeight();
}, true);
// 가로로 미는 버튼 줄(차트 지수·도구·세계 지수 묶음·달 버튼): 다시 그려도 밀어 둔 가로 위치 그대로예요.
// 처음 열 때만 고른 버튼을 가운데로, 화면 끝에 반쯤 걸친 버튼을 누르면 그만큼만 부드럽게 밀어 보여 줘요 (사용자 2026-10-24 '화면이 확확 바뀌니 눈이 아파')
const ROW_X = {};
function keepRow(row, key) {
  if (!row) return;
  const on = row.querySelector('[aria-pressed="true"], .on');
  const rel = (b) => b.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
  if (ROW_X[key] != null) row.scrollLeft = ROW_X[key];
  else if (on) row.scrollLeft = Math.max(0, rel(on) - (row.clientWidth - on.offsetWidth) / 2);
  ROW_X[key] = row.scrollLeft;
  row.addEventListener("scroll", () => { ROW_X[key] = row.scrollLeft; }, { passive: true });
  if (!on) return;
  const l = rel(on) - row.scrollLeft, r = l + on.offsetWidth, pad = 12;
  const dx = l < 0 ? l - pad : r > row.clientWidth ? r - row.clientWidth + pad : 0;
  if (dx) row.scrollBy({ left: dx, behavior: calm() ? "auto" : "smooth" });
}
function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.market === market)));
  const sb = $(".search-btn");
  if (sb) { if (screen === "search") sb.setAttribute("aria-current", "page"); else sb.removeAttribute("aria-current"); }
  const mb = $(".map-btn");
  if (mb) { if (screen === "map") mb.setAttribute("aria-current", "page"); else mb.removeAttribute("aria-current"); }
  inboxDot();
  const lit = LAYERS.includes(screen) ? stockFrom : screen;
  document.querySelectorAll(".nav button").forEach((b) => {
    if (b.dataset.screen === lit) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (!DATA) return;
  const d = DATA.markets[market];
  const app = $("#app");
  app.classList.remove(...FX);
  // 같은 화면을 다시 그릴 땐(버튼·칩·탭을 눌러서) 보던 위치 그대로예요. 화면을 바꾸면 go()가 맨 위로 올려요 (사용자 규칙 2026-10-17)
  const view = `${screen}|${market}|${stockCode}`, keepAt = view === lastView ? window.scrollY : null;
  lastView = view;
  // 다시 그리는 동안 차트·재무제표가 잠깐 비어 화면이 짧아지면 위치가 밀려요. 그동안만 높이를 붙잡아 둬요
  if (keepAt != null) holdHeight();
  else { clearTimeout(holdH); app.style.minHeight = ""; holdReady = false; }  // 다른 화면은 붙잡은 높이 없이
  app.innerHTML = VIEWS[screen](d).join("");
  if (keepAt != null) { window.scrollTo(0, keepAt); keepTap(); }
  app.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.learnSet) learnTab = b.dataset.learnSet;  // 검색 화면 용어 사전 → 투자 공부 용어집
    openMore(b.dataset.more);
  }));
  // 핫 뉴스: 기사를 누르면 읽음 (화면은 그대로, 연하게만 — 다음에 그릴 때 빠져요). '읽음'·'모두 읽음'은 바로 빼요
  app.querySelectorAll("[data-hot-read]").forEach((a) => a.addEventListener("click", () => {
    readHot([a.dataset.hotRead]);
    const li = a.closest("li");
    if (li) li.classList.add("read");
  }));
  app.querySelectorAll("[data-hot-ok]").forEach((b) => b.addEventListener("click", () => { readHot([b.dataset.hotOk], true); holdHeight(); render(); }));
  // 접기·펼치기는 제목 아래만 바뀌어서 다시 그리지 않아요 (누른 제목 줄은 제자리)
  app.querySelectorAll("[data-hot-fold]").forEach((b) => b.addEventListener("click", () => {
    hotFold = !hotFold;
    if (hotFold) holdHeight();  // 접기 전에 높이를 붙잡아요 (짧은 화면에서 접으면 스크롤이 위로 당겨져서)
    try { localStorage.setItem("hot_fold", hotFold ? "1" : "0"); } catch (e) { /* 이번만 기억 */ }
    const card = b.closest(".hot-card");
    card.classList.toggle("folded", hotFold);
    b.setAttribute("aria-expanded", String(!hotFold));
  }));
  app.querySelectorAll(".hot-read-list").forEach((x) => x.addEventListener("toggle", () => { hotReadOpen = x.open; }));
  app.querySelectorAll("[data-hot-undo]").forEach((b) => b.addEventListener("click", () => { unreadHot([b.dataset.hotUndo]); holdHeight(); render(); }));
  // 모두 읽음: 실수로 누르지 않게 한 번 누르면 '한 번 더 누르면 모두 읽음'으로 바뀌고, 3초 안에 다시 눌러야 돼요
  app.querySelectorAll("[data-hot-all]").forEach((b) => b.addEventListener("click", () => {
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      const t = b.querySelector(".hot-all-t");
      t.textContent = "한 번 더 누르면 모두 읽음";
      setTimeout(() => { b.classList.remove("armed"); t.textContent = "모두 읽음"; }, 3000);
      return;
    }
    readHot(hotOf(market).map(hotId), true); holdHeight(); render();
  }));
  foldNotes(app);  // 설명 글씨는 바로 접어요. 나중에 접히면 위 칸이 줄어 화면이 밀려요 (업종 버튼 누를 때 튀던 이유)
  app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  app.querySelectorAll("[data-rp-week]").forEach((b) => b.addEventListener("click", () => { rpTab = "week"; go("report"); }));
  if (screen === "report") bindRpTabs();
  app.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
  if (screen === "tools") {
    keepRow($(".perf-tabs", app), "tools");
    app.querySelectorAll("[data-perf-tab]").forEach((b) => b.addEventListener("click", () => {
      perfTabKey = b.dataset.perfTab;
      try { localStorage.setItem("tools_tab", perfTabKey); } catch (e) { /* 이번만 기억 */ }
      render();
    }));
    bindSavings(); bindStress(d); bindGoal(); bindRetCal(d); bindLab();
    if (!RET[market]) loadReturns().then(() => { if (screen === "tools") { const c = $("#stress-card"); if (c) { c.outerHTML = stressCard(d); bindStress(d); } } });
  }
  app.querySelectorAll("[data-tags]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const card = $("#stock-sector");
    if (card) { card.scrollIntoView({ behavior: calm() ? "auto" : "smooth" }); }
  }));
  app.querySelectorAll("[data-sector-go]").forEach((b) => b.addEventListener("click", () => {
    SECTOR[market] = b.dataset.sectorGo;
    try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
    lastTap = null;  // '화면 그대로' 규칙의 예외: 정책의 호재·악재는 누르면 업종 칸으로 이동해요 (사용자 2026-10-18)
    openMore("sectors");
  }));
  app.querySelectorAll("[data-sector]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    pickSector(b.dataset.sector);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-pol-r]").forEach((b) => b.addEventListener("click", () => {
    polR = b.dataset.polR;
    try { localStorage.setItem("pol_r", polR); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const pm = $("#pol-more");
  if (pm) pm.addEventListener("toggle", () => { polMore = pm.open; });
  app.querySelectorAll("details[data-pol]").forEach((x) => x.addEventListener("toggle", () => {
    if (x.open) POL_OPEN.add(x.dataset.pol); else POL_OPEN.delete(x.dataset.pol);
  }));
  app.querySelectorAll("[data-pol-go]").forEach((b) => b.addEventListener("click", () => {
    polJump = b.dataset.polGo;  // 홈이 다시 그려지면 그 정책을 펼쳐서 보여 줘요
    POL_OPEN.add(polJump);
    polR = "";
    lastTap = null;  // 이것도 이동하는 버튼이라 '화면 그대로'에서 빼요
    openMore("policy");
  }));
  if (screen === "more" && polJump) {
    const x = app.querySelector(`details[data-pol="${CSS.escape(polJump)}"]`);
    polJump = null;
    if (x) requestAnimationFrame(() => { x.scrollIntoView(); window.scrollBy(0, -70); });
  }
  app.querySelectorAll("[data-ecday]").forEach((b) => b.addEventListener("click", () => {
    econPick = econPick === b.dataset.ecday ? null : b.dataset.ecday;
    renderEcon();
  }));
  pinEcon();
  const ecBar = app.querySelector(".ec-months");
  if (ecBar) {
    keepRow(ecBar, "ec");  // 달 버튼 줄 (화면 세로 위치는 안 건드려요)
  }
  app.querySelectorAll("[data-ecm]").forEach((b) => b.addEventListener("click", () => { econMonth = b.dataset.ecm; econPick = null; renderEcon(); }));
  app.querySelectorAll("[data-ecstep]").forEach((b) => b.addEventListener("click", () => {
    econMonth = ymAdd(econMonth, Number(b.dataset.ecstep)); econPick = null; renderEcon();
  }));
  app.querySelectorAll("[data-cal-all]").forEach((b) => b.addEventListener("click", () => {
    calAll = !calAll;
    // 펼칠 땐 보던 화면 그대로 두고 아래로 줄이 늘어나요 (버튼을 따라가면 32줄 아래 끝으로 내려가 버려요)
    if (calAll) lastTap = null;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-heat]").forEach((b) => b.addEventListener("click", () => {
    heatP = b.dataset.heat;
    try { localStorage.setItem("heat_p", heatP); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  app.querySelectorAll("[data-world-p]").forEach((b) => b.addEventListener("click", () => {
    worldP = b.dataset.worldP;
    try { localStorage.setItem("world_p", worldP); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const keepY = (f) => () => { const y = window.scrollY; f(); render(); window.scrollTo(0, y); };
  app.querySelectorAll("[data-world]").forEach((b) => b.addEventListener("click", keepY(() => {
    // 맨 위 한국·미국 그래프와 탭 쪽 그래프는 따로 열려요 (한쪽을 눌러도 다른 쪽이 접히지 않게)
    const top = DATA.world.groups.some((g) => WORLD_FIXED.includes(g.name) && g.items.some((r) => `t:${r.sym}` === b.dataset.world));
    if (top) worldTop = worldTop === b.dataset.world ? null : b.dataset.world;
    else if (!worldPicks.delete(b.dataset.world)) worldPicks.add(b.dataset.world);  // 세계 지수 화면은 여러 개 같이 펼쳐도 돼요
  })));
  app.querySelectorAll("[data-world-g]").forEach((b) => b.addEventListener("click", keepY(() => {
    worldG = b.dataset.worldG;
    try { localStorage.setItem("world_g", worldG); } catch (e) { /* 이번만 기억 */ }
  })));
  app.querySelectorAll("[data-world-chart]").forEach((b) => b.addEventListener("click", () => {
    CHART_IDX[market] = b.dataset.worldChart;
    try { localStorage.setItem("chart_idx", JSON.stringify(CHART_IDX)); } catch (e) { /* 이번만 기억 */ }
    go("chart");
  }));
  drawWorldGraph();
  if (screen === "home") spinTicker();
  app.querySelectorAll("[data-world-tab]").forEach((b) => b.addEventListener("click", keepY(() => {
    worldTab = b.dataset.worldTab;
    worldPicks.clear();
    try { localStorage.setItem("world_tab", worldTab); } catch (e) { /* 이번만 기억 */ }
  })));
  // 탭 줄은 옆으로 밀어 둔 자리 그대로 (무엇을 눌러 다시 그려도 '주요' 쪽으로 돌아가지 않게)
  const wtBar = $(".wt-tabs");
  if (wtBar) {
    keepRow(wtBar, "world");
  }
  if (screen === "watch") {
    bindWatch(d);
  }
  if (screen === "more" && moreKey === "drop") bindDrop(d);
  if (screen === "more" && moreKey === "learn") bindLearn();
  if (screen === "stock") bindStock();
  if (screen === "search") bindSearch();
  if (screen === "map") bindMap();
  if (screen === "inbox") bindInbox();
  if (screen !== "search") app.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => openMap(b.dataset.map)));
  bindRows(app, d);
  if (screen === "chart") {
    app.querySelectorAll("[data-idx]").forEach((b) => b.addEventListener("click", () => {
      CHART_IDX[market] = b.dataset.idx;
      if (IDX_READY.get(b.dataset.idx) === null) IDX_READY.delete(b.dataset.idx);  // 못 받았던 지수는 다시 받아 봐요
      try { localStorage.setItem("chart_idx", JSON.stringify(CHART_IDX)); } catch (e) { /* 이번만 기억 */ }
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }));
    keepRow(app.querySelector(".idx-chips"), `chart:${market}`);
    drawTrend(d);
    bindCompare(d);
    app.querySelectorAll(".period button[data-frame]").forEach((b) => b.addEventListener("click", () => {
      frame = b.dataset.frame;
      try { localStorage.setItem("frame", frame); } catch (e) { /* 무시 */ }
      app.querySelectorAll(".period button[data-frame]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawTrend(d, true);
    }));
  }
  app.querySelectorAll(".chips button[data-ind]").forEach((b) => b.addEventListener("click", () => {
    IND[b.dataset.ind] = !IND[b.dataset.ind];
    try { localStorage.setItem("ind", JSON.stringify(IND)); } catch (e) { /* 이번만 기억 */ }
    render();  // 보던 구간·확대는 그대로 두고 지표만 다시 그려요
  }));
  bindMa(app);
  playMotion(app);
}

// 작은 추세선 (축 없이 모양만). 기간 처음보다 오르면 빨강, 내리면 파랑.
// zero: 추천일(0)부터의 수익률이면 0 기준선을 점선으로 그려요. 값은 세로 눈금의 최소 폭(±zero)이라
// 1%도 안 움직인 종목은 거의 평평하게, 그보다 크게 움직이면 그래프 높이를 다 써서 모양이 보여요.
function spark(values, label, zero) {
  const v = (values || []).filter((x) => x != null);
  if (v.length < 2) return "";
  const w = 120, h = 40;
  const lo = zero ? Math.min(...v, -zero) : Math.min(...v), hi = zero ? Math.max(...v, zero) : Math.max(...v);
  const span = hi - lo || 1;
  const y = (x) => (h - 3 - ((x - lo) / span) * (h - 6)).toFixed(1);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${y(x)}`).join(" ");
  const base = zero ? `<line class="base" x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}"/>` : "";
  return `<svg class="spark ${v[v.length - 1] >= v[0] ? "up" : "down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"
    role="img" aria-label="${esc(label)}">${base}<polyline points="${pts}"/></svg>`;
}

const more = (to, label) => `<button type="button" class="more" data-go="${to}">${label}<span aria-hidden="true">›</span></button>`;

// 급락 점검: 기준 지수가 한 주(5거래일)에 5% 넘게 빠졌거나 1년 고점에서 10% 넘게 내려와 있을 때만 홈 '더 보기'에 떠요.
// 지수 전체 기록(indexes/<지수>.json, 차트와 같은 파일)에서 비슷하게 빠졌던 때를 찾아 그 뒤 1개월~1년이 어땠는지 보여 줘요.
// 한 번 찾으면 3개월(63거래일)은 건너뛰어서 같은 하락을 여러 번 세지 않아요. 참고용이에요.
const DROP_AFTER = [[21, "1개월"], [63, "3개월"], [126, "6개월"], [252, "1년"]];
const DROP_GAP = 63;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
function dropNow(d) {
  const sym = OWN_IDX[market];
  const r = ((DATA.world && DATA.world.groups) || []).flatMap((g) => g.items).find((x) => x.sym === sym);
  if (!r || !r.closes || r.closes.length < 6) return null;
  const cl = r.closes, last = cl[cl.length - 1];
  const w1 = last / cl[cl.length - 6] - 1, dd = last / Math.max(...cl.slice(-252)) - 1;
  if (w1 > -0.05 && dd > -0.1) return null;
  return { sym, name: r.name || d.index_name, day: r.day, last, w1, dd, weekly: w1 <= -0.05 };
}
function dropStats(c, now) {
  const cl = c.c, dates = c.dates, n = cl.length;
  // 한 주 낙폭이면 지금의 3/4 넘게 빠진 주, 아니면 1년 고점 대비 지금의 3/4 넘게 내려온 날
  const thr = (now.weekly ? now.w1 : now.dd) * 0.75;
  const hiOf = (i) => { let h = 0; for (let k = Math.max(0, i - 251); k <= i; k++) if (cl[k] > h) h = cl[k]; return h; };
  const hit = now.weekly ? (i) => cl[i - 5] > 0 && cl[i] / cl[i - 5] - 1 <= thr : (i) => cl[i] / hiOf(i) - 1 <= thr;
  const ev = [];
  for (let i = 5; i < n - DROP_GAP; i++) if (cl[i] > 0 && hit(i)) { ev.push(i); i += DROP_GAP - 1; }  // 최근 3개월은 지금 하락이라 빼요
  const after = DROP_AFTER.map(([h, label]) => {
    const r = ev.filter((i) => i + h < n).map((i) => cl[i + h] / cl[i] - 1);
    return { label, n: r.length, med: r.length ? median(r) : null, up: r.length ? r.filter((x) => x > 0).length / r.length : null,
      worst: r.length ? Math.min(...r) : null };
  });
  const lows = ev.map((i) => Math.min(...cl.slice(i + 1, i + 1 + DROP_GAP)) / cl[i] - 1);
  let hiI = Math.max(0, n - 252);
  for (let k = hiI; k < n; k++) if (cl[k] > cl[hiI]) hiI = k;
  return { thr, from: dates[0], years: ev.map((i) => dates[i].slice(0, 4)), after, low: lows.length ? median(lows) : null,
    lowWorst: lows.length ? Math.min(...lows) : null, hiDay: dates[hiI], hi: cl[hiI] };
}
function dropCard(d) {
  const now = dropNow(d);
  if (!now) return "";
  const c = IDX_READY.get(now.sym);
  const head = `<p class="headline">${esc(now.name)} ${now.weekly ? `한 주 ${pct(now.w1)}` : `1년 고점 대비 ${pct(now.dd)}`}</p>`;
  let body;
  if (c === undefined) body = `<p class="muted">과거 비슷한 하락을 찾는 중이에요…</p>`;
  else if (!c || !c.candles) body = `<p class="muted">지수 기록을 못 받았어요. 차트 화면에서 지수를 열어 보세요.</p>`;
  else {
    const s = dropStats(c.candles, now);
    const what = now.weekly ? `한 주에 ${pct(s.thr)} 넘게 빠졌던 때` : `1년 고점에서 ${pct(s.thr)} 넘게 내려왔던 때`;
    const years = [...new Set(s.years)];
    body = `<p class="sub">1년 고점(${s.hiDay.slice(2, 4)}.${md(s.hiDay)} ${num(s.hi)})보다 ${pct(now.dd)}${now.weekly ? "" : ` · 한 주 ${pct(now.w1)}`}</p>
      ${s.years.length ? `<p class="muted" style="margin:10px 0 6px">${s.from.slice(0, 4)}년 이후 ${what} <b>${s.years.length}번</b>
        <small>(${years.join(", ")})</small>. 그 뒤 ${esc(now.name)}는</p>
      <table class="fin"><thead><tr><th></th><th>보통</th><th>오른 비율</th><th>가장 나쁠 때</th></tr></thead><tbody>
        ${s.after.filter((a) => a.n).map((a) => `<tr><th>${a.label} 뒤</th><td class="${sign(a.med)}">${pct(a.med)}</td>
          <td>${Math.round(a.up * 100)}%</td><td class="${sign(a.worst)}">${pct(a.worst)}</td></tr>`).join("")}</tbody></table>
      <p class="muted" style="margin:8px 0 0">그때도 바로 멈추지 않고 3개월 안에 보통 ${pct(s.low)}, 가장 심할 땐 ${pct(s.lowWorst)}까지 더 빠진 날이 있었어요.
        '보통'은 가운데 값이에요.</p>`
        : `<p class="muted" style="margin:10px 0 0">${s.from.slice(0, 4)}년 이후 이만큼 빠진 적이 없어서 비교할 때가 없어요.</p>`}`;
  }
  return `<section class="card" id="drop-card"><h2>급락 점검 <small>${md(now.day)} 종가 · 참고</small></h2>${head}${body}
    <p class="muted note" style="margin:10px 0 0">과거에 비슷하게 빠졌던 뒤 어땠는지 지수 기록으로 센 거예요. 과거가 앞으로를 보장하진 않아요.
      바닥은 지나서야 알 수 있어요.</p></section>`;
}
function bindDrop(d) {
  const now = dropNow(d);
  if (!now || IDX_READY.has(now.sym)) return;
  idxData(now.sym).then(() => {
    const el = $("#drop-card");
    if (el && screen === "more") el.outerHTML = dropCard(d);
  });
}

// ---------------------------------------------------------------- 관심종목

// 종목 한 줄: 이름·코드·3개월 등락, 종가·전일 대비, ★. chart면 3개월 추세선도 (내 관심종목처럼 몇 개 안 될 때)
function stockRow(s, d, { star = true, chart = false, meta: extraMeta = "" } = {}) {
  const badges = [];
  if (s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const on = WATCH[market].includes(s.code);
  // 작은 추세선과 같은 기간(최근 3개월) 등락률이라 선 색과 숫자가 맞아요
  const c3 = s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  const meta = extraMeta || [s.code, c3 == null ? "" : `3개월 ${pct(c3)}`].filter(Boolean).join(" · ");
  return `<li class="stock${chart ? " spark-row" : ""}${star ? "" : " no-star"}" data-stock="${esc(s.code)}">
    <div class="name">${esc(s.name)}${badges.join("")}</div><div class="meta">${esc(meta)}</div>
    ${chart ? `<div class="mini">${spark(s.spark, `${s.name} 최근 3개월`)}</div>` : ""}
    <div class="price">${price(market, s.close)}</div><div class="chg ${sign(s.d1)}">${pct(s.d1, 2)}</div>
    ${star ? `<button type="button" class="star" data-star="${esc(s.code)}" aria-pressed="${on}"
      aria-label="${esc(s.name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button>` : ""}</li>`;
}

// 대시보드 종목: 알림이 보는 대형주 + 텔레그램으로 넣은 종목(extra)
function stocksOf(d) {
  const base = (d.daily && d.daily.stocks) || [];
  const have = new Set(base.map((s) => s.code));
  return base.concat((d.extras || []).filter((e) => !have.has(e.code)).map((e) => ({ ...e, extra: true })));
}

// 전 종목 파일(all_stocks.py, 최근 2년 일봉)로 만든 종목 줄: 대시보드 종목이 아닌 ☆ 종목도 종가·추세선을 보여요.
function liteStock(m, code) {
  const x = STOCK_READY.get(`${m}/${code}`);
  const c = x && x.candles;
  if (!c || !c.c || c.c.length < 2) return null;
  const n = c.c.length;
  return { code, name: x.name || code, day: c.dates[n - 1], close: c.c[n - 1], d1: c.c[n - 2] ? c.c[n - 1] / c.c[n - 2] - 1 : null,
    spark: c.c.slice(-64), lite: true };
}
// 대시보드 종목이 아닌 ☆ 종목은 종목 파일을 한 번씩 받아서 다시 그려요 (못 받은 종목은 다시 안 받아요).
const LITE_TRIED = new Set();
function loadLite(m, codes) {
  const todo = codes.filter((c) => !STOCK_READY.has(`${m}/${c}`) && !LITE_TRIED.has(`${m}/${c}`));
  if (!todo.length) return;
  todo.forEach((c) => LITE_TRIED.add(`${m}/${c}`));
  Promise.all(todo.map((c) => stockData(m, c))).then((got) => {
    if (!got.some(Boolean) || m !== market || !["home", "watch"].includes(screen)) return;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
}
// 내 관심종목(★) 줄: 대시보드 종목은 그 시세로, 나머지 상장 종목은 전 종목 파일로
function myStocks(d) {
  const all = stocksOf(d);
  const out = [], wait = [];
  for (const c of WATCH[market]) {
    // 텔레그램으로 넣은 종목은 stock_pages.py가 시세를 채워요. 그게 실패해 시세가 없으면 전 종목 파일로 보여요.
    const hit = all.find((x) => x.code === c);
    const s = hit && hit.close != null ? hit : liteStock(market, c) || hit;
    if (!s || s.close == null) wait.push(c);
    if (s) out.push(s);
  }
  loadLite(market, wait);
  return out;
}

function watchCard(d) {
  const all = stocksOf(d);
  if (!all.length) {
    return `<section class="card"><h2>관심종목</h2><p class="empty">종목 시세가 아직 없어요. ${NEXT_RUN[market]} 자동 실행 뒤에 생겨요.</p></section>`;
  }
  const mine = myStocks(d);
  return `<section class="card" id="watch-card"><h2>내 관심종목 <small>${mine.length}개 · ${md(all[0].day)} 종가</small></h2>
    ${mine.length ? `<ul class="list">${mine.map((s) => stockRow(s, d, { chart: true })).join("")}</ul>`
      : `<p class="empty">아래 전체 종목에서 ☆를 누르면 여기에 모여요.</p>`}
    <p class="muted note" style="margin:10px 0 0">종목을 누르면 차트와 재무제표가 나와요. ★ 목록은 이 폰 브라우저에만 저장돼요.
      아래 목록에 없는 종목도 위쪽 돋보기(검색)에서 찾아 ☆만 누르면 여기에 들어와요 (국장·미장 상장 종목 전부).</p></section>`;
}

function allStocksCard(d) {
  const all = stocksOf(d);
  if (!all.length) return "";
  const extra = all.filter((s) => s.extra).length, n = all.length - extra;
  const what = (market === "kr" ? `코스피 대형주 ${n}개` : `미국 대형주와 SPY ${n}개`) + (extra ? ` + 추가한 종목 ${extra}개` : "");
  const sorts = [["change", "오늘 등락순"], ["name", "이름순"]].map(([k, label]) =>
    `<button type="button" data-sort="${k}" aria-pressed="${watchSort === k}">${label}</button>`).join("");
  return `<section class="card"><h2>전체 종목 <small>${what}</small></h2>
    <input class="search" type="search" placeholder="이름이나 코드로 찾기" aria-label="종목 찾기" value="${esc(watchQuery)}">
    <div class="period" role="group" aria-label="정렬" style="margin:10px 0 6px">${sorts}</div>
    ${secList(d).length ? sectorChips(secList(d), SECTOR[market]) : ""}
    <ul class="list" id="all-list">${allRows(d)}</ul>
    <button type="button" class="more" data-find>목록에 없는 종목 찾기 (국장·미장 전체)<span aria-hidden="true">›</span></button></section>`;
}

// 조건 검색 (영웅문 조건검색처럼): 고른 조건을 모두 만족하는 종목만. 재무는 매주, 주가 조건은 매일 갱신
const FILTERS = [
  ["ma", "200일선 위", (s) => s.ma200 != null && s.ma200 > 0, (s) => `200일선 ${pct(s.ma200)}`],
  ["near", "52주 고점 -10% 안", (s) => s.hi52 != null && s.hi52 >= -0.1, (s) => `고점 대비 ${pct(s.hi52)}`],
  ["dip", "고점서 -20% 넘게 빠짐", (s) => s.hi52 != null && s.hi52 <= -0.2, (s) => `고점 대비 ${pct(s.hi52)}`],
  ["rsi", "RSI 30 미만", (s) => s.rsi14 != null && s.rsi14 < 30, (s) => `RSI ${Math.round(s.rsi14)}`],
  ["per", "PER 15배 미만", (s, f) => f.per != null && !f.loss && f.per < 15, (s, f) => `PER ${f.per.toFixed(1)}`],
  ["pbr", "PBR 1배 미만", (s, f) => f.pbr != null && f.pbr < 1, (s, f) => `PBR ${f.pbr.toFixed(2)}`],
  ["div", "배당 3% 이상", (s, f) => f.div != null && f.div >= 3, (s, f) => `배당 ${f.div.toFixed(1)}%`],
  ["roe", "ROE 10% 이상", (s, f) => f.roe != null && f.roe >= 0.1, (s, f) => `ROE ${Math.round(f.roe * 100)}%`],
  ["debt", "부채비율 100% 이하", (s, f) => !f.financial && f.debt != null && f.debt <= 100, (s, f) => `부채 ${Math.round(f.debt)}%`],
  ["tgt", "목표가 +20% 이상", (s, f) => !!(f.target && s.close && f.target.mean / s.close - 1 >= 0.2), (s, f) => `목표가 ${pct(f.target.mean / s.close - 1)}`],
  ["grade", "펀더멘탈 등급 75%+", (s, f) => !!(f.grade && f.grade[2] && f.grade[1] / f.grade[2] >= 0.75), (s, f) => `등급 ${f.grade[1]}/${f.grade[2]}`],
];
let FILTER_ON = [];
try { FILTER_ON = JSON.parse(localStorage.getItem("filters") || "[]").filter((k) => FILTERS.some((x) => x[0] === k)); } catch (e) { /* 처음 */ }
// 조건 검색 범위: 대형주(대시보드 종목) 또는 전 종목(all_stocks.py가 매일 만드는 stocks/<시장>/_quotes.json, 주가 조건만)
let scrAll = false;
try { scrAll = localStorage.getItem("scr_all") === "1"; } catch (e) { /* 처음 */ }
const QUOTES = { kr: null, us: null };  // {day, q: {코드: [종가, 전일 대비, 3개월, 200일선 대비, 52주 고점 대비, RSI14]}}
const quoteLoading = {};
function loadQuotes(m) {
  if (!quoteLoading[m]) {
    quoteLoading[m] = fetch(`stocks/${m}/_quotes.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => { QUOTES[m] = x && x.q ? x : { q: {} }; if (!x) quoteLoading[m] = null; });
  }
  return quoteLoading[m];
}
function quoteStocks(m) {
  const q = (QUOTES[m] || {}).q || {};
  const names = new Map((SYM[m] || []).map((e) => [e.row[0], e.row[1]]));
  return Object.entries(q).map(([code, v]) => ({ code, name: names.get(code) || code, day: QUOTES[m].day, close: v[0], d1: v[1],
    c3: v[2], ma200: v[3], hi52: v[4], rsi14: v[5] }));
}

function screenerCard(d) {
  const funds = d.funds || {};
  const big = stocksOf(d).filter((s) => !s.extra);
  if (!big.length) return "";
  const wide = scrAll && QUOTES[market] && Object.keys(QUOTES[market].q).length && SYM[market];
  if (scrAll && !wide) {
    Promise.all([loadQuotes(market), loadSymbols()]).then(() => {
      if (screen === "watch" && Object.keys((QUOTES[market] || { q: {} }).q).length) { const y = window.scrollY; render(); window.scrollTo(0, y); }
    });
  }
  const all = wide ? quoteStocks(market) : big;
  const scope = [["big", `대형주 ${big.length}개`], ["all", "전 종목"]].map(([k, label]) =>
    `<button type="button" data-scope="${k}" aria-pressed="${(k === "all") === scrAll}">${label}</button>`).join("");
  const chips = FILTERS.map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${FILTER_ON.includes(k)}">${label}</button>`).join("");
  const on = FILTERS.filter((x) => FILTER_ON.includes(x[0]));
  let body = `<p class="sub note" style="margin:10px 0 0">조건을 하나 이상 누르면 모두 만족하는 종목만 보여요.</p>`;
  if (scrAll && !wide) {
    body = `<p class="muted" style="margin:10px 0 0">전 종목 시세를 불러오는 중이에요… (처음 한 번은 몇 초 걸려요. 계속 안 뜨면 all-stocks 작업이 아직 안 돈 거예요)</p>`;
  } else if (on.length) {
    const hits = all.filter((s) => on.every(([, , ok]) => ok(s, funds[s.code] || {})));
    hits.sort((a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
    const cap = 50;
    body = `<p class="sub" style="margin:10px 0 4px"><b>${hits.length.toLocaleString("ko-KR")}개</b> / ${all.length.toLocaleString("ko-KR")}개 종목${hits.length > cap ? ` · 오늘 많이 오른 ${cap}개만 보여요` : ""}</p>`
      + (hits.length ? `<ul class="list">${hits.slice(0, cap).map((s) => stockRow(s, d, { meta: on.map(([, , , show]) => show(s, funds[s.code] || {})).join(" · ") })).join("")}</ul>`
        : `<p class="empty">조건을 모두 만족하는 종목이 없어요. 조건을 하나 빼 보세요.</p>`);
  }
  const noPrice = !all.some((s) => s.ma200 != null);
  return `<section class="card" id="screener"><h2>조건 검색 <small>${wide ? `상장 ${all.length.toLocaleString("ko-KR")}종목 중` : `${all.length}개 대형주 중`}</small></h2>
    <div class="period" role="group" aria-label="찾을 범위" style="margin:0 0 10px">${scope}</div>
    <div class="chips">${chips}</div>${body}
    ${scrAll ? `<p class="muted note" style="margin:10px 0 0">전 종목은 주가 조건(200일선·52주 고점·RSI)을 다 봐요. PER·배당 같은 재무 조건은 재무를 받는 대형주만 남아요.</p>` : ""}
    <p class="muted note" style="margin:10px 0 0">뜻이 궁금하면: ${["200일선", "52주 고점", "RSI", "PER", "PBR", "배당수익률", "ROE", "부채비율", "목표주가"].map((t) => term(t)).join(" · ")}</p>
    <p class="muted note" style="margin:6px 0 0">재무 조건은 매주 토요일, 주가 조건은 장 마감 뒤 갱신돼요.${noPrice ? " 200일선·RSI·52주 고점 조건은 다음 장 마감 뒤부터 써요." : ""} 자료가 없는 종목은 빠져요.</p></section>`;
}

// 관심 화면 업종 버튼: 대시보드 종목에 있는 업종만 (업종 지도 paper/sectors.json 기준)
function secList(d) {
  const of = (d.daily && d.daily.sector_of) || {};
  const have = new Set(stocksOf(d).map((s) => of[s.code]).filter(Boolean));
  const order = ((d.daily && d.daily.sectors) || []).map((s) => s.name);
  return order.filter((n) => have.has(n)).concat([...have].filter((n) => !order.includes(n)));
}
function allRows(d) {
  const q = watchQuery.trim().toLowerCase();
  const of = (d.daily && d.daily.sector_of) || {};
  const sec = secList(d).includes(SECTOR[market]) ? SECTOR[market] : "";
  const rows = stocksOf(d).filter((s) => (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    && (!sec || of[s.code] === sec));
  rows.sort(watchSort === "name" ? (a, b) => a.name.localeCompare(b.name, "ko") : (a, b) => (b.d1 ?? -9) - (a.d1 ?? -9));
  if (rows.length) return rows.map((s) => stockRow(s, d)).join("");
  return `<li><p class="empty">${q ? `"${esc(watchQuery)}"에 맞는 종목이 없어요.` : `${esc(sec)} 종목이 없어요.`}</p></li>`;
}

// ★는 관심종목 넣기·빼기, 줄의 나머지를 누르면 그 종목 화면(차트·재무제표)
function bindRows(el, d) {
  el.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    starClicked(d, b);
  }));
  el.querySelectorAll("[data-stock]").forEach((row) => row.addEventListener("click", () => openStock(row.dataset.stock)));
}

function bindWatch(d) {
  document.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => {
    scrAll = b.dataset.scope === "all";
    try { localStorage.setItem("scr_all", scrAll ? "1" : "0"); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.filter;
    FILTER_ON = FILTER_ON.includes(k) ? FILTER_ON.filter((x) => x !== k) : FILTER_ON.concat(k);
    try { localStorage.setItem("filters", JSON.stringify(FILTER_ON)); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const find = $("[data-find]");
  if (find) find.addEventListener("click", () => { searchQuery = watchQuery; go("search"); });
  const input = $(".search");
  if (input) {
    input.addEventListener("input", () => {
      watchQuery = input.value;
      const list = $("#all-list");
      list.innerHTML = allRows(d);
      bindRows(list, d);
    });
  }
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    watchSort = b.dataset.sort;
    try { localStorage.setItem("watchSort", watchSort); } catch (e) { /* 무시 */ }
    document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const list = $("#all-list");
    list.innerHTML = allRows(d);
    bindRows(list, d);
  }));
}

// ★를 누르면 목록을 다시 그려요. 위쪽 관심종목 칸 높이가 바뀌어도 누른 줄이 손가락 아래에 그대로 있게 스크롤을 맞춰요.
function starClicked(d, b) {
  const code = b.dataset.star;
  const inAll = !!b.closest("#all-list");
  const before = b.getBoundingClientRect().top;
  toggleWatch(code);
  render();
  if (screen !== "watch" || !inAll) return;
  const again = [...document.querySelectorAll("#all-list [data-star]")].find((x) => x.dataset.star === code);
  if (again) {
    window.scrollBy(0, again.getBoundingClientRect().top - before);
    again.focus({ preventScroll: true });
  }
}

function homeWatchCard(d) {
  const mine = myStocks(d);
  if (!mine.length) return "";
  return `<section class="card"><h2>관심종목 <small>${md(mine[0].day)} 종가</small></h2>
    <ul class="list">${mine.slice(0, 5).map((s) => stockRow(s, d, { star: false, chart: true })).join("")}</ul>
    ${more("watch", mine.length > 5 ? `관심종목 ${mine.length}개 모두 보기` : "관심종목 보기")}</section>`;
}

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
      try { localStorage.setItem("inbox_y", y.toFixed(4)); } catch (err) { /* 이번만 기억 */ }
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
// 시장팀 → 일정·정책팀 → 업종팀 → 종목팀 → 편집팀. 사고팔기 판단은 안 해요 (사용자 2026-10-24).
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
    ${rpChg(f.d1, 2)} <small class="muted">1달 ${pct(f.m1)}</small>`);
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
  return [head,
    rpSection("🌏", "1. 시장팀", "지수·환율·경기 → 일정·정책팀", facts),
    rpSection("🗓", "2. 일정·정책팀", "7일 일정·업종 점수 → 업종팀", plan),
    rpSection("🏭", "3. 업종팀", `${flag} 5일 흐름과 정책 비교 → 종목팀`, secs),
    rpSection("🔎", "4. 종목팀", `${flag} 볼 업종 안의 종목`, stocks),
    `<section class="card"><p class="muted" style="margin:0">✍️ 5. 편집팀이 위 네 팀 자료를 묶어 맨 위 요약을 만들어요. 공개 자료로 만든 참고용 리포트예요.
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
  if (!DATA.weekly) return "day";
  if (rpTab) return rpTab;
  return weeklyFresh() || !DATA.report ? "week" : "day";
}
function rpTabsBar() {
  if (!DATA.weekly) return "";
  const cur = rpTabNow();
  return `<nav class="chips rp-tabs" aria-label="리포트 고르기">${[["day", "📰 오늘의 리포트"], ["week", "🗞 주간 리포트"]].map(([k, label]) =>
    `<button type="button" data-rp-tab="${k}" aria-pressed="${k === cur}">${label}</button>`).join("")}</nav>`;
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
  // 6. 다음 주: 요일별 묶음 + 종류 표시
  const TAG = { big: ["발표", ""], rate: ["금리", "bad"], expiry: ["만기", ""], earn: ["실적", "good"] };
  const items = [...(nx.big || []).map((e) => ({ d: e.date, k: "big", h: `${e.flag || ""} ${esc(e.title)}`, sub: [e.time, e.forecast ? `예상 ${e.forecast}` : ""].filter(Boolean).join(" · ") })),
    ...(nx.cal || []).map((c) => ({ d: c.date, k: c.kind, h: `${REPORT_FLAG[c.market] || ""} ${esc(c.title)}`, sub: c.note || "" })),
    ...(nx.earn || []).filter((c) => c.market === market).slice(0, 8).map((c) => ({ d: c.date, k: "earn", h: `${esc(c.title.replace(/ 실적 발표$/, ""))}${c.mine ? " ⭐" : ""}`, sub: "" }))];
  const byDay = {};
  items.forEach((x) => (byDay[x.d] = byDay[x.d] || []).push(x));
  const nxCard = `<section class="card"><h2>🗓 다음 주 일정 <small>${nx.start ? `${wkDay(nx.start)}~${wkDay(nx.end)}` : ""}</small></h2>
    ${items.length ? Object.keys(byDay).sort().map((d) => `<div class="wk-dayg"><p class="wk-dh">${wkDay(d)}</p><ul>${byDay[d].map((x) =>
      `<li><span class="badge ${TAG[x.k] ? TAG[x.k][1] : ""}">${TAG[x.k] ? TAG[x.k][0] : "일정"}</span><div>${x.h}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</div></li>`).join("")}</ul></div>`).join("")
    : `<p class="empty">아직 잡힌 큰 일정 없음</p>`}</section>`;
  return [head, secCard, evCard, nxCard, restCard,
    `<section class="card"><p class="muted" style="margin:0">토요일 아침에 한 주를 묶어 텔레그램으로도 보내요. 공개 자료로 만든 참고용이고 사고팔기 판단은 안 해요.
      위 국장·미장 탭으로 업종을 바꿔 봐요.</p></section>`];
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
    try { localStorage.setItem("inbox_seen", last); } catch (e) { /* 이번만 */ }
    setTimeout(() => { inboxSeen = last; inboxDot(); }, 0);
  }
}

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
    if (m !== market) { market = m; try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ } }
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
    if (m !== market) { market = m; try { localStorage.setItem("market", m); } catch (e) { /* 무시 */ } }
    SECTOR[m] = name;
    try { localStorage.setItem("sector", JSON.stringify(SECTOR)); } catch (e) { /* 이번만 기억 */ }
    openMore("sectors");
  }));
}

// ---------------------------------------------------------------- 산업 지도 (industry_map.py → industry.json)
// 산업 44개를 점으로, 서로 이어진 산업을 선으로. 산업을 누르면 그 산업이 가운데로 오고 연결된 산업만 둘레에 모여요.
let IMAP = null;  // { groups, kinds, nodes, links, flows?, corr?, hidden?, day? }
let imapLoading = null;
let mapFocus = mapStart;
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

// 지도에서 거쳐 온 산업들. 빈 곳을 누르면 하나씩 되돌아가고, 다 되돌아가면 전체 보기예요
let mapTrail = [];
const MAP_SUB_ALL = "산업을 누르거나 두 손가락으로 벌리면 이어진 산업만 선으로 모아 보여 줘요.";
const MAP_SUB_FOCUS = "가운데 산업에 이어진 산업만 모았어요. 둘레 산업을 누르거나 벌리면 그 산업으로, 빈 곳을 누르거나 오므리면 이전으로 가요.";
const MAP_SUB_SPOT_ALL = "산업을 누르면 제자리에서 이어진 산업과 선만 밝게 보여 줘요. 나머지는 흐려져요.";
const MAP_SUB_SPOT_FOCUS = "누른 산업과 이어진 산업만 밝혔어요. 다른 산업(흐린 것도)을 누르면 그 산업으로, 빈 곳을 누르면 이전으로 가요.";
function openMap(name) {
  mapFocus = name || "";
  mapTrail = [];
  go("map");
}
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
    try { localStorage.setItem("map_mode", mapMode); } catch (e) { /* 이번만 기억 */ }
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
    try { localStorage.setItem("map_days", String(mapDays)); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  document.querySelectorAll("[data-mapcolor]").forEach((b) => b.addEventListener("click", () => {
    mapColor = b.dataset.mapcolor;
    try { localStorage.setItem("map_color", mapColor); } catch (e) { /* 이번만 기억 */ }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }));
  const detail = $("#map-detail");
  if (detail) bindMapDetail(detail);
}

// ---------------------------------------------------------------- 추천 종목 성과

// 도구 화면 선택 바: [키, 이름, 그 묶음의 칸들]. 처음엔 적립식 계산기, 고른 건 이 폰에 기억해요
const PERF_TABS = [
  ["sav", "적립식 계산기", () => [savingsCard()]],
  ["lab", "포트폴리오 실험실", () => [labCard()]],
  ["cal", "수익률 달력", (d) => [retCalendarCard(d)]],
  ["stress", "폭락 대비", (d) => [stressCard(d)]],
  ["goal", "목표", () => [goalCard()]],
];
let perfTabKey = "sav";
try { perfTabKey = localStorage.getItem("tools_tab") || "sav"; } catch (e) { /* 처음 */ }
const perfTabList = (d) => PERF_TABS.filter(([k, , cards]) => k === "sav" || cards(d).some(Boolean)).map(([k, label, cards]) => ({ k, label, cards }));
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
function homeMoreRows(d) {
  const s = d.daily || {};
  const rows = [];
  const add = (key, icon, title, sum, html) => { if (html) rows.push({ key, icon, title, sum, html }); };
  // 지금 뉴스: 안 읽은 🔥 핫 뉴스가 있으면 그걸, 없으면 가장 최근 뉴스 한 줄 (30분마다 따로 받아요)
  const N = newsOf(market), n1 = N && N[0], hot = hotOf(market);
  add("news", "📰", "지금 뉴스", hot.length ? `🔥 <b>${hot.length}건</b> · ${esc(hot[0].title)}`
    : n1 ? `${esc(n1.title)} · ${ago(n1.at)}` : NEWS ? "최근 뉴스 없음" : "받는 중", newsCard());
  // 투자 공부: 용어집·움직이는 이유·대처법, '오늘 왜?'는 앱 자료로 매일 새로 (사용자 2026-10-24)
  add("learn", "📚", "투자 공부", learnSummary(), learnView(d));
  const dn = dropNow(d);
  add("drop", "⚠️", "급락 점검", dn ? `${esc(dn.name)} ${dn.weekly ? `한 주 ${upDown(dn.w1)}` : `1년 고점 대비 ${upDown(dn.dd)}`}` : "", dropCard(d));
  // 다가오는 일정: 가장 가까운 큰 일정
  const ev = calNear(CAL_DAYS).filter((e) => !STOCK_KINDS.includes(e.kind));
  const ev1 = ev.find((e) => e.big) || ev[0];  // 큰 발표가 있으면 그걸 먼저
  add("cal", "📅", "다가오는 일정", ev1 ? `${md(ev1.date)} ${esc(ev1.title)} · ${dday(ev1.date)}` : "2주 안 큰 일정 없음", calendarCard());
  // 실적·배당 발표: 가장 가까운 내 종목 일정
  const er = calNear(EARN_DAYS).filter((e) => STOCK_KINDS.includes(e.kind) && calMine(e));
  add("earn", "📢", "실적·배당 발표", er.length ? `${md(er[0].date)} ${esc(er[0].title)} · ${dday(er[0].date)}${er.length > 1 ? ` 외 ${er.length - 1}건` : ""}` : "한 달 안 내 종목 일정 없음", earningsCard());
  const mine = myStocks(d);
  add("watch", "⭐", "관심종목", mine.length ? `${mine.length}개 · ${esc(mine[0].name)}${mine.length > 1 ? " 외" : ""}` : "", homeWatchCard(d));
  const mv = s.movers;
  const top = (l) => (l && l[0] ? `${esc(l[0].name)} ${upDown(l[0].r5)}` : "");
  add("movers", "❓", "왜 움직였나", mv ? [top(mv.up), top(mv.down)].filter(Boolean).join(" · ") || "크게 움직인 종목 없음" : "", moversCard(d));
  const all = stocksOf(d).filter((x) => !x.extra && x.d1 != null);
  const ups = all.filter((x) => x.d1 > 0).length, downs = all.filter((x) => x.d1 < 0).length;
  add("heat", "🟥", "시장 히트맵", `오늘 오른 <b class="up">${ups}</b> · 내린 <b class="down">${downs}</b>`, heatmapCard(d));
  const secs = (s.sectors || []).filter((x) => x.r5 != null);
  const sb = secs.length ? [...secs].sort((a, b) => b.r5 - a.r5) : [];
  add("sectors", "🏭", "업종별 호재·악재", sb.length ? `${esc(sb[0].name)} ${upDown(sb[0].r5)} · ${esc(sb[sb.length - 1].name)} ${upDown(sb[sb.length - 1].r5)}` : "", sectorsCard(d));
  // 정부 정책은 업종 호재·악재 바로 아래 (둘이 서로 연결돼서, 사용자 2026-10-18)
  const P = DATA && DATA.policies;
  add("policy", "🏛️", "정부 정책", P && P.items ? `${P.items.length}개 정리${P.stale ? " · ⚠️ 오래됨" : ""}` : "", policyCard());
  const f = market === "kr" && d.flows;
  add("flows", "🏦", "외국인·기관 수급", f ? ((f.warn || []).length ? `⚠️ 같이 파는 종목 ${f.warn.length}개` : "같이 파는 종목 없음") : "", flowsCard(d));
  if (market === "kr" && d.disclosures) {
    const since = new Date(Date.parse(TODAY()) - 7 * 864e5).toISOString().slice(0, 10);
    const n = d.disclosures.filter((x) => x.day >= since && x.tone === "warn").length;
    add("disclose", "📄", "최근 공시", n ? `⚠️ 주의 공시 ${n}건` : "주의 공시 없음", discloseHomeCard(d));
  }
  const q = s.quiet_volume;
  add("quiet", "🔍", "주가 그대로·거래량 급증", q ? (q.total ? `${q.total}개 · ${esc(q.rows[0].name)}` : "오늘은 없음") : "", quietVolumeCard(d));
  const m = DATA && DATA.macro;
  add("macro", "🌡️", "경기 국면", m ? `${esc(m.regime)} · 경고 ${m.score}/${m.total}개` : "", macroCard());
  return rows;
}
function homeMoreCard(d) {
  const rows = homeMoreRows(d);
  if (!rows.length) return "";
  return `<section class="card home-more"><h2>더 보기 <small>누르면 넘어가요</small></h2>${rows.map((r) =>
    `<button type="button" class="hm" data-more="${r.key}"><span class="hm-ico" aria-hidden="true">${r.icon}</span>
      <span class="hm-t"><b>${r.title}</b>${r.sum ? `<span class="hm-s">${r.sum}</span>` : ""}</span><span class="hm-arrow" aria-hidden="true">›</span></button>`).join("")}</section>`;
}
// 더 보기에서 연 칸 화면: 맨 위 ‹ 더 보기(뒤로) + 원래 칸 그대로
function moreView(d) {
  const r = homeMoreRows(d).find((x) => x.key === moreKey);
  return [`<div class="more-back"><button type="button" class="back" data-back>‹ ${stockFrom === "home" ? "더 보기" : "뒤로"}</button></div>`,
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
  return `<li><div class="l"><div class="name news-t">${n.topic ? `<span class="badge">${esc(n.topic)}</span> ` : ""}${t}</div>
    <div class="meta">${esc(n.source || "")}${n.at ? ` · ${md(n.at.slice(0, 10))} ${hm(n.at)} (${ago(n.at)})` : ""}</div></div></li>`;
}
// 24시간 지난 기사는 화면에서도 빼요 (뉴스 작업이 한동안 못 돌아 예전 파일이 남아 있을 때)
const NEWS_HOURS = 24;
const newsOf = (m) => (NEWS && Array.isArray(NEWS[m]) ? NEWS[m].filter((n) => Date.now() - Date.parse(n.at) < NEWS_HOURS * 36e5) : null);
// 증시에 영향 줄 만한 사건 뉴스 (금리·환율·관세·유가·전쟁 등). 종목 하나하나 뉴스는 안 받아요 (사용자 2026-10-24)
function hotLi(n, read) {
  const id = esc(hotId(n));
  const t = /^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener"${read ? "" : ` data-hot-read="${id}"`}>${esc(n.title)}</a>` : esc(n.title);
  return `<li data-hot="${id}"><div class="l"><div class="name news-t">${n.topic ? `<span class="badge">${esc(n.topic)}</span> ` : ""}${t}</div>
    <div class="meta">언론 ${n.sources || "여러"}곳 · ${n.since ? `처음 ${md(n.since.slice(0, 10))} ${hm(n.since)}` : ""}${n.at ? ` · 최근 기사 ${ago(n.at)}` : ""}</div></div>
    ${read ? `<button type="button" class="hot-ok" data-hot-undo="${id}" aria-label="안 읽음으로 되돌리기">안 읽음</button>`
      : `<button type="button" class="hot-ok" data-hot-ok="${id}" aria-label="읽음으로 표시">읽음</button>`}</li>`;
}
function hotCard() {
  const H = hotOf(market), R = hotReadOf(market);
  if (!H.length && !R.length) return "";
  return `<section class="card hot-card${H.length ? "" : " all-read"}${hotFold ? " folded" : ""}" id="hot-card">
    <h2 class="hot-h"><button type="button" class="hot-fold" data-hot-fold aria-expanded="${!hotFold}" aria-controls="hot-body">
      <span class="hot-h-t">🔥 핫 뉴스 <small>안 읽은 ${H.length}건</small></span><span class="hot-fold-t"><span class="fold-less">접기</span><span class="fold-more">펼치기</span></span></button></h2>
    ${H.length ? `<p class="hot-peek">${esc(H[0].title)}</p>` : ""}
    <div class="hot-body" id="hot-body">
    ${H.length ? `<ul class="list">${H.map((n) => hotLi(n)).join("")}</ul>` : `<p class="empty">안 읽은 핫 뉴스가 없어요.</p>`}
    ${H.length > 1 ? `<button type="button" class="more" data-hot-all><b class="hot-all-t">모두 읽음</b><span aria-hidden="true">✓</span></button>` : ""}
    ${R.length ? `<details class="more-list hot-read-list"${hotReadOpen ? " open" : ""}><summary>읽은 핫 뉴스 ${R.length}건 <small>7일 동안 남아요</small></summary>
      <ul class="list">${R.map((n) => hotLi(n, true)).join("")}</ul></details>` : ""}
    <p class="muted note" style="margin:10px 0 0">여러 언론이 같이 다루는 사건이에요. 기사를 누르거나 '읽음'을 누를 때까지 위에 남아요. 읽은 건 아래 '읽은 핫 뉴스'에서 '안 읽음'으로 되돌릴 수 있어요. 제목을 누르면 칸을 접어요.</p></div></section>`;
}
function newsCard() {
  const N = newsOf(market);
  if (!N) return DATA.news_url ? `${hotCard()}<section class="card"><h2>지금 뉴스</h2><p class="empty">뉴스를 아직 못 받았어요. 잠시 뒤 다시 열어 주세요.</p></section>` : "";
  return `${hotCard()}<section class="card" id="news-card"><h2>지금 뉴스 <small>${ago(NEWS.updated)} 받음 · 30분마다</small></h2>
    ${N.length ? `<ul class="list">${N.map(newsLi).join("")}</ul>` : `<p class="empty">최근 24시간 큰 뉴스가 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">금리·환율·관세·유가·전쟁처럼 ${market === "kr" ? "국장" : "미장"} 전체에 영향 줄 만한 뉴스 제목을 30분마다 새로 받아 바꿔요 (GitHub 사정으로 더 늦을 때도 있어요). 24시간 지난 기사는 빼요. 주제 표시는 제목 낱말로 짐작한 거예요. 기사 원문을 꼭 확인하세요.</p></section>`;
}

// ---------------------------------------------------------------- 투자 공부 (사용자 2026-10-24 "용어집부터 증시가 변한 이유·요인·대처법까지 교육자료")
// 홈 '더 보기' 📚 투자 공부 → #kr/more/learn. 위 가로 줄에서 네 묶음 중 하나: 오늘 왜? · 움직이는 이유 · 대처법 · 용어집.
// '오늘 왜?'는 앱이 이미 받은 자료(세계 지수·경기 국면·큰 발표·뉴스·업종·수급·리포트)로 열 때마다 새로 만들어요. 나머지는 고정 글.
// 사고팔기 신호는 안 줘요 (매매 규칙은 사용자가 없앴어요). 숫자는 참고용, 원인은 '후보'로만 말해요.
const LEARN_TABS = [["why", "오늘 왜 움직였나"], ["drivers", "움직이는 이유"], ["read", "전문가 리포트"], ["cope", "대처법"], ["terms", "용어집"]];
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
  return [head, learnNoteCard(), sus2, learnBrokerCard(), learnCaseCard(), secCard, todo];
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
function noteBody(n) {
  const ic = DRIVER_ICON();
  return `${(n.tags || []).length ? `<div class="learn-tags" style="margin-bottom:8px">${n.tags.map((k) => `<button type="button" class="learn-tag" data-learn-go="${esc(k)}">${ic[k] || ""} ${esc((DRIVERS.find((x) => x.key === k) || {}).title || k)}</button>`).join("")}</div>` : ""}
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

function learnView(d) {
  mergeNoteTerms();
  const cards = learnTab === "drivers" ? learnDriverCards() : learnTab === "read" ? learnReadCards() : learnTab === "cope" ? learnCopeCards() : learnTab === "terms" ? learnTermCards() : learnWhyCards(d);
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
  const R = DATA.reading, r = R && R.items ? Object.values(R.items).flat().filter((x) => x.date === TODAY()).length : 0;
  return `${s ? `${esc(s.r.name)} ${upDown(s.d1)} 왜? · 원인 후보 ${n}개` : "대처법"}${r ? ` · 오늘 리포트 ${r}개` : ""} · 오늘의 용어 ${esc(termOfDay())}`;
}
function bindLearn() {
  const app = $("#app");
  keepRow($(".learn-tabs", app), "learn");
  app.querySelectorAll("[data-learn-tab]").forEach((b) => b.addEventListener("click", () => {
    const toCope = b.classList.contains("more");  // 아래쪽 '대처법 전부 보기'는 이동하는 버튼이라 맨 위로
    learnTab = b.dataset.learnTab;
    try { localStorage.setItem("learn_tab", learnTab); } catch (e) { /* 이번만 기억 */ }
    if (toCope) { lastTap = null; lastView = ""; window.scrollTo(0, 0); }
    render();
  }));
  app.querySelectorAll("details[data-learn-open]").forEach((x) => x.addEventListener("toggle", () => {
    if (x.open) LEARN_OPEN.add(x.dataset.learnOpen); else LEARN_OPEN.delete(x.dataset.learnOpen);
  }));
  // '배우기': 움직이는 이유에서 그 요인을 펼쳐 보여 줘요 (이동하는 버튼이라 '화면 그대로'에서 빼요)
  app.querySelectorAll("[data-learn-go]").forEach((b) => b.addEventListener("click", () => {
    learnTab = "drivers";
    try { localStorage.setItem("learn_tab", learnTab); } catch (e) { /* 이번만 기억 */ }
    LEARN_OPEN.add(`d:${b.dataset.learnGo}`);
    lastTap = null;
    render();
    const x = $(`#lesson-${CSS.escape(b.dataset.learnGo)}`);
    if (x) { x.scrollIntoView(); window.scrollBy(0, -70); }
  }));
  app.querySelectorAll("[data-learn-tool]").forEach((b) => b.addEventListener("click", () => {
    perfTabKey = b.dataset.learnTool;
    try { localStorage.setItem("tools_tab", perfTabKey); } catch (e) { /* 이번만 기억 */ }
    go("tools");
  }));
  app.querySelectorAll("[data-read-cat]").forEach((b) => b.addEventListener("click", () => {
    readCat = b.dataset.readCat;
    try { localStorage.setItem("read_cat", readCat); } catch (e) { /* 이번만 기억 */ }
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

// 지수 추세: 고른 캔들 기간(일봉·주봉·월봉·년봉)으로 그려요.
// 캔들 데이터가 있으면 캔들 차트, 없으면(예전 기록) 최근 1년 종가 선 그래프
function drawTrend(d, reset) {
  const r = d.daily ? chartIdx(d) : null;
  if (r && r.sym !== OWN_IDX[market]) { drawOtherIndex(r, reset); return; }
  const c = d.daily && d.daily.candles;
  if (c && c.dates.length) {
    const f = frameCandles(c, frame);
    const show = (FRAMES.find((x) => x[0] === frame) || FRAMES[0])[2];
    document.querySelectorAll(".ma-key").forEach((k) => { k.style.display = frame === "y" ? "none" : ""; });
    candleChart($("#trend-chart"), f, show, reset || idxDrawn !== OWN_IDX[market], (txt) => { $("#trend-change").innerHTML = txt; }, { name: d.index_name });
    idxDrawn = OWN_IDX[market];
    return;
  }
  drawTrendLine(d);
}

function drawOtherIndex(r, reset) {
  const el = $("#trend-chart");
  if (!el) return;
  if (!IDX_READY.has(r.sym)) {
    idxData(r.sym).then(() => {
      if (screen === "chart" && chartIdx(DATA.markets[market]).sym === r.sym) render();  // 받는 사이 다른 화면으로 갔으면 안 그려요
    });
    return;
  }
  const x = IDX_READY.get(r.sym), c = x && x.candles;
  if (!c || c.dates.length < 2) {
    el.innerHTML = `<p class="empty">이 지수는 차트 자료를 아직 못 받았어요. 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`;
    return;
  }
  const f = frameCandles(c, frame);
  const show = (FRAMES.find((y) => y[0] === frame) || FRAMES[0])[2];
  candleChart(el, f, show, reset || idxDrawn !== r.sym, (txt) => { const t = $("#trend-change"); if (t) t.innerHTML = txt; },
    { name: r.name, fmt: (v) => (Math.abs(v) >= 1000 ? num(v) : px("us", v)) });  // 큰 지수는 소수점 없이 (가격 축이 안 잘리게)
  idxDrawn = r.sym;
  const all = $("#trend-all");
  if (all) all.innerHTML = allTimeLine(c);
}

// 묶는 열쇠: 주(그 주 월요일 날짜), 월(YYYY-MM), 년(YYYY)
const WEEK = (s) => {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const KEY = { d: (s) => s, w: WEEK, m: (s) => s.slice(0, 7), y: (s) => s.slice(0, 4) };

// 시가는 첫날, 고가·저가는 기간 중 최고·최저, 종가는 마지막 날, 거래량은 기간 합계로 묶어요.
function groupCandles(src, keyOf) {
  const out = { keys: [], first: [], last: [], o: [], h: [], l: [], c: [] };
  const vol = Array.isArray(src.v) && src.v.length === src.dates.length;
  if (vol) out.v = [];
  src.dates.forEach((dt, i) => {
    const k = keyOf(dt), j = out.keys.length - 1;
    if (j < 0 || out.keys[j] !== k) {
      out.keys.push(k); out.first.push(dt); out.last.push(dt);
      out.o.push(src.o[i]); out.h.push(src.h[i]); out.l.push(src.l[i]); out.c.push(src.c[i]);
      if (vol) out.v.push(src.v[i]);
    } else {
      out.last[j] = dt; out.h[j] = Math.max(out.h[j], src.h[i]); out.l[j] = Math.min(out.l[j], src.l[i]); out.c[j] = src.c[i];
      if (vol) out.v[j] += src.v[i];
    }
  });
  return out;
}
const dropFirst = (f) => (f.keys.length > 1 ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.slice(1)])) : f);

// 일봉(5년치)·월봉(전체 기간)으로 고른 기간의 캔들을 만들어요.
// 이동평균선(N일선)은 각 캔들 기간 마지막 거래일의 값이에요 (일봉이 있는 최근 몇 년만, 년봉엔 안 그려요).
// 캔들만 묶어요 (보조지표 없이). 비교 차트는 이것만 써요.
function frameBase(c, fr) {
  // 상장일부터 받은 일봉(full: 종목 화면)은 첫 주·첫 달·첫 해가 상장 직후라 그대로 둬요.
  // 중간부터 자른 일봉(지수)은 첫 주가 중간부터일 수 있어서 빼요.
  const cut = c.full ? (x) => x : dropFirst;
  let f;
  if (fr === "d") f = groupCandles(c, KEY.d);
  else if (fr === "w") f = cut(groupCandles(c, KEY.w));
  else if (c.monthly && c.monthly.dates.length) {
    f = groupCandles(c.monthly, fr === "m" ? KEY.m : KEY.y);
    if (fr === "y" && f.first[0].slice(5, 7) !== "01") f = dropFirst(f);  // 1월부터가 아닌 첫 해는 빼요
  } else f = cut(groupCandles(c, KEY[fr]));  // 월봉이 없으면 일봉을 묶어요
  return f;
}
function frameCandles(c, fr) {
  const f = frameBase(c, fr);
  const lastDay = new Map();
  c.dates.forEach((dt, i) => lastDay.set(KEY[fr](dt), i));
  const pick = (vals) => f.keys.map((k) => (fr === "y" || !lastDay.has(k) ? null : vals[lastDay.get(k)]));
  // 켜 둔 이동평균선만 계산해요 (기간은 일 단위라 주봉·월봉에서도 N일선 그대로)
  const mas = MA_SET.map((m, i) => ({ ...m, color: MA_COLORS[i], cls: `ma${i + 1}` }))
    .filter((m) => m.on).map((m) => ({ ...m, vals: pick(smaOf(c.c, m.p)) }));
  return withIndicators({ ...f, mas, frame: fr });
}

// 보조지표는 지금 보는 캔들로 계산해요 (주봉이면 20주 볼린저밴드, 14주 RSI). 앞쪽 계산이 모자란 캔들은 null.
function smaOf(vals, k) {
  const out = new Array(vals.length).fill(null); let sum = 0;
  for (let i = 0; i < vals.length; i++) { sum += vals[i]; if (i >= k) sum -= vals[i - k]; if (i >= k - 1) out[i] = sum / k; }
  return out;
}
// 볼린저밴드: 20개 평균 ± 표준편차 2배
function bandsOf(cl, k = 20, m = 2) {
  const mid = smaOf(cl, k), up = mid.slice(), lo = mid.slice();
  for (let i = k - 1; i < cl.length; i++) {
    let ss = 0;
    for (let j = i - k + 1; j <= i; j++) ss += (cl[j] - mid[i]) ** 2;
    const sd = Math.sqrt(ss / k);
    up[i] = mid[i] + m * sd; lo[i] = mid[i] - m * sd;
  }
  return { mid, up, lo };
}
// RSI: 서버 계산(marketdata.rsi)과 같은 방식 (오른 폭·내린 폭의 지수평균, 1/n씩 반영)
function rsiOf(cl, n = 14) {
  const out = new Array(cl.length).fill(null);
  let g = null, l = null;
  for (let i = 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (g == null) { g = up; l = dn; } else { g += (up - g) / n; l += (dn - l) / n; }
    if (i >= n) out[i] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
  }
  return out;
}
function withIndicators(f) {
  return { ...f, bb: bandsOf(f.c), rsi: rsiOf(f.c), vma: f.v ? smaOf(f.v, 20) : null };
}

// 캔들 이름: axis = 아래 날짜 축, short = 최고·최저 표시, full = 눌렀을 때
function frameLabel(f, i, kind) {
  const a = f.first[i], b = f.last[i];
  if (f.frame === "y") return kind === "full" ? `${f.keys[i]}년` : f.keys[i];
  if (f.frame === "m") {
    const [y, m] = f.keys[i].split("-");
    return kind === "full" ? `${y}년 ${Number(m)}월` : `${y.slice(2)}.${m}`;
  }
  if (f.frame === "w") return kind === "full" ? `${a} ~ ${b.slice(5)}` : kind === "short" ? `${md(a)} 주` : a.slice(2).replace(/-/g, ".");
  return kind === "full" ? b : kind === "short" ? md(b) : b.slice(2).replace(/-/g, ".");
}

function drawTrendLine(d) {
  const s = d.daily && d.daily.series;
  if (!s || !s.dates.length) return;
  const days = 260;
  const cut = (arr) => arr.slice(-days - 1);  // 기간 시작 전날 종가부터 (변화율 기준점)
  const close = cut(s.close);
  lineChart($("#trend-chart"), {
    dates: cut(s.dates),
    series: [
      { name: d.index_name, color: "var(--series-1)", values: close },
      { name: "50일선", color: "var(--series-2)", values: cut(s.ma50), scale: days > 21 },
      { name: "200일선", color: "var(--series-3)", values: cut(s.ma200), scale: days > 21 },
    ],
    fmt: (v) => num(v),
    tall: true,
  });
  const first = close.find((v) => v != null), last = close[close.length - 1];
  $("#trend-change").innerHTML = first && last
    ? `최근 1년 <b class="${sign(last / first - 1)}">${pct(last / first - 1)}</b> (${num(first)} → ${num(last)})` : "";
}

// 세계 지수·환율(world.json)에 있는 지수들. 매매 기준 지수가 맨 앞이에요.
function chartIndexes(d) {
  const w = DATA.world;
  const all = w && w.groups ? w.groups.flatMap((g) => g.items).filter((r) => r.kind === "idx") : [];
  const own = OWN_IDX[market];
  return [{ sym: own, name: d.index_name || (all.find((r) => r.sym === own) || {}).name || own },
    ...all.filter((r) => r.sym !== own).map((r) => ({ sym: r.sym, name: r.name }))];
}
function chartIdx(d) {
  const list = chartIndexes(d);
  return list.find((r) => r.sym === CHART_IDX[market]) || list[0];
}
function idxChips(d) {
  const cur = chartIdx(d).sym;
  return `<div class="chips idx-chips" role="group" aria-label="지수 고르기">${chartIndexes(d).map((r) =>
    `<button type="button" data-idx="${esc(r.sym)}" aria-pressed="${r.sym === cur}">${esc(r.name)}</button>`).join("")}</div>`;
}

// 비교 차트 (TradingView·토스처럼): 지수·종목을 최대 8개까지 같은 출발점(0%)에서 겹쳐 그려요.
// 지수 차트처럼 일봉·주봉·월봉·년봉, 옆으로 밀기·확대·축소, 길게 눌러 세부정보 (보조지표는 없어요). 화면에 보이는 첫날이 늘 0%예요.
// 항목 키: "i:^KS11"(지수) / "s:kr:005930"·"s:us:AAPL"(국장·미장 아무 종목). 옛 "s:005930"은 지금 시장 종목이에요. 시장마다 따로 기억해요.
const cmpColor = (i) => savColor(i);
const CMP_MAX = 8;
// 처음 보이는 길이: 일봉 1년, 주봉 5년, 월봉 20년, 년봉 전체 (지수 차트보다 길게. 더 길게는 밀거나 오므리거나 '처음부터')
const COMPARE = { kr: null, us: null };
let cmpF = "d";        // 일봉·주봉·월봉·년봉
let cmpLine = false;   // false면 캔들, true면 선
let cmpQuery = "";
let cmpDrawn = null;   // 마지막으로 그린 항목·기간 (바뀌면 보던 구간을 처음으로)
let cmpIdxOpen = false; // '지수 바로 넣기'를 펼쳐 뒀는지 (하나 넣어도 안 닫혀요)
try {
  Object.assign(COMPARE, JSON.parse(localStorage.getItem("compare") || "{}"));
  cmpF = localStorage.getItem("cmp_f") || "d"; cmpLine = localStorage.getItem("cmp_line") === "1";
} catch (e) { /* 처음 */ }
function cmpItems(d) {
  if (!COMPARE[market]) {
    const first = WATCH[market][0] || (stocksOf(d)[0] || {}).code;
    COMPARE[market] = [`i:${OWN_IDX[market]}`].concat(first ? [`s:${market}:${first}`] : []);
  }
  return COMPARE[market];
}
// 종목 키 → [시장, 코드]
function cmpStock(key) {
  const id = key.slice(2), m = /^(kr|us):(.+)$/.exec(id);
  return m ? [m[1], m[2]] : [market, id];
}
function cmpName(d, key) {
  if (key[0] === "i") { const id = key.slice(2); return (chartIndexes(d).find((r) => r.sym === id) || { name: id }).name; }
  const [m, code] = cmpStock(key);
  const s = m === market && stocksOf(d).find((x) => x.code === code);
  if (s) return s.name;
  const e = (SYM[m] || []).find((x) => x.row[0] === code), x = STOCK_READY.get(`${m}/${code}`);
  return (e && e.row[1]) || (x && x.name) || code;
}
const cmpHas = (items, m, code) => items.some((k) => k[0] === "s" && cmpStock(k).join(":") === `${m}:${code}`);
// 지수·종목 일봉 (종목 화면·지수 버튼과 같은 파일)
const cmpLoad = (key) => (key[0] === "i" ? idxData(key.slice(2)) : stockData(...cmpStock(key)));
const cmpReady = (key) => (key[0] === "i" ? IDX_READY.get(key.slice(2)) : STOCK_READY.get(cmpStock(key).join("/")));
// 검색 결과: 지수 이름 + 국장·미장 전 종목 (계산기·검색 화면과 같은 방식). 비어 있으면 관심종목·지수 바로 넣기 버튼.
function cmpResults(d) {
  const items = cmpItems(d), q = cmpQuery.trim();
  if (items.length >= CMP_MAX) return `<p class="muted" style="margin:8px 0 0">${CMP_MAX}개가 다 찼어요. 위에서 ×로 하나 빼면 더 넣을 수 있어요.</p>`;
  const btn = (k, label) => `<button type="button" data-cmp-add="${esc(k)}">+ ${esc(label)}</button>`;
  if (!q) {
    const watch = WATCH[market].filter((c) => !cmpHas(items, market, c)).map((c) => btn(`s:${market}:${c}`, cmpName(d, `s:${market}:${c}`))).join("");
    const idx = chartIndexes(d).filter((r) => !items.includes(`i:${r.sym}`)).map((r) => btn(`i:${r.sym}`, r.name)).join("");
    // 지수 버튼은 많아서 접어 둬요 (차트가 아래로 밀리지 않게)
    return (watch ? `<div class="sav-quick"><span class="muted">내 관심종목</span><div class="chips">${watch}</div></div>` : "")
      + `<details class="fold" id="cmp-idx" style="margin-top:6px"${cmpIdxOpen ? " open" : ""}><summary class="muted">지수 바로 넣기</summary><div class="chips">${idx}</div></details>`;
  }
  const qs = queryKeys(q), hits = [];
  chartIndexes(d).forEach((r, i) => {
    const sc = scoreOf([r.sym.replace(/^\^/, ""), r.name], [norm(r.name)], qs);
    if (sc != null && !items.includes(`i:${r.sym}`)) hits.push({ sc: sc - 0.5, i, key: `i:${r.sym}`, name: r.name, meta: "지수" });
  });
  if (!SYM.kr || !SYM.us) {
    if (!hits.length) return `<p class="muted" style="margin:8px 0 0">종목 목록 불러오는 중…</p>`;
  } else {
    for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => {
      const sc = scoreOf(e.row, e.keys, qs);
      if (sc != null && !cmpHas(items, m, e.row[0])) hits.push({ sc, i, m, key: `s:${m}:${e.row[0]}`, name: e.row[1],
        meta: [e.row[0], kindName(m, e.row), m === market ? "" : MK_NAME[m]].filter(Boolean).join(" · ") });
    });
  }
  hits.sort((a, b) => a.sc - b.sc || (a.m && a.m !== market ? 1 : 0) - (b.m && b.m !== market ? 1 : 0) || a.i - b.i);
  if (!hits.length) return `<p class="muted" style="margin:8px 0 0">'${esc(q)}'에 맞는 지수·종목이 없어요.</p>`;
  return `<ul class="sav-res">${hits.slice(0, 8).map((h) => `<li><button type="button" data-cmp-add="${esc(h.key)}"><span class="l"><b>${esc(h.name)}</b>
    <small>${esc(h.meta)}</small></span><span class="add">+</span></button></li>`).join("")}</ul>`;
}
function compareCard(d) {
  if (!d.daily) return "";
  const items = cmpItems(d);
  const chips = items.map((k, i) => `<button type="button" class="cmp-chip" data-cmp-del="${esc(k)}" aria-label="${esc(cmpName(d, k))} 빼기">
    <i class="sw" style="background:${cmpColor(i)}"></i>${esc(cmpName(d, k))} <span aria-hidden="true">×</span></button>`).join("");
  const frames = FRAMES.map(([k, label]) => `<button type="button" data-cmp-f="${k}" aria-pressed="${k === cmpF}">${label}</button>`).join("");
  return `<section class="card" id="cmp-card"><h2>비교 차트 <small>보이는 첫날 0%에서 출발</small></h2>
    <div class="chips" id="cmp-chips">${chips}</div>
    <input id="cmp-q" class="search" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:10px"
      placeholder="지수·종목 검색 (예: 나스닥, 엔비디아)" aria-label="비교 차트에 넣을 지수·종목 검색" value="${esc(cmpQuery)}">
    <div id="cmp-res">${cmpResults(d)}</div>
    <div class="period" role="group" aria-label="비교 기간" style="margin:10px 0 0">${frames}</div>
    <div class="chips" role="group" aria-label="모양"><button type="button" data-cmp-line="0" aria-pressed="${!cmpLine}">캔들</button><button type="button" data-cmp-line="1" aria-pressed="${cmpLine}">꺾은선</button></div>
    <p class="muted" id="cmp-range" style="margin:8px 0 4px"></p>
    <div class="chart candle" id="cmp-chart"><p class="empty">불러오는 중이에요…</p></div>
    <p class="muted note" id="cmp-note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들은 항목마다 자기 색이고, 오른 캔들은 꽉 차고 내린 캔들은 속이 비어요. 누르면 그날 각자 몇 % 올랐는지 보이고, 길게 누른 채 움직이면 세부정보가 손가락을 따라와요.
      넣은 것 중 가장 오래된 날부터 지금까지 한 화면에 보여요(일봉은 너무 길면 최근 ${num(MAX_SHOW)}일, 옆으로 밀면 더 과거).
      넣은 것이 다 같이 있는 첫날을 0%로 맞춰서 누가 더 올랐는지 봐요. 늦게 상장한 게 있으면 그날 '같이 출발' 점선이 생겨요. 8배 넘게 차이 나면 '로그 눈금'으로 그려요. ×를 누르면 빠져요. 최대 ${CMP_MAX}개까지 겹쳐요.</p></section>`;
}
// 항목마다 고른 기간 캔들(지수 차트와 같은 묶음)을 만들고, 모든 항목의 날짜를 합쳐 한 줄로 세워요.
// 쉬는 날(국장·미장 휴일이 달라요)은 직전 값으로 이어요.
// 지수는 상장일부터라 수만 칸이에요: 묶은 캔들은 자료마다 기억하고, 날짜는 이미 순서대로라 정렬 없이 한 번에 합쳐요
// (전에는 넣을 때마다 보조지표까지 다 계산하고 전체를 다시 정렬해서 폰에서 버벅였어요).
const CMP_FRAME = new WeakMap();  // 자료 → { 기간: 묶은 캔들 }
function cmpFrame(c, fr) {
  let m = CMP_FRAME.get(c);
  if (!m) CMP_FRAME.set(c, (m = {}));
  return m[fr] || (m[fr] = frameBase(c, fr));
}
const cmpGot = (items) => items.map((k) => { const x = cmpReady(k); return x && x.candles && x.candles.dates && x.candles.dates.length > 1 ? x.candles : null; });
function cmpRows(got, fr = cmpF) {
  const fs = got.map((x) => (x ? cmpFrame(x, fr) : null)), n = fs.length;
  const keys = [], first = [], last = [];
  const series = fs.map(() => ({ c: [], o: [], h: [], l: [] }));
  const at = new Array(n).fill(0), prev = new Array(n).fill(null);
  for (;;) {
    let k = null;
    for (let j = 0; j < n; j++) { const f = fs[j]; if (f && at[j] < f.keys.length && (k == null || f.keys[at[j]] < k)) k = f.keys[at[j]]; }
    if (k == null) break;
    let fi = null, la = null;
    for (let j = 0; j < n; j++) {
      const f = fs[j], s = series[j], i = f && at[j] < f.keys.length && f.keys[at[j]] === k ? at[j]++ : null;
      if (i != null) {
        prev[j] = i;
        if (fi == null || f.first[i] < fi) fi = f.first[i];
        if (la == null || f.last[i] > la) la = f.last[i];
        s.o.push(f.o[i]); s.h.push(f.h[i]); s.l.push(f.l[i]);
      } else { s.o.push(null); s.h.push(null); s.l.push(null); }  // 쉬는 날은 캔들 없이
      s.c.push(prev[j] == null ? null : f.c[prev[j]]);
    }
    keys.push(k); first.push(fi); last.push(la);
  }
  return { f: { keys, first, last, frame: fr }, series };
}
function drawCompare(d) {
  const el = $("#cmp-chart");
  if (!el) return;
  const items = cmpItems(d);
  if (!items.length) { el.innerHTML = `<p class="empty">위 검색창에서 지수나 종목을 찾아 넣어 주세요.</p>`; return; }
  const want = items.join(",") + cmpF + market;
  Promise.all(items.map(cmpLoad)).then(() => {
    if (screen !== "chart" || !$("#cmp-chart") || cmpItems(d).join(",") + cmpF + market !== want) return;  // 받는 사이 바뀌었으면 안 그려요
    const el2 = $("#cmp-chart");
    const got = cmpGot(items);
    if (!got.some(Boolean)) { el2.innerHTML = `<p class="empty">자료를 못 받았어요. 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`; return; }
    const { f, series } = cmpRows(got);
    const list = items.map((k, j) => {
      const m = k[0] === "i" ? null : cmpStock(k)[0];
      return { name: cmpName(d, k), color: cmpColor(j), ok: Boolean(got[j]), ...series[j],
        fmt: m ? (v) => px(m, v) : (v) => (Math.abs(v) >= 1000 ? num(v) : px("us", v)) };
    });
    // 처음 그릴 때는 넣은 것 중 가장 오래된 날부터 전부
    compareChart(el2, f, list, Infinity, cmpDrawn !== want, (txt) => { const t = $("#cmp-range"); if (t) t.innerHTML = txt; });
    cmpDrawn = want;
    const missing = list.filter((s) => !s.ok).map((s) => s.name);
    const note = $("#cmp-note");
    if (note && missing.length && !note.dataset.miss) { note.dataset.miss = "1"; note.insertAdjacentText("afterbegin", `${missing.join(", ")} 자료를 못 받았어요. `); }
  });
}
// 10배 넘게 오르면 %가 너무 길어서 (+43271.7%) '434배'로 써요 (오른쪽 딱지가 안 잘리게)
const cmpPct = (r) => (r != null && r >= 9 ? `${num(r + 1)}배` : pct(r));
// 비교 선 차트: 보이는 구간에서 모든 항목이 다 있는 첫 칸을 0%로 (밀거나 확대하면 다시 맞춰요). 조작은 캔들 차트와 같아요.
// 늦게 상장한 항목이 있으면 그날부터 같이 출발시켜서 공평하게 비교해요 (그 전 구간은 그날 대비 몇 %로 보여요).
function compareChart(el, f, list, show, reset, onRange) {
  const n = f.keys.length, key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n || VIEW[key].frame !== f.frame) {
    // 처음엔 넣은 것이 다 같이 있는 첫 칸부터 (오래된 지수 하나 때문에 비교 구간이 오른쪽 끝에 몰리지 않게). 그 전은 밀어서 봐요
    const firsts = list.map((x) => x.c.findIndex((c) => c != null)).filter((i) => i >= 0);
    const common = firsts.length ? Math.max(...firsts) : 0;
    VIEW[key] = { count: Math.min(show, n, Math.max(Math.min(5, n), n - common)), end: n - 1, n, frame: f.frame, pick: null };
  }
  const v = VIEW[key];
  let W = 0, pad, iw, ih, cw, start, base = [], Yp, from = 0;
  const draw = (anim) => {
    W = Math.max(el.clientWidth, 260);
    pad = { l: 6, r: 62, t: 22, b: 22 };
    iw = W - pad.l - pad.r;
    ih = Math.round(Math.max(170, Math.min(260, W * 0.62))) - pad.t - pad.b;  // 가로로 넓적하게 (지수 차트보다 낮게)
    const H = pad.t + ih + pad.b;
    v.count = Math.max(Math.min(5, n), Math.min(n, MAX_SHOW, v.count));
    v.end = Math.max(v.count - 1, Math.min(n - 1, v.end));
    const endI = Math.round(v.end);
    start = endI - Math.round(v.count) + 1;
    cw = iw / Math.round(v.count);
    // 다 같이 있는 첫 칸(from)의 값 = 0%
    const first = list.map((s) => { for (let i = start; i <= endI; i++) if (s.c[i] != null) return i; return null; });
    from = Math.max(start, ...first.filter((i) => i != null));
    base = list.map((s, j) => { if (first[j] == null) return null; for (let i = from; i <= endI; i++) if (s.c[i] != null) return s.c[i]; return null; });
    let lo = Infinity, hi = -Infinity;
    list.forEach((s, j) => {
      if (base[j] == null) return;
      for (let i = start; i <= endI; i++) {
        for (const val of cmpLine ? [s.c[i]] : [s.c[i], s.h[i], s.l[i]]) if (val != null) { const r = val / base[j]; if (r < lo) lo = r; if (r > hi) hi = r; }
      }
    });
    if (!Number.isFinite(lo)) { lo = 0.9; hi = 1.1; }
    lo = Math.min(lo, 1); hi = Math.max(hi, 1);
    const logY = lo > 0 && hi / lo >= 8;
    if (logY) { const r = Math.log(hi / lo) * 0.08; hi *= Math.exp(r); lo /= Math.exp(r); } else {
      const span = hi - lo || 0.02; hi += span * 0.08; lo -= span * 0.08;
    }
    const sc = logY ? (p) => Math.log(Math.max(p, lo / 10)) : (p) => p, sLo = sc(lo), sHi = sc(hi);
    const X = (i) => pad.l + (i - start + 0.5) * cw;
    const Y = (p) => pad.t + (1 - (sc(p) - sLo) / (sHi - sLo)) * ih;
    Yp = Y;
    // 눈금은 딱 떨어지는 % (0%는 점선이 있어서 글자만), 너무 붙으면 건너뛰어요
    let ticks;
    if (logY) {
      const cand = [];
      for (let e = -3; e <= 6; e++) [1, 2, 5].forEach((m) => cand.push(m * Math.pow(10, e)));
      [0.25, 0.5, 0.75].forEach((r) => cand.push(r));
      ticks = cand.filter((r) => r > lo && r < hi).sort((a, b) => a - b);
    } else {
      const raw = (hi - lo) / 6, e = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * e).find((k) => k >= raw);
      ticks = [];  // 비율이라 1이 0%: 1 + step의 배수
      for (let k = Math.ceil((lo - 1) / step); 1 + k * step < hi; k++) ticks.push(1 + k * step);
    }
    ticks = [1, ...ticks.filter((t) => Math.abs(t - 1) > 1e-9)];  // 0%를 먼저 남겨요
    ticks = ticks.reduce((kept, t) => (kept.every((u) => Math.abs(Y(u) - Y(t)) >= 18) ? [...kept, t] : kept), []);
    const grid = ticks.map((t) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>
      <text x="${pad.l + 2}" y="${Y(t) - 4}">${esc(cmpPct(t - 1).replace(/\.0%$/, "%"))}</text>`).join("");
    const path = (vals, j, extra) => {
      if (base[j] == null) return "";
      let dstr = "", pen = false;
      for (let i = start; i <= endI; i++) {
        const val = vals[i]; if (val == null) { pen = false; continue; }
        dstr += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(val / base[j]).toFixed(1)}`; pen = true;
      }
      return dstr ? `<path d="${dstr}" fill="none" stroke="${list[j].color}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>` : "";
    };
    // 캔들: 항목마다 자기 색. 오른 캔들은 꽉 채우고 내린 캔들은 속이 빈 테두리 (색이 겹쳐도 오르내림이 보여요)
    const bw = Math.max(1, cw * 0.6);
    const candles = (s, j) => {
      if (base[j] == null) return "";
      // 꼬리는 항목마다 path 하나로 (길게 보면 캔들이 수천 개라 하나씩 그리면 밀 때 버벅여요)
      let wick = "", out = "";
      for (let i = start; i <= endI; i++) {
        if (s.o[i] == null || s.c[i] == null) continue;
        const b = base[j], x = X(i), up = s.c[i] >= s.o[i];
        wick += `M${x.toFixed(1)},${Y(s.h[i] / b).toFixed(1)}V${Y(s.l[i] / b).toFixed(1)}`;
        if (cw < 3) continue;
        const top = Y(Math.max(s.o[i], s.c[i]) / b), bh = Math.max(1, Math.abs(Y(s.o[i] / b) - Y(s.c[i] / b)));
        out += `<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" stroke="${s.color}" stroke-width="1" fill="${up ? s.color : "var(--surface-1)"}"/>`;
      }
      return (wick ? `<path d="${wick}" stroke="${s.color}" stroke-width="1" fill="none"/>` : "") + out;
    };
    const lines = list.map((s, j) => (cmpLine ? path(s.c, j, 'stroke-width="2"') : candles(s, j))).join("");
    // 오른쪽 끝: 각자 지금 몇 % (선 색 딱지, 겹치면 위아래로 벌려요)
    const ends = list.map((s, j) => {
      let i = endI; while (i >= start && s.c[i] == null) i--;
      if (i < start || base[j] == null) return null;
      return { j, r: s.c[i] / base[j] - 1, y: Math.min(pad.t + ih - 9, Math.max(pad.t + 9, Y(s.c[i] / base[j]))) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 18) ends[k].y = ends[k - 1].y + 18;
    const tags = ends.map((e) => `<rect class="cmp-end" x="${pad.l + iw + 1}" y="${e.y - 9}" width="${pad.r - 2}" height="18" rx="3" fill="${list[e.j].color}"/>
      <text class="tag-text cmp-end" x="${pad.l + iw + 6}" y="${e.y + 4}">${esc(cmpPct(e.r))}</text>`).join("");
    const zero = `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(1)}" y2="${Y(1)}"/>`
      // 늦게 상장한 게 있으면 같이 출발한 칸에 세로 점선
      + (from > start ? `<line class="zero" x1="${X(from)}" x2="${X(from)}" y1="${pad.t}" y2="${pad.t + ih}"/>
        <text class="pane-label" x="${X(from) + 4}" y="${pad.t + ih - 4}">같이 출발</text>` : "");
    const xs = [start, Math.round((start + endI) / 2), endI];
    const xl = xs.map((i, k) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${esc(frameLabel(f, i, "axis"))}</text>`).join("");
    const picked = v.pick != null && v.pick >= start && v.pick <= endI;
    const clip = `cc-${key}`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(list.map((s) => s.name).join(", "))} 비교 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath></defs>
      ${grid}${zero}<g class="cmp-lines" clip-path="url(#${clip})">${lines}</g>
      <line class="cross" x1="${picked ? X(v.pick) : 0}" x2="${picked ? X(v.pick) : 0}" y1="${pad.t}" y2="${pad.t + ih}"${picked ? "" : ' style="display:none"'}/>
      ${tags}${xl}${logY ? `<text class="pane-label" x="${pad.l + iw + 6}" y="${pad.t - 8}">로그 눈금</text>` : ""}</svg>
      <div class="tip" style="display:none"></div>`;
    if (anim && cmpLine) drawIn($("svg", el), { x0: pad.l, w: iw, sel: ".cmp-lines > *", late: ".cmp-end" });
    const best = ends.slice().sort((a, b) => b.r - a.r)[0];
    onRange(`${esc(frameLabel(f, start, "axis"))} ~ ${esc(frameLabel(f, endI, "axis"))} (${Math.round(v.count)}${UNIT[f.frame]})`
      + (from > start ? ` · 다 같이 있는 ${esc(frameLabel(f, from, f.frame === "w" ? "axis" : "full"))}부터 비교` : "")
      + (best && ends.length > 1 ? ` · 가장 많이 오른 건 <b>${esc(list[best.j].name)}</b> <b class="${sign(best.r)}">${cmpPct(best.r)}</b>` : ""));
    if (picked) showTip(v.pick, X(v.pick));
  };
  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const rows = list.map((s, j) => {
      if (base[j] == null || s.c[i] == null) return "";
      const r = s.c[i] / base[j] - 1;
      return `<div class="row"><i class="sw" style="background:${s.color}"></i>${esc(s.name)} <b class="${sign(r)}">${cmpPct(r)}</b> <span class="muted">${esc(s.fmt(s.c[i]))}</span></div>`;
    }).join("");
    tip.innerHTML = `<div class="muted">${esc(frameLabel(f, i, "full"))}</div>${rows}`;
    tip.style.display = "";
    const r = el.getBoundingClientRect(), left = (x / W) * r.width, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `${pad.t}px`;
  };
  // 누른 곳 근처에 어느 항목이든 캔들(선이면 그 점)이 있는지: 없으면 빈 곳이라 세부정보를 닫아요
  const hit = (i, y) => Yp && list.some((s, j) => {
    if (base[j] == null || s.c[i] == null) return false;
    const top = Yp((cmpLine ? s.c[i] : s.h[i]) / base[j]), bot = Yp((cmpLine ? s.c[i] : s.l[i]) / base[j]);
    return y >= top - HIT_PX && y <= bot + HIT_PX;
  });
  chartGestures(el, v, () => ({ start, cw, pad, W, hit }), draw, showTip);
  draw(drawSoon(el));
  el._draw = draw;
  if (!el._ro) {
    let w = el.clientWidth;
    el._ro = new ResizeObserver(() => {
      if (!el.isConnected) { el._ro.disconnect(); return; }
      if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; el._draw(); }
    });
    el._ro.observe(el);
  }
}
function bindCompare(d) {
  const save = () => {
    try { localStorage.setItem("compare", JSON.stringify(COMPARE)); localStorage.setItem("cmp_f", cmpF); localStorage.setItem("cmp_line", cmpLine ? "1" : "0"); } catch (e) { /* 이번만 */ }
  };
  // 비교 차트 칸만 다시 그려요 (화면 전체를 다시 그리면 위 지수 차트까지 새로 그려서 느려요).
  // 새 차트가 준비될 때까지 보던 차트를 그대로 둬서 '불러오는 중'으로 깜빡이거나 칸이 줄었다 늘지 않아요.
  const redraw = () => {
    save();
    const card = $("#cmp-card");
    if (!card) { render(); return; }
    const y = window.scrollY, old = $("#cmp-chart"), keep = old && old.querySelector("svg") ? old.innerHTML : "";
    card.outerHTML = compareCard(d);
    const nc = $("#cmp-card");
    foldNotes(nc);
    if (keep) $("#cmp-chart").innerHTML = keep;
    bindCompare(d);
    window.scrollTo(0, y);
    keepTap();
  };
  document.querySelectorAll("[data-cmp-del]").forEach((b) => b.addEventListener("click", () => {
    COMPARE[market] = cmpItems(d).filter((k) => k !== b.dataset.cmpDel); redraw();
  }));
  const res = $("#cmp-res");
  if (res) res.addEventListener("toggle", (e) => { if (e.target.id === "cmp-idx") cmpIdxOpen = e.target.open; }, true);
  if (res) res.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmp-add]");
    if (!b) return;
    COMPARE[market] = cmpItems(d).concat(b.dataset.cmpAdd).slice(0, CMP_MAX);
    cmpQuery = ""; redraw();
  });
  // 글자를 칠 때는 결과 칸만 다시 그려요 (검색창은 그대로 둬서 키보드가 안 닫혀요)
  const q = $("#cmp-q");
  if (q) q.addEventListener("input", () => { cmpQuery = q.value; const r = $("#cmp-res"); if (r) r.innerHTML = cmpResults(d); });
  document.querySelectorAll("[data-cmp-f]").forEach((b) => b.addEventListener("click", () => { cmpF = b.dataset.cmpF; redraw(); }));
  document.querySelectorAll("[data-cmp-line]").forEach((b) => b.addEventListener("click", () => { cmpLine = b.dataset.cmpLine === "1"; redraw(); }));  // 보던 구간은 그대로
  drawCompare(d);
  // 전 종목 목록은 처음 열 때 받아요. 다른 시장 종목은 받은 뒤 이름을 채워요.
  if (!SYM.kr || !SYM.us) loadSymbols().then(() => {
    if (!$("#cmp-card")) return;
    const r = $("#cmp-res"); if (r) r.innerHTML = cmpResults(d);
    const c = $("#cmp-chips"); if (c && cmpItems(d).some((k) => k[0] === "s")) c.querySelectorAll("[data-cmp-del]").forEach((b, i) => {
      const k = b.dataset.cmpDel; b.childNodes[2].textContent = `${cmpName(d, k)} `; b.setAttribute("aria-label", `${cmpName(d, k)} 빼기`);
    });
  });
}

// 다른 지수 자료: indexes/<기호>.json (배포 때 stock_pages.py가 야후에서 처음부터 받은 일봉). 앱을 닫을 때까지 기억해요.
const indexFile = (sym) => sym.replace(/[^A-Za-z0-9.]/g, "");  // stock_pages.index_file과 같은 규칙
const IDX_DATA = new Map();   // 기호 → 받는 중인 Promise
const IDX_READY = new Map();  // 기호 → 받은 자료 (못 받았으면 null)
let idxDrawn = null;          // 마지막으로 그린 지수 (바뀌면 보던 구간을 처음으로)
function idxData(sym) {
  if (!IDX_DATA.has(sym)) {
    IDX_DATA.set(sym, fetch(`indexes/${encodeURIComponent(indexFile(sym))}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        IDX_READY.set(sym, x);
        if (!x) IDX_DATA.delete(sym);  // 버튼을 다시 누르면 다시 받아요
        return x;
      }));
  }
  return IDX_DATA.get(sym);
}

// 매매 기준이 아닌 지수의 차트 칸 (참고용, 규칙 설명 없이)
function otherIndexCard(d, r) {
  const x = IDX_READY.get(r.sym), cd = x && x.candles;
  const buttons = FRAMES.map(([key, label]) =>
    `<button type="button" data-frame="${key}" aria-pressed="${key === frame}">${label}</button>`).join("");
  const since = cd && cd.dates.length ? `${cd.dates[0].slice(0, 4)}.${cd.dates[0].slice(5, 7)}부터 전체` : "";
  return `<section class="card">${idxChips(d)}<h2>${esc(r.name)} 추세 <small>${since}</small></h2>
    <div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips(cd || { v: [1] })}
    <p class="muted" id="trend-change" style="margin:8px 0 4px"></p>${candleLegend()}
    <div class="chart candle" id="trend-chart"><p class="empty">차트를 불러오는 중이에요…</p></div>
    <p class="muted" id="trend-all" style="margin:8px 0 0"></p>
    <p class="muted note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려요.
      이 지수는 참고로만 봐요.</p>${indHelp()}</section>`;
}

function trendCard(d) {
  if (!d.daily) return "";
  const r = chartIdx(d);
  if (r.sym !== OWN_IDX[market]) return otherIndexCard(d, r);
  const cd = d.daily.candles;
  const buttons = FRAMES.map(([key, label]) =>
    `<button type="button" data-frame="${key}" aria-pressed="${key === frame}">${label}</button>`).join("");
  return `<section class="card">${idxChips(d)}<h2>${esc(d.index_name)} 추세</h2>
    ${cd ? `<div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips(cd)}` : ""}
    <p class="muted" id="trend-change" style="margin:8px 0 4px"></p>
    ${cd ? candleLegend() : `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--series-1)"></i>${esc(d.index_name)}</span>
      <span class="key"><i class="sw" style="background:var(--series-2)"></i>50일선</span>
      <span class="key"><i class="sw" style="background:var(--series-3)"></i>200일선</span></div>`}
    <div class="chart candle" id="trend-chart"></div>
    <p class="muted note" style="margin:8px 0 0">${cd
      ? "옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그 기간의 시가·고가·저가·종가가 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 세부정보가 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요. "
      : ""}</p>${cd ? indHelp() : ""}</section>`;
}

function candleLegend() {
  return `<div class="legend">
      <span class="key"><i class="sw" style="background:var(--c-up)"></i>상승</span>
      <span class="key"><i class="sw" style="background:var(--c-down)"></i>하락</span>
      ${IND.ma ? maKeys() : ""}
      ${IND.bb ? `<span class="key"><i class="sw" style="background:var(--bb)"></i>볼린저밴드</span>` : ""}</div>${IND.ma && maOpen ? maPanel() : ""}`;
}

// 이동평균선 표시: 누르면 설정 창이 열리고 닫혀요
function maKeys() {
  const on = MA_SET.map((m, i) => (m.on ? `<span class="key"><i class="sw" style="background:${MA_COLORS[i]}"></i>${m.p}일선</span>` : "")).join("");
  return `<button type="button" class="ma-key ma-edit" aria-expanded="${maOpen}">${on || "이동평균선 꺼짐"}</button>`;
}
function maPanel() {
  const rows = MA_SET.map((m, i) => `<div class="ma-row">
      <i class="sw" style="background:${MA_COLORS[i]}"></i>
      <button type="button" class="ma-step" data-ma-step="${i}" data-d="-1" aria-label="${m.p}일선 기간 줄이기">−</button>
      <input type="number" inputmode="numeric" min="2" max="${MA_MAX}" value="${m.p}" data-ma-p="${i}" aria-label="${i + 1}번 선 기간(일)">
      <button type="button" class="ma-step" data-ma-step="${i}" data-d="1" aria-label="${m.p}일선 기간 늘리기">+</button>
      <span class="ma-unit">일선</span>
      <button type="button" class="ma-on" data-ma-on="${i}" aria-pressed="${m.on}">${m.on ? "켜짐" : "꺼짐"}</button>
    </div>`).join("");
  return `<div class="ma-panel" role="group" aria-label="이동평균선 설정">
    <div class="ma-head"><b>이동평균선</b><span class="muted">기간은 일 단위 (2~${MA_MAX}일)</span></div>${rows}
    <div class="ma-quick">${[[5, 20, 60, 120], [20, 60, 120, 200], [5, 20, 50, 200]].map((q) =>
      `<button type="button" data-ma-quick="${q.join(",")}">${q.join("·")}</button>`).join("")}</div>
    <div class="ma-foot"><button type="button" data-ma-reset>처음대로 (50·200)</button><button type="button" data-ma-close>닫기</button></div>
    <p class="muted note">모든 종목·지수 차트에 같이 적용되고 이 폰에 기억해요. 년봉엔 안 그려요.</p></div>`;
}
function saveMa() {
  try { localStorage.setItem("ma_set", JSON.stringify(MA_SET)); } catch (e) { /* 이번만 기억 */ }
  render();  // 보던 구간·확대는 그대로 두고 선만 다시 그려요
}
function bindMa(root) {
  root.querySelectorAll(".ma-edit").forEach((b) => b.addEventListener("click", () => { maOpen = !maOpen; render(); }));
  root.querySelectorAll("[data-ma-close]").forEach((b) => b.addEventListener("click", () => { maOpen = false; render(); }));
  root.querySelectorAll("[data-ma-on]").forEach((b) => b.addEventListener("click", () => {
    const m = MA_SET[Number(b.dataset.maOn)]; m.on = !m.on; saveMa();
  }));
  root.querySelectorAll("[data-ma-step]").forEach((b) => b.addEventListener("click", () => {
    const m = MA_SET[Number(b.dataset.maStep)];
    m.p = Math.max(2, Math.min(MA_MAX, m.p + Number(b.dataset.d))); m.on = true; saveMa();
  }));
  root.querySelectorAll("[data-ma-p]").forEach((inp) => inp.addEventListener("change", () => {
    const m = MA_SET[Number(inp.dataset.maP)], v = Math.round(Number(inp.value));
    if (Number.isFinite(v) && v >= 2) { m.p = Math.min(MA_MAX, v); m.on = true; }
    saveMa();
  }));
  root.querySelectorAll("[data-ma-quick]").forEach((b) => b.addEventListener("click", () => {
    MA_SET = b.dataset.maQuick.split(",").map((p) => ({ p: Number(p), on: true })); saveMa();
  }));
  root.querySelectorAll("[data-ma-reset]").forEach((b) => b.addEventListener("click", () => {
    MA_SET = MA_DEFAULT.map((m) => ({ ...m })); saveMa();
  }));
}

// 보조지표 버튼 (여러 개 같이 켤 수 있어요). 거래량 자료가 없는 예전 기록이면 거래량 버튼은 못 눌러요.
function indChips(cd) {
  const chips = IND_KEYS.map(([k, label]) => {
    const off = k === "vol" && !(Array.isArray(cd.v) && cd.v.length);
    return `<button type="button" data-ind="${k}" aria-pressed="${IND[k] && !off}"${off ? " disabled" : ""}>${label}</button>`;
  }).join("");
  return `<div class="chips" role="group" aria-label="보조지표">${chips}</div>`;
}

const IND_HELP = {
  bb: "볼린저밴드: 가운데 점선은 최근 20개 캔들 평균, 띠는 평소 움직이는 범위(표준편차 2배)예요. 띠 밖으로 나가면 평소보다 크게 움직인 거예요.",
  vol: "거래량: 막대가 길수록 많이 사고판 날이에요. 막대가 평균선보다 훨씬 길면 평소보다 관심이 몰린 거예요.",
  rsi: "RSI(14): 최근 14개 캔들 동안 오른 힘과 내린 힘을 0~100으로 나타내요. 70 위면 많이 올라 과열, 30 아래면 많이 내린 상태로 봐요.",
};
function indHelp() {
  const items = IND_KEYS.filter(([k]) => IND[k] && IND_HELP[k]).map(([k]) => `<li>${IND_HELP[k]}</li>`);
  if (!items.length) return "";
  return `<ul class="help">${items.join("")}<li>보조지표는 지금 보는 캔들로 계산해요. 주봉이면 20주 평균, 14주 RSI예요.</li></ul>`;
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
const SAV_FIXED = [
  { key: "dep", name: "예금", price: 0, div: 3, mdd: 0, fee: 0, tax: "dep", note: "이자 연 3% 가정" },
  { key: "mine", name: "직접 입력", price: null, div: null, mdd: null, fee: 0, tax: "other", note: "아래에서 바꿔요" },
];
// 검색 아래 '자주 찾는' 버튼
const SAV_QUICK = ["kr:360750", "kr:069500", "kr:133690", "kr:458730", "kr:441680", "us:SCHD", "us:JEPI", "us:QYLD", "us:TLT", "us:TQQQ"];
const SAV_OLD = { sp500: "kr:360750", kospi: "kr:069500", ndx: "kr:133690", divg: "kr:458730", cc: "kr:441680", lev: "us:SSO",
  kolev: "kr:122630", krbond: "kr:114260", usbond: "us:TLT" };  // 예전 버튼 → 실제 종목
// 종목 색: 앞 8개는 정해진 색, 그 뒤로는 색상환을 황금각(137.5°)씩 돌려 서로 멀게
const SAV_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--bb)", "var(--ma50)", "#d6457a", "#1f9fb8", "#8a6d3b"];
const savColor = (i) => SAV_COLORS[i] || `hsl(${Math.round((i * 137.5) % 360)} 60% 50%)`;
// 절세 계좌: 여러 개 같이 고를 수 있고, 위에서부터 한도만큼 채운 뒤 남는 돈은 다음 계좌, 마지막은 일반 계좌로 넣어요.
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
const RET = { kr: null, us: null };  // {코드: [시작, 주가 %, 배당 %, 낙폭 %, 햇수]}
let retLoading = null;
function loadReturns() {
  if (!retLoading) {
    retLoading = Promise.all(["kr", "us"].map((m) => fetch(`symbols/${m}_returns.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => {
        RET[m] = (x && x.s) || {};
        RET_IDX[m] = (x && x.idx) || null;  // 폭락 대비 점검: 지수의 하락장 낙폭
        if (x && x.crises) CRISES = x.crises;
      })));
  }
  return retLoading;
}
// 국내 ETF 중 해외 주식·채권·원자재·커버드콜(합성)은 차익에 세금이 붙어요. 이름으로 가려요
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
// 지금 가격(원화로 1주 얼마). 미장은 환율로 바꿔요. 예금·직접 입력처럼 가격이 없으면 null
function savPx(p) {
  if (!p.m || !p.code) return null;
  const q = QUOTES[p.m] && QUOTES[p.m].q[p.code];
  const dash = !q && DATA.markets[p.m] && stocksOf(DATA.markets[p.m]).find((x) => x.code === p.code);
  const px = (q && q[0]) || (dash && dash.close);
  if (!px) return null;
  const day = q ? QUOTES[p.m].day : DATA.markets[p.m].daily && DATA.markets[p.m].daily.day;
  const fx = p.m === "us" ? DATA.fx || 1350 : 1;
  return { px, fx, day, won: px * fx };
}
// 주 수로 살 때 얼마나 자주: 한 달에 몇 번인지 (매주는 52주/12달, 매일은 장 서는 날 252일/12달)
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
  const save = () => { try { localStorage.setItem("savings", JSON.stringify(SAV)); } catch (e) { /* 이번만 */ } };
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

// 실전 첫 계좌 체크리스트: 판정표를 통과한 뒤 진짜 돈으로 넘어가는 순서. 1번은 판정표로 자동, 나머지는 눌러서 체크(이 폰에만 저장).
// 세계 지수·환율 (world.py, 국장·미장 같이). 보기용이고 매매 규칙엔 안 써요.
// 한눈에 보기 (사용자 2026-10-24): 묶음 탭 + 3칸 타일. 타일 색이 진할수록 많이 움직인 거예요. 누르면 아래에 그래프.
// 한국·미국 지수는 탭과 상관없이 늘 맨 위에 (사용자 2026-10-24 "이전처럼 두되")
const WORLD_FIXED = ["한국", "미국"];
const WORLD_TABS = [
  ["main", "주요", ["KRW=X", "^TNX", "US10Y2Y", "CL=F", "GC=F", "^VIX"]],
  ["asia_eu", "아시아·유럽", ["아시아", "유럽"]],
  ["fx", "환율", ["환율"]],
  ["rate", "금리", ["채권 금리"]],
  ["goods", "원자재·리츠", ["원자재", "리츠·부동산"]],
  ["coin", "공포·코인", ["공포·코인"]],
];
let worldTab = "main";
try { worldTab = localStorage.getItem("world_tab") || "main"; } catch (e) { /* 처음 */ }
if (!WORLD_TABS.some((t) => t[0] === worldTab)) worldTab = "main";  // 옛 '한국·미국' 탭은 주요로
// 타일엔 짧은 이름 (그래프를 펼치면 원래 이름)
const WORLD_SHORT = {
  "^SOX": "필라 반도체", "^N225": "닛케이225", "000001.SS": "상하이", "^HSI": "항셍", "^TWII": "대만 가권",
  "^STOXX50E": "유로스톡스50", "^GDAXI": "독일 DAX", "^FTSE": "영국 FTSE", "JPYKRW=X": "원/엔(100)",
  "US2Y": "미 2년 금리", "^TNX": "미 10년 금리", "US10Y2Y": "장단기 금리 차", "KR3Y": "국고채 3년", "KR10Y": "국고채 10년",
  "TLT": "미 장기채 TLT", "CL=F": "WTI 유가", "GC=F": "금", "HG=F": "구리", "VNQ": "미 리츠 VNQ", "329200.KS": "국내 리츠",
  "^VIX": "VIX 공포", "BTC-USD": "비트코인", "DX-Y.NYB": "달러인덱스",
};
function worldValue(r, short = false) {
  const big = Math.abs(r.last) >= 10000;
  const v = r.last.toLocaleString("ko-KR", { minimumFractionDigits: big && short ? 0 : 2, maximumFractionDigits: big && short ? 0 : 2 });
  if (short) return r.kind === "rate" ? `${v}%` : v;  // 타일은 좁아서 원·달러를 빼요 (이름에 있어요)
  return r.kind === "krw" ? `${v}원` : r.kind === "rate" ? `${v}%` : r.kind === "usd" ? `${v}달러` : v;
}
// 등락: 금리는 % 대신 몇 %p 바뀌었는지 (4%→4.5%는 +0.50%p)
const worldChg = (r, v) => (r.kind === "rate" ? (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%p`) : pct(v, 2));
const worldMove = (r, c) => (r.kind === "rate" ? c[c.length - 1] - c[0] : c[c.length - 1] / c[0] - 1);
// 타일 색: 기간마다 '가장 진한 색'이 되는 움직임 (오늘 2%, 1주 4%, 1개월 8%, 1년 25%. 금리는 %p로 그 1/20)
const WORLD_FULL = { d1: 0.02, w1: 0.04, m1: 0.08, y1: 0.25 };
function worldTint(r, v) {
  if (v == null || Math.abs(v) < 1e-9) return "";
  const full = WORLD_FULL[worldP] * (r.kind === "rate" ? 5 : 1);  // 금리 0.1%p(오늘)면 가장 진해요
  const a = Math.round((Math.min(1, Math.abs(v) / full) * 0.3 + 0.05) * 100);
  return `background:color-mix(in srgb, var(${v > 0 ? "--up" : "--down"}) ${a}%, var(--surface-0))`;
}
// 줄을 누르면 바로 아래에 그 지수·환율 그래프가 펼쳐져요 (다시 누르면 접혀요). 지수는 차트 화면 캔들로도 갈 수 있어요
let worldPicks = new Set(), worldTop = null;
const WORLD_G = [["m1", "1개월", 22], ["m3", "3개월", 66], ["m6", "6개월", 130], ["y1", "1년", 0]];
let worldG = "m3";
try { worldG = localStorage.getItem("world_g") || "m3"; } catch (e) { /* 처음 */ }
if (!WORLD_G.some((p) => p[0] === worldG)) worldG = "m3";
function worldTile(r, cur) {
  const [key] = WORLD_P.find((p) => p[0] === worldP);
  const open = cur === `t:${r.sym}`, v = r[key];
  return `<button type="button" class="wt${open ? " on" : ""}" data-world="t:${esc(r.sym)}" aria-expanded="${open}" style="${worldTint(r, v)}"
    aria-label="${esc(r.name)} ${worldValue(r)} ${worldChg(r, v)}"><span class="wt-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span>
    <b class="wt-v">${worldValue(r, true)}</b><span class="wt-c ${sign(v)}">${worldChg(r, v)}</span></button>`;
}
function worldGraph(r, id = "world-chart") {
  const [, , n] = WORLD_G.find((p) => p[0] === worldG);
  const c = n ? r.closes.slice(-n) : r.closes;
  const ch = c.length > 1 ? worldMove(r, c) : null;
  const hi = Math.max(...c), lo = Math.min(...c);
  const chips = WORLD_G.map(([k, l]) => `<button type="button" data-world-g="${k}" aria-pressed="${k === worldG}">${l}</button>`).join("");
  const toChart = r.kind === "idx" ? `<button type="button" class="more" data-world-chart="${esc(r.sym)}">${esc(r.name)} 캔들 차트로 크게 보기<span aria-hidden="true">›</span></button>` : "";
  return `<div class="world-graph"><div class="wg-head"><b>${esc(r.name)}</b><span class="muted">${worldValue(r)} · ${md(r.day)} 종가</span></div>
    <div class="period" role="group" aria-label="그래프 기간">${chips}</div>
    <p class="muted" style="margin:8px 0 4px">${ch == null ? "" : `이 기간 <b class="${sign(ch)}">${worldChg(r, ch)}</b> · `}최고 ${worldValue({ ...r, last: hi })} · 최저 ${worldValue({ ...r, last: lo })}</p>
    <div class="chart" id="${id}" data-sym="${esc(r.sym)}"></div>${toChart}</div>`;
}
function drawWorldGraph() {
  document.querySelectorAll("#app .world-graph .chart[data-sym]").forEach((el) => drawWorldChart(el, el.dataset.sym));
}
function drawWorldChart(el, sym) {
  const w = DATA && DATA.world;
  if (!el || !w) return;
  const r = w.groups.flatMap((g) => g.items).find((x) => x.sym === sym);
  if (!r) return;
  const [, , n] = WORLD_G.find((p) => p[0] === worldG);
  const c = n ? r.closes.slice(-n) : r.closes;
  // 옛 자료엔 날짜가 없어서 'N일 전'으로 써요 (world 워크플로가 한 번 돌면 날짜가 생겨요)
  const dates = r.dates && r.dates.length === r.closes.length ? (n ? r.dates.slice(-n) : r.dates) : c.map((_, i) => (i === c.length - 1 ? r.day : `${c.length - 1 - i}거래일 전`));
  const digits = Math.max(...c) >= 1000 ? 0 : 2;
  lineChart(el, {
    dates,
    xfmt: (s) => (/^\d{4}-/.test(s) ? s.slice(2).replace(/-/g, ".") : s),
    series: [{ name: r.name, color: c[c.length - 1] >= c[0] ? "var(--up)" : "var(--down)", values: c }],
    fmt: (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  });
}
// 홈 맨 위 얇은 바: 한국·미국 말고 나머지 지수·환율이 3초마다 하나씩 바뀌어요. 높이는 늘 같아서 화면이 안 밀려요 (바는 따라 내려오지 않아요)
let tickAt = 0, tickTimer = 0;
function tickItems() {
  const w = DATA && DATA.world;
  if (!w || !w.groups) return [];
  const all = w.groups.flatMap((g) => g.items);
  const order = WORLD_TABS.find((t) => t[0] === "main")[2].map((s) => all.find((r) => r.sym === s)).filter(Boolean);
  return order.concat(w.groups.filter((g) => !WORLD_FIXED.includes(g.name)).flatMap((g) => g.items).filter((r) => !order.includes(r)));
}
function tickHTML(r) {
  return `<span class="wk-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span><b class="wk-v">${worldValue(r, true)}</b><span class="wk-c ${sign(r.d1)}">${worldChg(r, r.d1)}</span>`;
}
function worldTicker() {
  const list = tickItems();
  if (!list.length) return "";
  tickAt %= list.length;
  return `<button type="button" class="wtick" data-go="world" aria-label="세계 지수·환율 전체 보기">
    <span class="wk-tag">세계</span><span class="wk-item" aria-live="off">${tickHTML(list[tickAt])}</span><span class="wk-go" aria-hidden="true">›</span></button>`;
}
function spinTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const el = $(".wtick .wk-item"), list = tickItems();
    if (!el || !list.length || screen !== "home") { clearInterval(tickTimer); return; }
    if (document.hidden) return;
    tickAt = (tickAt + 1) % list.length;
    if (calm()) { el.innerHTML = tickHTML(list[tickAt]); return; }
    el.classList.add("out");
    setTimeout(() => { el.innerHTML = tickHTML(list[tickAt]); el.classList.remove("out"); }, 220);
  }, 3000);
}
// 홈엔 한국·미국 지수만 (이전처럼). 나머지는 맨 위 바를 눌러 세계 지수 화면에서
function worldHomeCard() {
  const w = DATA.world;
  if (!w || !w.groups || !w.groups.length) return "";
  const [, label] = WORLD_P.find((p) => p[0] === worldP);
  const period = `<div class="period" role="group" aria-label="등락 기간">${WORLD_P.map(([k, l]) =>
    `<button type="button" data-world-p="${k}" aria-pressed="${k === worldP}">${l}</button>`).join("")}</div>`;
  const fixed = w.groups.filter((g) => WORLD_FIXED.includes(g.name)).flatMap((g) => g.items);
  if (!fixed.length) return "";
  const pickedFixed = worldTop && fixed.find((r) => `t:${r.sym}` === worldTop);
  const up = fixed.filter((r) => r[worldP] > 0).length, down = fixed.filter((r) => r[worldP] < 0).length;
  return `<section class="card" id="world-card"><h2>한국·미국 지수 <small>${md(w.updated)} ${esc(w.updated.slice(11, 16))} 기준</small></h2>
    <div class="wt-bar">${period}<span class="muted">${label} <span class="up">▲${up}</span> <span class="down">▼${down}</span></span></div>
    <div class="wt-grid">${fixed.map((r) => worldTile(r, worldTop)).join("")}</div>${pickedFixed ? worldGraph(pickedFixed, "world-chart-top") : ""}
    <button type="button" class="more" data-go="world">세계 지수·환율 전체 보기<span aria-hidden="true">›</span></button></section>`;
}
// 세계 지수 화면은 따로 열리는 넓은 공간이라 색칸 대신 한 줄에 하나씩 작은 그래프로 (사용자 2026-10-24)
function worldRow(r) {
  const [key, , n, glabel] = WORLD_P.find((p) => p[0] === worldP);
  const open = worldPicks.has(`t:${r.sym}`), v = r[key];
  const c = n ? r.closes.slice(-n) : r.closes;
  const line = spark(c, `${r.name} ${glabel} 흐름`);
  return `<button type="button" class="wr${open ? " on" : ""}" data-world="t:${esc(r.sym)}" aria-expanded="${open}"
    aria-label="${esc(r.name)} ${worldValue(r)} ${worldChg(r, v)}"><span class="wr-l"><span class="wr-n">${esc(WORLD_SHORT[r.sym] || r.name)}</span>
    <b class="wr-v">${worldValue(r)}</b></span><span class="wr-s">${line}</span><span class="wr-c ${sign(v)}">${worldChg(r, v)}</span></button>${open ? worldGraph(r, `world-chart-${r.sym.replace(/[^A-Za-z0-9]/g, "_")}`) : ""}`;
}
// 세계 지수 화면: 묶음 탭 + 줄마다 작은 그래프 (한국·미국은 홈에 있어서 여기선 탭만)
function worldCard() {
  const w = DATA.world;
  if (!w || !w.groups || !w.groups.length) return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button><p class="empty">아직 세계 지수 기록이 없어요.</p></section>`;
  const all = w.groups.flatMap((g) => g.items);
  const [, label] = WORLD_P.find((p) => p[0] === worldP);
  const [, , pick] = WORLD_TABS.find((t) => t[0] === worldTab);
  // 주요 탭은 기호 목록, 나머지는 world.py 묶음 이름
  const items = worldTab === "main" ? pick.map((s) => all.find((r) => r.sym === s)).filter(Boolean)
    : w.groups.filter((g) => pick.includes(g.name)).flatMap((g) => g.items);
  const tabs = WORLD_TABS.filter(([k, , p]) => k === "main" || w.groups.some((g) => p.includes(g.name)))
    .map(([k, l]) => `<button type="button" data-world-tab="${k}" aria-pressed="${k === worldTab}">${l}</button>`).join("");
  const period = `<div class="period" role="group" aria-label="등락 기간">${WORLD_P.map(([k, l]) =>
    `<button type="button" data-world-p="${k}" aria-pressed="${k === worldP}">${l}</button>`).join("")}</div>`;
  const up = items.filter((r) => r[worldP] > 0).length, down = items.filter((r) => r[worldP] < 0).length;
  return `<section class="card" id="world-card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <h2 class="stock-name">세계 지수·환율 <small>${md(w.updated)} ${esc(w.updated.slice(11, 16))} 기준</small></h2>
    <div class="wt-tabs" role="group" aria-label="묶음 고르기">${tabs}</div>
    <div class="wt-bar">${period}<span class="muted">${label} <span class="up">▲${up}</span> <span class="down">▼${down}</span></span></div>
    <div class="wr-list">${items.map(worldRow).join("")}</div>
    <p class="muted note" style="margin:10px 0 0">줄마다 작은 그래프는 최근 ${WORLD_P.find((p) => p[0] === worldP)[3]} 흐름이에요. 누르면 큰 그래프가 열려요. 금리는 몇 %p 바뀌었는지, 장단기 금리 차가 마이너스면 '역전'(경기 침체 앞에 자주 나왔어요), VIX는 20을 넘으면 불안이 커진 거예요. 원/달러가 오르면 원화 약세예요. 미국 2년 금리·장단기 차는 FRED, 나머지는 야후 자료이고 나라마다 마감 시간이 달라 날짜가 다를 수 있어요.</p></section>`;
}

// 경기 국면 (macro.py, 국장·미장 같이). 매매 규칙엔 안 쓰고 참고로만 보여 줘요.
function macroCard() {
  const m = DATA.macro;
  if (!m) return "";
  const chip = m.regime === "확장"
    ? `<span class="chip good">● 확장</span>` : `<span class="chip wait">■ ${esc(m.regime)}</span>`;
  const mark = (s) => (s.warn ? "⚠️" : s.near ? "🟡" : "✅");
  const items = m.signals.map((s) => `<li><div class="l"><div class="name">${mark(s)} ${esc(s.name)}</div>
      <div class="meta">${esc(s.now)}</div><div class="meta">경고 기준: ${esc(s.rule)}</div></div></li>`).join("");
  const us = (m.us_economy || []).map((r) => `<li><div class="l"><div class="name">${r.warn ? "⚠️" : "·"} ${esc(r.name)}</div>
      <div class="meta">${esc(r.value)} · ${esc(r.note)}</div></div></li>`).join("");
  const hist = (m.history || []).slice(-12).map((h) => h.score).join(" ");
  const change = m.month_ago !== m.score ? ` · 한 달 전 ${m.month_ago}개(${esc(m.prev_regime)})` : "";
  return `<section class="card"><h2>경기 국면 <small>${md(m.day)} 기준 · 참고</small></h2>${chip}
    <p class="headline">경고 ${m.score}/${m.total}개${change}</p><p class="sub">${esc(m.action)}</p>
    <details style="margin-top:10px"><summary class="muted">지표 ${m.total}개 자세히 보기</summary>
      <ul class="list" style="margin-top:8px">${items}</ul>
      ${us ? `<h3 class="muted" style="margin:10px 0 4px">미국 경제 참고 (FRED)</h3><ul class="list">${us}</ul>` : ""}
      ${hist ? `<p class="muted" style="margin:10px 0 0">최근 12주 경고 개수: ${hist}</p>` : ""}
    </details>
    <p class="muted note" style="margin:10px 0 0">경고 0~1개 확장, 2~3개 둔화, 4개↑ 위축 경고. 백테스트에서 이걸로 매수를 줄여도 낙폭이 안 줄어서 규칙은 안 바꿔요.</p></section>`;
}

// 정부 정책 (policies.py, paper/policies.json을 손으로 정리 + 매일 뉴스 제목). 접힌 줄엔 제목과 영향 업종만,
// 누르면 쉬운 설명·업종별 이유·다음 일정·최근 뉴스·출처가 펼쳐져요. 참고용이고 매매 규칙엔 안 써요.
const POL_REGION = { kr: ["🇰🇷", "국내"], us: ["🇺🇸", "미국"], world: ["🌍", "세계"] };
const POL_TONE = { 1: ["good", "▲", "호재"], "-1": ["bad", "▼", "악재"], 0: ["", "◆", "엇갈림"] };
let polR = "";
try { polR = localStorage.getItem("pol_r") || ""; } catch (e) { /* 처음 */ }
const POL_OPEN = new Set();
let polJump = null;
let polMore = false;
const POL_FIRST = 5;  // 처음엔 정책 5개만, 나머지는 '더 보기'
function polPill(e) {
  const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
  return `<span class="pol-pill ${cls}" title="${esc(word)}">${mark} ${esc(e.sector)}</span>`;
}
function policyRow(p) {
  const [flag, region] = POL_REGION[p.region] || ["", ""];
  const next = p.next ? ` · ${esc(p.next_note || "다음 일정")} ${md(p.next)} <b>${dday(p.next)}</b>` : p.next_note ? ` · 지켜볼 것: ${esc(p.next_note)}` : "";
  const fx = (p.effects || []).map((e) => {
    const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
    return `<li data-sector-go="${esc(e.sector)}"><div class="l"><div class="name"><span class="badge ${cls}">${mark} ${word}</span> ${esc(e.sector)}</div>
      <div class="meta">${esc(e.why)}</div></div><div class="r meta">업종 ›</div></li>`;
  }).join("");
  const link = (u, t) => /^https:\/\//.test(u || "") ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);
  const news = (p.news || []).map((n) => `<li><div class="l"><div class="meta">📰 ${link(n.link, n.title)}${n.source ? ` · ${esc(n.source)}` : ""}${n.date ? ` · ${md(n.date)}` : ""}</div></div></li>`).join("");
  const src = (p.sources || []).map((x) => link(x.url, x.name)).join(" · ");
  return `<details class="pol" data-pol="${esc(p.id)}"${POL_OPEN.has(p.id) ? " open" : ""}><summary>
      <div class="pol-title">${flag} ${esc(p.title)}</div>
      <div class="pol-sub"><span class="badge">${esc(p.status || region)}</span> ${md(p.date)}${p.next ? ` · 다음 ${md(p.next)} ${dday(p.next)}` : ""}</div>
      <div class="pol-fx">${(p.effects || []).map((e) => polPill(e)).join("")}</div></summary>
    <div class="pol-body">
      <p class="pol-sum">${esc(p.summary)}</p>
      <p class="meta" style="margin:6px 0 0">📅 ${region} · ${esc(p.status || "")} ${p.date}${next}</p>
      ${fx ? `<h3 class="muted" style="margin:12px 0 4px">영향 받는 업종 <small>누르면 업종 칸으로</small></h3><ul class="list">${fx}</ul>` : ""}
      ${news ? `<h3 class="muted" style="margin:12px 0 4px">최근 7일 뉴스</h3><ul class="list">${news}</ul>` : ""}
      ${src ? `<p class="meta pol-src">출처: ${src}</p>` : ""}
    </div></details>`;
}
function policyCard() {
  const P = DATA && DATA.policies;
  if (!P || !P.items || !P.items.length) return "";
  if (polR && !P.items.some((p) => p.region === polR)) polR = "";
  const shown = P.items.filter((p) => !polR || p.region === polR);
  const count = (r) => P.items.filter((p) => p.region === r).length;
  const chips = `<div class="chips" role="group" aria-label="지역 고르기" style="margin-bottom:8px">
    <button type="button" data-pol-r="" aria-pressed="${!polR}">전체</button>
    ${Object.entries(POL_REGION).filter(([r]) => count(r)).map(([r, [f, n]]) => `<button type="button" data-pol-r="${r}" aria-pressed="${polR === r}">${f} ${n}</button>`).join("")}</div>`;
  // 한눈에: 지금 고른 정책들로 업종마다 호재·악재 개수를 세서 많은 순으로
  const tally = {};
  shown.forEach((p) => (p.effects || []).forEach((e) => {
    const t = tally[e.sector] || (tally[e.sector] = [0, 0]);
    if (e.tone > 0) t[0] += 1; else if (e.tone < 0) t[1] += 1;
  }));
  const rows = Object.entries(tally);
  const top = (k) => rows.filter(([, t]) => t[k] > t[1 - k]).sort((a, b) => b[1][k] - a[1][k] || a[1][1 - k] - b[1][1 - k]).slice(0, 4)
    .map(([n, t]) => `<button type="button" class="pol-pill ${k ? "bad" : "good"}" data-sector-go="${esc(n)}">${k ? "▼" : "▲"} ${esc(n)} ${t[k]}</button>`).join("");
  const good = top(0), bad = top(1);
  const glance = good || bad ? `<div class="pol-glance">
      ${good ? `<div><span class="muted">호재 많은 업종</span><div class="pol-fx">${good}</div></div>` : ""}
      ${bad ? `<div><span class="muted">악재 많은 업종</span><div class="pol-fx">${bad}</div></div>` : ""}</div>` : "";
  const stale = P.stale ? `<p class="pol-stale">⚠️ 정책 목록을 ${md(P.reviewed)} 뒤로 다시 정리하지 않았어요. 바뀐 정책이 있을 수 있어요.</p>` : "";
  return `<section class="card" id="policy-card"><h2>정부 정책 <small>${md(P.reviewed)} 정리 · 참고</small></h2>${chips}${stale}${glance}
    <div class="pol-list">${shown.slice(0, POL_FIRST).map(policyRow).join("")}</div>
    ${shown.length > POL_FIRST ? `<details id="pol-more" class="more-list"${polMore || shown.slice(POL_FIRST).some((p) => POL_OPEN.has(p.id)) ? " open" : ""}><summary class="muted">정책 ${shown.length - POL_FIRST}개 더 보기</summary>
      <div class="pol-list">${shown.slice(POL_FIRST).map(policyRow).join("")}</div></details>` : ""}
    <p class="muted note" style="margin:10px 0 0">정책을 누르면 쉬운 설명·업종별 이유·다음 일정·출처가 펼쳐져요. ▲ 호재 ▼ 악재 ◆ 엇갈림은 정책 내용으로 짐작한 거예요. 정책 목록은 손으로 정리하고, 뉴스 제목은 매일 아침 자동으로 붙어요${P.news_day ? ` (${md(P.news_day)})` : ""}. 매매 규칙은 안 바꿔요.</p></section>`;
}
// 업종 칸·종목 화면에 붙는 '관련 정부 정책' (접어서)
function sectorPolicies(name, open) {
  const P = DATA && DATA.policies;
  if (!P || !name) return "";
  const mine = (P.items || []).map((p) => [p, (p.effects || []).find((e) => e.sector === name)]).filter(([, e]) => e);
  if (!mine.length) return "";
  const rows = mine.map(([p, e]) => {
    const [cls, mark, word] = POL_TONE[e.tone] || POL_TONE[0];
    return `<li data-pol-go="${esc(p.id)}"><div class="l"><div class="name">${(POL_REGION[p.region] || [""])[0]} ${esc(p.title)}</div>
      <div class="meta"><span class="badge ${cls}">${mark} ${word}</span> ${esc(e.why)}</div></div></li>`;
  }).join("");
  const g = mine.filter(([, e]) => e.tone > 0).length, b = mine.filter(([, e]) => e.tone < 0).length;
  return `<details class="more-list pol-sec"${open ? " open" : ""}><summary>🏛️ 관련 정부 정책 ${mine.length}개 · ▲${g} ▼${b}</summary><ul class="list">${rows}</ul></details>`;
}

// 업종별 호재·악재 (sectors.py). 버튼으로 업종을 고르면 그 업종만 자세히, 관심 화면 전체 종목도 그 업종만 보여 줘요.
function sectorChips(list, current) {
  const btn = (name, label) => `<button type="button" data-sector="${esc(name)}" aria-pressed="${current === name}">${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="업종 고르기" style="margin-bottom:8px">${btn("", "전체")}${list.map((n) => btn(n, n)).join("")}</div>`;
}
function toneBadge(s) {
  if (!s.news || !s.news.length) return "";
  const cls = s.good > s.bad ? "good" : s.bad > s.good ? "bad" : "";
  return `<span class="badge ${cls}">${esc(s.label)}</span>`;
}
// 공시 (disclosures.py, 오픈DART). ⚠️ 주의(유상증자·전환사채 등), 🔍 지분 변동, 👍 좋은 편(자사주 매입·배당 등)
const DIS_ICON = { warn: "⚠️", check: "🔍", good: "👍" };
const DIS_LINK = (no) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(no)}`;
function disRow(x, withName) {
  return `<li><div class="l"><div class="name">${DIS_ICON[x.tone] || "📄"} ${withName ? `${esc(x.name)} · ` : ""}<a href="${DIS_LINK(x.no)}" target="_blank" rel="noopener">${esc(x.title)}</a></div>
    <div class="meta">${md(x.day)}${x.by && x.by !== x.name ? ` · ${esc(x.by)}` : ""}</div></div></li>`;
}
function discloseStockCard(d) {
  if (market !== "kr" || !d.disclosures) return "";
  const mine = d.disclosures.filter((x) => x.code === stockCode);
  if (!mine.length) return "";
  return `<section class="card"><h2>최근 공시 <small>30일 · 금감원 전자공시</small></h2><ul class="list">${mine.map((x) => disRow(x, false)).join("")}</ul>
    <p class="muted note" style="margin:8px 0 0">⚠️ ${term("유상증자")}·${term("전환사채")}·최대주주 변경 같은 공시는 주가가 내릴 때가 많아요. 👍 ${term("자사주 매입")}·배당은 좋은 소식일 때가 많아요. 제목을 누르면 원문이 열려요.</p></section>`;
}
function discloseHomeCard(d) {
  if (market !== "kr" || !d.disclosures) return "";
  const since = new Date(Date.parse(TODAY()) - 7 * 864e5).toISOString().slice(0, 10);
  const mine = new Set([...WATCH.kr, ...(d.extras || []).map((e) => e.code)]);
  const rows = d.disclosures.filter((x) => x.day >= since && (x.tone === "warn" || x.tone === "check" || mine.has(x.code)));
  return `<section class="card"><h2>최근 공시 <small>7일 · 주의 공시와 내 종목</small></h2>
    ${rows.length ? `<ul class="list">${rows.slice(0, 8).map((x) => disRow(x, true)).join("")}</ul>` : `<p class="empty">최근 7일 동안 주의할 공시가 없어요.</p>`}
    <p class="muted note" style="margin:8px 0 0">평일 한 시간마다 금감원 전자공시를 봐요. ⚠️ 공시는 텔레그램으로 바로 와요.</p></section>`;
}

// 큰 발표 (big_events.py): CPI·고용·FOMC처럼 지수를 크게 흔드는 발표를 홈 맨 위에 눈에 띄게.
// 앞으로 48시간 일정(예상치·이전 값), 지난 24시간 결과(실제 값·예상과 비교·선물 반응), 24시간 안의 지수 급변.
// 아무것도 없으면 칸을 안 보여 줘요. 텔레그램으로도 전날·1시간 전·발표 뒤에 와요.
// 장 상황 한 줄: 지금 열렸는지(시계로 계산), 마지막 자료가 언제 건지. 자료가 평일 2일 넘게 밀리면 경고.
// 휴장일 표는 없어서, 평일인데 오늘 자료가 없으면 "휴장이었거나 늦어요"라고만 해요.
const MKT_HOURS = { kr: ["Asia/Seoul", 9 * 60, 15 * 60 + 30, "국장", "15:30"], us: ["America/New_York", 9 * 60 + 30, 16 * 60, "미장", "한국 새벽"] };
function zoneNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), weekend: p.weekday === "Sat" || p.weekday === "Sun" };
}
function weekdaysBetween(a, b) {  // a 다음 날부터 b까지 평일 수
  let n = 0;
  for (let t = Date.parse(`${a}T00:00Z`) + 864e5; t <= Date.parse(`${b}T00:00Z`); t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w !== 6) n++; }
  return n;
}
function marketStatus(m) {
  const [tz, open, close, name, closeAt] = MKT_HOURS[m];
  const now = zoneNow(tz);
  const md0 = DATA.markets && DATA.markets[m];
  const last = md0 && md0.daily && md0.daily.day;
  let state, cls = "";
  if (now.weekend) state = "주말이라 쉬어요";
  else if (now.min < open) state = "열기 전";
  else if (now.min < close) { state = `장 열림 (${closeAt} 마감)`; cls = "mkt-open"; }
  else state = last === now.day ? "오늘 장 마감" : "오늘 장 마감 · 자료는 아직이거나 휴장";
  // 마감된 마지막 평일보다 평일로 2일 넘게 밀렸으면 자동 실행이 멈췄을 수 있어요
  const doneDay = !now.weekend && now.min >= close ? now.day : null;
  const behind = last ? weekdaysBetween(last, doneDay || now.day) - (doneDay ? 0 : 1) : null;
  const stale = behind != null && behind >= 2;
  return { name, state, cls, last, stale };
}
function marketStatusCard() {
  if (!DATA || !DATA.markets) return "";
  const rows = ["kr", "us"].filter((m) => DATA.markets[m]).map(marketStatus);
  const warn = rows.filter((r) => r.stale);
  return `<section class="card mkt-status${warn.length ? " stale" : ""}" id="mkt-status">
    ${rows.map((r) => `<div class="mkt-row"><b>${r.name}</b><span class="${r.cls}">${r.state}</span><small class="muted">${r.last ? `${md(r.last)} 종가 기준` : "자료 없음"}</small></div>`).join("")}
    ${warn.length ? `<p class="mkt-warn">⚠️ ${warn.map((r) => `${r.name} 자료가 ${md(r.last)} 거예요`).join(", ")}. 연휴가 아니면 자동 실행이 멈춘 거라, 숫자를 오늘 값으로 보지 마세요.</p>` : ""}</section>`;
}
function bigEventsCard() {
  const data = (DATA && DATA.events) || {};
  const now = Date.now(), H = 3600e3;
  const ev = (data.events || []).filter((e) => { const t = Date.parse(e.at); return t > now - 24 * H && t < now + 48 * H; });
  const shocks = (data.shocks || []).filter((x) => Date.parse(x.at) > now - 24 * H);
  if (!ev.length && !shocks.length) return "";
  const days = "일월화수목금토";
  const when = (iso) => { const k = new Date(Date.parse(iso) + 9 * H); return `${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")}(${days[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; };
  const left = (iso) => { const m = Math.round((Date.parse(iso) - now) / 60e3); return m <= 0 ? "발표됨" : m < 60 ? `${m}분 뒤` : m < 24 * 60 ? `${Math.floor(m / 60)}시간 뒤` : `${Math.floor(m / 1440)}일 뒤`; };
  const num = (t) => { const m = /^\s*([-+]?\d+(?:\.\d+)?)/.exec(t || ""); return m ? parseFloat(m[1]) : null; };
  const vs = (e) => {
    const a = num(e.actual), f = num(e.forecast);
    if (a === null || f === null) return "";
    const dec = ((e.forecast || "").split(".")[1] || "").replace(/[^0-9]/g, "").length;
    if (Math.abs(a - f) < Math.pow(10, -dec) / 2 + 1e-9) return `<span class="muted">예상과 같음</span>`;
    return a > f ? `<b class="big-hot">예상보다 높음</b>` : `<b class="big-cold">예상보다 낮음</b>`;
  };
  const groups = [];
  ev.forEach((e) => { const g = groups.find((x) => x.at === e.at); g ? g.items.push(e) : groups.push({ at: e.at, items: [e] }); });
  const rows = groups.map((g) => {
    const done = Date.parse(g.at) <= now, tier = g.items.some((e) => e.tier1);
    const items = g.items.map((e) => {
      const bits = [e.actual && done ? `실제 <b>${esc(e.actual)}</b>` : "", e.forecast ? `예상 ${esc(e.forecast)}` : "", e.previous ? `이전 ${esc(e.previous)}` : ""].filter(Boolean).join(" · ");
      return `<div class="big-item"><div class="name">${esc(e.flag || "")} ${esc(e.ko)}</div>${bits ? `<div class="meta">${bits} ${done && e.actual ? vs(e) : ""}</div>` : ""}</div>`;
    }).join("");
    const g0 = g.items.find((e) => e.react && e.react.length) || {};
    const news = (g.items.find((e) => e.news && e.news.length) || {}).news || [];
    const extra = done ? `${g0.react ? `<div class="meta">📈 발표 뒤 ${g0.react.map(esc).join(" · ")}</div>` : ""}
      ${news.slice(0, 2).map((n) => `<div class="meta">📰 ${esc(n.title)} <span class="muted">${esc(n.source || "")}</span></div>`).join("")}` : "";
    return `<li class="big-row${tier ? " tier1" : ""}${done ? " done" : ""}"><div class="big-when"><b>${when(g.at)}</b> <span class="pill">${left(g.at)}</span></div>${items}${extra}</li>`;
  }).join("");
  const shockRows = shocks.map((x) => `<li class="big-row tier1"><div class="big-when"><b>⚡ ${when(x.at)}</b> <span class="pill">지수 급변</span></div>
      <div class="big-item"><div class="name">${esc(x.label)} 1시간 <span class="${x.move > 0 ? "up" : "down"}">${pct(x.move)}</span></div></div>
      ${(x.news || []).slice(0, 2).map((n) => `<div class="meta">📰 ${esc(n.title)} <span class="muted">${esc(n.source || "")}</span></div>`).join("")}</li>`).join("");
  return `<section class="card big-card" id="big-card"><h2>🚨 큰 발표·지수 급변 <small>한국시간 · 참고</small></h2>
    <ul class="list big-list">${shockRows}${rows}</ul>
    <p class="muted note" style="margin:10px 0 0">물가(CPI)·고용·금리 결정처럼 지수를 크게 흔드는 발표예요. 텔레그램으로 전날, 1시간 전, 발표 뒤 결과까지 와요.
      실제 값은 FRED(미국 연준 무료 자료)에서 계산해서 공식 발표와 소수 둘째 자리가 다를 수 있어요. 매매 규칙은 그대로예요.</p></section>`;
}

// 다가오는 일정 (econ_calendar.py): 경제 일정(큰 발표·금리 결정·만기일·실적 시즌)과 종목 실적·배당 발표를 두 칸으로 나눠요 (사용자 요청 2026-10-17).
// 실적·배당 칸은 내 관심종목(★)·텔레그램으로 넣은 종목만, 나머지 대형주 실적은 개수만.
const CAL_DAYS = 14;
const EARN_DAYS = 30;  // 실적·배당은 한 달 치
const CAL_ICON = { big: "🚨", rate: "🏦", expiry: "⏳", season: "📊", earn: "📢", exdiv: "💰" };
const STOCK_KINDS = ["earn", "exdiv"];
let calAll = false;
const calMine = (e) => e.mine || (e.code && WATCH[e.market] && WATCH[e.market].includes(e.code));
function calNear(days) {
  const ev = (DATA && DATA.calendar) || [];
  const today = TODAY(), end = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  return ev.filter((e) => e.date >= today && e.date < end);
}
function calRows(list) {
  const flag = { kr: "🇰🇷", us: "🇺🇸", world: "🌐" }, days = "일월화수목금토";
  let last = "";
  return list.map((e) => {
    const head = e.date !== last ? `<li class="cal-day${e.date < TODAY() ? " past" : ""}"><b>${md(e.date)} (${days[new Date(e.date + "T00:00:00").getDay()]})</b> <span class="muted">${dday(e.date)}</span></li>` : "";
    last = e.date;
    const tap = e.code && e.market === market ? ` data-stock="${esc(e.code)}"` : "";
    const help = { rate: e.market === "us" ? "FOMC" : "금통위", expiry: "옵션 만기", season: "실적 시즌", exdiv: "배당락" }[e.kind];
    const cls = [e.big ? "cal-big" : "", e.date < TODAY() ? "past" : ""].filter(Boolean).join(" ");
    return `${head}<li${tap}${cls ? ` class="${cls}"` : ""}><div class="l"><div class="name">${e.kind === "big" && !e.big ? "📌" : CAL_ICON[e.kind] || ""} ${flag[e.market] || ""} ${help ? term(help, esc(e.title)) : esc(e.title)}${calMine(e) ? " ⭐" : ""}</div>
      ${e.note ? `<div class="meta">${esc(e.note)}</div>` : ""}</div></li>`;
  }).join("");
}
// 다가오는 일정 달력: 일정이 있는 모든 달(작년 1월~내년 12월). 지난달~5개월 뒤 버튼은 눈에 띄게.
// 칸엔 일정 표시, 아래엔 그달(또는 고른 날) 목록. 지난 일정은 연하게
const ECON_NEAR = 6;
let econMonth = null, econPick = null;
const ymAdd = (ym, k) => { const [y, m] = ym.split("-").map(Number), t = new Date(Date.UTC(y, m - 1 + k, 1)); return t.toISOString().slice(0, 7); };
function calendarCard() {
  const all = ((DATA && DATA.calendar) || []).filter((e) => !STOCK_KINDS.includes(e.kind));
  if (!((DATA && DATA.calendar) || []).length) return "";
  const today = TODAY(), now = today.slice(0, 7), nearLo = ymAdd(now, -1), nearHi = ymAdd(now, ECON_NEAR - 1);
  const ms = all.map((e) => e.date.slice(0, 7));
  const lo = [nearLo, ...ms].reduce((a, b) => (b < a ? b : a)), hi = [nearHi, ...ms].reduce((a, b) => (b > a ? b : a));
  if (!econMonth || econMonth < lo || econMonth > hi) econMonth = now;
  const [y, m] = econMonth.split("-").map(Number);
  const byDay = {};
  all.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const icon = (e) => (e.kind === "big" && !e.big ? "📌" : CAL_ICON[e.kind] || "•");
  // 월~금 다섯 칸 (주말 일정은 거의 없어서 금요일 칸에 같이 보여 줘요)
  const first = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = "";
  const lead = (first.getUTCDay() + 6) % 7;
  if (lead < 5) cells += `<span class="cal-cell blank"></span>`.repeat(lead);
  for (let dd = 1; dd <= dim; dd++) {
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const key = `${econMonth}-${String(dd).padStart(2, "0")}`;
    const wk = [key, ...(wd === 5 ? [1, 2].map((k) => `${econMonth}-${String(dd + k).padStart(2, "0")}`) : [])];
    const ev = wk.flatMap((k) => byDay[k] || []);
    const marks = [...new Set(ev.map(icon))].slice(0, 3).join("");
    const cls = ["cal-cell", "ec-cell", key < today ? "past" : "", key === today ? "today" : "", ev.some((e) => e.big) ? "big" : "", econPick === key ? "picked" : ""].filter(Boolean).join(" ");
    cells += `<button type="button" class="${cls}" data-ecday="${key}" aria-label="${m}월 ${dd}일 ${ev.length ? ev.map((e) => e.title).join(", ") : "일정 없음"}">
      <span class="cd">${dd}</span><span class="em">${marks}</span></button>`;
  }
  const months = [];
  for (let key = lo; key <= hi; key = ymAdd(key, 1)) {
    const n = all.filter((e) => e.date.startsWith(key)).length, near = key >= nearLo && key <= nearHi;
    const cls = ["cal-m", key === econMonth ? "on" : "", near ? "near" : key < now ? "past" : "", key === now ? "now" : ""].filter(Boolean).join(" ");
    const lab = key.endsWith("-01") || key === lo ? `<i>${key.slice(2, 4)}년</i>` : "";
    months.push(`<button type="button" class="${cls}" data-ecm="${key}"><span>${lab}${Number(key.slice(5))}월</span><b>${n ? `${n}개` : "-"}</b></button>`);
  }
  const pick = econPick && econPick.startsWith(econMonth) ? econPick : null;
  // 금요일을 누르면 그 주말 일정도 같이
  const pickDays = pick ? [0, 1, 2].slice(0, new Date(pick + "T00:00:00Z").getUTCDay() === 5 ? 3 : 1).map((k) => `${econMonth}-${String(Number(pick.slice(8)) + k).padStart(2, "0")}`) : null;
  const pickList = all.filter((e) => (pickDays ? pickDays.includes(e.date) : e.date.startsWith(econMonth)));
  const rows = calRows(pickList);
  return `<section class="card" id="cal-card"><h2>다가오는 일정 <small>${Number(lo.slice(0, 4))}~${Number(hi.slice(0, 4))}년 · 경제 일정</small></h2>
    <div class="ec-months" aria-label="달 고르기">${months.join("")}</div>
    <div class="ec-pin"><div class="cal-head"><button type="button" class="cal-nav" data-ecstep="-1" aria-label="이전 달" ${econMonth <= lo ? "disabled" : ""}>‹</button>
      <div><b>${y}년 ${m}월</b><small>${pick ? `${Number(pick.slice(5, 7))}.${Number(pick.slice(8))} 일정 · 다시 누르면 한 달 전체` : `일정 ${all.filter((e) => e.date.startsWith(econMonth)).length}개 · 날짜를 누르면 그날만`}</small></div>
      <button type="button" class="cal-nav" data-ecstep="1" aria-label="다음 달" ${econMonth >= hi ? "disabled" : ""}>›</button></div>
    <div class="cal-grid"><span class="cal-w">월</span><span class="cal-w">화</span><span class="cal-w">수</span><span class="cal-w">목</span><span class="cal-w">금</span>${cells}</div></div>
    <div class="ec-list">${rows ? `<ul class="list cal">${rows}</ul>` : `<p class="empty">${pick ? "이날은 큰 일정이 없어요." : "이달엔 큰 일정이 없어요."}</p>`}</div>
    <p class="muted note" style="margin:10px 0 0">🚨 물가(CPI)·고용·PCE·GDP처럼 지수를 크게 흔드는 미국 발표, 📌 PPI·소매판매, 🏦 금리 결정, ⏳ 만기일, 📊 국장 실적 시즌이에요 (한국시간). 지난 일정은 연하게 보여요.
      위 달 버튼은 옆으로 밀면 작년·내년도 볼 수 있고, 지난달~5개월 뒤는 파랗게 표시돼요. 미국 발표·FOMC 날짜는 올라온 해까지만 있어서 먼 달은 비어 있을 수 있어요. 종목 실적·배당 발표는 바로 아래 칸에 따로 있어요.</p></section>`;
}
// 일정 화면: 달력(월 제목 + 칸)은 위 막대 바로 아래에 멈춰 있고, 그 아래 일정 목록만 움직여요 (사용자 2026-10-24, 이 화면만 sticky 예외)
// 목록 칸은 최소 '남은 화면 높이'라서 날짜를 눌러 목록이 짧아져도 달력이 멈춘 자리 그대로예요
const ecStuck = () => {
  const pin = $("#app .ec-pin");
  return pin && pin.previousElementSibling ? pin.previousElementSibling.getBoundingClientRect().bottom < pin.getBoundingClientRect().top - 1 : false;
};
function pinEcon() {
  const pin = $("#app .ec-pin"), list = $("#app .ec-list");
  if (!pin || !list) return;
  const top = $(".top"), nav = $(".nav"), topH = top ? top.offsetHeight : 0;
  pin.style.top = `${topH}px`;
  list.style.minHeight = `${Math.max(0, window.innerHeight - topH - pin.offsetHeight - (nav ? nav.offsetHeight : 0))}px`;
}
window.addEventListener("resize", pinEcon, { passive: true });
// 달력이 멈춘 채로 날짜·달을 바꾸면 새 목록의 맨 위부터 보여요. 아니면 보통처럼 화면 그대로
function renderEcon() {
  const stuck = ecStuck();
  render();
  if (!stuck) return;
  lastTap = null;
  const pin = $("#app .ec-pin"), list = $("#app .ec-list");
  if (pin && list) window.scrollTo(0, window.scrollY + list.getBoundingClientRect().top - pin.getBoundingClientRect().bottom);
}
function earningsCard() {
  if (!((DATA && DATA.calendar) || []).length) return "";
  const near = calNear(EARN_DAYS).filter((e) => STOCK_KINDS.includes(e.kind));
  const shown = near.filter((e) => calMine(e) || (calAll && e.kind === "earn"));
  const hidden = near.filter((e) => e.kind === "earn" && !calMine(e)).length;
  const rows = calRows(shown);
  const more = hidden ? `<button type="button" class="more" data-cal-all>${calAll ? "관심종목 실적만 보기" : `대형주 실적 발표 ${hidden}건 더 보기`}<span aria-hidden="true">›</span></button>` : "";
  return `<section class="card" id="earn-card"><h2>실적·배당 발표 <small>${EARN_DAYS}일 · 국장·미장</small></h2>
    ${rows ? `<ul class="list cal">${rows}</ul>` : `<p class="empty">앞으로 ${EARN_DAYS}일 동안 내 종목 실적·배당 일정이 없어요.</p>`}${more}
    <p class="muted note" style="margin:10px 0 0">📢 실적 발표, 💰 배당락이에요. ⭐는 내 관심종목이에요. 종목을 누르면 종목 화면으로 가요.</p></section>`;
}

// 시장 히트맵 (토스·TradingView처럼): 대형주를 업종별로 묶고, 크기는 시가총액, 색은 등락(빨강 오름·파랑 내림)
const HEAT_P = [["d1", "오늘", 1], ["r5", "5일", 5], ["r20", "20일", 20]];
let heatP = "d1";
try { heatP = localStorage.getItem("heat_p") || "d1"; } catch (e) { /* 처음 */ }
function heatRet(s, k) {
  if (k === "d1") return s.d1;
  const n = (HEAT_P.find((x) => x[0] === k) || [])[2], sp = s.spark || [];
  return sp.length > n ? sp[sp.length - 1] / sp[sp.length - 1 - n] - 1 : null;
}
// 네모 안을 넓이(무게)대로 나눠요 (squarified treemap). 결과는 0~100 비율
function squarify(items, x, y, w, h) {
  const out = [], total = items.reduce((a, it) => a + it.wt, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = items.map((it) => ({ it, a: it.wt * scale }));
  const worst = (row, side) => {
    const sum = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
    rest = rest.slice(i);
    const sum = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) {  // 왼쪽에 세로 줄
      const cw = rest.length ? sum / h : w;
      let cy = y;
      row.forEach((r, j) => { const ch = j === row.length - 1 ? y + h - cy : r.a / cw; out.push({ it: r.it, x, y: cy, w: cw, h: ch }); cy += ch; });
      x += cw; w -= cw;
    } else {       // 위에 가로 줄
      const ch = rest.length ? sum / w : h;
      let cx = x;
      row.forEach((r, j) => { const cw = j === row.length - 1 ? x + w - cx : r.a / ch; out.push({ it: r.it, x: cx, y, w: cw, h: ch }); cx += cw; });
      y += ch; h -= ch;
    }
  }
  return out;
}
function heatmapCard(d) {
  const all = stocksOf(d).filter((s) => !s.extra && s.close != null);
  if (all.length < 5) return "";
  if (!HEAT_P.some((x) => x[0] === heatP)) heatP = "d1";
  const funds = d.funds || {}, of = (d.daily && d.daily.sector_of) || {};
  const groups = new Map();
  all.forEach((s) => {
    const g = of[s.code] || (s.code === "SPY" ? "ETF" : "기타");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ s, cap: (funds[s.code] || {}).cap || 0, r: heatRet(s, heatP) });
  });
  // 크기: 시가총액을 조금 눌러서(0.6제곱) 작은 회사도 칸이 보이게
  const caps = all.map((s) => (funds[s.code] || {}).cap || 0).filter((c) => c > 0);
  const small = caps.length ? Math.min(...caps) : 1;
  groups.forEach((list) => list.forEach((x) => { x.wt = Math.pow((x.cap || small) / small, 0.6); }));
  const glist = [...groups.entries()].map(([g, list]) => {
    list.sort((a, b) => b.wt - a.wt);
    const avg = list.filter((x) => x.r != null);
    return { g, list, wt: list.reduce((a, x) => a + x.wt, 0), m: avg.length ? avg.reduce((a, x) => a + x.r, 0) / avg.length : null };
  }).sort((a, b) => b.wt - a.wt);
  const scale = heatP === "d1" ? 0.03 : heatP === "r5" ? 0.07 : 0.15;  // 이만큼 움직이면 가장 진한 색
  const P = (v) => `${+v.toFixed(3)}%`;
  const tile = ({ it: { s, r }, x, y, w, h }, gw, gh) => {
    const k = r == null ? 0 : Math.min(1, Math.abs(r) / scale), mix = Math.round(15 + k * 75);
    const flat = r == null || Math.abs(r) < 0.0005;
    const bg = flat ? "var(--surface-0)" : `color-mix(in srgb, var(${r > 0 ? "--up" : "--down"}) ${mix}%, var(--surface-0))`;
    const aw = (w * gw) / 100, ah = (h * gh) / 100;  // 전체 네모 기준 크기(%)
    const fs = Math.max(2.1, Math.min(3.6, Math.sqrt(aw * ah) / 4.6, aw / 3.6));  // 좁은 칸은 글자도 작게
    const fit = aw >= 7 && ah >= 4.5, two = fit && ah >= fs * 2.6;
    return `<button type="button" class="heat-tile${!flat && mix > 55 ? " strong" : ""}" style="left:${P(x)};top:${P(y)};width:${P(w)};height:${P(h)};background:${bg};font-size:${fs.toFixed(2)}cqw"
      data-stock="${esc(s.code)}" aria-label="${esc(s.name)} ${r == null ? "자료 없음" : pct(r)}">${fit ? `<span>${esc(s.name)}</span>` : ""}${two ? `<b>${r == null ? "-" : pct(r)}</b>` : ""}</button>`;
  };
  const HEAD = 4.4;  // 업종 이름 줄 높이(전체 네모 기준 %)
  const boxes = squarify(glist, 0, 0, 100, 100).map(({ it: G, x, y, w, h }) => {
    const head = w >= 16 && h >= 14;
    const hd = head ? (HEAD / h) * 100 : 0;
    const tiles = squarify(G.list, 0, hd, 100, 100 - hd).map((t) => tile(t, w, h)).join("");
    return `<div class="heat-grp" style="left:${P(x)};top:${P(y)};width:${P(w)};height:${P(h)}" title="${esc(G.g)}">
      ${head ? `<div class="heat-head" style="height:${P(hd)}"><span>${esc(G.g)}</span><b class="${sign(G.m)}">${G.m == null ? "" : pct(G.m)}</b></div>` : ""}${tiles}</div>`;
  }).join("");
  const chips = HEAT_P.map(([k, label]) => `<button type="button" data-heat="${k}" aria-pressed="${k === heatP}">${label}</button>`).join("");
  return `<section class="card" id="heat-card"><h2>시장 ${term("히트맵")} <small>${all.length}개 대형주 · ${md(all[0].day)}</small></h2>
    <div class="period" role="group" aria-label="기간" style="margin:4px 0 10px">${chips}</div><div class="heat-box">${boxes}</div>
    <p class="muted note" style="margin:10px 0 0">칸이 클수록 시가총액이 크고, 진할수록 많이 움직였어요. 굵은 선은 업종 경계예요. 작은 칸도 누르면 종목 화면이에요.</p></section>`;
}

function sectorsCard(d) {
  const secs = d.daily && d.daily.sectors;
  if (!secs || !secs.length) return "";
  let cur = SECTOR[market];
  const s = secs.find((x) => x.name === cur);
  if (!s) cur = "";
  const chips = sectorChips(secs.map((x) => x.name), cur);
  let body;
  if (!s) {
    body = `<ul class="list" style="margin-top:10px">${secs.map((x) => `<li data-sector="${esc(x.name)}"><div class="l">
        <div class="name">${esc(x.name)}${toneBadge(x)}</div>
        <div class="meta">${x.count}종목${x.vs_index == null ? "" : ` · 지수보다 ${pct(x.vs_index)}p`}${x.r20 == null ? "" : ` · 20일 ${pct(x.r20)}`}</div></div>
        <div class="r ${sign(x.r5)}">${pct(x.r5)}</div></li>`).join("")}</ul>`;
  } else {
    const names = new Map(stocksOf(d).map((x) => [x.code, x]));
    const news = (s.news || []).map((n) => {
      const tag = n.tone > 0 ? `<span class="badge good">호재</span>` : n.tone < 0 ? `<span class="badge bad">악재</span>` : "";
      const title = /^https:\/\//.test(n.link || "") ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : esc(n.title);
      return `<li><div class="l"><div class="meta">${tag} ${title}${n.source ? ` · ${esc(n.source)}` : ""}${n.date ? ` · ${md(n.date)}` : ""}</div></div></li>`;
    }).join("");
    const members = s.codes.map((c) => {
      const st = names.get(c);
      return st ? stockRow(st, d) : "";
    }).join("");
    body = `<p class="headline">${esc(s.name)} ${pct(s.r5)}${toneBadge(s)}</p>
      <p class="sub">5거래일 중간값${s.vs_index == null ? "" : `, 지수보다 ${pct(s.vs_index)}p`}${s.r20 == null ? "" : ` · 20일 ${pct(s.r20)}`}${s.above200 == null ? "" : ` · 200일선 위 ${Math.round(s.above200 * 100)}%`}</p>
      <p class="muted" style="margin:6px 0 0">가장 강한 종목 ${esc(s.best.name)} ${pct(s.best.r5)} · 가장 약한 종목 ${esc(s.worst.name)} ${pct(s.worst.r5)} (${s.count}종목 중)</p>
      ${sectorPolicies(s.name, true)}
      ${news ? `<h3 class="muted" style="margin:12px 0 4px">최근 7일 뉴스 제목 · 호재 ${s.good} · 악재 ${s.bad}</h3><ul class="list">${news}</ul>`
        : `<p class="empty">최근 7일 뉴스 제목을 못 받았어요.</p>`}
      ${members ? `<h3 class="muted" style="margin:12px 0 4px">이 업종 대형주</h3><ul class="list">${members}</ul>` : ""}`;
  }
  return `<section class="card" id="sectors-card"><h2>업종별 호재·악재 <small>최근 5거래일 · 참고</small></h2>${chips}${body}
    <p class="muted note" style="margin:10px 0 0">호재·악재는 뉴스 제목 낱말로 짐작한 거예요. 고른 업종은 관심 화면 전체 종목에도 똑같이 걸려요.</p>
    <button type="button" class="more" data-map="">산업 연관 지도 (어떤 산업끼리 이어져 있나)<span aria-hidden="true">›</span></button></section>`;
}

// 많이 오른·내린 종목과 추정 이유 (movers.py). 예전 기록엔 없을 수 있어요.
function moversCard(d) {
  const mv = d.daily && d.daily.movers;
  if (!mv) return "";
  const row = (p) => {
    const n = (p.news || [])[0];
    const link = n && /^https:\/\//.test(n.link || "")
      ? `<div class="meta">📰 <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>${n.source ? ` · ${esc(n.source)}` : ""}</div>` : "";
    return `<li><div class="l"><div class="name">${esc(p.name)}${p.sector ? `<span class="badge">${esc(p.sector)}</span>` : ""} <span class="meta">${esc(p.main)}</span></div>
      ${(p.reasons || []).slice(0, 2).map((r) => `<div class="meta">${esc(r)}</div>`).join("")}${link}</div>
      <div class="r ${sign(p.r5)}">${pct(p.r5)}<div class="meta">오늘 ${pct(p.r1)}</div></div></li>`;
  };
  const part = (rows, head) => rows && rows.length ? `<h3 class="muted" style="margin:10px 0 4px">${head}</h3><ul class="list">${rows.map(row).join("")}</ul>` : "";
  const body = part(mv.up, "▲ 많이 오른 종목") + part(mv.down, "▼ 많이 내린 종목");
  return `<section class="card"><h2>왜 움직였나 <small>최근 5거래일 · ${mv.count}개 종목 중</small></h2>
    ${body || `<p class="empty">최근 5거래일 ±3% 넘게 움직인 종목이 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">이유는 시장·같이 움직인 종목·거래량·뉴스 제목으로 짐작한 거예요. 사기 전에 기사 원문을 확인하세요.</p></section>`;
}

// 외국인·기관 수급 (flows.py, 네이버 무료 자료). 국장만. 홈은 '같이 파는 종목' 경고와 5일 많이 산·판 종목
const won = (x) => `${x < 0 ? "-" : "+"}${bigNum(Math.abs(x))}원`;
function flowsCard(d) {
  const f = market === "kr" && d.flows;
  if (!f) return "";
  const warn = (f.warn || []).map((r) => `<li data-stock="${esc(r.code)}"><div class="l"><div class="name">${esc(r.name)}</div>
      <div class="meta">외국인 ${r.frg_streak}일 연속 순매도 · 기관도 5일 순매도${r.hold == null ? "" : ` · 외국인 보유 ${r.hold.toFixed(1)}%`}</div></div>
      <div class="r down">${won(-r.sold)}<div class="meta">5일 합계</div></div></li>`).join("");
  const line = (rows, cls) => rows.map((r) => `<button type="button" class="chip-link ${cls}" data-stock="${esc(r.code)}">${esc(r.name)} ${won(r.won)}</button>`).join("");
  return `<section class="card"><h2>외국인·기관 수급 <small>${md(f.day)}까지 5거래일 · 참고</small></h2>
    ${warn ? `<h3 class="muted" style="margin:6px 0 4px">⚠️ 외국인·기관이 같이 파는 종목</h3><ul class="list">${warn}</ul>`
      : `<p class="sub" style="margin:6px 0 0">외국인이 3일 넘게 팔면서 기관도 파는 종목은 없어요.</p>`}
    ${(f.buy || []).length ? `<h3 class="muted" style="margin:12px 0 4px">많이 산 종목 (외국인+기관)</h3><div class="chip-row">${line(f.buy, "up")}</div>` : ""}
    ${(f.sell || []).length ? `<h3 class="muted" style="margin:12px 0 4px">많이 판 종목</h3><div class="chip-row">${line(f.sell, "down")}</div>` : ""}
    <p class="muted note" style="margin:10px 0 0">금액은 순매수 주식 수 × 그날 종가로 어림한 값이에요. 큰손이 판다고 꼭 내리는 건 아니라서 매매 규칙은 안 바꿨어요.</p></section>`;
}

function flowBars(x) {
  const n = x.dates.length;
  const vals = [...x.frg, ...x.inst];
  const hi = Math.max(1, ...vals.map(Math.abs));
  const W = 320, H = 130, t = 6, b = 18, mid = t + (H - t - b) / 2, half = (H - t - b) / 2;
  const gw = W / n, bw = Math.max(2, Math.min(6, gw * 0.36));
  let bars = "";
  x.dates.forEach((_, i) => [["frg", -bw - 0.5], ["inst", 0.5]].forEach(([k, dx]) => {
    const v = x[k][i], h = Math.max(1, (Math.abs(v) / hi) * half);
    bars += `<rect class="flow-${k}" x="${(i * gw + gw / 2 + dx).toFixed(1)}" y="${(v >= 0 ? mid - h : mid).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>`;
  }));
  const lab = [[0, 0, "start"], [Math.floor((n - 1) / 2), null, "middle"], [n - 1, W, "end"]]
    .map(([i, at, a]) => `<text x="${(at ?? i * gw + gw / 2).toFixed(1)}" y="${H - 4}" text-anchor="${a}">${md(x.dates[i])}</text>`).join("");
  return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${n}거래일 외국인·기관 순매수 막대">
    <line class="gridline" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><text x="2" y="${t + 9}">순매수 ↑</text><text x="2" y="${H - b - 2}">순매도 ↓</text>${bars}${lab}</svg>`;
}

function fillFlows(x) {
  const card = $("#flow-card");
  if (!card) return;
  if (!x || !x.dates || !x.dates.length) {
    card.innerHTML = `<h2>외국인·기관 수급</h2><p class="empty">수급 자료가 아직 없어요. 평일 장 마감 뒤(17:30쯤) 받아요.</p>`;
    return;
  }
  const m = x.sum || {};
  const qty = (q) => `${q < 0 ? "-" : "+"}${Math.abs(q) >= 1e4 ? `${Math.round(Math.abs(q) / 1e4).toLocaleString("ko-KR")}만` : Math.abs(q).toLocaleString("ko-KR")}주`;
  const st = (v) => (!v ? "-" : `${Math.abs(v)}일 연속 ${v > 0 ? "순매수" : "순매도"}`);
  const tile = (label, w, q, sk) => `<div class="stat"><span>${label}</span><b class="${sign(w)}">${won(w)}</b><small>${qty(q)} · ${st(sk)}</small></div>`;
  card.innerHTML = `<h2>외국인·기관 수급 <small>${md(m.day)}까지 · 참고</small></h2>
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">${tile("외국인 5일", m.frg5_won, m.frg5, m.frg_streak)}${tile("기관 5일", m.inst5_won, m.inst5, m.inst_streak)}
      <div class="stat"><span>외국인 20일</span><b class="${sign(m.frg20_won)}">${won(m.frg20_won)}</b></div>
      <div class="stat"><span>기관 20일</span><b class="${sign(m.inst20_won)}">${won(m.inst20_won)}</b></div></div>
    ${m.hold == null ? "" : `<p class="sub" style="margin:10px 0 0">${term("외국인 보유율")} <b>${m.hold.toFixed(2)}%</b>${m.hold_chg == null ? "" : ` (20일 전보다 <b class="${sign(m.hold_chg)}">${m.hold_chg > 0 ? "+" : ""}${m.hold_chg.toFixed(2)}%p</b>)`}</p>`}
    <div class="legend" style="margin:10px 0 0"><span class="key"><i class="sw flow-frg"></i>외국인</span><span class="key"><i class="sw flow-inst"></i>기관</span></div>
    ${flowBars(x)}
    <p class="muted note" style="margin:8px 0 0">하루 ${term("순매수")} 주식 수 막대예요. 금액은 주식 수 × 그날 종가로 어림했어요. 네이버 증권 무료 자료예요.</p>`;
}

// 주가는 그대로인데 거래량만 크게 늘어난 종목 (quiet_volume.py). 예전 기록엔 없을 수 있어요.
function quietVolumeCard(d) {
  const q = d.daily && d.daily.quiet_volume;
  if (!q) return "";
  const rows = (q.rows || []).map((r) => `<li data-stock="${esc(r.code)}"><div class="l"><div class="name">${esc(r.name)}</div>
      <div class="meta">거래량 평소의 ${r.ratio.toFixed(1)}배 · 가장 많은 날 ${r.peak.toFixed(1)}배${r.r20 == null ? "" : ` · 20일 ${pct(r.r20)}`}</div></div>
      <div class="r ${sign(r.r5)}">${pct(r.r5)}<div class="meta">5일 주가</div></div></li>`).join("");
  const more = q.total > (q.rows || []).length ? `<p class="muted" style="margin:6px 0 0">외 ${q.total - q.rows.length}개</p>` : "";
  return `<section class="card"><h2>주가 그대로·거래량 급증 <small>최근 ${q.days}거래일 · ${q.count}개 종목 중</small></h2>
    ${rows ? `<ul class="list">${rows}</ul>${more}` : `<p class="empty">오늘은 조건에 맞는 종목이 없어요.</p>`}
    <p class="muted note" style="margin:10px 0 0">주가는 ±${Math.round(q.max_move * 100)}% 안인데 거래량이 평소(${q.base}일 평균)의 ${q.min_ratio}배 이상인 종목이에요.
      조용히 사 모으는 중인지 팔아 넘기는 중인지는 숫자만으론 몰라요. 참고용이고 매매 규칙은 안 바꿔요.</p></section>`;
}

// ---------------------------------------------------------------- 종목 화면 (차트 + 재무제표)
// 자료는 종목마다 stocks/<시장>/<코드>.json (배포 때 stock_pages.py가 만듦). 처음 열 때 받아서 앱을 닫을 때까지 기억해요.
const STOCK_FRAMES = FRAMES;  // 상장일부터 받은 일봉이라 년봉까지 봐요
let stockFrame = "d";
let fundMode = "annual";
const STOCK_DATA = new Map();   // "kr/005930" → 받는 중인 Promise
const STOCK_READY = new Map();  // "kr/005930" → 받은 자료
let stockDrawn = null;          // 차트를 마지막으로 그린 종목 (바뀌면 보던 구간을 처음으로)
let alertOpen = false;          // 종목 화면의 가격 알림 칸을 펼쳤는지

function stockData(m, code) {
  const key = `${m}/${code}`;
  if (!STOCK_DATA.has(key)) {
    STOCK_DATA.set(key, fetch(`stocks/${m}/${encodeURIComponent(code)}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((x) => {
        if (x) STOCK_READY.set(key, x); else STOCK_DATA.delete(key);  // 못 받았으면 다음에 다시 받아요
        return x;
      }));
  }
  return STOCK_DATA.get(key);
}

let headHad = null;  // 종목 파일을 받은 뒤 머리 칸을 그린 종목 (대시보드 밖 종목은 받고 나서 이름·종가를 채워 한 번 더 그려요)
function stockHeadCard(d) {
  const code = stockCode;
  const x = STOCK_READY.get(`${market}/${code}`);
  if (x) headHad = `${market}/${code}`;
  const s = stocksOf(d).find((y) => y.code === code) || liteStock(market, code);
  const name = (s && s.name) || (x && x.name) || code;
  const on = WATCH[market].includes(code);
  const badges = [];
  if (s && s.extra) badges.push(`<span class="badge">추가한 종목</span>`);
  const kind = s && s.extra ? kindName(market, [code, name, s.exch || "", s.kind || "s"])
    : x && x.lite ? kindName(market, [code, name, x.exch || "", x.kind || "s"])
      : market === "kr" ? "코스피" : code === "SPY" ? "미국 ETF" : "미국 주식";
  const c3 = s && s.spark && s.spark.length > 1 ? s.spark[s.spark.length - 1] / s.spark[0] - 1 : null;
  return `<section class="card"><button type="button" class="back" data-back>‹ 뒤로</button>
    <div class="stock-title"><div class="l"><h2 class="stock-name">${esc(name)}</h2>
      <div class="meta">${esc(code)} · ${kind}${badges.join("")}</div>${sectorTags(d, code)}</div>
      <button type="button" class="star" data-star="${esc(code)}" aria-pressed="${on}"
        aria-label="${esc(name)} ${on ? "관심종목에서 빼기" : "관심종목에 넣기"}">${on ? "★" : "☆"}</button></div>
    ${s && s.close != null ? `<p class="hero">${cnt(s.close, "price", price(market, s.close))}</p>
      <p class="sub"><span class="nowrap"><b class="${sign(s.d1)}">${cnt(s.d1, "pct2", pct(s.d1, 2))}</b> 전일 대비</span>${c3 == null ? ""
        : ` · <span class="nowrap">3개월 <b class="${sign(c3)}">${cnt(c3, "pct", pct(c3))}</b></span>`} · <span class="nowrap">${md(s.day)} 종가</span></p>`
      : s && s.extra ? `<p class="sub">시세는 대시보드가 다시 올라갈 때 받아요.</p>` : ""}
    ${alertBox(d, code, s)}
  </section>`;
}

// 종목 화면: 이 종목 업종과 연관 업종(공급망·수요)의 흐름·호재·악재를 한꺼번에 (sectors.py)
function sectorLine(x, why) {
  const n = (x.news || []).find((k) => k.tone) || (x.news || [])[0];
  const tag = n && n.tone > 0 ? `<span class="badge good">호재</span> ` : n && n.tone < 0 ? `<span class="badge bad">악재</span> ` : "";
  return `<li data-sector-go="${esc(x.name)}"><div class="l"><div class="name">${esc(x.name)}${toneBadge(x)}</div>
      ${why ? `<div class="meta">${esc(why)}</div>` : ""}
      ${n ? `<div class="meta">${tag}${esc(n.title)}</div>` : ""}</div>
      <div class="r ${sign(x.r5)}">${pct(x.r5)}<div class="meta">20일 ${pct(x.r20)}</div></div></li>`;
}
// 종목 이름 아래 작은 업종 키워드: #이 종목 업종 + 연관 업종 (누르면 아래 '업종과 연관 업종' 칸으로)
function sectorTags(d, code) {
  const sig = d.daily || {};
  const name = (sig.sector_of || {})[code];
  if (!name) return "";
  const rel = ((sig.sector_links || {})[name] || []).map(([n]) => n);
  const tag = (n, main) => `<span class="tag${main ? " main" : ""}">#${esc(n)}</span>`;
  return `<a class="tags" href="#stock-sector" data-tags>${tag(name, true)}${rel.map((n) => tag(n)).join("")}</a>`;
}

function stockSectorCard(d) {
  const sig = d.daily || {};
  const secs = sig.sectors || [];
  const name = (sig.sector_of || {})[stockCode];
  const mine = secs.find((x) => x.name === name);
  if (!mine) return "";
  const links = ((sig.sector_links || {})[name] || [])
    .map(([n, why]) => [secs.find((x) => x.name === n), why]).filter(([x]) => x);
  const peers = mine.codes.filter((c) => c !== stockCode)
    .map((c) => stocksOf(d).find((x) => x.code === c)).filter(Boolean).slice(0, 5);
  return `<section class="card" id="stock-sector"><h2>업종과 연관 업종 <small>최근 5거래일 · 참고</small></h2>
    <ul class="list">${sectorLine(mine, `이 종목 업종 · ${mine.count}종목 중간값${mine.vs_index == null ? "" : `, 지수보다 ${pct(mine.vs_index)}p`}`)}</ul>
    ${sectorPolicies(name, false)}
    ${links.length ? `<h3 class="muted" style="margin:12px 0 4px">같이 보면 좋은 연관 업종</h3>
      <ul class="list">${links.map(([x, why]) => sectorLine(x, `${why}로 이어져요`)).join("")}</ul>` : ""}
    ${peers.length ? `<h3 class="muted" style="margin:12px 0 4px">같은 업종 대형주</h3>
      <ul class="list">${peers.map((x) => stockRow(x, d)).join("")}</ul>` : ""}
    <p class="muted note" style="margin:10px 0 0">업종을 누르면 홈 '업종별 호재·악재'에서 그 업종 뉴스와 종목을 자세히 봐요. 호재·악재는 뉴스 제목으로 짐작한 거예요.</p></section>`;
}

// 가격 알림: 텔레그램 봇이 15분마다 야후 5분봉을 보고, 정한 가격에 닿으면 텔레그램으로 알려 줘요.
// 여기서는 봇에게 보낼 명령을 시작 링크로 만들어 줘요 (앱이 직접 알림을 저장하지는 못해요).
function alertBox(d, code, s) {
  const mine = (d.alerts || []).filter((a) => a.code === code);
  const rows = mine.map((a) => {
    const del = tgLink(`알림 삭제 ${a.id}`);
    return `<li><span><b>${price(market, a.price)}</b> ${a.dir === "up" ? "이상" : "이하"}</span>
      <small>${md(String(a.created || "").slice(0, 10))} 등록</small>${del ? `<a class="linkish" href="${esc(del)}" target="_blank" rel="noopener">지우기</a>` : ""}</li>`;
  }).join("");
  const drop = s && s.extra ? tgLink(`관심 빼기 ${market} ${code}`) : null;
  return `<div class="alert-box">
    <button type="button" class="alert-toggle" data-alert-toggle aria-expanded="${alertOpen}">
      <span>가격 알림${mine.length ? ` <b>${mine.length}개</b>` : ""}</span><span class="pm" aria-hidden="true">${alertOpen ? "−" : "+"}</span></button>
    ${mine.length ? `<ul class="alert-list">${rows}</ul>` : ""}
    ${alertOpen ? alertForm(s) : ""}
    ${drop ? `<p class="muted" style="margin:8px 0 0">텔레그램으로 넣은 종목이에요. <a class="linkish" href="${esc(drop)}" target="_blank" rel="noopener">대시보드에서 빼기</a></p>` : ""}
  </div>`;
}

function alertForm(s) {
  if (!(DATA && DATA.bot)) return `<p class="muted">텔레그램 봇이 연결되면(telegram-bot 워크플로가 한 번 돌면) 여기서 알림을 만들 수 있어요.</p>`;
  const now = s && s.close != null ? s.close : null;
  const v = now == null ? "" : market === "kr" ? String(Math.round(now)) : now.toFixed(2);
  return `<div class="alert-form">
      <label class="alert-input"><input id="alert-price" type="text" inputmode="decimal" autocomplete="off" value="${v}"
        aria-label="알림 받을 가격"><span>${market === "kr" ? "원" : "달러"}</span></label>
      <a class="add" id="alert-send" target="_blank" rel="noopener">텔레그램으로 알림 받기</a></div>
    <p class="muted" id="alert-hint" style="margin:8px 0 0"></p>`;
}

// '30만', '300,000원', '$250.5' → 숫자
function readPrice(t) {
  const m = String(t || "").replace(/[,\s원$달러]/g, "").match(/^(\d+(?:\.\d+)?)(만|천)?$/);
  return m ? parseFloat(m[1]) * (m[2] === "만" ? 1e4 : m[2] === "천" ? 1e3 : 1) : null;
}

function bindAlert(s) {
  const toggle = $("[data-alert-toggle]");
  if (toggle) toggle.addEventListener("click", () => { alertOpen = !alertOpen; render(); if (alertOpen) { const i = $("#alert-price"); if (i) i.focus({ preventScroll: true }); } });
  const input = $("#alert-price"), send = $("#alert-send"), hint = $("#alert-hint");
  if (!input || !send || !hint) return;
  const now = s && s.close != null ? s.close : null;
  const update = () => {
    const v = readPrice(input.value);
    if (!(v > 0)) {
      send.removeAttribute("href");
      send.setAttribute("aria-disabled", "true");
      hint.textContent = "가격을 숫자로 넣어 주세요. 30만처럼 써도 돼요.";
      return;
    }
    const value = market === "kr" ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
    send.href = tgLink(`알림 ${market} ${stockCode} ${value}`);
    send.removeAttribute("aria-disabled");
    const where = now == null ? "" : v > now ? `최근 종가(${price(market, now)})보다 높아서, ${price(market, v)} 이상이 되면 알려 드려요. `
      : v < now ? `최근 종가(${price(market, now)})보다 낮아서, ${price(market, v)} 이하가 되면 알려 드려요. ` : "최근 종가와 같아요. 조금 높거나 낮게 넣어 주세요. ";
    hint.textContent = `${where}버튼을 누르면 텔레그램이 열려요. 시작(START)을 누르면 보통 30분 안에 등록되고 답장이 와요.`;
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  update();
}

function stockChartCard() {
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  const buttons = STOCK_FRAMES.map(([key, label]) =>
    `<button type="button" data-sframe="${key}" aria-pressed="${key === stockFrame}">${label}</button>`).join("");
  return `<section class="card"><h2>차트 <small id="stock-since">${esc(sinceLabel(x && x.candles))}</small></h2>
    <div class="period" role="group" aria-label="캔들 기간">${buttons}</div>${indChips((x && x.candles) || { v: [1] })}
    <p class="muted" id="stock-change" style="margin:8px 0 4px"></p>${candleLegend()}
    <div class="chart candle" id="stock-chart"><p class="empty">차트를 불러오는 중이에요…</p></div>
    <p class="muted" id="stock-all" style="margin:8px 0 0"></p>
    <p class="muted note" style="margin:8px 0 0">옆으로 밀면 과거로, 두 손가락으로 벌리거나 오므리면 확대·축소돼요. 캔들을 누르면 그날 값이 보여요. 길게 누른 채 움직이거나 떠 있는 세로선을 잡고 밀면 손가락을 따라와요. 값이 8배 넘게 차이 나는 긴 구간은 '로그 눈금'으로 그려서 같은 비율로 오르면 같은 높이예요.</p>${indHelp()}</section>`;
}

// 차트 제목 옆: 자료가 시작하는 달. 보통 상장일이고, 야후 자료가 거기까지만 있는 오래된 종목
// (국장 2000년 1월, 미장 1962년 1월)은 그때부터예요.
function sinceLabel(c) {
  if (!c || !c.dates || !c.dates.length) return "";
  const mo = c.monthly && c.monthly.dates.length ? c.monthly : null;  // 전 종목 파일: 일봉은 2년, 월봉은 처음부터
  const first = (mo || c).dates[0], ym = `${first.slice(0, 4)}.${first.slice(5, 7)}`;
  if (!c.full && !mo) return `${ym}부터`;
  const oldest = market === "kr" ? first <= "2000-01-31" : first <= "1962-01-31";
  return oldest ? `${ym}부터 전체 (야후 자료 시작)` : `${ym} 상장 이후 전체`;
}

// 차트 아래 한 줄: 자료 첫날부터 지금까지 오른 비율과 전체 최고·최저 (보이는 구간과 상관없이)
function allTimeLine(c) {
  const n = c.dates.length;
  let hi = 0, lo = 0;
  for (let i = 1; i < n; i++) { if (c.h[i] > c.h[hi]) hi = i; if (c.l[i] < c.l[lo]) lo = i; }
  const ch = c.c[n - 1] / c.o[0] - 1, d = (s) => s.slice(2).replace(/-/g, ".");  // 첫날 시가부터 (차트 위 기간 수익률과 같은 기준)
  return `<span class="nowrap">${d(c.dates[0])}부터 <b class="${sign(ch)}">${pct(ch)}</b></span>`
    + ` · <span class="nowrap">전체 최고 ${px(market, c.h[hi])} (${d(c.dates[hi])})</span>`
    + ` · <span class="nowrap">최저 ${px(market, c.l[lo])} (${d(c.dates[lo])})</span>`;
}

function bindStock() {
  const key = `${market}/${stockCode}`;
  const dash = stocksOf(DATA.markets[market]).find((x) => x.code === stockCode);
  bindAlert(dash || liteStock(market, stockCode));
  const fill = (x) => {
    if (screen !== "stock" || `${market}/${stockCode}` !== key) return;  // 받는 사이 다른 화면으로 갔으면 안 그려요
    if (!dash && x && headHad !== key) { render(); return; }  // 대시보드 밖 종목: 이름·종목 종류·종가를 채워서 다시
    drawStock(x, false);
    fillCheck();
  };
  if (STOCK_READY.has(key)) fill(STOCK_READY.get(key));
  else stockData(market, stockCode).then(fill);
  document.querySelectorAll("[data-sframe]").forEach((b) => b.addEventListener("click", () => {
    stockFrame = b.dataset.sframe;
    document.querySelectorAll("[data-sframe]").forEach((y) => y.setAttribute("aria-pressed", String(y === b)));
    if (STOCK_READY.has(key)) drawStock(STOCK_READY.get(key), true);
  }));
}

function drawStock(x, reset) {
  const el = $("#stock-chart");
  if (!el) return;
  const key = `${market}/${stockCode}`;
  if (x && x.candles && x.candles.dates.length > 1) {
    const f = frameCandles(x.candles, stockFrame);
    const show = (STOCK_FRAMES.find((y) => y[0] === stockFrame) || STOCK_FRAMES[0])[2];
    candleChart(el, f, show, reset || stockDrawn !== key, (txt) => { const r = $("#stock-change"); if (r) r.innerHTML = txt; },
      { fmt: (v) => px(market, v), name: x.name });
    stockDrawn = key;
    const all = $("#stock-all"), since = $("#stock-since");
    if (all) all.innerHTML = allTimeLine(x.candles.monthly && x.candles.monthly.dates.length ? x.candles.monthly : x.candles);
    if (since) since.textContent = sinceLabel(x.candles);
  } else {
    el.innerHTML = `<p class="empty">${x ? "이 종목은 차트 자료를 못 받았어요." : "이 종목 자료를 아직 못 받았어요."} 대시보드가 다음에 새로 올라갈 때 다시 받아요.</p>`;
  }
  fillFund(x && x.fund, x);
  if (x && x.lite) { const fc = $("#flow-card"); if (fc) fc.remove(); }  // 수급은 대형주(대시보드 종목)만 받아요
  else fillFlows(x && x.flows);
}

function fillFund(f, x) {
  const card = $("#fund-card");
  if (!card) return;
  card.innerHTML = fundHtml(f, x) + retHtml(x && x.ret);
  card.querySelectorAll("[data-fund]").forEach((b) => b.addEventListener("click", () => {
    fundMode = b.dataset.fund;
    fillFund(f, x);
  }));
}

// 오래 들고 있었다면: returns.py(매주)가 월봉으로 계산한 최근 10년(짧으면 상장 뒤) 주가 상승률·배당률과 상장 뒤 최대 낙폭
function retHtml(r) {
  if (!r) return "";
  const [start, up, div, mdd, years] = r;
  const tile = (label, value, note) => `<div class="stat"><span>${label}</span><b>${value}</b><small>${note}</small></div>`;
  const signed = (v) => `${v > 0 ? "+" : ""}${v}%`;
  return `<h3 style="margin:16px 0 6px">오래 들고 있었다면 <small class="muted">최근 ${years}년 · 1년 평균</small></h3>
    <div class="stats">${tile("주가 상승", `<span class="${sign(up)}">${signed(up)}</span>`, "연 복리")}${tile("배당", `${div}%`, "연 평균")}
      ${tile(term("최대 낙폭"), `<span class="down">${mdd}%</span>`, `${start.replace("-", ".")} 이후`)}</div>
    <p class="muted note" style="margin:8px 0 0">월말 종가 기준이고 앞으로도 그렇다는 뜻은 아니에요. 적립식 계산기와 같은 숫자예요.</p>`;
}

// 큰 금액은 조·억 단위로 (원이든 달러든 숫자만, 단위는 따로 적어요)
function bigNum(x) {
  if (x == null) return "-";
  const a = Math.abs(x);
  if (a >= 1e12) return `${(x / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: a >= 1e14 ? 0 : 1 })}조`;
  if (a >= 1e8) return `${Math.round(x / 1e8).toLocaleString("ko-KR")}억`;
  return `${Math.round(x / 1e4).toLocaleString("ko-KR")}만`;
}
const periodLabel = (p) => (p.length === 4 ? `${p}년` : `${p.slice(2, 4)}.${p.slice(5, 7)}`);  // 2025 → 2025년, 2026-06 → 26.06
const hasOp = (s) => s.op.some((v) => v != null);

function fundHtml(f, x) {
  const ent = stocksOf(DATA.markets[market]).find((y) => y.code === stockCode);
  const etf = stockCode === "SPY" || !!(ent && ent.kind === "e") || !!(x && x.lite && x.kind === "e");
  if (!f) {
    return `<h2>재무제표</h2><p class="empty">${etf ? "ETF라 매출·영업이익 같은 재무제표가 없어요."
      : x && x.lite ? "재무제표는 대형주(대시보드 종목)만 매주 받아요. 이 종목은 차트와 아래 숫자만 봐요."
        : "재무 자료가 아직 없어요. 매주 토요일에 받아요."}</p>`;
  }
  const usd = market === "us";
  const tile = (label, value, note) => `<div class="stat"><span>${term(label.replace(/\(.*\)$/, ""), esc(label))}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div>`;
  const tiles = [
    tile("PER", f.loss ? "적자" : f.per != null ? `${f.per.toFixed(1)}배` : "-", "주가 ÷ 이익"),
    tile("PBR", f.pbr != null ? `${f.pbr.toFixed(2)}배` : "-", "주가 ÷ 순자산"),
    tile(`시가총액(${usd ? "달러" : "원"})`, bigNum(f.cap), ""),
    tile("배당수익률", f.div != null ? `${f.div.toFixed(2)}%` : "-", "배당 ÷ 주가"),
    tile("ROE", f.roe != null ? `${Math.round(f.roe * 100)}%` : "-", "이익 ÷ 자본"),
    tile("부채비율", f.financial ? "금융사" : f.debt != null ? `${Math.round(f.debt)}%` : "-", f.financial ? "원래 높아서 안 봐요" : "부채 ÷ 자본"),
  ].join("");
  const g = f.grade || { checks: [] };
  const good = g.checks.filter((c) => c[1]).map((c) => c[0]), bad = g.checks.filter((c) => !c[1]).map((c) => c[0]);
  const gradeLine = g.score == null ? "펀더멘탈부: 자료가 부족해서 등급을 매기지 않았어요."
    : `펀더멘탈부 등급 <b>${esc(g.grade)}</b> (${g.score}/${g.total})${good.length ? ` · 좋음: ${esc(good.join(", "))}` : ""}${bad.length ? ` · 약함: ${esc(bad.join(", "))}` : ""}`;
  let body;
  if (!f.annual && !f.quarterly) {
    body = `<p class="muted" style="margin:12px 0 0">${etf ? "ETF라 매출·영업이익 같은 재무제표가 없어요." : "야후에 이 종목 재무제표가 없어요."}</p>`;
  } else {
    if (!f[fundMode]) fundMode = f.annual ? "annual" : "quarterly";
    const s = f[fundMode];
    const modes = [["annual", "연간"], ["quarterly", "분기"]].filter(([k]) => f[k])
      .map(([k, label]) => `<button type="button" data-fund="${k}" aria-pressed="${k === fundMode}">${label}</button>`).join("");
    const second = hasOp(s) ? ["fin-op", "영업이익"] : ["fin-net", "순이익"];
    body = `<div class="period" role="group" aria-label="재무 기간" style="margin-top:14px">${modes}</div>
      <div class="legend" style="margin:10px 0 0"><span class="key"><i class="sw fin-revenue"></i>매출</span>
        <span class="key"><i class="sw ${second[0]}"></i>${second[1]}</span></div>
      ${fundBars(s)}${fundTable(s, usd)}${growthLine(s)}`;
  }
  return `<h2>재무제표 <small>${md(f.asof)} 받음</small></h2><div class="stats">${tiles}</div>
    <p class="sub" style="margin:12px 0 0">${gradeLine}</p>${eventsLine(f)}${targetBox(f, ent)}${body}
    <p class="muted note" style="margin:10px 0 0">야후 파이낸스 무료 자료라 늦거나 빠진 값이 있을 수 있어요. PER은 최근 4분기 순이익 기준이에요.</p>`;
}

// 다음 실적 발표일·배당 일정 한 줄 (야후 무료 자료, 매주 토요일 갱신)
const TODAY = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);  // 한국 날짜
const dday = (d) => { const n = Math.round((Date.parse(d) - Date.parse(TODAY())) / 864e5); return n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 전`; };
const ymd = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
function eventsLine(f) {
  const e = f.events || {};
  const parts = [];
  if (e.earn) parts.push(`실적 발표 <b>${ymd(e.earn)}</b> (${dday(e.earn)})`);
  if (e.exdiv) parts.push(`${term("배당락")} ${ymd(e.exdiv)}${e.exdiv >= TODAY() ? ` (${dday(e.exdiv)})` : ""}`);
  if (e.div_rate) parts.push(`1주당 연 배당 ${market === "kr" ? `${num(e.div_rate)}원` : `$${e.div_rate.toFixed(2)}`}`);
  return parts.length ? `<p class="sub" style="margin:8px 0 0">📅 ${parts.join(" · ")}</p>` : "";
}

// 애널리스트 목표주가 (야후 무료 컨센서스): 최저~최고 막대 위에 지금 가격과 평균 목표가
function targetBox(f, ent) {
  const t = f.target;
  if (!t || !t.mean) return "";
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  const cc = x && x.candles && x.candles.c;
  const now = ent && ent.close != null ? ent.close : cc && cc.length ? cc[cc.length - 1] : null;
  const up = now ? t.mean / now - 1 : null;
  const lo = Math.min(t.low ?? t.mean, now ?? t.mean), hi = Math.max(t.high ?? t.mean, now ?? t.mean);
  const at = (v) => `${(((v - lo) / (hi - lo || 1)) * 100).toFixed(1)}%`;
  const bar = t.low != null && t.high != null ? `<div class="tgt-bar" aria-hidden="true">
      <span class="tgt-range" style="left:${at(t.low)};right:${(100 - parseFloat(at(t.high))).toFixed(1)}%"></span>
      <span class="tgt-mark mean" style="left:${at(t.mean)}"></span>${now ? `<span class="tgt-mark now" style="left:${at(now)}"></span>` : ""}</div>
    <div class="tgt-ends"><span>최저 ${px(market, t.low)}</span><span>최고 ${px(market, t.high)}</span></div>` : "";
  return `<div class="tgt"><h3 class="muted" style="margin:14px 0 6px">애널리스트 ${term("목표주가")} <small>${t.n}명 평균</small></h3>
    <p class="sub" style="margin:0"><b>${price(market, t.mean)}</b>${up == null ? "" : ` · 지금보다 <b class="${sign(up)}">${pct(up)}</b>`}${t.rec ? ` · 의견 <b>${esc(t.rec)}</b>` : ""}</p>
    ${bar}<div class="legend" style="margin:4px 0 0"><span class="key"><i class="dot now"></i>지금 가격</span><span class="key"><i class="dot mean"></i>평균 목표가</span></div>
    <p class="muted note" style="margin:6px 0 0">증권사 목표가는 대체로 낙관적이고 늦게 바뀌어요. 참고만 하세요.</p></div>`;
}

// 매출과 영업이익(없으면 순이익) 막대. 적자는 0 아래로.
function fundBars(s) {
  const keys = ["revenue", hasOp(s) ? "op" : "net"];
  const vals = keys.flatMap((k) => s[k]).filter((v) => v != null);
  if (!vals.length) return "";
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const W = 320, H = 140, t = 8, b = 20, ih = H - t - b, n = s.dates.length;
  const Y = (v) => t + ((hi - v) / (hi - lo || 1)) * ih;
  const gw = W / n, bw = Math.min(22, gw * 0.3);
  let bars = "";
  s.dates.forEach((p, i) => keys.forEach((k, j) => {
    const v = s[k][i];
    if (v == null) return;
    const x = i * gw + gw / 2 + (j === 0 ? -bw - 1 : 1), y = Math.min(Y(v), Y(0));
    bars += `<rect class="fin-${k}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - Y(0))).toFixed(1)}" rx="2"/>`;
  }));
  const labels = s.dates.map((p, i) => `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(periodLabel(p))}</text>`).join("");
  return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="매출과 ${keys[1] === "op" ? "영업이익" : "순이익"} 막대그래프">
    <line class="gridline" x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>${bars}${labels}</svg>`;
}

function fundTable(s, usd) {
  const row = (label, vals, f) => `<tr><th scope="row">${label}</th>${vals.map((v, i) => `<td class="${v != null && v < 0 ? "down" : ""}">${f(v, i)}</td>`).join("")}</tr>`;
  const margin = (v, i) => (v != null && s.revenue[i] ? `${((v / s.revenue[i]) * 100).toFixed(1)}%` : "-");
  return `<div class="fin-wrap"><table class="fin"><thead><tr><th scope="col">${usd ? "달러" : "원"}</th>
    ${s.dates.map((p) => `<th scope="col">${esc(periodLabel(p))}</th>`).join("")}</tr></thead><tbody>
    ${row("매출", s.revenue, bigNum)}${hasOp(s) ? row("영업이익", s.op, bigNum) : ""}${row("순이익", s.net, bigNum)}
    ${hasOp(s) ? row("영업이익률", s.op, margin) : ""}</tbody></table></div>`;
}

// 최근 기간이 바로 앞 기간보다 얼마나 늘었는지 (앞 기간이 적자면 비율이 의미 없어서 빼요)
function growthLine(s) {
  const n = s.dates.length;
  if (n < 2) return "";
  const g = (k) => { const a = s[k][n - 2], b = s[k][n - 1]; return a != null && b != null && a > 0 ? b / a - 1 : null; };
  const parts = [["revenue", "매출"], hasOp(s) ? ["op", "영업이익"] : ["net", "순이익"]]
    .map(([k, label]) => [label, g(k)]).filter(([, v]) => v != null)
    .map(([label, v]) => `${label} <b class="${sign(v)}">${pct(v)}</b>`);
  if (!parts.length) return "";
  return `<p class="sub" style="margin:8px 0 0">${esc(periodLabel(s.dates[n - 1]))} ${fundMode === "annual" ? "전년 대비" : "직전 분기 대비"} ${parts.join(" · ")}</p>`;
}

// 캔들 차트 (SVG). 가격 축은 오른쪽, 보이는 구간의 최고·최저를 표시해요.
// 한 손가락으로 옆으로 밀면 과거로, 두 손가락 벌리기·오므리기(또는 마우스 휠)로 확대·축소, 짧게 누르면 그 캔들 값.
// 길게 누른 채 움직이거나, 이미 뜬 세부정보 선을 잡고 밀면 세부정보가 손가락을 따라와요.
const VIEW = {};  // 차트별 보기 상태 (보이는 캔들 수, 마지막 캔들 위치)
const HIT_PX = 14;  // 캔들 위아래로 이만큼(화면 점)까지 누르면 그 캔들을 누른 걸로 쳐요
const MAX_SHOW = 1300;  // 한 화면 최대 캔들 수 (상장일부터 일봉은 1만 개가 넘어서, 다 그리면 폰이 버벅여요. 더 길게는 주봉·월봉으로)
// c = frameCandles()가 만든 캔들 (일봉·주봉·월봉·년봉), show = 처음 보이는 캔들 수
// opts: fmt = 가격 표시, name = 차트 이름, ind = 켜 둔 보조지표 (이동평균선·볼린저밴드는 캔들 위에,
// 거래량·RSI는 캔들 아래 칸에 같은 날짜 축으로 그려요)
function candleChart(el, c, show, reset, onRange, { fmt = num, name = "지수", ind = IND } = {}) {
  if (!el) return;
  const n = c.keys.length;
  const { mas: maLines = [], bb, rsi } = c;
  const key = el.id;
  if (reset || !VIEW[key] || VIEW[key].n !== n || VIEW[key].frame !== c.frame) {
    VIEW[key] = { count: Math.min(show, n), end: n - 1, n, frame: c.frame, pick: null };
  }
  const v = VIEW[key];
  let W = 0, H = 0, pad, iw, ih, cw, start, lo, hi, bottom, Yp;
  let volOn = false;

  const draw = () => {
    volOn = Boolean(ind.vol && c.v && c.v.some((x) => x > 0));
    W = Math.max(el.clientWidth, 260);
    pad = { l: 6, r: 62, t: 22, b: 22 };
    // 아래 칸(거래량·RSI)을 켜면 캔들 칸을 조금 줄여서 한 화면에 더 많이 보이게 해요
    const paneH = (volOn ? 82 : 0) + (ind.rsi ? 90 : 0);
    iw = W - pad.l - pad.r;
    ih = Math.round(Math.max(paneH ? 260 : 300, window.innerHeight * 0.55 - paneH * 0.6)) - pad.t - pad.b;
    const panes = [];
    bottom = pad.t + ih;
    if (volOn) { panes.push({ kind: "vol", top: bottom + 26, h: 56 }); bottom += 26 + 56; }
    if (ind.rsi) { panes.push({ kind: "rsi", top: bottom + 26, h: 64 }); bottom += 26 + 64; }
    H = bottom + pad.b;
    v.count = Math.max(Math.min(5, n), Math.min(n, MAX_SHOW, v.count));
    v.end = Math.max(v.count - 1, Math.min(n - 1, v.end));
    const endI = Math.round(v.end);
    start = endI - Math.round(v.count) + 1;
    cw = iw / Math.round(v.count);
    let hiI = start, loI = start;
    for (let i = start; i <= endI; i++) { if (c.h[i] > c.h[hiI]) hiI = i; if (c.l[i] < c.l[loI]) loI = i; }
    hi = c.h[hiI]; lo = c.l[loI];
    if (ind.bb) {  // 볼린저밴드가 잘리지 않게 세로 범위를 넓혀요
      for (let i = start; i <= endI; i++) if (bb.up[i] != null) { hi = Math.max(hi, bb.up[i]); lo = Math.min(lo, bb.lo[i]); }
    }
    // 보이는 구간에서 값이 8배 넘게 차이 나면(상장 이후 전체처럼) 로그 눈금: 같은 비율로 오르면 같은 높이라
    // 오래전 작은 값도 납작해지지 않아요. 가격은 0 아래로 내려가지 않게 해요.
    const logY = lo > 0 && hi / lo >= 8;
    if (logY) { const r = Math.log(hi / lo) * 0.08; hi *= Math.exp(r); lo /= Math.exp(r); } else {
      const span = hi - lo || hi * 0.01; hi += span * 0.08; lo = lo >= 0 ? Math.max(0, lo - span * 0.08) : lo - span * 0.08;
    }
    const sc = logY ? (p) => Math.log(Math.max(p, lo / 10)) : (p) => p, sLo = sc(lo), sHi = sc(hi);
    const X = (i) => pad.l + (i - start + 0.5) * cw;
    const Y = (p) => pad.t + (1 - (sc(p) - sLo) / (sHi - sLo)) * ih;
    Yp = Y;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => sLo + (sHi - sLo) * (0.06 + 0.88 * f)).map((t) => (logY ? Math.exp(t) : t));
    const lastY = Y(c.c[n - 1]);
    const grid = ticks.map((t) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>
      ${Math.abs(Y(t) - lastY) < 16 ? "" : `<text x="${pad.l + iw + 6}" y="${Y(t) + 4}">${esc(fmt(t))}</text>`}`).join("");
    const bw = Math.max(1, cw * 0.7);
    let bodies = "";
    for (let i = start; i <= endI; i++) {
      const o = c.o[i], cl = c.c[i];
      const cls = cl > o ? "up" : cl < o ? "down" : "flat";
      const x = X(i), top = Y(Math.max(o, cl)), bh = Math.max(1, Math.abs(Y(o) - Y(cl)));
      bodies += `<line class="wick ${cls}" x1="${x}" x2="${x}" y1="${Y(c.h[i])}" y2="${Y(c.l[i])}"/>`
        + (cw >= 3 ? `<rect class="body ${cls}" x="${x - bw / 2}" y="${top}" width="${bw}" height="${bh}"/>` : "");
    }
    const line = (vals, cls, Yf = Y) => {
      let dstr = "", pen = false;
      for (let i = start; i <= endI; i++) {
        const val = vals[i]; if (val == null) { pen = false; continue; }
        dstr += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Yf(val).toFixed(1)}`; pen = true;
      }
      return dstr ? `<path class="${cls}" d="${dstr}"/>` : "";
    };
    // 볼린저밴드: 위·아래 선 사이를 옅게 칠하고 가운데(20개 평균)는 점선
    let bands = "";
    if (ind.bb) {
      const idx = [];
      for (let i = start; i <= endI; i++) if (bb.up[i] != null) idx.push(i);
      if (idx.length > 1) {
        const upper = idx.map((i) => `${X(i).toFixed(1)},${Y(bb.up[i]).toFixed(1)}`);
        const lower = idx.slice().reverse().map((i) => `${X(i).toFixed(1)},${Y(bb.lo[i]).toFixed(1)}`);
        bands = `<path class="bb-fill" d="M${upper.join("L")}L${lower.join("L")}Z"/>`
          + line(bb.up, "bb") + line(bb.lo, "bb") + line(bb.mid, "bb bb-mid");
      }
    }
    const mas = ind.ma ? maLines.slice().reverse().map((m) => line(m.vals, `ma ${m.cls}`)).join("") : "";
    // 지금 값 (가장 최근 캔들 종가). 과거로 밀어 봐도 보이는 구간의 최고·최저를 지금 값과 비교해요.
    const last = c.c[n - 1], lastCls = last >= c.o[n - 1] ? "up" : "down";
    const vsNow = (price) => last / price - 1;  // 최고 대비는 0 또는 마이너스, 최저 대비는 0 또는 플러스
    // 최고·최저 표시 (캔들 옆에 가격 + 지금 값이 얼마나 떨어져 있는지). 글자 길이를 어림해서 오른쪽 가격 축을 덮지 않는 쪽에 써요.
    const mark = (i, price, label, above) => {
      const text = `${label} ${fmt(price)} (${frameLabel(c, i, "short")})`, diff = pct(vsNow(price)), tail = diff;
      const w = [...`${text} ${tail}`].reduce((sum, ch) => sum + (/[가-힣]/.test(ch) ? 11 : 6.5), 0);
      const x = X(i), y = Y(price), right = x + 6 + w <= pad.l + iw || x - 6 - w < pad.l;
      const tx = right ? x + 6 : x - 6, ty = above ? y - 6 : y + 14;
      return `<line class="mark" x1="${x}" x2="${right ? x + 4 : x - 4}" y1="${y}" y2="${y}"/>
        <text class="mark-text" x="${tx}" y="${ty}" text-anchor="${right ? "start" : "end"}">${esc(text)} <tspan class="mark-diff ${sign(vsNow(price))}">${esc(tail)}</tspan></text>`;
    };
    // 지금 값 표시 (오른쪽 축, 마지막 캔들 색)
    const ly = Math.min(pad.t + ih, Math.max(pad.t, Y(last)));
    const nowTag = `<line class="now ${lastCls}" x1="${pad.l}" x2="${pad.l + iw}" y1="${ly}" y2="${ly}"/>
      <rect class="tag ${lastCls}" x="${pad.l + iw + 1}" y="${ly - 9}" width="${pad.r - 2}" height="18" rx="3"/>
      <text class="tag-text" x="${pad.l + iw + 6}" y="${ly + 4}">${esc(fmt(last))}</text>`;
    const clip = `cc-${key}`;
    // 아래 칸: 거래량 막대(캔들 색) + 20개 평균선, RSI 선 + 70·30 기준선
    const paneSvg = panes.map((p) => {
      const head = `<text class="pane-label" x="${pad.l}" y="${p.top - 7}">${p.kind === "vol" ? "거래량 (선: 20개 평균)" : "RSI(14) · 70 위 과열, 30 아래 침체"}</text>
        <line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${p.top + p.h}" y2="${p.top + p.h}"/>`;
      if (p.kind === "vol") {
        let vmax = 1;
        for (let i = start; i <= endI; i++) vmax = Math.max(vmax, c.v[i] || 0, (c.vma && c.vma[i]) || 0);
        const Yv = (x) => p.top + p.h - (x / vmax) * p.h;
        let bars = "";
        for (let i = start; i <= endI; i++) {
          const cls = c.c[i] > c.o[i] ? "up" : c.c[i] < c.o[i] ? "down" : "flat", y = Yv(c.v[i] || 0);
          bars += `<rect class="vol ${cls}" x="${X(i) - bw / 2}" y="${y}" width="${bw}" height="${p.top + p.h - y}"/>`;
        }
        return `${head}<g clip-path="url(#${clip}-p)">${bars}${c.vma ? line(c.vma, "vol-ma", Yv) : ""}</g>`;
      }
      const Yr = (x) => p.top + (1 - x / 100) * p.h;
      const now = rsi[n - 1];
      const guide = (lv) => `<line class="guide" x1="${pad.l}" x2="${pad.l + iw}" y1="${Yr(lv)}" y2="${Yr(lv)}"/>`
        + (now != null && Math.abs(Yr(now) - Yr(lv)) < 14 ? "" : `<text x="${pad.l + iw + 6}" y="${Yr(lv) + 4}">${lv}</text>`);
      // 지금 RSI는 가격처럼 오른쪽에 색 딱지로 (딱지와 겹치는 70·30 숫자는 빼요)
      const tag = now == null ? "" : `<rect class="rsi-tag" x="${pad.l + iw + 1}" y="${Yr(now) - 8}" width="34" height="16" rx="3"/>
        <text class="tag-text" x="${pad.l + iw + 6}" y="${Yr(now) + 4}">${Math.round(now)}</text>`;
      return `${head}${guide(70)}${guide(30)}<g clip-path="url(#${clip}-p)">${line(rsi, "rsi", Yr)}</g>${tag}`;
    }).join("");
    const xs = [start, Math.round((start + endI) / 2), endI];
    const xl = xs.map((i, k) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${esc(frameLabel(c, i, "axis"))}</text>`).join("");
    const picked = v.pick != null && v.pick >= start && v.pick <= endI;
    const pickSvg = `<line class="cross" x1="${picked ? X(v.pick) : 0}" x2="${picked ? X(v.pick) : 0}" y1="${pad.t}" y2="${bottom}"${picked ? "" : ' style="display:none"'}/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(name)} ${(FRAMES.find((x) => x[0] === c.frame) || FRAMES[0])[1]} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath>
        <clipPath id="${clip}-p"><rect x="${pad.l}" y="${pad.t - 2}" width="${iw}" height="${bottom - pad.t + 4}"/></clipPath></defs>
      ${grid}<g clip-path="url(#${clip})">${bands}${mas}${bodies}</g>${paneSvg}${pickSvg}
      ${mark(hiI, c.h[hiI], "최고", true)}${mark(loI, c.l[loI], "최저", false)}${nowTag}${xl}
      ${logY ? `<text class="pane-label" x="${pad.l + iw + 6}" y="${pad.t - 8}">로그 눈금</text>` : ""}</svg>
      <div class="tip" style="display:none"></div>`;
    const first = start > 0 ? c.c[start - 1] : c.o[start];
    const ch = c.c[endI] / first - 1;
    onRange(`${esc(frameLabel(c, start, "axis"))} ~ ${esc(frameLabel(c, endI, "axis"))} (${Math.round(v.count)}${UNIT[c.frame]}) `
      + `<b class="${sign(ch)}">${pct(ch)}</b><br>${hiLoLine(c.h[hiI], c.l[loI], c.c[n - 1], fmt)}`);
    if (picked) showTip(v.pick, X(v.pick));
  };

  const showTip = (i, x) => {
    const tip = $(".tip", el);
    const prev = i > 0 ? c.c[i - 1] : c.o[i], ch = c.c[i] / prev - 1;
    const row = (label, val) => `<div class="row">${label} <b>${val}</b></div>`;
    let more = "";
    if (ind.ma) more += maLines.map((m) => (m.vals[i] ? row(`${m.p}일선`, fmt(m.vals[i])) : "")).join("");
    if (ind.bb && bb.up[i] != null) more += row("볼린저 위", fmt(bb.up[i])) + row("볼린저 아래", fmt(bb.lo[i]));
    if (volOn && c.vma && c.vma[i]) more += row("거래량", `평소의 ${(c.v[i] / c.vma[i]).toFixed(1)}배`);
    if (ind.rsi && rsi[i] != null) more += row("RSI", Math.round(rsi[i]));
    tip.innerHTML = `<div class="muted">${esc(frameLabel(c, i, "full"))}</div>
      ${row("시가", fmt(c.o[i]))}${row("고가", fmt(c.h[i]))}${row("저가", fmt(c.l[i]))}
      <div class="row">종가 <b>${fmt(c.c[i])}</b> <span class="${sign(ch)}">${pct(ch, 2)}</span></div>${more}`;
    tip.style.display = "";
    const r = el.getBoundingClientRect(), left = (x / W) * r.width, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left > r.width / 2 ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `${pad.t}px`;
  };

  // 누른 곳이 캔들(고가~저가 근처)인지: 캔들 위아래 빈 곳을 누르면 세부정보를 닫아요. 아래 칸(거래량·RSI)은 캔들로 쳐요.
  const hit = (i, y) => y > pad.t + ih || (Yp && y >= Yp(c.h[i]) - HIT_PX && y <= Yp(c.l[i]) + HIT_PX);
  chartGestures(el, v, () => ({ start, cw, pad, W, hit }), draw, showTip);
  draw();
  // 화면 폭이 바뀌면(폰 돌리기) 지금 고른 기간으로 다시 그려요. 탭을 바꿔 사라진 예전 차트는 다시 그리지 않아요
  // (안 그러면 예전 차트가 위의 기간·최고·최저 문구를 덮어써요).
  el._draw = draw;
  if (!el._ro) {
    let w = el.clientWidth;
    el._ro = new ResizeObserver(() => {
      if (!el.isConnected) { el._ro.disconnect(); return; }
      if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; el._draw(); }
    });
    el._ro.observe(el);
  }
}

// 보이는 구간 최고·최저와 지금 값 차이 (차트 위 한 줄): 최고 대비 얼마 내려와 있고, 최저 대비 얼마 올라와 있는지.
// 차이 금액은 가격과 같은 모양(fmt)으로, 앞에 +/-를 붙여요.
function hiLoLine(hi, lo, now, fmt) {
  const gap = (p) => {
    const d = now - p, r = now / p - 1;
    return `<span class="${sign(r)}">${d > 0 ? "+" : d < 0 ? "-" : ""}${esc(fmt(Math.abs(d)))} (${pct(r)})</span>`;
  };
  return `<span class="nowrap">최고 ${esc(fmt(hi))} 대비 ${gap(hi)}</span> · <span class="nowrap">최저 ${esc(fmt(lo))} 대비 ${gap(lo)}</span>`;
}

// 차트 손가락·마우스 조작 (캔들 차트·비교 차트 같이): 옆으로 밀기, 두 손가락 확대·축소, 누르면 세부정보,
// 길게 누른 채 움직이면 세부정보가 손가락을 따라가요. geo()는 지금 그린 차트의 첫 칸·칸 폭·여백·폭이에요.
function chartGestures(el, v, geo, draw, showTip) {
  const pts = new Map();
  let gesture = null, raf = 0, hold = 0;
  const HOLD_MS = 280;  // 이만큼 가만히 누르고 있으면 세부정보가 손가락을 따라가요
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const scale = () => el.getBoundingClientRect().width / geo().W;
  const svgX = (clientX) => (clientX - el.getBoundingClientRect().left) / scale();
  const xOf = (i) => { const { start, cw, pad } = geo(); return pad.l + (i - start + 0.5) * cw; };
  const svgY = (clientY) => (clientY - el.getBoundingClientRect().top) / scale();
  const candleAt = (clientX) => { const { start, cw, pad } = geo(); return Math.round(start + (svgX(clientX) - pad.l) / cw - 0.5); };
  // 세부정보 닫기 (선과 상자만 숨겨요)
  const closeTip = () => {
    if (v.pick == null) return;
    v.pick = null;
    const tip = $(".tip", el), cross = $("line.cross", el);
    if (tip) tip.style.display = "none";
    if (cross) cross.style.display = "none";
  };
  el._closeTip = closeTip;
  // 차트 밖 아무 데나 눌러도 닫혀요 (화면에 차트가 없어지면 그만 들어요)
  if (!el._outside) {
    el._outside = (e) => {
      if (!el.isConnected) { document.removeEventListener("pointerdown", el._outside, true); return; }
      if (!el.contains(e.target)) el._closeTip();
    };
    document.addEventListener("pointerdown", el._outside, true);
  }
  const stopHold = () => { clearTimeout(hold); hold = 0; };
  // 고른 캔들만 바꿔요 (차트 전체를 다시 그리지 않고 선과 세부정보만 옮겨서 손가락을 바로 따라가요)
  const movePick = (clientX) => {
    const i = Math.max(geo().start, Math.min(Math.round(v.end), candleAt(clientX)));
    if (i === v.pick && $(".tip", el).style.display !== "none") return;
    v.pick = i;
    const x = xOf(i), cross = $("line.cross", el);
    if (cross) { cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.display = ""; }
    showTip(i, x);
  };
  const scrub = (clientX) => {
    stopHold();
    gesture.type = "scrub";
    el.classList.add("scrubbing");
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* 진동 없는 폰 */ }
    movePick(clientX);
  };
  const endScrub = () => { el.classList.remove("scrubbing"); };
  el.onpointerdown = (e) => {
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopHold();
    if (pts.size === 1) {
      gesture = { type: "tap", x0: e.clientX, y0: e.clientY, end0: v.end, onTip: Boolean(e.target.closest && e.target.closest(".tip")) };
      // 세부정보가 떠 있으면 그 선 근처를 잡고 밀어서 바로 옮길 수 있어요
      const { start, cw } = geo();
      const onLine = v.pick != null && v.pick >= start && v.pick <= Math.round(v.end)
        && Math.abs(svgX(e.clientX) - xOf(v.pick)) <= Math.max(cw, 28 / scale());
      if (onLine) gesture.grab = true;
      else hold = setTimeout(() => { if (gesture && gesture.type === "tap" && pts.size === 1) scrub(pts.values().next().value.x); }, HOLD_MS);
    }
    if (pts.size === 2) {
      endScrub();
      const [a, b] = [...pts.values()];
      gesture = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, count0: v.count };
    }
  };
  el.onpointermove = (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === "pinch" && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      v.count = gesture.count0 * gesture.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
      redraw();
    } else if (gesture.type === "scrub") {
      movePick(e.clientX);
    } else if (gesture.type !== "pinch") {
      const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
      if (gesture.type === "tap" && gesture.grab && Math.hypot(dx, dy) > 4) { scrub(e.clientX); return; }
      if (gesture.type === "tap" && Math.hypot(dx, dy) > 6) stopHold();
      if (gesture.type === "tap" && Math.abs(dx) > 6) gesture.type = "pan";
      if (gesture.type === "pan") { v.end = gesture.end0 - dx / (geo().cw * scale()); redraw(); }
    }
  };
  // 세부정보가 손가락을 따라가는 동안(또는 선을 잡은 동안)은 화면이 위아래로 움직이지 않게 해요
  el._lockScroll = () => Boolean(gesture && (gesture.type === "scrub" || (gesture.type === "tap" && gesture.grab)));
  if (!el._noScroll) {
    el._noScroll = true;
    el.addEventListener("touchmove", (e) => { if (e.cancelable && el._lockScroll()) e.preventDefault(); }, { passive: false });
  }
  const up = (e) => {
    stopHold();
    if (gesture && gesture.type === "tap" && pts.size === 1) {
      // 캔들을 누르면 세부정보, 같은 캔들을 다시 누르거나 빈 곳·세부정보 상자를 누르면 닫혀요
      const i = candleAt(e.clientX), { hit } = geo();
      const onCandle = !gesture.onTip && i >= geo().start && i <= Math.round(v.end) && (!hit || hit(i, svgY(e.clientY)));
      v.pick = onCandle && v.pick !== i ? i : null;
      if (v.pick == null) $(".tip", el).style.display = "none";
      draw();
    }
    // 손을 떼도 마지막 캔들의 세부정보는 남겨 둬요 (다시 누르면 닫혀요)
    if (gesture && gesture.type === "scrub") endScrub();
    pts.delete(e.pointerId);
    if (pts.size === 0) gesture = null;
    else if (pts.size === 1) { const [p] = [...pts.values()]; gesture = { type: "pan", x0: p.x, y0: p.y, end0: v.end }; }
  };
  el.onpointerup = up;
  el.onpointercancel = (e) => { stopHold(); endScrub(); pts.delete(e.pointerId); if (!pts.size) gesture = null; };
  el.onwheel = (e) => { e.preventDefault(); v.count *= e.deltaY > 0 ? 1.15 : 1 / 1.15; redraw(); };
}

// 선 차트 (SVG). 같은 단위 시리즈만 한 축에 그려요. 손가락으로 좌우로 밀면 그날 값이 보여요.
function lineChart(el, { dates, series, fmt, zero, tall, xfmt = (s) => s.slice(2).replace(/-/g, ".") }) {
  if (!el) return;
  const draw = (anim) => {
    const W = Math.max(el.clientWidth, 260);
    const H = tall ? Math.round(Math.max(300, window.innerHeight * 0.55)) : 190;  // 크게: 화면 높이의 55%
    const pad = { l: 48, r: 54, t: 8, b: 22 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = dates.length;
    const all = series.filter((s) => s.scale !== false).flatMap((s) => s.values).filter((v) => v != null);
    if (zero) all.push(0);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-9) { lo -= Math.abs(lo) * 0.01 + 0.01; hi += Math.abs(hi) * 0.01 + 0.01; }
    const span = hi - lo; lo -= span * 0.06; hi += span * 0.06;
    const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
    const ticks = (tall ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]).map((f) => lo + (hi - lo) * (0.1 + 0.8 * f));
    const grid = ticks.map((v) => `<line class="gridline" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join("");
    const xl = (n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]).map((i, k, arr) =>
      `<text x="${x(i)}" y="${H - 6}" text-anchor="${arr.length === 1 ? "middle" : k === 0 ? "start" : k === arr.length - 1 ? "end" : "middle"}">${esc(xfmt(dates[i]))}</text>`).join("");
    const paths = series.map((s) => {
      let dstr = "", pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        dstr += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
      });
      // 점이 적으면(1주·1개월) 하루하루가 보이게 점도 찍어요
      const dot = n <= 30 && s.scale !== false ? s.values.map((v, i) => v == null ? "" :
        `<circle cx="${x(i)}" cy="${y(v)}" r="${n === 1 ? 4 : 3}" fill="${s.color}"/>`).join("") : "";
      return `<path d="${dstr}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dot}`;
    }).join("");
    // 오른쪽 끝 직접 라벨 (겹치면 위아래로 벌려요)
    const ends = series.map((s) => {
      let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--;
      if (i < 0) return null;
      const yy = y(s.values[i]), top = pad.t + 6, bottom = pad.t + ih - 2;
      const arrow = yy < top ? "↑ " : yy > bottom ? "↓ " : "";  // 세로축 밖에 있는 선
      return { s, v: s.values[i], y: Math.min(bottom, Math.max(top, yy)), arrow };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    const labels = ends.map((e) => `<text class="lc-end" x="${pad.l + iw + 6}" y="${e.y + 4}" style="fill:var(--text-secondary)">${e.arrow}${esc(fmt(e.v))}</text>`).join("");
    const zl = zero ? `<line class="zero" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(0)}" y2="${y(0)}"/>` : "";
    const clip = `clip${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(", "))} 차트">
      <defs><clipPath id="${clip}"><rect x="${pad.l - 4}" y="${pad.t}" width="${iw + 8}" height="${ih}"/></clipPath></defs>
      ${grid}${zl}<g class="lc-lines" clip-path="url(#${clip})">${paths}</g>${labels}${xl}
      <g class="hover" style="display:none"><line class="cross" y1="${pad.t}" y2="${pad.t + ih}"/>
        ${series.map((s) => `<circle r="4.5" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`).join("")}</g>
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" style="display:none"></div>`;
    const svg = $("svg", el), g = $(".hover", el), tip = $(".tip", el);
    if (anim) drawIn(svg, { x0: pad.l, w: iw, sel: ".lc-lines > *", late: ".lc-end" });
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
      g.style.display = "";
      const cx = x(i);
      $("line", g).setAttribute("x1", cx); $("line", g).setAttribute("x2", cx);
      g.querySelectorAll("circle").forEach((c, k) => {
        const v = series[k].values[i];
        c.style.display = v == null || y(v) < pad.t || y(v) > pad.t + ih ? "none" : "";
        if (v != null) { c.setAttribute("cx", cx); c.setAttribute("cy", y(v)); }
      });
      tip.innerHTML = `<div class="muted">${esc(dates[i])}</div>` + series.map((s) =>
        `<div class="row"><i class="sw" style="background:${s.color}"></i>${esc(s.name)} <b>${esc(s.values[i] == null ? "-" : fmt(s.values[i]))}</b></div>`).join("");
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
    if (!el.isConnected) { ro.disconnect(); return; }  // 화면을 바꿔 사라진 차트
    if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); }
  });
  ro.observe(el);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => selectMarket(b.dataset.market)));
$(".search-btn").addEventListener("click", () => go("search"));
inboxHandle($(".inbox-btn"));
$(".home-link").addEventListener("click", (e) => { e.preventDefault(); go("home"); });  // 로고·이지스톡 글자 → 홈
// 맨 위 이지스톡 옆: 산업 지도 전체 보기로 (지도에 있으면 고른 산업을 풀고 맨 위로)
$(".map-btn").addEventListener("click", () => {
  if (screen === "map") { mapTrail = []; setMapFocus(""); window.scrollTo(0, 0); } else openMap("");
});
// 아래 버튼: 펼쳐 둔 칸·자세히를 전부 접고 그 화면의 처음 모습으로 (사용자 2026-10-24: 많이 펼쳐 두면 어지러워서).
// 고른 탭·시장·기간·이동평균선 같은 설정은 그대로 둬요. 화면 안의 버튼은 지금처럼 '화면 그대로'.
function resetFolds() {
  [POL_OPEN, SAV_OPEN, FOLD_OPEN, LEARN_OPEN].forEach((x) => x.clear());
  worldPicks.clear(); worldTop = null; hotReadOpen = false; for (const k in ROW_X) delete ROW_X[k]; polMore = false; polJump = null; calAll = false;
  cmpIdxOpen = false; maOpen = false; alertOpen = false; inboxOpen = null; econPick = null; calPick = null;
}
document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => {
  resetFolds();
  if (b.dataset.screen !== screen) { go(b.dataset.screen); return; }
  lastView = "";  // 지금 화면 버튼을 또 누르면 접어서 다시 그리고 맨 위로
  window.scrollTo(0, 0);
  render();
}));
window.addEventListener("popstate", () => {
  const h = fromHash();
  if (h.s === "stock" && h.code) stockCode = h.code;
  if (h.s === "map") mapFocus = h.code || "";
  if (h.s === "more" && h.code) moreKey = h.code;
  go(h.s, true);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
// ? 버튼: 줄 전체를 누른 것(종목 화면 열기)으로 번지지 않게 먼저 잡아서 설명 창을 띄워요
function closeTerm() { const x = $(".term-sheet"); if (x) x.remove(); }
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-term]");
  if (!b) { if (!e.target.closest || !e.target.closest(".term-sheet")) closeTerm(); return; }
  e.preventDefault();
  e.stopPropagation();
  closeTerm();
  const t = b.dataset.term;
  const box = document.createElement("div");
  box.className = "term-sheet";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", `${t} 뜻`);
  box.innerHTML = `<div class="term-head"><b>${esc(t)}</b><button type="button" class="term-x" aria-label="닫기">×</button></div><p>${esc(TERMS[t] || "")}</p>
    <button type="button" class="linkish term-all">용어집에서 분야별로 보기</button>`;
  document.body.appendChild(box);
  $(".term-x", box).addEventListener("click", closeTerm);
  $(".term-all", box).addEventListener("click", () => { closeTerm(); openTerm(t); });
  $(".term-x", box).focus({ preventScroll: true });
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTerm(); });
window.addEventListener("popstate", closeTerm);
// ---------------------------------------------------------------- 작은 설명 글씨 접기
// 설명·규칙 글씨(.note)와 도움말 목록(.help)은 처음엔 접어 두고 '자세히'를 누르면 펼쳐요.
// 붙어 있는 것끼리는 한 번에 접고, 펼친 건 화면이 다시 그려져도 앱을 닫기 전까지 펼친 채로 둬요.
const NOTE = ".note, ul.help";
const FOLD_OPEN = new Set();
function foldNotes(root) {
  root.querySelectorAll(NOTE).forEach((el) => {
    if (el.closest(".fold")) return;
    const run = [el];
    for (let n = el.nextElementSibling; n && n.matches(NOTE); n = n.nextElementSibling) run.push(n);
    const key = el.textContent.trim().slice(0, 24);
    const box = document.createElement("details");
    box.className = "fold";
    if (FOLD_OPEN.has(key)) box.open = true;
    box.innerHTML = `<summary><span class="fold-more">자세히</span><span class="fold-less">접기</span></summary>`;
    el.before(box);
    box.append(...run);
    box.addEventListener("toggle", () => { if (box.open) FOLD_OPEN.add(key); else FOLD_OPEN.delete(key); });
  });
}
new MutationObserver((recs) => {
  const hit = recs.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches(NOTE) || n.querySelector(NOTE))));
  if (hit) foldNotes($("#app"));
}).observe($("#app"), { childList: true, subtree: true });

// ---------------------------------------------------------------- 폭락 대비 점검
// 2008 금융위기·2020 코로나·2022 금리 인상 때 각 종목이 실제로 얼마나 빠졌는지(returns.py가 매주 월봉으로 계산)를
// 관심종목(똑같이 나눠 샀다고 치고)에 그대로 대입해요. 그때 상장 전이면 지수 값으로 대신해요.
const RET_IDX = { kr: null, us: null };  // 지수 하락장 [[낙폭 %, 회복 개월] | null] × 3
let CRISES = ["2008 금융위기", "2020 코로나", "2022 금리 인상"];
function crisisOf(m, code) {
  const r = RET[m] && RET[m][code];
  return (r && r[5]) || null;
}
// 종목들 [{code, name, w(비중 0~1)}] → 하락장마다 {dd, rec, worst, proxies}
function stressRun(m, items, cash) {
  const idx = RET_IDX[m] || [];
  return CRISES.map((name, k) => {
    let dd = 0, rec = 0, slow = false, worst = null;
    const proxies = [];
    items.forEach((it) => {
      const own = crisisOf(m, it.code);
      let c = own && own[k];
      if (!c) { c = idx[k]; if (c) proxies.push(it.name); }
      if (!c) return;
      dd += it.w * c[0];
      if (c[1] == null) slow = true; else rec = Math.max(rec, c[1]);
      if (!worst || c[0] < worst.dd) worst = { name: it.name, dd: c[0] };
    });
    return { name, dd: dd * (1 - cash), rec, slow, worst, proxies, index: idx[k] };
  });
}
function stressCard(d) {
  if (!RET[market]) {
    return `<section class="card" id="stress-card"><h2>폭락 대비 점검</h2><p class="muted">과거 하락장 자료를 불러오는 중이에요…</p></section>`;
  }
  const list = stocksOf(d).filter((s) => WATCH[market].includes(s.code));
  const items = list.map((s) => ({ code: s.code, name: s.name, w: 1 / list.length })), cash = 0;
  const base = market === "kr" ? 1e7 : 7470;
  const what = `관심종목 ${list.length}개에 ${money(market, base)}을 똑같이 나눠 넣었다면`;
  const empty = list.length ? "" : "관심 화면에서 ☆를 눌러 종목을 넣으면 계산해요.";
  const res = stressRun(market, items, cash);
  const worstDd = Math.min(...res.map((r) => r.dd), 0);
  const rows = res.map((r) => {
    const w = Math.min(100, Math.abs(r.dd));
    const iw = r.index ? Math.min(100, Math.abs(r.index[0])) : 0;
    const loss = base * r.dd / 100;
    return `<li class="stress-row"><div class="stress-top"><b>${esc(r.name)}</b>
        <span class="${sign(r.dd)}">${items.length ? `${Math.round(r.dd)}%` : "0%"}${items.length ? ` <small class="muted">(${money(market, Math.round(loss))})</small>` : ""}</span></div>
      <div class="stress-bar" role="img" aria-label="${esc(r.name)} 낙폭 ${Math.round(r.dd)}%, ${esc(d.index_name)} ${r.index ? r.index[0] : "-"}%">
        <i class="me" style="width:${w}%"></i>${r.index ? `<i class="idx" style="left:${iw}%" title="${esc(d.index_name)}"></i>` : ""}</div>
      <div class="meta">${items.length ? `${r.slow ? "아직 회복 못 한 종목 있음" : r.rec ? `가장 늦은 종목 회복 ${r.rec}개월` : "바로 회복"}${r.worst ? ` · 가장 많이 빠진 ${esc(r.worst.name)} ${r.worst.dd}%` : ""} · ` : ""}${esc(d.index_name)} ${r.index ? `${r.index[0]}% (회복 ${r.index[1] == null ? "아직" : `${r.index[1]}개월`})` : "자료 없음"}</div></li>`;
  }).join("");
  const proxies = [...new Set(res.flatMap((r) => r.proxies))];
  const verdict = !items.length ? "" : worstDd > -15 ? `<p class="good-line">✅ 가장 나빴던 때도 ${Math.round(worstDd)}%예요. 버틸 만한 수준이에요.</p>`
    : worstDd > -30 ? `<p class="caution">⚠️ 가장 나빴던 때 ${Math.round(worstDd)}%까지 빠져요. 현금 비중을 늘리거나 종목을 나누는 걸 생각해 보세요.</p>`
      : `<p class="caution">🚨 가장 나빴던 때 ${Math.round(worstDd)}%예요. 낙폭 최소화 원칙보다 훨씬 커요.</p>`;
  return `<section class="card" id="stress-card"><h2>폭락 대비 점검 <small>그때 같은 폭락이 오면</small></h2>
    <p class="muted" style="margin:10px 0 6px">${what}</p>
    ${empty ? `<p class="empty">${empty}</p>` : ""}
    <ul class="list stress-list">${rows}</ul>
    <div class="legend" style="margin:8px 0 0"><span class="key"><i class="sw" style="background:var(--down)"></i>${items.length ? "내 계산" : ""}</span><span class="key"><i class="sw idx-key"></i>${esc(d.index_name)}</span></div>
    ${verdict}
    ${proxies.length ? `<p class="muted" style="margin:8px 0 0">그때 상장 전이라 ${esc(d.index_name)} 값으로 대신 계산: ${proxies.slice(0, 6).map(esc).join(", ")}${proxies.length > 6 ? ` 외 ${proxies.length - 6}개` : ""}</p>` : ""}
    <p class="muted note" style="margin:10px 0 0">낙폭은 하락장 직전 월말 고점에서 월중 최저가까지예요. 회복은 다시 그 고점 종가를 넘기까지 걸린 달이에요(배당 빼고 주가만).
      과거 폭락이 그대로 반복된다는 뜻은 아니에요.</p></section>`;
}
function bindStress() { /* 고를 대상이 관심종목 하나뿐이라 묶을 버튼이 없어요 */ }

// ---------------------------------------------------------------- 사기 전 체크리스트
// 종목 화면 맨 위 신호등. 이미 있는 숫자(지수 추세, 종목 일봉, 재무 등급, 실적 일정)를 한눈에 모아요. 참고용이에요.
const VOL_MAX = { kr: 0.45, us: 0.45 };  // 이보다 크게 출렁이면 주의 (연율)
const SEASONS = [[1, 20, 2, 15], [4, 20, 5, 15], [7, 20, 8, 14], [10, 20, 11, 14]];  // 국장 분기 실적 발표가 몰리는 때
function inSeason(day) {
  const m = +day.slice(5, 7), dd = +day.slice(8, 10);
  return SEASONS.some(([m1, d1, m2, d2]) => (m === m1 && dd >= d1) || (m === m2 && dd <= d2));
}
function checks(d, x) {
  const sig = d.daily || {};
  const out = [];
  const add = (label, state, why) => out.push({ label, state, why });
  const lastOf = (a) => (a || []).filter((v) => v != null).pop();
  const ma50 = lastOf(sig.series && sig.series.ma50), ma200 = lastOf(sig.series && sig.series.ma200);
  if (sig.index && ma50 && ma200) {
    const up = sig.index > ma200 && sig.index > ma50;
    add("시장 추세", up ? "ok" : sig.index > ma200 ? "warn" : "bad",
      `${esc(d.index_name)}가 50일선 ${sig.index > ma50 ? "위" : "아래"}, 200일선 ${sig.index > ma200 ? "위" : "아래"}`);
  } else add("시장 추세", "na", "지수 자료 없음");
  const c = x && x.candles;
  const cl = c && c.c && c.c.length > 30 ? c.c : null;
  if (cl && cl.length >= 200) {
    const ma = cl.slice(-200).reduce((a, b) => a + b, 0) / 200, last = cl[cl.length - 1];
    add("종목 200일선", last > ma ? "ok" : "bad", `종가가 200일선보다 ${pct(last / ma - 1)}`);
  } else add("종목 200일선", "na", cl ? "상장 200일이 안 됐어요" : "일봉 자료 없음");
  if (cl) {
    const r = rsiOf(cl, 14).filter((v) => v != null);
    const v = r[r.length - 1];
    if (v != null) add("과열 아님", v >= 70 ? "bad" : v >= 60 ? "warn" : "ok", `${term("RSI", "RSI14")} ${Math.round(v)} (70 넘으면 과열)`);
    const hi = Math.max(...cl.slice(-250)), last = cl[cl.length - 1], off = last / hi - 1;
    add("고점 대비", off >= -0.15 ? "ok" : off >= -0.3 ? "warn" : "bad", `52주 고점보다 ${pct(off)}${off < -0.3 ? " (떨어지는 칼날 조심)" : ""}`);
    const rets = cl.slice(-21).map((v2, i, a) => (i ? Math.log(v2 / a[i - 1]) : null)).filter((v2) => v2 != null);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(252);
    add("변동성", vol <= VOL_MAX[market] * 0.7 ? "ok" : vol <= VOL_MAX[market] ? "warn" : "bad", `최근 20일 연 ${Math.round(vol * 100)}% 출렁임 (주의 기준 ${Math.round(VOL_MAX[market] * 100)}%)`);
  }
  const f = (x && x.fund) || (d.funds || {})[stockCode] || {};
  const earn = f.events && f.events.earn;
  const today = TODAY();
  const nEarn = earn ? Math.round((Date.parse(earn) - Date.parse(today)) / 864e5) : null;
  if (nEarn != null && nEarn >= 0 && nEarn <= 7) add("실적 발표", "bad", `실적 발표 ${ymd(earn)} (${dday(earn)}). 발표 직후 크게 움직일 수 있어요`);
  else if (market === "kr" && inSeason(today)) add("실적 발표", "warn", "국장 실적 시즌이에요. 발표 뒤 크게 움직이는 종목이 많아요");
  else add("실적 발표", "ok", earn && nEarn > 0 ? `다음 발표 ${ymd(earn)} (${dday(earn)})` : "가까운 발표 없음");
  const g = f.grade;
  if (g && g[2]) {
    const r = g[1] / g[2];
    add("재무 등급", f.loss ? "bad" : r >= 0.8 ? "ok" : r >= 0.6 ? "warn" : "bad", `${esc(g[0] || "")} ${g[1]}/${g[2]}${f.loss ? " · 적자" : ""}`);
  } else if (f.grade && f.grade.total) {
    const r = f.grade.score / f.grade.total;
    add("재무 등급", f.loss ? "bad" : r >= 0.8 ? "ok" : r >= 0.6 ? "warn" : "bad", `${esc(f.grade.grade || "")} ${f.grade.score}/${f.grade.total}${f.loss ? " · 적자" : ""}`);
  } else add("재무 등급", "na", "재무 자료 없음 (ETF거나 아직 못 받음)");
  return out;
}
const LIGHT = { ok: ["🟢", "통과"], warn: ["🟡", "주의"], bad: ["🔴", "걸림"], na: ["⚪", "모름"] };
function checkCard(d) {
  const x = STOCK_READY.get(`${market}/${stockCode}`);
  if (!x && STOCK_DATA.has(`${market}/${stockCode}`)) {
    return `<section class="card" id="check-card"><h2>사기 전 체크리스트</h2><p class="muted">종목 자료를 불러오는 중이에요…</p></section>`;
  }
  const list = checks(d, x);
  const known = list.filter((c) => c.state !== "na");
  const okN = known.filter((c) => c.state === "ok").length, badN = known.filter((c) => c.state === "bad").length;
  const head = !known.length ? "판단할 자료가 없어요" : badN ? `${known.length}개 중 ${okN}개 통과, ${badN}개 걸림`
    : okN === known.length ? `${known.length}개 모두 통과` : `${known.length}개 중 ${okN}개 통과, 나머지 주의`;
  return `<section class="card" id="check-card"><h2>사기 전 체크리스트 <small>${head}</small></h2>
    <ul class="checks">${list.map((c) => `<li class="ck-${c.state}"><span class="ck-dot" aria-hidden="true">${LIGHT[c.state][0]}</span>
      <span class="ck-l"><b>${c.label}</b> <span class="sr">${LIGHT[c.state][1]}</span><small>${c.why}</small></span></li>`).join("")}</ul>
    <p class="muted note" style="margin:10px 0 0">빨간 불이 하나라도 있으면 기다리는 게 보수적인 선택이에요. 모두 초록이어도 매수 추천은 아니에요. 지수 추세는 매일 자료, 나머지는 일봉·재무(매주 갱신) 기준이에요.</p></section>`;
}
function fillCheck() {
  const el = $("#check-card");
  if (el && DATA) el.outerHTML = checkCard(DATA.markets[market]);
}

// ---------------------------------------------------------------- 목표 트래커
// 목표 이름·날짜·지금 모은 돈·매달 저축·목표를 넣으면 남은 날, 진척도, 그 속도로 그날 얼마인지 세 가지로 보여줘요 (이 폰에만 저장).
const GOAL_START = { title: "목표", end: "", now: 0, monthly: 50, target: 0 };
const GOAL = { ...GOAL_START };
// 화살표가 원을 그리는 '처음으로' 아이콘 (사용자 2026-10-24)
const RESET_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>`;
try { Object.assign(GOAL, JSON.parse(localStorage.getItem("goal") || "{}")); } catch (e) { /* 처음 */ }
const GOAL_PLANS = [
  ["예금", 0.03 * (1 - 0.154), "연 3% 예금 (이자세 15.4% 뗀 뒤)"],
  ["S&P500 그냥 적립", null, "TIGER 미국S&P500 최근 10년 실제 상승률·분배율 (낙폭 -30% 안팎을 견뎌야 해요)"],
];
function goalRate(p) {
  if (p[1] != null) return p[1];
  const r = RET.kr && RET.kr["360750"];
  return r ? (r[1] + r[2]) / 100 : 0.12;
}
const goalTitle = () => (GOAL.title || "").trim() || "목표";
function monthsLeft() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(GOAL.end)) return null;
  const days = Math.round((Date.parse(GOAL.end) - Date.parse(TODAY())) / 864e5);
  return { days, months: Math.max(0, days / 30.44) };
}
function futureValue(now, monthly, rate, months) {
  const r = Math.pow(1 + rate, 1 / 12) - 1;
  const n = Math.floor(months);
  let v = now;
  for (let i = 0; i < n; i++) v = v * (1 + r) + monthly;
  return v * (1 + r * (months - n));
}
const man = (v) => (Math.abs(v) >= 1e4 ? `${(v / 1e4).toFixed(Math.abs(v) >= 1e5 ? 0 : 1).replace(/\.0$/, "")}억` : `${Math.round(v).toLocaleString("ko-KR")}만`);
function goalOut() {
  const left = monthsLeft();
  if (!left) return `<p class="muted" style="margin:10px 0 0">목표 날짜를 넣으면 계산해요.</p>`;
  if (left.days < 0) return `<p class="good-line">🎉 목표 날짜가 지났어요. 새 날짜를 넣어 보세요.</p>`;
  const prog = GOAL.target > 0 ? Math.min(1, GOAL.now / GOAL.target) : null;
  const plans = GOAL_PLANS.map((p) => ({ name: p[0], note: p[2], v: futureValue(GOAL.now, GOAL.monthly, goalRate(p), left.months) }));
  const max = Math.max(GOAL.target || 0, ...plans.map((p) => p.v), 1);
  const need = GOAL.target > 0 ? (() => {
    const r = Math.pow(1 + GOAL_PLANS[0][1], 1 / 12) - 1, n = left.months;
    const gap = GOAL.target - GOAL.now * Math.pow(1 + r, n);
    const k = r ? (Math.pow(1 + r, n) - 1) / r : n;
    return n >= 1 ? Math.max(0, gap / k) : null;
  })() : null;
  return `<div class="goal-top"><div><small>목표일까지</small><b>D-${left.days}</b><small>${Math.floor(left.months)}개월</small></div>
      <div><small>지금</small><b>${man(GOAL.now)}원</b>${prog != null ? `<small>목표의 ${Math.round(prog * 100)}%</small>` : ""}</div>
      <div><small>매달</small><b>${man(GOAL.monthly)}원</b><small>${GOAL.target ? `목표 ${man(GOAL.target)}원` : "목표 없음"}</small></div></div>
    ${prog != null ? `<div class="goal-prog" role="img" aria-label="목표의 ${Math.round(prog * 100)}%"><i style="width:${prog * 100}%"></i></div>` : ""}
    <h3 class="sav-h">이 속도로 모으면 목표일에</h3>
    <ul class="list goal-list">${plans.map((p) => `<li><div class="l"><div class="name">${p.name}</div><div class="meta">${p.note}</div>
        <div class="goal-bar"><i style="width:${(p.v / max) * 100}%"></i>${GOAL.target ? `<em style="left:${(GOAL.target / max) * 100}%" title="목표"></em>` : ""}</div></div>
      <div class="r"><b>${man(p.v)}원</b>${GOAL.target ? `<div class="meta ${p.v >= GOAL.target ? "up" : ""}">${p.v >= GOAL.target ? "목표 달성" : `${man(GOAL.target - p.v)} 모자람`}</div>` : ""}</div></li>`).join("")}</ul>
    ${need != null && need > GOAL.monthly ? `<p class="caution">예금만으로 목표에 닿으려면 매달 ${man(need)}원(지금보다 ${man(need - GOAL.monthly)}원 더)이 필요해요.</p>`
      : need != null ? `<p class="good-line">✅ 예금만으로도 목표에 닿는 속도예요. 굳이 위험을 늘릴 필요가 없어요.</p>` : ""}`;
}
function goalCard() {
  const inp = (k, label, unit, type = "text") => `<label class="sav-in"><span>${label}</span><span class="alert-input"><input data-goal="${k}" type="${type}" ${type === "text" ? `inputmode="decimal"` : ""} value="${esc(GOAL[k] || (type === "date" ? "" : 0))}">${unit ? `<span>${unit}</span>` : ""}</span></label>`;
  return `<section class="card" id="goal-card"><h2 class="goal-h"><span id="goal-title">${esc(goalTitle())}</span>
    <span class="goal-h-r"><small>이 폰에만 저장</small><button type="button" class="goal-reset" data-goal-reset aria-label="목표 초기화">${RESET_ICON}<span>한 번 더 누르면 초기화</span></button></span></h2>
    <label class="sav-in goal-name"><span>목표 이름</span><span class="alert-input"><input data-goal="title" type="text" maxlength="30" placeholder="목표" value="${esc(GOAL.title || "")}"></span></label>
    <div class="sav-grid">${inp("end", "목표 날짜", "", "date")}${inp("target", "목표 금액", "만 원")}${inp("now", "지금 모은 돈", "만 원")}${inp("monthly", "매달 저축", "만 원")}</div>
    <div id="goal-out">${goalOut()}</div>
    <p class="muted note" style="margin:10px 0 0">세 가지 모두 과거 수익률을 그대로 가정한 계산이라 보장이 아니에요. 주식 쪽은 중간에 낙폭이 와도 팔지 않고 버틴다는 가정이에요.
      목표일이 가까우면(1~2년) 쓸 돈은 예금에 두는 게 보수적이에요.</p></section>`;
}
function bindGoal() {
  const card = $("#goal-card");
  if (!card) return;
  card.querySelectorAll("[data-goal]").forEach((i) => i.addEventListener(i.type === "date" ? "change" : "input", () => {
    const k = i.dataset.goal;
    if (k === "end") GOAL.end = i.value;
    else if (k === "title") { GOAL.title = i.value.slice(0, 30); const h = $("#goal-title"); if (h) h.textContent = goalTitle(); }
    else { const v = parseFloat(i.value.replace(/[,\s]/g, "")); GOAL[k] = Number.isFinite(v) && v >= 0 ? Math.min(v, 1e6) : 0; }
    try { localStorage.setItem("goal", JSON.stringify(GOAL)); } catch (e) { /* 이번만 */ }
    const out = $("#goal-out"); if (out) out.innerHTML = goalOut();
  }));
  // 초기화: 실수로 지우지 않게 한 번 누르면 '한 번 더 누르면 초기화'로 바뀌고, 3초 안에 다시 누르면 처음 상태로
  const rb = card.querySelector("[data-goal-reset]");
  if (rb) rb.addEventListener("click", () => {
    if (!rb.classList.contains("armed")) {
      rb.classList.add("armed");
      setTimeout(() => rb.classList.remove("armed"), 3000);
      return;
    }
    Object.keys(GOAL).forEach((k) => delete GOAL[k]);
    Object.assign(GOAL, GOAL_START);
    try { localStorage.removeItem("goal"); } catch (e) { /* 이번만 */ }
    holdHeight(); card.outerHTML = goalCard();
    bindGoal(); keepTap();
  });
}
// 홈 리포트 카드에 한 줄 (목표 날짜를 넣었을 때만)
function goalLine() {
  const left = monthsLeft();
  if (!left || left.days < 0) return "";
  const prog = GOAL.target > 0 ? ` · 목표의 ${Math.round(Math.min(1, GOAL.now / GOAL.target) * 100)}%` : "";
  return `<p class="muted" style="margin:10px 0 0">🎯 ${esc(goalTitle())}까지 <b>D-${left.days}</b>${prog}</p>`;
}

// ---------------------------------------------------------------- 포트폴리오 실험실
// ETF를 섞으면 과거에 얼마나 떨어졌나 (lab.py, symbols/lab.json 월말 수정 종가, 미국 자산은 원화로 환산).
// 비율을 바꾸면 폰에서 바로 다시 계산해요. 비율은 이 폰에만 저장. 사고팔기 판단은 안 해요 (사용자 2026-10-24 '포트폴리오 실험실 만들자')
const LAB_PRESETS = [
  ["stock", "주식만", { kospi: 100 }],
  ["us", "미국 주식만", { sp500: 100 }],
  ["6040", "주식 6 : 채권 4", { kospi: 30, sp500: 30, krbond: 20, usmid: 20 }],
  ["aw", "올웨더 비슷", { sp500: 30, uslong: 40, usmid: 15, gold: 15 }],
  ["calm", "낙폭 작게", { sp500: 20, krbond: 20, gold: 20, cash: 40 }],
];
const LAB_PERIODS = [["all", "전체"], ["10", "최근 10년"], ["5", "최근 5년"]];
let LABD = null, labLoading = null;
// w: 키 → 비율(%), list: 화면에 줄로 보이는 자산 순서, extra: 검색해서 넣은 ETF (키 "kr:069500"·"us:SCHD" → { m, code, name })
const LAB = { w: { ...LAB_PRESETS[2][2] }, list: null, extra: {}, reb: "y", per: "all" };
try { Object.assign(LAB, JSON.parse(localStorage.getItem("lab") || "{}")); } catch (e) { /* 처음 */ }
if (!Array.isArray(LAB.list)) LAB.list = Object.keys(LAB.w).filter((k) => LAB.w[k] > 0);
if (!LAB.extra || typeof LAB.extra !== "object") LAB.extra = {};
let labQuery = "";
// 검색해서 넣는 ETF 월 수익률 (etf_monthly.py, symbols/etfm/<시장>-<묶음>.json). 묶음 번호는 etf_monthly.shard와 같아요
const ETF_SHARDS = { kr: 16, us: 32 };
const etfShard = (code, n) => [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % n;
const ETFM = {}, ETFD = {};  // 묶음 파일 Promise, 키 → 달 목록에 맞춘 원화 월 수익률 (없으면 null)
function loadEtf(key) {
  const x = LAB.extra[key];
  if (!x || key in ETFD) return Promise.resolve();
  const f = `${x.m}-${etfShard(x.code, ETF_SHARDS[x.m])}`;
  ETFM[f] = ETFM[f] || fetch(`symbols/etfm/${f}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return ETFM[f].then((d) => {
    const v = d && d.s && d.s[x.code];
    if (!v) { ETFD[key] = null; return; }
    const [start, r] = v, M = LABD.months, mi = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
    const out = M.map(() => null), base = mi(start) - mi(M[0]);  // r[k]는 start에서 k달 뒤 수익률
    r.forEach((x2, k) => {
      const i = base + k;
      if (i < 0 || i >= M.length) return;
      if (x.m === "us") { const fx = LABD.fx && LABD.fx[i]; out[i] = fx == null ? null : ((1 + x2 / 100) * (1 + fx / 100) - 1) * 100; }
      else out[i] = x2;
    });
    const first = out.findIndex((v2) => v2 != null);
    ETFD[key] = first < 0 ? null : { start: M[first], r: out };
  });
}
// 키 → { k, name, note, start, r } (기본 자산 또는 검색해서 넣은 ETF). 아직 못 불러왔거나 자료가 없으면 null
function labAsset(k) {
  const a = LABD.assets.find((x) => x.k === k);
  if (a) return a;
  const x = LAB.extra[k], d = ETFD[k];
  return x && d ? { k, name: x.name, note: `${x.m === "us" ? "🇺🇸 원화로 환산" : "🇰🇷"} · ${x.code}`, start: d.start, r: d.r, extra: true } : null;
}
function loadLab() {
  if (!labLoading) labLoading = fetch("symbols/lab.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((x) => { LABD = x || { months: [], assets: [] }; });
  return labLoading;
}
const saveLab = () => { try { localStorage.setItem("lab", JSON.stringify(LAB)); } catch (e) { /* 이번만 */ } };
const labSum = (w) => Object.values(w).reduce((a, b) => a + (b || 0), 0);
// 비율 w(%)로 섞어 한 달씩 굴려요. reb: 매년 12월 말에 처음 비율로 되돌리기. 같은 기간 계산을 위해 시작 달을 받을 수 있어요
function labRun(w, reb, from) {
  const A = Object.keys(w).filter((k) => w[k] > 0).map(labAsset).filter(Boolean), n = LABD.months.length, tot = A.reduce((a, x) => a + w[x.k], 0);
  if (!A.length || !tot) return null;
  let s = Math.max(...A.map((a) => a.r.findIndex((v) => v != null)));
  if (from != null) s = Math.max(s, from);
  if (s < 1 || s >= n) return null;
  let h = A.map((a) => w[a.k] / tot), v = 1, peak = 1, peakI = s - 1, mdd = 0, ddFrom = s - 1, ddTo = s - 1, under = 0, longest = 0, rec = null;
  const val = [1], dd = [0];
  for (let i = s; i < n; i++) {
    h = h.map((x, k) => x * (1 + (A[k].r[i] || 0) / 100));
    v = h.reduce((a, b) => a + b, 0);
    if (v >= peak) { peak = v; peakI = i; under = 0; } else { under++; longest = Math.max(longest, under); }
    const d = v / peak - 1;
    if (d < mdd) { mdd = d; ddFrom = peakI; ddTo = i; }
    val.push(v); dd.push(d);
    if (reb === "y" && LABD.months[i].endsWith("-12")) h = A.map((a) => v * w[a.k] / tot);
  }
  // 가장 크게 떨어졌던 때에서 원래 높이로 돌아오기까지
  for (let i = ddTo; i < n; i++) if (val[i - s + 1] >= val[ddFrom - s + 1]) { rec = i - ddFrom; break; }
  const years = (n - s) / 12;
  const yr = {};
  LABD.months.slice(s - 1).forEach((m, k) => { const y = m.slice(0, 4); yr[y] = yr[y] || [val[k], val[k]]; yr[y][1] = val[k]; });
  let worstY = null;
  Object.entries(yr).forEach(([y, [a, b]], k, all) => {  // 그 해 첫 값은 전년 말 값
    const start = k ? all[k - 1][1][1] : a, r = b / start - 1;
    if (k && (!worstY || r < worstY.r)) worstY = { y, r, part: k === all.length - 1 };
  });
  return { s, val, dd, cagr: Math.pow(v, 1 / years) - 1, mdd, ddFrom, ddTo, rec, longest, worstY, end: v, years };
}
const ym = (m) => `${m.slice(0, 4)}.${m.slice(5, 7)}`;
function labPath(arr, lo, hi, W, H) {
  const n = arr.length - 1 || 1;
  return arr.map((v, i) => `${i ? "L" : "M"}${(i / n * W).toFixed(1)},${(H - (v - lo) / (hi - lo || 1) * H).toFixed(1)}`).join("");
}
function labChart(me, base, months) {
  const W = 320, H = 120, D = 56;
  const all = [...me.val, ...(base ? base.val : [])].map((v) => Math.log(v));
  const lo = Math.min(...all), hi = Math.max(...all);
  const lg = (a) => a.map((v) => Math.log(v));
  const dlo = Math.min(me.mdd, base ? base.mdd : 0);
  const area = (a) => `${labPath(a, dlo, 0, W, D)}L${W},0L0,0Z`;
  const first = months[0], last = months[months.length - 1];
  return `<div class="lab-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="내 섞기와 비교 대상의 자산 흐름 (로그 눈금)">
      ${base ? `<path class="lab-base" d="${labPath(lg(base.val), lo, hi, W, H)}"/>` : ""}<path class="lab-me" d="${labPath(lg(me.val), lo, hi, W, H)}"/></svg>
    <p class="lab-cap">떨어진 폭 (고점 대비)</p>
    <svg viewBox="0 0 ${W} ${D}" preserveAspectRatio="none" role="img" aria-label="고점 대비 떨어진 폭">
      ${base ? `<path class="lab-dd-base" d="${area(base.dd)}"/>` : ""}<path class="lab-dd-me" d="${area(me.dd)}"/></svg>
    <div class="lab-x"><span>${ym(first)}</span><span>${ym(last)}</span></div></div>`;
}
function labCard() {
  const head = `<h2>포트폴리오 실험실 <small>섞으면 덜 떨어질까</small></h2>`;
  if (!LABD) return `<section class="card" id="lab-card">${head}<p class="muted">과거 자료를 불러오는 중이에요…</p></section>`;
  if (!LABD.assets.length) return `<section class="card" id="lab-card">${head}<p class="empty">아직 자료가 없어요. 토요일 아침에 받아 와요.</p></section>`;
  const tot = labSum(LAB.w), n = LABD.months.length;
  const from = LAB.per === "all" ? null : n - 1 - Number(LAB.per) * 12;
  const me = labRun(LAB.w, LAB.reb, from);
  const baseK = market === "us" ? "sp500" : "kospi", baseA = LABD.assets.find((a) => a.k === baseK);
  const base = me && baseA ? labRun({ [baseK]: 100 }, "n", me.s) : null;
  const sameAsBase = Object.keys(LAB.w).filter((k) => LAB.w[k] > 0).join() === baseK;
  const pre = LAB_PRESETS.find(([, , w]) => JSON.stringify(Object.entries(w).sort()) === JSON.stringify(Object.entries(LAB.w).filter(([, v]) => v > 0).sort()));
  const presets = `<nav class="chips" aria-label="섞기 예시">${LAB_PRESETS.map(([k, label]) =>
    `<button type="button" data-lab-preset="${k}" aria-pressed="${!!pre && pre[0] === k}">${label}</button>`).join("")}</nav>`;
  const rows = LAB.list.map((k) => { const v = LAB.w[k] || 0, a = labAsset(k), x = LAB.extra[k];
    if (!a) return x ? `<li class="lab-row"><div class="l"><div class="name">${esc(x.name)}</div><div class="meta">${k in ETFD ? "과거 월봉 자료가 없어서 계산에서 빠져요" : "불러오는 중이에요…"}</div></div>
      <button type="button" class="lab-del" data-lab-del="${esc(k)}" aria-label="${esc(x.name)} 빼기">✕</button></li>` : "";
    return `<li class="lab-row"><div class="l"><div class="name">${esc(a.name)}</div><div class="meta">${esc(a.note)} · ${ym(a.start)}~</div>
        <div class="lab-bar"><i style="width:${Math.min(100, v)}%"></i></div></div>
      <div class="lab-step"><button type="button" data-lab-w="${a.k}" data-d="-10" aria-label="${esc(a.name)} 10%p 줄이기"${v ? "" : " disabled"}>−</button>
        <b>${v}%</b><button type="button" data-lab-w="${a.k}" data-d="10" aria-label="${esc(a.name)} 10%p 늘리기"${tot >= 100 ? " disabled" : ""}>+</button>
        <button type="button" class="lab-del" data-lab-del="${esc(a.k)}" aria-label="${esc(a.name)} 빼기">✕</button></div></li>`; }).join("")
    || `<li><p class="empty">위에서 자산을 골라 넣어 주세요.</p></li>`;
  // 자산 고르기: 기본 자산은 눌러서 넣고 빼는 버튼, 그 밖의 ETF는 이름으로 찾아 넣어요.
  // 넣어도 이 칸 높이는 그대로라 화면이 안 밀려요 (줄은 아래 '내 비율'에 붙어요)
  const pick = `<h3 class="sav-h">자산 고르기</h3><nav class="chips lab-pick" aria-label="기본 자산">${LABD.assets.map((x) =>
    `<button type="button" data-lab-pick="${x.k}" aria-pressed="${LAB.list.includes(x.k)}">${esc(x.name)}</button>`).join("")}</nav>
    <input id="lab-q" class="search lab-q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="다른 ETF 찾기: 슈드, 나스닥100, 반도체, 국채…" aria-label="ETF 찾기" value="${esc(labQuery)}">
    <div id="lab-results">${labResults()}</div>`;
  const sumLine = tot === 100 ? `<p class="muted lab-sum">합계 <b>100%</b></p>`
    : `<p class="caution lab-sum">합계 ${tot}%예요. ${tot ? "100%로 맞춰(비율대로 늘려) 계산했어요." : "비율을 넣어 주세요."}</p>`;
  const opts = `<div class="lab-opts"><nav class="chips" aria-label="되돌리기">${[["y", "매년 비율 되돌리기"], ["n", "그냥 두기"]].map(([k, l]) =>
      `<button type="button" data-lab-reb="${k}" aria-pressed="${LAB.reb === k}">${l}</button>`).join("")}</nav>
    <nav class="chips" aria-label="기간">${LAB_PERIODS.map(([k, l]) => `<button type="button" data-lab-per="${k}" aria-pressed="${LAB.per === k}">${l}</button>`).join("")}</nav></div>`;
  let out = "";
  if (me) {
    const months = LABD.months.slice(me.s - 1);
    const won = (v) => `${man(v * 1000)}원`;
    const col = (r, label) => r ? `<div class="lab-col"><p class="lab-who">${label}</p>
      <div class="stat"><span>가장 크게 떨어진 폭</span><b class="${r.mdd < -0.2 ? "down" : ""}">${pct(r.mdd)}</b><small>${ym(LABD.months[r.ddFrom])}→${ym(LABD.months[r.ddTo])}</small></div>
      <div class="stat"><span>다시 회복까지</span><b>${r.rec == null ? "아직" : `${r.rec}개월`}</b><small>가장 길게 물린 ${r.longest}개월</small></div>
      <div class="stat"><span>연 수익률</span><b class="${sign(r.cagr)}">${pct(r.cagr)}</b><small>1,000만 원 → ${won(r.end)}</small></div>
      <div class="stat"><span>가장 나빴던 해</span><b class="${r.worstY ? sign(r.worstY.r) : ""}">${r.worstY ? pct(r.worstY.r) : "-"}</b><small>${r.worstY ? `${r.worstY.y}년${r.worstY.part ? " (올해 지금까지)" : ""}` : ""}</small></div></div>` : "";
    const verdict = !base || sameAsBase ? "" : me.mdd > base.mdd + 0.03
      ? `<p class="good-line">✅ ${esc(baseA.name)}만 들고 있을 때보다 가장 크게 떨어진 폭이 ${Math.round((me.mdd - base.mdd) * 100)}%p 작아요${me.cagr < base.cagr ? `. 대신 연 수익률은 ${((base.cagr - me.cagr) * 100).toFixed(1)}%p 낮아요` : ""}.</p>`
      : me.mdd < base.mdd - 0.03 ? `<p class="caution">⚠️ ${esc(baseA.name)}만 들고 있을 때보다 더 크게 떨어졌어요.</p>`
        : `<p class="muted">${esc(baseA.name)}만 들고 있을 때와 떨어진 폭이 비슷해요.</p>`;
    out = `<p class="muted lab-period">${ym(months[0])}~${ym(months[months.length - 1])} (${me.years.toFixed(1)}년) · 원화 기준 · 분배금 다시 넣음</p>
      ${labChart(me, sameAsBase ? null : base, months)}
      <div class="legend" style="margin:6px 0 0"><span class="key"><i class="sw" style="background:var(--accent)"></i>내 섞기</span>${base && !sameAsBase ? `<span class="key"><i class="sw" style="background:var(--text-muted)"></i>${esc(baseA.name)}만</span>` : ""}</div>
      <div class="lab-cols">${col(me, "내 섞기")}${sameAsBase ? "" : col(base, `${esc(baseA.name)}만`)}</div>${verdict}`;
  }
  return `<section class="card" id="lab-card">${head}
    <p class="muted" style="margin:8px 0 0">예시를 고르거나 자산을 넣고 + − 로 비율을 바꾸면, 과거에 그렇게 섞어 뒀을 때 얼마나 떨어지고 얼마 만에 회복했는지 보여 줘요.</p>
    ${presets}${pick}<h3 class="sav-h">내 비율</h3><ul class="list lab-list">${rows}</ul>${sumLine}${opts}${out}
    <p class="muted note" style="margin:10px 0 0">야후 파이낸스 월말 수정 종가(분배금 다시 넣은 값)로 계산해요. 미국 자산은 그달 원/달러로 바꿔서, 위기 때 원화가 약해지면 원화 기준 낙폭이 줄어든 것까지 들어 있어요.
      세금·환전 수수료는 빼지 않았어요. 기간이 짧은 자산을 넣으면 그 자산이 상장한 달부터 계산해요. 과거 숫자일 뿐 앞으로를 보장하지 않아요.</p></section>`;
}
// 넣기·빼기: 넣을 땐 100%가 안 찼으면 남은 만큼(최대 10%), 다 찼으면 0%로 넣어요
function labToggle(k) {
  if (LAB.list.includes(k)) { LAB.list = LAB.list.filter((x) => x !== k); delete LAB.w[k]; }
  else { LAB.list = [...LAB.list, k]; const left = 100 - LAB.list.reduce((a, x) => a + (LAB.w[x] || 0), 0); LAB.w = { ...LAB.w, [k]: Math.max(0, Math.min(10, left)) }; }
  saveLab(); labRedraw();
}
// 검색 결과: ETF만, 국장·미장 섞어서 잘 맞는 순 6개. 기본 자산과 같은 ETF는 그 버튼으로 넣어요
const LAB_SYM = () => Object.fromEntries((LABD ? LABD.assets : []).map((a) => [a.sym.replace(/\.K[SQ]$/, ""), a.k]));
function labResults() {
  const q = labQuery.trim();
  if (!q) return "";
  if (!SYM.kr || !SYM.us) return `<p class="muted lab-hint">종목 목록을 불러오는 중이에요…</p>`;
  const qs = queryKeys(q), hits = [];
  for (const m of ["kr", "us"]) (SYM[m] || []).forEach((e, i) => {
    if (e.row[3] !== "e") return;
    const sc = scoreOf(e.row, e.keys, qs);
    if (sc != null) hits.push({ m, sc, i, row: e.row });
  });
  hits.sort((a, b) => a.sc - b.sc || (a.m === market ? 0 : 1) - (b.m === market ? 0 : 1) || a.i - b.i);
  if (!hits.length) return `<p class="muted lab-hint">"${esc(q)}"에 맞는 ETF가 없어요.</p>`;
  const same = LAB_SYM();
  return `<ul class="lab-hits">${hits.slice(0, 6).map(({ m, row }) => {
    const k = (m === "kr" && same[row[0]]) || (m === "us" && same[row[0]]) || `${m}:${row[0]}`, on = LAB.list.includes(k);
    return `<li><span><b>${esc(row[1])}</b><small>${m === "kr" ? "🇰🇷" : "🇺🇸"} ${esc(row[0])}</small></span>
      <button type="button" data-lab-add="${esc(k)}" data-m="${m}" data-code="${esc(row[0])}" data-name="${esc(row[1])}" aria-pressed="${on}">${on ? "넣음 ✓" : "+ 넣기"}</button></li>`;
  }).join("")}</ul>`;
}
function bindLabResults(el) {
  el.querySelectorAll("[data-lab-add]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.labAdd;
    if (!LAB.list.includes(k) && !LABD.assets.some((a) => a.k === k)) LAB.extra[k] = { m: b.dataset.m, code: b.dataset.code, name: b.dataset.name };
    if (LAB.extra[k] && !(k in ETFD)) { b.textContent = "불러오는 중…"; loadEtf(k).then(() => labToggle(k)); }
    else labToggle(k);
  }));
}
function labRedraw() {
  const card = $("#lab-card");
  if (!card) return;
  holdHeight(); card.outerHTML = labCard();
  bindLab(); keepTap();
}
function bindLab() {
  const card = $("#lab-card");
  if (!card) return;
  if (!LABD) { loadLab().then(() => { if (screen === "tools") labRedraw(); }); return; }
  const lc = $(".lab-chart", card);
  if (drawSoon(lc)) lc.querySelectorAll("svg").forEach((svg) => drawIn(svg, { w: svg.viewBox.baseVal.width, sel: "path", px: svg.clientWidth }));
  card.querySelectorAll("[data-lab-preset]").forEach((b) => b.addEventListener("click", () => {
    LAB.w = { ...LAB_PRESETS.find(([k]) => k === b.dataset.labPreset)[2] }; LAB.list = Object.keys(LAB.w); saveLab(); labRedraw();
  }));
  card.querySelectorAll("[data-lab-pick]").forEach((b) => b.addEventListener("click", () => labToggle(b.dataset.labPick)));
  card.querySelectorAll("[data-lab-del]").forEach((b) => b.addEventListener("click", () => labToggle(b.dataset.labDel)));
  const q = $("#lab-q", card), res = $("#lab-results", card);
  if (q && res) {
    const refresh = () => { res.innerHTML = labResults(); bindLabResults(res); };
    q.addEventListener("input", () => { labQuery = q.value; refresh(); });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") q.blur(); });
    bindLabResults(res);
    if (labQuery && (!SYM.kr || !SYM.us)) loadSymbols().then(() => { if ($("#lab-results")) refresh(); });
    q.addEventListener("focus", () => { if (!SYM.kr || !SYM.us) loadSymbols().then(() => { if (labQuery && $("#lab-results")) refresh(); }); }, { once: true });
  }
  const todo = LAB.list.filter((k) => LAB.extra[k] && !(k in ETFD));
  if (todo.length) Promise.all(todo.map(loadEtf)).then(() => { if (screen === "tools") { lastTap = null; labRedraw(); } });
  card.querySelectorAll("[data-lab-w]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.labW, v = Math.max(0, Math.min(100, (LAB.w[k] || 0) + Number(b.dataset.d)));
    LAB.w = { ...LAB.w, [k]: v };
    saveLab(); labRedraw();
  }));
  card.querySelectorAll("[data-lab-reb]").forEach((b) => b.addEventListener("click", () => { LAB.reb = b.dataset.labReb; saveLab(); labRedraw(); }));
  card.querySelectorAll("[data-lab-per]").forEach((b) => b.addEventListener("click", () => { LAB.per = b.dataset.labPer; saveLab(); labRedraw(); }));
}

// ---------------------------------------------------------------- 수익률 달력
// 지수가 날마다 몇 % 움직였는지 달력 칸에 색으로 (오르면 빨강, 내리면 파랑). 최근 5년쯤.
// 관심종목 배당락일(💰)도 같이 찍어요.
let calSrc = "idx";
let calMonth = null;  // "YYYY-MM"
let calPick = null;   // 눌러 본 날
function calSources(d) {
  const out = [];
  if (d.daily && d.daily.candles) out.push(["idx", d.index_name]);
  return out;
}
// 고른 것 → {날짜: 그날 수익률}
function dailyReturns(d, src) {
  const out = {};
  const c = d.daily.candles;
  for (let i = 1; i < c.dates.length; i++) out[c.dates[i]] = c.c[i] / c.c[i - 1] - 1;
  return out;
}
function exdivDays(d) {
  const out = {};
  const funds = d.funds || {};
  const codes = new Set(WATCH[market]);
  const names = Object.fromEntries(stocksOf(d).map((s) => [s.code, s.name]));
  codes.forEach((c) => { const e = (funds[c] || {}).events; if (e && e.exdiv) (out[e.exdiv] = out[e.exdiv] || []).push(names[c] || c); });
  return out;
}
const calColor = (r) => {
  if (r == null) return "";
  if (Math.abs(r) < 0.00005) return "background:var(--surface-0)";  // 0.0%는 빨강·파랑 없이
  const a = Math.min(1, Math.abs(r) / 0.02) * 0.85 + 0.12;
  return `background:color-mix(in srgb, var(${r >= 0 ? "--up" : "--down"}) ${Math.round(a * 100)}%, transparent)`;
};
function compound(list) { return list.reduce((a, r) => a * (1 + r), 1) - 1; }
function retCalendarCard(d) {
  const srcs = calSources(d);
  if (!srcs.length) return "";
  if (!srcs.some((s) => s[0] === calSrc)) calSrc = srcs[0][0];
  const daily = dailyReturns(d, calSrc);
  const days = Object.keys(daily).sort();
  const last = days[days.length - 1] || TODAY();
  if (!calMonth || (days.length && (calMonth < days[0].slice(0, 7) || calMonth > last.slice(0, 7)))) calMonth = last.slice(0, 7);
  const [y, m] = calMonth.split("-").map(Number);
  const exd = exdivDays(d);
  const inMonth = days.filter((x) => x.startsWith(calMonth));
  const mret = inMonth.length ? compound(inMonth.map((x) => daily[x])) : null;
  const upN = inMonth.filter((x) => daily[x] > 0).length, downN = inMonth.filter((x) => daily[x] < 0).length;
  // 월~금 다섯 칸 (주말은 장이 없어서 빼요)
  const first = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = "";
  const lead = (first.getUTCDay() + 6) % 7;
  if (lead < 5) cells += `<span class="cal-cell blank"></span>`.repeat(lead);
  for (let dd = 1; dd <= dim; dd++) {
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const key = `${calMonth}-${String(dd).padStart(2, "0")}`;
    const r = daily[key];
    const ex = exd[key];
    cells += `<button type="button" class="cal-cell${r == null ? " off" : ""}${calPick === key ? " picked" : ""}" data-calday="${key}" style="${calColor(r)}"
      aria-label="${m}월 ${dd}일 ${r == null ? "기록 없음" : pct(r, 2)}${ex ? `, 배당락 ${ex.join(", ")}` : ""}">
      <span class="cd">${dd}${ex ? "<i>💰</i>" : ""}</span><span class="cr">${r == null ? "" : `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}`}</span></button>`;
  }
  const months = [];
  for (let k = 1; k <= 12; k++) {
    const key = `${y}-${String(k).padStart(2, "0")}`;
    const list = days.filter((x) => x.startsWith(key));
    const r = list.length ? compound(list.map((x) => daily[x])) : null;
    months.push(`<button type="button" class="cal-m${key === calMonth ? " on" : ""}" data-calm="${key}" ${list.length ? "" : "disabled"} style="${r == null ? "" : calColor(r / 3)}">
      <span>${k}월</span><b>${r == null ? "-" : `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%`}</b></button>`);
  }
  const yearDays = days.filter((x) => x.startsWith(`${y}-`));
  const yret = yearDays.length ? compound(yearDays.map((x) => daily[x])) : null;
  const pick = calPick && calPick.startsWith(calMonth) ? calPick : null;
  const pickLine = pick ? `<p class="cal-pick">${pick.slice(5, 7)}.${pick.slice(8)} ${daily[pick] == null ? "장이 없었거나 기록 전이에요" : `<b class="${sign(daily[pick])}">${pct(daily[pick], 2)}</b>`}${exd[pick] ? ` · 💰 배당락: ${exd[pick].map(esc).join(", ")}` : ""}</p>` : "";
  const firstM = days.length ? days[0].slice(0, 7) : calMonth;
  return `<section class="card" id="retcal-card"><h2>수익률 달력 <small>${esc(d.index_name)} 날마다 몇 %</small></h2>
    <div class="cal-head"><button type="button" class="cal-nav" data-calstep="-1" aria-label="이전 달" ${calMonth <= firstM ? "disabled" : ""}>‹</button>
      <div><b>${y}년 ${m}월</b><small>${mret == null ? "기록 없음" : `<span class="${sign(mret)}">${pct(mret)}</span> · 오른 날 ${upN} · 내린 날 ${downN}`}</small></div>
      <button type="button" class="cal-nav" data-calstep="1" aria-label="다음 달" ${calMonth >= last.slice(0, 7) ? "disabled" : ""}>›</button></div>
    <div class="cal-grid"><span class="cal-w">월</span><span class="cal-w">화</span><span class="cal-w">수</span><span class="cal-w">목</span><span class="cal-w">금</span>${cells}</div>
    ${pickLine}
    <h3 class="sav-h">${y}년 달별 <small class="muted">${yret == null ? "" : `한 해 ${pct(yret)}`}</small></h3>
    <div class="cal-months">${months.join("")}</div>
    <p class="muted note" style="margin:10px 0 0">칸 색이 진할수록 많이 움직인 날이에요(±2%면 가장 진해요). 지수 종가 기준이에요.
      💰는 관심종목의 다음 배당락일이에요(야후 무료 자료라 바뀔 수 있어요).</p></section>`;
}
function bindRetCal(d) {
  const card = $("#retcal-card");
  if (!card) return;
  const redraw = () => { const c = $("#retcal-card"); if (c) { c.outerHTML = retCalendarCard(d); bindRetCal(d); keepTap(); } };
  card.querySelectorAll("[data-calstep]").forEach((b) => b.addEventListener("click", () => {
    const [y, m] = calMonth.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + Number(b.dataset.calstep), 1));
    calMonth = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    redraw();
  }));
  card.querySelectorAll("[data-calm]").forEach((b) => b.addEventListener("click", () => { calMonth = b.dataset.calm; redraw(); }));
  card.querySelectorAll("[data-calday]").forEach((b) => b.addEventListener("click", () => { calPick = calPick === b.dataset.calday ? null : b.dataset.calday; redraw(); }));
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();  // 데이터가 오기 전에도 주소에 맞는 시장·화면 버튼을 표시해요
load();
