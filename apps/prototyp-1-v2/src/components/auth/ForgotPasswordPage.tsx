import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';
import { AsklepiosLogo } from '@/components/brand/AsklepiosLogo';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setEmail('');
    toast.success('Passwort erfolgreich zurückgesetzt!');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/login-bg.png')" }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background/95 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-white/90 border border-border flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <AsklepiosLogo className="w-full h-full object-contain p-2.5" />
          </div>
          <h1 className="text-2xl font-bold">Asklepios</h1>
          <p className="text-muted-foreground mt-1">Verwaltung des IV-Assistenzbeitrags</p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-2">Passwort zurücksetzen</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Reset-Link.
          </p>

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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Reset-Link senden
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Zurück zur Anmeldung
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          HSG × IBM – Digitalisierung des IV-Assistenzbeitrags
        </p>
      </div>
    </div>
  );
}
