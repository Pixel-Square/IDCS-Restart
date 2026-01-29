export async function getCdapRevision(subjectId: string) {
  // Try to call backend if available. For now return null to use localStorage copy.
  return null;
}

export async function saveCdapRevision(rev: any) {
  // pretend to save and return the revision
  return rev;
}