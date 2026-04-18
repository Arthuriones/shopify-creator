"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Check } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    setLoading(false);
    if (!error) setSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "600px",
          height: "600px",
          background:
            "radial-gradient(circle, oklch(0.72 0.19 155 / 6%) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6 animate-fade-in">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "oklch(0.72 0.19 155)" }}
          >
            <Package
              className="h-5 w-5"
              style={{ color: "oklch(0.13 0.02 155)" }}
            />
          </div>
          <h1
            className="text-2xl font-semibold text-foreground"
            style={{ letterSpacing: "-0.03em" }}
          >
            Shopify Creator
          </h1>
          <p
            className="mt-2 text-sm text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Automatize sua loja com IA
          </p>
        </div>

        {/* Form / Success */}
        {sent ? (
          <div className="animate-fade-in text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full animate-scale-in"
              style={{ background: "oklch(0.72 0.19 155 / 12%)" }}
            >
              <Check
                className="h-5 w-5"
                style={{ color: "oklch(0.72 0.19 155)" }}
              />
            </div>
            <p className="text-sm text-foreground font-medium">Link enviado</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Verifique <strong className="text-foreground font-medium">{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-[13px] font-medium text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 bg-card border-border/50 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 transition-colors duration-200"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium transition-all duration-200"
              style={{
                background: loading ? "oklch(0.72 0.19 155 / 70%)" : "oklch(0.72 0.19 155)",
                color: "oklch(0.13 0.02 155)",
              }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </span>
              ) : (
                "Entrar com Magic Link"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
