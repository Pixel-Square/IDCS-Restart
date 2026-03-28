"""
Management command: fix_class_type_weights

One-time migration that:
  - Normalises legacy 17-slot TCPL internal_mark_weights → 21-slot canonical format
    (inserts 0.0 CIA-Exam slot after each CO's LAB slot)
  - Normalises class_type field to UPPERCASE for all rows
  - Removes exact duplicate rows (keeps the newest per class type)
  - Pads / truncates other class-types to expected 17 slots

Run with:
    python manage.py fix_class_type_weights
    python manage.py fix_class_type_weights --dry-run   # preview without saving
"""

from django.core.management.base import BaseCommand


EXPECTED_SLOTS = {
    'TCPL': 21,
    # All other class types use 17 slots
}
DEFAULT_SLOT_LEN = 17

# Canonical default weights for each class type
TCPL_DEFAULT_21 = [
    1.0, 3.25, 3.5, 0.0,   # CO1 SSA, CIA, LAB, CIA-Exam
    1.0, 3.25, 3.5, 0.0,   # CO2
    1.0, 3.25, 3.5, 0.0,   # CO3
    1.0, 3.25, 3.5, 0.0,   # CO4
    3.0, 3.0, 3.0, 3.0, 7.0,   # ME CO1-CO5
]
DEFAULT_17 = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0]


def _upgrade_tcpl_17_to_21(arr):
    """Convert a 17-slot TCPL weights array to the 21-slot canonical format.

    Slot mapping (old 17):
      index 0-2  : CO1 SSA/CIA/LAB
      index 3-5  : CO2 SSA/CIA/LAB
      index 6-8  : CO3 SSA/CIA/LAB
      index 9-11 : CO4 SSA/CIA/LAB
      index 12-16: ME CO1-CO5

    New 21-slot:
      index 0-3  : CO1 SSA/CIA/LAB/CIA-Exam
      index 4-7  : CO2 SSA/CIA/LAB/CIA-Exam
      index 8-11 : CO3 SSA/CIA/LAB/CIA-Exam
      index 12-15: CO4 SSA/CIA/LAB/CIA-Exam
      index 16-20: ME CO1-CO5
    """
    out = []
    for co in range(4):
        base = co * 3
        out.append(float(arr[base]) if base < len(arr) else 0.0)
        out.append(float(arr[base + 1]) if base + 1 < len(arr) else 0.0)
        out.append(float(arr[base + 2]) if base + 2 < len(arr) else 0.0)
        out.append(0.0)  # CIA-Exam slot (new, defaults to 0)
    # ME block: original positions 12-16
    for i in range(12, 17):
        out.append(float(arr[i]) if i < len(arr) else 0.0)
    return out  # 21 elements


def _normalise_weights(class_type, arr):
    """Return a correctly-sized weights array for the given class type.

    Returns (new_arr, was_changed).
    """
    ct = class_type.upper()
    expected = EXPECTED_SLOTS.get(ct, DEFAULT_SLOT_LEN)
    defaults = TCPL_DEFAULT_21 if ct == 'TCPL' else DEFAULT_17

    if not isinstance(arr, list):
        return list(defaults), True

    if ct == 'TCPL':
        if len(arr) == 17:
            return _upgrade_tcpl_17_to_21(arr), True
        if len(arr) == 21:
            return list(arr), False
        # Wrong length — fill with defaults
        out = list(arr)
        while len(out) < 21:
            out.append(0.0)
        return out[:21], True

    # Non-TCPL (17-slot)
    if len(arr) == expected:
        return list(arr), False
    out = list(arr)
    while len(out) < expected:
        out.append(defaults[len(out)] if len(out) < len(defaults) else 0.0)
    return out[:expected], True


class Command(BaseCommand):
    help = 'Normalise ClassTypeWeights rows: upgrade TCPL 17-slot → 21-slot, deduplicate, uppercase class_type.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Print what would be changed without saving to DB.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY-RUN] No changes will be saved.'))

        try:
            from OBE.models import ClassTypeWeights
        except ImportError:
            try:
                from backend.OBE.models import ClassTypeWeights
            except ImportError:
                self.stderr.write(self.style.ERROR('Cannot import ClassTypeWeights model.'))
                return

        all_rows = list(ClassTypeWeights.objects.all().order_by('id'))
        self.stdout.write(f'Found {len(all_rows)} ClassTypeWeights row(s).')

        # Group rows by normalised class_type (to detect duplicates)
        from collections import defaultdict
        groups = defaultdict(list)
        for row in all_rows:
            key = str(row.class_type or '').strip().upper()
            groups[key].append(row)

        for ct_key, rows in groups.items():
            if not ct_key:
                self.stdout.write(self.style.WARNING(f'  Skipping row with empty class_type (id={[r.id for r in rows]})'))
                continue

            # Sort newest-first
            rows_sorted = sorted(rows, key=lambda r: (getattr(r, 'updated_at', None) or '', r.id), reverse=True)
            keep_row = rows_sorted[0]
            delete_rows = rows_sorted[1:]

            changed = False

            # --- Normalise class_type casing ---
            if str(keep_row.class_type) != ct_key:
                self.stdout.write(f'  [{ct_key}] Normalising class_type "{keep_row.class_type}" → "{ct_key}"')
                keep_row.class_type = ct_key
                changed = True

            # --- Normalise internal_mark_weights ---
            existing_arr = keep_row.internal_mark_weights
            new_arr, weights_changed = _normalise_weights(ct_key, existing_arr)
            if weights_changed:
                expected = EXPECTED_SLOTS.get(ct_key, DEFAULT_SLOT_LEN)
                old_len = len(existing_arr) if isinstance(existing_arr, list) else 'N/A'
                self.stdout.write(
                    f'  [{ct_key}] Upgrading internal_mark_weights '
                    f'{old_len} slots → {len(new_arr)} slots '
                    f'(expected {expected})'
                )
                keep_row.internal_mark_weights = new_arr
                changed = True

            # --- Delete duplicate rows ---
            if delete_rows:
                self.stdout.write(
                    self.style.WARNING(
                        f'  [{ct_key}] Deleting {len(delete_rows)} duplicate row(s): '
                        f'id={[r.id for r in delete_rows]}'
                    )
                )

            if not dry_run:
                if changed:
                    keep_row.save(update_fields=['class_type', 'internal_mark_weights'])
                    self.stdout.write(self.style.SUCCESS(f'  [{ct_key}] Saved (id={keep_row.id}).'))
                for dup in delete_rows:
                    dup.delete()
                    self.stdout.write(self.style.WARNING(f'  [{ct_key}] Deleted duplicate id={dup.id}.'))
            else:
                if changed:
                    self.stdout.write(f'  [{ct_key}] [DRY-RUN] Would save id={keep_row.id}.')

        self.stdout.write(self.style.SUCCESS('Done.'))
