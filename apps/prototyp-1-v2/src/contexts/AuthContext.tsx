import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@asklepios/backend';
import type { Employer, EmployerAccess } from '@asklepios/backend';

/** employer_access-Zeile inkl. Namen des Arbeitgebers (Join). */
export type EmployerAccessRow = EmployerAccess & {
  employer?: { id: string; name: string } | null;
};

const ACTIVE_EMPLOYER_ACCESS_KEY = 'asklepios_active_employer_access_id';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  employer: Employer | null;
  employerAccess: EmployerAccess | null;
  /** Alle Mandanten-Zugriffe des Users (für Wechsler). */
  employerAccessList: EmployerAccessRow[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  selectEmployerAccess: (access: EmployerAccessRow) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [employerAccess, setEmployerAccess] = useState<EmployerAccess | null>(null);
  const [employerAccessList, setEmployerAccessList] = useState<EmployerAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployerAccesses = async (userId: string) => {
    const { data, error } = await supabase
      .from('employer_access')
      .select('*, employer:employer_id(id, name)')
      .eq('user_id', userId);

    if (error || !data?.length) {
      setEmployerAccessList([]);
      setEmployerAccess(null);
      setEmployer(null);
      return null;
    }

    // Filter out orphaned accesses (employer was deleted but access remains)
    const list = (data as EmployerAccessRow[]).filter(a => a.employer != null);
    if (!list.length) {
      setEmployerAccessList([]);
      setEmployerAccess(null);
      setEmployer(null);
      return null;
    }
    setEmployerAccessList(list);

    const storedId = localStorage.getItem(ACTIVE_EMPLOYER_ACCESS_KEY);
    const picked = storedId ? list.find((a) => a.id === storedId) : null;
    // Bug C1: Gespeicherte ID zeigt auf einen Mandanten, den es nicht mehr
    // gibt (oder nie gab für diesen User) – localStorage aufräumen und
    // sichtbar warnen, statt still auf list[0] zu kippen.
    if (storedId && !picked) {
      console.warn(
        `[auth] Gespeicherter employer_access "${storedId}" ist nicht mehr verfügbar – fallback auf ersten verfügbaren Mandanten.`,
      );
      localStorage.removeItem(ACTIVE_EMPLOYER_ACCESS_KEY);
    }
    const access = picked ?? list[0]!;

    setEmployerAccess(access);
    localStorage.setItem(ACTIVE_EMPLOYER_ACCESS_KEY, access.id);
    return access;
  };

  const fetchEmployer = async (employerId: string) => {
    const { data } = await supabase
      .from('employer')
      .select('*')
      .eq('id', employerId)
      .single();
    
    if (data) setEmployer(data as Employer);
    return data as Employer | null;
  };

  const refreshProfile = async () => {
    if (user) {
      const access = await fetchEmployerAccesses(user.id);
      if (access) await fetchEmployer(access.employer_id);
    }
  };

  const selectEmployerAccess = async (access: EmployerAccessRow) => {
    localStorage.setItem(ACTIVE_EMPLOYER_ACCESS_KEY, access.id);
    setEmployerAccess(access);
    await fetchEmployer(access.employer_id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchEmployerAccesses(session.user.id)
          .then((access) => {
            if (access) return fetchEmployer(access.employer_id);
          })
          .catch((err) => console.error('Error fetching employer info:', err))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchEmployerAccesses(session.user.id).then((access) => {
          if (access) fetchEmployer(access.employer_id);
        });
      } else {
        setEmployer(null);
        setEmployerAccess(null);
        setEmployerAccessList([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setEmployer(null);
    setEmployerAccess(null);
    setEmployerAccessList([]);
    try {
      localStorage.removeItem(ACTIVE_EMPLOYER_ACCESS_KEY);
    } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{
      session, user, employer, employerAccess, employerAccessList, loading,
      signIn, signUp, signOut, refreshProfile, selectEmployerAccess
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
