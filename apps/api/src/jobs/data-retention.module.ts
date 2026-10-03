import { Module } from '@nestjs/common';

import { DataRetentionJob } from './data-retention.js';

/** Periodic pruning of data that is no longer needed (tokens, MCP audit log, abandoned DCR clients). */
@Module({
  providers: [DataRetentionJob],
})
export class DataRetentionModule {}
