import re

file_path = r'c:\Users\ADMIN\IDCS-Restart\coe\src\pages\COE\BarScanMarkEntry.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add saveBtnRef
content = content.replace(
    "const [passwordError, setPasswordError] = useState('');",
    "const [passwordError, setPasswordError] = useState('');\n  const saveBtnRef = useRef<HTMLButtonElement>(null);"
)

# 2. Add ref to Save Marks button
save_btn_old = """                  <button
                    onClick={handleSaveMarks}
                    disabled={saving}
                    className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${"""

save_btn_new = """                  <button
                    ref={saveBtnRef}
                    onClick={handleSaveMarks}
                    disabled={saving}
                    className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${"""

content = content.replace(save_btn_old, save_btn_new)

# 3. Modify the questions.map for inputs and add onKeyDown
inputs_map_old = """{questions.map((q) => (
                      <td key={`input-${q.key}`} className="px-2 py-2 text-center relative group">
                        <input
                          type="number"
                          min={0}
                          max={q.max}
                          value={marks[q.key] || ''}
                          disabled={isLocked}"""

inputs_map_new = """{questions.map((q, qIndex) => (
                      <td key={`input-${q.key}`} className="px-2 py-2 text-center relative group">
                        <input
                          type="number"
                          min={0}
                          max={q.max}
                          value={marks[q.key] || ''}
                          disabled={isLocked}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey && qIndex === questions.length - 1) {
                              e.preventDefault();
                              saveBtnRef.current?.focus();
                            }
                            if (e.key === 'Enter' && qIndex === questions.length - 1) {
                              e.preventDefault();
                              saveBtnRef.current?.focus();
                            }
                          }}"""

content = content.replace(inputs_map_old, inputs_map_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed tab flow!')
