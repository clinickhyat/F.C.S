import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Clinic {
  id: string;
  owner_id: string;
  name: string;
  // ❌ تم إزالة: bot_token, reception_pin, cashier_pin (غير مستخدمة)
  logo_url?: string | null;
  departments?: any;
  voice_mode?: string;
  created_at: string;
}

interface Subscription {
  id: string;
  clinic_id: string;
  status: string;
  trial_ends_at: string;
  is_active: boolean;
  created_at: string;
}

export type ClinicRole = "owner" | "reception" | "cashier" | null;

export function useClinic() {
  const { user } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ClinicRole>(null);

  useEffect(() => {
    if (!user) {
      setClinic(null);
      setSubscription(null);
      setRole(null);
      setError(null);
      setLoading(false);
      return;
    }

    const fetchClinicData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Owner path
        const { data: ownedClinic, error: ownedErr } = await supabase
          .from("clinics")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (ownedErr) throw ownedErr;

        let clinicData: Clinic | null = ownedClinic as any;
        let resolvedRole: ClinicRole = ownedClinic ? "owner" : null;

        // 2) Staff path
        if (!clinicData) {
          const { data: staffRow, error: staffErr } = await supabase
            .from("clinic_staff")
            .select("clinic_id, role, approved")
            .eq("user_id", user.id)
            .maybeSingle();
          if (staffErr) throw staffErr;

          if (staffRow) {
            if (!staffRow.approved) {
              setClinic(null);
              setRole(null);
              setError("حسابك بانتظار اعتماد صاحب العيادة. تواصل معه لتفعيلك.");
              setLoading(false);
              return;
            }
            const { data: staffClinic, error: scErr } = await supabase
              .from("clinics")
              .select("*")
              .eq("id", staffRow.clinic_id)
              .maybeSingle();
            if (scErr) throw scErr;
            if (!staffClinic) {
              setError("تعذر الوصول إلى عيادة صاحب العمل. تواصل مع المسؤول.");
              setLoading(false);
              return;
            }
            clinicData = staffClinic as any;
            resolvedRole = (staffRow.role as ClinicRole) ?? null;
          }
        }

        // 3) Auto-create only for brand-new owners (no clinic, no staff row)
        if (!clinicData) {
          const { data: createdClinic, error: createErr } = await supabase
            .from("clinics")
            .insert({ owner_id: user.id, name: "عيادتي" })
            .select("*")
            .single();
          if (createErr) throw createErr;
          clinicData = createdClinic as any;
          resolvedRole = "owner";

          await supabase
            .from("profiles")
            .insert({ user_id: user.id, full_name: user.user_metadata?.full_name || user.email })
            .select("id")
            .maybeSingle();

          await supabase.from("subscriptions").insert({
            clinic_id: createdClinic.id,
            status: "trial",
            trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            is_active: true,
          });
        }

        // ✅ Merge secrets from vault (owner only) — BUT we only store them in vault, not in clinic object
        // We keep the vault logic for future use, but we don't add pins to clinic object
        if (clinicData && resolvedRole === "owner") {
          try {
            const { data: vaultData } = await supabase.rpc("get_clinic_vault");
            const v: any = vaultData;
            if (v?.ok) {
              // We read from vault but we don't add to clinic object (as they are not used)
              // Just log for debugging
              console.log("Vault data loaded (not used in clinic object)");
            }
          } catch (e) {
            console.warn("vault fetch failed", e);
          }
        }

        // ❌ Remove pins from clinicData before setting state (even if they come from DB)
        if (clinicData) {
          const { reception_pin, cashier_pin, bot_token, ...cleanClinic } = clinicData as any;
          clinicData = cleanClinic as Clinic;
        }

        setClinic(clinicData);
        setRole(resolvedRole);

        // Subscription - with automatic expiry check
        if (clinicData) {
          const { data: subData, error: subError } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("clinic_id", clinicData.id)
            .maybeSingle();
          if (subError) throw subError;
          setSubscription(subData);

          // 🟢 إصلاح الاشتراك التلقائي: التحقق من انتهاء المدة
          let expired = false;
          if (subData) {
            // التحقق من تاريخ الانتهاء
            const trialEnd = new Date(subData.trial_ends_at);
            const now = new Date();
            const isPastDate = now > trialEnd;
            const isInactive = !subData.is_active;

            expired = isPastDate || isInactive || subData.status === "expired";

            // ✅ تحديث قاعدة البيانات تلقائياً إذا انتهى الاشتراك
            if (expired && subData.is_active === true) {
              await supabase
                .from("subscriptions")
                .update({ is_active: false, status: "expired" })
                .eq("id", subData.id);
              // تحديث الحالة المحلية
              subData.is_active = false;
              subData.status = "expired";
            }
          } else {
            expired = true;
          }

          setIsTrialExpired(expired);
        }
      } catch (e: any) {
        console.error("Error fetching clinic data:", e);
        setError(e?.message || "تعذر تحميل بيانات العيادة. تحقق من اتصالك ثم أعد المحاولة.");
        setClinic(null);
      } finally {
        setLoading(false);
      }
    };

    fetchClinicData();
  }, [user]);

  const updateClinic = async (updates: Partial<Clinic>) => {
    if (!clinic) return { error: new Error("No clinic found") };
    if (role !== "owner") return { error: new Error("صلاحية التعديل مقتصرة على صاحب العيادة") };

    // ❌ Prevent updating old columns (defensive)
    const { reception_pin, cashier_pin, bot_token, ...safeUpdates } = updates as any;

    const { error } = await supabase
      .from("clinics")
      .update(safeUpdates)
      .eq("id", clinic.id)
      .eq("owner_id", user?.id || "");

    if (!error) setClinic({ ...clinic, ...safeUpdates });
    return { error };
  };

  return {
    clinic,
    subscription,
    loading,
    isTrialExpired,
    error,
    role,
    updateClinic,
  };
}
