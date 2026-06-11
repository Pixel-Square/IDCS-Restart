import re

with open('/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx', 'r') as f:
    text = f.read()

# Replace findExistingAssignment with findExistingAssignments mapping
text = text.replace("const existingAssignment = findExistingAssignment", "const existingAssignments = findExistingAssignments")
text = text.replace("const existingElectiveAssignment = findExistingElectiveAssignment", "const existingElectiveAssignments = findExistingElectiveAssignments")
text = text.replace("existingAssignment.", "existingAssignments[0]?.")
text = text.replace("existingAssignment?", "existingAssignments[0]?")
text = text.replace("existingElectiveAssignment.", "existingElectiveAssignments[0]?.")
text = text.replace("existingElectiveAssignment?", "existingElectiveAssignments[0]?")
text = text.replace("existingAssignment ", "existingAssignments.length > 0 ")
text = text.replace("existingElectiveAssignment ", "existingElectiveAssignments.length > 0 ")

# Replace `defaultValue` of SearchableStaffSelect to be an array of IDs and add `isMulti={true}`
text = re.sub(
    r"defaultValue=\{existingAssignments\[0\]\?\.staff_details\?\.id \|\| existingAssignments\[0\]\?\.staff \|\| ''\}",
    r"defaultValue={existingAssignments.map(a => a.staff_details?.id || a.staff)} isMulti={true}",
    text
)
text = re.sub(
    r"defaultValue=\{existingAssignments\[0\]\?\.staff_details\?\.id \?\? \(existingAssignments\[0\]\?\.staff as any\) \?\? ''\}",
    r"defaultValue={existingAssignments.map(a => a.staff_details?.id || a.staff)} isMulti={true}",
    text
)
text = re.sub(
    r"defaultValue=\{existingElectiveAssignments\[0\]\?\.staff_details\?\.id \|\| existingElectiveAssignments\[0\]\?\.staff \|\| ''\}",
    r"defaultValue={existingElectiveAssignments.map(a => a.staff_details?.id || a.staff)} isMulti={true}",
    text
)

# Render multiple assignments
text = re.sub(
    r"\{existingAssignments\.length > 0 \? \(\s*<div className=\"text-sm text-gray-900 font-medium\">\s*\{existingAssignments\[0\]\?\.staff_details\?\.staff_id\} - \{getAssignmentStaffName\(existingAssignments\[0\]\?\.staff_details\)\}\s*<\/div>",
    r"{existingAssignments.length > 0 ? (\n                                      <div className=\"text-sm text-gray-900 font-medium\">\n                                        {existingAssignments.map(a => `${a.staff_details?.staff_id} - ${getAssignmentStaffName(a.staff_details)}`).join(', ')}\n                                      </div>",
    text
)
text = re.sub(
    r"\{existingAssignments\.length > 0 \? \(\s*<span className=\"text-sm text-gray-900 font-medium\">\s*\{existingAssignments\[0\]\?\.staff_details\?\.staff_id\} - \{getAssignmentStaffName\(existingAssignments\[0\]\?\.staff_details\)\}\s*<\/span>",
    r"{existingAssignments.length > 0 ? (\n                                      <span className=\"text-sm text-gray-900 font-medium\">\n                                        {existingAssignments.map(a => `${a.staff_details?.staff_id} - ${getAssignmentStaffName(a.staff_details)}`).join(', ')}\n                                      </span>",
    text
)
text = re.sub(
    r"\{existingElectiveAssignments\.length > 0 \? \(\s*<div className=\"text-sm text-gray-900 font-medium\">\s*\{existingElectiveAssignments\[0\]\?\.staff_details\?\.staff_id\} - \{getAssignmentStaffName\(existingElectiveAssignments\[0\]\?\.staff_details\)\}\s*<\/div>",
    r"{existingElectiveAssignments.length > 0 ? (\n                                      <div className=\"text-sm text-gray-900 font-medium\">\n                                        {existingElectiveAssignments.map(a => `${a.staff_details?.staff_id} - ${getAssignmentStaffName(a.staff_details)}`).join(', ')}\n                                      </div>",
    text
)

# Save handlers
# Course save
save_c_pattern = re.compile(r"onClick=\{\(\) => \{\s*const staffSel = document\.getElementById\(`staff-\$\{section\.id\}-\$\{subject\.id\}`\) as HTMLSelectElement;.*?\}\}\s*className=\"p-2 text-green-600", re.DOTALL)
save_c_repl = r"""onClick={async () => {
                                              const staffSel = document.getElementById(`staff-${section.id}-${subject.id}`) as HTMLInputElement;
                                              const selectedIds = JSON.parse(staffSel?.value || '[]').map(Number).filter(Boolean);
                                              if (selectedIds.length === 0) return alert('Select at least one staff member');
                                              
                                              try {
                                                const existingStaffIds = existingAssignments.map((a: any) => a.staff_details?.id || a.staff);
                                                
                                                const toDelete = existingAssignments.filter((a: any) => !selectedIds.includes(a.staff_details?.id || a.staff));
                                                for (const a of toDelete) {
                                                  await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
                                                }
                                                
                                                const toAdd = selectedIds.filter((id: number) => !existingStaffIds.includes(id));
                                                for (const id of toAdd) {
                                                  await fetchWithAuth('/api/academics/teaching-assignments/', { 
                                                    method: 'POST', 
                                                    body: JSON.stringify({ section_id: section.id, curriculum_row_id: subject.id, staff_id: id, is_active: true }) 
                                                  });
                                                }
                                                
                                                alert('Saved successfully');
                                                cancelEditing(section.id, subject.id);
                                                fetchData(true);
                                              } catch (e) {
                                                alert('Error saving assignments: ' + e);
                                              }
                                            }}
                                            className="p-2 text-green-600"""
text = save_c_pattern.sub(save_c_repl, text)

# Core save
save_core_pattern = re.compile(r"onClick=\{async \(\) => \{\s*const sel = document\.getElementById\(`staff-\$\{sec\.id\}-\$\{parent\.id\}`\) as HTMLSelectElement;.*?\}\}\s*className=\"p-1\.5 text-green-600", re.DOTALL)
save_core_repl = r"""onClick={async () => {
                                          const sel = document.getElementById(`staff-${sec.id}-${parent.id}`) as HTMLInputElement;
                                          const selectedIds = JSON.parse(sel?.value || '[]').map(Number).filter(Boolean);
                                          if (selectedIds.length === 0) return alert('Select a staff member');
                                          try {
                                            const existingStaffIds = existingAssignments.map((a: any) => a.staff_details?.id || a.staff);
                                            
                                            const toDelete = existingAssignments.filter((a: any) => !selectedIds.includes(a.staff_details?.id || a.staff));
                                            for (const a of toDelete) {
                                              await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
                                            }
                                            
                                            const toAdd = selectedIds.filter((id: number) => !existingStaffIds.includes(id));
                                            for (const id of toAdd) {
                                              await fetchWithAuth('/api/academics/teaching-assignments/', {
                                                method: 'POST',
                                                body: JSON.stringify({ section_id: sec.id, curriculum_row_id: parent.id, staff_id: id, is_active: true })
                                              });
                                            }
                                            
                                            cancelEditing(sec.id, parent.id);
                                            fetchData(true);
                                          } catch (e) { alert('Error: ' + e); }
                                        }}
                                        className="p-1.5 text-green-600"""
text = save_core_pattern.sub(save_core_repl, text)

# Elective save
save_elec_pattern = re.compile(r"onClick=\{async \(\) => \{\s*const sel = document\.getElementById\(`elective-staff-\$\{opt\.id\}`\) as HTMLSelectElement;.*?\}\}\s*className=\"p-1\.5 text-green-600", re.DOTALL)
save_elec_repl = r"""onClick={async () => {
                                        const sel = document.getElementById(`elective-staff-${opt.id}`) as HTMLInputElement;
                                        const selectedIds = JSON.parse(sel?.value || '[]').map(Number).filter(Boolean);
                                        if (selectedIds.length === 0) return alert('Select staff');
                                        try {
                                          const existingStaffIds = existingElectiveAssignments.map((a: any) => a.staff_details?.id || a.staff);
                                          
                                          const toDelete = existingElectiveAssignments.filter((a: any) => !selectedIds.includes(a.staff_details?.id || a.staff));
                                          for (const a of toDelete) {
                                            await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
                                          }
                                          
                                          const toAdd = selectedIds.filter((id: number) => !existingStaffIds.includes(id));
                                          for (const id of toAdd) {
                                            await fetchWithAuth('/api/academics/teaching-assignments/', {
                                              method: 'POST',
                                              body: JSON.stringify({ elective_subject_id: opt.id, staff_id: id, is_active: true })
                                            });
                                          }
                                          
                                          cancelEditingElective(opt.id);
                                          fetchData(true);
                                        } catch(e) { alert('Error: ' + e); }
                                      }}
                                      className="p-1.5 text-green-600"""
text = save_elec_pattern.sub(save_elec_repl, text)

# Bulk save course
bulk_course = re.compile(r"const staffSel = document\.getElementById\(`staff-\$\{section\.id\}-\$\{subject\.id\}`\) as HTMLSelectElement;\s*if \(\!staffSel\?\.value\) continue;\s*const existingAssignments = findExistingAssignments\(section\.id, subject\.id\);\s*try \{\s*if \(existingAssignments\[0\]\?\) \{.*?catch \(e\) \{\s*failureCount\+\+;\s*\}", re.DOTALL)
bulk_course_repl = r"""const staffSel = document.getElementById(`staff-${section.id}-${subject.id}`) as HTMLInputElement;
          if (!staffSel?.value) continue;
          const selectedIds = JSON.parse(staffSel.value || '[]').map(Number).filter(Boolean);
          if (selectedIds.length === 0) continue;

          const existingAssignments = findExistingAssignments(section.id, subject.id);
          
          try {
            const existingStaffIds = existingAssignments.map((a: any) => a.staff_details?.id || a.staff);
            
            const toDelete = existingAssignments.filter((a: any) => !selectedIds.includes(a.staff_details?.id || a.staff));
            for (const a of toDelete) {
              const res = await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
              if (!res.ok) failureCount++;
            }
            
            const toAdd = selectedIds.filter((id: number) => !existingStaffIds.includes(id));
            for (const id of toAdd) {
              const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
                method: 'POST', 
                body: JSON.stringify({ section_id: section.id, staff_id: id, curriculum_row_id: subject.id, is_active: true }) 
              });
              if (res.ok) successCount++;
              else failureCount++;
            }
          } catch (e) {
            failureCount++;
          }"""
text = bulk_course.sub(bulk_course_repl, text)

# Bulk save elective
bulk_elec = re.compile(r"const staffSel = document\.getElementById\(`elective-staff-\$\{opt\.id\}`\) as HTMLSelectElement;\s*if \(\!staffSel\?\.value\) continue;\s*const existingElectiveAssignments = findExistingElectiveAssignments\(opt\.id\);\s*try \{\s*if \(existingElectiveAssignments\[0\]\?\) \{.*?catch \(e\) \{\s*failureCount\+\+;\s*\}", re.DOTALL)
bulk_elec_repl = r"""const staffSel = document.getElementById(`elective-staff-${opt.id}`) as HTMLInputElement;
          if (!staffSel?.value) continue;
          const selectedIds = JSON.parse(staffSel.value || '[]').map(Number).filter(Boolean);
          if (selectedIds.length === 0) continue;

          const existingElectiveAssignments = findExistingElectiveAssignments(opt.id);
          
          try {
            const existingStaffIds = existingElectiveAssignments.map((a: any) => a.staff_details?.id || a.staff);
            
            const toDelete = existingElectiveAssignments.filter((a: any) => !selectedIds.includes(a.staff_details?.id || a.staff));
            for (const a of toDelete) {
              const res = await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
              if (!res.ok) failureCount++;
            }
            
            const toAdd = selectedIds.filter((id: number) => !existingStaffIds.includes(id));
            for (const id of toAdd) {
              const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
                method: 'POST', 
                body: JSON.stringify({ elective_subject_id: opt.id, staff_id: id, is_active: true }) 
              });
              if (res.ok) successCount++;
              else failureCount++;
            }
          } catch (e) {
            failureCount++;
          }"""
text = bulk_elec.sub(bulk_elec_repl, text)

# Fix deletes
del_c = re.compile(r"onClick=\{async \(\) => \{\s*if \(\!confirm\('Delete teaching assignment for this subject/section\?'\)\) return\s*try \{\s*const res = await fetchWithAuth\(`/api/academics/teaching-assignments/\$\{existingAssignments\[0\]\?\.id\}/`, \{ method: 'DELETE' \}\).*?\}\s*</button>", re.DOTALL)
del_c_repl = r"""onClick={async () => {
                                                    if (!confirm('Delete ALL teaching assignments for this subject/section?')) return
                                                    try {
                                                      for (const a of existingAssignments) {
                                                        await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' })
                                                      }
                                                      alert('Deleted'); cancelEditing(section.id, subject.id); fetchData(true)
                                                    } catch (e) { console.error(e); alert('Failed to delete') }
                                                  }}
                                                  className="p-2 text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                                  title="Delete Assignments"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>"""
text = del_c.sub(del_c_repl, text)

del_core = re.compile(r"onClick=\{async \(\) => \{\s*if \(\!confirm\('Remove this dept-core staff assignment\?'\)\) return;\s*try \{\s*const res = await fetchWithAuth\(`/api/academics/teaching-assignments/\$\{existingAssignments\[0\]\?\.id\}/`, \{ method: 'DELETE' \}\);.*?\}\s*</button>", re.DOTALL)
del_core_repl = r"""onClick={async () => {
                                            if (!confirm('Remove ALL dept-core staff assignments?')) return;
                                            try {
                                              for (const a of existingAssignments) {
                                                await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
                                              }
                                              cancelEditing(sec.id, parent.id); fetchData(true);
                                            } catch (e) { alert('Error: ' + e); }
                                          }}
                                          className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg border border-red-300"
                                          title="Delete Assignments"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>"""
text = del_core.sub(del_core_repl, text)

del_elec = re.compile(r"onClick=\{async \(\) => \{\s*if \(\!confirm\('Remove elective assignment\?'\)\) return;\s*try \{\s*const res = await fetchWithAuth\(`/api/academics/teaching-assignments/\$\{existingElectiveAssignments\[0\]\?\.id\}/`, \{ method: 'DELETE' \}\);.*?\}\s*</button>", re.DOTALL)
del_elec_repl = r"""onClick={async () => {
                                            if (!confirm('Remove ALL elective assignments?')) return;
                                            try {
                                              for (const a of existingElectiveAssignments) {
                                                await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, { method: 'DELETE' });
                                              }
                                              cancelEditingElective(opt.id); fetchData(true);
                                            } catch (e) { alert('Error: ' + e); }
                                          }}
                                          className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg border border-red-300"
                                          title="Delete Assignments"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>"""
text = del_elec.sub(del_elec_repl, text)

with open('/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx', 'w') as f:
    f.write(text)
