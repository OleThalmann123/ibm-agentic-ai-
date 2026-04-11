import { useState, useEffect, useRef, useId } from 'react';
import { FileText, ShieldCheck, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    <div className="bg-card rounded-2xl border overflow-hidden relative">
      <style>{`
        @keyframes ask-float {
          0% { transform: translate3d(0, 0, 0) rotate(-2deg); }
          50% { transform: translate3d(0, -10px, 0) rotate(2deg); }
          100% { transform: translate3d(0, 0, 0) rotate(-2deg); }
        }
        @keyframes ask-dust {
          0% { transform: translate3d(0,0,0); opacity: .45; }
          50% { transform: translate3d(-10px,-6px,0); opacity: .65; }
          100% { transform: translate3d(0,0,0); opacity: .45; }
        }
        @keyframes ask-progress {
          0% { transform: translateX(-60%); opacity: .25; }
          30% { opacity: .7; }
          100% { transform: translateX(140%); opacity: .25; }
        }
      `}</style>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[#020617]" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_15%_0%,rgba(59,130,246,0.25),transparent_55%),radial-gradient(900px_520px_at_85%_15%,rgba(168,85,247,0.25),transparent_50%),radial-gradient(700px_520px_at_40%_110%,rgba(16,185,129,0.18),transparent_55%),linear-gradient(to_bottom,rgb(15_23_42),rgb(2_6_23))]" aria-hidden />
        <div
          className="absolute inset-0 mix-blend-screen opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0 1px, transparent 2px),' +
              'radial-gradient(circle at 70% 20%, rgba(147,197,253,0.18) 0 1px, transparent 2px),' +
              'radial-gradient(circle at 40% 70%, rgba(196,181,253,0.16) 0 1px, transparent 2px),' +
              'radial-gradient(circle at 85% 75%, rgba(110,231,183,0.14) 0 1px, transparent 2px)',
            backgroundSize: '220px 220px, 260px 260px, 240px 240px, 280px 280px',
            filter: 'blur(0.2px)',
            animation: 'ask-dust 6.5s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -left-10 -top-10 w-56 h-56 rounded-full blur-2xl opacity-50"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.35), transparent 60%), radial-gradient(circle at 70% 70%, rgba(168,85,247,0.25), transparent 65%)',
          }}
        />
      </div>

      <div className="px-6 sm:px-8 py-5 sm:py-6 text-white relative">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="relative w-12 h-12 flex-shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-white/10 backdrop-blur border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)]" />
            <div
              className="relative w-14 h-14 rounded-2xl bg-white/10 border border-white/10 shadow-[0_14px_26px_rgba(59,130,246,0.25)] flex items-center justify-center overflow-hidden"
              style={{ animation: 'ask-float 2.8s ease-in-out infinite' }}
            >
              <AsklepiosExtractLogo className="w-7 h-7 text-white select-none pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-white/70 uppercase">
              Agentic Workflow aktiv
            </p>
            <h3 className="text-base sm:text-lg font-bold leading-tight">Asklepios_extract legt deine Assistenzperson an</h3>
            <p className="text-xs sm:text-sm text-white/70 mt-0.5">Vertrag wird analysiert und Stammdaten werden vorbereitet.</p>
          </div>
          <Badge variant="outline" className="flex-shrink-0 mt-0.5 gap-1.5 rounded-full border-white/20 bg-white/5 text-white/80 px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-medium backdrop-blur whitespace-nowrap">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/60" />
            ca. 3–5 Min.
          </Badge>
        </div>
      </div>

      <div className="relative px-6 sm:px-8 pb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 lg:gap-10 items-start">

        <div className="flex flex-col items-center text-center lg:items-center mx-auto max-w-sm">
          <div className="relative w-40 h-40 sm:w-44 sm:h-44 mb-4">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden>
              <defs>
                <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="50%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
              <circle
                cx="100" cy="100" r="88"
                fill="none" stroke={`url(#${ringGradId})`} strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-500 ease-linear"
              />
              <circle
                cx="100" cy="100" r="88"
                fill="none" stroke={`url(#${ringGradId})`} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-500 ease-linear"
                style={{ filter: 'blur(8px)', opacity: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight tabular-nums">{timeStr}</span>
              <span className="text-[10px] font-medium tracking-[2px] uppercase text-white/45 mt-1">verbleibend</span>
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Lehn dich zurück.</h3>
          <p className="text-sm text-white/50 leading-relaxed">
            Der Agent wertet <strong className="text-emerald-300/95 font-semibold">über 30 Datenfelder</strong> aus — das braucht etwas Zeit.
          </p>
        </div>

        <div className="space-y-0">
          <div className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-300/30 flex items-center justify-center shadow-[0_10px_26px_rgba(59,130,246,0.22)] animate-pulse">
                <FileText className="w-4 h-4 text-blue-200" />
              </div>
              <div className="w-0.5 h-5 bg-gradient-to-b from-blue-300/70 to-white/10 my-0.5" />
            </div>
            <div className="pt-1 pb-3">
              <p className="text-[13px] font-bold text-white">Agent 1 – Datenextraktion</p>
              <p className="text-[11px] text-white/55 mt-0.5 leading-snug">Strukturierte Stammdaten und Vertragswerte werden erkannt.</p>
            </div>
          </div>
          <div className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-300/30 flex items-center justify-center shadow-[0_10px_26px_rgba(168,85,247,0.20)]">
                <ShieldCheck className="w-4 h-4 text-purple-200" />
              </div>
              <div className="w-0.5 h-5 bg-gradient-to-b from-purple-200/70 to-white/10 my-0.5" />
            </div>
            <div className="pt-1 pb-3">
              <p className="text-[13px] font-bold text-white/90">Agent 2 – Qualitätscheck</p>
              <p className="text-[11px] text-white/55 mt-0.5 leading-snug">Unsichere Felder werden markiert und begründet.</p>
            </div>
          </div>
          <div className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-white/55" />
              </div>
            </div>
            <div className="pt-1">
              <p className="text-[13px] font-bold text-white/90">Schritt 3 – Manuelle Überprüfung</p>
              <p className="text-[11px] text-white/55 mt-0.5 leading-snug">Markierte Felder prüfen und bei Bedarf anpassen.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative px-6 sm:px-8 pb-5 flex flex-col items-center gap-3 border-t border-white/[0.06] pt-4">
        <div
          className="relative h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Analyse Fortschritt"
        >
          <div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.70),rgba(168,85,247,0.65),rgba(16,185,129,0.55))]"
            style={{ animation: 'ask-progress 1.15s ease-in-out infinite' }}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-white/45 hover:text-white/80 transition-colors"
        >
          Analyse abbrechen
        </button>
      </div>
    </div>
  );
}
