import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const t = useTranslations("site");
  const tNav = useTranslations("nav");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg"
          >
            €
          </span>
          <span className="text-foreground">{t("title")}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/aprende"
            className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            {tNav("learn")}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
