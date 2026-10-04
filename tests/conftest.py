from stockbot.config import Config
from stockbot.models import Baseline
from stockbot.simulate import make_tick  # noqa: F401  (tests import from here)

import pytest


@pytest.fixture
def cfg(tmp_path):
    return Config(kis_app_key="k", kis_app_secret="s", telegram_token="t", telegram_chat_id="1",
                  watchlist={"005930": "삼성전자"}, state_dir=tmp_path)


@pytest.fixture
def base():
    return Baseline(code="005930", prev_close=70_000, ma=70_500.0, avg_volume=1_000_000.0,
                    ma_window=20, last_date="20260930")
