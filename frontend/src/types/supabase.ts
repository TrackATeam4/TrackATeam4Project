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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      campaign_flyers: {
        Row: {
          campaign_id: string
          created_at: string
          custom_fields: Json
          generated_file_url: string | null
          id: string
          template_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          custom_fields?: Json
          generated_file_url?: string | null
          id?: string
          template_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          custom_fields?: Json
          generated_file_url?: string | null
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_flyers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_flyers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "flyer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          address: string
          created_at: string
          date: string
          description: string | null
          end_time: string
          flyer_template_id: string | null
          id: string
          location: string
          max_volunteers: number | null
          organizer_id: string
          start_time: string
          status: Database["public"]["Enums"]["campaign_status"]
          target_flyers: number
          title: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          date: string
          description?: string | null
          end_time: string
          flyer_template_id?: string | null
          id?: string
          location: string
          max_volunteers?: number | null
          organizer_id: string
          start_time: string
          status?: Database["public"]["Enums"]["campaign_status"]
          target_flyers?: number
          title: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          date?: string
          description?: string | null
          end_time?: string
          flyer_template_id?: string | null
          id?: string
          location?: string
          max_volunteers?: number | null
          organizer_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          target_flyers?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_flyer_template_id_fkey"
            columns: ["flyer_template_id"]
            isOneToOne: false
            referencedRelation: "flyer_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      flyer_templates: {
        Row: {
          created_at: string
          customizable_fields: Json
          file_url: string
          id: string
          is_active: boolean
          name: string
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string
          customizable_fields?: Json
          file_url: string
          id?: string
          is_active?: boolean
          name: string
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string
          customizable_fields?: Json
          file_url?: string
          id?: string
          is_active?: boolean
          name?: string
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      impact_reports: {
        Row: {
          campaign_id: string
          families_reached: number
          flyers_distributed: number
          id: string
          notes: string | null
          photos: string[]
          submitted_at: string
          submitted_by: string
          volunteers_attended: number
        }
        Insert: {
          campaign_id: string
          families_reached?: number
          flyers_distributed?: number
          id?: string
          notes?: string | null
          photos?: string[]
          submitted_at?: string
          submitted_by: string
          volunteers_attended?: number
        }
        Update: {
          campaign_id?: string
          families_reached?: number
          flyers_distributed?: number
          id?: string
          notes?: string | null
          photos?: string[]
          submitted_at?: string
          submitted_by?: string
          volunteers_attended?: number
        }
        Relationships: [
          {
            foreignKeyName: "impact_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signups: {
        Row: {
          campaign_id: string
          id: string
          joined_at: string
          status: Database["public"]["Enums"]["signup_status"]
          task_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          id?: string
          joined_at?: string
          status?: Database["public"]["Enums"]["signup_status"]
          task_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          id?: string
          joined_at?: string
          status?: Database["public"]["Enums"]["signup_status"]
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          campaign_id: string
          created_at: string
          description: string | null
          id: string
          max_assignees: number
          title: string
        }
        Insert: {
          assigned_to?: string | null
          campaign_id: string
          created_at?: string
          description?: string | null
          id?: string
          max_assignees?: number
          title: string
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string
          created_at?: string
          description?: string | null
          id?: string
          max_assignees?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_status: "draft" | "published" | "completed" | "cancelled"
      invitation_status: "pending" | "accepted" | "expired"
      signup_status: "pending" | "confirmed" | "cancelled"
      user_role: "volunteer" | "admin"
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
      campaign_status: ["draft", "published", "completed", "cancelled"],
      invitation_status: ["pending", "accepted", "expired"],
      signup_status: ["pending", "confirmed", "cancelled"],
      user_role: ["volunteer", "admin"],
    },
  },
} as const
