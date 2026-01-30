export function normalizeAnalysisKey(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function defaultAnalysisMapping(): Record<string, boolean[]> {
  return {};
}

export const analysisOptionLabels: string[] = [
  'Technical magazine',
  'Journal paper reading',
  'Real time problems',
  'Case study',
  'Dipstick (Writing explanation content of CO)',
  'Dipstick (Sketch Representation)',
  'Real time Photography or Video Explanation',
  'Course competition',
  'Active Learing Exercies (Group Discussion)',
  'Active Learing Exercies (Technical Question and answering Session)',
  'Technical Role play',
  'Interview Assessment',
  'Active Projects',
  'Journal Preparation',
];
