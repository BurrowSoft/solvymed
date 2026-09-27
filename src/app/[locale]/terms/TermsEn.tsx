import { Link } from "@/i18n/navigation";
import { Mail, Section } from "@/components/LegalDoc";

// English Terms of Service (authoritative with pt-BR; keep both in step).
export function TermsEn() {
  return (
    <>
      <Section title="1. Acceptance of Terms">
        <p>
          By creating an account or using SolvyMed (the &quot;Service&quot;), operated by Vitor Carvalho, trading as
          BurrowSoft (&quot;BurrowSoft&quot;, &quot;we&quot;), you agree to these Terms of Service (&quot;Terms&quot;). If you do not
          agree, do not use the Service.
        </p>
        <p>These Terms apply to all users of the Service, including healthcare professionals, secretaries and patients.</p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          SolvyMed is a clinic management platform that allows healthcare professionals to manage appointments,
          patient records, prescriptions, procedures and related administrative tasks. Patients may use the Service to
          book appointments and view information shared by their healthcare provider.
        </p>
      </Section>

      <Section title="3. User Accounts">
        <p>
          To use the Service you must create an account with a valid email address and a secure password. You are
          responsible for keeping your credentials confidential and for all activity under your account. Notify us
          immediately at <Mail /> if you suspect unauthorised access.
        </p>
        <p>You must be at least 18 years old to create an account.</p>
        <p>
          Professionals may invite secretaries to their practice. The professional is responsible for whom they
          invite and for their secretaries&apos; actions in the Service, and can remove a secretary&apos;s access at any
          time.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose or in violation of applicable regulations, including those governing healthcare and patient data privacy.</li>
          <li>Upload or transmit false, misleading or fraudulent information, including fabricated patient records.</li>
          <li>Attempt to gain unauthorised access to any part of the Service or its related systems.</li>
          <li>Reverse-engineer, decompile or otherwise attempt to extract the source code of the Service.</li>
          <li>Use the Service to send unsolicited messages or spam to patients or other users.</li>
          <li>Interfere with or disrupt the integrity or performance of the Service.</li>
        </ul>
      </Section>

      <Section title="5. Subscriptions and Payment">
        <p>
          Professional features require an active SolvyMed Pro subscription. New professional accounts get a 15-day
          free trial. The subscription is billed monthly, in advance, by card, through Stripe. The price is R$ 89 per
          month when you subscribe with the site in Portuguese (Brazil) and US$ 19 per month in other languages; the
          price is always shown before you pay.
        </p>
        <p>
          The subscription renews automatically each month until you cancel it. You can cancel at any time. We do not
          refund partial billing periods, unless required by applicable law.
        </p>
        <p>
          If a payment fails, access to professional features pauses immediately. It resumes as soon as you update your
          card and the payment succeeds.
        </p>
        <p>
          We may change prices with 30 days&apos; notice. Continuing to use the Service after a price change takes
          effect means you accept the new price.
        </p>
      </Section>

      <Section title="6. Patient Data and Professional Responsibilities">
        <p>
          Healthcare professionals who store patient data in SolvyMed are the controllers of that data under
          applicable privacy law, including Brazil&apos;s LGPD. BurrowSoft acts as operator (processor) on their behalf.
        </p>
        <p>Healthcare professionals are solely responsible for:</p>
        <ul>
          <li>The lawfulness of the patient data they enter, including having a legal basis and obtaining any consent required before entering it.</li>
          <li>Ensuring that their use of the Service complies with applicable healthcare regulations and professional codes of conduct.</li>
          <li>The accuracy and completeness of the patient records they create or maintain.</li>
          <li>Ensuring that the secretaries they invite handle patient data in compliance with applicable law.</li>
        </ul>
      </Section>

      <Section title="7. Intellectual Property">
        <p>
          All intellectual property rights in the Service, including software, design, trademarks and content created
          by BurrowSoft, belong to BurrowSoft. You are granted a limited, non-exclusive, non-transferable licence to
          use the Service for its intended purposes during the term of your subscription.
        </p>
        <p>
          You retain ownership of any data you upload to the Service. You grant BurrowSoft a limited licence to store
          and process your data solely to provide and operate the Service.
        </p>
      </Section>

      <Section title="8. Disclaimers">
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or implied,
          including warranties of merchantability, fitness for a particular purpose or non-infringement. BurrowSoft
          does not warrant that the Service will be uninterrupted, error-free or completely secure.
        </p>
        <p>
          SolvyMed is a management tool and is not a medical device. It does not provide medical advice, diagnosis or
          treatment. Healthcare professionals are solely responsible for all clinical decisions made using the Service.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, BurrowSoft shall not be liable for any indirect,
          incidental, special, consequential or punitive damages, including loss of data, revenue or profits, arising
          from your use of or inability to use the Service.
        </p>
        <p>
          Our total liability to you for any claim arising from these Terms or your use of the Service shall not exceed
          the amount you paid us in the 12 months preceding the claim.
        </p>
      </Section>

      <Section title="10. Closing Your Account and Termination">
        <p>
          You can delete or close your account at any time in Settings, or by asking us at <Mail />. Closing an
          account cancels its subscription. Medical records are kept for the legal retention period, locked and
          inaccessible, and then permanently erased, as described in section 9 of the{" "}
          <Link href="/privacy" className="text-teal-600 underline">Privacy Policy</Link>.
        </p>
        <p>
          BurrowSoft may suspend or terminate your access to the Service for violation of these Terms or for any other
          reason at its discretion, with or without notice. Upon termination, your right to use the Service ends immediately. Sections 6, 7, 9 and 11 survive
          termination.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of Brazil. Any disputes arising from these Terms or the use of the
          Service shall be subject to the exclusive jurisdiction of the courts of São Paulo, Brazil, unless otherwise
          required by mandatory local law.
        </p>
      </Section>

      <Section title="12. Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will notify you of material changes in the app or by email
          at least 14 days before they take effect. Continuing to use the Service after the changes take effect means
          you accept the updated Terms.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Vitor Carvalho, trading as BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Thailand.
          <br />
          Email: <Mail />
        </p>
      </Section>
    </>
  );
}
