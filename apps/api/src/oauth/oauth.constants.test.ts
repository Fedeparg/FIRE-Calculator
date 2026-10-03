import { describe, expect, it } from 'vitest';

import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE, withImpliedScopes } from './oauth.constants.js';

describe('withImpliedScopes', () => {
  it('añade portfolio:read cuando se concede portfolio:write', () => {
    expect(withImpliedScopes([SCOPE_PORTFOLIO_WRITE])).toEqual([SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE]);
  });

  it('deja igual lo que ya es coherente, sin duplicar ni reordenar', () => {
    expect(withImpliedScopes([SCOPE_PORTFOLIO_READ])).toEqual([SCOPE_PORTFOLIO_READ]);
    expect(withImpliedScopes([SCOPE_PORTFOLIO_WRITE, SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE])).toEqual([
      SCOPE_PORTFOLIO_WRITE,
      SCOPE_PORTFOLIO_READ,
    ]);
    expect(withImpliedScopes([])).toEqual([]);
  });
});
