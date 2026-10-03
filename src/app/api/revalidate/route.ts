import { createHash, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// On-demand revalidation of Markdown content (wiki, explainers, legal pages and changelog): a
// webhook calls this after an edit and the change goes live without a redeploy. The token goes
// ONLY in the `x-revalidate-token` header: in the query string it would end up in the proxy access
// logs. `?path=` also revalidates one route. REVALIDATE_TOKEN lives in `.env`, never on the client.

const CONTENT_ROUTE_PATTERNS = [
  "/[locale]/aprende",
  "/[locale]/aprende/[slug]",
  "/[locale]/calculadoras/[slug]",
  "/[locale]/legal/[slug]",
  "/[locale]/novedades",
] as const;

function getToken(request: NextRequest): string | null {
  return request.headers.get("x-revalidate-token");
}

// Constant time (leaks neither length nor prefix through timing); SHA-256 hashes are
// compared because `timingSafeEqual` requires buffers of the same size.
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_TOKEN;
  if (!expected) {
    return NextResponse.json({ revalidated: false, message: "REVALIDATE_TOKEN is not configured." }, { status: 500 });
  }

  const provided = getToken(request);
  if (!provided || !tokensMatch(provided, expected)) {
    return NextResponse.json({ revalidated: false, message: "Invalid or missing token." }, { status: 401 });
  }

  for (const pattern of CONTENT_ROUTE_PATTERNS) {
    revalidatePath(pattern, "page");
  }

  const extraPath = request.nextUrl.searchParams.get("path");
  if (extraPath) revalidatePath(extraPath);

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
