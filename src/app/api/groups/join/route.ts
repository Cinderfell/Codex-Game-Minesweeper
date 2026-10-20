import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const { invite_code } = await request.json();
    if (typeof invite_code !== "string") return NextResponse.json({ error: "请输入邀请码。" }, { status: 400 });
    const { data, error } = await supabase.rpc("join_game_group", { invite: invite_code.trim().toUpperCase() });
    if (error) return NextResponse.json({ error: "邀请码无效，或你已在该群组中。" }, { status: 400 });
    return NextResponse.json({ ok: true, group_id: data });
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }
}
