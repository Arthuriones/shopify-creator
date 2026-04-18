import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto px-4 pb-24 pt-20 sm:px-6 md:pb-8 md:pt-6 lg:px-10 lg:py-8 xl:px-14">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
