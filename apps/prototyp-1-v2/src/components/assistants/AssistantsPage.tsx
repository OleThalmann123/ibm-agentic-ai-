import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/backend';
import { formatCHF } from '@asklepios/backend';
import type { Assistant } from '@asklepios/backend';
import { toast } from 'sonner';
import { Users, Pencil, X, UserPlus, Share2, Copy, Check, UploadCloud, Trash2 } from 'lucide-react';
import asklepiosLogo from '@/assets/asklepios-logo.png';


import { AssistantOnboarding } from '@/components/onboarding/AssistantOnboarding';

export function AssistantsPage() {
  const { employer, employerAccess, refreshProfile } = useAuth();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [showAssistantOnboarding, setShowAssistantOnboarding] = useState(false);
  const [initialUploadFile, setInitialUploadFile] = useState<File | null>(null);
  const [assistantToEdit, setAssistantToEdit] = useState<Assistant | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLinkFor, setCopiedLinkFor] = useState<string | null>(null);

  const needsOnboarding = !employer || !employerAccess;

  // --- WhatsApp Magic Link helpers (from Prototype_v1) ---
  const getShareLink = (id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return `${origin}/t/${id}`;
  };

  const getShareText = (id: string) => {
    return `Hallo! Hier ist dein persönlicher Login-Link für die IV-Assistenz App. Keine Passwörter nötig – klicke auf diesen Link, um deine Zeiten einzutragen:\n\n${getShareLink(id)}`;
  };

  const handleWhatsAppShare = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.open(`https://wa.me/?text=${encodeURIComponent(getShareText(id))}`, '_blank');
  };

  const handleCopyLink = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const link = getShareLink(id);
    navigator.clipboard.writeText(link);
    toast.success('Link kopiert!');
    setCopiedLinkFor(id);
    setTimeout(() => setCopiedLinkFor(null), 2000);
  };

  const loadAssistants = async () => {
    if (!employerAccess?.employer_id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('assistant')
      .select('*')
      .eq('employer_id', employerAccess.employer_id)
      .order('name');
    
    if (error) {
      console.error('Error fetching assistants:', error);
      toast.error('Fehler beim Laden: ' + error.message);
    }
    
    if (data) setAssistants(data);
    setLoading(false);
  };

  useEffect(() => {
    if (employerAccess?.employer_id) {
      loadAssistants();
    } else {
      setLoading(false);
    }
  }, [employerAccess?.employer_id]);

  const openEdit = (a: Assistant) => {
    setAssistantToEdit(a);
    setShowAssistantOnboarding(true);
  };

  const handleDelete = async (a: Assistant) => {
    if (confirm(`Möchten Sie ${a.name} wirklich löschen? Alle zugehörigen Daten (Zeiteinträge, Abrechnungen) werden unwiderruflich gelöscht.`)) {
      const { error } = await supabase.from('assistant').delete().eq('id', a.id);
      if (error) {
        toast.error('Fehler beim Löschen: ' + error.message);
      } else {
        toast.success(`${a.name} wurde gelöscht.`);
        loadAssistants();
      }
    }
  };

  const toggleActive = async (a: Assistant) => {
    const { error } = await supabase.from('assistant').update({ is_active: !a.is_active }).eq('id', a.id);
    if (error) toast.error('Fehler');
    else {
      toast.success(a.is_active ? 'Deaktiviert' : 'Aktiviert');
      loadAssistants();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Lade Assistenzpersonen...</p>
        </div>
      </div>
    );
  }

  // Onboarding overlay in AppShell handles this
  if (needsOnboarding) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <Users className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Bitte schliessen Sie die Einrichtung ab.</p>
      </div>
    );
  }

  // Show inline AssistantOnboarding when active
  if (showAssistantOnboarding) {
    return (
      <AssistantOnboarding 
        onComplete={() => { setShowAssistantOnboarding(false); setInitialUploadFile(null); setAssistantToEdit(null); loadAssistants(); }} 
        onClose={() => { setShowAssistantOnboarding(false); setInitialUploadFile(null); setAssistantToEdit(null); }} 
        initialUploadFile={initialUploadFile || undefined}
        editAssistant={assistantToEdit || undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assistenzpersonen</h1>
          <p className="text-muted-foreground">Verwalten Sie Ihre Assistenzpersonen</p>
        </div>
      </div>

      {/* Prominent CTA Card */}
      <div className="relative overflow-hidden rounded-2xl p-[1px] bg-[linear-gradient(90deg,rgba(59,130,246,0.55),rgba(168,85,247,0.50),rgba(16,185,129,0.38))] shadow-[0_20px_70px_rgba(2,6,23,0.18)]">
        <div className="relative rounded-2xl border border-transparent p-8 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_15%_0%,rgba(59,130,246,0.25),transparent_60%),radial-gradient(780px_520px_at_85%_10%,rgba(168,85,247,0.25),transparent_55%),radial-gradient(620px_520px_at_45%_120%,rgba(16,185,129,0.18),transparent_55%),linear-gradient(to_bottom,rgba(2,6,23,0.92),rgba(2,6,23,0.78))] rounded-2xl" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <img src={asklepiosLogo} alt="Asklepios" className="w-7 h-7 object-contain" />
              </div>
              <h2 className="text-xl font-bold">Neue Assistenzperson erfassen</h2>
            </div>
            <p className="text-white/70 max-w-md">
              Asklepios hilft dir bei der Anlage deiner Assistenzperson, indem er Stamm- und Vertragsdaten für dich aus dem Arbeitsvertrag ausliest.
            </p>
          </div>
          <label className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-slate-900 text-sm font-bold hover:bg-white/90 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] cursor-pointer">
            <UploadCloud className="w-5 h-5" />
            Vertrag hochladen & scannen
            <input 
              type="file" 
              accept=".pdf,.doc,.docx,.txt,image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setInitialUploadFile(e.target.files[0]);
                  setShowAssistantOnboarding(true);
                }
              }}
            />
          </label>
        </div>
        </div>
      </div>

      {/* Assistant list */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Name / Kontakt</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {assistants.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Noch keine Assistenzpersonen angelegt.</p>
                  <button
                    onClick={() => { setAssistantToEdit(null); setShowAssistantOnboarding(true); }}
                    className="mt-3 text-primary text-sm font-medium hover:underline"
                  >
                    Jetzt erste Person anlegen
                  </button>
                </td>
              </tr>
            ) : (
              assistants.map((a) => (
                <tr key={a.id} className={`border-b last:border-b-0 hover:bg-muted/20 transition-colors ${!a.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-semibold text-sm">{a.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{a.name}</p>
                        {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleWhatsAppShare(a.id, e)}
                        title="Per WhatsApp teilen"
                        className="p-2 rounded-lg bg-[#25D366] hover:bg-[#128C7E] transition-colors flex items-center gap-1.5 text-white text-xs font-bold"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </button>
                      <button
                        onClick={(e) => handleCopyLink(a.id, e)}
                        title="Login-Link kopieren"
                        className="p-2 rounded-lg bg-muted hover:bg-muted/80 border text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        {copiedLinkFor === a.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="hidden sm:inline">{copiedLinkFor === a.id ? 'Kopiert!' : 'Link'}</span>
                      </button>
                      <button onClick={() => openEdit(a)} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Bearbeiten">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(a)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors" title="Löschen">
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500 transition-colors" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* (Old Add/Edit modal removed in favor of full AssistantOnboarding screen) */}
    </div>
  );
}
