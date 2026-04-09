import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@asklepios/backend';
import { formatCHF } from '@asklepios/backend';
import type { Assistant } from '@asklepios/backend';
import { toast } from 'sonner';
import { Users, Pencil, X, UserPlus, Sparkles, Share2, Copy, Check } from 'lucide-react';

import { EmployerOnboarding } from '@/components/onboarding/EmployerOnboarding';
import { AssistantOnboarding } from '@/components/onboarding/AssistantOnboarding';

export function AssistantsPage() {
  const { employer, employerAccess, refreshProfile } = useAuth();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [showAssistantOnboarding, setShowAssistantOnboarding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editHourlyRate, setEditHourlyRate] = useState('35.30');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editVacationWeeks, setEditVacationWeeks] = useState('4');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  const resetForm = () => {
    setEditName('');
    setEditEmail('');
    setEditHourlyRate('35.30');
    setEditBirthDate('');
    setEditVacationWeeks('4');
    setEditId(null);
    setShowForm(false);
  };

  const openEdit = (a: Assistant) => {
    setEditName(a.name);
    setEditEmail(a.email ?? '');
    setEditHourlyRate(a.hourly_rate?.toString() ?? '35.30');
    setEditBirthDate(a.date_of_birth ?? '');
    setEditVacationWeeks(a.vacation_weeks?.toString() ?? '4');
    setEditId(a.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!employerAccess?.employer_id || !editName.trim()) {
      toast.error('Name ist erforderlich');
      return;
    }

    if (editId) {
      const { error } = await supabase.from('assistant').update({
        name: editName.trim(),
        email: editEmail.trim() || null,
        date_of_birth: editBirthDate.trim() || null,
        vacation_weeks: parseInt(editVacationWeeks, 10) || null,
        hourly_rate: parseFloat(editHourlyRate) || null,
      }).eq('id', editId);
      if (error) {
        toast.error('Fehler beim Speichern: ' + error.message);
      } else {
        toast.success('Assistenzperson aktualisiert');
      }
    } else {
      const { error } = await supabase.from('assistant').insert({
        employer_id: employerAccess.employer_id,
        name: editName.trim(),
        email: editEmail.trim() || null,
        date_of_birth: editBirthDate.trim() || null,
        vacation_weeks: parseInt(editVacationWeeks, 10) || null,
        hourly_rate: parseFloat(editHourlyRate) || null,
      });
      if (error) {
        toast.error('Fehler beim Anlegen: ' + error.message);
      } else {
        toast.success('Assistenzperson hinzugefügt');
      }
    }

    resetForm();
    loadAssistants();
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

  // Redirect to dashboard if onboarding not done
  if (needsOnboarding) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <Users className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Bitte zuerst das Onboarding in der <a href="/onboarding" className="text-primary hover:underline font-medium">Einrichtung</a> abschliessen.</p>
      </div>
    );
  }

  // Show inline AssistantOnboarding when active
  if (showAssistantOnboarding) {
    return (
      <AssistantOnboarding 
        onComplete={() => { setShowAssistantOnboarding(false); loadAssistants(); }} 
        onClose={() => setShowAssistantOnboarding(false)} 
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
        <button
          onClick={() => setShowAssistantOnboarding(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Neue Person anlegen (Smarter Scan)
        </button>
      </div>

      {/* Assistant list */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Name / Kontakt</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Details</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Optionen</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {assistants.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Noch keine Assistenzpersonen angelegt.</p>
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
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
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {a.hourly_rate && <p>Stundensatz: {formatCHF(a.hourly_rate)}/h</p>}
                      {a.vacation_weeks && <p>Ferien: {a.vacation_weeks} Wochen</p>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                        {a.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                      {a.has_bvg && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">BVG</span>
                      )}
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
                      <button onClick={() => toggleActive(a)} className="p-2 rounded-lg hover:bg-muted transition-colors" title={a.is_active ? 'Deaktivieren' : 'Aktivieren'}>
                        {a.is_active ? (
                          <X className="w-3.5 h-3.5 text-destructive" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="bg-card rounded-2xl border shadow-2xl w-full max-w-2xl p-8 space-y-6 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? 'Assistenzperson bearbeiten' : 'Neue Assistenzperson'}</h3>
              <button onClick={resetForm} className="p-1"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="Maria Schneider" className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-Mail (optional)</label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                placeholder="maria@beispiel.ch" className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Geburtsdatum</label>
                <input type="date" value={editBirthDate} onChange={e => setEditBirthDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ferien (Wochen)</label>
                <input type="number" min="0" max="10" value={editVacationWeeks} onChange={e => setEditVacationWeeks(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Stundensatz (CHF)</label>
              <input type="number" step="0.01" value={editHourlyRate} onChange={e => setEditHourlyRate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={resetForm}
                className="flex-1 py-2.5 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">
                Abbrechen
              </button>
              <button onClick={handleSave}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                {editId ? 'Speichern' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
