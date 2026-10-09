import review


def trade(ret, reason="종가가 5일선 위", buy="2026-10-05", sell="2026-10-09"):
    return dict(code="005930", name="삼성전자", buy_date=buy, sell_date=sell, ret=str(ret), reason=reason)


IDX = {"2026-10-02": 100.0, "2026-10-05": 100.0, "2026-10-08": 101.0, "2026-10-09": 102.0}


def test_index_change_uses_nearest_earlier_day():
    assert review.index_change(IDX, "2026-10-05", "2026-10-09") == 0.02
    assert review.index_change(IDX, "2026-10-06", "2026-10-10") == 0.02  # 휴장일이면 그 전 날
    assert review.index_change(IDX, "2026-09-01", "2026-10-09") is None  # 기록 시작 전


def test_verdicts():
    beat, lag, stop, loss = review.notes([trade(0.05), trade(0.01), trade(-0.07, "손절 (매수가 대비 -7% 아래)"),
                                          trade(-0.01)], IDX, "kr")
    assert "나았어요" in beat["verdict"] and beat["index"] == 0.02
    assert "더 벌었어요" in lag["verdict"]
    assert "손절" in stop["verdict"]
    assert "손실" in loss["verdict"]
    assert beat["buy"] == review.BUY_REASONS["kr"] and beat["sell"] == "종가가 5일선 위"


def test_week_lines_best_and_worst():
    notes = review.notes([trade(0.05), trade(-0.02)], IDX, "rulebook")
    lines = review.week_lines(notes)
    assert lines[0] == "이번 주 복기" and "잘된 거래" in lines[1] and "아쉬운 거래" in lines[2]
    assert review.week_lines(review.notes([trade(0.05)], IDX, "kr"))[1:] and len(review.week_lines(review.notes([trade(0.05)], IDX, "kr"))) == 2
    assert review.week_lines([]) == []
