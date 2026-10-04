from dataclasses import replace

import pytest

from stockbot.config import Config, load_dotenv, parse_watchlist


def test_parse_watchlist():
    assert parse_watchlist("005930:삼성전자, 000660 ,") == {"005930": "삼성전자", "000660": ""}
    with pytest.raises(ValueError):
        parse_watchlist("5930:bad")


def test_from_env_defaults_and_paper_vs_real():
    c = Config.from_env({"WATCHLIST": "005930", "COOLDOWN_MIN": "10", "KIS_ENV": "REAL"})
    assert c.kis_env == "real" and c.cooldown_sec == 600 and c.surge_pct == 5.0
    assert "openapi.koreainvestment.com:9443" in c.rest_base and c.ws_url.endswith(":21000")
    p = Config.from_env({"WATCHLIST": "005930"})
    assert "openapivts" in p.rest_base and p.ws_url.endswith(":31000") and p.rest_delay > 0.5


def test_problems(cfg):
    assert cfg.problems() == []
    bad = replace(cfg, kis_app_key="", telegram_token="", watchlist={}, ma_window=200, kis_env="x")
    assert len(bad.problems()) == 5
    assert replace(cfg, watchlist={f"{i:06d}": "" for i in range(42)}).problems()


def test_load_dotenv_does_not_override(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text('# c\nA_KEY="x y"\nB_KEY=2\nbad line\n')
    monkeypatch.setenv("B_KEY", "keep")
    monkeypatch.delenv("A_KEY", raising=False)
    load_dotenv(f)
    import os
    assert os.environ["A_KEY"] == "x y" and os.environ["B_KEY"] == "keep"
    monkeypatch.delenv("A_KEY")
