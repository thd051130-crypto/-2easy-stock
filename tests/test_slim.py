import subprocess

import pytest

import slim


def run_js(code):
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout


def test_slim_js_drops_comments_and_indent_but_keeps_strings_templates_regex():
    src = '''// 맨 위 주석
function f(x) {
  /* 여러 줄
     주석 */
  const a = "// 문자열 안", b = '/* 이것도 */';  // 줄 끝 주석
  const re = /^https:\\/\\//, d = 10 / 2 / 5;
  return `<ol>
    ${x.map((c) => `<li>${/a\\/b/.test(c) ? "y" : "n"}</li>`).join("")}
  // 템플릿 안은 그대로
</ol>` + a + b + re.test("https://x") + d;
}

console.log(f(["a/b", "c"]));
'''
    out = slim.slim_js(src)
    assert "맨 위 주석" not in out and "여러 줄" not in out and "줄 끝 주석" not in out
    assert "\n  const" not in out  # 들여쓰기 빠짐
    assert "  // 템플릿 안은 그대로" in out  # 템플릿 안은 한 글자도 안 바뀜
    assert run_js(out) == run_js(src)


def test_slim_js_refuses_broken_input():
    with pytest.raises(ValueError):
        slim.slim_js("const s = `닫히지 않음")


def test_slim_css_keeps_strings():
    src = '/* 주석 */\n.a {\n  content: "/* 그대로 */";  /* 끝 */\n  color: red;\n}\n'
    assert slim.slim_css(src) == '.a {\ncontent: "/* 그대로 */";\ncolor: red;\n}\n'


def test_app_files_slim_to_valid_js():
    import glob
    for name in sorted(glob.glob("site/js/*.js")) + ["site/casebook.js"]:
        out = slim.slim_js(open(name, encoding="utf-8").read())
        subprocess.run(["node", "--check", "-"], input=out, text=True, check=True, capture_output=True)
