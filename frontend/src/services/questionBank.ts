import { fetchWithAuth } from './fetchAuth';

export interface CourseQuestion {
  id: number;
  course_code: string;
  course_name: string;
  s_no: number;
  question_text: string;
  subtopics?: string;
  question_type?: 'D' | 'O';
  course_outcome?: string;
  part?: string;
  btl?: number;
  marks?: number;
  college?: string;
  is_finalized: boolean;
  created_by_name?: string;
  finalized_by_name?: string;
  created_at: string;
  updated_at: string;
  finalized_at?: string;
}

export interface QuestionBankLog {
  id: number;
  question_bank: number;
  course_code: string;
  action: 'created' | 'updated' | 'finalized' | 'unfinalezed';
  edited_by: number;
  edited_by_name: string;
  old_values: Record<string, any>;
  new_values: Record<string, any>;
  edited_at: string;
}

export interface QuestionBankTypeTemplate {
  s_no: number;
  question_type: 'D' | 'O';
  course_outcome: string;
  part: string;
  btl: number;
  marks: number;
}

export interface QuestionBankType {
  id: number;
  code: string;
  label: string;
  active_columns: string[];
  is_active: boolean;
  templates: QuestionBankTypeTemplate[];
}

export async function getQuestionBankTypes(): Promise<QuestionBankType[]> {
  try {
    const res = await fetchWithAuth('/api/obe/question-bank-types');
    if (!res.ok) throw new Error('Failed to load types');
    const json = await res.json();
    return json.types || [];
  } catch (e: any) {
    console.error('getQuestionBankTypes exception:', e);
    throw e;
  }
}

export async function saveQuestionBankType(data: Partial<QuestionBankType>): Promise<QuestionBankType> {
  try {
    const res = await fetchWithAuth('/api/obe/question-bank-types/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save type');
    const json = await res.json();
    return json.type;
  } catch (e: any) {
    console.error('saveQuestionBankType exception:', e);
    throw e;
  }
}

export async function deleteQuestionBankType(typeId: number): Promise<void> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank-types/${typeId}/delete`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete type');
  } catch (e: any) {
    console.error('deleteQuestionBankType exception:', e);
    throw e;
  }
}

export async function getCourseQuestionBankType(courseCode: string): Promise<QuestionBankType | null> {
  try {
    const res = await fetchWithAuth(`/api/obe/course-question-bank-type/${encodeURIComponent(courseCode)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.type;
  } catch {
    return null;
  }
}

export async function setCourseQuestionBankType(courseCode: string, typeId: number | null): Promise<void> {
  try {
    const res = await fetchWithAuth(`/api/obe/course-question-bank-type/${encodeURIComponent(courseCode)}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_id: typeId }),
    });
    if (!res.ok) throw new Error('Failed to set type');
  } catch (e: any) {
    console.error('setCourseQuestionBankType exception:', e);
    throw e;
  }
}

export async function getCourseQBDeadline(courseCode: string): Promise<string | null> {
  try {
    const res = await fetchWithAuth(`/api/obe/course-qb-deadline/${encodeURIComponent(courseCode)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.deadline;
  } catch {
    return null;
  }
}

export async function setCourseQBDeadline(courseCode: string, deadline: string | null): Promise<void> {
  try {
    const res = await fetchWithAuth(`/api/obe/course-qb-deadline/${encodeURIComponent(courseCode)}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline }),
    });
    if (!res.ok) throw new Error('Failed to set deadline');
  } catch (e: any) {
    console.error('setCourseQBDeadline exception:', e);
    throw e;
  }
}

export async function getCoursQuestions(courseCode: string): Promise<CourseQuestion[]> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/list/${encodeURIComponent(courseCode)}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('getCoursQuestions error response:', res.status, errorText);
      throw new Error(`Failed to load course questions: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('getCoursQuestions response:', json);
    return json.questions || [];
  } catch (e: any) {
    console.error('getCoursQuestions exception:', e);
    throw e;
  }
}

export async function createCourseQuestion(data: Partial<CourseQuestion>): Promise<CourseQuestion> {
  try {
    const res = await fetchWithAuth('/api/obe/question-bank/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('createCourseQuestion error response:', res.status, errorText);
      throw new Error(`Failed to create question: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('createCourseQuestion response:', json);
    return json.question;
  } catch (e: any) {
    console.error('createCourseQuestion exception:', e);
    throw e;
  }
}

export async function updateCourseQuestion(
  questionId: number,
  data: Partial<CourseQuestion>
): Promise<CourseQuestion> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/${questionId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('updateCourseQuestion error response:', res.status, errorText);
      throw new Error(`Failed to update question: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('updateCourseQuestion response:', json);
    return json.question;
  } catch (e: any) {
    console.error('updateCourseQuestion exception:', e);
    throw e;
  }
}

export async function deleteCourseQuestion(questionId: number): Promise<void> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/${questionId}/delete`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('deleteCourseQuestion error response:', res.status, errorText);
      throw new Error(`Failed to delete question: HTTP ${res.status}`);
    }
    console.log('deleteCourseQuestion success');
  } catch (e: any) {
    console.error('deleteCourseQuestion exception:', e);
    throw e;
  }
}

export async function finalizeCourseQuestions(courseCode: string): Promise<{ finalized_count: number }> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/${encodeURIComponent(courseCode)}/finalize`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('finalizeCourseQuestions error response:', res.status, errorText);
      throw new Error(`Failed to finalize questions: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('finalizeCourseQuestions response:', json);
    return { finalized_count: json.finalized_count || 0 };
  } catch (e: any) {
    console.error('finalizeCourseQuestions exception:', e);
    throw e;
  }
}

export async function unfinalizeQuestions(courseCode: string): Promise<{ unffinalized_count: number }> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/${encodeURIComponent(courseCode)}/unfinalize`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('unfinalizeQuestions error response:', res.status, errorText);
      throw new Error(`Failed to unfinalize questions: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('unfinalizeQuestions response:', json);
    return { unffinalized_count: json.unffinalized_count || 0 };
  } catch (e: any) {
    console.error('unfinalizeQuestions exception:', e);
    throw e;
  }
}

export async function getQuestionBankLogs(courseCode: string): Promise<QuestionBankLog[]> {
  try {
    const res = await fetchWithAuth(`/api/obe/question-bank/${encodeURIComponent(courseCode)}/logs`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('getQuestionBankLogs error response:', res.status, errorText);
      throw new Error(`Failed to load question bank logs: HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log('getQuestionBankLogs response:', json);
    return json.logs || [];
  } catch (e: any) {
    console.error('getQuestionBankLogs exception:', e);
    throw e;
  }
}
