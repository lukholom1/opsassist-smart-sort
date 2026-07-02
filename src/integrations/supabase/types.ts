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
      password_resets: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_code: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          otp_code: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          used_at?: string | null
        }
        Relationships: []
      }
      pending_activations: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          otp_code: string
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id?: string
          otp_code: string
          role: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          otp_code?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      ticket_activity: {
        Row: {
          actor_id: string | null
          actor_name: string
          actor_role: string
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_assignments: {
        Row: {
          assigned_to: string | null
          created_at: string
          department: string
          id: string
          resolved_at: string | null
          resolved_by_ai: boolean
          status: string
          ticket_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          department: string
          id?: string
          resolved_at?: string | null
          resolved_by_ai?: boolean
          status?: string
          ticket_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          department?: string
          id?: string
          resolved_at?: string | null
          resolved_by_ai?: boolean
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_feedback: {
        Row: {
          comment: string | null
          created_at: string
          rating: number
          resolution_source: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          rating: number
          resolution_source?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          rating?: number
          resolution_source?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_notes: {
        Row: {
          author_id: string
          author_name: string
          author_role: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_name: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_name?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          approval_required: boolean
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          categories: string[]
          category: string
          created_at: string
          details: string
          id: string
          priority: string
          resolution_source: string | null
          resolved_at: string | null
          resolved_by_ai: boolean
          sla_hours: number | null
          status: string
          title: string
          user_id: string | null
          user_name: string
          workflow_stage: string
        }
        Insert: {
          approval_required?: boolean
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          categories?: string[]
          category: string
          created_at?: string
          details: string
          id?: string
          priority: string
          resolution_source?: string | null
          resolved_at?: string | null
          resolved_by_ai?: boolean
          sla_hours?: number | null
          status?: string
          title: string
          user_id?: string | null
          user_name: string
          workflow_stage?: string
        }
        Update: {
          approval_required?: boolean
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          categories?: string[]
          category?: string
          created_at?: string
          details?: string
          id?: string
          priority?: string
          resolution_source?: string | null
          resolved_at?: string | null
          resolved_by_ai?: boolean
          sla_hours?: number | null
          status?: string
          title?: string
          user_id?: string | null
          user_name?: string
          workflow_stage?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_ticket_notes: {
        Args: { _ticket_id: string }
        Returns: boolean
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_department: { Args: { _uid: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "employee" | "it_personnel" | "manager"
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
      app_role: ["admin", "employee", "it_personnel", "manager"],
    },
  },
} as const
