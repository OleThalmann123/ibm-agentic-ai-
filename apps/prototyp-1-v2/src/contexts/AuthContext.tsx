import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@asklepios/backend';
import type { Employer, EmployerAccess, UserRole } from '@asklepios/backend';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  employer: Employer | null;
  employerAccess: EmployerAccess | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [employerAccess, setEmployerAccess] = useState<EmployerAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmployerAccess = async (userId: string) => {
    // Get the first employer_access for this user
    const { data } = await supabase
      .from('employer_access')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .single();
    
    if (data) {
      setEmployerAccess(data as EmployerAccess);
      return data as EmployerAccess;
    }
    return null;
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
      const access = await fetchEmployerAccess(user.id);
      if (access) await fetchEmployer(access.employer_id);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchEmployerAccess(session.user.id)
          .then((access) => {
            if (access) fetchEmployer(access.employer_id);
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
        fetchEmployerAccess(session.user.id).then((access) => {
          if (access) fetchEmployer(access.employer_id);
        });
      } else {
        setEmployer(null);
        setEmployerAccess(null);
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
  };

  return (
    <AuthContext.Provider value={{
      session, user, employer, employerAccess, loading,
      signIn, signUp, signOut, refreshProfile
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
