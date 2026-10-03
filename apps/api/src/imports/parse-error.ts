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

/** Reparsea el CSV traduciendo los errores del parser a 400 con código estable. */
export function parseOrThrow(csv: string): ImportParseResult {
  try {
    return parseTradeRepublicCsv(csv);
  } catch (error) {
    if (error instanceof TradeRepublicParseError) {
      // El mensaje del parser va en inglés para logs; al usuario le llega el código y un texto fijo.
      throw new BadRequestException({ code: error.code, message: PARSE_ERROR_MESSAGES[error.code] });
    }
    throw error;
  }
}
