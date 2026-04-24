import React from "react";

type Member = {
  name: string;
  role: string;
};

type CreditsSectionProps = {
  title: string;
  members: Member[];
  accent: "ruby" | "gold";
};

function CreditsSection({ title, members, accent }: CreditsSectionProps) {
  const blueBadgeStyle = {
    backgroundColor: "rgba(15,92,168,0.12)",
    color: "var(--landing-ink)",
    borderColor: "rgba(15,92,168,0.18)",
  } as React.CSSProperties;

  const cardClass =
    "group rounded-2xl border bg-white/85 backdrop-blur px-4 py-4 sm:px-5 sm:py-5 transition-all duration-200 shadow-sm hover:shadow-md";

  return (
    <section className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
          {title}
        </h2>
        <span
          className={`rounded-full border px-3 py-1 text-xs sm:text-sm font-medium`}
          style={blueBadgeStyle}
        >
          {members.length} Members
        </span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member, index) => (
          <li key={member.name} className={cardClass} style={{ borderColor: 'rgba(15,92,168,0.08)' }}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                {index + 1}
              </span>
              <div>
                <p className="text-base sm:text-lg font-semibold text-slate-900">
                  {member.name}
                </p>
                <p className={`text-sm font-medium`} style={{ color: 'var(--landing-ink)' }}>
                  {member.role}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CreditsPage() {
  const teamBehindItMembers: Member[] = [
    { name: "#Abi Varsan P", role: "Senior Core Architect" },
    { name: "Lalith kishore N S", role: "App Forge Engineer" },
    { name: "Hariprashath B", role: "System Stabilizer" },
    { name: "Mohamed Firdous S", role: "Visual Systems Lead" },
    { name: "Prasanna N", role: "UI Strategist" },
    { name: "Hariswasthra S", role: "Senior Frontend Associate" },
    { name: "Padmapriya S", role: "Interface Crafter" },
    { name: "Nithyapriya S", role: "Doc Systems Curator" },
    { name: "Rexcia A", role: "Module Architect" },
    { name: "Rohit S K", role: "Junior Core Architect" },
    { name: "Judson Asaph H", role: "Server Specialist" },
    { name: "SharukK Hasthik M", role: "Infra Specialist" },
    { name: "Harish K", role: "Frontend Associate" },
    { name: "Amudeshwar H", role: "Interface Associate" },
    { name: "Naveen Raj A", role: "Frontend Associate" },
  ];

  const guidanceAndSupportMembers: Member[] = [
    { name: "Dr. N. Vasudevan", role: "Principal" },
    { name: "Mr. K. Rajaguru", role: "Head of the system" },
    { name: "Dr. T. Avudaiappan", role: "Project Guide" },
  ];

  return (
    <div className="landing-shell relative min-h-screen overflow-hidden pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-orb landing-orb--one" aria-hidden="true" />
      <div className="landing-orb landing-orb--two" aria-hidden="true" />
      <div className="landing-orb landing-orb--three" aria-hidden="true" />

      <div className="relative max-w-6xl mx-auto">
        <header className="mb-10 sm:mb-12 text-center">
          <p className="landing-kicker mb-4">IDCS Recognition</p>
          <h1 className="landing-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight">
            Team Credits
          </h1>
          <p className="landing-subtitle mt-3 text-sm sm:text-base max-w-2xl mx-auto">
            Built through collaboration, commitment, and consistent support.
          </p>
        </header>

        <div className="space-y-10 sm:space-y-12">
          <CreditsSection
            title="Team Behind It"
            members={teamBehindItMembers}
            accent="ruby"
          />
          <CreditsSection
            title="Guidance and Support"
            members={guidanceAndSupportMembers}
            accent="gold"
          />
        </div>
      </div>
    </div>
  );
}
