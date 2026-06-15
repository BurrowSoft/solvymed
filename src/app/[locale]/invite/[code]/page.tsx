import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SolvyMed – You've been invited",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
        <div className="mb-4 text-4xl font-black text-teal-600">S</div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">You're invited to SolvyMed</h1>
        <p className="text-sm text-slate-500 mb-6">
          Your doctor has invited you to connect on SolvyMed.
        </p>

        <div className="bg-teal-50 rounded-xl px-6 py-4 mb-6">
          <p className="text-xs text-teal-600 font-semibold uppercase tracking-widest mb-1">Your invite code</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-teal-700">{upperCode}</p>
        </div>

        <ol className="text-left text-sm text-slate-600 space-y-2 mb-6">
          <li className="flex gap-2">
            <span className="font-bold text-teal-600 shrink-0">1.</span>
            Download SolvyMed on your phone
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-teal-600 shrink-0">2.</span>
            Sign up or log in
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-teal-600 shrink-0">3.</span>
            Go to <strong>Settings → Link Account</strong> and enter the code above
          </li>
        </ol>

        <a
          href="https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed"
          className="flex items-center justify-center gap-2 bg-teal-600 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-teal-700 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
            <path d="M3.18 23.76a2 2 0 0 1-.68-.54 1.93 1.93 0 0 1-.37-1.17V1.95C2.13 1.28 2.4.74 2.9.39l11.53 11.6-11.25 11.77zm13.47-7.06L4.42 23.3l10.33-5.86 1.9 1.26zM20.7 10.5c.6.37.93.88.93 1.5s-.33 1.13-.93 1.5l-2.7 1.54-2.16-2.17 2.16-2.17 2.7 1.8zM4.42.7l13.23 7.56-1.9 1.26L4.42.7z" />
          </svg>
          Download on Google Play
        </a>
      </div>
    </div>
  );
}
