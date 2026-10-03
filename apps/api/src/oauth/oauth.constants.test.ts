import { describe, expect, it } from 'vitest';

import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE, withImpliedScopes } from './oauth.constants.js';

describe('withImpliedScopes', () => {
  it('adds portfolio:read when portfolio:write is granted', () => {
    expect(withImpliedScopes([SCOPE_PORTFOLIO_WRITE])).toEqual([SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE]);
  });

  it('leaves already consistent scopes as they are, without duplicating or reordering', () => {
    expect(withImpliedScopes([SCOPE_PORTFOLIO_READ])).toEqual([SCOPE_PORTFOLIO_READ]);
    expect(withImpliedScopes([SCOPE_PORTFOLIO_WRITE, SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE])).toEqual([
      SCOPE_PORTFOLIO_WRITE,
      SCOPE_PORTFOLIO_READ,
    ]);
    expect(withImpliedScopes([])).toEqual([]);
  });
});
