#!/usr/bin/env python3
"""
Turn docs/plan/epics/*.md into GitHub labels, milestones, epic issues and child issues.

Usage:
  python3 scripts/create-issues.py                 # validate + dry run (prints the plan)
  python3 scripts/create-issues.py --graph         # print a Mermaid dependency graph of issues
  python3 scripts/create-issues.py --repo OWNER/REPO --apply

Requires: Python 3.9+ (stdlib only) and an authenticated `gh` CLI for --apply.
Idempotent: issues are matched by their ID prefix ("E6-04:") and are updated rather than duplicated.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan_lib import MILESTONES, ROOT, Epic, Issue, parse  # noqa: E402

MAP_FILE = ROOT / "docs" / "plan" / "issue-map.json"

LABEL_COLORS = {
    "epic": "5319e7",
    "agent-ready": "0e8a16",
    "needs-human": "d93f0b",
    "discovered": "fbca04",
    "a11y": "1d76db",
    "area:": "c5def5",
    "type:": "bfdadc",
    "size:": "ededed",
}
LABEL_DESCRIPTIONS = {
    "epic": "Parent issue grouping related work",
    "agent-ready": "Well-specified; a coding agent can pick this up once dependencies are closed",
    "needs-human": "Requires human judgment, sign-off or real-world action",
    "discovered": "Found while working another issue",
    "a11y": "Accessibility finding or improvement",
}


def validate(epics: list[Epic]) -> list[str]:
    errors: list[str] = []
    issues = {i.id: i for e in epics for i in e.issues}
    seen: set[str] = set()
    for e in epics:
        if e.milestone not in MILESTONES:
            errors.append(f"{e.id}: unknown epic milestone '{e.milestone}'")
        for i in e.issues:
            if i.id in seen:
                errors.append(f"{i.id}: duplicate ID")
            seen.add(i.id)
            if not i.id.startswith(e.id + "-"):
                errors.append(f"{i.id}: does not belong to epic {e.id}")
            if i.milestone not in MILESTONES:
                errors.append(f"{i.id}: unknown milestone '{i.milestone}'")
            if i.size not in {"S", "M", "L"}:
                errors.append(f"{i.id}: size must be S, M or L")
            if not i.criteria:
                errors.append(f"{i.id}: missing tagged acceptance criteria (`AC1` ...)")
            for d in i.depends:
                if d not in issues:
                    errors.append(f"{i.id}: depends on unknown issue {d}")
                elif MILESTONES and sorted(MILESTONES).index(issues[d].milestone) > sorted(MILESTONES).index(i.milestone):
                    errors.append(f"{i.id} ({i.milestone}) depends on {d} scheduled later ({issues[d].milestone})")
    # cycle detection
    state: dict[str, int] = {}

    def visit(n: str, stack: list[str]) -> None:
        if state.get(n) == 1:
            errors.append("dependency cycle: " + " -> ".join(stack + [n]))
            return
        if state.get(n) == 2 or n not in issues:
            return
        state[n] = 1
        for d in issues[n].depends:
            visit(d, stack + [n])
        state[n] = 2

    for n in issues:
        visit(n, [])
    return errors


def topo_order(epics: list[Epic]) -> list[Issue]:
    issues = {i.id: i for e in epics for i in e.issues}
    out: list[Issue] = []
    done: set[str] = set()

    def visit(n: str) -> None:
        if n in done:
            return
        done.add(n)
        for d in issues[n].depends:
            visit(d)
        out.append(issues[n])

    key = lambda i: (sorted(MILESTONES).index(i.milestone), int(i.epic[1:]), int(i.id.split("-")[1]))
    for i in sorted(issues.values(), key=key):
        visit(i.id)
    return out


def issue_labels(i: Issue) -> list[str]:
    labels = list(dict.fromkeys(i.labels + [f"size:{i.size}"]))
    if "needs-human" not in labels:
        labels.append("agent-ready")
    return labels


def render_issue_body(i: Issue, num: dict[str, int], epic_title: str) -> str:
    deps = ", ".join(f"#{num[d]} ({d})" if d in num else d for d in i.depends) or "none"
    head = (
        f"**Epic:** {('#' + str(num[i.epic])) if i.epic in num else i.epic} — {epic_title}  \n"
        f"**Blocked by:** {deps}  \n"
        f"**Size:** {i.size} · **Milestone:** {MILESTONES[i.milestone][0]}\n\n---\n\n"
    )
    foot = (
        f"\n\n---\n_Source: `{i.source}` ({i.id}). Edit the source file and re-run "
        f"`scripts/create-issues.py --apply` to update. Follow `AGENTS.md` and its Definition of Done._\n\n"
        f"_Verification: each `ACn` needs a passing test titled `[{i.id}.ACn] …`; `manual` ones need an entry in "
        f"`docs/evidence/{i.id}.md`. Check with `python3 scripts/ac-trace.py --issue {i.id}`._"
    )
    return head + i.body + foot


def render_epic_body(e: Epic, num: dict[str, int]) -> str:
    rows = "\n".join(
        f"- [ ] {('#' + str(num[i.id])) if i.id in num else i.id} {i.id}: {i.title} "
        f"(`{i.milestone}`, `{i.size}`)" for i in e.issues
    )
    return (
        f"{e.body}\n\n## Issues\n{rows}\n\n---\n_Source: `{e.source}`._"
    )


# ---------------------------------------------------------------- gh helpers
def gh(args: list[str], stdin: str | None = None, check: bool = True) -> str:
    r = subprocess.run(["gh", *args], input=stdin, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def ensure_labels(repo: str, epics: list[Epic]) -> None:
    names = {"epic", "agent-ready", "needs-human", "discovered", "a11y"}
    for e in epics:
        names.update(e.labels)
        for i in e.issues:
            names.update(issue_labels(i))
    for n in sorted(names):
        color = LABEL_COLORS.get(n) or next((c for p, c in LABEL_COLORS.items() if p.endswith(":") and n.startswith(p)), "ededed")
        args = ["label", "create", n, "--repo", repo, "--color", color, "--force"]
        if n in LABEL_DESCRIPTIONS:
            args += ["--description", LABEL_DESCRIPTIONS[n]]
        gh(args)
    print(f"labels: {len(names)} ensured")


def ensure_milestones(repo: str) -> None:
    existing = json.loads(gh(["api", f"repos/{repo}/milestones?state=all&per_page=100"]) or "[]")
    have = {m["title"] for m in existing}
    for title, desc in MILESTONES.values():
        if title not in have:
            gh(["api", f"repos/{repo}/milestones", "-f", f"title={title}", "-f", f"description={desc}"])
    print(f"milestones: {len(MILESTONES)} ensured")


def existing_issue_numbers(repo: str) -> dict[str, int]:
    data = json.loads(gh(["issue", "list", "--repo", repo, "--state", "all", "--limit", "1000", "--json", "number,title"]) or "[]")
    out: dict[str, int] = {}
    for it in data:
        m = re.match(r"^(E\d+(?:-\d+)?):", it["title"])
        if m:
            out[m.group(1)] = it["number"]
    return out


def create_or_update(repo: str, key: str, title: str, body: str, labels: list[str], milestone: str, num: dict[str, int]) -> None:
    full_title = f"{key}: {title}"
    if key in num:
        args = ["issue", "edit", str(num[key]), "--repo", repo, "--title", full_title, "--body-file", "-",
                "--milestone", milestone]
        for lb in labels:
            args += ["--add-label", lb]
        gh(args, stdin=body)
        print(f"  updated #{num[key]} {full_title}")
    else:
        args = ["issue", "create", "--repo", repo, "--title", full_title, "--body-file", "-", "--milestone", milestone]
        for lb in labels:
            args += ["--label", lb]
        url = gh(args, stdin=body)
        num[key] = int(url.rstrip("/").rsplit("/", 1)[1])
        print(f"  created #{num[key]} {full_title}")


def link_sub_issues(repo: str, epics: list[Epic], num: dict[str, int]) -> None:
    ok = fail = 0
    for e in epics:
        for i in e.issues:
            try:
                iid = gh(["api", f"repos/{repo}/issues/{num[i.id]}", "--jq", ".id"])
                r = subprocess.run(["gh", "api", "-X", "POST", f"repos/{repo}/issues/{num[e.id]}/sub_issues",
                                    "-F", f"sub_issue_id={iid}"], capture_output=True, text=True)
                if r.returncode == 0 or "already" in (r.stderr + r.stdout).lower():
                    ok += 1
                else:
                    fail += 1
            except RuntimeError:
                fail += 1
    print(f"sub-issues linked: {ok} ok, {fail} skipped/failed (task lists in epic bodies still track them)")


def apply(repo: str, epics: list[Epic]) -> None:
    ensure_labels(repo, epics)
    ensure_milestones(repo)
    num = existing_issue_numbers(repo)
    epic_titles = {e.id: e.title for e in epics}
    print("pass 1: epics")
    for e in epics:
        create_or_update(repo, e.id, e.title, render_epic_body(e, num), ["epic", *e.labels], MILESTONES[e.milestone][0], num)
    print("pass 2: issues (dependency order)")
    for i in topo_order(epics):
        create_or_update(repo, i.id, i.title, render_issue_body(i, num, epic_titles[i.epic]), issue_labels(i),
                         MILESTONES[i.milestone][0], num)
    print("pass 3: resolve cross-references")
    for e in epics:
        gh(["issue", "edit", str(num[e.id]), "--repo", repo, "--body-file", "-"], stdin=render_epic_body(e, num))
        for i in e.issues:
            gh(["issue", "edit", str(num[i.id]), "--repo", repo, "--body-file", "-"],
               stdin=render_issue_body(i, num, epic_titles[i.epic]))
    link_sub_issues(repo, epics, num)
    MAP_FILE.write_text(json.dumps(dict(sorted(num.items(), key=lambda kv: kv[1])), indent=2) + "\n")
    print(f"wrote {MAP_FILE.relative_to(ROOT)}")


def mermaid(epics: list[Epic]) -> str:
    lines = ["flowchart LR"]
    for e in epics:
        lines.append(f'  subgraph {e.id}["{e.id} · {e.title}"]')
        for i in e.issues:
            lines.append(f'    {i.id.replace("-", "_")}["{i.id}"]')
        lines.append("  end")
    for e in epics:
        for i in e.issues:
            for d in i.depends:
                lines.append(f'  {d.replace("-", "_")} --> {i.id.replace("-", "_")}')
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", help="OWNER/REPO")
    ap.add_argument("--apply", action="store_true", help="create/update on GitHub (default is dry run)")
    ap.add_argument("--graph", action="store_true", help="print Mermaid dependency graph and exit")
    a = ap.parse_args()

    epics = parse()
    errors = validate(epics)
    if errors:
        print("VALIDATION FAILED:", *errors, sep="\n  ")
        sys.exit(1)
    if a.graph:
        print(mermaid(epics))
        return
    total = sum(len(e.issues) for e in epics)
    print(f"OK: {len(epics)} epics, {total} issues, all dependencies resolve, no cycles\n")
    by_ms: dict[str, int] = {}
    for e in epics:
        for i in e.issues:
            by_ms[i.milestone] = by_ms.get(i.milestone, 0) + 1
    for m in sorted(MILESTONES):
        print(f"  {MILESTONES[m][0]:<28} {by_ms.get(m, 0):>3} issues")
    print()
    if not a.apply:
        for i in topo_order(epics):
            deps = ",".join(i.depends) or "-"
            print(f"  {i.milestone} {i.id:<7} [{i.size}] {i.title}  <- {deps}")
        print("\nDry run only. Re-run with --repo OWNER/REPO --apply to create issues.")
        return
    if not a.repo:
        sys.exit("--apply requires --repo OWNER/REPO")
    apply(a.repo, epics)


if __name__ == "__main__":
    main()
