declare module 'xlsx' {
  export interface CellObject {
    /** Cell type: b Boolean, e Error, n Number, d Date, s String, z Stub */
    t: string;
    /** Cell value */
    v?: unknown;
    /** Formatted text (if applicable) */
    w?: string;
    /** Cell formula */
    f?: string;
    [key: string]: unknown;
  }

  export type WorkSheet = Record<string, CellObject | unknown>;

  export type WorkBook = {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  } & Record<string, unknown>;

  export const utils: {
    book_new: () => WorkBook;
    aoa_to_sheet: (data: Array<Array<string | number>>) => WorkSheet;
    book_append_sheet: (workbook: WorkBook, worksheet: WorkSheet, name: string) => void;
    sheet_to_json: (worksheet: WorkSheet, opts?: Record<string, unknown>) => unknown[][];
    encode_cell: (cell: { r: number; c: number }) => string;
  };

  export function read(data: unknown, opts?: Record<string, unknown>): WorkBook;
  export function writeFile(workbook: WorkBook, filename: string): void;
}
