"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLogout() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut className="h-3.5 w-3.5" />
      Sair
    </Button>
  );
}
