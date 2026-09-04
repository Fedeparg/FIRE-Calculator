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
