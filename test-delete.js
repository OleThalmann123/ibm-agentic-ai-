const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'demo@asklepios.demo',
    password: 'password123'
  });

  if (authError) {
    console.error('Login error:', authError);
    return;
  }

  const { data: ea } = await supabase.from('employer_access').select('*').eq('user_id', user.user.id).single();
  console.log('Current EA:', ea);

  if (ea) {
    console.log('Trying to delete employer access...');
    const { error: accessError, data: accessData } = await supabase.from('employer_access').delete().eq('id', ea.id).select();
    console.log('Delete Employer Access:', accessData, accessError);

    console.log('Trying to delete employer...');
    const { error: empError, data: empData } = await supabase.from('employer').delete().eq('id', ea.employer_id).select();
    console.log('Delete Employer:', empData, empError);
  }
}

testDelete();
