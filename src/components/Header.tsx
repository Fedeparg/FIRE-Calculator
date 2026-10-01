import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BrandCompass, IconNavCalculator, IconNavLearn } from "./illustrations";
import AuthNav from "./auth/AuthNav";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const t = useTranslations("site");
  const tNav = useTranslations("nav");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="order-1 flex items-center gap-2 font-semibold">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg"
          >
            <BrandCompass className="h-5 w-5" />
          </span>
          <span className="text-foreground">{t("title")}</span>
        </Link>
        {/* Móvil: marca e idioma/tema en la primera fila y la navegación debajo, a todo el ancho.
            Desde `sm` todo va en una fila, con los controles al final. */}
        <div className="order-2 flex items-center gap-2 sm:order-3">
          <span aria-hidden className="mr-1 hidden h-5 w-px bg-border sm:block" />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <nav
          className="order-3 -mx-2 flex w-full flex-wrap items-center gap-x-1 sm:order-2 sm:mx-0 sm:ml-auto sm:w-auto sm:gap-x-2"
          aria-label={tNav("primary")}
        >
          <Link
            href="/calculadoras"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium sm:min-h-0 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconNavCalculator className="h-4 w-4" />
            {tNav("home")}
          </Link>
          <Link
            href="/aprende"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium sm:min-h-0 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconNavLearn className="h-4 w-4" />
            {tNav("learn")}
          </Link>
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
