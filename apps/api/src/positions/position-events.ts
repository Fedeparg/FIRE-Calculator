/** Alta o cambio de símbolo. Evento en vez de import para no crear un ciclo con `PortfolioModule`. */
export const POSITION_CREATED_EVENT = 'position.created';

export interface PositionCreatedEvent {
  userId: string;
}

export const LOT_CHANGED_EVENT = 'position.lot-changed';

export interface LotChangedEvent {
  userId: string;
  positionId: string;
  /** Fecha de una operación que ya no está donde estaba (lote borrado o movido); invalida las capturas desde ahí (ver `staleSnapshotDates`). */
  invalidateFrom?: string;
}
