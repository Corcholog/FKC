const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  // Get one match for Corcho (player_id = 1)
  const { data: matches, error: fetchErr } = await supabase
    .from('soloq_matches')
    .select('id, match_id, champion, damage_dealt')
    .eq('player_id', 1)
    .limit(1);

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return;
  }

  if (!matches || matches.length === 0) {
    console.log('No matches found for Corcho');
    return;
  }

  const match = matches[0];
  console.log('Found match:', match);

  // Try updating the damage_dealt to a non-zero value
  const testDamage = 13313;
  const { data: updateData, error: updateErr, status } = await supabase
    .from('soloq_matches')
    .update({ damage_dealt: testDamage })
    .eq('id', match.id)
    .select();

  console.log('Update Status:', status);
  console.log('Update Error:', updateErr);
  console.log('Update Data (should show updated row if successful):', updateData);
}

run();
