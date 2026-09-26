import { LegalLinks } from "./LegalLinks";

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      {children}
      <LegalLinks className="mt-6 mb-8" />
    </div>
  );
}
