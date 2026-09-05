export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1">
      <main className="flex-1">{children}</main>
    </div>
  );
}
