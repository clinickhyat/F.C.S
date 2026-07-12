import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Footer } from "@/components/layout/Footer";
import { ArrowRight, MessageSquare, Loader2, ArrowDownToLine, ArrowUpFromLine, AlertCircle, Search, Filter } from "lucide-react";

interface Conv {
  id: string;
  direction: string;
  message_type: string;
  message_text: string | null;
  transcript: string | null;
  ai_response: string | null;
  status: string;
  error_message: string | null;
  telegram_user_id: string;
  created_at: string;
}

export default function ConversationLogsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading } = useClinic();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!clinic) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bot_conversations")
        .select("*")
        .eq("clinic_id", clinic.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setConvs((data || []) as Conv[]);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel("bot-conv-logs")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_conversations", filter: `clinic_id=eq.${clinic.id}` },
        load
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clinic]);

  const getEventType = (c: Conv) => {
    const text = `${c.message_text || ""} ${c.transcript || ""} ${c.ai_response || ""} ${c.message_type || ""}`.toLowerCase();
    if (c.status !== "ok" || c.error_message) return "error";
    if (text.includes("إلغاء") || text.includes("الغاء") || text.includes("cancel")) return "cancel";
    if (text.includes("حجز") || /re-\d{4}/i.test(text) || text.includes("book")) return "booking";
    if (c.direction === "outgoing" || text.includes("notification") || text.includes("تنبيه") || text.includes("إشعار")) return "notification";
    return "other";
  };

  const filteredConvs = convs.filter((c) => {
    const haystack = `${c.telegram_user_id} ${c.message_type} ${c.status} ${c.message_text || ""} ${c.transcript || ""} ${c.ai_response || ""} ${c.error_message || ""}`.toLowerCase();
    const matchesSearch = !searchQuery.trim() || haystack.includes(searchQuery.trim().toLowerCase());
    const matchesEvent = eventFilter === "all" || getEventType(c) === eventFilter;
    return matchesSearch && matchesEvent;
  });

  const eventLabel: Record<string, string> = {
    notification: "إشعار",
    error: "خطأ",
    booking: "حجز",
    cancel: "إلغاء",
    other: "عام",
  };

  if (authLoading || clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col" dir="rtl">
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">سجل المحادثات</h1>
              <p className="text-xs text-muted-foreground">{filteredConvs.length} من {convs.length} رسالة</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl">
        <div className="card-modern p-4 mb-4 grid grid-cols-1 sm:grid-cols-[1fr_190px] gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالرسالة أو كود RE أو Telegram ID..."
              className="input-modern pr-10"
            />
          </div>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-full">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <SelectValue placeholder="نوع الحدث" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">كل الأحداث</SelectItem>
              <SelectItem value="notification">إشعار</SelectItem>
              <SelectItem value="error">خطأ</SelectItem>
              <SelectItem value="booking">حجز</SelectItem>
              <SelectItem value="cancel">إلغاء</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredConvs.length === 0 ? (
          <div className="card-modern p-10 text-center text-muted-foreground">
            لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredConvs.map((c) => {
              const isIn = c.direction === "incoming";
              const text = c.message_text || c.transcript || c.ai_response || "—";
              const hasError = c.status !== "ok" || !!c.error_message;
              const type = getEventType(c);
              return (
                <li key={c.id} className={`card-modern p-3 border-l-4 ${
                  hasError ? "border-l-rose-500" : isIn ? "border-l-blue-500" : "border-l-emerald-500"
                }`}>
                  <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                    {isIn ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                    <span className="font-mono">{c.telegram_user_id}</span>
                    <span>·</span>
                    <span>{c.message_type}</span>
                    <span>·</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{eventLabel[type]}</span>
                    <span>·</span>
                    <span className={hasError ? "text-rose-600" : ""}>{c.status}</span>
                    <span className="mr-auto">{new Date(c.created_at).toLocaleString("ar")}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{text}</div>
                  {hasError && c.error_message && (
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-rose-600">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{c.error_message}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
