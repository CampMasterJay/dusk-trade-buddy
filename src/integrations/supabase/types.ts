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
      chart_analyses: {
        Row: {
          bias_direction: string | null
          chart_url: string | null
          created_at: string
          feedback_note: string | null
          feedback_rating: string | null
          id: string
          instrument: string | null
          linked_trade_id: string | null
          raw_analysis: Json | null
          rr_ratio: number | null
          setup_detected: string | null
          setup_quality: number | null
          suggested_entry: number | null
          suggested_stop: number | null
          suggested_target: number | null
          summary: string | null
          timeframe: string | null
          trend: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bias_direction?: string | null
          chart_url?: string | null
          created_at?: string
          feedback_note?: string | null
          feedback_rating?: string | null
          id?: string
          instrument?: string | null
          linked_trade_id?: string | null
          raw_analysis?: Json | null
          rr_ratio?: number | null
          setup_detected?: string | null
          setup_quality?: number | null
          suggested_entry?: number | null
          suggested_stop?: number | null
          suggested_target?: number | null
          summary?: string | null
          timeframe?: string | null
          trend?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bias_direction?: string | null
          chart_url?: string | null
          created_at?: string
          feedback_note?: string | null
          feedback_rating?: string | null
          id?: string
          instrument?: string | null
          linked_trade_id?: string | null
          raw_analysis?: Json | null
          rr_ratio?: number | null
          setup_detected?: string | null
          setup_quality?: number | null
          suggested_entry?: number | null
          suggested_stop?: number | null
          suggested_target?: number | null
          summary?: string | null
          timeframe?: string | null
          trend?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_game_plans: {
        Row: {
          bias: string
          created_at: string
          discipline_score: number | null
          id: string
          key_levels: number[]
          max_loss: number | null
          max_trades: number
          notes: string | null
          plan_date: string
          planned_setups: string[]
          reviewed_at: string | null
          stayed_within_loss: boolean | null
          stuck_to_max_trades: boolean | null
          traded_planned_setups: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bias?: string
          created_at?: string
          discipline_score?: number | null
          id?: string
          key_levels?: number[]
          max_loss?: number | null
          max_trades?: number
          notes?: string | null
          plan_date: string
          planned_setups?: string[]
          reviewed_at?: string | null
          stayed_within_loss?: boolean | null
          stuck_to_max_trades?: boolean | null
          traded_planned_setups?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bias?: string
          created_at?: string
          discipline_score?: number | null
          id?: string
          key_levels?: number[]
          max_loss?: number | null
          max_trades?: number
          notes?: string | null
          plan_date?: string
          planned_setups?: string[]
          reviewed_at?: string | null
          stayed_within_loss?: boolean | null
          stuck_to_max_trades?: boolean | null
          traded_planned_setups?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_logs: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          meta: Json | null
          metric: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: string
          meta?: Json | null
          metric: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          meta?: Json | null
          metric?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      trade_journals: {
        Row: {
          created_at: string
          emotion: string | null
          execution_quality: number | null
          id: string
          post_reflection: string | null
          pre_thoughts: string | null
          trade_id: string
          updated_at: string
          user_id: string
          would_repeat: boolean | null
        }
        Insert: {
          created_at?: string
          emotion?: string | null
          execution_quality?: number | null
          id?: string
          post_reflection?: string | null
          pre_thoughts?: string | null
          trade_id: string
          updated_at?: string
          user_id: string
          would_repeat?: boolean | null
        }
        Update: {
          created_at?: string
          emotion?: string | null
          execution_quality?: number | null
          id?: string
          post_reflection?: string | null
          pre_thoughts?: string | null
          trade_id?: string
          updated_at?: string
          user_id?: string
          would_repeat?: boolean | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          chart_url: string | null
          checklist_score: number | null
          checklist_verdict: string | null
          created_at: string
          date: string
          deleted_at: string | null
          direction: string
          entry: number
          id: string
          instrument: string
          news_id: string | null
          notes: string | null
          pnl: number | null
          r_multiple: number | null
          range_size: number | null
          result: string
          setup_tag: string | null
          stop: number
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chart_url?: string | null
          checklist_score?: number | null
          checklist_verdict?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          direction: string
          entry: number
          id?: string
          instrument: string
          news_id?: string | null
          notes?: string | null
          pnl?: number | null
          r_multiple?: number | null
          range_size?: number | null
          result: string
          setup_tag?: string | null
          stop: number
          target: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chart_url?: string | null
          checklist_score?: number | null
          checklist_verdict?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          direction?: string
          entry?: number
          id?: string
          instrument?: string
          news_id?: string | null
          notes?: string | null
          pnl?: number | null
          r_multiple?: number | null
          range_size?: number | null
          result?: string
          setup_tag?: string | null
          stop?: number
          target?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          challenge_target: number
          created_at: string
          current_balance: number
          instrument: string | null
          onboarding_completed: boolean
          risk_pct: number
          rr_ratio: number
          session: string | null
          starting_balance: number
          tick_value: number | null
          timeframe_days: number
          updated_at: string
          user_id: string
          watchlist: string[]
        }
        Insert: {
          challenge_target?: number
          created_at?: string
          current_balance?: number
          instrument?: string | null
          onboarding_completed?: boolean
          risk_pct?: number
          rr_ratio?: number
          session?: string | null
          starting_balance?: number
          tick_value?: number | null
          timeframe_days?: number
          updated_at?: string
          user_id: string
          watchlist?: string[]
        }
        Update: {
          challenge_target?: number
          created_at?: string
          current_balance?: number
          instrument?: string | null
          onboarding_completed?: boolean
          risk_pct?: number
          rr_ratio?: number
          session?: string | null
          starting_balance?: number
          tick_value?: number | null
          timeframe_days?: number
          updated_at?: string
          user_id?: string
          watchlist?: string[]
        }
        Relationships: []
      }
      watch_setups: {
        Row: {
          avg_range: number | null
          buffer_ticks: number
          created_at: string
          direction_pref: string
          id: string
          instrument: string
          linked_trade_id: string | null
          long_entry: number | null
          long_stop: number | null
          long_target: number | null
          notes: string | null
          quality_score: number | null
          range_high: number
          range_low: number
          range_size: number
          rr_ratio: number
          short_entry: number | null
          short_stop: number | null
          short_target: number | null
          status: string
          tick_size: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_range?: number | null
          buffer_ticks?: number
          created_at?: string
          direction_pref?: string
          id?: string
          instrument: string
          linked_trade_id?: string | null
          long_entry?: number | null
          long_stop?: number | null
          long_target?: number | null
          notes?: string | null
          quality_score?: number | null
          range_high: number
          range_low: number
          range_size: number
          rr_ratio?: number
          short_entry?: number | null
          short_stop?: number | null
          short_target?: number | null
          status?: string
          tick_size?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_range?: number | null
          buffer_ticks?: number
          created_at?: string
          direction_pref?: string
          id?: string
          instrument?: string
          linked_trade_id?: string | null
          long_entry?: number | null
          long_stop?: number | null
          long_target?: number | null
          notes?: string | null
          quality_score?: number | null
          range_high?: number
          range_low?: number
          range_size?: number
          rr_ratio?: number
          short_entry?: number | null
          short_stop?: number | null
          short_target?: number | null
          status?: string
          tick_size?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      trades_with_stats: {
        Row: {
          avg_pnl: number | null
          avg_r: number | null
          breakevens: number | null
          last_trade_at: string | null
          losses: number | null
          total_pnl: number | null
          total_r: number | null
          total_trades: number | null
          user_id: string | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
