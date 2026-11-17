"""Shared parser for docs/plan/epics/*.md (stdlib only).

Format (see any epic file):
  # E6 · Epic title
  <!-- epic: milestone=M2; labels=area:sim -->
  ...epic body, including **Epic success criteria** with `SC<n>` items...
  ## E6-04 · Issue title
  <!-- meta: milestone=M1; size=M; labels=area:sim,type:feature; depends=E6-01 -->
  ...issue body, ending with **Acceptance criteria** whose items look like:
  - [ ] `AC1` text                 (verified by a tagged automated test)
  - [ ] `AC2` `manual` text        (verified by an evidence entry in docs/evidence/E6-04.md)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPIC_DIR = ROOT / "docs" / "plan" / "epics"

MILESTONES = {
    "M0": ("M0 · Foundations", "Repo, CI, Pages deploy, container build, guardrails, design direction"),
    "M1": ("M1 · Walking Skeleton", "Overview → quiz → path → one lesson with a terminal challenge → resume, on the deployed site"),
    "M2": ("M2 · Core Engines", "Simulator, content engine, design system and terminal ready for authors"),
    "M3": ("M3 · Foundations Trails", "Console Room, Harbor, Helm Keep and Chartroom content"),
    "M4": ("M4 · GitOps & Signals", "Mirror Lake and Signalwood simulations and content"),
    "M5": ("M5 · Capstone", "The Long Night, playable end to end with debrief"),
    "M6": ("M6 · Pilot & Launch", "Audited, performant, documented and piloted"),
}

EPIC_HEADER = re.compile(r"^# (E\d+) · (.+)$", re.M)
ISSUE_HEADER = re.compile(r"^## (E\d+-\d+) · (.+)$", re.M)
META = re.compile(r"<!--\s*(epic|meta):\s*(.*?)\s*-->")
CRITERION = re.compile(r"^- \[[ xX]\] `(AC|SC)(\d+)`(\s+`manual`)?\s+(.*)$", re.M)


@dataclass
class Criterion:
    owner: str        # "E6-04" for issue ACs, "E6" for epic SCs
    kind: str         # "AC" or "SC"
    n: int
    manual: bool
    text: str

    @property
    def tag(self) -> str:
        return f"{self.owner}.{self.kind}{self.n}"


@dataclass
class Issue:
    id: str
    title: str
    epic: str
    milestone: str
    size: str
    labels: list[str]
    depends: list[str]
    body: str
    source: str
    criteria: list[Criterion] = field(default_factory=list)


@dataclass
class Epic:
    id: str
    title: str
    milestone: str
    labels: list[str]
    body: str
    source: str
    issues: list[Issue] = field(default_factory=list)
    criteria: list[Criterion] = field(default_factory=list)


def _meta(text: str) -> dict[str, str]:
    m = META.search(text)
    if not m:
        return {}
    kv: dict[str, str] = {}
    for part in m.group(2).split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            kv[k.strip()] = v.strip()
    return kv


def _list(v: str) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()]


def _strip(text: str) -> str:
    return META.sub("", text, count=1).strip().rstrip("-").strip()


def _criteria(owner: str, body: str, kind: str) -> list[Criterion]:
    return [Criterion(owner, k, int(n), bool(man), txt.strip())
            for k, n, man, txt in CRITERION.findall(body) if k == kind]


def parse(epic_dir: Path = EPIC_DIR) -> list[Epic]:
    epics: list[Epic] = []
    for path in sorted(epic_dir.glob("E*.md")):
        text = path.read_text(encoding="utf-8")
        try:
            rel = str(path.relative_to(ROOT))
        except ValueError:
            rel = str(path)
        em = EPIC_HEADER.search(text)
        if not em:
            raise SystemExit(f"{rel}: missing '# E<n> · Title' header")
        heads = list(ISSUE_HEADER.finditer(text))
        epic_block = text[em.end():heads[0].start() if heads else len(text)]
        emeta = _meta(epic_block)
        epic = Epic(em.group(1), em.group(2).strip(), emeta.get("milestone", ""),
                    _list(emeta.get("labels", "")), _strip(epic_block), rel)
        epic.criteria = _criteria(epic.id, epic.body, "SC")
        for i, h in enumerate(heads):
            block = text[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(text)]
            meta = _meta(block)
            body = _strip(block)
            issue = Issue(h.group(1), h.group(2).strip(), epic.id, meta.get("milestone", epic.milestone),
                          meta.get("size", ""), _list(meta.get("labels", "")), _list(meta.get("depends", "")),
                          body, rel)
            ac_section = body.split("**Acceptance criteria**", 1)[1] if "**Acceptance criteria**" in body else ""
            issue.criteria = _criteria(issue.id, ac_section, "AC")
            epic.issues.append(issue)
        epics.append(epic)
    return epics


def all_issues(epics: list[Epic]) -> dict[str, Issue]:
    return {i.id: i for e in epics for i in e.issues}
