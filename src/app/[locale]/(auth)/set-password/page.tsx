"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (password !== confirmPassword) {
      setErrorMessage("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setErrorMessage(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        has_password: true,
      },
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message || "Não foi possível definir a senha. Tente novamente.");
      return;
    }

    router.push("/stores");
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
        <div className="mb-8 text-center">
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
            Nova Segurança
          </h1>
          <p
            className="mt-2 text-sm text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Por favor, defina uma senha para sua conta
          </p>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-[13px] font-medium text-muted-foreground"
                >
                  Nova Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 bg-card border-border/50 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 transition-colors duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="text-[13px] font-medium text-muted-foreground"
                >
                  Confirmar Senha
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 bg-card border-border/50 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 transition-colors duration-200"
                />
              </div>
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
                "Salvar Senha"
              )}
            </Button>
            {errorMessage ? (
              <p className="text-xs text-red-400">{errorMessage}</p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
