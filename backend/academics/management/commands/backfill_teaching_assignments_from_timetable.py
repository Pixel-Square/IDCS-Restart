from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction


@dataclass(frozen=True)
class _Stats:
    scanned: int = 0
    eligible: int = 0
    created: int = 0
    existed: int = 0
    skipped_no_staff: int = 0
    skipped_no_curriculum: int = 0
    skipped_no_section: int = 0
    skipped_no_academic_year: int = 0


class Command(BaseCommand):
    help = (
        "Backfill academics.TeachingAssignment rows using timetable.TimetableAssignment. "
        "Useful when staff see 'No courses found' because TeachingAssignments were never created, "
        "but the timetable already has staff+section+subject mappings."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Compute what would be created, but do not write to the database.",
        )
        parser.add_argument(
            "--academic-year-id",
            type=int,
            default=None,
            help="AcademicYear ID to use when a timetable row does not provide one (defaults to active AcademicYear).",
        )
        parser.add_argument(
            "--include-inactive-staff",
            action="store_true",
            help="Include timetable assignments for staff whose StaffProfile.status is not ACTIVE.",
        )

    def handle(self, *args, **options):
        from academics.models import AcademicYear, TeachingAssignment
        from timetable.models import TimetableAssignment

        dry_run: bool = bool(options["dry_run"])
        academic_year_id: Optional[int] = options.get("academic_year_id")
        include_inactive_staff: bool = bool(options["include_inactive_staff"])

        fallback_ay = None
        if academic_year_id:
            fallback_ay = AcademicYear.objects.filter(pk=academic_year_id).first()
            if not fallback_ay:
                raise Exception(f"AcademicYear {academic_year_id} not found")
        else:
            fallback_ay = AcademicYear.objects.filter(is_active=True).first()

        stats = _Stats()

        qs = (
            TimetableAssignment.objects.select_related(
                "staff",
                "section",
                "curriculum_row",
                "subject_batch",
                "subject_batch__curriculum_row",
                "subject_batch__academic_year",
            )
            .all()
        )

        seen_keys: set[tuple[int, int, int, int]] = set()

        # Iterate deterministically to make dry-run output stable.
        qs = qs.order_by("id")

        for tt in qs.iterator(chunk_size=2000):
            stats = _Stats(
                scanned=stats.scanned + 1,
                eligible=stats.eligible,
                created=stats.created,
                existed=stats.existed,
                skipped_no_staff=stats.skipped_no_staff,
                skipped_no_curriculum=stats.skipped_no_curriculum,
                skipped_no_section=stats.skipped_no_section,
                skipped_no_academic_year=stats.skipped_no_academic_year,
            )

            staff = getattr(tt, "staff", None)
            if staff is None:
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed,
                    skipped_no_staff=stats.skipped_no_staff + 1,
                    skipped_no_curriculum=stats.skipped_no_curriculum,
                    skipped_no_section=stats.skipped_no_section,
                    skipped_no_academic_year=stats.skipped_no_academic_year,
                )
                continue

            if (not include_inactive_staff) and getattr(staff, "status", "ACTIVE") != "ACTIVE":
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed,
                    skipped_no_staff=stats.skipped_no_staff + 1,
                    skipped_no_curriculum=stats.skipped_no_curriculum,
                    skipped_no_section=stats.skipped_no_section,
                    skipped_no_academic_year=stats.skipped_no_academic_year,
                )
                continue

            section = getattr(tt, "section", None)
            if section is None:
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed,
                    skipped_no_staff=stats.skipped_no_staff,
                    skipped_no_curriculum=stats.skipped_no_curriculum,
                    skipped_no_section=stats.skipped_no_section + 1,
                    skipped_no_academic_year=stats.skipped_no_academic_year,
                )
                continue

            curriculum_row = getattr(tt, "curriculum_row", None)
            subject_batch = getattr(tt, "subject_batch", None)
            if curriculum_row is None and subject_batch is not None:
                curriculum_row = getattr(subject_batch, "curriculum_row", None)

            if curriculum_row is None:
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed,
                    skipped_no_staff=stats.skipped_no_staff,
                    skipped_no_curriculum=stats.skipped_no_curriculum + 1,
                    skipped_no_section=stats.skipped_no_section,
                    skipped_no_academic_year=stats.skipped_no_academic_year,
                )
                continue

            ay = getattr(subject_batch, "academic_year", None) if subject_batch is not None else None
            ay = ay or fallback_ay
            if ay is None:
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed,
                    skipped_no_staff=stats.skipped_no_staff,
                    skipped_no_curriculum=stats.skipped_no_curriculum,
                    skipped_no_section=stats.skipped_no_section,
                    skipped_no_academic_year=stats.skipped_no_academic_year + 1,
                )
                continue

            key = (staff.pk, section.pk, curriculum_row.pk, ay.pk)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            stats = _Stats(
                scanned=stats.scanned,
                eligible=stats.eligible + 1,
                created=stats.created,
                existed=stats.existed,
                skipped_no_staff=stats.skipped_no_staff,
                skipped_no_curriculum=stats.skipped_no_curriculum,
                skipped_no_section=stats.skipped_no_section,
                skipped_no_academic_year=stats.skipped_no_academic_year,
            )

            if dry_run:
                continue

            try:
                with transaction.atomic():
                    obj, created = TeachingAssignment.objects.get_or_create(
                        staff=staff,
                        curriculum_row=curriculum_row,
                        section=section,
                        academic_year=ay,
                        defaults={"is_active": True},
                    )
                if created:
                    stats = _Stats(
                        scanned=stats.scanned,
                        eligible=stats.eligible,
                        created=stats.created + 1,
                        existed=stats.existed,
                        skipped_no_staff=stats.skipped_no_staff,
                        skipped_no_curriculum=stats.skipped_no_curriculum,
                        skipped_no_section=stats.skipped_no_section,
                        skipped_no_academic_year=stats.skipped_no_academic_year,
                    )
                else:
                    stats = _Stats(
                        scanned=stats.scanned,
                        eligible=stats.eligible,
                        created=stats.created,
                        existed=stats.existed + 1,
                        skipped_no_staff=stats.skipped_no_staff,
                        skipped_no_curriculum=stats.skipped_no_curriculum,
                        skipped_no_section=stats.skipped_no_section,
                        skipped_no_academic_year=stats.skipped_no_academic_year,
                    )
            except IntegrityError:
                # Another concurrent process may have created the row; count as existed.
                stats = _Stats(
                    scanned=stats.scanned,
                    eligible=stats.eligible,
                    created=stats.created,
                    existed=stats.existed + 1,
                    skipped_no_staff=stats.skipped_no_staff,
                    skipped_no_curriculum=stats.skipped_no_curriculum,
                    skipped_no_section=stats.skipped_no_section,
                    skipped_no_academic_year=stats.skipped_no_academic_year,
                )

        self.stdout.write(self.style.SUCCESS("Backfill summary"))
        self.stdout.write(f"- Dry run: {dry_run}")
        self.stdout.write(f"- Timetable assignments scanned: {stats.scanned}")
        self.stdout.write(f"- Unique eligible tuples (staff+section+curriculum+year): {stats.eligible}")
        if not dry_run:
            self.stdout.write(f"- TeachingAssignments created: {stats.created}")
            self.stdout.write(f"- TeachingAssignments already existed: {stats.existed}")
        self.stdout.write(
            "- Skipped (no staff / inactive staff): "
            f"{stats.skipped_no_staff}"
        )
        self.stdout.write(f"- Skipped (no curriculum row): {stats.skipped_no_curriculum}")
        self.stdout.write(f"- Skipped (no section): {stats.skipped_no_section}")
        self.stdout.write(f"- Skipped (no academic year available): {stats.skipped_no_academic_year}")
