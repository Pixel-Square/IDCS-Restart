import { fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import { getAttendanceFilterKey, readCourseAbsenteesMap } from './attendanceStore';

const EVEN_SEMESTERS = ['SEM8', 'SEM6', 'SEM4', 'SEM2'];
const ODD_SEMESTERS = ['SEM7', 'SEM5', 'SEM3', 'SEM1'];

export async function getSemesterStartSequence(department: string, targetSemester: string): Promise<number> {
  if (department === 'ALL') return 0;
  
  const semestersToCheck = EVEN_SEMESTERS.includes(targetSemester) ? EVEN_SEMESTERS : ODD_SEMESTERS.includes(targetSemester) ? ODD_SEMESTERS : null;
  
  // If it's not a standard semester format, just start at 0
  if (!semestersToCheck) return 0;
  
  const targetIndex = semestersToCheck.indexOf(targetSemester);
  if (targetIndex <= 0) return 0; // Highest semester starts at 0 (so first student is 1)

  const semsToFetch = semestersToCheck.slice(0, targetIndex);
  
  let startSequence = 0;
  const selectionMap = readCourseSelectionMap();
  
  const results = await Promise.allSettled(
    semsToFetch.map(async (sem) => {
      const res = await fetchCoeStudentsMap({ department, semester: sem });
      const absentCourseMap = readCourseAbsenteesMap(getAttendanceFilterKey(department, sem));
      
      let count = 0;
      res.departments.forEach((deptBlock: any) => {
        deptBlock.courses.forEach((course: any) => {
          const courseKey = getCourseKey({ 
            department: deptBlock.department, 
            semester: sem, 
            courseCode: course.course_code || '', 
            courseName: course.course_name || '' 
          });
          
          if (selectionMap[courseKey]?.eseType === 'ESE') {
             const courseAbsentees = absentCourseMap.get(courseKey);
             const validStudents = (course.students || []).filter((s: any) => {
               const regNo = String(s.reg_no || '').trim();
               return regNo ? !(courseAbsentees?.has(regNo)) : true;
             });
             count += validStudents.length;
          }
        });
      });
      return count;
    })
  );

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      startSequence += result.value;
    } else {
      console.error('Failed to fetch stats for sequence calculation', result.reason);
    }
  });
  
  return startSequence;
}

export function generateDummyNumber(department: string, globalSequence: number): string {
  const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
    AIDS: '01',
    AIML: '02',
    CIVIL: '03',
    CSE: '04',
    ECE: '05',
    EEE: '06',
    IT: '07',
    MECH: '08',
  };
  
  const deptCode = DEPARTMENT_DUMMY_DIGITS[department] || '09';
  return `E256${deptCode}${String(globalSequence).padStart(5, '0')}`;
}
