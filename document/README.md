# Document generation (IQAC PBI Report)

## Put input files here
Copy the two files you uploaded into this folder:

- `Agile and Traditional Software Process PRBL SYLLABUS.doc`
- `IQAC PBI REPORT (Sem 6).docx`

(Exact filenames can differ; the generator script accepts paths.)

## Generate the new report
From the repo root:

```bash
backend/.venv/bin/python tools/generate_iqac_pbi_report.py \
  --syllabus "document/Agile and Traditional Software Process PRBL SYLLABUS.doc" \
  --template "document/IQAC PBI REPORT (Sem 6).docx" \
  --output "document/IQAC_PBI_REPORT_Agile_Traditional_IDCS.docx"
```

## Confidentiality rules applied
- Any IPv4 address is masked to `192.168.xx.xx`
- Any secrets/keys/password-looking values are replaced with `***`
- Any mentor/student/staff names are left blank placeholders (you fill manually)
- URLs are normalized to:
  - Frontend: `idcs.krgi.co.in`
  - Backend: `db.krgi.co.in`
