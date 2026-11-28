"use strict";
// 이지스톡 대시보드: data.json(dashboard.py가 매일 만듦)을 읽어 국장·미장 화면을 그려요.

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
const SCREENS = ["home", "report", "watch", "tools", "chart", "stock", "search", "map", "inbox", "world", "more", "feedback", "help"];
let screen = "home";
// 종목 화면(#kr/stock/005930), 검색 화면(#kr/search), 산업 지도(#kr/map/조선)는 보던 화면 위에 한 겹 더 열려요 (뒤로 가면 보던 화면).
// 아래 버튼은 그 아래 깔린 화면(stockFrom)에 불이 들어와요.
const LAYERS = ["stock", "search", "map", "inbox", "world", "more", "feedback", "help"];  // 자세한 사용법(#kr/help)도 한 겹 위
// 의견 보내기(#kr/feedback)도 한 겹 위  // 메시지함(#kr/inbox), 세계 지수(#kr/world), 더 보기 칸(#kr/more/<칸>)도 한 겹 위
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
  remember(`watch_${m}`, JSON.stringify(list));
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
  remember("sector", JSON.stringify(SECTOR));
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
  "네 마녀의 날": "3·6·9·12월 만기일. 주가지수 선물·옵션과 개별 주식 선물·옵션 네 가지가 한꺼번에 끝나서 장 마감 무렵 큰 매매가 몰려요. 미장은 같은 날 S&P 500 리밸런싱도 겹쳐요.",
  "지수 정기변경": "코스피200·MSCI·S&P 500 같은 지수가 정해진 날 종목을 바꾸는 것. 지수를 따라가는 펀드가 그날 종가에 한꺼번에 사고팔아서, 들어가는 종목은 오르고 빠지는 종목은 내리는 경우가 많아요.",
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
  ["📈 시장·지수", ["코스피", "코스닥", "S&P500", "나스닥", "필라델피아 반도체", "시가총액", "조정", "약세장", "최대 낙폭", "변동성", "서킷브레이커", "사이드카", "옵션 만기", "네 마녀의 날", "지수 정기변경", "공매도", "히트맵"]],
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
// 이 폰에 기억하기. 저장소를 못 쓰면(사생활 보호 모드 등) 이번만 기억해요
function remember(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 이번만 기억 */ } }
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
// 악재로 읽히는 제목 (사용자 2026-11-15 "증시에 악영향이 가는 뉴스를 강조해서"). news.py BAD와 같게 맞춰요
const BAD_NEWS = /급락|폭락|추락|붕괴|쇼크|위기|공포|패닉|경고|빨간불|적신호|손실|우려|불안|리스크|악재|투매|이탈|순매도|매도 폭탄|반토막|검은 월요일|블랙 ?먼데이|휘청|출렁|위험 신호|매도세|후폭풍|스캔들|사임|퇴진|사퇴|수사|기소|구속|제재|디폴트|파산|부도|침체|전쟁|공습|미사일|셧다운|\bcrash|plunge|tumble|sell-?off|recession|default|scandal|resign/i;
// 악재 낱말이 있어도 풀렸다는 뜻이면 빼고, 풀리는 일이 실패·지연이면 다시 악재 (사용자 2026-11-24). news.py GOOD·NOT_GOOD와 같게
const GOOD_NEWS = /완화|해소|진정|반등|회복|벗어나|벗어난|안도|불식|딛고|극복|일단락|철회|타결|휴전|\bease[sd]?\b|rebound|recover|rall(y|ies|ied)/i;
const NOT_GOOD_NEWS = /(완화|해소|진정|반등|회복|안도|타결|휴전|극복)[^,.…·]{0,6}(실패|무산|불발|지연|좌절|결렬|난망|어려|못|멀어|제한적|역부족|불투명|에도)/i;
const badTitle = (t) => BAD_NEWS.test(t) && (!GOOD_NEWS.test(t) || NOT_GOOD_NEWS.test(t));
// 서버가 정한 악재(핫 뉴스는 같은 사건 기사 절반 이상이 악재일 때)를 먼저 믿고, 없을 때만 제목으로
const isBad = (n) => (typeof n.bad === "boolean" && n.bads != null ? n.bad : badTitle(n.title || ""));
const badTag = (n) => (isBad(n) ? `<span class="badge bad">⚠️ 악재</span> ` : "");
// 안 읽은 핫 뉴스: 악재 먼저 (그 안에선 원래 순서)
const hotOf = (m) => { const H = HOT[m].filter((n) => !HOT_READ.has(hotId(n))); return [...H.filter(isBad), ...H.filter((n) => !isBad(n))]; };
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

// 투자 공부 화면에서만 쓰는 큰 자료(사례 일지·리포트 목록·사례집 기록)는 learn.json으로 따로 와요.
// 홈을 그린 뒤 뒤에서 받아 두고, 공부 화면을 먼저 열면 받는 동안 '불러오는 중'을 보여요 (2026-11-18 로딩 빠르게)
const LEARN_KEYS = ["learn_cases", "reading", "story_log"];
let LEARN = null, learnP = null;
// 주소의 v=는 내용 해시(learn_v)라서, 내용이 그대로면 배포가 몇 번 돼도 폰에 받아 둔 걸 써요 (2026-11-21)
const learnV = () => DATA && (DATA.learn_v || DATA.built);
const learnReady = () => !!(LEARN && DATA && (LEARN.v || LEARN.built) === learnV());
function loadLearn() {
  if (!DATA || !DATA.reading_days || learnReady()) return Promise.resolve();
  if (learnP) return learnP;
  const v = learnV();
  learnP = fetch(`learn.json?v=${encodeURIComponent(v)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => {
    learnP = null;
    if (!x || !DATA || learnV() !== v) return;
    LEARN = x;
    for (const k of LEARN_KEYS) DATA[k] = x[k];
    if (screen === "more" && moreKey === "learn") { lastView = ""; render(); }  // 기다리던 공부 화면
  });
  return learnP;
}
// 지수 5년 일봉(차트 화면·실험실만 씀)은 charts.json으로 따로 와요. 홈을 그리자마자 뒤에서 받아 두고,
// 차트 화면을 먼저 열면 받는 동안 '불러오는 중'을 보여요 (자료 다이어트 2026-11-21, data.json 약 3분의 1)
let CHARTS = null, chartsP = null;
const chartsReady = () => !DATA || !DATA.charts_v || !!(CHARTS && CHARTS.v === DATA.charts_v);
function adoptCharts() {
  if (!CHARTS || !DATA || CHARTS.v !== DATA.charts_v) return;
  for (const [k, c] of Object.entries(CHARTS.markets || {})) { const m = DATA.markets[k]; if (m && m.daily) m.daily.candles = c; }
}
function loadCharts() {
  if (chartsReady()) return Promise.resolve();
  if (chartsP) return chartsP;
  const v = DATA.charts_v;
  chartsP = fetch(`charts.json?v=${encodeURIComponent(v)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => {
    chartsP = null;
    if (!x || !DATA || DATA.charts_v !== v) return;
    CHARTS = x;
    adoptCharts();
    if (screen === "chart" || (screen === "tools" && perfTabKey === "cal")) { lastView = ""; render(); }  // 기다리던 화면만
  });
  return chartsP;
}
// index.html이 app.js를 받는 동안 미리 받기 시작한 data.json·뉴스 (예전엔 app.js가 다 온 뒤에야 받기 시작했어요)
const BOOT = window.BOOT || {};
const fetchData = () => fetch("data.json", { cache: "no-cache" })  // 바뀐 게 없으면 서버가 짧은 304로 답해요
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
async function load() {
  let data;
  let news = null;
  if (BOOT.step) BOOT.step("app");
  try {
    const early = BOOT.data;
    BOOT.data = null;  // 미리 받은 건 처음 한 번만
    data = await (early || fetchData());
    remember("news_url", data.news_url || "");
    // 뉴스는 잠깐만 기다려요. 늦으면 화면을 먼저 그리고, 받은 뉴스는 다음에 그릴 때 보여요 (화면이 튀지 않게)
    const earlyNews = BOOT.news && BOOT.newsUrl === data.news_url ? BOOT.news : null;
    BOOT.news = null;
    news = earlyNews ? earlyNews.then((x) => { if (x && x.updated) { NEWS = x; stashHot(x); } return x; }) : loadNews(data.news_url);
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
  if (learnReady()) for (const k of LEARN_KEYS) DATA[k] = LEARN[k];
  adoptCharts();
  adoptExtras();
  $("#updated").textContent = `화면 데이터 갱신: ${DATA.built.replace("T", " ").slice(0, 16)} (한국시간)`;
  const had = NEWS && NEWS.updated;
  // 그리기 중 오류가 나도 대기화면(99%)에 멈추지 않게: 칸은 view.js paintCards가 하나씩 지키고, 그 밖의 오류는 여기서 받아요
  try { render(); } catch (e) { if (window.console) console.error("화면 그리기 오류", e); if ($("#app .boot")) $("#app").innerHTML = cardFail(e); }
  guideMaybe();  // 처음 연 사람에게만 사용법 안내 한 번
  setTimeout(loadCharts, 300);  // 홈 그림이 먼저 (차트 화면을 바로 열면 그때 받기 시작)
  setTimeout(loadLearn, 1500);
  setTimeout(preloadJs, 2500);  // 지도·도구·의견 화면 파일도 미리  // 홈이 다 뜬 뒤에 (홈 사진·종목 자료와 다투지 않게)
  news.then(() => { if (NEWS && NEWS.updated !== had) paintNews(); });
}
// 늦게 도착한 뉴스: 홈 '더 보기'의 지금 뉴스 한 줄만 바꿔요 (칸 화면은 다음에 그릴 때. 보던 화면이 튀지 않게)
function paintNews() {
  if (screen !== "home" || !DATA) return;
  const row = homeMoreRows(DATA.markets[market], "news")[0];
  const sum = document.querySelector('[data-more="news"] .hm-s');
  if (row && sum) sum.innerHTML = row.sum;
}

function selectMarket(m) {
  market = m;
  remember("market", m);
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
let mapFocus = mapStart;

// 지도에서 거쳐 온 산업들. 빈 곳을 누르면 하나씩 되돌아가고, 다 되돌아가면 전체 보기예요
let mapTrail = [];
function openMap(name) {
  mapFocus = name || "";
  mapTrail = [];
  go("map");
}

// ---------------------------------------------------------------- 화면 파일 나중에 받기 (2026-11-20)
// 산업 지도·도구·의견 화면 파일은 처음 열 때 받아요 (홈을 먼저 빨리 띄우려고). 홈이 뜨고 쉬는 틈에 미리 받아 두니까 보통은 기다리지 않아요.
// 이 파일들이 쓰는 것 중 다른 화면도 쓰는 것(목표 칸의 자산 합계, 하락장 자료 RET, 지도 고른 산업 mapFocus 등)은 먼저 받는 파일에 있어요.
// 배포본은 dashboard.py가 window.JSV에 파일마다 버전을 넣어요 (js/map.js?v=…, 서비스워커가 폰에 저장).
const LAZY = { map: ["map"], tools: ["savings", "asset", "lab", "divcalc"], feedback: ["feedback"] };
const JS_GOT = new Set(), JS_P = {};
function needJs(name) {
  if (JS_GOT.has(name)) return Promise.resolve();
  return JS_P[name] || (JS_P[name] = new Promise((ok, fail) => {
    const s = document.createElement("script"), v = (window.JSV || {})[name];
    s.src = `js/${name}.js${v ? `?v=${v}` : ""}`;
    s.onload = () => { JS_GOT.add(name); ok(); };
    s.onerror = () => { delete JS_P[name]; s.remove(); fail(new Error(name)); };
    document.head.appendChild(s);
  }));
}
// 한 화면의 파일들은 차례대로 받아요 (앞 파일에 있는 걸 뒤 파일이 쓸 수 있게)
const needScreen = (sc) => (LAZY[sc] || []).reduce((p, n) => p.then(() => needJs(n)), Promise.resolve());
const screenReady = (sc) => (LAZY[sc] || []).every((n) => JS_GOT.has(n));
function preloadJs() { Object.keys(LAZY).reduce((p, sc) => p.then(() => needScreen(sc)).catch(() => {}), Promise.resolve()); }
