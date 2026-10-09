"""Orderak watches itself and keeps a copy off the server (batch 39).

Live since batch 37, Orderak had no check that it was up, and its nightly
backups stayed on the server they back up. The other sites on the same
machine have both; this holds Orderak's to the same standard:

  - Every five minutes a check reads the service, the site as Caddy reaches
    it and as a visitor does, and the age of both backups. A failure sends
    one Telegram alert (through the server's existing alert script, its
    secrets untouched), a reminder each hour while it lasts, and a message
    when it is over.
  - Every night the backups go, encrypted with restic, to the same R2 bucket
    as Vezano's but a repository of their own, with their own password; old
    snapshots are thinned to 14 daily, 8 weekly and 12 monthly.
"""
from __future__ import annotations

from pathlib import Path

from django.test import SimpleTestCase

VPS = Path(__file__).resolve().parents[2] / "deploy" / "vps"


def read(name: str) -> str:
    return (VPS / name).read_text(encoding="utf-8")


class HealthCheckTests(SimpleTestCase):
    def setUp(self):
        self.script = read("orderak-healthcheck.sh")

    def test_reads_the_service_the_site_and_both_backups(self):
        self.assertIn("systemctl is-active --quiet orderak-web", self.script)
        self.assertIn("http://127.0.0.1:8200/healthz", self.script)
        self.assertIn("https://orderak.stingdev.pro/healthz", self.script)
        self.assertIn("/srv/backups/orderak", self.script)
        self.assertIn("/var/lib/orderak/offsite-backup.last-success", self.script)

    def test_alerts_through_the_existing_script_named_as_orderak(self):
        self.assertIn("/usr/local/sbin/vezano-telegram-alert", self.script)
        self.assertNotIn("/etc/vezano/telegram", self.script)
        self.assertRegex(self.script, r'alert "Orderak')

    def test_alerts_once_reminds_hourly_and_says_when_it_is_over(self):
        self.assertIn("STATE_FILE", self.script)
        self.assertRegex(self.script, r"REMIND_AFTER=3600")
        self.assertRegex(self.script, r"recovered|عاد")

    def test_runs_every_five_minutes_hardened(self):
        timer = read("orderak-healthcheck.timer")
        self.assertIn("OnUnitActiveSec=5min", timer)
        service = read("orderak-healthcheck.service")
        self.assertIn("ProtectSystem=strict", service)
        self.assertIn("ReadWritePaths=/var/lib/orderak", service)


class OffsiteBackupTests(SimpleTestCase):
    def setUp(self):
        self.service = read("orderak-offsite-backup.service")

    def test_sends_the_nightly_backups_encrypted_to_their_own_repository(self):
        self.assertIn("EnvironmentFile=/etc/orderak/restic/r2.env", self.service)
        self.assertIn("restic backup /srv/backups/orderak", self.service)
        self.assertIn("--tag orderak-production", self.service)

    def test_thins_old_snapshots(self):
        self.assertRegex(self.service, r"restic forget[\s\S]*--keep-daily 14[\s\S]*--keep-weekly 8[\s\S]*--keep-monthly 12[\s\S]*--prune")

    def test_records_success_for_the_health_check(self):
        self.assertIn("ExecStartPost=/usr/bin/touch /var/lib/orderak/offsite-backup.last-success", self.service)

    def test_runs_nightly_after_the_local_backup(self):
        timer = read("orderak-offsite-backup.timer")
        self.assertIn("OnCalendar=*-*-* 04:20:00", timer)  # the local one is 03:50
        self.assertIn("Persistent=true", timer)
