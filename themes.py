#!/usr/bin/env python3
"""테마 사전: 앱 검색창에 '전력 관련 종목 찾아줘'처럼 문장으로 치면 연관 종목을 보여 주는 데 써요.

전부 무료예요 (유료 AI·유료 API 안 씀). 문장에서 아래 테마 낱말(동의어)을 찾아 미리 골라 둔 종목을 보여 줘요.
  - kr / us: 그 테마 대표 종목 (코드 → 이름, 큰 회사·대장주부터). 이름은 알아보기 쉽게 적은 거고 앱은 코드로 찾아요
  - etf: 이 낱말이 이름에 들어간 ETF도 전체 종목 목록(paper/symbols)에서 찾아 같이 보여 줘요
  - ind: 야후 업종(paper/sectors.json)이 이 정규식에 맞는 미장 종목도 뒤에 붙여요 (넓은 범위 종목만 업종이 있어요)
  - sector: 홈 '업종별 호재·악재'의 업종 이름. 그 업종의 5일 흐름·호재·악재를 같이 보여 줘요
테마 종목은 사람이 고른 참고 목록이에요. 매매 규칙·신호·가상계좌는 안 바꿔요.

dashboard.py가 배포 때 <out>/themes.json으로 써요.
    python themes.py   # 목록에 없는(상장폐지·코드 바뀐) 종목 확인
"""

import json
import pathlib
import re

# (테마 이름, 찾는 낱말들, 한 줄 설명, 업종, 국장 {코드: 이름}, 미장 {티커: 이름}, ETF 이름 정규식, 야후 업종 정규식)
THEMES = [
    dict(name="전력·전력기기", keys="전력 전력기기 전력설비 전력망 전력인프라 변압기 송전 배전 전선 케이블 전기설비 그리드 ai전력 전기 power grid",
         why="AI 데이터센터·전력망 교체로 변압기·전선·전력설비 수요가 늘어난 분야", sector="전력·유틸리티",
         kr={"267260": "HD현대일렉트릭", "298040": "효성중공업", "010120": "LS일렉트릭", "006260": "LS", "001440": "대한전선",
             "103590": "일진전기", "062040": "산일전기", "033100": "제룡전기", "000500": "가온전선", "006910": "보성파워텍",
             "189860": "서전기전", "017510": "세명전기", "229640": "LS전선아시아", "015760": "한국전력"},
         us={"GEV": "GE 버노바", "ETN": "이튼", "VRT": "버티브", "PWR": "콴타 서비스", "HUBB": "허벨", "VST": "비스트라",
             "CEG": "컨스텔레이션 에너지", "NRG": "NRG 에너지", "NEE": "넥스트에라", "SO": "서던", "DUK": "듀크 에너지", "AEP": "AEP"},
         etf=r"^(?!.*buffer).*(전력|electric power|electricity|power|grid|utilit|유틸)",
         ind=r"Electrical Equipment|Utilities - Regulated Electric|Independent Power"),
    dict(name="원전·SMR", keys="원전 원자력 smr 소형모듈원전 소형원전 핵발전 원자로 우라늄 nuclear",
         why="원전 수출·SMR(소형 원전)·AI 전력 수요로 주목받는 분야", sector="전력·유틸리티",
         kr={"034020": "두산에너빌리티", "052690": "한국전력기술", "051600": "한전KPS", "083650": "비에이치아이",
             "105840": "우진", "457550": "우진엔텍", "032820": "우리기술", "094820": "일진파워", "000720": "현대건설",
             "015760": "한국전력"},
         us={"CEG": "컨스텔레이션 에너지", "VST": "비스트라", "TLN": "탈렌 에너지", "OKLO": "오클로", "SMR": "뉴스케일",
             "CCJ": "카메코", "BWXT": "BWX 테크", "LEU": "센트러스", "NNE": "나노 뉴클리어"},
         etf=r"원자력|원전|nuclear|uranium|smr"),
    dict(name="AI반도체·HBM", keys="ai반도체 hbm 반도체 메모리 d램 디램 낸드 gpu ai칩 엔비디아관련 칩 semiconductor",
         why="AI 서버용 GPU·고대역폭 메모리(HBM)와 그 공급망", sector="반도체",
         kr={"000660": "SK하이닉스", "005930": "삼성전자", "042700": "한미반도체", "007660": "이수페타시스", "000990": "DB하이텍",
             "095340": "ISC", "058470": "리노공업", "089030": "테크윙", "403870": "HPSP", "402340": "SK스퀘어"},
         us={"NVDA": "엔비디아", "AVGO": "브로드컴", "TSM": "TSMC", "AMD": "AMD", "MU": "마이크론", "MRVL": "마벨",
             "ARM": "ARM", "QCOM": "퀄컴", "INTC": "인텔", "SMCI": "슈퍼마이크로"},
         etf=r"반도체|semicon|semiconductor|hbm|memory|chip", ind=r"Semiconductor"),
    dict(name="반도체 장비·소재", keys="반도체장비 장비주 반도체소재 소부장 소재부품장비 웨이퍼 식각 증착 노광",
         why="반도체 공장 투자가 늘면 같이 좋아지는 장비·소재 회사", sector="반도체",
         kr={"042700": "한미반도체", "240810": "원익IPS", "036930": "주성엔지니어링", "039030": "이오테크닉스",
             "140860": "파크시스템스", "084370": "유진테크", "357780": "솔브레인", "005290": "동진쎄미켐",
             "166090": "하나머티리얼즈", "222800": "심텍"},
         us={"ASML": "ASML", "AMAT": "어플라이드 머티리얼즈", "LRCX": "램 리서치", "KLAC": "KLA", "TER": "테라다인",
             "ENTG": "엔테그리스"},
         etf=r"반도체|semicon|semiconductor"),
    dict(name="2차전지", keys="2차전지 이차전지 배터리 양극재 음극재 전해질 분리막 리튬 전고체 ess battery lithium",
         why="전기차·ESS(전력 저장) 배터리와 소재", sector="2차전지",
         kr={"373220": "LG에너지솔루션", "006400": "삼성SDI", "051910": "LG화학", "003670": "포스코퓨처엠",
             "247540": "에코프로비엠", "086520": "에코프로", "066970": "엘앤에프", "450080": "에코프로머티",
             "005070": "코스모신소재", "020150": "롯데에너지머티리얼즈", "096770": "SK이노베이션", "121600": "나노신소재"},
         us={"TSLA": "테슬라", "ALB": "앨버말", "SQM": "SQM", "QS": "퀀텀스케이프", "ENPH": "엔페이즈"},
         etf=r"2차전지|이차전지|배터리|battery|lithium|리튬|secondary"),
    dict(name="자동차·전기차", keys="자동차 완성차 전기차 자율주행 차부품 자동차부품 ev 테슬라관련 car",
         why="완성차·부품·자율주행", sector="자동차",
         kr={"005380": "현대차", "000270": "기아", "012330": "현대모비스", "204320": "HL만도", "011210": "현대위아",
             "018880": "한온시스템", "307950": "현대오토에버"},
         us={"TSLA": "테슬라", "GM": "GM", "F": "포드", "RIVN": "리비안", "LCID": "루시드", "TM": "토요타", "UBER": "우버"},
         etf=r"자동차|전기차|자율주행|autonomous|electric vehicle|\bev\b|\bauto\b|automobile", ind=r"Auto"),
    dict(name="방산", keys="방산 방위산업 국방 무기 미사일 전차 k방산 defense",
         why="수출이 늘고 있는 무기·국방 회사", sector="조선·방산·기계",
         kr={"012450": "한화에어로스페이스", "079550": "LIG넥스원", "064350": "현대로템", "047810": "한국항공우주",
             "272210": "한화시스템", "103140": "풍산", "010820": "퍼스텍"},
         us={"LMT": "록히드 마틴", "RTX": "RTX", "NOC": "노스롭 그루먼", "GD": "제너럴 다이내믹스", "LHX": "L3해리스",
             "HII": "헌팅턴 잉갈스", "PLTR": "팔란티어"},
         etf=r"방산|방위|defense|aerospace", ind=r"Aerospace & Defense"),
    dict(name="조선", keys="조선 조선주 선박 lng선 해양플랜트 조선기자재 shipbuilding",
         why="LNG선·군함 발주로 일감이 쌓인 조선사와 기자재", sector="조선·방산·기계",
         kr={"329180": "HD현대중공업", "009540": "HD한국조선해양", "042660": "한화오션", "010140": "삼성중공업",
             "077970": "STX엔진", "082740": "HSD엔진", "017960": "한국카본",
             "014620": "성광벤드", "033500": "동성화인텍"},
         us={"HII": "헌팅턴 잉갈스", "GD": "제너럴 다이내믹스"},
         etf=r"조선|shipbuild"),
    dict(name="우주항공", keys="우주 우주항공 항공우주 위성 로켓 발사체 space satellite",
         why="위성·로켓·항공기", sector="조선·방산·기계",
         kr={"012450": "한화에어로스페이스", "047810": "한국항공우주", "272210": "한화시스템", "099320": "쎄트렉아이",
             "211270": "AP위성", "274090": "켄코아에어로스페이스"},
         us={"RKLB": "로켓랩", "ASTS": "AST 스페이스모바일", "BA": "보잉", "LUNR": "인튜이티브 머신스", "IRDM": "이리듐"},
         etf=r"우주|space|aerospace"),
    dict(name="로봇·휴머노이드", keys="로봇 휴머노이드 피지컬ai 협동로봇 산업용로봇 자동화 robot",
         why="휴머노이드·산업용 로봇과 공장 자동화", sector="",
         kr={"454910": "두산로보틱스", "277810": "레인보우로보틱스", "108490": "로보티즈", "090360": "로보스타",
             "056080": "유진로봇", "348340": "뉴로메카", "117730": "티로보틱스", "010120": "LS일렉트릭"},
         us={"TSLA": "테슬라", "ISRG": "인튜이티브 서지컬", "ROK": "로크웰", "SYM": "심보틱", "TER": "테라다인", "NVDA": "엔비디아"},
         etf=r"로봇|robot|automation"),
    dict(name="AI·소프트웨어", keys="ai 인공지능 챗gpt 생성형ai llm 소프트웨어 클라우드 sw software cloud",
         why="AI 서비스·클라우드·소프트웨어 회사", sector="인터넷·게임·SW",
         kr={"035420": "NAVER", "035720": "카카오", "018260": "삼성에스디에스", "307950": "현대오토에버",
             "304100": "솔트룩스", "042000": "카페24", "022100": "포스코DX"},
         us={"MSFT": "마이크로소프트", "GOOGL": "알파벳(구글)", "META": "메타", "AMZN": "아마존", "PLTR": "팔란티어",
             "ORCL": "오라클", "NOW": "서비스나우", "CRM": "세일즈포스", "SNOW": "스노우플레이크"},
         etf=r"인공지능|소프트웨어|software|cloud|클라우드|\bai\b", ind=r"Software"),
    dict(name="데이터센터", keys="데이터센터 idc 서버 냉각 액침냉각 datacenter",
         why="AI 서버를 넣는 건물과 전력·냉각 설비", sector="전력·유틸리티",
         kr={"000660": "SK하이닉스", "267260": "HD현대일렉트릭", "010120": "LS일렉트릭", "018260": "삼성에스디에스",
             "007660": "이수페타시스", "298040": "효성중공업"},
         us={"VRT": "버티브", "EQIX": "에퀴닉스", "DLR": "디지털 리얼티", "ANET": "아리스타", "SMCI": "슈퍼마이크로",
             "DELL": "델", "ETN": "이튼"},
         etf=r"데이터센터|data ?center"),
    dict(name="인터넷·게임", keys="게임 게임주 인터넷 플랫폼 포털 웹툰 game gaming",
         why="게임·인터넷 플랫폼", sector="인터넷·게임·SW",
         kr={"259960": "크래프톤", "036570": "엔씨소프트", "251270": "넷마블", "263750": "펄어비스", "293490": "카카오게임즈",
             "112040": "위메이드", "192080": "더블유게임즈", "035420": "NAVER", "035720": "카카오"},
         us={"RBLX": "로블록스", "TTWO": "테이크투", "NTES": "넷이즈", "META": "메타", "GOOGL": "알파벳(구글)"},
         etf=r"게임|game|gaming|internet|인터넷"),
    dict(name="바이오·제약", keys="바이오 제약 신약 바이오시밀러 adc 항암 헬스케어 bio pharma",
         why="신약·바이오시밀러·위탁생산", sector="바이오·헬스",
         kr={"207940": "삼성바이오로직스", "068270": "셀트리온", "196170": "알테오젠", "000100": "유한양행", "128940": "한미약품",
             "326030": "SK바이오팜", "028300": "HLB", "141080": "리가켐바이오", "298380": "에이비엘바이오", "145020": "휴젤"},
         us={"LLY": "일라이 릴리", "JNJ": "존슨앤드존슨", "ABBV": "애브비", "MRK": "머크", "NVO": "노보 노디스크",
             "AMGN": "암젠", "VRTX": "버텍스", "REGN": "리제네론", "GILD": "길리어드", "PFE": "화이자"},
         etf=r"바이오|헬스케어|bio|health|pharma", ind=r"Biotech|Drug"),
    dict(name="비만치료제", keys="비만 비만치료제 비만약 위고비 마운자로 glp1 obesity",
         why="GLP-1 계열 비만약과 관련 회사", sector="바이오·헬스",
         kr={"128940": "한미약품", "087010": "펩트론", "347850": "디앤디파마텍", "389470": "인벤티지랩", "000100": "유한양행"},
         us={"LLY": "일라이 릴리", "NVO": "노보 노디스크", "VKTX": "바이킹 테라퓨틱스", "AMGN": "암젠"},
         etf=r"비만|obesity|glp"),
    dict(name="미용·의료기기", keys="의료기기 미용기기 피부미용 보톡스 톡신 필러 medical device",
         why="미용 시술 기기·보톡스·수술 로봇", sector="바이오·헬스",
         kr={"214150": "클래시스", "145020": "휴젤", "214450": "파마리서치", "228670": "레이"},
         us={"ISRG": "인튜이티브 서지컬", "SYK": "스트라이커", "BSX": "보스턴 사이언티픽", "MDT": "메드트로닉", "ABT": "애보트"},
         etf=r"의료기기|medical", ind=r"Medical"),
    dict(name="화장품·K뷰티", keys="화장품 k뷰티 뷰티 코스메틱 cosmetic beauty",
         why="수출이 늘고 있는 화장품·뷰티 회사", sector="소비재·유통",
         kr={"278470": "에이피알", "090430": "아모레퍼시픽", "192820": "코스맥스", "161890": "한국콜마", "051900": "LG생활건강",
             "018290": "브이티", "237880": "클리오", "257720": "실리콘투"},
         us={"ELF": "e.l.f. 뷰티", "EL": "에스티 로더", "ULTA": "얼타 뷰티"},
         etf=r"화장품|뷰티|beauty|cosmetic"),
    dict(name="엔터·K팝·콘텐츠", keys="엔터 엔터주 k팝 케이팝 아이돌 드라마 콘텐츠 미디어 kpop entertainment",
         why="K팝 기획사·드라마·OTT", sector="통신·미디어",
         kr={"352820": "하이브", "041510": "에스엠", "035900": "JYP Ent.", "122870": "와이지엔터테인먼트",
             "035760": "CJ ENM", "253450": "스튜디오드래곤"},
         us={"NFLX": "넷플릭스", "SPOT": "스포티파이", "DIS": "디즈니", "WBD": "워너 브라더스"},
         etf=r"엔터|미디어|컨텐츠|콘텐츠|media|entertain"),
    dict(name="음식료·K푸드", keys="음식료 식품 k푸드 라면 과자 음료 food",
         why="라면·과자 수출 등 식품 회사", sector="소비재·유통",
         kr={"003230": "삼양식품", "097950": "CJ제일제당", "271560": "오리온", "004370": "농심", "007310": "오뚜기",
             "280360": "롯데웰푸드"},
         us={"KO": "코카콜라", "PEP": "펩시코", "MDLZ": "몬델리즈", "HSY": "허쉬"},
         etf=r"음식료|식품|food|consumer staples|필수소비"),
    dict(name="유통·이커머스", keys="유통 이커머스 온라인쇼핑 쇼핑 백화점 편의점 마트 retail",
         why="쇼핑몰·백화점·편의점", sector="소비재·유통",
         kr={"139480": "이마트", "023530": "롯데쇼핑", "282330": "BGF리테일", "007070": "GS리테일", "069960": "현대백화점"},
         us={"AMZN": "아마존", "WMT": "월마트", "COST": "코스트코", "CPNG": "쿠팡"},
         etf=r"유통|소비재|retail|consumer"),
    dict(name="여행·항공·카지노", keys="여행 관광 항공 항공사 카지노 면세 호텔 리오프닝 travel airline casino",
         why="여행객이 늘면 좋아지는 항공·호텔·카지노·면세점", sector="운송",
         kr={"003490": "대한항공", "272450": "진에어", "089590": "제주항공", "008770": "호텔신라", "034230": "파라다이스",
             "114090": "GKL", "039130": "하나투어"},
         us={"BKNG": "부킹", "ABNB": "에어비앤비", "MAR": "메리어트", "DAL": "델타항공", "UAL": "유나이티드항공",
             "LVS": "라스베이거스 샌즈", "RCL": "로열 캐리비안"},
         etf=r"여행|항공|travel|airline|leisure", ind=r"Airline|Travel|Casino|Lodging|Resort"),
    dict(name="해운·물류", keys="해운 해운주 컨테이너선 벌크선 운임 물류 택배 shipping logistics",
         why="배 운임·물동량에 따라 움직이는 회사", sector="운송",
         kr={"011200": "HMM", "028670": "팬오션", "000120": "CJ대한통운", "086280": "현대글로비스"},
         us={"ZIM": "짐", "FDX": "페덱스", "UPS": "UPS"},
         etf=r"해운|운송|물류|shipping|transport", ind=r"Marine|Freight|Logistics"),
    dict(name="은행·금융지주", keys="은행 은행주 금융 금융주 금융지주 밸류업 bank",
         why="금리·주주환원(밸류업)에 따라 움직이는 은행", sector="금융",
         kr={"105560": "KB금융", "055550": "신한지주", "086790": "하나금융지주", "316140": "우리금융지주",
             "138040": "메리츠금융지주", "024110": "기업은행", "323410": "카카오뱅크"},
         us={"JPM": "JP모건", "BAC": "뱅크오브아메리카", "WFC": "웰스파고", "C": "씨티그룹"},
         etf=r"은행|금융|bank|financial", ind=r"Bank"),
    dict(name="증권", keys="증권 증권주 증권사 브로커리지 broker",
         why="거래가 늘면 좋아지는 증권사", sector="금융",
         kr={"006800": "미래에셋증권", "016360": "삼성증권", "039490": "키움증권", "005940": "NH투자증권",
             "071050": "한국금융지주"},
         us={"GS": "골드만삭스", "MS": "모건스탠리", "SCHW": "찰스 슈왑", "HOOD": "로빈후드", "IBKR": "인터랙티브 브로커스"},
         etf=r"증권|broker", ind=r"Capital Markets"),
    dict(name="보험", keys="보험 보험주 생명보험 손해보험 insurance",
         why="금리가 높을 때 유리한 보험사", sector="금융",
         kr={"032830": "삼성생명", "000810": "삼성화재", "005830": "DB손해보험", "001450": "현대해상", "088350": "한화생명"},
         us={"BRK-B": "버크셔 해서웨이", "PGR": "프로그레시브", "CB": "처브", "AIG": "AIG", "MET": "메트라이프"},
         etf=r"보험|insurance", ind=r"Insurance"),
    dict(name="고배당", keys="배당 배당주 고배당 배당금 월배당 dividend",
         why="배당을 꾸준히 많이 주는 회사", sector="",
         kr={"105560": "KB금융", "055550": "신한지주", "086790": "하나금융지주", "316140": "우리금융지주", "024110": "기업은행",
             "033780": "KT&G", "017670": "SK텔레콤", "030200": "KT"},
         us={"KO": "코카콜라", "PEP": "펩시코", "JNJ": "존슨앤드존슨", "PG": "P&G", "VZ": "버라이즌", "MO": "알트리아",
             "ABBV": "애브비", "O": "리얼티 인컴"},
         etf=r"배당|dividend|schd|커버드콜|covered call"),
    dict(name="통신", keys="통신 통신주 통신사 5g 6g telecom",
         why="꾸준한 요금 수입과 배당", sector="통신·미디어",
         kr={"017670": "SK텔레콤", "030200": "KT", "032640": "LG유플러스"},
         us={"TMUS": "T모바일", "VZ": "버라이즌", "T": "AT&T"},
         etf=r"통신|telecom|communication", ind=r"Telecom"),
    dict(name="건설·부동산", keys="건설 건설주 부동산 리츠 재건축 주택 인프라 reit construction",
         why="주택·해외 공사·인프라", sector="건설·부동산",
         kr={"000720": "현대건설", "028260": "삼성물산", "006360": "GS건설", "047040": "대우건설", "375500": "DL이앤씨",
             "294870": "HDC현대산업개발"},
         us={"DHI": "D.R. 호튼", "LEN": "레나", "PHM": "펄트그룹", "O": "리얼티 인컴", "PLD": "프로로지스"},
         etf=r"건설|부동산|리츠|reit|real estate|homebuild", ind=r"Residential Construction|REIT"),
    dict(name="철강·비철금속", keys="철강 철강주 비철 비철금속 구리 아연 금속 steel copper",
         why="철강·구리·아연 값에 따라 움직이는 회사", sector="화학·소재",
         kr={"005490": "POSCO홀딩스", "004020": "현대제철", "010130": "고려아연", "103140": "풍산"},
         us={"NUE": "뉴코어", "STLD": "스틸 다이내믹스", "FCX": "프리포트 맥모란", "SCCO": "서던 코퍼"},
         etf=r"철강|구리|비철|steel|copper|metal", ind=r"Steel|Copper|Metal"),
    dict(name="정유·화학·에너지", keys="정유 석유 석유화학 화학 유가 원유 가스 lng 에너지 oil",
         why="유가·화학 제품 값에 따라 움직이는 회사", sector="에너지·정유",
         kr={"096770": "SK이노베이션", "010950": "S-Oil", "011170": "롯데케미칼", "051910": "LG화학", "078930": "GS",
             "036460": "한국가스공사"},
         us={"XOM": "엑슨모빌", "CVX": "셰브론", "COP": "코노코필립스", "OXY": "옥시덴탈", "SLB": "슐럼버거"},
         etf=r"정유|원유|석유|oil|crude|natural gas|energy select|energy sector", ind=r"Oil|Gas|Refining"),
    dict(name="수소·연료전지", keys="수소 연료전지 수소차 hydrogen",
         why="수소 연료전지·수소 설비", sector="",
         kr={"336260": "두산퓨얼셀", "382900": "범한퓨얼셀", "271940": "일진하이솔루스", "298040": "효성중공업", "005380": "현대차"},
         us={"PLUG": "플러그 파워", "BE": "블룸 에너지", "BLDP": "발라드 파워", "FCEL": "퓨얼셀 에너지"},
         etf=r"수소|hydrogen|fuel cell"),
    dict(name="태양광·풍력", keys="태양광 풍력 신재생 재생에너지 친환경 해상풍력 클린에너지 solar wind",
         why="태양광·풍력 발전 설비", sector="전력·유틸리티",
         kr={"009830": "한화솔루션", "112610": "씨에스윈드", "100090": "SK오션플랜트", "322000": "HD현대에너지솔루션"},
         us={"FSLR": "퍼스트 솔라", "NEE": "넥스트에라", "ENPH": "엔페이즈", "SEDG": "솔라엣지", "RUN": "선런"},
         etf=r"태양광|풍력|신재생|solar|wind|clean energy|renewable", ind=r"Solar|Renewable"),
    dict(name="양자컴퓨터", keys="양자 양자컴퓨터 양자컴 양자암호 quantum",
         why="양자컴퓨터 개발 회사 (대부분 적자인 초기 회사라 변동이 커요)", sector="",
         kr={},
         us={"IONQ": "아이온큐", "RGTI": "리게티", "QBTS": "디웨이브", "IBM": "IBM", "GOOGL": "알파벳(구글)", "HON": "하니웰"},
         etf=r"양자|quantum"),
    dict(name="사이버보안", keys="보안 사이버보안 해킹 정보보안 security cybersecurity",
         why="해킹을 막는 보안 소프트웨어", sector="인터넷·게임·SW",
         kr={"053800": "안랩", "263860": "지니언스", "136540": "윈스"},
         us={"CRWD": "크라우드스트라이크", "PANW": "팔로알토", "FTNT": "포티넷", "ZS": "지스케일러", "NET": "클라우드플레어"},
         etf=r"보안|security|cyber"),
    dict(name="가상자산·비트코인", keys="비트코인 가상자산 암호화폐 코인 블록체인 스테이블코인 이더리움 bitcoin crypto",
         why="비트코인 값에 따라 움직이는 회사 (변동이 아주 커요)", sector="",
         kr={},
         us={"COIN": "코인베이스", "MSTR": "스트래티지", "HOOD": "로빈후드", "MARA": "마라", "RIOT": "라이엇"},
         etf=r"비트코인|bitcoin|crypto|ether|blockchain|블록체인"),
    dict(name="금·귀금속", keys="금값 금 금광 금투자 귀금속 은값 gold silver",
         why="금·은 값을 따라가는 회사와 ETF", sector="화학·소재",
         kr={"010130": "고려아연"},
         us={"NEM": "뉴몬트", "AEM": "애그니코 이글", "WPM": "휘튼 프레셔스"},
         etf=r"골드|금현물|금선물|금은|krx금|gold|silver|precious"),
]

# 테마 낱말이 아닌, 문장에 흔히 붙는 말 (앱이 이걸 빼고 남은 말로 종목 이름도 찾아요)
FILLER = ("관련분야 관련주 관련 분야 종목들 종목 주식 수혜주 대장주 테마주 테마 섹터 업종 산업 찾아줘 찾아 줘 알려줘 알려 보여줘 "
          "추천해줘 추천 뭐있어 뭐 있어 어떤거 어떤 있나 있어 좀 들 은 는 이 가 을 를 의 에 와 과 랑 이랑 하고 및 기업 회사 "
          "국장 국내 한국 미장 미국 해외 코스피 코스닥 주 주들")


def build(symbols_dir=pathlib.Path("paper/symbols"), sectors_path=pathlib.Path("paper/sectors.json")):
    """앱이 읽는 themes.json 내용. 목록 파일이 있으면 거기 없는 코드는 빼요 (상장폐지·코드 변경).
    more_us: 고른 종목 말고 야후 업종이 ind에 맞는 미장 넓은 범위 종목 (코드만, 앱이 이름을 찾아요)."""
    try:
        smap = json.loads(pathlib.Path(sectors_path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        smap = {}
    known = {}
    for m in ("kr", "us"):
        try:
            known[m] = {r[0] for r in json.loads((symbols_dir / f"{m}.json").read_text(encoding="utf-8"))["rows"]}
        except (OSError, ValueError, KeyError):
            known[m] = None
    themes = []
    for t in THEMES:
        row = dict(name=t["name"], keys=t["keys"].split(), why=t["why"], sector=t.get("sector", ""),
                   etf=t.get("etf", ""), ind=t.get("ind", ""))
        for m in ("kr", "us"):
            row[m] = [[c, n] for c, n in t[m].items() if known[m] is None or c in known[m]]
        # 국장은 야후 업종이 어긋나는 게 많아서 (배터리가 '전기장비', 조선이 '방산') 미장만 붙여요
        row["more_us"] = [c for c, (_, ind) in sorted((smap.get("us") or {}).items())
                          if row["ind"] and ind and re.search(row["ind"], ind) and c not in t["us"]]
        themes.append(row)
    return dict(themes=themes, filler=FILLER.split())


def missing(symbols_dir=pathlib.Path("paper/symbols")):
    """전체 종목 목록에 없는 테마 종목 [(테마, 시장, 코드, 이름)]."""
    out = []
    for m in ("kr", "us"):
        rows = json.loads((symbols_dir / f"{m}.json").read_text(encoding="utf-8"))["rows"]
        codes = {r[0] for r in rows}
        for t in THEMES:
            out += [(t["name"], m, c, n) for c, n in t[m].items() if c not in codes]
    return out


if __name__ == "__main__":
    miss = missing()
    for row in miss:
        print("목록에 없음:", *row)
    print(f"테마 {len(THEMES)}개, 목록에 없는 종목 {len(miss)}개")
