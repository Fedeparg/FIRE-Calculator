import { Module } from '@nestjs/common';

import { DataRetentionJob } from './data-retention.js';

/** Poda periódica de datos que ya no sirven (tokens, auditoría MCP, clientes DCR abandonados). */
@Module({
  providers: [DataRetentionJob],
})
export class DataRetentionModule {}
