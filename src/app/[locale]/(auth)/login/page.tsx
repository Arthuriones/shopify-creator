"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

type Mode = "login" | "signup" | "recovery";

export default function LoginPage() {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!cooldownUntil) return;

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 250);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || secondsRemaining > 0) return;

    setErrorMessage(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              has_password: true
            }
          }
        });
        if (error) throw error;
        // Assume login is successful immediately if no email confirmation required
        router.push("/stores");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/stores");
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/callback?type=recovery`,
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("genericError");
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes("429") ||
        normalizedMessage.includes("too many") ||
        normalizedMessage.includes("security purposes") ||
        normalizedMessage.includes("rate limit")
      ) {
        const secondsMatch = message.match(/(\d+)\s*seconds?/i);
        const waitSeconds = secondsMatch ? Number(secondsMatch[1]) : 60;
        setCooldownUntil(Date.now() + waitSeconds * 1000);
        setErrorMessage(t("tooManyAttempts", { seconds: waitSeconds }));
      } else if (normalizedMessage.includes("invalid login credentials")) {
        setErrorMessage(t("invalidCredentials"));
      } else {
        setErrorMessage(message);
      }
    } finally {
      setLoading(false);
    }
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Logo"
            className="mx-auto mb-4 h-12 w-auto"
          />
          <p
            className="text-sm text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            {t("tagline")}
          </p>
        </div>

        {/* Form / Success */}
        {sent && mode === "recovery" ? (
          <div className="animate-fade-in text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full animate-scale-in"
              style={{ background: "oklch(0.72 0.19 155 / 12%)" }}
            >
              <Check
                className="h-5 w-5"
                style={{ color: "oklch(0.72 0.19 155)" }}
              />
            </div>
            <p className="text-sm text-foreground font-medium">{t("recoverySent")}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground mb-4">
              {t("checkEmail")} <strong className="text-foreground font-medium">{email}</strong>
            </p>
            <Button variant="outline" className="w-full h-11" onClick={() => { setSent(false); setMode("login"); }}>
              {t("backToLogin")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex bg-card p-1 rounded-lg border border-border/50">
              <button
                className={`flex-1 text-sm font-medium h-9 rounded-md transition-all ${mode === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("login")}
              >
                {t("login")}
              </button>
              <button
                className={`flex-1 text-sm font-medium h-9 rounded-md transition-all ${mode === "signup" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("signup")}
              >
                {t("signup")}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[13px] font-medium text-muted-foreground"
                  >
                    {t("email")}
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
                
                {mode !== "recovery" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="password"
                        className="text-[13px] font-medium text-muted-foreground"
                      >
                        {t("password")}
                      </Label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => setMode("recovery")}
                          className="text-xs text-primary/80 hover:text-primary transition-colors"
                        >
                          {t("forgotPassword")}
                        </button>
                      )}
                    </div>
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
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-sm font-medium transition-all duration-200"
                style={{
                  background: loading ? "oklch(0.72 0.19 155 / 70%)" : "oklch(0.72 0.19 155)",
                  color: "oklch(0.13 0.02 155)",
                }}
                disabled={loading || secondsRemaining > 0}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </span>
                ) : secondsRemaining > 0 ? (
                  t("wait", { seconds: secondsRemaining })
                ) : mode === "login" ? (
                  t("login")
                ) : mode === "signup" ? (
                  t("signup")
                ) : (
                  t("sendAccessLink")
                )}
              </Button>
              {errorMessage ? (
                <p className="text-xs text-red-400">{errorMessage}</p>
              ) : null}

              {mode === "recovery" && (
                 <Button type="button" variant="ghost" className="w-full h-11 text-xs text-muted-foreground" onClick={() => setMode("login")}>
                   {t("backToLogin")}
                 </Button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
