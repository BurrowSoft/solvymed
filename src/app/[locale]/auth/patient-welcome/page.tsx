import Link from "next/link";

export default async function PatientWelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
        </div>

        {/* Checkmark */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-teal-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-extrabold text-slate-900">You&apos;re all set!</h1>
        <p className="mb-2 text-slate-500">
          Your account has been confirmed and linked to your doctor&apos;s clinic.
        </p>
        <p className="mb-8 text-sm text-slate-400">
          Use the SolvyMed mobile app to view your appointments, prescriptions, and medical records.
        </p>

        {/* App download buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://apps.apple.com/app/solvymed/id000000000"
            className="flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            App Store
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed"
            className="flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
              <path d="M3.18 23.76c.31.17.67.19 1.01.08l11.7-6.76-2.46-2.46-10.25 9.14zM.54 1.96C.2 2.3 0 2.84 0 3.54v16.92c0 .7.2 1.24.54 1.58l.08.08 9.47-9.47v-.22L.62 1.88l-.08.08zM20.42 10.3l-2.67-1.54-2.75 2.75 2.75 2.75 2.68-1.55c.76-.44.76-1.15-.01-1.41zM4.19.16L15.89 6.92 13.43 9.38 3.18.24 4.19.16z"/>
            </svg>
            Google Play
          </a>
        </div>

        <Link href={`${prefix}/`} className="mt-6 block text-sm text-slate-400 hover:text-teal-600 transition">
          Back to home
        </Link>
      </div>
    </div>
  );
}
