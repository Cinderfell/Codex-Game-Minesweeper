import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRESETS, type Difficulty } from "@/lib/game";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const difficulty = new URL(request.url).searchParams.get("difficulty") as Difficulty;
  if (!Object.hasOwn(PRESETS, difficulty)) return NextResponse.json({ error: "难度无效。" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data: members, error: memberError } = await supabase.from("group_members").select("user_id").eq("group_id", id);
  if (memberError) return NextResponse.json({ error: "无权查看该群组，或群组不存在。" }, { status: 403 });
  const ids = (members ?? []).map((member) => member.user_id);
  if (!ids.includes(user.id)) return NextResponse.json({ error: "只有群成员可以查看群组排行。" }, { status: 403 });
  const { data, error } = await supabase.from("scores")
    .select("id, user_id, difficulty, elapsed_seconds, created_at, profiles(username)")
    .eq("difficulty", difficulty).in("user_id", ids)
    .order("elapsed_seconds", { ascending: true }).order("created_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: "群组排行榜暂时不可用。" }, { status: 503 });
  return NextResponse.json({ scores: data });
}
