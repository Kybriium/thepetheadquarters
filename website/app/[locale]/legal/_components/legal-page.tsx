import { Breadcrumbs } from "@/components/ui/breadcrumbs";

interface LegalPageProps {
  data: {
    title: string;
    lastUpdated: string;
    sections: { heading: string; content: string }[];
  };
  backLabel: string;
  backHref: string;
}

export function LegalPage({ data, backLabel, backHref }: LegalPageProps) {
  return (
    <main className="py-16 md:py-24" style={{ background: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Breadcrumbs items={[{ label: backLabel, href: backHref }, { label: data.title }]} />

        <div className="mb-10" data-animate="fade-up">
          <h1
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: "var(--weight-regular)",
              color: "var(--white)",
            }}
          >
            {data.title}
          </h1>
          <span
            className="mt-2 block"
            style={{
              fontFamily: "var(--font-montserrat)",
              fontSize: "var(--text-xs)",
              color: "var(--white-faint)",
            }}
          >
            {data.lastUpdated}
          </span>
          <div className="mt-4" style={{ width: 60, height: 1, background: "var(--gold)" }} data-animate="divider" />
        </div>

        <div className="flex flex-col gap-8" data-animate="fade-up">
          {data.sections.map((section) => (
            <div key={section.heading}>
              <h2
                className="mb-3"
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "var(--text-xl)",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--white)",
                }}
              >
                {section.heading}
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--text-sm)",
                  color: "var(--white-dim)",
                  lineHeight: "var(--leading-relaxed)",
                  // Preserve newlines in the legal dictionary so the
                  // subprocessor list, retention bullets, etc. render
                  // as separate lines rather than collapsing into prose.
                  whiteSpace: "pre-line",
                }}
              >
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
