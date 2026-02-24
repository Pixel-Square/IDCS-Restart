declare module 'xlsx' {
  export type WorkSheet = Record<string, unknown>;

  export type WorkBook = {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  } & Record<string, unknown>;

  export const utils: {
    book_new: () => WorkBook;
    aoa_to_sheet: (data: Array<Array<string | number>>) => WorkSheet;
    book_append_sheet: (workbook: WorkBook, worksheet: WorkSheet, name: string) => void;
    sheet_to_json: (worksheet: WorkSheet, opts?: Record<string, unknown>) => unknown[][];
  };

  export function read(data: unknown, opts?: Record<string, unknown>): WorkBook;
  export function writeFile(workbook: WorkBook, filename: string): void;
}
