export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      areas: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          dni: string;
          first_name: string;
          middle_name: string | null;
          paternal_surname: string;
          maternal_surname: string;
          email: string | null;
          phone: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dni: string;
          first_name: string;
          middle_name?: string | null;
          paternal_surname: string;
          maternal_surname: string;
          email?: string | null;
          phone?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dni?: string;
          first_name?: string;
          middle_name?: string | null;
          paternal_surname?: string;
          maternal_surname?: string;
          email?: string | null;
          phone?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      dni_lookup_rate_limits: {
        Row: {
          scope_type: string;
          scope_key: string;
          window_started_at: string;
          request_count: number;
          updated_at: string;
        };
        Insert: {
          scope_type: string;
          scope_key: string;
          window_started_at: string;
          request_count?: number;
          updated_at?: string;
        };
        Update: {
          scope_type?: string;
          scope_key?: string;
          window_started_at?: string;
          request_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      dni_lookup_attempts: {
        Row: {
          id: number;
          user_id: string | null;
          origin_hash: string;
          document_hash: string;
          outcome: string;
          provider_status: number | null;
          duration_ms: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          origin_hash: string;
          document_hash: string;
          outcome: string;
          provider_status?: number | null;
          duration_ms: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          origin_hash?: string;
          document_hash?: string;
          outcome?: string;
          provider_status?: number | null;
          duration_ms?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dni_lookup_attempts_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      service_channels: {
        Row: {
          id: string;
          name: string;
          detail: string;
          is_active: boolean;
          disabled_by: string | null;
          disabled_by_name: string | null;
          disabled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          detail: string;
          is_active?: boolean;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          detail?: string;
          is_active?: boolean;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_channels_disabled_by_fkey";
            columns: ["disabled_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      consultation_types: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          display_order?: number;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      consultation_topics: {
        Row: {
          id: string;
          consultation_type_id: string;
          name: string;
          display_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          consultation_type_id: string;
          name: string;
          display_order?: number;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          consultation_type_id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "consultation_topics_consultation_type_id_fkey";
            columns: ["consultation_type_id"];
            referencedRelation: "consultation_types";
            referencedColumns: ["id"];
          },
        ];
      };
      kinship_types: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          display_order?: number;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      rac_counters: {
        Row: { rac_year: number; last_value: number };
        Insert: { rac_year: number; last_value: number };
        Update: { rac_year?: number; last_value?: number };
        Relationships: [];
      };
      customer_attentions: {
        Row: {
          id: string;
          rac_year: number;
          rac_number: number;
          rac_code: string;
          client_id: string;
          service_channel_id: string;
          requester_type: string;
          kinship_type_id: string | null;
          requester_detail: string | null;
          kinship_detail: string | null;
          conclusion: string;
          status: string;
          created_by: string | null;
          created_by_name: string;
          created_by_email: string;
          created_at: string;
          updated_by: string | null;
          updated_by_name: string | null;
          updated_at: string;
          disabled_reason: string | null;
          disabled_by: string | null;
          disabled_by_name: string | null;
          disabled_at: string | null;
        };
        Insert: {
          id?: string;
          rac_year: number;
          rac_number: number;
          rac_code: string;
          client_id: string;
          service_channel_id: string;
          requester_type: string;
          kinship_type_id?: string | null;
          requester_detail?: string | null;
          kinship_detail?: string | null;
          conclusion: string;
          status?: string;
          created_by?: string | null;
          created_by_name: string;
          created_by_email: string;
          created_at?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
          updated_at?: string;
          disabled_reason?: string | null;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
        };
        Update: {
          id?: string;
          rac_year?: number;
          rac_number?: number;
          rac_code?: string;
          client_id?: string;
          service_channel_id?: string;
          requester_type?: string;
          kinship_type_id?: string | null;
          requester_detail?: string | null;
          kinship_detail?: string | null;
          conclusion?: string;
          status?: string;
          created_by?: string | null;
          created_by_name?: string;
          created_by_email?: string;
          created_at?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
          updated_at?: string;
          disabled_reason?: string | null;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_attentions_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_attentions_service_channel_id_fkey";
            columns: ["service_channel_id"];
            referencedRelation: "service_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_attentions_kinship_type_id_fkey";
            columns: ["kinship_type_id"];
            referencedRelation: "kinship_types";
            referencedColumns: ["id"];
          },
        ];
      };
      attention_topics: {
        Row: {
          attention_id: string;
          topic_id: string;
        };
        Insert: {
          attention_id: string;
          topic_id: string;
        };
        Update: {
          attention_id?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attention_topics_attention_id_fkey";
            columns: ["attention_id"];
            referencedRelation: "customer_attentions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attention_topics_topic_id_fkey";
            columns: ["topic_id"];
            referencedRelation: "consultation_topics";
            referencedColumns: ["id"];
          },
        ];
      };
      attention_referrals: {
        Row: {
          id: string;
          attention_id: string;
          destination_area_id: string | null;
          destination_area_name: string;
          referred_by: string | null;
          referred_by_name: string;
          referred_at: string;
          conclusion: string | null;
          concluded_by: string | null;
          concluded_by_name: string | null;
          concluded_at: string | null;
          source_area_id: string | null;
          source_area_name: string | null;
          status: string;
          disabled_reason: string | null;
          disabled_by: string | null;
          disabled_by_name: string | null;
          disabled_at: string | null;
          cancelled_reason: string | null;
          cancelled_by: string | null;
          cancelled_by_name: string | null;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          attention_id: string;
          destination_area_id?: string | null;
          destination_area_name: string;
          referred_by?: string | null;
          referred_by_name: string;
          referred_at?: string;
          conclusion?: string | null;
          concluded_by?: string | null;
          concluded_by_name?: string | null;
          concluded_at?: string | null;
          source_area_id?: string | null;
          source_area_name?: string | null;
          status?: string;
          disabled_reason?: string | null;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
          cancelled_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_by_name?: string | null;
          cancelled_at?: string | null;
        };
        Update: {
          id?: string;
          attention_id?: string;
          destination_area_id?: string | null;
          destination_area_name?: string;
          referred_by?: string | null;
          referred_by_name?: string;
          referred_at?: string;
          conclusion?: string | null;
          concluded_by?: string | null;
          concluded_by_name?: string | null;
          concluded_at?: string | null;
          source_area_id?: string | null;
          source_area_name?: string | null;
          status?: string;
          disabled_reason?: string | null;
          disabled_by?: string | null;
          disabled_by_name?: string | null;
          disabled_at?: string | null;
          cancelled_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_by_name?: string | null;
          cancelled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attention_referrals_attention_id_fkey";
            columns: ["attention_id"];
            referencedRelation: "customer_attentions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attention_referrals_destination_area_id_fkey";
            columns: ["destination_area_id"];
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      referral_surveys: {
        Row: {
          id: string; referral_id: string; status: string; response: string | null;
          recipient_email: string | null; survey_token: string | null;
          token_expires_at: string | null; email_outbox_id: string | null;
          sent_at: string | null; completed_at: string | null;
          closed_at: string | null; closed_reason: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; referral_id: string; status: string; response?: string | null;
          recipient_email?: string | null; survey_token?: string | null;
          token_expires_at?: string | null; email_outbox_id?: string | null;
          sent_at?: string | null; completed_at?: string | null;
          closed_at?: string | null; closed_reason?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: {
          id?: string; referral_id?: string; status?: string; response?: string | null;
          recipient_email?: string | null; survey_token?: string | null;
          token_expires_at?: string | null; email_outbox_id?: string | null;
          sent_at?: string | null; completed_at?: string | null;
          closed_at?: string | null; closed_reason?: string | null;
          created_at?: string; updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referral_surveys_referral_id_fkey";
            columns: ["referral_id"];
            referencedRelation: "attention_referrals";
            referencedColumns: ["id"];
          },
        ];
      };
      workstations: {
        Row: { id: string; name: string; is_active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      workstation_assignments: {
        Row: {
          id: string; workstation_id: string; user_id: string; assigned_by: string | null;
          assigned_by_name: string; assigned_at: string; ended_by: string | null;
          ended_by_name: string | null; ended_at: string | null;
        };
        Insert: {
          id?: string; workstation_id: string; user_id: string; assigned_by?: string | null;
          assigned_by_name: string; assigned_at?: string; ended_by?: string | null;
          ended_by_name?: string | null; ended_at?: string | null;
        };
        Update: {
          id?: string; workstation_id?: string; user_id?: string; assigned_by?: string | null;
          assigned_by_name?: string; assigned_at?: string; ended_by?: string | null;
          ended_by_name?: string | null; ended_at?: string | null;
        };
        Relationships: [];
      };
      tablet_bindings: {
        Row: {
          id: string; workstation_id: string; user_id: string; session_id: string;
          activated_at: string; last_seen_at: string; deactivated_at: string | null;
          deactivated_by: string | null; deactivated_by_name: string | null; deactivation_reason: string | null;
        };
        Insert: {
          id?: string; workstation_id: string; user_id: string; session_id: string;
          activated_at?: string; last_seen_at?: string; deactivated_at?: string | null;
          deactivated_by?: string | null; deactivated_by_name?: string | null; deactivation_reason?: string | null;
        };
        Update: {
          id?: string; workstation_id?: string; user_id?: string; session_id?: string;
          activated_at?: string; last_seen_at?: string; deactivated_at?: string | null;
          deactivated_by?: string | null; deactivated_by_name?: string | null; deactivation_reason?: string | null;
        };
        Relationships: [];
      };
      attention_surveys: {
        Row: {
          id: string; attention_id: string; workstation_id: string; purpose: string; channel: string;
          status: string; response: string | null; requested_by: string | null; requested_by_name: string;
          recipient_email: string | null; survey_token: string | null; token_expires_at: string | null;
          email_outbox_id: string | null;
          sent_binding_id: string | null; sent_at: string | null; completed_at: string | null;
          closed_by: string | null; closed_by_name: string | null; closed_at: string | null;
          closed_reason: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; attention_id: string; workstation_id: string; purpose?: string; channel?: string;
          status?: string; response?: string | null; requested_by: string; requested_by_name: string;
          recipient_email?: string | null; survey_token?: string | null; token_expires_at?: string | null;
          email_outbox_id?: string | null;
          sent_binding_id?: string | null; sent_at?: string | null; completed_at?: string | null;
          closed_by?: string | null; closed_by_name?: string | null; closed_at?: string | null;
          closed_reason?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          id?: string; attention_id?: string; workstation_id?: string; purpose?: string; channel?: string;
          status?: string; response?: string | null; requested_by?: string; requested_by_name?: string;
          recipient_email?: string | null; survey_token?: string | null; token_expires_at?: string | null;
          email_outbox_id?: string | null;
          sent_binding_id?: string | null; sent_at?: string | null; completed_at?: string | null;
          closed_by?: string | null; closed_by_name?: string | null; closed_at?: string | null;
          closed_reason?: string | null; created_at?: string; updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attention_surveys_attention_id_fkey";
            columns: ["attention_id"];
            referencedRelation: "customer_attentions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attention_surveys_workstation_id_fkey";
            columns: ["workstation_id"];
            referencedRelation: "workstations";
            referencedColumns: ["id"];
          },
        ];
      };
      public_survey_rate_limits: {
        Row: {
          scope_type: string; scope_key: string; window_started_at: string;
          request_count: number; updated_at: string;
        };
        Insert: {
          scope_type: string; scope_key: string; window_started_at: string;
          request_count?: number; updated_at?: string;
        };
        Update: {
          scope_type?: string; scope_key?: string; window_started_at?: string;
          request_count?: number; updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          area_id: string | null;
          account_name: string | null;
          first_name: string;
          middle_name: string | null;
          paternal_surname: string;
          maternal_surname: string;
          phone: string | null;
          additional_email: string | null;
          email: string | null;
          photo_url: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          area_id?: string | null;
          account_name?: string | null;
          first_name: string;
          middle_name?: string | null;
          paternal_surname: string;
          maternal_surname: string;
          phone?: string | null;
          additional_email?: string | null;
          email?: string | null;
          photo_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          area_id?: string | null;
          account_name?: string | null;
          first_name?: string;
          middle_name?: string | null;
          paternal_surname?: string;
          maternal_surname?: string;
          phone?: string | null;
          additional_email?: string | null;
          email?: string | null;
          photo_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey";
            columns: ["area_id"];
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      user_invitations: {
        Row: {
          email: string;
          area_id: string | null;
          first_name: string;
          middle_name: string | null;
          paternal_surname: string;
          maternal_surname: string;
          phone: string | null;
          additional_email: string | null;
          role_name: string;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          email: string;
          area_id?: string | null;
          first_name: string;
          middle_name?: string | null;
          paternal_surname: string;
          maternal_surname: string;
          phone?: string | null;
          additional_email?: string | null;
          role_name: string;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          email?: string;
          area_id?: string | null;
          first_name?: string;
          middle_name?: string | null;
          paternal_surname?: string;
          maternal_surname?: string;
          phone?: string | null;
          additional_email?: string | null;
          role_name?: string;
          created_at?: string;
          expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_invitations_area_id_fkey";
            columns: ["area_id"];
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          key: string;
          name: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role_id: string;
        };
        Insert: {
          user_id: string;
          role_id: string;
        };
        Update: {
          user_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_user_invitation: {
        Args: {
          p_account_name: string | null;
          p_photo_url: string | null;
        };
        Returns: void;
      };
      create_customer_attention: {
        Args: {
          p_client: Json;
          p_service_channel_id: string;
          p_requester_type: string;
          p_conclusion: string;
          p_topics: Json;
          p_client_contact_email: string | null;
          p_kinship_type_id?: string | null;
          p_destination_area_id?: string | null;
          p_requester_detail?: string | null;
          p_kinship_detail?: string | null;
        };
        Returns: Json;
      };
      consume_dni_lookup_rate_limit: {
        Args: { p_user_id: string; p_origin_hash: string };
        Returns: Array<{
          allowed: boolean;
          retry_after_seconds: number;
          user_request_count: number;
          origin_request_count: number;
        }>;
      };
      get_pending_referral_count: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      disable_customer_attention: {
        Args: { p_attention_id: string; p_reason: string };
        Returns: void;
      };
      update_customer_attention: {
        Args: {
          p_attention_id: string;
          p_client: Json;
          p_service_channel_id: string;
          p_requester_type: string;
          p_conclusion: string;
          p_topics: Json;
          p_kinship_type_id?: string | null;
          p_destination_area_id?: string | null;
          p_requester_detail?: string | null;
          p_kinship_detail?: string | null;
        };
        Returns: void;
      };
      set_service_channel_status: {
        Args: { p_service_channel_id: string; p_is_active: boolean };
        Returns: void;
      };
      conclude_attention_referral: {
        Args: { p_referral_id: string; p_conclusion: string };
        Returns: Json;
      };
      get_public_referral_survey: { Args: { p_token: string }; Returns: Json };
      respond_public_referral_survey: {
        Args: { p_token: string; p_response?: string | null; p_skip?: boolean };
        Returns: Json;
      };
      assign_workstation: { Args: { p_workstation_id: string; p_user_id: string }; Returns: void };
      unassign_workstation: { Args: { p_workstation_id: string; p_reason: string }; Returns: void };
      activate_tablet_binding: { Args: Record<PropertyKey, never>; Returns: Json };
      get_current_tablet_binding: { Args: Record<PropertyKey, never>; Returns: Json };
      deactivate_current_tablet: { Args: { p_reason?: string }; Returns: void };
      force_deactivate_tablet: { Args: { p_workstation_id: string; p_reason: string }; Returns: void };
      send_attention_survey: { Args: { p_attention_id: string }; Returns: void };
      get_current_operator_survey: { Args: Record<PropertyKey, never>; Returns: Json };
      get_attention_survey_status: { Args: { p_attention_id: string }; Returns: string };
      get_attention_survey_state: { Args: { p_attention_id: string }; Returns: Json };
      queue_attention_email_survey: { Args: { p_attention_id: string; p_email?: string | null }; Returns: Json };
      consume_public_survey_rate_limit: {
        Args: { p_origin_hash: string; p_token_hash: string };
        Returns: Array<{ allowed: boolean; retry_after_seconds: number }>;
      };
      get_public_attention_survey: { Args: { p_token: string }; Returns: Json };
      respond_public_attention_survey: {
        Args: { p_token: string; p_response?: string | null; p_skip?: boolean };
        Returns: Json;
      };
      skip_attention_survey: { Args: { p_attention_id: string }; Returns: void };
      get_current_tablet_survey: { Args: Record<PropertyKey, never>; Returns: Json };
      answer_tablet_survey: { Args: { p_survey_id: string; p_response: string }; Returns: void };
      skip_tablet_survey: { Args: { p_survey_id: string }; Returns: void };
      disable_attention_referral: { Args: { p_referral_id: string; p_reason: string }; Returns: void };
      list_referral_inbox: {
        Args: { p_page?: number; p_limit?: number; p_search?: string; p_area_id?: string | null };
        Returns: Array<{
          id: string; attention_id: string; rac_code: string; client_dni: string; client_name: string;
          destination_area_id: string; destination_area_name: string; referred_by_name: string;
          referred_at: string; total_count: number;
        }>;
      };
      list_customer_attentions_v2: {
        Args: {
          p_page?: number; p_limit?: number; p_search?: string; p_survey_status?: string | null;
          p_referral_status?: string | null; p_area_id?: string | null;
        };
        Returns: Array<{
          id: string; rac_code: string; attention_status: string; requester_type: string;
          client_dni: string; client_name: string; service_channel_name: string;
          created_by_name: string; created_at: string; survey_status: string;
          referral_status: string; referral_area_id: string | null; referral_area_name: string | null;
          total_count: number;
        }>;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
