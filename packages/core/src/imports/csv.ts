// Minimal in-house CSV parser (RFC 4180): the format is small and stable, and this way the code
// that handles financial data can be audited in full.

/** Record with the (1-based) line where it starts. */
export type CsvRecord = { line: number; fields: string[] };

/** Malformed CSV (unterminated or misplaced quote). */
export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "CsvSyntaxError";
  }
}

/**
 * Splits `text` into records: quoted fields (commas, line breaks, `""`), LF or CRLF and a leading
 * BOM; ignores empty lines.
 *
 * @throws {CsvSyntaxError} on an unterminated quote or text after the closing quote.
 */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  // after a closing quote only a comma, end of line or end of text may follow
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const endField = (): void => {
    fields.push(field);
    field = "";
    afterQuote = false;
  };
  const endRecord = (): void => {
    endField();
    // an empty line yields a single empty field: it is not a record
    if (!(fields.length === 1 && fields[0] === "")) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    if (char === ",") {
      endField();
    } else if (char === "\n" || char === "\r") {
      // CRLF counts as a single terminator
      if (char === "\r" && input[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (afterQuote) {
      throw new CsvSyntaxError("Unexpected character after closing quote", line);
    } else if (char === '"' && field === "") {
      inQuotes = true;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new CsvSyntaxError("Unterminated quoted field", recordLine);
  }
  // Last record without a trailing terminator.
  if (field !== "" || fields.length > 0 || afterQuote) {
    endRecord();
  }
  return records;
}
