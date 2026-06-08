import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solvymed — Medical Practice Management",
};

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </svg>
    ),
    title: "Smart Scheduling",
    description:
      "Full calendar view with daily, weekly, and monthly modes. Manage in-person and online appointments, block time, and send automated reminders.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Patient Management",
    description:
      "Complete patient profiles with personal data, contact info, appointment history, and custom tags. Search and filter across your entire patient base.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Clinical Records",
    description:
      "Timeline-based medical notes with rich text. Document each session, track patient evolution, and attach exams and files — all securely stored.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
    title: "Digital Prescriptions",
    description:
      "Issue digital prescriptions in seconds. Maintain a personal medication library, customize templates, and send directly to patients.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    title: "Integrated Payments",
    description:
      "Collect payments directly through the app. Send payment links to patients, manage installments, and track paid and pending sessions.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "Reports & Analytics",
    description:
      "Understand your practice at a glance. Revenue reports, appointment stats, patient growth — clear insights to help you run a better clinic.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Construction banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="mx-auto max-w-7xl px-4 py-2.5 text-center text-sm text-amber-800">
          <span className="font-semibold">Website under construction.</span>
          {" "}The app is already live — download it now and get started.
        </div>
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            {/* Logo placeholder */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Solvymed</span>
          </div>
          <a
            href="#download"
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            Get the App
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 py-24 text-white md:py-36">
          <div className="absolute inset-0 opacity-10">
            <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="relative mx-auto max-w-4xl px-4 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-sm font-medium text-teal-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              App available now
            </div>
            <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              Your entire practice,{" "}
              <span className="text-teal-400">in your pocket.</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-300 md:text-xl">
              Solvymed brings scheduling, patient records, prescriptions, and
              payments together in one clean, fast app built for healthcare
              professionals.
            </p>

            {/* Primary CTA — broken link intentionally */}
            <div id="download" className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="#"
                className="group flex w-full items-center justify-center gap-3 rounded-xl bg-teal-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-teal-900/40 transition hover:bg-teal-400 sm:w-auto"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download on the App Store
              </a>
              <a
                href="#"
                className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-white/20 bg-white/10 px-8 py-4 text-lg font-bold text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                  <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
                </svg>
                Get it on Google Play
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Download links coming soon — check back shortly.
            </p>
          </div>
        </section>

        {/* Feature highlights bar */}
        <section className="border-b border-slate-100 bg-teal-50 py-8">
          <div className="mx-auto max-w-7xl px-4">
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-teal-800">
              {[
                "Smart scheduling",
                "1,000+ patients",
                "Clinical records",
                "Digital prescriptions",
                "Integrated payments",
                "Practice reports",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-teal-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Everything your practice needs
              </h2>
              <p className="mx-auto max-w-xl text-slate-500">
                Built for clinicians and independent practitioners who want less
                admin work and more time with patients.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:border-teal-200 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-600 group-hover:text-white">
                    {f.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="bg-slate-900 py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="mb-4 text-3xl font-extrabold text-white md:text-4xl">
              Ready to simplify your practice?
            </h2>
            <p className="mb-10 text-slate-400">
              The app is live and ready — download it now and have your practice
              running in minutes. The website is on the way.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="#"
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-teal-500 px-8 py-4 text-base font-bold text-white shadow-lg transition hover:bg-teal-400 sm:w-auto"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                App Store
              </a>
              <a
                href="#"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-slate-800 px-8 py-4 text-base font-bold text-white transition hover:bg-slate-700 sm:w-auto"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z" />
                </svg>
                Google Play
              </a>
            </div>
          </div>
        </section>

        {/* Under construction notice */}
        <section className="border-t-4 border-amber-400 bg-amber-50 py-16">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <div className="mb-4 text-5xl">🚧</div>
            <h2 className="mb-3 text-2xl font-bold text-amber-900">
              Website under construction
            </h2>
            <p className="text-amber-700">
              This website is a work in progress. The full Solvymed website is
              coming soon with detailed documentation, pricing, and support
              resources. In the meantime,{" "}
              <strong>the app is fully operational</strong> — download it and
              start managing your practice today.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-slate-600">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <span className="text-sm font-semibold">Solvymed</span>
            </div>
            <p className="text-sm text-slate-400">
              &copy; {new Date().getFullYear()} Solvymed. All rights reserved.
            </p>
            <a
              href="mailto:support@solvymed.com"
              className="text-sm text-slate-400 transition hover:text-teal-600"
            >
              support@solvymed.com
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
