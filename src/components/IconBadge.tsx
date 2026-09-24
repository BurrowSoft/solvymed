export function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
        {children}
      </div>
    </div>
  );
}
