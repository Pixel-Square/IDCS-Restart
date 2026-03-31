import re

with open('c:/Users/ADMIN/IDCS-Restart/coe/src/pages/COE/BarScanMarkEntry.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the max marks row from the bottom
content = re.sub(
    r'<tr className="bg-gray-50">\s*<td className="px-3 py-2 font-semibold">Max</td>\s*\{questions\.map\(\(q\) => \(\s*<td key=\{max-\$\{q\.key\}\} className="px-3 py-2 text-center font-semibold text-gray-700">\{q\.max\}</td>\s*\)\)\}\s*<td className="px-3 py-2 text-center font-semibold text-gray-700">\s*\{questions\.reduce\(\(sum, q\) => sum \+ q\.max, 0\)\}\s*</td>\s*</tr>',
    '',
    content,
    flags=re.DOTALL
)

# Modify the input cell
old_td = r'<td key={input-\$\{q\.key\}} className="px-2 py-2 text-center relative group">\s*<input'
new_td = r'''<td key={input-} className="px-2 py-2 text-center relative group">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className="text-xs font-semibold text-gray-500" title="Maximum Marks">Max: {q.max}</div>
                        <input'''
content = re.sub(old_td, new_td, content, flags=re.DOTALL)

# Close the new div at the end of the input
old_input_end = r'(\s*className=\{w-20 rounded border px-2 py-1 text-center focus:outline-none focus:border-blue-500 \$\{(.|\n)*?border-gray-300\x27\s*\}\}\s*/>\s*)</td>'
new_input_end = r'\1</div>\n                    </td>'
content = re.sub(old_input_end, new_input_end, content, flags=re.DOTALL)

with open('c:/Users/ADMIN/IDCS-Restart/coe/src/pages/COE/BarScanMarkEntry.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done modification")