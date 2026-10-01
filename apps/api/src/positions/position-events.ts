/**
 * Emitido tras dar de alta una posición, o tras editarla si cambió de símbolo (los mismos
 * dos sitios que ya disparan `PricesService.primeSymbol`, ver `positions.service.ts`).
 *
 * Existe para que `PortfolioSnapshotsService` pueda backfillear el histórico reciente del
 * usuario SIN que `PositionsModule` importe `PortfolioModule` — `PortfolioModule` ya importa
 * `PositionsModule` (para `PortfolioValuationService`), así que la dirección inversa crearía
 * un ciclo. Un evento de dominio desacopla ambos módulos sin recurrir a `forwardRef`, patrón
 * que el resto del código ya evita a propósito (ver `position-lots.service.ts`,
 * `daily-jobs.scheduler.ts`).
 */
export const POSITION_CREATED_EVENT = 'position.created';

export interface PositionCreatedEvent {
  userId: string;
}

/**
 * Emitido tras añadir, editar o borrar un lote de una posición existente (ver
 * `position-lots.controller.ts`). Un lote con fecha anterior puede necesitar más histórico de
 * precios y siempre cambia la reconstrucción de la evolución; `PortfolioSnapshotsService` lo
 * atiende (mismo desacoplo por evento que `POSITION_CREATED_EVENT`).
 */
export const LOT_CHANGED_EVENT = 'position.lot-changed';

export interface LotChangedEvent {
  userId: string;
  positionId: string;
  /**
   * Fecha (YYYY-MM-DD) de una operación que ha DEJADO de existir donde estaba: la de un lote
   * borrado o la anterior de uno movido de fecha. Esos cambios no dejan marca de tiempo en
   * `position_lots`, así que el evento la lleva para que las capturas reales desde esa fecha se
   * den por obsoletas (ver `staleSnapshotDates`). Ausente si el cambio sí deja marca (alta,
   * edición, `declareState`).
   */
  invalidateFrom?: string;
}
