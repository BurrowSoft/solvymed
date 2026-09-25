export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <span className="text-3xl font-black text-teal-600">S</span>
          <h1 className="mt-4 text-3xl font-extrabold text-slate-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: September 6, 2026</p>
        </div>

        <div className="prose prose-slate max-w-none">

          <Section title="1. Acceptance of Terms">
            <p>
              By creating an account or using SolvyMed (the &quot;Service&quot;), operated by BurrowSoft,
              you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree,
              do not use the Service.
            </p>
            <p>
              These Terms apply to all users of the Service, including healthcare professionals,
              secretaries, and patients.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              SolvyMed is a clinic management platform that allows healthcare professionals to manage
              appointments, patient records, prescriptions, procedures, and related administrative tasks.
              Patients may use the Service to book appointments and view information shared by their
              healthcare provider.
            </p>
          </Section>

          <Section title="3. User Accounts">
            <p>
              To use the Service you must create an account with a valid email address and a secure
              password. You are responsible for maintaining the confidentiality of your credentials
              and for all activity that occurs under your account. You must notify us immediately
              at <a href="mailto:support@solvymed.com" className="text-teal-600 underline">support@solvymed.com</a> if
              you suspect unauthorised access.
            </p>
            <p>
              You must be at least 18 years old to create an account. Healthcare professionals are
              responsible for ensuring that any staff members they add to the Service comply with
              these Terms.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any unlawful purpose or in violation of applicable regulations, including those governing healthcare and patient data privacy.</li>
              <li>Upload or transmit any false, misleading, or fraudulent information, including fabricated patient records.</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its related systems.</li>
              <li>Reverse-engineer, decompile, or otherwise attempt to extract the source code of the Service.</li>
              <li>Use the Service to send unsolicited messages or spam to patients or other users.</li>
              <li>Interfere with or disrupt the integrity or performance of the Service.</li>
            </ul>
          </Section>

          <Section title="5. Subscriptions and Payment">
            <p>
              Access to professional features of SolvyMed requires an active paid subscription.
              Subscription fees are charged in advance on a monthly or annual basis, depending on
              the plan selected. Payments are processed by Stripe.
            </p>
            <p>
              Subscriptions renew automatically unless cancelled before the next billing date.
              You can cancel your subscription at any time through your account settings or by
              contacting support. Refunds are not provided for partial billing periods unless
              required by applicable law.
            </p>
            <p>
              BurrowSoft reserves the right to change pricing with 30 days&apos; notice. Continued
              use of the Service after a price change constitutes acceptance of the new pricing.
            </p>
          </Section>

          <Section title="6. Patient Data and Healthcare Professional Responsibilities">
            <p>
              Healthcare professionals who use SolvyMed to store patient data are the data
              controllers for that data under applicable privacy law (including Brazil&apos;s LGPD
              and the EU&apos;s GDPR). BurrowSoft acts as a data processor on their behalf.
            </p>
            <p>
              Healthcare professionals are solely responsible for:
            </p>
            <ul>
              <li>Obtaining all necessary consents from patients before entering their data into the Service.</li>
              <li>Ensuring that their use of the Service complies with applicable healthcare regulations and professional codes of conduct.</li>
              <li>The accuracy and completeness of patient records they create or maintain.</li>
              <li>Ensuring that any staff members with access to the Service handle patient data in compliance with applicable law.</li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              All intellectual property rights in the Service, including software, design, trademarks,
              and content created by BurrowSoft, belong to BurrowSoft. You are granted a limited,
              non-exclusive, non-transferable licence to use the Service for its intended purposes
              during the term of your subscription.
            </p>
            <p>
              You retain ownership of any data you upload to the Service. By using the Service, you
              grant BurrowSoft a limited licence to store and process your data solely to provide and
              operate the Service.
            </p>
          </Section>

          <Section title="8. Disclaimers">
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
              express or implied, including warranties of merchantability, fitness for a particular
              purpose, or non-infringement. BurrowSoft does not warrant that the Service will be
              uninterrupted, error-free, or completely secure.
            </p>
            <p>
              SolvyMed is a management tool and is not a medical device. It does not provide medical
              advice, diagnosis, or treatment. Healthcare professionals are solely responsible for all
              clinical decisions made using the Service.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, BurrowSoft shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages, including loss
              of data, revenue, or profits, arising from your use of or inability to use the Service.
            </p>
            <p>
              Our total liability to you for any claim arising from these Terms or your use of the
              Service shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </Section>

          <Section title="10. Termination">
            <p>
              You may delete your account at any time through Settings → Delete Account. BurrowSoft
              may suspend or terminate your access to the Service for violation of these Terms or for
              any other reason at its discretion, with or without notice.
            </p>
            <p>
              Upon termination, your right to use the Service ceases immediately. Sections 6, 7, 9,
              and 11 survive termination.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              These Terms are governed by the laws of Brazil. Any disputes arising from these Terms
              or the use of the Service shall be subject to the exclusive jurisdiction of the courts
              of São Paulo, Brazil, unless otherwise required by mandatory local law.
            </p>
          </Section>

          <Section title="12. Changes to These Terms">
            <p>
              BurrowSoft may update these Terms from time to time. We will notify you of material
              changes via in-app notification or email at least 14 days before they take effect.
              Continued use of the Service after changes take effect constitutes acceptance of the
              updated Terms.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>If you have any questions about these Terms, please contact:</p>
            <p>
              <strong>BurrowSoft</strong><br />
              Email: <a href="mailto:support@solvymed.com" className="text-teal-600 underline">support@solvymed.com</a>
            </p>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
