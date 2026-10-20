import { NextResponse } from "next/server";
import { createSupabaseAdminClient, usernameEmail } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const cleanName = typeof username === "string" ? username.trim() : "";
    if ([...cleanName].length < 3 || [...cleanName].length > 18 || /[\p{C}\p{Z}]/u.test(cleanName)) {
      return NextResponse.json({ error: "昵称需为 3–18 个字符，不能包含空白或控制字符。" }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "密码长度需为 8–72 位。" }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: usernameEmail(cleanName),
      password,
      email_confirm: true,
      user_metadata: { username: cleanName },
    });
    if (error || !data.user) {
      const normalizedMessage = error?.message.toLowerCase() ?? "";
      const duplicate = normalizedMessage.includes("already") || normalizedMessage.includes("registered") || normalizedMessage.includes("profiles_username_lower_unique");
      return NextResponse.json({ error: duplicate ? "这个昵称已被使用。" : "注册失败，请稍后重试。" }, { status: duplicate ? 409 : 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }
}
