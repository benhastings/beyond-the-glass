#!/usr/bin/env python3
"""
Turn docs/plan/epics/*.md into GitHub labels, milestones, epic issues and child issues.

Usage:
  python3 scripts/create-issues.py                 # validate + dry run (prints the plan)
  python3 scripts/create-issues.py --graph         # print a Mermaid dependency graph of issues
  python3 scripts/create-issues.py --repo OWNER/REPO --apply

Requires: Python 3.9+ (stdlib only) and an authenticated `gh` CLI for --apply (REST API only, via `gh api`).
Idempotent: issues are matched by their ID prefix ("E6-04:") and are updated rather than duplicated.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from urllib.parse import quote
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


# ---------------------------------------------------------------- GitHub REST helpers (via `gh api`; no GraphQL)
def api(method: str, path: str, data: dict | None = None, check: bool = True) -> object:
    args = ["gh", "api", "-X", method, path, "-H", "Accept: application/vnd.github+json"]
    if data is not None:
        args += ["--input", "-"]
    r = subprocess.run(args, input=json.dumps(data) if data is not None else None, capture_output=True, text=True)
    if r.returncode != 0:
        if check:
            raise RuntimeError(f"{method} {path} failed: {(r.stderr or r.stdout).strip()[:500]}")
        return None
    return json.loads(r.stdout) if r.stdout.strip() else {}


def api_pages(path: str) -> list:
    out: list = []
    page = 1
    while True:
        sep = "&" if "?" in path else "?"
        chunk = api("GET", f"{path}{sep}per_page=100&page={page}")
        if not chunk:
            return out
        out += chunk
        page += 1


def ensure_labels(repo: str, epics: list[Epic]) -> None:
    names = {"epic", "agent-ready", "needs-human", "discovered", "a11y"}
    for e in epics:
        names.update(e.labels)
        for i in e.issues:
            names.update(issue_labels(i))
    have = {lb["name"] for lb in api_pages(f"repos/{repo}/labels")}
    for n in sorted(names):
        color = LABEL_COLORS.get(n) or next((c for p, c in LABEL_COLORS.items() if p.endswith(":") and n.startswith(p)), "ededed")
        body = {"name": n, "color": color}
        if n in LABEL_DESCRIPTIONS:
            body["description"] = LABEL_DESCRIPTIONS[n]
        if n in have:
            api("PATCH", f"repos/{repo}/labels/{quote(n, safe='')}", {"color": color, **({"description": body["description"]} if "description" in body else {})})
        else:
            api("POST", f"repos/{repo}/labels", body)
    print(f"labels: {len(names)} ensured")


def ensure_milestones(repo: str) -> dict[str, int]:
    have = {m["title"]: m["number"] for m in api_pages(f"repos/{repo}/milestones?state=all")}
    for title, desc in MILESTONES.values():
        if title not in have:
            have[title] = api("POST", f"repos/{repo}/milestones", {"title": title, "description": desc})["number"]
    print(f"milestones: {len(MILESTONES)} ensured")
    return have


def existing_issue_numbers(repo: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in api_pages(f"repos/{repo}/issues?state=all"):
        if "pull_request" in it:
            continue
        m = re.match(r"^(E\d+(?:-\d+)?):", it["title"])
        if m:
            out[m.group(1)] = it["number"]
    return out


def create_or_update(repo: str, key: str, title: str, body: str, labels: list[str], milestone: int,
                     num: dict[str, int]) -> None:
    full_title = f"{key}: {title}"
    if key in num:
        api("PATCH", f"repos/{repo}/issues/{num[key]}", {"title": full_title, "body": body, "milestone": milestone})
        api("POST", f"repos/{repo}/issues/{num[key]}/labels", {"labels": labels})
        print(f"  updated #{num[key]} {full_title}")
    else:
        res = api("POST", f"repos/{repo}/issues", {"title": full_title, "body": body, "labels": labels, "milestone": milestone})
        num[key] = res["number"]
        print(f"  created #{num[key]} {full_title}")
        time.sleep(1)  # stay well under GitHub's content-creation rate limit


def link_sub_issues(repo: str, epics: list[Epic], num: dict[str, int]) -> None:
    ok = skipped = 0
    for e in epics:
        existing = {s["number"] for s in (api("GET", f"repos/{repo}/issues/{num[e.id]}/sub_issues?per_page=100", check=False) or [])}
        for i in e.issues:
            if num[i.id] in existing:
                ok += 1
                continue
            iid = api("GET", f"repos/{repo}/issues/{num[i.id]}")["id"]
            if api("POST", f"repos/{repo}/issues/{num[e.id]}/sub_issues", {"sub_issue_id": iid}, check=False) is None:
                skipped += 1
            else:
                ok += 1
    print(f"sub-issues linked: {ok} ok, {skipped} skipped (task lists in epic bodies still track them)")


def apply(repo: str, epics: list[Epic]) -> None:
    ensure_labels(repo, epics)
    ms = ensure_milestones(repo)
    num = existing_issue_numbers(repo)
    epic_titles = {e.id: e.title for e in epics}
    print("pass 1: epics")
    for e in epics:
        create_or_update(repo, e.id, e.title, render_epic_body(e, num), ["epic", *e.labels], ms[MILESTONES[e.milestone][0]], num)
    print("pass 2: issues (dependency order)")
    for i in topo_order(epics):
        create_or_update(repo, i.id, i.title, render_issue_body(i, num, epic_titles[i.epic]), issue_labels(i),
                         ms[MILESTONES[i.milestone][0]], num)
    print("pass 3: resolve cross-references")
    for e in epics:
        api("PATCH", f"repos/{repo}/issues/{num[e.id]}", {"body": render_epic_body(e, num)})
        for i in e.issues:
            api("PATCH", f"repos/{repo}/issues/{num[i.id]}", {"body": render_issue_body(i, num, epic_titles[i.epic])})
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
