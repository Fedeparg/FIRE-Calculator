// Parser CSV mínimo (RFC 4180), propio: el formato es pequeño y estable y así el código que toca
// datos financieros se audita entero.

/** Registro con la línea (1-based) donde empieza. */
export type CsvRecord = { line: number; fields: string[] };

/** CSV mal formado (comilla sin cerrar o fuera de sitio). */
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
 * Trocea `text` en registros: campos entrecomillados (comas, saltos de línea, `""`), LF o CRLF y BOM
 * inicial; ignora líneas vacías.
 *
 * @throws {CsvSyntaxError} ante comilla sin cerrar o texto tras la comilla de cierre.
 */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  // tras cerrar comillas solo puede venir coma, fin de línea o fin de texto
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
    // una línea vacía produce un único campo vacío: no es un registro
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
      // CRLF cuenta como un único terminador
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
  // Último registro sin terminador final.
  if (field !== "" || fields.length > 0 || afterQuote) {
    endRecord();
  }
  return records;
}
