import re

with open("src/pages/COE/BarScanMarkEntry.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update export default signature
text = re.sub(
    r"export default function BarScanMarkEntry\(\) \{",
    """export interface BarScanMarkEntryProps {
  embeddedCode?: string;
  embeddedRegNo?: string;
  embeddedName?: string;
  embeddedQpType?: string;
  embeddedDummy?: string;
  embeddedDept?: string;
  embeddedSem?: string;
  onClose?: () => void;
  onNextScan?: (code: string) => void;
}

export default function BarScanMarkEntry(props: BarScanMarkEntryProps = {}) {""",
    text
)

# 2. Update searchParams reads
text = text.replace(
    "const code = String(searchParams.get('code') || '').trim();",
    "const code = props.embeddedCode !== undefined ? props.embeddedCode : String(searchParams.get('code') || '').trim();"
)
text = text.replace(
    "const queryRegNo = searchParams.get('reg_no');",
    "const queryRegNo = props.embeddedRegNo !== undefined ? props.embeddedRegNo : searchParams.get('reg_no');"
)
text = text.replace(
    "const queryName = searchParams.get('name');",
    "const queryName = props.embeddedName !== undefined ? props.embeddedName : searchParams.get('name');"
)
text = text.replace(
    "const queryQpType = searchParams.get('qp_type');",
    "const queryQpType = props.embeddedQpType !== undefined ? props.embeddedQpType : searchParams.get('qp_type');"
)
text = text.replace(
    "const queryDummy = searchParams.get('dummy_number');",
    "const queryDummy = props.embeddedDummy !== undefined ? props.embeddedDummy : searchParams.get('dummy_number');"
)
text = text.replace(
    "const queryDept = searchParams.get('dept');",
    "const queryDept = props.embeddedDept !== undefined ? props.embeddedDept : searchParams.get('dept');"
)
text = text.replace(
    "const querySem = searchParams.get('sem');",
    "const querySem = props.embeddedSem !== undefined ? props.embeddedSem : searchParams.get('sem');"
)

# 3. Handle modal wrapper exactly by replacing the entire return statement start
# First, pull out the password modal
modal_match = re.search(r"(\{showPasswordModal && \(\s*<div className=\"fixed inset-0.*?</div>\s*\)\})", text, re.DOTALL)
if modal_match:
    pwd_modal = modal_match.group(1)
    text = text.replace(pwd_modal, "")
else:
    pwd_modal = ""

# Now replace the return statement and outer div structure
return_start = """  return (
    <>
      

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">"""

replacement_return = f"""  const isModal = Boolean(props.onClose);
  const containerClass = isModal ? "max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1 overflow-y-auto" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6";

  const renderContent = () => (
    <div className={{containerClass}}>"""

# Using regex to replace the return start since there are empty lines
text = re.sub(r"  return \(\s*<>\s*<div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6\">", replacement_return, text, flags=re.DOTALL)


# Update layout inside container
text = text.replace(
    '<div className="flex items-center justify-between rounded-xl border border-blue-100 bg-white p-6 shadow-sm">',
    '<div className="flex flex-col md:flex-row items-center justify-between rounded-xl border border-blue-100 bg-white p-6 shadow-sm gap-4">'
)

is_locked_block = """{isLocked ? (
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
                >
                  Edit Marks
                </button>
              )"""

new_is_locked_block = """{isLocked ? (
                <div className="flex gap-4 items-center">
                  {props.onNextScan && (
                    <input
                      type="text"
                      placeholder="Scan next barcode..."
                      autoFocus
                      className="border-2 border-green-400 bg-green-50 px-4 py-2 rounded-lg text-sm text-center outline-none focus:ring focus:ring-green-300 font-mono shadow-inner w-56"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          e.preventDefault();
                          props.onNextScan(e.currentTarget.value.trim());
                        }
                      }}
                    />
                  )}
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
                  >
                    Edit Marks
                  </button>
                </div>
              )"""
text = text.replace(is_locked_block, new_is_locked_block)


end_replace = r"    </div>\n    </>\n  \);\n}"
new_end = f"""    </div>
  );

  return (
    <>
      {pwd_modal}

      {{isModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 overflow-hidden">
          <div className="bg-[#fcfaf8] w-full max-w-7xl rounded-xl shadow-2xl relative max-h-[96vh] flex flex-col">
            <button onClick={{props.onClose}} className="absolute top-4 right-4 z-10 p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200" title="Close">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            {{renderContent()}}
          </div>
        </div>
      ) : renderContent()}}
    </>
  );
}}"""
text = re.sub(end_replace, new_end, text)

with open("src/pages/COE/BarScanMarkEntry.tsx", "w", encoding="utf-8") as f:
    f.write(text)
