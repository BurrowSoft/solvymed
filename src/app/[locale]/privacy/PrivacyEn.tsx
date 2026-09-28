import { Mail, Section, Table } from "@/components/LegalDoc";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";

// English Privacy Policy (authoritative with pt-BR; keep both in step).
// Every statement here must match what the Service enforces today.
export function PrivacyEn({ turnstile }: { turnstile: boolean }) {
  return (
    <>
      <Section title="1. Overview">
        <p>
          SolvyMed is a clinic management platform (mobile app and website, the &quot;Service&quot;) operated by
          Vitor Carvalho, an individual, trading as BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000,
          Thailand (&quot;BurrowSoft&quot;, &quot;we&quot;). This policy explains what personal data we process, why, and your
          rights under the Brazilian General Data Protection Law (LGPD, Lei n.º 13.709/2018) and, where
          applicable, other data protection laws.
        </p>
      </Section>

      <Section title="2. Our role">
        <ul>
          <li>
            For <strong>account data</strong> of professionals, secretaries and patients (name, email, login,
            subscription), BurrowSoft is the <strong>controller</strong>.
          </li>
          <li>
            For <strong>patient records</strong> that a professional enters (clinical notes, prescriptions, exams,
            files, appointments), the <strong>professional or clinic is the controller</strong> and BurrowSoft is
            the <strong>operator</strong> (processor), acting only on their instructions. Requests about those
            records should go to the clinic first. We will help the clinic answer them.
          </li>
        </ul>
      </Section>

      <Section title="3. Information we collect">
        <p><strong>3.1 Account information:</strong> name, email and password (stored only as a secure hash). Professionals may add their specialty, professional registration, clinic name, address, phone, CNPJ (tax ID) and a Pix key. We also store the practice&apos;s country and time zone, chosen at sign-up (for &quot;Other country&quot;, the country detected from the connection at sign-up).</p>
        <p><strong>3.2 Patient data entered by professionals or their secretaries:</strong> identification and contact data (name, CPF or, for clinics outside Brazil, a national ID or passport number, date of birth, sex, phone, email) and health data (notes, diagnoses, prescriptions, exams, files, appointment history). Health data is sensitive personal data under the LGPD.</p>
        <p><strong>3.3 Appointments and payments:</strong> dates, times, status, amounts and payment status.</p>
        <p><strong>3.4 Subscription billing:</strong> handled by Stripe. We never see or store full card numbers; we keep only a Stripe reference and your subscription status.</p>
        <p><strong>3.5 Device and technical data:</strong> device type, operating system version, app version, push notification tokens, and technical error reports.</p>
        <p>
          <strong>3.6 Website usage and marketing attribution:</strong> only with your consent, anonymous usage
          statistics about our website, and the campaign that brought you to it (for example UTM tags and the
          referring website), which is saved with your account when you sign up.{" "}
          <strong>Patient data is never used for analytics or marketing.</strong>
        </p>
      </Section>

      <Section title="4. How we use information">
        <ul>
          <li>To provide the Service (scheduling, records, prescriptions, payments, secretary access).</li>
          <li>To send appointment notifications (push notifications) and service emails (such as account confirmation, password reset and account notices).</li>
          <li>To bill subscriptions and manage accounts.</li>
          <li>To detect and fix errors and keep the Service secure. Error reports are stripped of patient data and contain at most an internal user ID.</li>
          <li>With your consent: to measure which campaigns bring new professionals to SolvyMed and to improve sign-up.</li>
          <li>To meet legal obligations, including medical record retention.</li>
        </ul>
        <p>We do not sell personal data. We do not use patient data for advertising.</p>
      </Section>

      <Section title="5. Service providers">
        <p>All act under contract and only to operate the Service:</p>
        <Table
          head={["Provider", "Purpose", "Location"]}
          rows={[
            ["Supabase", "Database, authentication, file storage", "Brazil (São Paulo region)"],
            ["Vercel", "Website hosting; server processing in Brazil (São Paulo), static content via a global edge network", "Brazil / global"],
            ["Stripe", "Subscription payments", "USA / global"],
            ["Resend", "Transactional email (confirmations, password resets)", "USA"],
            ["Expo", "Push notification delivery", "USA"],
            ["Sentry", "Error monitoring for the app and website (no patient data)", "USA"],
            ["PostHog", "Website usage statistics, only with your consent", "EU"],
            ["Google Workspace", "Support email", "USA / global"],
            ["OpenStreetMap", "Converts the clinic's address into a map location, and shows the map when a professional adjusts the pin, from our servers, the app or the browser (no patient data)", "EU / UK"],
            ...(turnstile
              ? [["Cloudflare Turnstile", "Protects sign-up, sign-in and password reset against automated abuse by checking technical signals from your browser", "Global"]]
              : []),
          ]}
        />
        <p>We may disclose information if required by law or court order.</p>
      </Section>

      <Section title="6. International transfers">
        <p>
          Some providers above process data outside Brazil. We only use providers that commit to adequate
          protection (for example, standard contractual clauses), as required by Art. 33 of the LGPD and the
          rules of the ANPD. Clinical records are stored in Brazil.
        </p>
      </Section>

      <Section title="7. Who can see data inside a clinic">
        <ul>
          <li><strong>The professional</strong> sees all data of their own patients, including medical records.</li>
          <li>
            <strong>Secretaries</strong> the professional invites (up to 3) can see and manage patients&apos;
            identification and contact data (including the patient&apos;s profile photo), the schedule and
            appointment payments, and can add, archive and restore patients. They <strong>cannot</strong> see
            medical records, prescriptions, exams or clinical files.
          </li>
          <li><strong>Patients</strong> see their own appointments and the clinic&apos;s booking and payment information.</li>
          <li>
            Nobody outside the clinic, including other SolvyMed users, can see a clinic&apos;s data. SolvyMed staff
            access data only when needed for support or legal obligations.
          </li>
        </ul>
      </Section>

      <Section title="8. Security">
        <p>
          Encryption in transit (TLS) and at rest; row-level access rules so each clinic sees only its own data;
          secretaries cannot access clinical records; patient files and photos are private and served only through
          short-lived links; an optional PIN/biometric lock in the app. No system is completely secure, so please
          use a strong password and keep your device secure.
        </p>
      </Section>

      <Section title="9. Data retention">
        <ul>
          <li>
            <strong>Medical records</strong> (clinical notes, prescriptions, exams, files, appointment history) are
            kept for at least <strong>20 years</strong>, the period Brazilian law sets for patient records (Lei n.º
            13.787/2018), even if the clinic archives the patient or closes its SolvyMed account. A patient with
            medical records can be archived but not deleted.
          </li>
          <li>
            After 24 hours, a clinical note or prescription can no longer be edited or deleted. It can be corrected,
            and each correction is kept with its date, author and reason. Files removed from a patient&apos;s chart
            after 24 hours are hidden, not deleted, and are kept for the retention period.
          </li>
          <li>
            <strong>When a professional closes their account</strong> (in Settings, or by asking us): login,
            contact details, photo, payment settings and subscription are deleted or anonymized right away. The
            professional&apos;s name and registration remain on the retained records, because records must identify
            their author. The retained records and the patient list are locked: nobody, including the professional,
            can access them in the app. They are permanently erased 20 years after the account was closed. Patients
            of a closed practice can request a copy of their records (see section 10). A professional whose patients
            have no medical records is deleted right away.
          </li>
          <li>
            <strong>When a patient or secretary deletes their account</strong>: their login, profile and links to
            clinics are deleted. The records clinics hold about a patient are kept as described above.
          </li>
          <li>The same email address can later be used to open a new, empty account.</li>
          <li>
            <strong>Other data</strong>: account data while the account is active. Error reports: up to 90 days.
            Usage statistics: up to 12 months. Billing records: as long as tax law requires (kept by Stripe).
          </li>
        </ul>
      </Section>

      <Section title="10. Your rights">
        <p>
          Under the LGPD you may: confirm whether we process your data; access it; correct it; request
          anonymization, blocking or deletion of unnecessary data; request portability; learn who we share it with;
          withdraw consent (for example, for usage statistics, at any time in the cookie settings); and complain to
          the ANPD (Autoridade Nacional de Proteção de Dados).
        </p>
        <p>
          Deletion requests do not override the legal retention of medical records (see section 9).{" "}
          <strong>Patients who want a copy of their records</strong> should ask their clinic. If the clinic has
          closed its SolvyMed account, contact us at <Mail /> and we will provide it after verifying your identity.
        </p>
      </Section>

      <Section title="11. Cookies and consent">
        <p>
          The website uses strictly necessary cookies without asking: your login session, your language
          (<code>NEXT_LOCALE</code>) and your cookie choice (<code>sm_consent</code>, kept for 12 months). Everything
          else is used only if you accept it in the cookie banner:
        </p>
        <ul>
          <li>
            <strong>Analytics</strong>: a random identifier in your browser&apos;s storage (<code>sm_anon_id</code>)
            for usage statistics, not linked to your account.
          </li>
          <li>
            <strong>Marketing</strong>: a cookie (<code>sm_attr</code>, up to 90 days) that remembers the campaign,
            referring website and page of your first visit. If you sign up, it is saved with your account once your
            email is confirmed.
          </li>
        </ul>
        <p>
          We ask again after 12 months, or sooner if what these categories cover changes. You can change your choice
          at any time via &quot;Cookie settings&quot; at the bottom of our pages, or here:{" "}
          <CookieSettingsButton className="font-semibold text-teal-600 underline" />. Withdrawing a category deletes
          what it stored in your browser.
        </p>
      </Section>

      <Section title="12. Children">
        <p>
          Accounts may only be created by people aged 18 or over. Clinics may keep records of minor patients; in that
          case the clinic is responsible for obtaining the consent of a parent or guardian as required by law.
        </p>
      </Section>

      <Section title="13. Changes">
        <p>We will announce material changes in the app or by email before they take effect.</p>
      </Section>

      <Section title="14. Contact and Data Protection Officer">
        <p>
          Controller: Vitor Carvalho, trading as BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Thailand.
          <br />
          Data Protection Officer (Encarregado): Vitor Carvalho, <Mail />.
          <br />
          Support: <Mail />
        </p>
      </Section>
    </>
  );
}
