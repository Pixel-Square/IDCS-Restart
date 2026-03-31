import re

with open("src/pages/COE/StudentsList.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add import
if "import BarScanMarkEntry" not in text:
    text = text.replace("import JsBarcode from 'jsbarcode';", "import JsBarcode from 'jsbarcode';\nimport BarScanMarkEntry from './BarScanMarkEntry';")

# Add state
text = text.replace("  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');", "  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');\n  const [activeEntryParams, setActiveEntryParams] = useState<any>(null);")

# Update getMarkEntryHref
old_href = """  const getMarkEntryHref = (student: AugStudent, qpType: string, deptName: string, semName: string) => {
    const params = new URLSearchParams();
    if (student.dummy) params.set('code', student.dummy);
    else params.set('code', student.reg_no || '');
    params.set('reg_no', student.reg_no || '');
    params.set('name', student.name || '');
    params.set('qp_type', qpType);
    params.set('dept', deptName);
    params.set('sem', semName);
    if (student.dummy) params.set('dummy_number', student.dummy);
    return `/coe/bar-scan/entry?${params.toString()}`;
  };"""

new_href = """  const handleOpenMarkEntry = (e: React.MouseEvent, student: AugStudent, qpType: string, deptName: string, semName: string) => {
    e.preventDefault();
    setActiveEntryParams({
      code: student.dummy ? student.dummy : (student.reg_no || ''),
      reg_no: student.reg_no || '',
      name: student.name || '',
      qp_type: qpType,
      dept: deptName,
      sem: semName,
      dummy_number: student.dummy || ''
    });
  };

  const getMarkEntryHref = (student: AugStudent, qpType: string, deptName: string, semName: string) => {
    return '#';
  };"""

text = text.replace(old_href, new_href)

# Update onClick
table_link_old = """                                      <td className="px-3 py-2">
                                        {canNavigateToMarkEntry ? (
                                          <a
                                            href={getMarkEntryHref(student, qpType, deptBlock.department, semester)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-blue-700 underline hover:text-blue-800"
                                          >
                                            {dummy}
                                          </a>
                                        ) : ("""

table_link_new = """                                      <td className="px-3 py-2">
                                        {canNavigateToMarkEntry ? (
                                          <a
                                            href="#"
                                            onClick={(e) => handleOpenMarkEntry(e, student, qpType, deptBlock.department, semester)}
                                            className="font-medium text-blue-700 underline hover:text-blue-800 cursor-pointer"
                                          >
                                            {dummy}
                                          </a>
                                        ) : ("""

table_link_old_stripped = re.sub(r'\s+', '', table_link_old)
# Finding the actual text using regex might be safer
link_match = re.search(r'href=\{getMarkEntryHref[^<]+</a>', text)
if link_match:
    match_str = link_match.group(0)
    replaced_str = re.sub(r'href=\{getMarkEntryHref.*?\}', 'href=\"#\"', match_str)
    replaced_str = replaced_str.replace('target="_blank"', '')
    replaced_str = replaced_str.replace('rel="noopener noreferrer"', '')
    replaced_str = replaced_str.replace('className="font-medium', 'onClick={(e) => handleOpenMarkEntry(e, student, qpType, deptBlock.department, semester)}\nclassName="font-medium')
    text = text.replace(match_str, replaced_str)

# Inject the modal
end_tag = "    </div>\n  );\n}"
modal_inject = """      {activeEntryParams && (
        <BarScanMarkEntry
          key={activeEntryParams.code}
          embeddedCode={activeEntryParams.code}
          embeddedRegNo={activeEntryParams.reg_no}
          embeddedName={activeEntryParams.name}
          embeddedQpType={activeEntryParams.qp_type}
          embeddedDept={activeEntryParams.dept}
          embeddedSem={activeEntryParams.sem}
          embeddedDummy={activeEntryParams.dummy_number}
          onClose={() => setActiveEntryParams(null)}
          onNextScan={(newCode) => {
               // Inside StudentList, if they scan next, we might not have all the URL details mapped to variables unless we search for it.
               // We just pass it in bare code.
               setActiveEntryParams({
                  code: newCode,
                  qp_type: activeEntryParams.qp_type // retain qp type if known, or it gets looked up by BarScanMarkEntry fallback
               });
          }}
        />
      )}
    </div>
  );
}"""

text = text.replace(end_tag, modal_inject)

with open("src/pages/COE/StudentsList.tsx", "w", encoding="utf-8") as f:
    f.write(text)

