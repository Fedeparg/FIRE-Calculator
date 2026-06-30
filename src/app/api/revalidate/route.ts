import { createHash, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// Revalidación bajo demanda de la wiki: tras editar los ficheros Markdown en el
// servidor (o hacer `git pull` de un repo de contenido), un webhook llama a este
// endpoint y el contenido nuevo queda en vivo SIN redesplegar la app.
//
// Uso:
//   POST /api/revalidate           (cabecera  x-revalidate-token: <TOKEN>)
//   POST /api/revalidate?token=...  (token por query, p. ej. para webhooks)
//   POST /api/revalidate?path=/aprende   (revalida además una ruta concreta)
//
// El token vive en `.env` (REVALIDATE_TOKEN) y nunca se expone al cliente.

// Patrones de ruta (con segmento [locale]) que dependen del contenido editable.
const WIKI_ROUTE_PATTERNS = [
  "/[locale]/aprende",
  "/[locale]/aprende/[slug]",
  "/[locale]/calculadoras/[slug]",
] as const;

function getToken(request: NextRequest): string | null {
  return (
    request.headers.get("x-revalidate-token") ??
    request.nextUrl.searchParams.get("token")
  );
}

/**
 * Compara dos tokens en tiempo constante (evita filtrar la longitud o el prefijo
 * coincidente por timing). Se comparan los hashes SHA-256 para igualar longitudes,
 * ya que `timingSafeEqual` exige buffers del mismo tamaño.
 */
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { revalidated: false, message: "REVALIDATE_TOKEN is not configured." },
      { status: 500 },
    );
  }

  const provided = getToken(request);
  if (!provided || !tokensMatch(provided, expected)) {
    return NextResponse.json(
      { revalidated: false, message: "Invalid or missing token." },
      { status: 401 },
    );
  }

  for (const pattern of WIKI_ROUTE_PATTERNS) {
    revalidatePath(pattern, "page");
  }

  // Opcional: revalida también una ruta literal concreta (?path=/aprende/...).
  const extraPath = request.nextUrl.searchParams.get("path");
  if (extraPath) revalidatePath(extraPath);

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
