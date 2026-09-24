export function AuthCard({
  centered,
  children,
}: {
  centered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100${
        centered ? " text-center" : ""
      }`}
    >
      {children}
    </div>
  );
}
