/** Creation or symbol change. An event instead of an import to avoid a cycle with `PortfolioModule`. */
export const POSITION_CREATED_EVENT = 'position.created';

export interface PositionCreatedEvent {
  userId: string;
}

export const LOT_CHANGED_EVENT = 'position.lot-changed';

export interface LotChangedEvent {
  userId: string;
  positionId: string;
  /** Date of a trade that is no longer where it was (lot deleted or moved); invalidates captures from there (see `staleSnapshotDates`). */
  invalidateFrom?: string;
}
