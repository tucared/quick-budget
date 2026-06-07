export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      budget_allocations: {
        Row: {
          allocated_amount: number
          budget_month: string
          category_id: string
          created_at: string
          currency: string
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          allocated_amount: number
          budget_month: string
          category_id: string
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          budget_month?: string
          category_id?: string
          created_at?: string
          currency?: string
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          cap_amount: number | null
          created_at: string
          exclude_from_budget_total: boolean
          household_id: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          cap_amount?: number | null
          created_at?: string
          exclude_from_budget_total?: boolean
          household_id: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          cap_amount?: number | null
          created_at?: string
          exclude_from_budget_total?: boolean
          household_id?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency: string
          rate_date: string
          rate_to_eur: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          rate_date: string
          rate_to_eur: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          rate_date?: string
          rate_to_eur?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          converted_amount: number
          converted_currency: string
          created_at: string
          currency: string
          description: string | null
          exchange_rate: number
          expense_date: string
          household_id: string
          id: string
          is_cash: boolean
          logged_by_user_id: string
          split_group_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          converted_amount: number
          converted_currency?: string
          created_at?: string
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_date?: string
          household_id: string
          id?: string
          is_cash?: boolean
          logged_by_user_id: string
          split_group_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          converted_amount?: number
          converted_currency?: string
          created_at?: string
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_date?: string
          household_id?: string
          id?: string
          is_cash?: boolean
          logged_by_user_id?: string
          split_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_logged_by_user_id_fkey"
            columns: ["logged_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_budget_targets: {
        Row: {
          budget_month: string
          created_at: string
          currency: string
          household_id: string
          id: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          budget_month: string
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          target_amount: number
          updated_at?: string
        }
        Update: {
          budget_month?: string
          created_at?: string
          currency?: string
          household_id?: string
          id?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_budget_targets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      tricount_entry_map: {
        Row: {
          content_hash: string
          created_at: string
          expense_id: string
          household_id: string
          id: string
          link_id: string
          tricount_entry_id: number
          updated_at: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          expense_id: string
          household_id: string
          id?: string
          link_id: string
          tricount_entry_id: number
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          expense_id?: string
          household_id?: string
          id?: string
          link_id?: string
          tricount_entry_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tricount_entry_map_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tricount_entry_map_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tricount_entry_map_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "tricount_links"
            referencedColumns: ["id"]
          },
        ]
      }
      tricount_links: {
        Row: {
          created_at: string
          default_category_id: string | null
          household_id: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          member_map: Json
          members: Json
          public_identifier_token: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          household_id: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          member_map?: Json
          members?: Json
          public_identifier_token: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          household_id?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          member_map?: Json
          members?: Json
          public_identifier_token?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tricount_links_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tricount_links_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          household_id: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      budget_summary: {
        Row: {
          allocated_amount: number | null
          budget_month: string | null
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          currency: string | null
          exclude_from_budget_total: boolean | null
          household_id: string | null
          id: string | null
          percent_spent: number | null
          remaining_amount: number | null
          spent_amount: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_from_unallocated: {
        Args: {
          p_amount: number
          p_budget_month: string
          p_category_id: string
          p_household_id: string
        }
        Returns: undefined
      }
      get_expenses_and_categories: {
        Args: { p_limit?: number; p_mode: string; p_month?: string }
        Returns: Json
      }
      rebalance_budget: {
        Args: {
          p_amount: number
          p_budget_month: string
          p_dest_category_id: string
          p_household_id: string
          p_source_category_id: string
        }
        Returns: undefined
      }
      save_budget: {
        Args: {
          p_allocations: Json
          p_budget_month: string
          p_clear_target?: boolean
          p_household_id: string
          p_target_amount?: number
        }
        Returns: undefined
      }
      top_up_budget: {
        Args: {
          p_amount: number
          p_budget_month: string
          p_category_id: string
          p_household_id: string
        }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

