"""Merging to main deploys to orderak.stingdev.pro (batch 37).

The owner's rule: once a change is merged, it must reach the server without
anyone running a deploy by hand. These hold the pipeline to the conditions
that make that safe:

  - It deploys only what passed CI, on main, one deploy at a time.
  - It reaches the server with its own key, not a person's, and the server
    lets that key run one command: receive a release. The host key is pinned.
  - The server checks the release before switching to it and goes back to the
    previous one when the new one does not answer its health check.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.test import SimpleTestCase

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"
RECEIVE = ROOT / "deploy" / "vps" / "receive-release.sh"
ENTRY = ROOT / "deploy" / "vps" / "deploy-entry.sh"


class WorkflowTests(SimpleTestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_runs_after_ci_passes_on_main(self):
        self.assertRegex(self.text, r"workflow_run:\s*\n\s*workflows: \[CI\]\s*\n\s*types: \[completed\]\s*\n\s*branches: \[main\]")
        self.assertIn("github.event.workflow_run.conclusion == 'success'", self.text)
        self.assertIn("github.event.workflow_run.event == 'push'", self.text)

    def test_deploys_the_commit_ci_checked(self):
        self.assertIn("ref: ${{ github.event.workflow_run.head_sha }}", self.text)

    def test_one_deploy_at_a_time_never_cancelled_halfway(self):
        self.assertRegex(self.text, r"concurrency:\s*\n\s*group: deploy-production\s*\n\s*cancel-in-progress: false")

    def test_uses_its_own_key_from_a_production_environment(self):
        self.assertIn("environment: production", self.text)
        self.assertIn("secrets.DEPLOY_SSH_KEY", self.text)
        self.assertIn("orderak-deploy@", self.text)
        self.assertNotIn("ubuntu@", self.text)

    def test_pins_the_server_host_key(self):
        self.assertRegex(self.text, r"57\.129\.162\.57 ssh-ed25519 AAAA[0-9A-Za-z+/=]+")
        self.assertIn("StrictHostKeyChecking=yes", self.text)
        self.assertNotIn("ssh-keyscan", self.text)
        self.assertNotIn("StrictHostKeyChecking=no", self.text)

    def test_builds_the_web_app_with_the_project_node(self):
        self.assertIn("node-version-file: .nvmrc", self.text)
        self.assertIn("npm run build", self.text)

    def test_checks_the_live_site_afterwards(self):
        self.assertIn("https://orderak.stingdev.pro/healthz", self.text)


class ServerScriptTests(SimpleTestCase):
    def test_the_key_can_only_hand_over_a_release(self):
        entry = ENTRY.read_text(encoding="utf-8")
        # The only command the key may ask for is "deploy <commit>".
        self.assertIn("SSH_ORIGINAL_COMMAND", entry)
        self.assertRegex(entry, r"\^deploy \[0-9a-f\]\{7,40\}\$")
        self.assertIn("exec sudo /opt/orderak/bin/receive-release", entry)

    def test_the_release_is_checked_then_switched_with_a_way_back(self):
        receive = RECEIVE.read_text(encoding="utf-8")
        self.assertRegex(receive, r"\[0-9a-f\]\{7,40\}")
        for step in ("migrate --noinput", "collectstatic --noinput", "createcachetable", "check --tag single_branch"):
            self.assertIn(step, receive)
        # Switched only after the checks, then rolled back if it does not answer.
        self.assertLess(receive.index("check --tag single_branch"), receive.index("ln -sfn"))
        self.assertRegex(receive, r"healthz")
        self.assertRegex(receive, r"rolling back")
        # Old releases do not fill the disk.
        self.assertRegex(receive, r"KEEP=\d+")

    def test_scripts_stop_at_the_first_error(self):
        for script in (RECEIVE, ENTRY):
            self.assertIn("set -euo pipefail", script.read_text(encoding="utf-8"), script.name)

    def test_validates_the_release_name_before_using_it(self):
        receive = RECEIVE.read_text(encoding="utf-8")
        self.assertTrue(re.search(r'if ! \[\[ "\$REL" =~', receive))


class ReleaseVenvTests(SimpleTestCase):
    """Each release brings its own packages (batch 50).

    Review of 10 October, F10: releases shared one venv, so a rollback switched
    the code back but kept the new release's packages. Each release now has
    its own venv, and the service runs the live release's.
    """

    def setUp(self):
        self.receive = RECEIVE.read_text(encoding="utf-8")
        self.unit = (ROOT / "deploy" / "vps" / "orderak-web.service").read_text(encoding="utf-8")

    def test_each_release_gets_its_own_venv(self):
        self.assertIn('python3.12 -m venv "$DIR/venv"', self.receive)
        self.assertIn('"$DIR/venv/bin/pip" install', self.receive)
        self.assertNotIn('"$BASE/venv/bin/pip"', self.receive)
        self.assertIn("$DIR/venv/bin/python manage.py", self.receive)

    def test_the_service_runs_the_live_release_s_venv(self):
        self.assertIn("ExecStart=/opt/orderak/current/venv/bin/gunicorn", self.unit)
        self.assertIn("WorkingDirectory=/opt/orderak/current/api", self.unit)

    def test_a_rollback_target_must_have_its_venv(self):
        self.assertRegex(self.receive, r'\[ -x "\$PREV/venv/bin/gunicorn" \]')
