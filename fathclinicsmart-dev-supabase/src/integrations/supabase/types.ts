export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          arrived_at: string | null
          booked_by_chat_id: string | null
          clinic_id: string
          confirmed_at: string | null
          created_at: string
          customer_telegram_id: string | null
          date: string
          department: string | null
          discount_amount: number | null
          entered_at: string | null
          id: string
          is_third_party_booking: boolean
          is_walk_in: boolean
          notes: string | null
          paid_amount: number | null
          patient_id: string
          payment_method: string | null
          payment_status: string
          payment_time: string | null
          receipt_code: string | null
          remaining_amount: number | null
          reminder_count: number
          reminder_last_sent_at: string | null
          reminder_sent: boolean
          reservation_code: string
          service_id: string | null
          status: string
          time: string
        }
        Insert: {
          arrived_at?: string | null
          booked_by_chat_id?: string | null
          clinic_id: string
          confirmed_at?: string | null
          created_at?: string
          customer_telegram_id?: string | null
          date: string
          department?: string | null
          discount_amount?: number | null
          entered_at?: string | null
          id?: string
          is_third_party_booking?: boolean
          is_walk_in?: boolean
          notes?: string | null
          paid_amount?: number | null
          patient_id: string
          payment_method?: string | null
          payment_status?: string
          payment_time?: string | null
          receipt_code?: string | null
          remaining_amount?: number | null
          reminder_count?: number
          reminder_last_sent_at?: string | null
          reminder_sent?: boolean
          reservation_code: string
          service_id?: string | null
          status?: string
          time: string
        }
        Update: {
          arrived_at?: string | null
          booked_by_chat_id?: string | null
          clinic_id?: string
          confirmed_at?: string | null
          created_at?: string
          customer_telegram_id?: string | null
          date?: string
          department?: string | null
          discount_amount?: number | null
          entered_at?: string | null
          id?: string
          is_third_party_booking?: boolean
          is_walk_in?: boolean
          notes?: string | null
          paid_amount?: number | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: string
          payment_time?: string | null
          receipt_code?: string | null
          remaining_amount?: number | null
          reminder_count?: number
          reminder_last_sent_at?: string | null
          reminder_sent?: boolean
          reservation_code?: string
          service_id?: string | null
          status?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_conversations: {
        Row: {
          ai_response: string | null
          chat_id: string
          clinic_id: string
          created_at: string
          direction: string
          error_message: string | null
          id: string
          message_text: string | null
          message_type: string
          raw_update: Json | null
          status: string
          telegram_user_id: string
          transcript: string | null
        }
        Insert: {
          ai_response?: string | null
          chat_id: string
          clinic_id: string
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          message_text?: string | null
          message_type?: string
          raw_update?: Json | null
          status?: string
          telegram_user_id: string
          transcript?: string | null
        }
        Update: {
          ai_response?: string | null
          chat_id?: string
          clinic_id?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          message_text?: string | null
          message_type?: string
          raw_update?: Json | null
          status?: string
          telegram_user_id?: string
          transcript?: string | null
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          booked_by_chat_id: string | null
          clinic_id: string | null
          full_name: string | null
          is_third_party: boolean
          phone: string | null
          phone_attempts: number
          preferred_date: string | null
          preferred_time: string | null
          service_id: string | null
          step: string
          telegram_user_id: string
          updated_at: string
        }
        Insert: {
          booked_by_chat_id?: string | null
          clinic_id?: string | null
          full_name?: string | null
          is_third_party?: boolean
          phone?: string | null
          phone_attempts?: number
          preferred_date?: string | null
          preferred_time?: string | null
          service_id?: string | null
          step?: string
          telegram_user_id: string
          updated_at?: string
        }
        Update: {
          booked_by_chat_id?: string | null
          clinic_id?: string | null
          full_name?: string | null
          is_third_party?: boolean
          phone?: string | null
          phone_attempts?: number
          preferred_date?: string | null
          preferred_time?: string | null
          service_id?: string | null
          step?: string
          telegram_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_staff: {
        Row: {
          approved: boolean
          approved_at: string | null
          clinic_id: string
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          clinic_id: string
          created_at?: string
          email: string
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          clinic_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_staff_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          bot_token: string | null
          bot_username: string | null
          cashier_pin: string
          created_at: string
          departments: Json
          description: string | null
          doctor_name: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          reception_pin: string
          receptionist_whatsapp: string | null
          support_whatsapp: string | null
          type: string | null
          voice_agent_enabled: boolean
          voice_mode: string
          voice_tone: string | null
          working_hours: Json | null
        }
        Insert: {
          bot_token?: string | null
          bot_username?: string | null
          cashier_pin?: string
          created_at?: string
          departments?: Json
          description?: string | null
          doctor_name?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id: string
          reception_pin?: string
          receptionist_whatsapp?: string | null
          support_whatsapp?: string | null
          type?: string | null
          voice_agent_enabled?: boolean
          voice_mode?: string
          voice_tone?: string | null
          working_hours?: Json | null
        }
        Update: {
          bot_token?: string | null
          bot_username?: string | null
          cashier_pin?: string
          created_at?: string
          departments?: Json
          description?: string | null
          doctor_name?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          reception_pin?: string
          receptionist_whatsapp?: string | null
          support_whatsapp?: string | null
          type?: string | null
          voice_agent_enabled?: boolean
          voice_mode?: string
          voice_tone?: string | null
          working_hours?: Json | null
        }
        Relationships: []
      }
      e2e_test_runs: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string
          details: Json
          error_message: string | null
          id: string
          scenario: string
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by: string
          details?: Json
          error_message?: string | null
          id?: string
          scenario: string
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string
          details?: Json
          error_message?: string | null
          id?: string
          scenario?: string
          status?: string
        }
        Relationships: []
      }
      emergency_events: {
        Row: {
          chat_id: string | null
          clinic_id: string
          created_at: string
          id: string
          message_text: string
          notification_id: string | null
          patient_name: string | null
          severity: string
          status: string
          telegram_user_id: string | null
        }
        Insert: {
          chat_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          message_text: string
          notification_id?: string | null
          patient_name?: string | null
          severity?: string
          status?: string
          telegram_user_id?: string | null
        }
        Update: {
          chat_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          message_text?: string
          notification_id?: string | null
          patient_name?: string | null
          severity?: string
          status?: string
          telegram_user_id?: string | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
          phone: string
          telegram_user_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          phone: string
          telegram_user_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          telegram_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          clinic_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_login_attempts: {
        Row: {
          email: string
          failed_count: number
          id: string
          last_attempt_at: string
          locked_until: string | null
        }
        Insert: {
          email: string
          failed_count?: number
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
        }
        Update: {
          email?: string
          failed_count?: number
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          status: string
          trial_ends_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          status?: string
          trial_ends_at: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          status?: string
          trial_ends_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      system_heartbeat: {
        Row: {
          id: number
          last_ping: string
          ping_count: number
        }
        Insert: {
          id?: number
          last_ping?: string
          ping_count?: number
        }
        Update: {
          id?: number
          last_ping?: string
          ping_count?: number
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          global_bot_username: string | null
          id: number
          n8n_webhook_url: string | null
          telegram_bot_token: string | null
          updated_at: string | null
        }
        Insert: {
          global_bot_username?: string | null
          id: number
          n8n_webhook_url?: string | null
          telegram_bot_token?: string | null
          updated_at?: string | null
        }
        Update: {
          global_bot_username?: string | null
          id?: number
          n8n_webhook_url?: string | null
          telegram_bot_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_notifications: {
        Row: {
          clinic_id: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          notification_type: string
          recipient_chat_id: string | null
          sent_at: string | null
          status: string
          telegram_message_id: string | null
          title: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          notification_type: string
          recipient_chat_id?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: string | null
          title: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          notification_type?: string
          recipient_chat_id?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: string | null
          title?: string
        }
        Relationships: []
      }
      telemetry_logs: {
        Row: {
          clinic_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          status: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          status?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vault: {
        Row: {
          bot_token: string | null
          cashier_pin: string | null
          clinic_id: string
          created_at: string
          id: string
          reception_pin: string | null
          updated_at: string
        }
        Insert: {
          bot_token?: string | null
          cashier_pin?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          reception_pin?: string | null
          updated_at?: string
        }
        Update: {
          bot_token?: string | null
          cashier_pin?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          reception_pin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_clinic_staff_by_email: {
        Args: { _email: string; _role: string }
        Returns: Json
      }
      approve_clinic_staff: { Args: { _staff_id: string }; Returns: Json }
      current_user_clinic_id: { Args: never; Returns: string }
      generate_reservation_code: { Args: never; Returns: string }
      get_clinic_vault: { Args: never; Returns: Json }
      get_user_clinic_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_heartbeat: { Args: never; Returns: undefined }
      is_approved_clinic_staff: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      is_clinic_owner: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      remove_clinic_staff: { Args: { _staff_id: string }; Returns: Json }
      revoke_clinic_staff: { Args: { _staff_id: string }; Returns: Json }
      save_clinic_vault: {
        Args: {
          _bot_token: string
          _cashier_pin: string
          _reception_pin: string
        }
        Returns: Json
      }
      user_has_clinic_access: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "clinic_owner"
      staff_role: "reception" | "cashier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "clinic_owner"],
      staff_role: ["reception", "cashier"],
    },
  },
} as const
