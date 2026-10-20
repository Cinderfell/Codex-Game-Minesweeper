import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase.from("group_members")
    .select("group_id, groups(id, name, invite_code, owner_id)").eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "群组列表暂时不可用。" }, { status: 503 });
  return NextResponse.json({ groups: (data ?? []).map((row: any) => row.groups).filter(Boolean) });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const { name } = await request.json();
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 24) {
      return NextResponse.json({ error: "群组名称需为 2–24 个字符。" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("create_game_group", { group_name: name.trim() });
    if (error) return NextResponse.json({ error: "创建群组失败，请重试。" }, { status: 400 });
    return NextResponse.json({ group: data });
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }
}
