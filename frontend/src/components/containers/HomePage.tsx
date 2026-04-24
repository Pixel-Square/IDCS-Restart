import React from "react";
import { Link } from "react-router-dom";
import {
  Library,
  GraduationCap,
  LineChart,
  ClipboardList,
  CalendarClock,
  ClipboardCheck,
  Users,
  FileText,
  Shield,
  Wallet,
} from "lucide-react";
import logo from "../../assets/idcs-logo.png";

interface HomePageProps {
  user: { username: string; email?: string; roles?: string[] } | null;
}

export default function HomePage({ user }: HomePageProps) {
  const heroHighlights = [
    { icon: GraduationCap, label: "Complete Student Lifecycle Management" },
    { icon: ClipboardList, label: "Faculty Portfolio and Research Tracking" },
    {
      icon: CalendarClock,
      label: "Advanced Timetabling and Resource Allocation",
    },

    { icon: LineChart, label: "HR Analytics" },
  ];

  const featureCards = [
    { icon: ClipboardCheck, title: "Comprehensive Examination Management" },
    { icon: FileText, title: "Document Management System" },
    { icon: Shield, title: "Access and Security Control" },
  ];

  const heroImage = "/landing-illustration.png";

  return (
    <div className="landing-shell min-h-screen overflow-hidden">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-orb landing-orb--one" aria-hidden="true" />
      <div className="landing-orb landing-orb--two" aria-hidden="true" />
      <div className="landing-orb landing-orb--three" aria-hidden="true" />

      <div className="fixed top-4 left-4 z-50 pointer-events-auto">
        <img
          src={logo}
          alt="IDCS Logo"
          className="h-12 w-12 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <main className="landing-main relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-1">
        <section id="about" className="pt-1 lg:pt-2">
          <div className="grid gap-4 md:gap-6 lg:gap-8 lg:grid-cols-[1fr_1.05fr_0.9fr] items-center">
            <div className="landing-illustration landing-fade-up order-2 lg:order-1">
              <img
                src={heroImage}
                alt="Campus operations illustration"
                className="landing-hero-art"
                loading="lazy"
              />
            </div>

            <div className="order-1 lg:order-2 landing-fade-up">
              <span className="landing-kicker">IDCS College ERP</span>
              <h1 className="landing-title mt-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                Elevate your Institution with IDCS College ERP
              </h1>
              <p className="landing-subtitle mt-2 text-sm sm:text-base">
                Streamline academic and administrative operations with
                comprehensive Education Resource Planning system,
                tailored for modern colleges and universities.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                {user ? (
                  <Link to="/dashboard" className="landing-cta">
                    Go to dashboard
                  </Link>
                ) : (
                  <Link to="/login" className="landing-cta">
                    Get Started
                  </Link>
                )}
                <Link to="/credits" className="landing-credits">
                  Team credits
                </Link>
              </div>
            </div>

            <div className="order-3 landing-fade-up">
              <div className="landing-highlight-panel">
                <h2 className="landing-panel-title">Core capabilities</h2>
                <ul className="mt-2 space-y-2">
                  {heroHighlights.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <li key={item.label} className="landing-highlight">
                        <span className="landing-highlight-icon">
                          <ItemIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="text-sm">{item.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="-mt-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((card, index) => {
              const CardIcon = card.icon;
              return (
                <div
                  key={card.title}
                  className="landing-card landing-fade-up"
                  style={{ animationDelay: `${140 + index * 60}ms` }}
                >
                  <span className="landing-card-icon">
                    <CardIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="landing-card-title">{card.title}</div>
                </div>
              );
            })}
          </div>
        </section>

        <footer
          id="privacy"
          className="mt-3 flex flex-wrap justify-center gap-4 text-sm"
        >
          <a className="landing-footer-link" href="#about">
            About
          </a>
          <a className="landing-footer-link" href="mailto:info@idcs.edu">
            Contact
          </a>
          <a className="landing-footer-link" href="#privacy">
            Privacy Policy
          </a>
        </footer>
      </main>
    </div>
  );
}
