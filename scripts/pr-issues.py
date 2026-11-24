#!/usr/bin/env python3
"""
Prints the plan IDs (E6-04 ...) of the issues a PR body closes, space-separated.

Reads the body from the PR_BODY environment variable, finds "Closes #n" / "Fixes #n" / "Resolves #n"
(GitHub's closing keywords), and maps #n to its plan ID with docs/plan/issue-map.json. Epic issues and
numbers that aren't in the plan are ignored. Stdlib only.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

CLOSES = re.compile(r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b")


def issue_ids(body: str, issue_map: dict[str, int]) -> list[str]:
    by_number = {n: plan_id for plan_id, n in issue_map.items()}
    numbers = {int(n) for n in CLOSES.findall(body)}
    return sorted(by_number[n] for n in numbers if n in by_number and "-" in by_number[n])


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    issue_map = json.loads((root / "docs/plan/issue-map.json").read_text())
    print(" ".join(issue_ids(os.environ.get("PR_BODY", ""), issue_map)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
