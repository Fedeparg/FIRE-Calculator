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
}
