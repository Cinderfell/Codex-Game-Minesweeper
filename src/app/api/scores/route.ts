import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRESETS, type Difficulty } from "@/lib/game";

export async function GET(request: Request) {
  const difficulty = new URL(request.url).searchParams.get("difficulty") as Difficulty;
  if (!Object.hasOwn(PRESETS, difficulty)) return NextResponse.json({ error: "难度无效。" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("scores")
    .select("id, user_id, difficulty, elapsed_seconds, created_at, profiles(username)")
    .eq("difficulty", difficulty).order("elapsed_seconds", { ascending: true }).order("created_at", { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: "排行榜暂时不可用。" }, { status: 503 });
  return NextResponse.json({ scores: data });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录再提交成绩。" }, { status: 401 });
    const { difficulty, elapsed_seconds } = await request.json();
    if (!Object.hasOwn(PRESETS, difficulty) || !Number.isInteger(elapsed_seconds) || elapsed_seconds < 1 || elapsed_seconds > 86400) {
      return NextResponse.json({ error: "成绩数据无效。" }, { status: 400 });
    }
    const { error } = await supabase.from("scores").insert({ user_id: user.id, difficulty, elapsed_seconds });
    if (error) return NextResponse.json({ error: "成绩提交失败。" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }
}
