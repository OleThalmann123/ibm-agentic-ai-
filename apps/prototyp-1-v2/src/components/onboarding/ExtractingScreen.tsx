import { useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { FileText, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AsklepiosExtractLogo } from '@/components/brand/AsklepiosExtractLogo';

/** Anzeige-Dauer: länger als typische Extraktion, damit der Ring nicht auf 0 springt bevor fertig. */
const TOTAL_SECONDS = 300;

interface Props {
  onCancel: () => void;
}

export function ExtractingScreen({ onCancel }: Props) {
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
        {/* Centered header */}
        <div className="px-8 pt-14 pb-10 text-center sm:px-16 sm:pt-16 sm:pb-12">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-[0_18px_40px_rgba(59,130,246,0.28)]"
            style={{ animation: 'ask-float 3s ease-in-out infinite' }}
          >
            <AsklepiosExtractLogo className="h-10 w-10 text-white" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            Agentic Workflow aktiv &middot; ca. 3 bis 5 Min.
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-bold leading-tight sm:text-3xl">
            Asklepios_extract legt deine Assistenzperson an
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/65">
            Vertrag wird analysiert und Stammdaten werden vorbereitet.
          </p>
        </div>

        {/* Timer ring */}
        <div className="flex flex-col items-center px-8 pb-10 text-center sm:px-16 sm:pb-12">
          <div className="relative h-56 w-56 sm:h-64 sm:w-64">
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
              <span className="text-5xl font-bold tracking-tight text-white tabular-nums sm:text-6xl">{timeStr}</span>
              <span className="mt-3 text-xs font-medium uppercase tracking-[0.22em] text-white/45">verbleibend</span>
            </div>
          </div>
          <h3 className="mt-8 text-xl font-bold text-white sm:text-2xl">Lehn dich zurück</h3>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-white/60">
            Der Agent wertet <span className="font-semibold text-emerald-300">über 30 Datenfelder</span> aus.
            Das braucht etwas Zeit.
          </p>
        </div>

        {/* 3 steps in a horizontal row */}
        <div className="grid grid-cols-1 gap-4 px-8 pb-14 sm:grid-cols-3 sm:gap-5 sm:px-16 sm:pb-16">
          <StepItem
            icon={<FileText className="h-6 w-6 text-blue-200" />}
            iconBg="bg-blue-500/15 border-blue-300/25 shadow-[0_10px_30px_rgba(59,130,246,0.22)]"
            title="Agent 1: Datenextraktion"
            description="Strukturierte Stammdaten und Vertragswerte werden erkannt."
          />
          <StepItem
            icon={<ShieldCheck className="h-6 w-6 text-purple-200" />}
            iconBg="bg-purple-500/15 border-purple-300/25 shadow-[0_10px_30px_rgba(168,85,247,0.20)]"
            title="Agent 2: Qualitätscheck"
            description="Unsichere Felder werden markiert und begründet."
          />
          <StepItem
            icon={<CheckCircle2 className="h-6 w-6 text-white/55" />}
            iconBg="bg-white/10 border-white/15"
            title="Schritt 3: Manuelle Überprüfung"
            description="Markierte Felder prüfen und bei Bedarf anpassen."
          />
        </div>

        {/* Cancel */}
        <div className="flex items-center justify-center border-t border-white/[0.06] px-8 py-6 sm:px-16">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-white/50 transition-colors hover:text-white/85"
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
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 backdrop-blur-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-base font-bold text-white">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/60">{description}</p>
      </div>
    </div>
  );
}
