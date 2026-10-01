// Parser CSV mínimo conforme a RFC 4180. Es propio (en vez de una dependencia) porque el
// formato que necesitamos es pequeño y estable, y porque así el código que toca datos
// financieros del usuario es el nuestro y se audita entero.

/** Un registro del CSV con la línea (1-based) donde empieza, para poder reportar filas. */
export type CsvRecord = { line: number; fields: string[] };

/** El texto no es un CSV bien formado (comilla sin cerrar o comilla fuera de sitio). */
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
 * Trocea `text` en registros. Admite campos entrecomillados con comas, saltos de línea y
 * comillas escapadas (`""`), terminadores LF o CRLF y BOM inicial. Las líneas totalmente
 * vacías se ignoran.
 *
 * @throws {CsvSyntaxError} ante una comilla sin cerrar o texto pegado tras la comilla de cierre.
 */
export function parseCsv(text: string): CsvRecord[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  // Tras cerrar unas comillas solo puede venir coma, fin de línea o fin de texto.
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
    // Una línea vacía produce un único campo vacío: no es un registro.
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
      // CRLF cuenta como un único terminador.
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
