// Iconografía de las categorías del changelog, en SVG inline: la CSP del sitio es
// una allowlist estricta de `'self'`, así que no hay (ni puede haber) librería de
// iconos externa. Todos heredan el color con `currentColor`, de modo que el tema
// claro/oscuro los resuelve solo, y son decorativos (`aria-hidden`): la categoría
// va SIEMPRE acompañada de su texto, el icono es redundancia visual, no la única
// pista. Formas deliberadamente distintas entre sí (estrella, tirita, escudo,
// rayo, bandera, controles) para que se diferencien sin depender del color.

import type { ChangelogCategory } from "@/core/changelog";

type IconProps = { className?: string };

/** Envoltorio común: viewBox 24×24, decorativo y sin foco. */
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Nueva funcionalidad: estrella. */
function StarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

/** Corrección: tirita (parche) en diagonal. */
function PatchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="M9.2 9.2l5.6 5.6" strokeOpacity="0.45" />
      <circle cx="10.6" cy="13.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Seguridad: escudo con visto bueno. */
function ShieldIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 2.8l7 2.8v5.2c0 4.3-2.9 8-7 9.4-4.1-1.4-7-5.1-7-9.4V5.6l7-2.8z" />
      <path d="M9 11.8l2.1 2.1 3.9-4" />
    </Svg>
  );
}

/** Rendimiento: rayo. */
function BoltIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13.4 2.5L5.5 13.2h5.3L10.6 21.5l7.9-10.7h-5.3z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Hito: bandera en su mástil. */
function FlagIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 2.8v18.4" />
      <path d="M6 4.2h11l-2.6 3.7 2.6 3.7H6z" />
    </Svg>
  );
}

/** Cambio interno: controles deslizantes (fontanería, ajustes). */
function SlidersIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 8h9M17 8h3.5M3.5 16h5M13 16h7.5" />
      <circle cx="14.8" cy="8" r="2.2" />
      <circle cx="10.8" cy="16" r="2.2" />
    </Svg>
  );
}

const CATEGORY_ICONS: Record<ChangelogCategory, (props: IconProps) => React.ReactElement> = {
  feature: StarIcon,
  fix: PatchIcon,
  security: ShieldIcon,
  performance: BoltIcon,
  milestone: FlagIcon,
  internal: SlidersIcon,
};

/** Icono de una categoría de cambio. Decorativo: el texto de la etiqueta va aparte. */
export function CategoryIcon({ category, className }: { category: ChangelogCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={className} />;
}

/** Destello de las entregas destacadas (`highlight`). */
export function SparkleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 2.2l2.1 6 6 2.1-6 2.1-2.1 6-2.1-6-6-2.1 6-2.1z" fill="currentColor" stroke="none" />
      <path d="M18.8 15.4l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8z" fill="currentColor" stroke="none" />
    </Svg>
  );
}
