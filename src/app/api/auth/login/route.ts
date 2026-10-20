import { NextResponse } from "next/server";
import { createSupabaseServerClient, usernameEmail } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "请输入昵称和密码。" }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username.trim()), password });
    if (error) return NextResponse.json({ error: "昵称或密码不正确。" }, { status: 401 });
    const { data: { user } } = await supabase.auth.getUser();
    return NextResponse.json({ ok: true, username: user?.user_metadata.username ?? username.trim() });
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }
}
