import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { EcbReferenceRatesProvider, REFERENCE_RATES_PROVIDER } from './ecb-reference-rates.provider.js';
import { ReferenceRatesController } from './reference-rates.controller.js';
import { ReferenceRatesService } from './reference-rates.service.js';

/** Official exchange rates for tax purposes; the source is injected by token (see `PricesModule`). */
@Module({
  imports: [SessionModule],
  controllers: [ReferenceRatesController],
  providers: [ReferenceRatesService, { provide: REFERENCE_RATES_PROVIDER, useClass: EcbReferenceRatesProvider }],
  // Also used by the MCP capital gains tool.
  exports: [ReferenceRatesService],
})
export class FxReferenceModule {}
