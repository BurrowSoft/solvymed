export default async function PrivacyPage({
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
          <h1 className="mt-4 text-3xl font-extrabold text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: June 18, 2026</p>
        </div>

        <div className="prose prose-slate max-w-none">

          <Section title="1. Overview">
            <p>
              SolvyMed (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a clinic management platform operated by BurrowSoft.
              This Privacy Policy explains how we collect, use, store, and protect information when you use
              our mobile app and web platform (collectively, the &quot;Service&quot;).
            </p>
            <p>
              By using SolvyMed, you agree to the practices described in this policy. If you do not agree,
              please stop using the Service.
            </p>
          </Section>

          <Section title="2. Who This Policy Applies To">
            <p>This policy applies to:</p>
            <ul>
              <li><strong>Healthcare professionals</strong> (doctors, therapists, and similar) who use SolvyMed to manage their practice.</li>
              <li><strong>Secretaries / receptionists</strong> who manage appointments on behalf of a professional.</li>
              <li><strong>Patients</strong> who book appointments or access their records through the app.</li>
            </ul>
          </Section>

          <Section title="3. Information We Collect">
            <h3>3.1 Account information</h3>
            <p>When you create an account we collect your name, email address, and password (stored as a secure hash). Healthcare professionals may also provide their specialty, clinic name, address, phone number, and CNPJ.</p>

            <h3>3.2 Patient data</h3>
            <p>
              Professionals enter patient records into the Service. This may include full name, CPF, date of birth,
              sex, phone number, email, emergency contact, insurance type, medical notes, diagnoses, prescriptions,
              exam files, and appointment history. This data is entered by the professional and belongs to their practice.
            </p>

            <h3>3.3 Appointment and scheduling data</h3>
            <p>We store appointment dates, times, types, statuses, payment amounts, and associated notes.</p>

            <h3>3.4 Payment information</h3>
            <p>
              Subscription payments are processed by <strong>Stripe</strong> (global) and <strong>Asaas</strong> (Brazil).
              We do not store your full card number, CVV, or banking details. We only retain a payment provider
              reference ID and your subscription status.
            </p>

            <h3>3.5 Device and usage data</h3>
            <p>
              We collect device type, operating system version, and push notification tokens for the purpose of
              sending appointment reminders. We do not sell or use this data for advertising.
            </p>
          </Section>

          <Section title="4. How We Use Your Information">
            <ul>
              <li>To provide and operate the Service (scheduling, patient records, prescriptions, payments).</li>
              <li>To send appointment reminder push notifications.</li>
              <li>To process subscription payments and manage your account.</li>
              <li>To respond to support requests.</li>
              <li>To comply with legal obligations.</li>
            </ul>
            <p>We do not use your data for advertising and we do not sell your data to any third party.</p>
          </Section>

          <Section title="5. Data Sharing">
            <p>We share data only with the following service providers, strictly to operate the platform:</p>
            <ul>
              <li><strong>Supabase</strong> — database, authentication, and file storage (servers in the US/EU).</li>
              <li><strong>Stripe</strong> — payment processing for global subscriptions.</li>
              <li><strong>Asaas</strong> — payment processing for Brazilian subscriptions (Pix / boleto).</li>
              <li><strong>Expo</strong> — push notification delivery service.</li>
            </ul>
            <p>
              We may disclose information if required by law, court order, or to protect the rights and safety
              of our users or the public.
            </p>
          </Section>

          <Section title="6. Data Storage and Security">
            <p>
              All data is stored on Supabase infrastructure with encryption at rest and in transit (HTTPS/TLS).
              Row-level security policies ensure that professionals can only access their own patients and records.
              The mobile app offers an optional biometric / PIN lock for an additional layer of protection.
            </p>
            <p>
              Despite our measures, no system is completely secure. We encourage you to use a strong password
              and to keep your device secure.
            </p>
          </Section>

          <Section title="7. Data Retention">
            <p>
              We retain your account data for as long as your account is active. Patient records entered by
              a professional are retained until the professional requests deletion. You may request deletion
              of your account and associated data at any time by contacting us.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>
              Under the Brazilian General Data Protection Law (LGPD — Lei n.º 13.709/2018) and, where applicable,
              the EU General Data Protection Regulation (GDPR), you have the right to:
            </p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate or incomplete data.</li>
              <li>Request deletion of your data (&quot;right to be forgotten&quot;).</li>
              <li>Request a portable copy of your data.</li>
              <li>Withdraw consent at any time.</li>
              <li>Lodge a complaint with your national data protection authority.</li>
            </ul>
            <p>To exercise any of these rights, contact us at the address below.</p>
          </Section>

          <Section title="9. Children">
            <p>
              SolvyMed is not directed at children under 18 years of age. We do not knowingly collect
              personal data from minors. If you believe a minor has provided us with personal data,
              please contact us and we will delete it promptly.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify users of material changes
              via in-app notification or email. Continued use of the Service after changes constitutes
              acceptance of the updated policy.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>If you have any questions or requests regarding this Privacy Policy, please contact:</p>
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
