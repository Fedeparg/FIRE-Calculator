import { useTranslations } from "next-intl";
import Notice from "@/shared/ui/Notice";

/** Aviso visible: información orientativa, no asesoramiento financiero. */
export default function DisclaimerBanner() {
  const t = useTranslations("landing.disclaimer");

  return (
    <section className="mx-auto max-w-5xl px-4 pb-12">
      <Notice variant="warning">{t("body")}</Notice>
    </section>
  );
}
