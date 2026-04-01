file_path = r'c:\Users\ADMIN\IDCS-Restart\coe\src\pages\COE\BarScanMarkEntry.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('Total</th>')
print('TH:', idx)

idx2 = content.find('return Number.isFinite(n)')
if idx2 != -1:
    print(content[idx2-200:idx2+100])
