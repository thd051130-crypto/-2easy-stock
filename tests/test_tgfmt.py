"""텔레그램 꾸미기(tgfmt.py) 테스트."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tgfmt  # noqa: E402

TEXT = """[오늘의 리포트] 2026-10-08
국장 분위기 약함

[종목팀] 볼 업종 안의 종목
1. KT&G(033780) 5일 +3.0%
   이유: 200일선 위 <강함>

[편집팀] 자료가 넘어간 흐름
· 시장팀: 국장 약함
▲ 많이 오른 종목"""


def test_sections_split_on_bracket_headers():
    parts = tgfmt.sections(TEXT)
    assert [t for t, _, _ in parts] == ["오늘의 리포트", "종목팀", "편집팀"]
    assert parts[0][1] == "2026-10-08"


def test_render_bolds_and_escapes():
    [html] = tgfmt.render(TEXT)
    assert "📰 <b>오늘의 리포트</b>" in html
    assert "<b>KT&amp;G(033780)</b>" in html
    assert "&lt;강함&gt;" in html
    assert "· <b>시장팀:</b>" in html
    assert "<b>▲ 많이 오른 종목</b>" in html
    assert "blockquote" not in html


def test_collapse_keeps_first_section_open():
    [html] = tgfmt.render(TEXT, collapse=True)
    assert html.count("<blockquote expandable>") == 2
    assert html.index("<blockquote") > html.index("국장 분위기 약함")


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
