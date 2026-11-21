import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import peek  # noqa: E402


def test_def_prints_only_that_function(capsys):
    assert peek.main(["shape", "--max", "200"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("tools/peek.py:") and "def shape" in out and "def kind" not in out


def test_json_shape_has_no_values(tmp_path, capsys):
    f = tmp_path / "a.json"
    f.write_text(json.dumps({"secret": "값은 안 찍어요", "rows": [{"x": 1}] * 5}), encoding="utf-8")
    assert peek.main([str(f)]) == 0
    out = capsys.readouterr().out
    assert "값은" not in out and "목록 5개" in out and "x: int" in out
    assert peek.main([str(f), "rows.0.x"]) == 0
    assert capsys.readouterr().out.strip() == "1"


def test_missing_name(capsys):
    assert peek.main(["no_such_name_zz"]) == 1
