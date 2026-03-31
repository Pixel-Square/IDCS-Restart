import re

file_path = r'c:\Users\ADMIN\IDCS-Restart\coe\src\pages\COE\BarScanMarkEntry.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

tbody_match = re.search(r'<tbody>(.*?)</tbody>', content, re.DOTALL)
if tbody_match:
    tbody_content = tbody_match.group(1)
    
    idx = tbody_content.find('<tr className=\"bg-gray-50\">')
    row1 = tbody_content[:idx]
    row2 = tbody_content[idx:]
    
    new_tbody_content = '\n' + row2.strip() + '\n' + row1.strip() + '\n'
    
    new_content = content[:tbody_match.start(1)] + new_tbody_content + content[tbody_match.end(1):]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Fixed!')
else:
    print('Could not find tbody')
