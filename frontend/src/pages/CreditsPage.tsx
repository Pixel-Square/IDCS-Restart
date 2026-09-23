import React from "react";

type Member = {
  name: string;
  role: string;
  batch?: string;
};

type CreditsSectionProps = {
  title: string;
  members: Member[];
  accent: "blue" | "emerald";
};

function CreditsSection({ title, members, accent }: CreditsSectionProps) {
  const accentStyles =
    accent === "blue"
      ? {
        badge: "bg-blue-100 text-blue-700 border-blue-200",
        card: "hover:border-blue-300",
        role: "text-blue-700",
      }
      : {
        badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
        card: "hover:border-emerald-300",
        role: "text-emerald-700",
      };

  return (
    <section className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">{title}</h2>
        <span className={`rounded-full border px-3 py-1 text-xs sm:text-sm font-medium ${accentStyles.badge}`}>
          {members.length} Members
        </span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member, index) => (
          <li
            key={member.name}
            className={`group rounded-2xl border border-slate-200 bg-white/80 backdrop-blur px-4 py-4 sm:px-5 sm:py-5 transition-all duration-200 shadow-sm hover:shadow-md ${accentStyles.card}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                  {index + 1}
                </span>
                <div>
                  <p className="text-base sm:text-lg font-semibold text-slate-900">{member.name}</p>
                  <p className={`text-sm font-medium ${accentStyles.role}`}>{member.role}</p>
                </div>
              </div>
              {member.batch && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100/90 px-2.5 py-0.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {member.batch}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CreditsPage() {
  const teamBehindItMembers: Member[] = [
    { name: "#Abi Varsan P", role: "Senior Core Architect", batch: "2023-2027" },
    { name: "Lalith kishore N S", role: "App Forge Engineer", batch: "2023-2027" },
    { name: "Hariprashath B", role: "System Stabilizer", batch: "2023-2027" },
    { name: "Mohamed Firdous S", role: "Visual Systems Lead", batch: "2023-2027" },
    { name: "Prasanna N", role: "UI Strategist", batch: "2023-2027" },
    { name: "Hariswasthra S", role: "Senior Frontend Associate", batch: "2023-2027" },
    { name: "Padmapriya S", role: "Interface Crafter", batch: "2023-2027" },
    { name: "Nithyapriya S", role: "Doc Systems Curator", batch: "2023-2027" },
    { name: "Rexcia A", role: "Module Architect", batch: "2023-2027" },
    { name: "Rohit S K", role: "Core Architect", batch: "2024-2028" },
    { name: "Judson Asaph H", role: "Server Specialist", batch: "2024-2028" },
    { name: "SharukK Hasthik M", role: "Infra Specialist", batch: "2024-2028" },
    { name: "Harish K", role: "Hardware Specialist", batch: "2024-2028" },
    { name: "Amudeshwar H", role: "Interface Associate", batch: "2024-2028" },
    { name: "Naveen Raj A", role: "Frontend Associate", batch: "2024-2028" },
    { name: "Karthika M", role: "Backend Associate", batch: "2023-2027" },
    { name: "Vivetha M", role: "Data Scientist", batch: "2023-2027" },
    { name: "Eshwaran K", role: "Senior Hardware Specialist (Sector A)", batch: "2023-2027" },
    { name: "Aslam N", role: "Senior Hardware Specialist (Sector B)", batch: "2023-2027" },
  ];

  const guidanceAndSupportMembers: Member[] = [
    { name: "Dr. N. Vasudevan", role: "Principal" },
    { name: "Mr. K. Rajaguru", role: "Head of the system" },
    { name: "Dr. T. Avudaiappan", role: "Project Guide" },

  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-100 via-white to-emerald-100 pt-24 pb-14 px-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute -top-12 -left-10 h-56 w-56 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-12 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative max-w-6xl mx-auto">
        <header className="mb-10 sm:mb-12 text-center">
          <p className="inline-flex items-center rounded-full border border-slate-300 bg-white/70 px-4 py-1 text-xs sm:text-sm font-medium text-slate-700 mb-4">
            IDCS Recognition
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900">
            Team Credits
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
            Built through collaboration, commitment, and consistent support.
          </p>
        </header>

        <div className="space-y-10 sm:space-y-12">
          <CreditsSection title="Team Behind It" members={teamBehindItMembers} accent="blue" />
          <CreditsSection title="Guidance and Support" members={guidanceAndSupportMembers} accent="emerald" />
        </div>
      </div>
    </div>
  );
}
