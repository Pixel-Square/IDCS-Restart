with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    text = f.read()

text = text.replace(
'''                const ssa1Total = toNumOrNull((ssa1Res as any).marks[String(student.id)]);
                const ssa1Half = ssa1Total == null ? null : Number(ssa1Total) / 2;
                ssaMark = ssa1Half;''',
'''                const ssa1Total = toNumOrNull((ssa1Res as any).marks[String(student.id)]);
                let ssaMarkVal: number | null = null;
                const ssaDraftRows: any[] = (ssa1Res as any).draft?.rows || (ssa1Res as any).draft?.sheet?.rows || [];
                const draftRow = ssaDraftRows.find((r) => String(r.studentId) === String(student.id));
                if (draftRow) {
                  const splitVal = coNum === 1 ? draftRow.co1 : draftRow.co2;
                  if (splitVal !== "" && splitVal != null && !isNaN(Number(splitVal))) {
                    ssaMarkVal = Number(splitVal);
                  }
                }
                if (ssaMarkVal === null && ssa1Total != null) {
                  ssaMarkVal = Number(ssa1Total) / 2;
                }
                ssaMark = ssaMarkVal;'''
)

text = text.replace(
'''                const ssa2Total = toNumOrNull((ssa2Res as any).marks[String(student.id)]);
                const ssa2Half = ssa2Total == null ? null : Number(ssa2Total) / 2;
                ssaMark = ssa2Half;''',
'''                const ssa2Total = toNumOrNull((ssa2Res as any).marks[String(student.id)]);
                let ssaMarkVal: number | null = null;
                const ssaDraftRows: any[] = (ssa2Res as any).draft?.rows || (ssa2Res as any).draft?.sheet?.rows || [];
                const draftRow = ssaDraftRows.find((r) => String(r.studentId) === String(student.id));
                if (draftRow) {
                  const splitVal = coNum === 3 ? draftRow.co3 : draftRow.co4;
                  if (splitVal !== "" && splitVal != null && !isNaN(Number(splitVal))) {
                    ssaMarkVal = Number(splitVal);
                  }
                }
                if (ssaMarkVal === null && ssa2Total != null) {
                  ssaMarkVal = Number(ssa2Total) / 2;
                }
                ssaMark = ssaMarkVal;'''
)

text = text.replace(
'''                  if (isTcpr) {
                    const review1Total = toNumOrNull((review1Res as any).marks[String(student.id)]);
                    const review1Half = review1Total == null ? null : Number(review1Total) / 2;
                    if (review1Half != null) {
                      reviewMark = review1Half;
                      reviewMax = coNum === 1 ? maxes.review1.co1 : maxes.review1.co2;
                    }''',
'''                  if (isTcpr) {
                    const review1Total = toNumOrNull((review1Res as any).marks[String(student.id)]);
                    let revMarkVal: number | null = null;
                    const rDraftRows: any[] = (review1Res as any).draft?.rows || (review1Res as any).draft?.sheet?.rows || [];
                    const dRow = rDraftRows.find((r) => String(r.studentId) === String(student.id));
                    if (dRow) {
                      const sVal = coNum === 1 ? dRow.co1 : dRow.co2;
                      if (sVal !== "" && sVal != null && !isNaN(Number(sVal))) { revMarkVal = Number(sVal); }
                    }
                    if (revMarkVal === null && review1Total != null) revMarkVal = Number(review1Total) / 2;
                    if (revMarkVal != null) {
                      reviewMark = revMarkVal;
                      reviewMax = coNum === 1 ? maxes.review1.co1 : maxes.review1.co2;
                    }'''
)

text = text.replace(
'''                  if (isTcpr) {
                    const review2Total = toNumOrNull((review2Res as any).marks[String(student.id)]);
                    const review2Half = review2Total == null ? null : Number(review2Total) / 2;
                    if (review2Half != null) {
                      reviewMark = review2Half;
                      reviewMax = coNum === 3 ? maxes.review2.co3 : maxes.review2.co4;
                    }''',
'''                  if (isTcpr) {
                    const review2Total = toNumOrNull((review2Res as any).marks[String(student.id)]);
                    let revMarkVal: number | null = null;
                    const rDraftRows: any[] = (review2Res as any).draft?.rows || (review2Res as any).draft?.sheet?.rows || [];
                    const dRow = rDraftRows.find((r) => String(r.studentId) === String(student.id));
                    if (dRow) {
                      const sVal = coNum === 3 ? dRow.co3 : dRow.co4;
                      if (sVal !== "" && sVal != null && !isNaN(Number(sVal))) { revMarkVal = Number(sVal); }
                    }
                    if (revMarkVal === null && review2Total != null) revMarkVal = Number(review2Total) / 2;
                    if (revMarkVal != null) {
                      reviewMark = revMarkVal;
                      reviewMax = coNum === 3 ? maxes.review2.co3 : maxes.review2.co4;
                    }'''
)

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(text)

print("Patch 3 applied successfully")
