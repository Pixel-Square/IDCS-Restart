import re

file_path = r'c:\Users\ADMIN\IDCS-Restart\coe\src\pages\COE\BarScanMarkEntry.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Save Header
old_th = '<th className=\"px-3 py-2 text-center\">Total</th>'
new_th = '<th className=\"px-3 py-2 text-center text-green-600 w-12\">Save</th>\n                    <th className=\"px-3 py-2 text-center\">Total</th>'
content = content.replace(old_th, new_th)

# 2. Add empty cell in max row
old_td_max = '<td className=\"px-3 py-2 text-center font-semibold\\ntext-gray-700\">\\n                      {questions.reduce((sum, q) => sum + q.max, 0)}\\n                    </td>'
# Let's use regex instead due to line breaks
content = re.sub(r'(<td className=\"px-3 py-2 text-center font-semibold\s*text-gray-700\">\s*\{questions\.reduce\(\(sum,\s*q\)\s*=>\s*sum\s*\+\s*q\.max,\s*0\)\}\s*</td>)', 
                r'<td className="px-3 py-2 text-center"></td>\n                    \1', 
                content)

# 3. Add button in input row
button_html = '''<td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="text-green-600 hover:text-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 rounded p-1 flex items-center justify-center w-full"
                        onClick={handleSaveMarks}
                        disabled={isSaving || isLocked}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Tab' || e.key === ' ') {
                            e.preventDefault();
                            handleSaveMarks();
                          }
                        }}
                        title="Save & Next"
                      >
                        <Check size={20} />
                      </button>
                    </td>
                    '''

content = re.sub(r'(<td className=\"px-3 py-2 text-center font-semibold\">\s*\{questions\.reduce\(\(sum,\s*q\)\s*=>\s*\{)', 
                button_html + r'\1', 
                content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced')
