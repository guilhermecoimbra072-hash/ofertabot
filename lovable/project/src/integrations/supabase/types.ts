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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          details: Json
          entity_id: string | null
          event: string
          id: string
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          event: string
          id?: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          event?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          brand: Json
          created_at: string
          group_limit: number
          id: string
          name: string
          plan: string
          settings: Json
          timezone: string
        }
        Insert: {
          brand?: Json
          created_at?: string
          group_limit?: number
          id?: string
          name: string
          plan?: string
          settings?: Json
          timezone?: string
        }
        Update: {
          brand?: Json
          created_at?: string
          group_limit?: number
          id?: string
          name?: string
          plan?: string
          settings?: Json
          timezone?: string
        }
        Relationships: []
      }
      connections: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instance_id: string | null
          instance_until: string | null
          label: string
          last_seen_at: string | null
          next_send_at: string | null
          qr: string | null
          qr_expires_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_until?: string | null
          label: string
          last_seen_at?: string | null
          next_send_at?: string | null
          qr?: string | null
          qr_expires_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_until?: string | null
          label?: string
          last_seen_at?: string | null
          next_send_at?: string | null
          qr?: string | null
          qr_expires_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          company_id: string
          connection_id: string
          id: string
          is_destination: boolean
          is_source: boolean
          jid: string
          name: string
        }
        Insert: {
          company_id: string
          connection_id: string
          id?: string
          is_destination?: boolean
          is_source?: boolean
          jid: string
          name: string
        }
        Update: {
          company_id?: string
          connection_id?: string
          id?: string
          is_destination?: boolean
          is_source?: boolean
          jid?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_company_id_connection_id_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      members: {
        Row: {
          company_id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          role: string
          user_id: string
        }
        Update: {
          company_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_revisions: {
        Row: {
          actor_id: string | null
          company_id: string
          content: Json
          created_at: string
          id: string
          offer_id: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          content: Json
          created_at?: string
          id?: string
          offer_id: string
          version: number
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          content?: Json
          created_at?: string
          id?: string
          offer_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_revisions_company_id_offer_id_fkey"
            columns: ["company_id", "offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      offers: {
        Row: {
          company_id: string
          connection_id: string
          currency: string
          edited_image: string | null
          edited_text: string
          group_id: string
          id: string
          media_kind: string
          media_status: string
          message_id: string
          original_images: Json
          original_text: string
          price_minor: number | null
          received_at: string
          status: string
          version: number
        }
        Insert: {
          company_id: string
          connection_id: string
          currency?: string
          edited_image?: string | null
          edited_text?: string
          group_id: string
          id?: string
          media_kind?: string
          media_status?: string
          message_id: string
          original_images?: Json
          original_text?: string
          price_minor?: number | null
          received_at: string
          status?: string
          version?: number
        }
        Update: {
          company_id?: string
          connection_id?: string
          currency?: string
          edited_image?: string | null
          edited_text?: string
          group_id?: string
          id?: string
          media_kind?: string
          media_status?: string
          message_id?: string
          original_images?: Json
          original_text?: string
          price_minor?: number | null
          received_at?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_company_id_connection_id_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "offers_company_id_group_id_fkey"
            columns: ["company_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      publications: {
        Row: {
          attempts: number
          company_id: string
          connection_id: string
          created_at: string
          error_code: string | null
          group_id: string
          id: string
          idempotency_key: string
          image: string | null
          lease_token: string | null
          lease_until: string | null
          offer_id: string
          offer_version: number
          on_hold: boolean
          scheduled_at: string
          send_started_at: string | null
          sent_at: string | null
          status: string
          text: string
          timezone: string
          transport_id: string | null
        }
        Insert: {
          attempts?: number
          company_id: string
          connection_id: string
          created_at?: string
          error_code?: string | null
          group_id: string
          id?: string
          idempotency_key: string
          image?: string | null
          lease_token?: string | null
          lease_until?: string | null
          offer_id: string
          offer_version: number
          on_hold?: boolean
          scheduled_at?: string
          send_started_at?: string | null
          sent_at?: string | null
          status?: string
          text: string
          timezone: string
          transport_id?: string | null
        }
        Update: {
          attempts?: number
          company_id?: string
          connection_id?: string
          created_at?: string
          error_code?: string | null
          group_id?: string
          id?: string
          idempotency_key?: string
          image?: string | null
          lease_token?: string | null
          lease_until?: string | null
          offer_id?: string
          offer_version?: number
          on_hold?: boolean
          scheduled_at?: string
          send_started_at?: string | null
          sent_at?: string | null
          status?: string
          text?: string
          timezone?: string
          transport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publications_company_id_connection_id_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "publications_company_id_group_id_fkey"
            columns: ["company_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "publications_company_id_offer_id_fkey"
            columns: ["company_id", "offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          company_id: string
          id: string
          name: string
        }
        Insert: {
          body: string
          company_id: string
          id?: string
          name: string
        }
        Update: {
          body?: string
          company_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_plan: {
        Args: { p_company: string; p_limit?: number; p_plan: string }
        Returns: undefined
      }
      ai_authorize: {
        Args: { p_company: string; p_offer: string }
        Returns: Json
      }
      app_action: { Args: { p_action: string; p_payload: Json }; Returns: Json }
      app_snapshot: { Args: { p_company?: string }; Returns: Json }
      engine_call: {
        Args: { p_action: string; p_payload?: Json; p_token: string }
        Returns: Json
      }
      engine_context: { Args: { p_token: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

