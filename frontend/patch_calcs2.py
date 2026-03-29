with open('frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    text = f.read()

text = text.replace('''const ssaDraftRows = (ssa1Res as any).draft?.rows || [];''', '''const ssaDraftRows = (ssa1Res as any).draft?.rows || (ssa1Res as any).draft?.sheet?.rows || [];''')
text = text.replace('''const ssaDraftRows = (ssa2Res as any).draft?.rows || [];''', '''const ssaDraftRows = (ssa2Res as any).draft?.rows || (ssa2Res as any).draft?.sheet?.rows || [];''')
text = text.replace('''const rDraftRows = (review1Res as any).draft?.rows || [];''', '''const rDraftRows = (review1Res as any).draft?.rows || (review1Res as any).draft?.sheet?.rows || [];''')
text = text.replace('''const rDraftRows = (review2Res as any).draft?.rows || [];''', '''const rDraftRows = (review2Res as any).draft?.rows || (review2Res as any).draft?.sheet?.rows || [];''')

with open('frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(text)
print("Patch 2b applied!")
