const a = {
  id: 463,
  curriculum_row: 534,
  section: 41,
  section_name: 'A',
  section_details: { id: 41, name: 'A' },
  curriculum_row_details: { id: 534, course_code: 'GEA1122', course_name: 'Tamils and Technology ' },
  is_active: true
};
const sub = {
  id: 1321,
  course_code: 'GEA1122',
  course_name: 'Tamils and Technology'
};
const sectionId = 41;
const sectionKey = 'S&H-A';
const currentDeptName = 'S&H';
const sectionNameStr = 'A';

const aCurriculumRow = Number(a.curriculum_row || a.curriculum_row_details?.id || 0);
const aSection = Number(a.section || a.section_details?.id || 0);
const subIdNum = Number(sub.id || 0);
const sectionIdNum = Number(sectionId || 0);

const sectionIdMatch = aSection === sectionIdNum;
const sectionNameMatch = a.section_name === sectionNameStr || (a.section_details && a.section_details.name === sectionNameStr);

const subCourseCode = (sub.course_code || sub.code || '').trim();
const aCourseCode = (a.curriculum_row_details?.course_code || '').trim();
const courseCodeMatch = subCourseCode && aCourseCode && subCourseCode === aCourseCode;

const subCourseName = (sub.course_name || sub.name || '').trim().toLowerCase();
const aCourseName = (a.curriculum_row_details?.course_name || '').trim().toLowerCase();
const courseNameMatch = subCourseName && aCourseName && subCourseName === aCourseName;

const subjectMatch = aCurriculumRow === subIdNum || 
                     (a.curriculum_row_details && Number(a.curriculum_row_details.id) === subIdNum) ||
                     courseCodeMatch || courseNameMatch;

const electiveMatch = false;

const isMatch = subjectMatch ? (currentDeptName === 'S&H' ? (sectionIdMatch || sectionNameMatch) : sectionIdMatch) 
                             : electiveMatch ? false : false;

console.log("subjectMatch:", subjectMatch);
console.log("sectionIdMatch:", sectionIdMatch);
console.log("sectionNameMatch:", sectionNameMatch);
console.log("isMatch:", isMatch);
