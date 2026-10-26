import { turnstileEnabled } from "@/lib/turnstile";
import { conditionMet } from "@/lib/conditions";
import { liveFeatures } from "@/lib/liveFeatures";
import { LegalDoc, legalLangFor } from "@/components/LegalDoc";
import { PrivacyEn } from "./PrivacyEn";
import { PrivacyPtBR } from "./PrivacyPtBR";
import { PrivacyTh } from "./PrivacyTh";
import { legalDateLabel, PRIVACY_PUBLISHED } from "@/lib/legalVersions";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // The Turnstile row shows only while it's switched on (site key set), and
  // the SolvyAI / LINE blocks only once those features are live
  // (content/help/conditions.json), so the policy matches what runs.
  const solvyai = conditionMet("solvyai-live");
  const line = conditionMet("line-live");
  // Patient notices wait ~1 minute in an outbox with a 30-day delivery
  // record (migration 135): published before its sender is switched on.
  const notices = conditionMet("notice-outbox-live");
  // The automatic WhatsApp confirmation/cancellation waits in the same kind
  // of outbox (migration 137): §6e shows for either, naming WhatsApp.
  const whatsapp = conditionMet("whatsapp-outbox-live");
  // Patient address, CNS and administrative notes (migration 138) in §3.2.
  const address = conditionMet("patient-address-live");
  // The Founders Program section only while its page is live.
  const founders = liveFeatures.founders;
  // The test-export paragraph: only once uploads are live (132 + the purge).
  const founderUploads = founders && conditionMet("founders-upload-live");
  // Secretary invites by email (migration 151): §3.7 and the Resend row.
  const secretaryInvites = conditionMet("secretary-invite-email-live");
  // The practice-closure notices queued by close_my_account (173), once live.
  const closureNotices = conditionMet("closure-notices-live");
  // Automatic WhatsApp through Z-API and WhatsApp (Meta): the §5 rows and
  // §6e's line, revealed with the first real enablement (cf, 6 Oct).
  const whatsappAuto = conditionMet("whatsapp-auto-live");
  // A doctor's private colleague list (167), once Refer a colleague is live.
  const referrals = conditionMet("referrals-live");
  // 1.8.0: certificates, declarations and exam requests (189) in the clinical-record lists;
  // documents shared with / sent by patients (190) in 3.8, 6g and 7.
  const clinicalDocs = conditionMet("clinical-documents-live");
  const patientDocs = conditionMet("patient-documents-live");
  // 1.8.0 C2: patients completing the details their professional asks for.
  const selfFields = conditionMet("c2-patient-step-live");
  // Demo mode (§6h + the §9 line): published with the demo_mode flip.
  const demo = conditionMet("demo-mode-live");
  // Privacy 2026-10-28 (Vitor's OKs, 10-27; specs/privacy-approved-lines-2026-10-27.md
  // and specs/patient-channel-privacy-draft.md): each part only with its feature.
  // Flipping any of them needs PRIVACY_VERSION 2026-10-28 (the mobile privacy-accept migration applied first).
  const appDemo = demo && conditionMet("app-demo-live");
  const patientChannel = conditionMet("patient-channel-live");
  const pcCover = conditionMet("pc-cover-live");
  const pcAi = conditionMet("pc-ai-live");
  const reminders = conditionMet("reminders-live");
  const appReferrer = conditionMet("app-referrer-live");
  const v1028 = { appDemo, patientChannel, pcCover, pcAi, reminders, appReferrer };
  // The Thai text (a draft until Vitor's first pass): only for /th, only once
  // privacy-th-live is met; until then Thai readers get the English page.
  const thai = conditionMet("privacy-th-live");
  if (legalLangFor(locale, thai) === "th") {
    return (
      <LegalDoc locale={locale} thai title="นโยบายความเป็นส่วนตัว" updated={`ปรับปรุงล่าสุด: ${legalDateLabel("th", PRIVACY_PUBLISHED)}`}>
        <PrivacyTh turnstile={turnstileEnabled} solvyai={solvyai} line={line} notices={notices} whatsapp={whatsapp} address={address} founders={founders} founderUploads={founderUploads} secretaryInvites={secretaryInvites} closureNotices={closureNotices} whatsappAuto={whatsappAuto} referrals={referrals} clinicalDocs={clinicalDocs} patientDocs={patientDocs} selfFields={selfFields} demo={demo} {...v1028} />
      </LegalDoc>
    );
  }
  return legalLangFor(locale) === "pt-BR" ? (
    <LegalDoc locale={locale} title="Política de Privacidade" updated={`Última atualização: ${legalDateLabel("pt-BR", PRIVACY_PUBLISHED)}`}>
      <PrivacyPtBR turnstile={turnstileEnabled} solvyai={solvyai} line={line} notices={notices} whatsapp={whatsapp} address={address} founders={founders} founderUploads={founderUploads} secretaryInvites={secretaryInvites} closureNotices={closureNotices} whatsappAuto={whatsappAuto} referrals={referrals} clinicalDocs={clinicalDocs} patientDocs={patientDocs} selfFields={selfFields} demo={demo} {...v1028} />
    </LegalDoc>
  ) : (
    <LegalDoc locale={locale} title="Privacy Policy" updated={`Last updated: ${legalDateLabel("en", PRIVACY_PUBLISHED)}`}>
      <PrivacyEn turnstile={turnstileEnabled} solvyai={solvyai} line={line} notices={notices} whatsapp={whatsapp} address={address} founders={founders} founderUploads={founderUploads} secretaryInvites={secretaryInvites} closureNotices={closureNotices} whatsappAuto={whatsappAuto} referrals={referrals} clinicalDocs={clinicalDocs} patientDocs={patientDocs} selfFields={selfFields} demo={demo} {...v1028} />
    </LegalDoc>
  );
}
