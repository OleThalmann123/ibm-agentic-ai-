import { useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { FileText, ShieldCheck, CheckCircle2, Clock } from 'lucide-react';

/** Anzeige-Dauer: länger als typische Extraktion, damit der Ring nicht auf 0 springt bevor fertig. */
const TOTAL_SECONDS = 300;

interface Props {
  asklepiosLogoUrl: string;
  onCancel: () => void;
}

export function ExtractingScreen({ asklepiosLogoUrl, onCancel }: Props) {
  const ringGradId = useId().replace(/:/g, '');
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      setRemaining(Math.max(0, TOTAL_SECONDS - Math.floor(elapsed)));
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  const progressPct = ((TOTAL_SECONDS - remaining) / TOTAL_SECONDS) * 100;

  const circumference = 2 * Math.PI * 88;
  const dashOffset = circumference - (progressPct / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#020617]">
      <style>{`
        @keyframes ask-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -6px, 0); }
        }
      `}</style>

      {/* Soft background gradients (decorative) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_15%_0%,rgba(59,130,246,0.22),transparent_55%),radial-gradient(900px_520px_at_85%_15%,rgba(168,85,247,0.20),transparent_50%),radial-gradient(700px_520px_at_40%_110%,rgba(16,185,129,0.15),transparent_55%)]" />
      </div>

      <div className="relative text-white">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-5 px-8 sm:px-12 pt-10 sm:pt-12 pb-8 sm:pb-10">
          <div
            className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-[0_14px_30px_rgba(59,130,246,0.25)]"
            style={{ animation: 'ask-float 3s ease-in-out infinite' }}
          >
            <img
              src={asklepiosLogoUrl}
              alt="Asklepios"
              className="pointer-events-none h-full w-full select-none object-contain p-2"
              draggable={false}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
              Agentic Workflow aktiv
            </p>
            <h2 className="text-xl font-bold leading-tight sm:text-2xl">
              Asklepios legt deine Assistenzperson an
            </h2>
            <p className="text-sm text-white/60">
              Vertrag wird analysiert und Stammdaten werden vorbereitet.
            </p>
          </div>
          <div className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/75 backdrop-blur">
            <Clock className="h-3.5 w-3.5 text-white/55" />
            ca. 3–5 Min.
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 items-center gap-12 px-8 pb-10 sm:px-12 sm:pb-14 lg:grid-cols-2 lg:gap-16">
          {/* Timer ring */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6 h-52 w-52 sm:h-56 sm:w-56">
              <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
                <defs>
                  <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="50%" stopColor="#A855F7" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="none"
                  stroke={`url(#${ringGradId})`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold tracking-tight text-white tabular-nums sm:text-5xl">{timeStr}</span>
                <span className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">verbleibend</span>
              </div>
            </div>
            <h3 className="mb-2 text-lg font-bold text-white sm:text-xl">Lehn dich zurück.</h3>
            <p className="max-w-xs text-sm leading-relaxed text-white/55">
              Der Agent wertet <span className="font-semibold text-emerald-300">über 30 Datenfelder</span> aus — das braucht etwas Zeit.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <StepItem
              icon={<FileText className="h-5 w-5 text-blue-200" />}
              iconBg="bg-blue-500/15 border-blue-300/25 shadow-[0_10px_26px_rgba(59,130,246,0.22)]"
              title="Agent 1 – Datenextraktion"
              description="Strukturierte Stammdaten und Vertragswerte werden erkannt."
            />
            <StepItem
              icon={<ShieldCheck className="h-5 w-5 text-purple-200" />}
              iconBg="bg-purple-500/15 border-purple-300/25 shadow-[0_10px_26px_rgba(168,85,247,0.20)]"
              title="Agent 2 – Qualitätscheck"
              description="Unsichere Felder werden markiert und begründet."
            />
            <StepItem
              icon={<CheckCircle2 className="h-5 w-5 text-white/55" />}
              iconBg="bg-white/10 border-white/15"
              title="Schritt 3 – Manuelle Überprüfung"
              description="Markierte Felder prüfen und bei Bedarf anpassen."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-center border-t border-white/[0.06] px-8 py-5 sm:px-12">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-white/45 transition-colors hover:text-white/80"
          >
            Analyse abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

function StepItem({
  icon,
  iconBg,
  title,
  description,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 backdrop-blur-sm">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${iconBg}`}>
        {icon}
      </div>
      <div className="pt-0.5">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/55">{description}</p>
      </div>
    </div>
  );
}
