(function () {
  function normalize(v) {
    return String(v || '').trim().toUpperCase();
  }

  function toggle() {
    var sel = document.getElementById('id_class_type');
    if (!sel) return;
    var ct = normalize(sel.value);
    // Django admin wraps fields in .form-row.field-<name>
    var row = document.querySelector('.form-row.field-enabled_assessments');
    if (!row) return;
    row.style.display = ct === 'SPECIAL' ? '' : 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    toggle();
    var sel = document.getElementById('id_class_type');
    if (sel) sel.addEventListener('change', toggle);
  });
})();
