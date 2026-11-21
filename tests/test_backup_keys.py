"""백업 파일(site/js/asset.js BK_KEYS)이 앱이 이 폰에 저장하는 값을 빠짐없이 담는지 (사용자 2026-11-21)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"data_bytes", "bk_at"}  # 로딩 막대 크기 짐작·마지막 백업 날짜: 폰마다 따로라 안 옮겨요


def bk_keys():
    src = (ROOT / "site/js/asset.js").read_text(encoding="utf-8")
    m = re.search(r"const BK_KEYS = \[(.*?)\];", src, re.S)
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def used_keys():
    keys = set()
    for f in list((ROOT / "site/js").glob("*.js")) + [ROOT / "site/index.html"]:
        src = f.read_text(encoding="utf-8")
        keys |= set(re.findall(r'localStorage\.(?:get|set|remove)Item\("([^"]+)"', src))
        keys |= set(re.findall(r'remember\("([^"]+)"', src))
    return keys


def test_every_saved_key_is_backed_up():
    missing = used_keys() - bk_keys() - SKIP
    assert not missing, f"BK_KEYS에 넣어 주세요: {sorted(missing)}"


def test_template_keys_covered():
    src = (ROOT / "site/js/asset.js").read_text(encoding="utf-8")
    assert "(watch|seen_extras)_(kr|us)" in src
