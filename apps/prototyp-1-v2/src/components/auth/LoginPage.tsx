import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/backend';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, User } from 'lucide-react';

export function LoginPage({ autoDemo }: { autoDemo?: boolean }) {
  const { signIn, signUp, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const demoTriggeredRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error('Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.');
    } else {
      toast.success('Willkommen zurück!');
      navigate('/assistants');
    }
  };

  const handleQuickLogin = async () => {
    const demoEmail = 'demo@asklepios.demo';
    const demoPassword = 'Password123!';

    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);

    // 1. Versuch: Direkter Login
    const { error: loginError } = await signIn(demoEmail, demoPassword);
    
    let needsDemoData = false;

    if (loginError) {
      // 2. Versuch: Automatisch registrieren, falls Konto nicht existiert (z.B. nach Datenbank-Reset)
      const { error: signUpError } = await signUp(demoEmail, demoPassword, 'Demo Arbeitgeber');
      
      if (!signUpError) {
        // Nach Registrierung direkt einloggen
        const { error: secondLoginError } = await signIn(demoEmail, demoPassword);
        
        if (secondLoginError) {
          setLoading(false);
          toast.error('Demo-Account wurde erstellt, aber Auto-Login schlug fehl: ' + secondLoginError.message);
          return;
        } else {
          needsDemoData = true;
        }
      } else {
        setLoading(false);
        toast.error('Konnte Demo-Account nicht automatisch erstellen: ' + signUpError.message);
        return;
      }
    } else {
      // Check if employer access is missing (e.g. after Onboarding Reset)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ea } = await supabase.from('employer_access').select('id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!ea) {
          needsDemoData = true;
        }
      }
    }

    if (needsDemoData) {
      try {
        // Initiale Demo-Daten anlegen
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: emp, error: e1 } = await supabase.from('employer').insert({
            name: 'Demo Arbeitgeber',
            canton: 'ZH',
            representation: 'self',
            iv_hours_day: 8, iv_hours_night: 0, iv_rate: 35.30,
            contact_data: {
              first_name: 'Max',
              last_name: 'Muster',
              street: 'Musterstrasse 1',
              plz: '8000',
              city: 'Zürich',
            }
          }).select().single();

          if (!e1 && emp) {
            await supabase.from('employer_access').insert({
              employer_id: emp.id,
              user_id: user.id,
              role: 'admin_full',
              invited_email: demoEmail
            });

            await supabase.from('assistant').insert([
              { employer_id: emp.id, name: 'Max Mustermann (Demo)', email: 'max@example.com', date_of_birth: '1990-01-15', hourly_rate: 35.30, vacation_weeks: 4, has_withholding_tax: false, has_bvg: false, is_active: true, time_entry_mode: 'manual' },
              { employer_id: emp.id, name: 'Anna Schmidt (Demo)', email: 'anna@example.com', date_of_birth: '1985-06-20', hourly_rate: 42.00, vacation_weeks: 5, has_withholding_tax: false, has_bvg: true, is_active: true, time_entry_mode: 'manual' },
            ]);
          }
        }
        await refreshProfile();
        
        setLoading(false);
        toast.success('Demo-Account erstellt und angemeldet!');
        navigate('/assistants');
      } catch (err) {
        console.error('Fehler bei der Demo-Daten Erzeugung:', err);
        setLoading(false);
        navigate('/assistants');
      }
    } else {
      setLoading(false);
      toast.success('Willkommen im Demo-Modus!');
      navigate('/assistants');
    }
  };

  useEffect(() => {
    const wantsDemo = autoDemo || searchParams.get('demo') === '1';
    if (!wantsDemo) return;
    if (demoTriggeredRef.current) return;
    demoTriggeredRef.current = true;
    handleQuickLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold">Asklepios</h1>
          <p className="text-muted-foreground mt-1">Verwaltung des IV-Assistenzbeitrags</p>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-6">Anmelden</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.ch"
                required
                className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Anmelden
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Noch kein Konto?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Jetzt registrieren
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          HSG × IBM – Digitalisierung des IV-Assistenzbeitrags
        </p>
      </div>

      {/* Floating Demo Quick-Login Button */}
      <button
        onClick={handleQuickLogin}
        disabled={loading}
        className="fixed bottom-6 right-6 p-3 bg-secondary border border-border shadow-lg rounded-full text-foreground hover:bg-secondary/80 hover:scale-105 active:scale-95 transition-all z-50 group flex items-center justify-center cursor-pointer disabled:opacity-50"
        aria-label="Demo Zugang"
      >
        <div className="relative">
          <User className="w-5 h-5 opacity-80 group-hover:opacity-100" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </span>
        </div>
        <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-xs font-medium rounded-md shadow-sm border border-border opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
          Schnellzugriff (Demo)
        </span>
      </button>
    </div>
  );
}
