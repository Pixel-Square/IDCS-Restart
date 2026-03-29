with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    "needs12 && allow('ssa1') && !isLabLike ? fetchPublishedSsa1(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },",
    "needs12 && allow('ssa1') && !isLabLike ? (async () => { try { const p = await fetchPublishedSsa1(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('ssa1', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },"
)

text = text.replace(
    "needs34 && allow('ssa2') && !isLabLike ? fetchPublishedSsa2(subjectId, teachingAssignmentId).catch(() => ({ marks: {} })) : { marks: {} },",
    "needs34 && allow('ssa2') && !isLabLike ? (async () => { try { const p = await fetchPublishedSsa2(subjectId, teachingAssignmentId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('ssa2', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },"
)

text = text.replace(
    "needs12 && allow('review1') && isTcpr ? fetchPublishedReview1(subjectId).catch(() => ({ marks: {} })) : { marks: {} },",
    "needs12 && allow('review1') && isTcpr ? (async () => { try { const p = await fetchPublishedReview1(subjectId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('review1', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },"
)

text = text.replace(
    "needs34 && allow('review2') && isTcpr ? fetchPublishedReview2(subjectId).catch(() => ({ marks: {} })) : { marks: {} },",
    "needs34 && allow('review2') && isTcpr ? (async () => { try { const p = await fetchPublishedReview2(subjectId).catch(() => ({marks:{}})); try { const d = await fetchDraft<any>('review2', subjectId, teachingAssignmentId); if (d?.draft) return { ...p, draft: (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft }; } catch{} return p; } catch { return {marks:{}} } })() : { marks: {} },"
)

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(text)

print("Patch 2 applied successfully")
