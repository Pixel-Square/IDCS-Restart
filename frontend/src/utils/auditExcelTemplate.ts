import * as XLSX from 'xlsx';

export const downloadAuditQuestionTemplate = () => {
  const wsData = [
    ['S.No', 'Details', 'Documents Checklist', 'Detailed Description', 'Max Marks'],
    [1, 'Example question here', 'List of documents required', 'Detailed explanation of what the question expects', 10],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Auto-size columns slightly
  const wscols = [
    { wch: 10 },
    { wch: 60 },
    { wch: 40 },
    { wch: 50 },
    { wch: 15 },
  ];
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  
  XLSX.writeFile(wb, 'AuditQuestions_Template.xlsx');
};
