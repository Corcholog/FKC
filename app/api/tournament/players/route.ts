import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { team_id, ign } = await request.json();
    if (!team_id || !ign) {
      return NextResponse.json({ success: false, error: 'Team ID and IGN are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tournament_players')
      .insert([{ team_id, ign }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, player: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });

    const supabase = await createClient();
    const { error } = await supabase
      .from('tournament_players')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
