# 임시: 깃허브 액션에서 무료 자료 주소가 열리는지 확인 (PR 올리기 전에 지워요)
import re, requests
H = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
def get(u, **kw):
    r = requests.get(u, headers=H, timeout=20, **kw)
    print("=====", u, r.status_code, len(r.text))
    return r
r = get("https://m.stock.naver.com/api/stock/005930/trend?pageSize=60")
j = r.json(); print(len(j), j[-1]["bizdate"], j[0])
r = get("https://m.stock.naver.com/api/stock/035720/trend?pageSize=60&bizdate=20260801")
j = r.json(); print(len(j), j[0]["bizdate"], j[-1]["bizdate"])
t = get("https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755").text
txt = re.sub(r"<[^>]+>", " ", t); txt = re.sub(r"\s+", " ", txt)
for m in re.finditer(r"20\d\d", txt):
    pass
i = txt.find("2026년"); print(txt[i-200:i+1500])
for k in ("월 ", "일정"):
    print([m.start() for m in re.finditer(k, txt)][:5])
print(re.findall(r"\d{4}\.\s?\d{1,2}\.\s?\d{1,2}", txt)[:40])
print(re.findall(r"\d{1,2}월\s?\d{1,2}일", txt)[:40])
for u in ["https://fred.stlouisfed.org/releases/calendar?rid=10&y=2026",
          "https://www.bls.gov/cpi/",
          "https://www.investing.com/economic-calendar/",
          "https://m.stock.naver.com/api/stock/005930/finance/annual",
          "https://m.stock.naver.com/api/stock/005930/consensus" ]:
    try:
        t = get(u).text
        txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t))
        i = txt.find("Consumer Price"); print(txt[max(0,i-300):i+1500] if i >= 0 else txt[:800])
    except Exception as e:
        print("ERR", u, e)
