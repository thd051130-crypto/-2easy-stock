#!/usr/bin/env python3
"""산업 연관 지도: 테마 44개(themes.py)를 산업 점으로, 서로 이어진 산업을 선으로 묶어요. 앱 '산업 지도' 화면이 읽어요.

전부 무료예요 (유료 AI·유료 API 안 씀).
  - 선(LINKS): 사람이 정리한 연결. 앞 산업이 뒤 산업에 물건을 대거나(공급망), 뒤 산업이 커지면 앞 산업이 필요해지는
    관계예요. '같은 요인'은 금리·유가·한류처럼 같은 바람을 타는 산업, '반대'는 한쪽이 좋으면 다른 쪽엔 부담인 관계.
  - 주가 동행: 산업마다 대표 종목(국장·미장 각각 앞 5개)의 하루 등락률 평균으로 산업 주가를 만들고,
    최근 120거래일 동안 두 산업이 같이 움직인 정도(상관계수, -1~1)를 선마다 붙여요.
    사람이 안 이은 산업 중에 유난히 같이 움직인 쌍(0.6 이상이면서 그 시장 상위 5%)은 '주가로 찾은 연결'로 따로 보여 줘요.
  - 흐름: 산업 대표 종목의 5·20거래일 등락률 중간값과 종목별 5·20일 등락률.
  - 산업 크기: 산업에 묶인 종목 전부(대표 5개만이 아니라)의 시가총액 합. 지도 점 크기를 이걸로 달리 그려요.
    한 종목이 여러 산업에 들어가면(삼성전자: AI반도체·스마트폰…) 산업마다 다 더해요. 국장은 원, 미장은 달러.
연결은 참고용이에요.

dashboard.py가 배포 때 주가 없이 <out>/industry.json(점·선)을 쓰고, pages 워크플로가 이어서
`python industry_map.py --out _site`로 야후 시세를 받아 흐름·주가 동행을 채워요. 못 받아도 지도는 떠요.
"""

import argparse
import datetime as dt
import json
import pathlib

import themes

KST = dt.timezone(dt.timedelta(hours=9))
PER_THEME = 5     # 산업 하나에 시세를 받는 대표 종목 수 (시장마다)
CORR_DAYS = 120   # 주가 동행을 재는 기간 (거래일)
HIDDEN_MIN = 0.6  # 사람이 안 이은 쌍을 '주가로 찾은 연결'로 보여 주는 상관계수 (최소)
HIDDEN_TOP = 0.95  # 국장은 다 같이 오르내려서 상관이 높게 나와요. 그래서 그 시장 전체 쌍 중 상위 5% 안이어야 해요
HIDDEN_PER = 2    # 산업 하나에 붙이는 '주가로 찾은 연결' 최대 수

# 묶음: 지도에서 같은 색·가까운 자리
GROUPS = [
    ("tech", "반도체·IT", ["AI반도체·HBM", "반도체 장비·소재", "AI·소프트웨어", "데이터센터", "인터넷·게임", "양자컴퓨터",
                           "사이버보안", "광통신·네트워크", "PCB·유리기판", "스마트폰·IT부품", "미국 빅테크", "광고·애드테크"]),
    ("energy", "전력·에너지", ["전력·전력기기", "원전·SMR", "태양광·풍력", "2차전지", "수소·연료전지", "정유·화학·에너지",
                            "환경·물·폐기물"]),
    ("industry", "산업재·운송", ["자동차·전기차", "로봇·휴머노이드", "조선", "방산", "우주항공", "해운·물류", "철강·비철금속",
                               "건설·부동산", "희토류·핵심광물", "드론·UAM", "건설기계·철도", "농업·비료"]),
    ("consumer", "소비·헬스", ["바이오·제약", "비만치료제", "미용·의료기기", "화장품·K뷰티", "엔터·K팝·콘텐츠", "음식료·K푸드",
                             "유통·이커머스", "여행·항공·카지노", "통신",
                             "디지털헬스·의료AI", "필수소비·담배·주류", "의류·패션", "교육"]),
    ("finance", "금융·자산", ["은행·금융지주", "증권", "보험", "고배당", "가상자산·비트코인", "금·귀금속",
                            "지주사·밸류업", "핀테크·결제", "리츠·인프라펀드"]),
]

# 지도 점에 쓰는 짧은 이름 (폰 화면이 좁아서). 없으면 테마 이름 그대로
SHORT = {"AI반도체·HBM": "AI반도체", "반도체 장비·소재": "반도체 장비", "AI·소프트웨어": "AI·SW", "전력·전력기기": "전력기기",
         "수소·연료전지": "수소", "정유·화학·에너지": "정유·화학", "자동차·전기차": "자동차", "로봇·휴머노이드": "로봇",
         "철강·비철금속": "철강·금속", "건설·부동산": "건설", "바이오·제약": "바이오", "미용·의료기기": "의료기기",
         "화장품·K뷰티": "화장품", "엔터·K팝·콘텐츠": "엔터·K팝", "음식료·K푸드": "K푸드", "유통·이커머스": "유통",
         "여행·항공·카지노": "여행·항공", "은행·금융지주": "은행", "가상자산·비트코인": "비트코인", "금·귀금속": "금",
         "광통신·네트워크": "광통신", "PCB·유리기판": "PCB·기판", "스마트폰·IT부품": "스마트폰", "희토류·핵심광물": "희토류",
         "지주사·밸류업": "지주사", "핀테크·결제": "핀테크", "디지털헬스·의료AI": "의료AI",
         "미국 빅테크": "빅테크", "리츠·인프라펀드": "리츠", "건설기계·철도": "건설기계", "필수소비·담배·주류": "필수소비",
         "환경·물·폐기물": "환경", "농업·비료": "농업", "의류·패션": "의류", "광고·애드테크": "광고"}

# 큰 틀(주요 산업)에서 벗어난 세부 테마: 지도에서 점을 작게, 글자를 흐리게 그려요. 누르면 똑같이 연결을 보여 줘요
MINOR = {"광통신·네트워크", "PCB·유리기판", "스마트폰·IT부품", "희토류·핵심광물", "드론·UAM", "지주사·밸류업", "핀테크·결제",
         "디지털헬스·의료AI", "농업·비료", "의류·패션", "광고·애드테크", "교육"}
# 2026-10 세부 테마 47개는 검색에만 있어요 (지도에 다 넣으면 점 100개라 폰 화면에서 글자가 겹치고 너무 작아져요)
SEARCH_ONLY = {"디스플레이·OLED", "팹리스·파운드리", "전력반도체", "반도체 후공정", "MLCC·전자부품", "XR·메타버스", "물리보안·CCTV",
               "생체인식·인증", "가스터빈·발전기", "유전·가스전 개발", "ESS", "전기차 충전", "폐배터리·재활용", "초전도체", "핵융합",
               "도시가스·난방", "자율주행·전장", "스마트팩토리·3D프린터", "시멘트·건자재", "제지·포장", "타이어", "탄소섬유·첨단소재",
               "남북경협", "반려동물", "저출산·육아", "미세먼지·공기청정", "폭염·냉방", "축산·육계", "수산·김", "건강기능식품",
               "외식·프랜차이즈", "가구·인테리어", "골프·레저", "스포츠베팅·카지노(미국)", "대마초(미국)", "치매·알츠하이머",
               "감염병·백신·진단", "줄기세포·유전자치료", "마이크로바이옴", "치과·임플란트", "임상시험 대행(CRO)", "고령화·실버",
               "미국 건강보험·병원", "카드·캐피탈", "창투사·사모펀드", "토큰증권(STO)·조각투자", "지역화폐·상품권"}

# 연결 종류: s 공급망·수요 (앞 → 뒤: 앞 산업이 뒤 산업에 들어가요), c 같은 요인, n 반대
KINDS = {"s": "공급망·수요", "c": "같은 요인", "n": "반대"}

# (앞 산업, 뒤 산업, 종류, 한 줄 설명)
LINKS = [
    # 반도체·AI
    ("반도체 장비·소재", "AI반도체·HBM", "s", "HBM·첨단 공정 공장을 늘릴 때 장비·소재가 들어가요"),
    ("정유·화학·에너지", "반도체 장비·소재", "s", "특수가스·감광액 같은 반도체 소재를 화학 회사가 만들어요"),
    ("AI반도체·HBM", "데이터센터", "s", "AI 서버에 GPU·HBM이 들어가요"),
    ("데이터센터", "AI·소프트웨어", "s", "AI·클라우드 서비스가 데이터센터 연산을 빌려 써요"),
    ("AI반도체·HBM", "AI·소프트웨어", "s", "AI 서비스가 커질수록 AI 칩 주문이 늘어요"),
    ("AI반도체·HBM", "로봇·휴머노이드", "s", "로봇 두뇌에 AI 칩이 들어가요"),
    ("AI반도체·HBM", "자동차·전기차", "s", "자율주행·전장 부품에 반도체가 들어가요"),
    ("AI·소프트웨어", "로봇·휴머노이드", "s", "피지컬 AI(로봇을 움직이는 AI)"),
    ("AI·소프트웨어", "인터넷·게임", "s", "검색·광고·게임에 AI를 붙여요"),
    ("AI·소프트웨어", "사이버보안", "c", "클라우드·AI를 많이 쓸수록 보안도 같이 필요해요"),
    ("양자컴퓨터", "AI·소프트웨어", "c", "차세대 연산 기술이라 같은 기술주 자금이 몰려요"),
    ("양자컴퓨터", "사이버보안", "s", "양자컴퓨터 시대엔 양자암호가 필요해요"),
    # 전력·에너지
    ("전력·전력기기", "데이터센터", "s", "데이터센터가 늘수록 변압기·전선·전기가 더 필요해요"),
    ("원전·SMR", "데이터센터", "s", "빅테크가 AI 데이터센터 전기를 원전·SMR로 대려는 계약을 맺어요"),
    ("원전·SMR", "전력·전력기기", "s", "원전이 만든 전기를 송전망·변압기로 보내요"),
    ("태양광·풍력", "전력·전력기기", "s", "재생에너지가 늘면 전력망 연결 설비가 필요해요"),
    ("2차전지", "태양광·풍력", "s", "ESS(전기 저장 배터리)가 재생에너지와 짝이에요"),
    ("2차전지", "자동차·전기차", "s", "전기차에 배터리가 들어가요"),
    ("수소·연료전지", "자동차·전기차", "s", "수소차에 연료전지가 들어가요"),
    ("수소·연료전지", "데이터센터", "s", "연료전지 발전기로 데이터센터 전기를 대요"),
    ("정유·화학·에너지", "수소·연료전지", "s", "수소는 주로 가스·석유화학 공정에서 만들어요"),
    ("정유·화학·에너지", "2차전지", "s", "양극재·전해질 같은 배터리 소재를 화학 회사가 만들어요"),
    # 소재·산업재
    ("철강·비철금속", "2차전지", "s", "리튬·니켈 같은 금속 값이 배터리 원가예요"),
    ("철강·비철금속", "전력·전력기기", "s", "전선에 구리가, 변압기에 전기강판이 들어가요"),
    ("철강·비철금속", "조선", "s", "배를 만드는 두꺼운 철판(후판)"),
    ("철강·비철금속", "자동차·전기차", "s", "차체 강판"),
    ("철강·비철금속", "건설·부동산", "s", "철근·형강"),
    ("철강·비철금속", "태양광·풍력", "s", "해상풍력 하부 구조물이 철강이에요"),
    ("정유·화학·에너지", "조선", "s", "가스·유가가 오르면 LNG선·해양플랜트 주문이 늘어요"),
    ("조선", "해운·물류", "s", "해운사가 배를 주문해요"),
    ("조선", "방산", "s", "군함·잠수함을 조선소가 만들어요"),
    ("방산", "우주항공", "c", "미사일·위성·전투기 기술이 겹쳐요"),
    ("우주항공", "통신", "s", "저궤도 위성으로 통신을 해요"),
    ("로봇·휴머노이드", "자동차·전기차", "s", "차 공장 자동화와 자율주행 기술이 겹쳐요"),
    ("자동차·전기차", "해운·물류", "s", "자동차 운반선으로 수출해요"),
    ("건설·부동산", "원전·SMR", "s", "원전을 짓는 건설사가 수주해요"),
    ("건설·부동산", "데이터센터", "s", "데이터센터 건물을 지어요"),
    ("통신", "데이터센터", "s", "통신사가 데이터센터(IDC)를 운영해요"),
    ("정유·화학·에너지", "해운·물류", "c", "유가가 배 연료비라 운임과 같이 움직여요"),
    ("정유·화학·에너지", "여행·항공·카지노", "n", "유가가 오르면 항공사 연료비 부담이 커져요"),
    # 소비·헬스
    ("바이오·제약", "비만치료제", "s", "비만약도 제약사 신약이에요"),
    ("바이오·제약", "미용·의료기기", "c", "같은 헬스케어 자금이 움직여요"),
    ("미용·의료기기", "화장품·K뷰티", "c", "피부미용 시술과 화장품을 같이 찾아요"),
    ("엔터·K팝·콘텐츠", "화장품·K뷰티", "c", "한류가 커지면 K뷰티 수출도 같이 늘어요"),
    ("엔터·K팝·콘텐츠", "음식료·K푸드", "c", "한류 콘텐츠가 라면·과자 수출을 끌어요"),
    ("엔터·K팝·콘텐츠", "여행·항공·카지노", "s", "공연·드라마 보고 관광객이 와요"),
    ("인터넷·게임", "엔터·K팝·콘텐츠", "s", "웹툰·플랫폼·게임 IP가 드라마·공연으로 이어져요"),
    ("화장품·K뷰티", "유통·이커머스", "s", "면세점·온라인몰에서 팔아요"),
    ("화장품·K뷰티", "여행·항공·카지노", "c", "중국 관광객이 오면 면세점 화장품이 팔려요"),
    ("음식료·K푸드", "유통·이커머스", "s", "마트·편의점·온라인몰에서 팔아요"),
    ("해운·물류", "유통·이커머스", "s", "택배·물류가 온라인 쇼핑을 받쳐요"),
    ("비만치료제", "음식료·K푸드", "n", "비만약을 많이 쓰면 음식 소비가 줄 수 있어요"),
    # 금융·자산
    ("은행·금융지주", "증권", "c", "금리·밸류업(주주환원) 정책에 같이 움직여요"),
    ("은행·금융지주", "보험", "c", "금리가 오르면 둘 다 이자 수익이 늘어요"),
    ("은행·금융지주", "고배당", "c", "배당을 많이 주는 대표 업종이에요"),
    ("보험", "고배당", "c", "배당을 많이 주는 업종이에요"),
    ("통신", "고배당", "c", "꾸준히 배당하는 업종이에요"),
    ("은행·금융지주", "건설·부동산", "c", "금리가 내리면 대출·집값이 같이 움직여요"),
    ("가상자산·비트코인", "증권", "c", "거래가 활발해지면 거래 수수료가 늘어요"),
    ("가상자산·비트코인", "데이터센터", "s", "비트코인 채굴 회사들이 AI 데이터센터로 바꾸는 중이에요"),
    ("금·귀금속", "가상자산·비트코인", "c", "달러 대신 갖는 대체 자산으로 같이 묶여요"),
    ("금·귀금속", "철강·비철금속", "c", "광산·금속 값이 같이 움직여요"),
    # 2026-10 추가 산업
    ("광통신·네트워크", "데이터센터", "s", "AI 서버끼리 빛으로 데이터를 주고받는 광모듈·광케이블이 들어가요"),
    ("광통신·네트워크", "AI반도체·HBM", "c", "엔비디아 AI 서버 투자에 같이 움직이고, 칩 옆에 광부품을 붙이는(CPO) 기술이 나와요"),
    ("광통신·네트워크", "통신", "s", "통신망에 광케이블·중계 장비가 들어가요"),
    ("PCB·유리기판", "AI반도체·HBM", "s", "AI 칩·서버에 층이 많은 고급 기판이 들어가요"),
    ("PCB·유리기판", "스마트폰·IT부품", "s", "스마트폰 안에 회로기판이 들어가요"),
    ("반도체 장비·소재", "PCB·유리기판", "c", "유리기판은 차세대 반도체 패키징 소재라 같이 묶여요"),
    ("AI반도체·HBM", "스마트폰·IT부품", "s", "스마트폰에 AP·메모리 칩이 들어가요"),
    ("AI·소프트웨어", "스마트폰·IT부품", "s", "온디바이스 AI(폰 안에서 도는 AI)가 폰 교체 수요를 만들어요"),
    ("스마트폰·IT부품", "자동차·전기차", "c", "카메라 모듈·전장 부품을 같은 회사가 만들어요"),
    ("희토류·핵심광물", "자동차·전기차", "s", "전기차 모터 영구자석에 희토류가 들어가요"),
    ("희토류·핵심광물", "로봇·휴머노이드", "s", "로봇 관절 모터에도 희토류 자석이 들어가요"),
    ("희토류·핵심광물", "방산", "s", "미사일·전투기 부품에 희토류가 필요해요"),
    ("희토류·핵심광물", "태양광·풍력", "s", "풍력 발전기 자석에 희토류가 들어가요"),
    ("희토류·핵심광물", "철강·비철금속", "c", "중국 수출 통제·광물 값에 같이 움직여요"),
    ("드론·UAM", "방산", "s", "전쟁에서 드론이 무기로 쓰이면서 군 주문이 늘었어요"),
    ("드론·UAM", "우주항공", "c", "비행체·항공 기술이 겹쳐요"),
    ("2차전지", "드론·UAM", "s", "드론·에어택시는 배터리로 날아요"),
    ("지주사·밸류업", "증권", "c", "상법 개정·밸류업 정책에 같이 움직여요"),
    ("지주사·밸류업", "은행·금융지주", "c", "PBR이 낮고 주주환원을 늘리는 대표 업종으로 묶여요"),
    ("지주사·밸류업", "고배당", "c", "자사주 소각·배당을 늘리는 회사가 많아요"),
    ("핀테크·결제", "가상자산·비트코인", "c", "스테이블코인 결제를 핀테크 회사가 준비해요"),
    ("핀테크·결제", "은행·금융지주", "n", "간편결제·인터넷은행이 은행 손님과 수수료를 가져가요"),
    ("핀테크·결제", "유통·이커머스", "s", "온라인 쇼핑 결제를 처리해요"),
    ("AI·소프트웨어", "디지털헬스·의료AI", "s", "AI가 엑스레이·CT를 읽어 의사를 도와요"),
    ("디지털헬스·의료AI", "바이오·제약", "c", "같은 헬스케어 자금이 움직여요"),
    ("디지털헬스·의료AI", "미용·의료기기", "c", "병원 장비·소프트웨어로 같이 팔려요"),
    # 2026-10 추가 테마 (빅테크·리츠·건설기계·필수소비·환경·농업·의류·광고·교육)
    ("AI반도체·HBM", "미국 빅테크", "s", "빅테크가 AI 칩을 가장 많이 사요"),
    ("데이터센터", "미국 빅테크", "s", "빅테크가 AI 데이터센터를 가장 많이 지어요"),
    ("미국 빅테크", "AI·소프트웨어", "c", "AI·클라우드 서비스를 이끄는 회사들이라 같이 움직여요"),
    ("스마트폰·IT부품", "미국 빅테크", "s", "아이폰에 부품이 들어가요"),
    ("미국 빅테크", "광고·애드테크", "c", "구글·메타는 매출 대부분이 광고예요"),
    ("리츠·인프라펀드", "고배당", "c", "번 돈 대부분을 배당으로 나눠 줘요"),
    ("리츠·인프라펀드", "건설·부동산", "c", "금리가 내리면 부동산 값이 같이 올라요"),
    ("리츠·인프라펀드", "데이터센터", "c", "에퀴닉스 같은 데이터센터 리츠가 있어요"),
    ("철강·비철금속", "건설기계·철도", "s", "굴착기·열차를 철강으로 만들어요"),
    ("건설기계·철도", "건설·부동산", "s", "건설 현장에 굴착기가 들어가요"),
    ("건설기계·철도", "방산", "c", "현대로템이 전차와 열차를 같이 만들어요"),
    ("건설기계·철도", "농업·비료", "s", "디어 같은 회사가 농기계도 만들어요"),
    ("건설기계·철도", "데이터센터", "s", "캐터필러·커민스 발전기가 데이터센터 비상 전기를 대요"),
    ("필수소비·담배·주류", "고배당", "c", "경기가 나빠도 꾸준히 팔려서 배당을 많이 줘요"),
    ("필수소비·담배·주류", "음식료·K푸드", "c", "먹고 마시는 건 경기와 상관없이 사요"),
    ("필수소비·담배·주류", "유통·이커머스", "s", "마트·편의점에서 팔아요"),
    ("농업·비료", "필수소비·담배·주류", "s", "보리·곡물이 술·음료 원료예요"),
    ("농업·비료", "음식료·K푸드", "s", "밀·옥수수 같은 곡물이 식품 원료예요"),
    ("정유·화학·에너지", "농업·비료", "s", "비료를 천연가스로 만들어요"),
    ("환경·물·폐기물", "데이터센터", "s", "데이터센터 냉각에 물과 수처리 설비가 들어가요"),
    ("건설·부동산", "환경·물·폐기물", "s", "공사장 폐기물을 처리 회사가 받아요"),
    ("환경·물·폐기물", "고배당", "c", "요금처럼 꾸준히 버는 경기방어 업종이에요"),
    ("의류·패션", "유통·이커머스", "s", "백화점·온라인몰에서 팔아요"),
    ("엔터·K팝·콘텐츠", "의류·패션", "c", "아이돌이 입으면 K패션도 같이 팔려요"),
    ("의류·패션", "화장품·K뷰티", "c", "소비 심리·중국 수요에 같이 움직여요"),
    ("광고·애드테크", "인터넷·게임", "s", "앱·게임 회사가 손님을 모으려고 광고를 사요"),
    ("광고·애드테크", "AI·소프트웨어", "c", "AI로 광고를 사람마다 맞춰 보여 줘요"),
    ("광고·애드테크", "유통·이커머스", "s", "쇼핑몰이 광고를 많이 해요"),
    ("AI·소프트웨어", "교육", "s", "AI 튜터·온라인 강의에 AI가 들어가요"),
    ("교육", "인터넷·게임", "c", "인터넷 강의·외국어 앱도 온라인 플랫폼이라 같이 묶여요"),
]


def static_map():
    """점(산업)과 사람이 정리한 선. 주가 없이도 지도는 이걸로 그려요."""
    by_name = {t["name"]: t for t in themes.THEMES}
    nodes = []
    for gid, gname, names in GROUPS:
        for n in names:
            t = by_name[n]
            nodes.append(dict(name=n, short=SHORT.get(n, n), group=gid, why=t["why"], q=t["keys"].split()[0],
                              **({"minor": True} if n in MINOR else {})))
    links = [dict(a=a, b=b, kind=k, why=w) for a, b, k, w in LINKS]
    return dict(groups=[dict(id=g, name=n) for g, n, _ in GROUPS], kinds=KINDS, nodes=nodes, links=links)


def yahoo_symbol(market, code, exch=""):
    if market == "kr":
        return f"{code}.{'KQ' if exch == 'KQ' else 'KS'}"
    return code.replace(".", "-")


def members(themes_json, market, n=PER_THEME):
    """{테마: [(코드, 이름)]} 대표 종목 앞 n개 (themes.build가 상장폐지 종목은 이미 뺐어요)."""
    return {t["name"]: [tuple(x) for x in t[market][:n]] for t in themes_json["themes"]}


def download(symbols, period="1y"):
    """야후 종가 표 (열 = 기호). 못 받으면 빈 표."""
    import pandas as pd
    import yfinance as yf

    if not symbols:
        return pd.DataFrame()
    try:
        h = yf.download(sorted(set(symbols)), period=period, auto_adjust=True, progress=False, threads=True)
    except Exception as e:  # 네트워크·레이트리밋
        print(f"야후 시세 실패: {e!r}")
        return pd.DataFrame()
    if h is None or h.empty or "Close" not in h:
        return pd.DataFrame()
    close = h["Close"]
    if not hasattr(close, "columns"):  # 기호가 하나면 Series
        close = close.to_frame(sorted(set(symbols))[0])
    return close


QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote"


def download_caps(symbols, batch=100):
    """야후 시세 요약에서 시가총액 {기호: 시가총액}. 못 받은 기호는 빠져요."""
    from yfinance.data import YfData

    data, out, syms = YfData(), {}, sorted(set(symbols))
    for i in range(0, len(syms), batch):
        try:
            res = data.get(QUOTE, params={"symbols": ",".join(syms[i:i + batch]), "fields": "marketCap"})
            res.raise_for_status()
            for q in res.json()["quoteResponse"]["result"]:
                if q.get("marketCap"):
                    out[q["symbol"]] = float(q["marketCap"])
        except Exception as e:  # 네트워크·레이트리밋: 받은 데까지만
            print(f"야후 시가총액 실패: {e!r}")
    return out


def sizes(themes_json, market, cap_of, sym_of):
    """{테마: [시가총액 합, 종목 수]} 산업에 묶인 종목 전부. 시가총액을 하나도 못 받은 산업은 빠져요."""
    out = {}
    for t in themes_json["themes"]:
        caps = [cap_of[sym_of(c)] for c in dict.fromkeys(c for c, _ in t[market]) if sym_of(c) in cap_of]
        if caps:
            out[t["name"]] = [round(sum(caps)), len(caps)]
    return out


def r(x):
    return None if x is None or x != x else round(float(x), 4)


def flows(close, mem, sym_of):
    """시장 하나: ({테마: {r5, r20, n, stocks}}, 테마 하루 등락률 표). close 열 = 야후 기호."""
    import pandas as pd

    close = close.sort_index()
    rets = close.pct_change(fill_method=None)
    out, series = {}, {}
    for name, rows in mem.items():
        stocks, r5s, r20s, cols = [], [], [], []
        for code, ko in rows:
            s = sym_of(code)
            if s not in close or close[s].dropna().size < 25:
                continue
            c = close[s].dropna()
            r5, r20 = c.iloc[-1] / c.iloc[-6] - 1, c.iloc[-1] / c.iloc[-21] - 1
            r5s.append(r5)
            r20s.append(r20)
            cols.append(s)
            stocks.append([code, ko, r(c.iloc[-1]), r(r5), r(c.iloc[-1] / c.iloc[-2] - 1), r(r20)])  # 끝: 20일 (앱 20일 보기)
        if not stocks:
            continue
        out[name] = dict(r5=r(pd.Series(r5s).median()), r20=r(pd.Series(r20s).median()), n=len(stocks), stocks=stocks)
        series[name] = rets[cols].mean(axis=1, skipna=True)
    return out, pd.DataFrame(series).tail(CORR_DAYS)


def correlations(daily, links, mem):
    """선마다 주가 동행 {"a|b": 상관계수}와 사람이 안 이은 쌍 중 많이 같이 움직인 쌍 [(a, b, 상관계수)]."""
    import pandas as pd

    if daily.empty:
        return {}, []
    corr = daily.corr(min_periods=60)
    linked = {frozenset((l["a"], l["b"])) for l in links}
    on_link = {}
    for l in links:
        a, b = l["a"], l["b"]
        if a in corr and b in corr and corr.at[a, b] == corr.at[a, b]:
            on_link[f"{a}|{b}"] = round(float(corr.at[a, b]), 2)
    codes = {name: {c for c, _ in rows} for name, rows in mem.items()}
    names = list(corr.columns)
    every = [corr.at[a, b] for i, a in enumerate(names) for b in names[i + 1:] if corr.at[a, b] == corr.at[a, b]]
    floor = max(HIDDEN_MIN, float(pd.Series(every).quantile(HIDDEN_TOP))) if every else HIDDEN_MIN
    pairs = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            v = corr.at[a, b]
            # 같은 종목이 두 산업에 다 들어 있으면 (한국전력, LG화학…) 당연히 같이 움직여서 빼요
            if v != v or v < floor or frozenset((a, b)) in linked or codes[a] & codes[b]:
                continue
            pairs.append((a, b, round(float(v), 2)))
    pairs.sort(key=lambda x: -x[2])
    used, hidden = {}, []
    for a, b, v in pairs:
        if used.get(a, 0) >= HIDDEN_PER or used.get(b, 0) >= HIDDEN_PER:
            continue
        used[a], used[b] = used.get(a, 0) + 1, used.get(b, 0) + 1
        hidden.append([a, b, v])
    return on_link, hidden


def build(themes_json, symbol_rows=None, fetch=download, caps=None):
    """앱이 읽는 industry.json. symbol_rows {시장: {코드: 거래소}} 로 국장 코스닥(.KQ)을 가려요.
    caps: 기호들 → {기호: 시가총액} (산업 크기). 없으면 크기 없이 (지도는 점을 다 같은 크기로 그려요)."""
    out = static_map()
    if fetch is None:
        return out
    # 검색 전용 테마는 지도에 없으니 흐름·크기·주가 동행도 빼요 (없는 점과 이어진 선이 생기지 않게)
    themes_json = dict(themes_json, themes=[t for t in themes_json["themes"] if t["name"] not in SEARCH_ONLY])
    out["flows"], out["corr"], out["hidden"] = {}, {}, {}
    for m in ("kr", "us"):
        mem = members(themes_json, m)
        exch = (symbol_rows or {}).get(m, {})
        sym_of = lambda code, m=m, exch=exch: yahoo_symbol(m, code, exch.get(code, ""))  # noqa: E731
        if caps is not None:
            cap_of = caps([sym_of(c) for t in themes_json["themes"] for c, _ in t[m]])
            sz = sizes(themes_json, m, cap_of, sym_of)
            if sz:
                out.setdefault("size", {})[m] = sz
            print(f"{m}: 산업 {len(sz)}개 크기 (시가총액 {len(cap_of)}종목)")
        close = fetch([sym_of(c) for rows in mem.values() for c, _ in rows])
        if close is None or close.empty:
            print(f"{m}: 시세를 못 받아서 흐름 없이 지도만 써요")
            continue
        fl, daily = flows(close, mem, sym_of)
        out["flows"][m] = fl
        out["corr"][m], out["hidden"][m] = correlations(daily, out["links"], mem)
        out.setdefault("day", {})[m] = str(close.dropna(how="all").index[-1].date())
        print(f"{m}: 산업 {len(fl)}개 흐름, 선 {len(out['corr'][m])}개 동행, 주가로 찾은 연결 {len(out['hidden'][m])}개")
    out["built"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    return out


def symbol_rows(symbols_dir):
    rows = {}
    for m in ("kr", "us"):
        try:
            rows[m] = {r[0]: r[2] for r in json.loads((symbols_dir / f"{m}.json").read_text(encoding="utf-8"))["rows"]}
        except (OSError, ValueError, KeyError):
            rows[m] = {}
    return rows


def write(out_dir, data):
    (out_dir / "industry.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"))
    args = parser.parse_args()
    tj = themes.build(args.paper / "symbols", args.paper / "sectors.json")
    write(args.out, build(tj, symbol_rows(args.paper / "symbols"), caps=download_caps))
    print(f"{args.out}/industry.json 준비 완료")


if __name__ == "__main__":
    main()
