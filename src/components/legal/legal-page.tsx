import Link from "next/link";

interface LegalSection {
  title: string;
  body: string[];
}

interface LegalPageProps {
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
}

export function LegalPage({
  title,
  description,
  updatedAt,
  sections,
}: LegalPageProps) {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-border/60 pb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Shopify Creator
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Última atualização: {updatedAt}
          </p>
        </header>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm"
            >
              <h2 className="text-xl font-semibold text-foreground">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-10 flex flex-wrap gap-4 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacidade
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Termos
          </Link>
          <Link href="/data-deletion" className="hover:text-foreground">
            Exclusão de dados
          </Link>
        </footer>
      </div>
    </main>
  );
}
