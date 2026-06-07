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
      behavioral_snapshots: {
        Row: {
          best_day_of_week: number | null
          best_hour_of_day: number | null
          created_at: string
          id: string
          snapshot_date: string
          updated_at: string
          user_id: string
          win_rate_after_2_consec_losses: number | null
          win_rate_after_2_consec_wins: number | null
          win_rate_trade_1_of_day: number | null
          win_rate_trade_2_of_day: number | null
          win_rate_trade_3_of_day: number | null
          worst_day_of_week: number | null
          worst_hour_of_day: number | null
        }
        Insert: {
          best_day_of_week?: number | null
          best_hour_of_day?: number | null
          created_at?: string
          id?: string
          snapshot_date?: string
          updated_at?: string
          user_id: string
          win_rate_after_2_consec_losses?: number | null
          win_rate_after_2_consec_wins?: number | null
          win_rate_trade_1_of_day?: number | null
          win_rate_trade_2_of_day?: number | null
          win_rate_trade_3_of_day?: number | null
          worst_day_of_week?: number | null
          worst_hour_of_day?: number | null
        }
        Update: {
          best_day_of_week?: number | null
          best_hour_of_day?: number | null
          created_at?: string
          id?: string
          snapshot_date?: string
          updated_at?: string
          user_id?: string
          win_rate_after_2_consec_losses?: number | null
          win_rate_after_2_consec_wins?: number | null
          win_rate_trade_1_of_day?: number | null
          win_rate_trade_2_of_day?: number | null
          win_rate_trade_3_of_day?: number | null
          worst_day_of_week?: number | null
          worst_hour_of_day?: number | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string
          ended_at: string
          final_balance: number
          id: string
          outcome: string
          started_at: string
          starting_balance: number
          target_balance: number
          total_trades: number
          user_id: string
          win_rate: number
        }
        Insert: {
          created_at?: string
          ended_at?: string
          final_balance: number
          id?: string
          outcome: string
          started_at: string
          starting_balance: number
          target_balance: number
          total_trades?: number
          user_id: string
          win_rate?: number
        }
        Update: {
          created_at?: string
          ended_at?: string
          final_balance?: number
          id?: string
          outcome?: string
          started_at?: string
          starting_balance?: number
          target_balance?: number
          total_trades?: number
          user_id?: string
          win_rate?: number
        }
        Relationships: []
      }
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
          market_regime: string | null
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
          vix: number | null
        }
        Insert: {
          bias?: string
          created_at?: string
          discipline_score?: number | null
          id?: string
          key_levels?: number[]
          market_regime?: string | null
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
          vix?: number | null
        }
        Update: {
          bias?: string
          created_at?: string
          discipline_score?: number | null
          id?: string
          key_levels?: number[]
          market_regime?: string | null
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
          vix?: number | null
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
      playbook_entries: {
        Row: {
          avg_r: number | null
          baseline_avg_r: number | null
          baseline_trade_count: number | null
          baseline_win_rate: number | null
          created_at: string
          filters: Json
          id: string
          name: string
          net_pnl: number | null
          notes: string | null
          status: string
          trade_count: number
          updated_at: string
          user_id: string
          win_rate: number | null
        }
        Insert: {
          avg_r?: number | null
          baseline_avg_r?: number | null
          baseline_trade_count?: number | null
          baseline_win_rate?: number | null
          created_at?: string
          filters?: Json
          id?: string
          name: string
          net_pnl?: number | null
          notes?: string | null
          status?: string
          trade_count?: number
          updated_at?: string
          user_id: string
          win_rate?: number | null
        }
        Update: {
          avg_r?: number | null
          baseline_avg_r?: number | null
          baseline_trade_count?: number | null
          baseline_win_rate?: number | null
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          net_pnl?: number | null
          notes?: string | null
          status?: string
          trade_count?: number
          updated_at?: string
          user_id?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          active: boolean
          created_at: string
          direction: string
          id: string
          instrument: string
          note: string | null
          price: number
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          direction: string
          id?: string
          instrument: string
          note?: string | null
          price: number
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          direction?: string
          id?: string
          instrument?: string
          note?: string | null
          price?: number
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prop_firm_accounts: {
        Row: {
          challenge_start_date: string
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          notes: string | null
          peak_balance: number
          prop_firm_id: string
          starting_balance: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_start_date?: string
          created_at?: string
          current_balance: number
          id?: string
          is_active?: boolean
          notes?: string | null
          peak_balance: number
          prop_firm_id: string
          starting_balance: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_start_date?: string
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          peak_balance?: number
          prop_firm_id?: string
          starting_balance?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prop_firm_accounts_prop_firm_id_fkey"
            columns: ["prop_firm_id"]
            isOneToOne: false
            referencedRelation: "prop_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      prop_firms: {
        Row: {
          account_size: number
          created_at: string
          drawdown_type: string
          firm_name: string
          id: string
          is_active: boolean
          max_daily_loss_amount: number | null
          max_daily_loss_pct: number | null
          max_drawdown_amount: number | null
          max_drawdown_pct: number | null
          monthly_fee: number | null
          notes: string | null
          payout_frequency: string | null
          payout_split_pct: number | null
          profit_target_amount: number | null
          profit_target_pct: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          account_size: number
          created_at?: string
          drawdown_type?: string
          firm_name: string
          id?: string
          is_active?: boolean
          max_daily_loss_amount?: number | null
          max_daily_loss_pct?: number | null
          max_drawdown_amount?: number | null
          max_drawdown_pct?: number | null
          monthly_fee?: number | null
          notes?: string | null
          payout_frequency?: string | null
          payout_split_pct?: number | null
          profit_target_amount?: number | null
          profit_target_pct?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          account_size?: number
          created_at?: string
          drawdown_type?: string
          firm_name?: string
          id?: string
          is_active?: boolean
          max_daily_loss_amount?: number | null
          max_daily_loss_pct?: number | null
          max_drawdown_amount?: number | null
          max_drawdown_pct?: number | null
          monthly_fee?: number | null
          notes?: string | null
          payout_frequency?: string | null
          payout_split_pct?: number | null
          profit_target_amount?: number | null
          profit_target_pct?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      scaling_tiers: {
        Row: {
          created_at: string
          extra_rules: string[]
          focus: string | null
          id: string
          instruments: string[]
          max_balance: number | null
          max_risk_pct: number
          max_trades_per_day: number
          min_balance: number
          name: string
          target_rr: number
          tier_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_rules?: string[]
          focus?: string | null
          id?: string
          instruments?: string[]
          max_balance?: number | null
          max_risk_pct?: number
          max_trades_per_day?: number
          min_balance: number
          name: string
          target_rr?: number
          tier_number: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_rules?: string[]
          focus?: string | null
          id?: string
          instruments?: string[]
          max_balance?: number | null
          max_risk_pct?: number
          max_trades_per_day?: number
          min_balance?: number
          name?: string
          target_rr?: number
          tier_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      setup_health_log: {
        Row: {
          action_taken: string
          all_time_win_rate: number
          created_at: string
          detected_at: string
          id: string
          notes: string | null
          recent_sample_size: number
          recent_win_rate: number
          setup_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_taken?: string
          all_time_win_rate: number
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          recent_sample_size?: number
          recent_win_rate: number
          setup_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_taken?: string
          all_time_win_rate?: number
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          recent_sample_size?: number
          recent_win_rate?: number
          setup_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      setup_status: {
        Row: {
          created_at: string
          id: string
          paused_at: string | null
          probation_started_at: string | null
          probation_trades_at_start: number | null
          reactivated_at: string | null
          recovery_plan: string | null
          root_causes: string[]
          setup_type: string
          snooze_until_trade_count: number | null
          state: string
          trade_count_at_change: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          paused_at?: string | null
          probation_started_at?: string | null
          probation_trades_at_start?: number | null
          reactivated_at?: string | null
          recovery_plan?: string | null
          root_causes?: string[]
          setup_type: string
          snooze_until_trade_count?: number | null
          state?: string
          trade_count_at_change?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          paused_at?: string | null
          probation_started_at?: string | null
          probation_trades_at_start?: number | null
          reactivated_at?: string | null
          recovery_plan?: string | null
          root_causes?: string[]
          setup_type?: string
          snooze_until_trade_count?: number | null
          state?: string
          trade_count_at_change?: number | null
          updated_at?: string
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
          account_drawdown_pct_at_entry: number | null
          chart_url: string | null
          checklist_score: number | null
          checklist_verdict: string | null
          consecutive_losses_before: number | null
          consecutive_wins_before: number | null
          created_at: string
          date: string
          day_of_week: number | null
          deleted_at: string | null
          direction: string
          entry: number
          hour_of_day: number | null
          id: string
          instrument: string
          market_regime: string | null
          max_adverse_excursion_points: number | null
          max_favorable_excursion_points: number | null
          news_id: string | null
          notes: string | null
          playbook_score: string | null
          pnl: number | null
          price_came_within_ticks_of_stop: number | null
          r_multiple: number | null
          range_size: number | null
          result: string
          session_trade_number: number | null
          setup_tag: string | null
          stop: number
          stop_and_reverse_points: number | null
          stop_and_reversed: boolean | null
          stop_distance_points: number | null
          stop_was_hit_before_target: boolean | null
          target: number
          time_since_market_open_minutes: number | null
          trades_since_last_loss: number | null
          trades_since_last_win: number | null
          updated_at: string
          user_id: string
          vix_at_entry: number | null
          was_revenge_trade: boolean | null
        }
        Insert: {
          account_drawdown_pct_at_entry?: number | null
          chart_url?: string | null
          checklist_score?: number | null
          checklist_verdict?: string | null
          consecutive_losses_before?: number | null
          consecutive_wins_before?: number | null
          created_at?: string
          date: string
          day_of_week?: number | null
          deleted_at?: string | null
          direction: string
          entry: number
          hour_of_day?: number | null
          id?: string
          instrument: string
          market_regime?: string | null
          max_adverse_excursion_points?: number | null
          max_favorable_excursion_points?: number | null
          news_id?: string | null
          notes?: string | null
          playbook_score?: string | null
          pnl?: number | null
          price_came_within_ticks_of_stop?: number | null
          r_multiple?: number | null
          range_size?: number | null
          result: string
          session_trade_number?: number | null
          setup_tag?: string | null
          stop: number
          stop_and_reverse_points?: number | null
          stop_and_reversed?: boolean | null
          stop_distance_points?: number | null
          stop_was_hit_before_target?: boolean | null
          target: number
          time_since_market_open_minutes?: number | null
          trades_since_last_loss?: number | null
          trades_since_last_win?: number | null
          updated_at?: string
          user_id: string
          vix_at_entry?: number | null
          was_revenge_trade?: boolean | null
        }
        Update: {
          account_drawdown_pct_at_entry?: number | null
          chart_url?: string | null
          checklist_score?: number | null
          checklist_verdict?: string | null
          consecutive_losses_before?: number | null
          consecutive_wins_before?: number | null
          created_at?: string
          date?: string
          day_of_week?: number | null
          deleted_at?: string | null
          direction?: string
          entry?: number
          hour_of_day?: number | null
          id?: string
          instrument?: string
          market_regime?: string | null
          max_adverse_excursion_points?: number | null
          max_favorable_excursion_points?: number | null
          news_id?: string | null
          notes?: string | null
          playbook_score?: string | null
          pnl?: number | null
          price_came_within_ticks_of_stop?: number | null
          r_multiple?: number | null
          range_size?: number | null
          result?: string
          session_trade_number?: number | null
          setup_tag?: string | null
          stop?: number
          stop_and_reverse_points?: number | null
          stop_and_reversed?: boolean | null
          stop_distance_points?: number | null
          stop_was_hit_before_target?: boolean | null
          target?: number
          time_since_market_open_minutes?: number | null
          trades_since_last_loss?: number | null
          trades_since_last_win?: number | null
          updated_at?: string
          user_id?: string
          vix_at_entry?: number | null
          was_revenge_trade?: boolean | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_key: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          acknowledged_tier_number: number
          baseline_vix: number
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
          vix_adjustment_enabled: boolean
          vix_tier_elevated_max: number
          vix_tier_low_max: number
          vix_tier_normal_max: number
          watchlist: string[]
        }
        Insert: {
          acknowledged_tier_number?: number
          baseline_vix?: number
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
          vix_adjustment_enabled?: boolean
          vix_tier_elevated_max?: number
          vix_tier_low_max?: number
          vix_tier_normal_max?: number
          watchlist?: string[]
        }
        Update: {
          acknowledged_tier_number?: number
          baseline_vix?: number
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
          vix_adjustment_enabled?: boolean
          vix_tier_elevated_max?: number
          vix_tier_low_max?: number
          vix_tier_normal_max?: number
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
      weekly_debriefs: {
        Row: {
          created_at: string
          id: string
          next_week_focus: string
          pattern_analysis: string
          performance_summary: string
          position_sizing_recommendation: string
          rule_violations: string
          source_stats: Json | null
          top_strength: string
          top_weakness: string
          updated_at: string
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          next_week_focus: string
          pattern_analysis: string
          performance_summary: string
          position_sizing_recommendation: string
          rule_violations: string
          source_stats?: Json | null
          top_strength: string
          top_weakness: string
          updated_at?: string
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          next_week_focus?: string
          pattern_analysis?: string
          performance_summary?: string
          position_sizing_recommendation?: string
          rule_violations?: string
          source_stats?: Json | null
          top_strength?: string
          top_weakness?: string
          updated_at?: string
          user_id?: string
          week_end?: string
          week_start?: string
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
      recalculate_all_behavioral_snapshots: { Args: never; Returns: undefined }
      recalculate_behavioral_snapshot: {
        Args: { p_user_id: string }
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
  public: {
    Enums: {},
  },
} as const
