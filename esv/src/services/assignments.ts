import { getApiBaseCandidates } from './apiBase';
import { findAllocationsForFaculty, type FacultyAllocation } from '../stores/coeStore';

export async function fetchFacultyAllocations(facultyCode: string): Promise<FacultyAllocation[]> {
  const normalized = String(facultyCode || '').trim();
  if (!normalized) return [];

  try {
    let response: Response | null = null;
    for (const baseUrl of getApiBaseCandidates()) {
      try {
        response = await fetch(`${baseUrl}/api/coe/assignments/?faculty_code=${encodeURIComponent(normalized)}`);
        if (response.ok) break;
      } catch {
        response = null;
      }
    }

    if (!response || !response.ok) {
      throw new Error('Failed to fetch assignments');
    }

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results as FacultyAllocation[];
  } catch {
    return findAllocationsForFaculty(facultyCode);
  }
}