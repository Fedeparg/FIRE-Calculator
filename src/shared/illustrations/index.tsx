// Custom inline SVG illustrations. Flat/line style with a subtle nautical theme (sextant,
// compass, stars, waves, heading). They ALWAYS use the theme's CSS color variables through
// Tailwind utilities (fill-*/stroke-*/text-*), so they work in light and dark mode without
// hard-coded colors. All are decorative: aria-hidden + focusable={false}.

type SvgProps = {
  className?: string;
};

/**
 * Stylized sextant for the hero. Draws the recognizable parts of a navigation sextant: eyelet,
 * index arm, braced frame wedge, graduated arc, telescope with rings and a drum with a lens.
 * The product metaphor: finding your bearings with your money.
 */
export function HeroSextant({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 400 384" role="presentation" aria-hidden="true" focusable="false" className={className}>
      {/* Soft background halo */}
      <circle cx="200" cy="198" r="160" className="fill-brand-soft" />

      {/* Sighted celestial body + navigation stars */}
      <g className="fill-accent">
        <Star cx={100} cy={110} r={14} />
        <Star cx={300} cy={96} r={11} />
      </g>
      <g className="fill-foreground/55">
        <Star cx={150} cy={56} r={6} />
        <Star cx={252} cy={58} r={6} />
        <Star cx={66} cy={150} r={7} />
      </g>

      {/* Instrument (scaled down to leave room before the halo's edge) */}
      <g transform="translate(200 198) scale(0.84) translate(-200 -198)">
        {/* Frame sides (the sextant's wedge) */}
        <g className="stroke-brand" strokeWidth="16" strokeLinecap="round">
          <line x1="200" y1="98" x2="58" y2="292" />
          <line x1="200" y1="98" x2="342" y2="292" />
        </g>

        {/* Inner bracing: arcs that stiffen the frame, concentric with the graduated arc */}
        <g fill="none" className="stroke-brand" strokeWidth="9" strokeLinecap="round">
          <path d="M92 276 A237 237 0 0 0 308 276" />
          <path d="M126 256 A205 205 0 0 0 274 256" />
        </g>

        {/* Graduated arc: wide scale at the base. Its center is the knob at the
          apex (200,66), so the curve bends away from it. */}
        <path
          d="M54 292 A270 270 0 0 0 346 292"
          fill="none"
          className="stroke-accent"
          strokeWidth="18"
          strokeLinecap="round"
        />

        {/* Telescope: horizontal cylinder with rings and a mouth, mounted next to the apex */}
        <g strokeLinejoin="round" strokeLinecap="round">
          <rect x="208" y="106" width="150" height="26" rx="13" className="fill-brand stroke-surface" strokeWidth="3" />
          <g className="stroke-surface" strokeWidth="5">
            <line x1="244" y1="106" x2="244" y2="132" />
            <line x1="262" y1="106" x2="262" y2="132" />
          </g>
          <rect x="352" y="100" width="14" height="38" rx="5" className="fill-brand stroke-surface" strokeWidth="3" />
        </g>

        {/* Index arm (alidade): from the apex to the drum */}
        <rect x="187" y="72" width="26" height="248" rx="11" className="fill-brand" />

        {/* Knob / eyelet at the apex, with its hole */}
        <circle cx="200" cy="66" r="26" className="fill-brand" />
        <circle cx="200" cy="60" r="10" className="fill-surface" />

        {/* Micrometer drum with a lens, mounted on the arc at the foot of the alidade */}
        <rect x="174" y="300" width="52" height="48" rx="15" className="fill-brand stroke-surface" strokeWidth="4" />
        <circle cx="200" cy="322" r="14" className="fill-accent stroke-surface" strokeWidth="3" />
      </g>
    </svg>
  );
}

/**
 * Compact compass for the header brand mark. The needle is rotated ~27° clockwise: the north
 * tip points slightly north-east.
 */
export function BrandCompass({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 32 32" role="presentation" aria-hidden="true" focusable="false" className={className}>
      <circle cx="16" cy="16" r="13" fill="none" className="stroke-current" strokeWidth="2.5" />
      {/* Needle (heading), rotated 27° clockwise */}
      <g transform="rotate(27 16 16)">
        <path d="M16 6 L20 16 L16 26 L12 16 Z" className="fill-current" />
      </g>
      <circle cx="16" cy="16" r="2.5" className="fill-current opacity-60" />
    </svg>
  );
}

/** Full calculator suite: layers/grid of tools. */
export function IconSuite({ className }: SvgProps) {
  return (
    <PillarFrame className={className}>
      <g className="stroke-brand" strokeWidth="3.5" fill="none" strokeLinejoin="round">
        <rect x="14" y="14" width="20" height="20" rx="4" className="fill-brand-soft" />
        <rect x="38" y="14" width="20" height="20" rx="4" />
        <rect x="14" y="38" width="20" height="20" rx="4" />
        <rect x="38" y="38" width="20" height="20" rx="4" className="fill-brand-soft" />
      </g>
    </PillarFrame>
  );
}

/** Spanish tax focus: scales / balance. */
export function IconTax({ className }: SvgProps) {
  return (
    <PillarFrame className={className}>
      <g className="stroke-brand" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="36" y1="16" x2="36" y2="54" />
        <line x1="20" y1="54" x2="52" y2="54" />
        <line x1="18" y1="26" x2="54" y2="26" />
        {/* Pans */}
        <path d="M12 26 L24 26 L18 40 Z" className="fill-brand-soft" />
        <path d="M48 26 L60 26 L54 40 Z" className="fill-brand-soft" />
      </g>
      <circle cx="36" cy="22" r="4" className="fill-accent" />
    </PillarFrame>
  );
}

/** Learn: open book with a guiding star. */
export function IconLearn({ className }: SvgProps) {
  return (
    <PillarFrame className={className}>
      <g className="stroke-brand" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M36 22 C30 17 20 17 14 20 L14 50 C20 47 30 47 36 52" className="fill-brand-soft" />
        <path d="M36 22 C42 17 52 17 58 20 L58 50 C52 47 42 47 36 52" />
      </g>
      <g className="fill-accent">
        <Star cx={36} cy={14} r={5} />
      </g>
    </PillarFrame>
  );
}

/** Your portfolio in one place: rising chart with a heading star. */
export function IconPortfolio({ className }: SvgProps) {
  return (
    <PillarFrame className={className}>
      <g className="stroke-brand" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Axes */}
        <path d="M16 14 L16 56 L58 56" />
        {/* Bars */}
        <rect x="24" y="40" width="8" height="16" rx="2" className="fill-brand-soft" />
        <rect x="38" y="32" width="8" height="24" rx="2" className="fill-brand-soft" />
        <rect x="52" y="24" width="8" height="32" rx="2" className="fill-brand-soft" />
      </g>
      {/* Trend line */}
      <path
        d="M22 44 L36 34 L50 28 L60 18"
        fill="none"
        className="stroke-accent"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="fill-accent">
        <Star cx={60} cy={16} r={5} />
      </g>
    </PillarFrame>
  );
}

/** Nav icon: calculator (line art, inherits the text color). */
export function IconNavCalculator({ className }: SvgProps) {
  return (
    <NavIcon className={className}>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11.5" x2="8" y2="11.5" />
      <line x1="12" y1="11.5" x2="12" y2="11.5" />
      <line x1="16" y1="11.5" x2="16" y2="11.5" />
      <line x1="8" y1="15.5" x2="8" y2="15.5" />
      <line x1="12" y1="15.5" x2="12" y2="15.5" />
      <line x1="16" y1="15.5" x2="16" y2="15.5" />
    </NavIcon>
  );
}

/** Nav icon: open book (line art, inherits the text color). */
export function IconNavLearn({ className }: SvgProps) {
  return (
    <NavIcon className={className}>
      <path d="M12 6 C9 4 6 4 3.5 5 L3.5 18 C6 17 9 17 12 19" />
      <path d="M12 6 C15 4 18 4 20.5 5 L20.5 18 C18 17 15 17 12 19" />
    </NavIcon>
  );
}

/** Nav icon: user profile (line art, inherits the text color). */
export function IconNavProfile({ className }: SvgProps) {
  return (
    <NavIcon className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20 C5 16 8 14 12 14 C16 14 19 16 19 20" />
    </NavIcon>
  );
}

/** Decorative divider wave (heading / sea). */
export function WaveDivider({ className }: SvgProps) {
  return (
    <svg
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M0 30 Q150 0 300 30 T600 30 T900 30 T1200 30" fill="none" className="stroke-border" strokeWidth="3" />
    </svg>
  );
}

// --- Internal helpers ---

function PillarFrame({ className, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 72 72" role="presentation" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

function NavIcon({ className, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  // Four-pointed star (compass rose), drawn as a sharp rhombus.
  const d = `M${cx} ${cy - r} Q${cx + r * 0.25} ${cy - r * 0.25} ${cx + r} ${cy} Q${
    cx + r * 0.25
  } ${cy + r * 0.25} ${cx} ${cy + r} Q${cx - r * 0.25} ${cy + r * 0.25} ${cx - r} ${cy} Q${
    cx - r * 0.25
  } ${cy - r * 0.25} ${cx} ${cy - r} Z`;
  return <path d={d} />;
}
