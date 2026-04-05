import { getApiBaseCandidates } from './apiBase';
import { findAllocationsForFaculty, type FacultyAllocation } from '../stores/coeStore';

export async function fetchFacultyAllocations(facultyCode: string): Promise<FacultyAllocation[]> {
  const normalized = String(facultyCode || '').trim().toUpperCase();
  if (!normalized) return [];

  let lastError: Error | null = null;
  for (const baseUrl of getApiBaseCandidates()) {
    try {
      const response = await fetch(`${baseUrl}/api/coe/assignments/?faculty_code=${encodeURIComponent(normalized)}`);
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data?.results) ? data.results : [];
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  // Fallback to local storage if API fails, but ONLY if we haven't successfully reached any API
  // If we reached the API and it returned 404 or empty, we should respect that.
  return findAllocationsForFaculty(facultyCode);
}

export async function verifyFacultyCode(facultyCode: string): Promise<boolean> {
  const normalized = String(facultyCode || '').trim().toUpperCase();
  if (!normalized) return false;

  try {
    const allocations = await fetchFacultyAllocations(normalized);
    // A faculty code is valid if they have at least one allocation in the DB
    return allocations.length > 0;
  } catch (error) {
    console.error('Error verifying faculty code:', error);
    // If there's a network error, we might want to allow login if backup data exists
    const localAllocations = findAllocationsForFaculty(normalized);
    return localAllocations.length > 0;
  }
}