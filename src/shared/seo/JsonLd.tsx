/**
 * Inserta datos estructurados JSON-LD en la página. Acepta uno o varios objetos
 * de schema.org (ver `src/shared/seo/json-ld.ts`). Escapa `<` para evitar que el
 * contenido cierre el `<script>` o inyecte marcado.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
