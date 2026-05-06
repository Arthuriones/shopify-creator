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
      <main className="flex-1 overflow-auto px-4 pb-24 pt-20 sm:px-5 md:pb-10 md:pt-6 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1360px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
