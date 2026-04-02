const fs = require('fs');
const paths = [
  'apps/prototyp-1-v1/src/components/auth/LoginPage.tsx',
  'apps/prototyp-1-v2/src/components/auth/LoginPage.tsx'
];

paths.forEach(p => {
  let content = fs.readFileSync(p, 'utf8');
  const target = `    // 1. Versuch: Direkter Login
    const { error: loginError } = await signIn(demoEmail, demoPassword);
    
    if (loginError) {
      // 2. Versuch: Automatisch registrieren, falls Konto nicht existiert (z.B. nach Datenbank-Reset)
      const { error: signUpError } = await signUp(demoEmail, demoPassword, 'Demo Arbeitgeber');
      
      if (!signUpError) {
        // Nach Registrierung direkt einloggen
        const { error: secondLoginError } = await signIn(demoEmail, demoPassword);
        
        if (secondLoginError) {
          setLoading(false);
          toast.error('Demo-Account wurde erstellt, aber Auto-Login schlug fehl: ' + secondLoginError.message);
        } else {
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
        }
      } else {
        setLoading(false);
        toast.error('Konnte Demo-Account nicht automatisch erstellen: ' + signUpError.message);
      }
    } else {
      setLoading(false);
      toast.success('Willkommen im Demo-Modus!');
      navigate('/assistants');
    }`;

  const replacement = `    // 1. Versuch: Direkter Login
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
    }`;

  if (content.includes('// 1. Versuch: Direkter Login')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(p, content);
  } else {
    console.log('Target not found in ' + p);
  }
});
