import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen font-sans bg-background">
      <TopNav />
      <Sidebar />
      <main className="min-h-screen pb-20 pt-16 md:pb-0 md:pl-[264px]">
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
