#!/usr/bin/env python3
"""배포할 js/*.js(화면별 앱 파일)·casebook.js·style.css에서 주석과 줄 앞 들여쓰기를 빼서 폰이 받는 양을 줄여요 (2026-11-18).

저장소의 원본(site/)은 그대로 두고, dashboard.py가 _site/로 복사한 파일만 줄여요.
설명 주석은 원본에 남아 있으니 고칠 땐 site/를 보면 돼요.

글자 하나씩 읽으면서 지금 문자열('…' "…" `…`) 안인지, 정규식(/…/) 안인지, 주석인지를 따라가요.
문자열·템플릿(`…${…}…`)·정규식 안의 내용은 한 글자도 안 바꿔요. 줄바꿈도 그대로 둬요 (세미콜론 없는 줄도 안전하게).
"""
import re
import sys

# 이 글자나 낱말 뒤에 오는 /는 나눗셈이 아니라 정규식의 시작이에요
REGEX_AFTER_CHARS = set("(,=:[!&|?{};+-*%<>~^")
REGEX_AFTER_WORDS = {"return", "typeof", "case", "in", "of", "void", "delete", "throw", "new", "else", "do", "yield", "await"}


def _regex_ok(out):
    """지금까지 낸 코드의 마지막 의미 있는 글자를 보고 '/'가 정규식 시작인지 판단해요."""
    tail = "".join(out[-40:]).rstrip(" \t\n")  # out은 글자·문자열 조각 목록이라 끝부분만 이어 붙여 봐요
    if not tail:
        return True
    c = tail[-1]
    if c in REGEX_AFTER_CHARS:
        return True
    if c.isalnum() or c in "_$":
        m = re.search(r"[A-Za-z0-9_$]+$", tail)
        return m.group(0) in REGEX_AFTER_WORDS
    return False


def slim_js(src):
    out = []
    n = len(src)
    i = 0
    stack = []  # 템플릿 ${ … } 안의 코드: 그 안의 { 깊이
    at_line_start = True
    while i < n:
        c = src[i]
        # 줄 앞 들여쓰기는 빼요 (코드 안에서만. 문자열·템플릿 안은 아래에서 통째로 복사해요)
        if at_line_start and c in " \t":
            i += 1
            continue
        at_line_start = False
        if c == "\n":
            # 빈 줄은 빼요
            if out and out[-1] != "\n":
                out.append("\n")
            # 줄 끝 공백 정리
            while len(out) >= 2 and out[-2] in " \t":
                out.pop(-2)
            at_line_start = True
            i += 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":  # 한 줄 주석
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":  # 여러 줄 주석
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("닫히지 않은 /* 주석")
            i = j + 2
            if out and out[-1] not in " \n" and i < n and src[i] not in " \n;,)":
                out.append(" ")  # a/**/b 가 ab로 붙지 않게
            continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif src[j] == "\n":
                    raise ValueError(f"줄바꿈이 있는 문자열 {i}")
                j += 1
            out.append(src[i:j + 1])
            i = j + 1
            continue
        if c == "`":
            i = _template(src, i, out, stack)
            continue
        if c == "/" and _regex_ok(out):
            j = i + 1
            in_class = False
            while j < n:
                d = src[j]
                if d == "\\":
                    j += 2
                    continue
                if d == "\n":
                    raise ValueError(f"정규식으로 봤는데 줄이 끝났어요 {i}: {src[i:i + 40]!r}")
                if in_class:
                    if d == "]":
                        in_class = False
                elif d == "[":
                    in_class = True
                elif d == "/":
                    break
                j += 1
            j += 1
            while j < n and (src[j].isalpha()):
                j += 1  # 플래그 (g, i, u …)
            out.append(src[i:j])
            i = j
            continue
        if stack:
            if c == "{":
                stack[-1] += 1
            elif c == "}":
                if stack[-1] == 0:  # ${ … } 끝 → 템플릿으로 돌아가요
                    stack.pop()
                    out.append("}")
                    i = _template(src, i + 1, out, stack, resume=True)
                    continue
                stack[-1] -= 1
        out.append(c)
        i += 1
    return "".join(out).strip() + "\n"


def _template(src, i, out, stack, resume=False):
    """`…` 템플릿 글자를 그대로 복사해요. ${ 를 만나면 코드로 돌아가고(깊이 기록), } 에서 다시 이어 와요."""
    n = len(src)
    j = i if resume else i + 1
    start = i
    while j < n:
        d = src[j]
        if d == "\\":
            j += 2
            continue
        if d == "`":
            out.append(src[start:j + 1])
            return j + 1
        if d == "$" and j + 1 < n and src[j + 1] == "{":
            out.append(src[start:j + 2])
            stack.append(0)
            return j + 2
        j += 1
    raise ValueError("닫히지 않은 템플릿")


def slim_css(src):
    """CSS 주석을 빼고 줄 앞뒤 공백·빈 줄을 정리해요. 문자열("…", '…') 안은 그대로."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("닫히지 않은 /* 주석")
            i = j + 2
            continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
            continue
        out.append(c)
        i += 1
    lines = (line.strip() for line in "".join(out).split("\n"))
    return "\n".join(line for line in lines if line) + "\n"


def slim_dir(out_dir):
    """_site 안의 앱 파일을 줄여요. 줄인 결과가 이상하면(예외) 원본 그대로 둬요."""
    import pathlib
    out_dir = pathlib.Path(out_dir)
    files = [("casebook.js", slim_js), ("style.css", slim_css)] + [(p.relative_to(out_dir).as_posix(), slim_js) for p in sorted((out_dir / "js").glob("*.js"))]
    for name, fn in files:
        path = out_dir / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        try:
            path.write_text(fn(text), encoding="utf-8")
        except ValueError as e:
            print(f"{name}: 줄이지 않고 그대로 올려요 ({e})", file=sys.stderr)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        t = open(p, encoding="utf-8").read()
        sys.stdout.write(slim_css(t) if p.endswith(".css") else slim_js(t))
