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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          ticket_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          ticket_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          ticket_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
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
      pending_admin_message_notifications: {
        Row: {
          admin_name: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          message_preview: string | null
          note_id: string
          notify_at: string
          sent_at: string | null
          ticket_id: string
          ticket_title: string
          user_email: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          admin_name?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          note_id: string
          notify_at: string
          sent_at?: string | null
          ticket_id: string
          ticket_title: string
          user_email: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          admin_name?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          note_id?: string
          notify_at?: string
          sent_at?: string | null
          ticket_id?: string
          ticket_title?: string
          user_email?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_admin_message_notifications_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "ticket_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_admin_message_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
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
      ticket_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          decision_note: string | null
          department: string
          id: string
          reason: string | null
          status: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          department: string
          id?: string
          reason?: string | null
          status?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          department?: string
          id?: string
          reason?: string | null
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_approvals_ticket_id_fkey"
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
      ticket_workflow: {
        Row: {
          created_at: string
          current_stage_id: string | null
          status: string
          template_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stage_id?: string | null
          status?: string
          template_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stage_id?: string | null
          status?: string
          template_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_workflow_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_workflow_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_workflow_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
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
          workflow_skipped: boolean
          workflow_skipped_at: string | null
          workflow_skipped_by: string | null
          workflow_skipped_reason: string | null
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
          workflow_skipped?: boolean
          workflow_skipped_at?: string | null
          workflow_skipped_by?: string | null
          workflow_skipped_reason?: string | null
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
          workflow_skipped?: boolean
          workflow_skipped_at?: string | null
          workflow_skipped_by?: string | null
          workflow_skipped_reason?: string | null
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
      workflow_approvals: {
        Row: {
          approver_user_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          decision_note: string | null
          department: string | null
          id: string
          request_note: string | null
          requested_by: string | null
          requested_by_name: string | null
          stage_id: string | null
          status: string
          ticket_id: string
        }
        Insert: {
          approver_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          department?: string | null
          id?: string
          request_note?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          stage_id?: string | null
          status?: string
          ticket_id: string
        }
        Update: {
          approver_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          department?: string | null
          id?: string
          request_note?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          stage_id?: string | null
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_approvals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approvals_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_history: {
        Row: {
          action: string
          actor_department: string | null
          actor_id: string | null
          actor_name: string | null
          comment: string | null
          created_at: string
          id: string
          stage_id: string | null
          ticket_id: string
        }
        Insert: {
          action: string
          actor_department?: string | null
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          stage_id?: string | null
          ticket_id: string
        }
        Update: {
          action?: string
          actor_department?: string | null
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          stage_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_history_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stages: {
        Row: {
          approver_department: string | null
          approver_kind: string | null
          approver_user_id: string | null
          id: string
          name: string
          position: number
          template_id: string
          type: string
        }
        Insert: {
          approver_department?: string | null
          approver_kind?: string | null
          approver_user_id?: string | null
          id?: string
          name: string
          position: number
          template_id: string
          type: string
        }
        Update: {
          approver_department?: string | null
          approver_kind?: string | null
          approver_user_id?: string | null
          id?: string
          name?: string
          position?: number
          template_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          trigger_keywords: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          trigger_keywords?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          trigger_keywords?: string[]
          updated_at?: string
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
