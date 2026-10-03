import { BadRequestException } from '@nestjs/common';
import {
  parseTradeRepublicCsv,
  TradeRepublicParseError,
  type TradeRepublicParseErrorCode,
} from '@sextante/core/imports/trade-republic';
import type { ImportParseResult } from '@sextante/core/imports/types';

const PARSE_ERROR_MESSAGES: Record<TradeRepublicParseErrorCode, string> = {
  EMPTY_FILE: 'El fichero está vacío o no contiene operaciones',
  MALFORMED_CSV: 'El fichero no es un CSV válido',
  NOT_TRADE_REPUBLIC: 'El fichero no es una exportación de transacciones de Trade Republic',
  TOO_MANY_ROWS: 'El fichero tiene demasiadas filas',
};

/** Re-parses the CSV, turning parser errors into a 400 with a stable code. */
export function parseOrThrow(csv: string): ImportParseResult {
  try {
    return parseTradeRepublicCsv(csv);
  } catch (error) {
    if (error instanceof TradeRepublicParseError) {
      // The parser's message is in English for the logs; the user gets the code and a fixed text.
      throw new BadRequestException({ code: error.code, message: PARSE_ERROR_MESSAGES[error.code] });
    }
    throw error;
  }
}
