import { useTranslations } from "next-intl";
import Notice from "@/shared/ui/Notice";

/** Visible notice: guidance only, not financial advice. */
export default function DisclaimerBanner() {
  const t = useTranslations("landing.disclaimer");

  return (
    <section className="mx-auto max-w-5xl px-4 pb-12">
      <Notice variant="warning">{t("body")}</Notice>
    </section>
  );
}
