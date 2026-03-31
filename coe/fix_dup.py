file_path = r"c:\Users\ADMIN\IDCS-Restart\coe\src\pages\COE\BarScanMarkEntry.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("  const saveBtnRef = useRef<HTMLButtonElement>(null);\n  const saveBtnRef = useRef<HTMLButtonElement>(null);", "  const saveBtnRef = useRef<HTMLButtonElement>(null);")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)
