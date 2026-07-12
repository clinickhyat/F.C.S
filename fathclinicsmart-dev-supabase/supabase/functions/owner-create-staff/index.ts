// Owner-invoked function to create a staff account (email + password) and link it to
// the owner's clinic. Auto-approves the staff row so the staff can log in immediately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "غير مصرح" }, 401);

    // Client that acts as the caller (owner)
    const userClient = createClient(url, serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return j({ error: "غير مصرح" }, 401);

    const admin = createClient(url, serviceKey);

    // Confirm caller owns a clinic
    const { data: clinic } = await admin
      .from("clinics").select("id,name").eq("owner_id", user.id).maybeSingle();
    if (!clinic) return j({ error: "لا تملك عيادة مسجلة" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = body.role === "cashier" ? "cashier" : "reception";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return j({ error: "بريد إلكتروني غير صالح" }, 400);
    if (password.length < 6)
      return j({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, 400);

    // Find or create the auth user
    let userId: string | null = null;
    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = existingList?.users?.find((u: any) => (u.email || "").toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { account_type: "staff", full_name: email.split("@")[0] },
      });
      if (cErr || !created?.user) return j({ error: cErr?.message || "فشل إنشاء الحساب" }, 400);
      userId = created.user.id;
    }

    // Prevent duplicate staff rows
    const { data: dupe } = await admin
      .from("clinic_staff").select("id,clinic_id").eq("user_id", userId).maybeSingle();
    if (dupe) {
      if (dupe.clinic_id !== clinic.id)
        return j({ error: "هذا المستخدم مسجّل كموظف في عيادة أخرى" }, 409);
      // Ensure approved and correct role
      await admin.from("clinic_staff").update({ approved: true, role, approved_at: new Date().toISOString() }).eq("id", dupe.id);
      return j({ ok: true, reused: true });
    }

    const { error: insErr } = await admin.from("clinic_staff").insert({
      clinic_id: clinic.id,
      user_id: userId,
      email,
      role,
      approved: true,
      approved_at: new Date().toISOString(),
    });
    if (insErr) return j({ error: insErr.message }, 400);

    return j({ ok: true });
  } catch (e: any) {
    console.error("owner-create-staff error", e);
    return j({ error: e?.message || "خطأ غير متوقع" }, 500);
  }
});
