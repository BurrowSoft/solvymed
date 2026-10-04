import { Mail, Section, Table } from "@/components/LegalDoc";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { noticeChannels } from "@/lib/noticeChannels";

// English Privacy Policy (authoritative with pt-BR; keep both in step).
// Every statement here must match what the Service enforces today.
export function PrivacyEn({ turnstile, solvyai = false, line = false, notices = false, whatsapp = false, address = false, founders = false, founderUploads = false, secretaryInvites = false, closureNotices = false }: { turnstile: boolean; secretaryInvites?: boolean; closureNotices?: boolean; solvyai?: boolean; line?: boolean; notices?: boolean; whatsapp?: boolean; address?: boolean; founders?: boolean; founderUploads?: boolean }) {
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
        <p><strong>3.1 Account information:</strong> name, email and password (stored only as a secure hash). Professionals may add their specialty, professional registration, clinic name, address, phone, CNPJ (tax ID) and a Pix key. We also store the practice&apos;s country and time zone, chosen at sign-up (for &quot;Other country&quot;, the country detected from the connection at sign-up). When someone creates an account, we record which version of the Terms of Use and Privacy Policy they accepted, and when.</p>
        <p><strong>3.2 Patient data entered by professionals or their secretaries:</strong> identification and contact data (name, CPF or, for clinics outside Brazil, a national ID or passport number, date of birth, sex, phone, email{address && ", address, CNS (the Brazilian national health card number, Brazilian clinics only) and administrative notes"}) and health data (notes, diagnoses, prescriptions, exams, files, appointment history). Health data is sensitive personal data under the LGPD.</p>
        <p><strong>3.3 Appointments and payments:</strong> dates, times, status, amounts and payment status. Clinics in Thailand may add a PromptPay ID (a mobile number or national / tax ID), used only to build the appointment payment QR.</p>
        <p><strong>3.4 Subscription billing:</strong> handled by Stripe. We never see or store full card numbers; we keep only a Stripe reference and your subscription status.</p>
        <p><strong>3.5 Device and technical data:</strong> device type, operating system version, app version, push notification tokens, and technical error reports.</p>
        <p>
          <strong>3.6 Website usage and marketing attribution:</strong> only with your consent, anonymous usage
          statistics about our website, and the campaign that brought you to it (for example UTM tags and the
          referring website), which is saved with your account when you sign up.{" "}
          <strong>Patient data is never used for analytics or marketing.</strong>
        </p>
        {secretaryInvites && <p><strong>3.7 Secretary invitations:</strong> when a professional invites a secretary, we store the email address they enter and send the invitation to it (at most one resend an hour). The invitation expires after 7 days, and the address is deleted 30 days after the invitation expires or is cancelled.</p>}
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
            ["Resend", secretaryInvites ? "Transactional email (confirmations, password resets) and invitations sent at a professional's request" : "Transactional email (confirmations, password resets)", "USA"],
            ["Expo", "Push notification delivery", "USA"],
            ["Sentry", "Error monitoring for the app and website (no patient data)", "USA"],
            ["PostHog", "Website usage statistics, only with your consent", "EU"],
            ["Google Workspace", "Support email", "USA / global"],
            ["OpenStreetMap", "Converts the clinic's address into a map location, and shows the map when a professional adjusts the pin, from our servers, the app or the browser (no patient data)", "EU / UK"],
            ...(turnstile
              ? [["Cloudflare Turnstile", "Protects sign-up, sign-in and password reset against automated abuse by checking technical signals from your browser", "Global"]]
              : []),
            ...(solvyai
              ? [["Anthropic (SolvyAI, professionals only, when used)", "Processes the professional's typed questions and requests to answer them; for actions the professional has switched on, the patient's name, date of birth and the appointment details needed for the request", "USA"]]
              : []),
            ...(line
              ? [["LY Corporation (LINE), Thai clinics only, for patients who connect LINE", "Sends appointment notices (the clinic's name, the date and time, and what happened: confirmed, moved, reminder, cancelled); we store the patient's LINE user ID to deliver them", "Japan / Thailand"]]
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
          {(solvyai || line) && (
            <>
              {" "}
              {solvyai && line
                ? "SolvyAI requests are processed by Anthropic in the United States, and LINE notices by LY Corporation, under contractual safeguards required by the LGPD (Art. 33) and the PDPA."
                : solvyai
                  ? "SolvyAI requests are processed by Anthropic in the United States, under contractual safeguards required by the LGPD (Art. 33) and the PDPA."
                  : "LINE notices are processed by LY Corporation, under contractual safeguards required by the LGPD (Art. 33) and the PDPA."}
              {/* Anthropic's retention for this organization (Vitor's Console, 1 Oct: the 30-day
                  default, no zero-retention agreement). If ZDR is granted later, this becomes
                  "not stored by Anthropic" (UX). */}
              {solvyai && " Anthropic deletes what is sent to SolvyAI within 30 days, except content flagged for violating its usage policies (kept for up to 2 years) or where the law requires longer retention. It is not used to train AI models."}
            </>
          )}
        </p>
      </Section>

      {solvyai && (
        <Section title="6b. SolvyAI (professionals only)">
          <ul className="list-disc space-y-1 pl-5">
            <li>SolvyAI is an optional assistant for professionals. It never reads medical records, prescriptions, exams or files.</li>
            <li>What you type in the chat is sent as you write it; don&rsquo;t type clinical details. CPF and Thai ID numbers, phone numbers and emails are masked before sending.</li>
            <li>Actions (booking, moving, cancelling, blocking time, adding patients, marking payments) are off by default; when a professional turns them on, the patient data needed for each request is sent as described in section 5, and nothing is saved without the professional&rsquo;s confirmation.</li>
            <li>We don&rsquo;t keep chat conversations after the session. A 👍/👎 on an answer is recorded as a vote only, never the conversation.</li>
          </ul>
        </Section>
      )}

      {line && (
        <Section title="6c. LINE notices (Thailand)">
          <ul className="list-disc space-y-1 pl-5">
            <li>Patients of Thai clinics can connect LINE to receive appointment notices. They choose to connect and can stop at any time.</li>
            <li>LINE receives only the clinic&rsquo;s name, the appointment&rsquo;s date and time, and what happened to it (confirmed, moved, reminder, cancelled): never clinical information.</li>
            <li>If you block SolvyMed on LINE, we stop sending messages but keep the link so they resume if you unblock. To remove it, tap Disconnect (Settings → LINE) in the app or delete your account.</li>
            <li>The delivery history of LINE notices is deleted after 90 days.</li>
          </ul>
        </Section>
      )}

      {founders && (
        <Section title="6d. Founders Program applications">
          <p>Founders Program: if you apply, we process your name, email, phone, profession and registration number, the clinic system you use, your practice size and how you found us, to assess your application and contact you. Applications that aren&rsquo;t accepted are deleted 12 months after their last status change; accepted founders&rsquo; applications are kept while their account exists (or deleted 12 months after acceptance if no account was ever linked).</p>
          <p className="mt-2">To stop abuse, we keep a scrambled (salted hash) form of your IP address for 2 days, never the address itself. To have your application deleted sooner, write to support@solvymed.com.</p>
          {founderUploads && <p className="mt-2">Test exports: accepted founders can upload test export files (CSV, Excel or ZIP) from the system they use, in Settings, so we can build the importer. Before each upload the founder confirms the file contains only test patients they created; we don&rsquo;t check the contents before storing it. Files are kept in a private place only the SolvyMed team can access, with a record of who uploaded them and when, and are deleted 180 days after upload, or sooner: when that system&rsquo;s importer ships, when the founder is no longer accepted, or when the account is deleted.</p>}
        </Section>
      )}

      {(notices || whatsapp) && (
        <Section title="6e. Patient notices">
          <p>Patient notices: when the clinic books, moves or cancels an appointment, the notice to the patient{whatsapp && ` (${noticeChannels(notices, "or")})`} waits about 1 minute before it&rsquo;s sent, so the clinic can undo a mistake. We keep a record of each notice (which appointment, the kind of notice, the time slot and whether it was sent), with no names or clinical data, for 30 days, and then delete it.</p>
        </Section>
      )}

      <Section title="6f. My brand (professionals)">
        <ul className="list-disc space-y-1 pl-5">
          <li>In My brand, a professional can add a display name, title, specialty, registration line and brand colour, a square logo, a wide logo (for documents) and a photo. We store what they save, together with the images.</li>
          <li><strong>The logo and the photo are public once saved:</strong> anyone who has an image&rsquo;s link can open it. The logo (or, without one, the photo), name, title, specialty and colour are shown on the professional&rsquo;s public invite link page to anyone, and on their booking page to the patients connected to them; the documents they issue show the logo, colour, name, specialty and registration line. Don&rsquo;t upload anything you don&rsquo;t want to be public.</li>
          <li>The professional can change or remove any image at any time in My brand. A removed or replaced image stops being reachable within about a minute.</li>
          <li>A profile photo added before My brand stays private: it isn&rsquo;t shown on these pages.</li>
          <li>The brand and its images are deleted when the professional closes or deletes their account.</li>
        </ul>
      </Section>

      <Section title="6g. Notifications">
        <ul>
          <li>We send push notifications about appointments: requests and their answers, confirmations, changes and cancellations. A professional can also send a general notice to the patients connected to them (a title and a message). Notifications reach your device through Expo (see section 5).</li>
          <li>When our servers send a notification, we keep it in a queue only to deliver it: who it is for and who caused it, which appointment and kind of notice it is, the visit&rsquo;s date and time, the names shown in it, and its delivery status (for a general notice, its title and message). Each one is deleted at most 30 days after it was created.</li>
          {closureNotices && (
            <li>When a professional closes their account, our server sends their patients a notice that the practice closed or that an appointment was cancelled. To do this we keep only the clinic&rsquo;s name (which can be the professional&rsquo;s own name) and country, the appointment date and time (for cancelled appointments), and the delivery status, and we delete the notice as soon as it&rsquo;s sent (at most 30 days).</li>
          )}
          <li>You can turn notifications off at any time in your device&rsquo;s settings.</li>
        </ul>
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
        <p>
          An access log records who opened each patient record, prescription, exam or file, and when. The
          professional responsible for the patient can see it. Entries are kept for as long as the record and keep
          the name of the person who opened it, even if their account is later deleted.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Encryption in transit (TLS) and at rest; row-level access rules so each clinic sees only its own data;
          secretaries cannot access clinical records; the clinic&rsquo;s notes on an appointment are private and never shown to
          the patient (a patient sees only their own message to the clinic); patient files and photos are private and served only through
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
