#!/usr/bin/env python3
"""
Acceptance-criteria traceability: proves every criterion in docs/plan/epics/ is verified.

  automated criterion  (e.g. E6-04.AC2)  -> a test whose title contains "[E6-04.AC2]"
                                           that is not skipped and, when JUnit results
                                           are supplied, ran and passed
  manual criterion     (`manual` marker) -> docs/evidence/E6-04.md has a heading
                                           "## E6-04.AC2" followed by non-empty evidence

Usage:
  python3 scripts/ac-trace.py                         # summary for the whole plan (never fails on gaps)
  python3 scripts/ac-trace.py --report out.md         # also write a markdown matrix
  python3 scripts/ac-trace.py --issue E6-04 E6-05     # strict: fail if any AC of these issues is untraced
  python3 scripts/ac-trace.py --strict-all            # strict for every AC and SC (launch gate)
  ... --junit reports/vitest.xml reports/playwright.xml   # count only tests that ran and passed

Always fails on tags that reference criteria that don't exist (typos, stale IDs).
Stdlib only.
"""
from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan_lib import MILESTONES, ROOT, Criterion, Epic, parse  # noqa: E402

TAG = re.compile(r"\[(E\d+-\d+\.AC\d+|E\d+\.SC\d+)\]")
# acTest('E6-04.AC2', ...) and acTest(['E6-04.AC2', 'E6.SC1'], ...): quoted tags on the acTest line
AC_TEST = re.compile(r"\bacTest(?:\.\w+)?\(")
QUOTED_TAG = re.compile(r"""['"`](E\d+-\d+\.AC\d+|E\d+\.SC\d+)['"`]""")
TEST_GLOBS = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/*.test.js",
              "**/*.test.mjs", "**/*.spec.js", "**/test_*.py"]
SKIP_DIRS = {"node_modules", "dist", ".git", "coverage", "playwright-report", "test-results"}
SKIP_PREFIXES = ("scripts/tests/",)  # the tracer's own fixtures contain example tags
SKIP_MARK = re.compile(r"\b(?:it|test|describe|acTest)\.(?:skip|todo|fixme)\b|\bxit\(|\bxdescribe\(|@unittest\.skip")
EVIDENCE_HEAD = re.compile(r"^##\s+(E\d+-\d+\.AC\d+|E\d+\.SC\d+)\s*$", re.M)


@dataclass
class Scan:
    tested: dict[str, list[str]] = field(default_factory=dict)   # tag -> ["file:line"]
    skipped: dict[str, list[str]] = field(default_factory=dict)
    evidence: dict[str, str] = field(default_factory=dict)       # tag -> "file"
    empty_evidence: set[str] = field(default_factory=set)
    passed: set[str] | None = None                               # tags that passed per JUnit (None = no JUnit given)
    failed: set[str] = field(default_factory=set)                # a tagged test failed or errored
    skipped_run: set[str] = field(default_factory=set)           # a tagged test was skipped in the run


def _test_files(root: Path) -> list[Path]:
    seen: set[Path] = set()
    for g in TEST_GLOBS:
        for p in root.glob(g):
            rel = p.relative_to(root)
            if p.is_file() and not (set(rel.parts) & SKIP_DIRS) and not str(rel).startswith(SKIP_PREFIXES):
                seen.add(p)
    return sorted(seen)


def scan(root: Path, junit: list[Path]) -> Scan:
    s = Scan()
    for f in _test_files(root):
        rel = str(f.relative_to(root))
        for no, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            tags = TAG.findall(line) + (QUOTED_TAG.findall(line) if AC_TEST.search(line) else [])
            for tag in dict.fromkeys(tags):
                bucket = s.skipped if SKIP_MARK.search(line) else s.tested
                bucket.setdefault(tag, []).append(f"{rel}:{no}")
    ev_dir = root / "docs" / "evidence"
    if ev_dir.is_dir():
        for f in sorted(x for x in ev_dir.glob("*.md") if x.name.lower() != "readme.md"):
            text = f.read_text(encoding="utf-8")
            heads = list(EVIDENCE_HEAD.finditer(text))
            for i, h in enumerate(heads):
                body = text[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(text)]
                body = re.sub(r"<!--.*?-->", "", body, flags=re.S).strip()
                if body:
                    s.evidence[h.group(1)] = str(f.relative_to(root))
                else:
                    s.empty_evidence.add(h.group(1))
    if junit:
        s.passed = set()
        for path in junit:
            for tc in ET.parse(path).getroot().iter("testcase"):
                name = (tc.get("classname") or "") + " " + (tc.get("name") or "")
                kids = {child.tag for child in tc}
                for tag in TAG.findall(name):
                    if kids & {"failure", "error"}:
                        s.failed.add(tag)
                    elif "skipped" in kids:
                        # Neutral: e.g. a test that runs in one browser and skips in the others. It
                        # still needs a passing run somewhere to count.
                        s.skipped_run.add(tag)
                    else:
                        s.passed.add(tag)
        s.passed -= s.failed
    return s


def status(c: Criterion, s: Scan) -> tuple[str, str]:
    """Returns (state, detail) where state is traced | untraced."""
    if c.manual:
        if c.tag in s.evidence:
            return "traced", f"evidence: {s.evidence[c.tag]}"
        if c.tag in s.empty_evidence:
            return "untraced", "evidence heading present but empty"
        return "untraced", f"needs evidence in docs/evidence/{c.owner}.md under '## {c.tag}'"
    if c.tag in s.tested:
        if s.passed is not None:
            if c.tag in s.failed:
                return "untraced", "tagged test failed in this run"
            if c.tag not in s.passed:
                if c.tag in s.skipped_run:
                    return "untraced", "tagged test was skipped in this run and never passed"
                return "untraced", "tagged test did not run in this run's JUnit results"
        return "traced", "test: " + ", ".join(s.tested[c.tag][:3])
    if c.tag in s.skipped:
        return "untraced", "tagged test is skipped: " + ", ".join(s.skipped[c.tag][:3])
    return "untraced", f"needs a test titled '[{c.tag}] …'"


def criteria(epics: list[Epic]) -> list[Criterion]:
    out: list[Criterion] = []
    for e in epics:
        out += e.criteria
        for i in e.issues:
            out += i.criteria
    return out


def unknown_tags(all_c: list[Criterion], s: Scan) -> list[str]:
    known = {c.tag for c in all_c}
    refs = {t: v for t, v in {**s.tested, **s.skipped}.items()}
    msgs = [f"{t} (in {', '.join(v[:3])})" for t, v in sorted(refs.items()) if t not in known]
    msgs += [f"{t} (in {s.evidence[t]})" for t in sorted(s.evidence) if t not in known]
    msgs += [f"{t} (empty evidence heading)" for t in sorted(s.empty_evidence) if t not in known]
    manual_tested = [c.tag for c in all_c if not c.manual and c.tag in s.evidence and c.tag not in s.tested]
    msgs += [f"{t} is automated but only has evidence; add a tagged test (or mark it `manual` in the plan)" for t in manual_tested]
    return msgs


def report(epics: list[Epic], s: Scan) -> str:
    lines = ["# Acceptance-criteria traceability", "",
             "Generated by `python3 scripts/ac-trace.py --report`. Do not edit by hand.", "",
             "| Milestone | Traced | Total | % |", "|---|---:|---:|---:|"]
    by_ms: dict[str, list[int]] = {}
    for e in epics:
        for i in e.issues:
            t = by_ms.setdefault(i.milestone, [0, 0])
            for c in i.criteria:
                t[1] += 1
                t[0] += status(c, s)[0] == "traced"
    for m in sorted(by_ms):
        t, n = by_ms[m]
        lines.append(f"| {MILESTONES[m][0]} | {t} | {n} | {100 * t // max(n, 1)}% |")
    lines += ["", "| Epic | Traced | Total | % |", "|---|---:|---:|---:|"]
    for e in epics:
        cs = e.criteria + [c for i in e.issues for c in i.criteria]
        t = sum(status(c, s)[0] == "traced" for c in cs)
        lines.append(f"| {e.id} · {e.title} | {t} | {len(cs)} | {100 * t // max(len(cs), 1)}% |")
    for e in epics:
        lines += ["", f"## {e.id} · {e.title}", "", "| Criterion | Type | Status | Detail |", "|---|---|---|---|"]
        for c in e.criteria + [c for i in e.issues for c in i.criteria]:
            st, detail = status(c, s)
            icon = "✅" if st == "traced" else "⬜"
            lines.append(f"| `{c.tag}` | {'manual' if c.manual else 'test'} | {icon} | {detail} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--issue", nargs="*", default=[], help="issue IDs to check strictly (e.g. E6-04)")
    ap.add_argument("--strict-all", action="store_true", help="every AC and SC must be traced")
    ap.add_argument("--junit", nargs="*", default=[], type=Path, help="JUnit XML files from this CI run")
    ap.add_argument("--report", type=Path, help="write the markdown matrix to this path")
    a = ap.parse_args(argv)

    epics = parse(root / "docs" / "plan" / "epics")
    all_c = criteria(epics)
    s = scan(root, a.junit)
    rc = 0

    bad = unknown_tags(all_c, s)
    if bad:
        print("Tags that don't match any criterion in the plan:", *bad, sep="\n  ")
        rc = 1

    traced = sum(status(c, s)[0] == "traced" for c in all_c)
    print(f"{traced}/{len(all_c)} criteria traced "
          f"({sum(c.manual for c in all_c)} manual, {sum(not c.manual for c in all_c)} automated)")

    if a.report:
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text(report(epics, s), encoding="utf-8")
        print(f"wrote {a.report}")

    targets: list[Criterion] = []
    if a.strict_all:
        targets = all_c
    elif a.issue:
        known = {i.id for e in epics for i in e.issues}
        for iid in a.issue:
            if iid not in known:
                print(f"unknown issue {iid}")
                rc = 1
        targets = [c for c in all_c if c.kind == "AC" and c.owner in a.issue]
    missing = [(c, status(c, s)[1]) for c in targets if status(c, s)[0] != "traced"]
    if missing:
        print(f"\nUNTRACED ({len(missing)}):")
        for c, why in missing:
            print(f"  {c.tag:<14} {why}\n  {'':<14} └ {c.text[:110]}")
        rc = 1
    elif targets:
        print(f"All {len(targets)} targeted criteria are traced.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
