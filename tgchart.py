"""텔레그램에 사진으로 보낼 그림 (지수 + 50·200일선, 가상계좌 수익 vs 지수). 무료 matplotlib.

그림을 못 그리면(라이브러리·글꼴 없음 등) None을 돌려주고, 알림은 글로만 가요.
한글 글꼴은 koreanize-matplotlib(나눔고딕)을 써요.
"""

import io

SURFACE, INK, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"


def _plt():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    _korean_font(plt)
    plt.rcParams.update({"axes.unicode_minus": False, "font.size": 12})
    return plt


def _korean_font(plt):
    """koreanize-matplotlib 패키지에 든 나눔고딕 글꼴 파일만 등록해요 (패키지 코드는 실행 안 해요:
    파이썬 3.12에 없는 distutils를 불러서)."""
    import importlib.util
    import pathlib

    from matplotlib import font_manager

    spec = importlib.util.find_spec("koreanize_matplotlib")
    fonts = sorted(pathlib.Path(spec.submodule_search_locations[0], "fonts").glob("*.ttf")) if spec else []
    if not fonts:
        print("한글 글꼴(koreanize-matplotlib)이 없어 그림 글자가 깨질 수 있어요.")
        return
    for f in fonts:
        font_manager.fontManager.addfont(str(f))
    plt.rcParams["font.family"] = "NanumGothic"


def _figure(plt, title, subtitle):
    fig, ax = plt.subplots(figsize=(6.0, 4.4), dpi=180)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)
    fig.text(0.03, 0.95, title, fontsize=17, fontweight="bold", color=INK, va="top")
    fig.text(0.03, 0.875, subtitle, fontsize=12.5, color=MUTED, va="top")
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.tick_params(colors=MUTED, length=0, labelsize=11.5)
    fig.subplots_adjust(left=0.12, right=0.74, top=0.74, bottom=0.09)
    return fig, ax


def _png(fig, plt):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor())
    plt.close(fig)
    return buf.getvalue()


def _end_labels(ax, labels):
    """선 끝 이름표 [(x, y, 글, 색, 굵게)]. 겹치지 않게 위아래로 벌려요."""
    lo, hi = ax.get_ylim()
    gap = (hi - lo) * 0.09
    labels = sorted(labels, key=lambda t: t[1])
    placed = []
    for x, y, text, color, bold in labels:
        ty = max(y, placed[-1] + gap) if placed else y
        placed.append(ty)
        ax.plot([x], [y], "o", color=color, markersize=5, markeredgecolor=SURFACE, markeredgewidth=1.5, clip_on=False)
        ax.annotate("  " + text, (x, y), xytext=(x, ty), textcoords="data", va="center", fontsize=11.5, annotation_clip=False,
                    color=INK if bold else MUTED, fontweight="bold" if bold else "normal")


def _legend(ax, n):
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), frameon=False, fontsize=11.5, ncol=n, labelcolor=INK,
              handlelength=1.4, borderaxespad=0.2)


def index_chart(index_close, name, subtitle, days=130):
    """지수 최근 days거래일(약 6개월) 종가와 50·200일선. 반환: PNG 바이트 또는 None."""
    try:
        plt = _plt()
        ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
        tail = index_close.index[-days:]
        fig, ax = _figure(plt, f"{name} 최근 6개월", subtitle)
        ends = []
        for s, color, label, width in ((index_close.loc[tail], BLUE, name, 2.2), (ma50.loc[tail], ORANGE, "50일선", 1.6),
                                       (ma200.loc[tail], AQUA, "200일선", 1.6)):
            ax.plot(s.index, s.values, color=color, linewidth=width, label=label, solid_capstyle="round")
            last = s.dropna()
            if len(last):
                ends.append((last.index[-1], last.iloc[-1], f"{label} {last.iloc[-1]:,.0f}", color, label == name))
        ax.yaxis.set_major_formatter(_thousands())
        _legend(ax, 3)
        ax.margins(x=0.01)
        _end_labels(ax, ends)
        ax.xaxis.set_major_formatter(_month_fmt())
        return _png(fig, plt)
    except Exception as e:
        print(f"지수 그림 실패 (글로만 보내요): {e!r}")
        return None


def equity_chart(equity, capital, index_start, index_name, title):
    """가상계좌 수익률과 같은 기간 지수 수익률(시작=0%). equity: date, equity, index 열. 반환: PNG 또는 None."""
    try:
        if len(equity) < 2:
            return None
        import pandas as pd

        plt = _plt()
        dates = pd.to_datetime(equity["date"])
        mine = (equity["equity"].astype(float) / capital - 1) * 100
        idx = (equity["index"].astype(float) / index_start - 1) * 100
        fig, ax = _figure(plt, title, f"시작일 {dates.iloc[0]:%Y-%m-%d} = 0%, 수익률(%)")
        ax.axhline(0, color=MUTED, linewidth=0.8)
        ends = []
        for s, color, label, bold in ((mine, BLUE, "내 가상계좌", True), (idx, ORANGE, index_name, False)):
            ax.plot(dates, s, color=color, linewidth=2.2 if bold else 1.6, label=label, solid_capstyle="round",
                    marker="o" if len(dates) < 15 else None, markersize=4)
            ends.append((dates.iloc[-1], s.iloc[-1], f"{label} {s.iloc[-1]:+.1f}%", color, bold))
        ax.yaxis.set_major_formatter(_percent())
        _legend(ax, 2)
        ax.xaxis.set_major_formatter(_month_fmt())
        ax.margins(x=0.02, y=0.15)
        _end_labels(ax, ends)
        return _png(fig, plt)
    except Exception as e:
        print(f"계좌 그림 실패 (글로만 보내요): {e!r}")
        return None


def _month_fmt():
    import matplotlib.dates as mdates

    return mdates.DateFormatter("%m/%d")


def _thousands():
    from matplotlib.ticker import FuncFormatter

    return FuncFormatter(lambda v, _: f"{v:,.0f}")


def _percent():
    from matplotlib.ticker import FuncFormatter

    return FuncFormatter(lambda v, _: f"{v:+.1f}%" if v else "0%")
