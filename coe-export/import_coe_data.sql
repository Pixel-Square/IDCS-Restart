-- ============================================================
-- COE Data Import Script
-- Target DB: college_erp_mt on localhost:5434
-- Generated: 2026-10-15
-- ============================================================

-- Bypass FK constraints during bulk import
SET session_replication_role = replica;

-- Pre-import counts (placeholder rows to be replaced)
SELECT 'PRE-IMPORT COUNTS:' AS info;
SELECT 'COE_coearrearstudent'       AS tbl, COUNT(*) FROM public."COE_coearrearstudent";
SELECT 'COE_coeassignmentstore'     AS tbl, COUNT(*) FROM public."COE_coeassignmentstore";
SELECT 'COE_coecourseselectionstore' AS tbl, COUNT(*) FROM public."COE_coecourseselectionstore";
SELECT 'COE_coeexamdummy'           AS tbl, COUNT(*) FROM public."COE_coeexamdummy";
SELECT 'COE_coefinalresult'         AS tbl, COUNT(*) FROM public."COE_coefinalresult";
SELECT 'COE_coekeyvaluestore'       AS tbl, COUNT(*) FROM public."COE_coekeyvaluestore";
SELECT 'COE_coestudentmarks'        AS tbl, COUNT(*) FROM public."COE_coestudentmarks";

-- Truncate all COE tables (cascades handle FK order)
TRUNCATE TABLE
    public."COE_coearrearstudent",
    public."COE_coeassignmentstore",
    public."COE_coecourseselectionstore",
    public."COE_coeexamdummy",
    public."COE_coefinalresult",
    public."COE_coekeyvaluestore",
    public."COE_coestudentmarks"
CASCADE;

SELECT 'TRUNCATE COMPLETE — now loading data...' AS info;

\i /home/iqac/IDCS-MAIN/coe-export/coe_data_clean.sql

-- Reset sequences to correct values
SELECT pg_catalog.setval('public."COE_coearrearstudent_id_seq"',       2,     true);
SELECT pg_catalog.setval('public."COE_coeassignmentstore_id_seq"',     2,     true);
SELECT pg_catalog.setval('public."COE_coecourseselectionstore_id_seq"', 11,   true);
SELECT pg_catalog.setval('public."COE_coeexamdummy_id_seq"',           6470,  true);
SELECT pg_catalog.setval('public."COE_coefinalresult_id_seq"',         15801, true);
SELECT pg_catalog.setval('public."COE_coekeyvaluestore_id_seq"',       20,    true);
SELECT pg_catalog.setval('public."COE_coestudentmarks_id_seq"',        1281,  true);

-- Restore FK constraint enforcement
SET session_replication_role = DEFAULT;

-- Post-import verification
SELECT 'POST-IMPORT COUNTS (expected: 2, 1, 11, 2728, 1739, 13, 1222):' AS info;
SELECT 'COE_coearrearstudent'        AS table_name, COUNT(*) AS row_count, '2'    AS expected FROM public."COE_coearrearstudent";
SELECT 'COE_coeassignmentstore'      AS table_name, COUNT(*) AS row_count, '1'    AS expected FROM public."COE_coeassignmentstore";
SELECT 'COE_coecourseselectionstore' AS table_name, COUNT(*) AS row_count, '11'   AS expected FROM public."COE_coecourseselectionstore";
SELECT 'COE_coeexamdummy'            AS table_name, COUNT(*) AS row_count, '2728' AS expected FROM public."COE_coeexamdummy";
SELECT 'COE_coefinalresult'          AS table_name, COUNT(*) AS row_count, '1739' AS expected FROM public."COE_coefinalresult";
SELECT 'COE_coekeyvaluestore'        AS table_name, COUNT(*) AS row_count, '13'   AS expected FROM public."COE_coekeyvaluestore";
SELECT 'COE_coestudentmarks'         AS table_name, COUNT(*) AS row_count, '1222' AS expected FROM public."COE_coestudentmarks";

-- Sequence verification
SELECT 'SEQUENCE STATES:' AS info;
SELECT sequencename, last_value FROM pg_sequences
WHERE sequencename LIKE 'COE_%'
ORDER BY sequencename;

SELECT 'IMPORT COMPLETE.' AS status;
