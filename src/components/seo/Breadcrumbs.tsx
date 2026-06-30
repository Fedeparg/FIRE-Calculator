import { useLocale } from "next-intl";

import { Link } from "@/i18n/navigation";
import { asLocale } from "@/core/types";
import { breadcrumbSchema, type BreadcrumbItem } from "@/lib/jsonld";
import JsonLd from "./JsonLd";

/**
 * Migas de pan accesibles que, además, emiten el `BreadcrumbList` de schema.org.
 * Una sola fuente para la versión visible y la estructurada (evita que se
 * desincronicen). El último elemento es la página actual (no enlazada).
 */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const locale = asLocale(useLocale());

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">/</span>}
                {isLast ? (
                  <span className="font-medium text-foreground" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className="font-medium text-brand hover:underline">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbSchema(items, locale)} />
    </>
  );
}
