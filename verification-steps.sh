#!/bin/bash
# Quick verification script - run these queries in your database tool

echo "1️⃣  Find all GEA1122 curriculum records:"
echo "SELECT id, course_code, course_name, regulation, semester FROM academics_curriculum WHERE course_code='GEA1122';"
echo ""

echo "2️⃣  Find all assignments for GEA1122:"
echo "SELECT ta.id, ta.curriculum_row_id, ta.section_id, s.name as section_name, u.first_name, u.last_name FROM academics_teachingassignment ta LEFT JOIN academics_section s ON ta.section_id=s.id LEFT JOIN academics_staff st ON ta.staff_id=st.id LEFT JOIN auth_user u ON st.user_id=u.id WHERE ta.curriculum_row_id IN (SELECT id FROM academics_curriculum WHERE course_code='GEA1122');"
echo ""

echo "3️⃣  Check which curriculum is returned for a specific S&H section:"
echo "SELECT c.id, c.course_code, c.course_name FROM curriculum-for-section WHERE section_id=<SECTION_ID>;"
echo ""

echo "If the curriculum IDs from step 1 do NOT match the curriculum_row_id from step 2,"
echo "then you need to UPDATE the assignments to point to the correct curriculum."

