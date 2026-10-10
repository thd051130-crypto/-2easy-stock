"""텔레그램 꾸미기(tgfmt.py)와 그림(tgchart.py) 테스트."""

import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tgfmt  # noqa: E402

TEXT = """[국장 신호] 2026-10-08 종가 기준
코스피 6,626 → 신규 매수 쉬기

[규칙표 후보] 가상계좌로만 검증 중
1. KT&G(033780) 종가 177,400원
   이유: 200일선 위 <강함>

[부서별 보고]
· 스크리닝부: 오늘 조건 통과 0개
▲ 많이 오른 종목"""


def test_sections_split_on_bracket_headers():
    parts = tgfmt.sections(TEXT)
    assert [t for t, _, _ in parts] == ["국장 신호", "규칙표 후보", "부서별 보고"]
    assert parts[0][1] == "2026-10-08 종가 기준"


def test_render_bolds_and_escapes():
    [html] = tgfmt.render(TEXT)
    assert "🇰🇷 <b>국장 신호</b>" in html
    assert "<b>KT&amp;G(033780)</b>" in html
    assert "&lt;강함&gt;" in html
    assert "· <b>스크리닝부:</b>" in html
    assert "<b>▲ 많이 오른 종목</b>" in html
    assert "blockquote" not in html


def test_collapse_keeps_first_section_open():
    [html] = tgfmt.render(TEXT, collapse=True)
    assert html.count("<blockquote expandable>") == 2
    assert html.index("<blockquote") > html.index("신규 매수 쉬기")


def test_long_text_is_split_without_breaking_tags():
    text = "[왜 움직였나] 테스트\n" + "\n".join(f"{i}. 종목{i} +{i}%" for i in range(600))
    parts = tgfmt.render(text, collapse=True, open_first=False)
    assert len(parts) > 1
    for p in parts:
        assert len(p) <= tgfmt.LIMIT
        assert p.count("<blockquote expandable>") == p.count("</blockquote>")
        assert p.count("<b>") == p.count("</b>")


def test_plain_strips_tags_and_keeps_links():
    html = '<b>A&amp;B</b> ' + tgfmt.link("앱", "https://x.io/")
    assert tgfmt.plain(html) == "A&B 앱 (https://x.io/)"


def test_compose_puts_summary_first_and_folds_details():
    parts = tgfmt.compose("<b>요약</b>", TEXT)
    assert parts[0].startswith("<b>요약</b>")
    assert parts[0].count("<blockquote expandable>") == 3
    assert tgfmt.compose("", TEXT)[0].startswith("👇")


def test_kr_summary_and_extras():
    import kr_swing_signals as ks

    market = dict(day=pd.Timestamp("2026-10-08"), kospi=6626.0, kospi_ma50=6692.0, kospi_ma200=6365.0,
                  kospi_ok=False, trend_ok=False)
    lines = ks.kr_summary(market, [], 10_000_000)
    assert "오늘은 새로 안 사요" in "\n".join(lines)
    picks = [dict(name="삼성<전자>", close=262000.0)]
    market["kospi_ok"] = True
    head = "\n".join(ks.kr_summary(market, picks, 10_000_000))
    assert "매수 후보 1개" in head and "삼성&lt;전자&gt;" in head and "손절 248,900원" in head
    payload = dict(rulebook=[dict(name=f"종목{i}") for i in range(6)],
                   movers=dict(up=[dict(name="케이씨텍", r5=0.411)], down=[]),
                   sectors=[dict(name="2차전지", r5=0.082), dict(name="조선", r5=-0.061)])
    extra = "\n".join(ks.summary_extras(payload))
    assert "규칙표 후보 6개" in extra and "외 2개" in extra
    assert "케이씨텍 +41%" in extra and "약한 업종 조선 -6.1%" in extra
    summary, detail = ks.telegram_messages(lines, payload, "[국장 신호] 10-08 종가\n본문")
    assert len(tgfmt.plain(summary)) <= tgfmt.CAPTION_LIMIT
    assert detail.startswith("[신호 자세히] 10-08 종가")


def test_charts_are_png():
    pytest.importorskip("matplotlib")
    import tgchart

    days = pd.bdate_range("2025-06-01", periods=300)
    index = pd.Series(np.linspace(5000, 6600, 300), index=days)
    assert tgchart.index_chart(index, "코스피", "테스트").startswith(b"\x89PNG")
    eq = pd.DataFrame(dict(date=days[-10:].strftime("%Y-%m-%d"), equity=np.linspace(1e7, 1.01e7, 10),
                           index=np.linspace(6500, 6600, 10)))
    assert tgchart.equity_chart(eq, 1e7, 6500, "코스피", "가상매매").startswith(b"\x89PNG")
    assert tgchart.equity_chart(eq.iloc[:1], 1e7, 6500, "코스피", "가상매매") is None
