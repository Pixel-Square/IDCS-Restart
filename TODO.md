# TODO
- [ ] Refactor `OddEvenSemTimetable.tsx` to remove hardcoded odd/even period arrays (ODD_SEM_TEMPLATE / EVEN_SEM_TEMPLATE).
- [ ] Add user-driven column builder:
  - [ ] Allow adding up to 10 columns.
  - [ ] Each column can be chosen as `Period 1..15`, `Break`, or `Lunch`.
  - [ ] Break/Lunch can be placed at any position by adding them in the desired order.
- [ ] Update timing UI to work with manually added columns.
- [ ] Enforce duplicates policy for `Period N` (block duplicates within a template).
- [ ] Update UI labels/notes to remove “automatically configured”.
- [ ] Save/edit/load must preserve selected columns.
- [ ] Run frontend build/typecheck and do quick manual verification.

