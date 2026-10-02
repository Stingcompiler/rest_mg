"""While branch isolation (review finding F02) is unfinished, a second branch
cannot be created.

Records are not yet scoped to their branch on every read and write, so the
system is only safe with one branch in the database. ``SINGLE_BRANCH`` (on by
default) turns that assumption into a rule: creating a second branch — from the
admin, a management command or a shell — is refused, and a check that runs
after migrations on deploy fails if a database already holds more than one.
Inactive branches count: their records are just as reachable.

The rest of the suite runs with ``SINGLE_BRANCH=False`` because several tests
need two branches.
"""
from __future__ import annotations

from django.core.checks import run_checks
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings

from apps.core.models import Branch
from tests.factories import make_branch


@override_settings(SINGLE_BRANCH=True)
class SingleBranchGuardTests(TestCase):
    def test_the_first_branch_can_be_created(self):
        make_branch()
        self.assertEqual(Branch.objects.count(), 1)

    def test_a_second_branch_is_refused(self):
        make_branch()
        with self.assertRaises(ValidationError):
            make_branch(name_ar="فرع ثانٍ")
        self.assertEqual(Branch.objects.count(), 1)

    def test_an_inactive_branch_still_counts(self):
        make_branch(is_active=False)
        with self.assertRaises(ValidationError):
            make_branch(name_ar="فرع ثانٍ")

    def test_the_existing_branch_can_still_be_edited(self):
        branch = make_branch()
        branch.name_ar = "اسم جديد"
        branch.save()
        self.assertEqual(Branch.objects.get().name_ar, "اسم جديد")


class SingleBranchCheckTests(TestCase):
    def errors(self):
        return [m for m in run_checks(tags=["single_branch"]) if m.id == "core.E001"]

    def test_one_branch_passes(self):
        make_branch()
        with self.settings(SINGLE_BRANCH=True):
            self.assertEqual(self.errors(), [])

    def test_a_database_with_two_branches_fails_the_check(self):
        make_branch()
        make_branch(name_ar="فرع ثانٍ", is_active=False)
        with self.settings(SINGLE_BRANCH=True):
            self.assertEqual(len(self.errors()), 1)

    def test_the_check_is_off_when_several_branches_are_allowed(self):
        make_branch()
        make_branch(name_ar="فرع ثانٍ")
        with self.settings(SINGLE_BRANCH=False):
            self.assertEqual(self.errors(), [])
