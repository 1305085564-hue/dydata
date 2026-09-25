#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文档体检 —— 长期文档的「校对员」

查三类病：
  1. 链接  —— 死链、写错目录层数、括号被 Markdown 吞掉、行号写进链接、链到本机绝对路径
  2. 归位  —— 文件放错地方（按 docs/plans → docs/archive → docs/reference 的约定）
  3. 手册  —— AI 共用的规则文件（AGENTS.md / CLAUDE.md）是否单一原稿、索引是否指得到

用法：
  python3 scripts/文档体检.py              # 只检查，报问题
  python3 scripts/文档体检.py --fix        # 机械问题自动修（路径层数/括号/行号）
  python3 scripts/文档体检.py --scope=docs  # 只查某个目录
  python3 scripts/文档体检.py --json        # 机器可读输出

退出码：0 = 干净，1 = 有待处理问题
"""

import os
import re
import sys
import json
import urllib.parse
from collections import defaultdict
from datetime import date, datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 目标里允许的尾缀：`file.ts:62` / `file.ts:62-80` 这种「文件+行号」写法
LINE_SUFFIX = re.compile(r"^(?P<path>.+?):(?P<line>\d+(?:-\d+)?)$")

# Markdown 链接。目标里可能含一层括号（如 src/app/(app)/...），需平衡匹配
LINK = re.compile(r"\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)")

# 本机绝对路径 / 临时目录 —— 别人机器上一定打不开
LOCAL_PATH = re.compile(r"(file://|/Users/|/private/tmp/|[A-Za-z]:\\\\)")

FENCE = re.compile(r"^\s*(```|~~~)")


def is_in_fence(lines, idx):
    """判断第 idx 行是否落在代码围栏内。围栏里的链接是示例，不是真引用。"""
    open_fence = None
    for i, line in enumerate(lines):
        if i > idx:
            break
        if FENCE.match(line):
            if open_fence is None:
                open_fence = line.strip()[:3]
            elif open_fence is not None and line.strip().startswith(open_fence):
                open_fence = None
    return open_fence is not None


def iter_md(root):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", ".next", ".worktrees", "output")]
        for f in sorted(files):
            if f.endswith(".md"):
                yield os.path.join(base, f)


def split_target(target):
    """拆出「真实路径」和「行号后缀」。"""
    t = urllib.parse.unquote(target.split("#")[0].strip())
    if not t:
        return None, None
    m = LINE_SUFFIX.match(t)
    if m and not os.path.exists(os.path.join(REPO, t)):
        return m.group("path"), m.group("line")
    return t, None


def repair_relative(dir_of, target):
    """
    校正相对路径层数。AI 写文档时最容易在这里栽跟头：
      docs/plans/x.md 指 src/...  → 应是 ../../src/...
      多退一层 ../../../src/     → 会指到项目外面去

    做法：以「剥掉 ../ 后的语义路径」为线索，从文件目录逐级回溯，找第一个真实存在的。
    """
    if os.path.isabs(target) or target.startswith("file:"):
        return target
    if os.path.exists(os.path.normpath(os.path.join(dir_of, target))):
        return target

    semantic = re.sub(r"^(\.\./|\./)+", "", target)
    if not semantic:
        return target

    probe = dir_of
    for _ in range(8):
        cand = os.path.normpath(os.path.join(probe, semantic))
        if os.path.exists(cand):
            return os.path.relpath(cand, dir_of).replace(os.sep, "/")
        if os.path.normpath(probe) == REPO:
            break
        probe = os.path.dirname(probe)
    return target


def check_one_file(path, fix=False):
    """检查单个 Markdown 文件的链接。返回 (问题列表, 修复条数)。

    注意：当前版本的 --fix 会直接写回文件；正式使用前应改为补丁预览，
    并为路径修复补充测试，避免把“找到同名文件”误当成原意。
    """
    problems = []
    fixed = 0
    rel = os.path.relpath(path, REPO)
    with open(path, encoding="utf-8", errors="ignore") as fh:
        text = fh.read()
    lines = text.splitlines()
    dir_of = os.path.dirname(path)
    changed = False

    for idx, line in enumerate(lines):
        if is_in_fence(lines, idx):
            continue
        line_fixed = False
        # 从后往前替换，避免改了前面导致后面的偏移错位
        matches = list(LINK.finditer(line))
        for m in reversed(matches):
            label, raw = m.group(1), m.group(2)
            if raw.startswith(("http://", "https://", "mailto:", "#")):
                continue

            # 只有「链接目标」里的本机路径才算病；流水账里记一段路径是正常的
            if LOCAL_PATH.search(raw):
                problems.append({
                    "类别": "本机绝对路径", "文件": rel, "行": idx + 1,
                    "说明": "链接目标是 /Users/... 或 /private/tmp/...，换台电脑就打不开",
                    "原文": line.strip()[:100],
                })

            new_raw = raw
            notes = []

            # 机械修 1：括号必须转义，否则 Markdown 把链接截断在 (app) 的 ) 处
            if re.search(r"[()]", raw) and not raw.startswith("file:"):
                new_raw = new_raw.replace("(", "%28").replace(")", "%29")
                notes.append("括号未转义")

            # 机械修 2：行号从链接目标挪出（目标必须是真文件）
            pure, lineno = split_target(new_raw)
            if lineno:
                new_raw = new_raw.rsplit(":", 1)[0]
                notes.append("行号写进了链接目标")

            # 机械修 3：路径层数校正
            if pure:
                fixed_raw = repair_relative(dir_of, urllib.parse.unquote(pure))
                if fixed_raw != urllib.parse.unquote(pure):
                    new_raw = new_raw.replace(pure, urllib.parse.quote(fixed_raw, safe="/:%"), 1)
                    notes.append("目录层数不对")

            if new_raw != raw:
                if fix:
                    line = line[:m.start()] + f"[{label}]({new_raw})" + line[m.end():]
                    line_fixed = True
                    fixed += 1
                else:
                    problems.append({
                        "类别": "链接写法", "文件": rel, "行": idx + 1,
                        "说明": f"{'；'.join(notes)} —— 加 --fix 可自动修",
                        "原文": f"[{label}]({raw})",
                    })

            pure, _ = split_target(new_raw)
            if not pure:
                continue
            target_abs = pure if os.path.isabs(pure) else os.path.normpath(os.path.join(dir_of, urllib.parse.unquote(pure)))
            if not os.path.exists(target_abs):
                problems.append({
                    "类别": "死链", "文件": rel, "行": idx + 1,
                    "说明": f"指向的文件不存在：{urllib.parse.unquote(pure)}",
                    "原文": line.strip()[:100],
                })

        if line_fixed:
            lines[idx] = line
            changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + ("\n" if text.endswith("\n") else ""))
    return problems, fixed


def check_links(root, fix=False):
    problems, fixed = [], 0
    for path in iter_md(root):
        p, f = check_one_file(path, fix=fix)
        problems += p
        fixed += f
    return problems, fixed


def check_placement(root):
    """
    检查文件归位：按 docs/plans/README.md 约定，plans/ 只放「还没做的事」。

    只认两个硬信号，避免误伤交接记录、总纲、README：
      1. 文件名带日期且距今超过 45 天
      2. 文首明确写了「状态：已完成」这类收口标记
    """
    problems = []
    cutoff = date.today()
    skip_names = {"README.md"}
    skip_dirs = ("上下文交接", "cleanup-batches", "_跨模块")

    for path in iter_md(os.path.join(root, "docs", "plans")):
        rel = os.path.relpath(path, root)
        name = os.path.basename(path)
        if name in skip_names or any(s in rel for s in skip_dirs):
            continue

        reasons = []
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", name)
        if m:
            try:
                doc_date = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                age = (cutoff - doc_date).days
                if age > 45:
                    reasons.append(f"文件名日期 {doc_date}，距今 {age} 天")
            except ValueError:
                pass

        with open(path, encoding="utf-8", errors="ignore") as fh:
            head = fh.read(400)
        if re.search(r"(?m)^\s*[-*>]?\s*\**状态\**\s*[:：]\s*\**.*?(已完成|已验收|已上线|已归档)", head):
            reasons.append("文首写明「状态：已完成」")

        if reasons:
            problems.append({
                "类别": "疑似该归档", "文件": rel, "行": 1,
                "说明": "；".join(reasons) + "。按约定应移入 docs/archive/",
                "原文": head.splitlines()[0][:80] if head else "",
            })
    return problems


def check_manual(root):
    """检查手册健康度：单一原稿、索引指得到。"""
    problems = []
    agents = os.path.join(root, "AGENTS.md")
    claude = os.path.join(root, "CLAUDE.md")

    for p, label in ((agents, "AGENTS.md"), (claude, "CLAUDE.md")):
        if not os.path.exists(p):
            problems.append({"类别": "手册", "文件": label, "行": 1,
                             "说明": "规则文件不见了", "原文": ""})

    # 项目约定：CLAUDE.md 只做路由，唯一原稿是 AGENTS.md
    if os.path.exists(claude) and os.path.exists(agents):
        body = open(claude, encoding="utf-8", errors="ignore").read()
        if len(body) > 400 and "AGENTS.md" not in body:
            problems.append({
                "类别": "手册", "文件": "CLAUDE.md", "行": 1,
                "说明": "CLAUDE.md 超过 400 字且没指向 AGENTS.md —— 很可能已经变成第二份原稿，"
                        "会跟 AGENTS.md 各说各话",
                "原文": "",
            })

    # 懒加载索引里指到的文件必须真的存在，否则 AI 按图索骥会扑空
    if os.path.exists(agents):
        for i, line in enumerate(open(agents, encoding="utf-8", errors="ignore"), 1):
            if is_in_fence(open(agents, encoding="utf-8", errors="ignore").read().splitlines(), i - 1):
                continue
            for m in LINK.finditer(line):
                raw = m.group(2)
                if raw.startswith(("http", "#", "mailto")):
                    continue
                pure, _ = split_target(raw)
                if not pure:
                    continue
                abs_t = pure if os.path.isabs(pure) else os.path.normpath(os.path.join(root, urllib.parse.unquote(pure)))
                if not os.path.exists(abs_t):
                    problems.append({
                        "类别": "手册", "文件": "AGENTS.md", "行": i,
                        "说明": f"索引指向的文件不存在：{urllib.parse.unquote(pure)}",
                        "原文": line.strip()[:100],
                    })
    return problems


def main():
    args = sys.argv[1:]
    do_fix = "--fix" in args
    as_json = "--json" in args
    # 默认只管长期文档 + 根目录规则文件；日志/ 之类流水账不进体检
    scope = os.path.join(REPO, "docs")
    for a in args:
        if a.startswith("--scope="):
            scope = os.path.join(REPO, a.split("=", 1)[1])

    problems, fixed = check_links(scope, fix=do_fix)

    # 根目录的规则/说明文件也一起查链接
    for name in ("AGENTS.md", "CLAUDE.md", "README.md"):
        p = os.path.join(REPO, name)
        if os.path.exists(p):
            sub, fx = check_one_file(p, fix=do_fix)
            problems += sub
            fixed += fx

    problems += check_placement(REPO) + check_manual(REPO)

    if as_json:
        print(json.dumps({"问题": problems, "自动修复": fixed}, ensure_ascii=False, indent=2))
        return 0 if not problems else 1

    print("=" * 62)
    print("文档体检报告")
    print(f"范围：{os.path.relpath(scope, REPO)} + 根目录规则文件    {datetime.now():%Y-%m-%d %H:%M}")
    print("=" * 62)

    if do_fix and fixed:
        print(f"\n🔧 已自动修复 {fixed} 处机械问题（目录层数 / 括号转义 / 行号挪位）")

    if not problems:
        print("\n✅ 全部通过，文档是干净的。")
        return 0

    by_cat = defaultdict(list)
    for p in problems:
        by_cat[p["类别"]].append(p)

    order = ["死链", "链接写法", "本机绝对路径", "疑似该归档", "手册"]
    for cat in order + [c for c in by_cat if c not in order]:
        items = by_cat.get(cat)
        if not items:
            continue
        print(f"\n【{cat}】{len(items)} 处")
        print("-" * 62)
        for p in items:
            print(f"  {p['文件']}:{p['行']}")
            print(f"     {p['说明']}")
            if p["原文"]:
                print(f"     原文：{p['原文']}")

    print(f"\n{'=' * 62}")
    print(f"合计 {len(problems)} 处待处理"
          + (f"（另有 {fixed} 处机械问题已自动修好）" if fixed else "") + "。")
    print("机械问题加 --fix 自动修；其余需人工判断。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
