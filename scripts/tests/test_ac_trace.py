"""Tests for scripts/ac-trace.py. Run: python3 -m unittest discover scripts/tests"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
spec = importlib.util.spec_from_file_location("ac_trace", HERE.parent / "ac-trace.py")
ac_trace = importlib.util.module_from_spec(spec)
sys.modules["ac_trace"] = ac_trace
spec.loader.exec_module(ac_trace)

EPIC = textwrap.dedent("""\
    # E1 · Demo epic
    <!-- epic: milestone=M0; labels=area:infra -->

    **Epic success criteria**
    - [ ] `SC1` Something holds overall

    ---

    ## E1-01 · First issue
    <!-- meta: milestone=M0; size=S; labels=type:chore; depends= -->

    **Acceptance criteria**
    - [ ] `AC1` Automated thing works
    - [ ] `AC2` `manual` Human signs off
""")


class Fixture:
    def __init__(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "docs/plan/epics").mkdir(parents=True)
        (self.root / "docs/plan/epics/E01-demo.md").write_text(EPIC)

    def write(self, rel: str, text: str) -> Path:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(textwrap.dedent(text))
        return p

    def run(self, *args: str) -> tuple[int, str]:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = ac_trace.main(list(args), root=self.root)
        return rc, buf.getvalue()

    def close(self) -> None:
        self.tmp.cleanup()


class AcTraceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.f = Fixture()

    def tearDown(self) -> None:
        self.f.close()

    def test_untraced_issue_fails_strict(self) -> None:
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 1)
        self.assertIn("E1-01.AC1", out)
        self.assertIn("E1-01.AC2", out)

    def test_summary_mode_never_fails_on_gaps(self) -> None:
        rc, out = self.f.run()
        self.assertEqual(rc, 0)
        self.assertIn("0/3 criteria traced", out)

    def test_test_and_evidence_trace_issue(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nApproved in PR #4 by Ben.\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 0, out)

    def test_skipped_test_does_not_count(self) -> None:
        self.f.write("src/a.test.ts", "it.skip('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 1)
        self.assertIn("skipped", out)

    def test_empty_evidence_does_not_count(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\n<!-- fill me in -->\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 1)
        self.assertIn("empty", out)

    def test_unknown_tag_fails_even_in_summary_mode(self) -> None:
        self.f.write("e2e/x.spec.ts", "test('[E1-01.AC9] typo', async () => {})\n")
        rc, out = self.f.run()
        self.assertEqual(rc, 1)
        self.assertIn("E1-01.AC9", out)

    def test_junit_failure_untraces(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", """\
            <testsuites><testsuite name="s">
              <testcase classname="a" name="[E1-01.AC1] works"><failure message="boom"/></testcase>
            </testsuite></testsuites>""")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 1)
        self.assertIn("failed", out)

    def test_junit_pass_traces(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", """\
            <testsuites><testsuite name="s">
              <testcase classname="a" name="[E1-01.AC1] works"/>
            </testsuite></testsuites>""")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 0, out)

    def test_junit_skipped_only_untraces(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", """\
            <testsuites><testsuite name="s">
              <testcase classname="a" name="[E1-01.AC1] works"><skipped/></testcase>
            </testsuite></testsuites>""")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 1)
        self.assertIn("skipped in this run", out)

    def test_junit_skipped_in_one_project_passed_in_another_traces(self) -> None:
        self.f.write("e2e/a.spec.ts", "test('[E1-01.AC1] works', async () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", """\
            <testsuites><testsuite name="s">
              <testcase classname="a" name="chromium [E1-01.AC1] works"/>
              <testcase classname="a" name="firefox [E1-01.AC1] works"><skipped/></testcase>
            </testsuite></testsuites>""")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 0, out)

    def test_junit_failure_in_any_project_untraces(self) -> None:
        self.f.write("e2e/a.spec.ts", "test('[E1-01.AC1] works', async () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", """\
            <testsuites><testsuite name="s">
              <testcase classname="a" name="chromium [E1-01.AC1] works"/>
              <testcase classname="a" name="webkit [E1-01.AC1] works"><failure message="x"/></testcase>
            </testsuite></testsuites>""")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 1)
        self.assertIn("failed", out)

    def test_actest_helper_tags_are_found(self) -> None:
        self.f.write("src/a.test.ts", "acTest('E1-01.AC1', 'works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 0, out)

    def test_actest_helper_with_several_tags(self) -> None:
        self.f.write("src/a.test.ts", "acTest(['E1-01.AC1', 'E1.SC1'], 'works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        rc, out = self.f.run("--strict-all")
        self.assertEqual(rc, 0, out)

    def test_actest_skip_does_not_count(self) -> None:
        self.f.write("src/a.test.ts", "acTest.skip('E1-01.AC1', 'works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertEqual(rc, 1)
        self.assertIn("skipped", out)

    def test_actest_unknown_tag_fails(self) -> None:
        self.f.write("src/a.test.ts", "acTest('E1-01.AC7', 'typo', () => {})\n")
        rc, out = self.f.run()
        self.assertEqual(rc, 1)
        self.assertIn("E1-01.AC7", out)

    def test_junit_missing_run_untraces(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        junit = self.f.write("reports/j.xml", "<testsuites><testsuite name='s'/></testsuites>")
        rc, out = self.f.run("--issue", "E1-01", "--junit", str(junit))
        self.assertEqual(rc, 1)
        self.assertIn("did not run", out)

    def test_strict_all_includes_epic_success_criteria(self) -> None:
        self.f.write("src/a.test.ts", "it('[E1-01.AC1] works', () => {})\n")
        self.f.write("docs/evidence/E1-01.md", "## E1-01.AC2\nok\n")
        rc, out = self.f.run("--strict-all")
        self.assertEqual(rc, 1)
        self.assertIn("E1.SC1", out)
        self.f.write("e2e/epic.spec.ts", "test('[E1.SC1] holds', async () => {})\n")
        rc, out = self.f.run("--strict-all")
        self.assertEqual(rc, 0, out)

    def test_node_modules_ignored(self) -> None:
        self.f.write("node_modules/pkg/a.test.ts", "it('[E1-01.AC1] fake', () => {})\n")
        rc, out = self.f.run("--issue", "E1-01")
        self.assertIn("needs a test", out)

    def test_report_written(self) -> None:
        out_path = self.f.root / "docs/plan/AC-TRACEABILITY.md"
        rc, _ = self.f.run("--report", str(out_path))
        self.assertEqual(rc, 0)
        text = out_path.read_text()
        self.assertIn("`E1-01.AC2` | manual", text)
        self.assertIn("M0 · Foundations", text)


class RealPlanTests(unittest.TestCase):
    """Guards on the real plan in this repo."""

    def test_every_issue_has_tagged_acceptance_criteria(self) -> None:
        from plan_lib import parse
        epics = parse()
        for e in epics:
            for i in e.issues:
                self.assertTrue(i.criteria, f"{i.id} has no tagged acceptance criteria")
                nums = [c.n for c in i.criteria]
                self.assertEqual(nums, list(range(1, len(nums) + 1)), f"{i.id} AC numbering has gaps")

    def test_every_untagged_checkbox_is_intentional(self) -> None:
        import re
        from plan_lib import EPIC_DIR
        for f in EPIC_DIR.glob("E*.md"):
            mode = None
            for ln in f.read_text().splitlines():
                if ln.strip() in ("**Acceptance criteria**", "**Epic success criteria**"):
                    mode = ln
                elif ln.strip() and not ln.startswith("- ["):
                    mode = None
                if mode and ln.startswith("- ["):
                    self.assertRegex(ln, r"^- \[ \] `(AC|SC)\d+`", f"{f.name}: untagged criterion: {ln[:80]}")


if __name__ == "__main__":
    unittest.main()
