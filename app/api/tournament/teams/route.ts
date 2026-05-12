import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tournament_teams')
      .select('*, tournament_players(*)');

    if (error) throw error;
    return NextResponse.json({ success: true, teams: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tournament_teams')
      .insert([{ name }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, team: data });
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
      .from('tournament_teams')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
