const { createClient } = require('@supabase/supabase-js');


const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testReset() {
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'demo@asklepios.demo',
    password: 'Password123!'
  });

  if (authError) {
    console.error('Login error:', authError);
    return;
  }

  // 0. Setup demo data again to match
  const { data: emp } = await supabase.from('employer').insert({
    name: 'Demo Arbeitgeber',
    canton: 'ZH',
    iv_rate: 35.3,
    contact_data: { first_name: 'Max', last_name: 'Muster', street: 'Musterstrasse 1', city: 'Zürich', plz: '8000' }
  }).select('*').single();

  const employerAccess = await supabase.from('employer_access').insert({
    employer_id: emp.id,
    user_id: user.user.id,
    role: 'admin_full',
    invited_email: 'demo@asklepios.demo'
  }).select('*').single();

  const assistant = await supabase.from('assistant').insert({
    employer_id: emp.id,
    name: 'Anna Schmidt (Demo)'
  }).select('*').single();

  console.log('Created fresh Demo state. Employer:', emp.id);

  // NOW we reset!
  console.log('Resetting...');
  const { data: assistants } = await supabase.from('assistant').select('id').eq('employer_id', emp.id);
  const assistantIds = (assistants || []).map(a => a.id);
  console.log('To delete assistants:', assistantIds);

  let es = [];
  if (assistantIds.length > 0) {
    const r1 = await supabase.from('time_entry').delete().in('assistant_id', assistantIds).select();
    const r2 = await supabase.from('payroll').delete().in('assistant_id', assistantIds).select();
    const r3 = await supabase.from('weekly_schedule').delete().in('assistant_id', assistantIds).select();
    es.push(r1.error, r2.error, r3.error);
  }

  const { error: asstError } = await supabase.from('assistant').delete().eq('employer_id', emp.id).select();
  console.log('Assistant delete err:', asstError);

  const { error: accessError } = await supabase.from('employer_access').delete().eq('id', employerAccess.data.id).select();
  console.log('Access delete err:', accessError);

  const { error: empError } = await supabase.from('employer').delete().eq('id', emp.id).select();
  console.log('Employer delete err:', empError);
  
  console.log('Sub Errors:', es);
}

testReset();
