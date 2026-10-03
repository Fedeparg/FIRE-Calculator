import { createHash, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// Revalidación bajo demanda del contenido Markdown (wiki, explainers, legales y novedades): un
// webhook llama aquí tras editarlo y queda en vivo sin redesplegar. El token va SOLO en la
// cabecera `x-revalidate-token`: en la query acabaría en los logs de acceso del proxy. `?path=`
// revalida además una ruta. REVALIDATE_TOKEN vive en `.env`, nunca en el cliente.

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

// Tiempo constante (sin filtrar longitud ni prefijo por timing); se comparan hashes
// SHA-256 porque `timingSafeEqual` exige buffers del mismo tamaño.
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
