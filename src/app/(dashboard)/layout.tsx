import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen font-sans bg-slate-50">
      <TopNav />
      <Sidebar />
      <main className="md:pl-64 pt-16 min-h-screen pb-20 md:pb-0">
        <div className="p-4 sm:p-6 md:p-8 mx-auto max-w-7xl">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
