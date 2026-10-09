# 임시: 깃허브 액션에서 무료 자료 주소가 열리는지 확인 (PR 올리기 전에 지워요)
import re, requests
H = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
URLS = [
    "https://finance.naver.com/item/frgn.naver?code=005930&page=1",
    "https://m.stock.naver.com/api/stock/005930/trend?pageSize=10",
    "https://m.stock.naver.com/api/stock/005930/integration",
    "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    "https://www.bls.gov/schedule/news_release/cpi.htm",
    "https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755",
    "https://opendart.fss.or.kr/api/list.json?crtfc_key=test",
    "https://finance.naver.com/sise/sise_market_sum.naver",
]
for u in URLS:
    try:
        r = requests.get(u, headers=H, timeout=20)
        r.encoding = r.apparent_encoding if "naver.com/item" in u or "sise" in u else r.encoding
        t = r.text
        print("=====", u, r.status_code, len(t))
        if "frgn" in u:
            rows = re.findall(r"<tr[^>]*onmouseover.*?</tr>", t, re.S)
            for row in rows[:3]:
                print([re.sub(r"<[^>]+>|\s+", " ", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)])
            print(t[t.find("기관"):t.find("기관") + 600])
        elif "fomc" in u:
            for y in ("2026", "2027"):
                i = t.find(f"{y} FOMC Meetings")
                print(re.sub(r"<[^>]+>|\s+", " ", t[i:i + 4000])[:900])
        elif "bok" in u:
            print(re.sub(r"<[^>]+>|\s+", " ", t)[:3000])
        else:
            print(re.sub(r"\s+", " ", t)[:1500])
    except Exception as e:
        print("=====", u, "ERR", repr(e))
