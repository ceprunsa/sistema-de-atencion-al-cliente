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
          requires_absence_count: boolean;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          consultation_type_id: string;
          name: string;
          display_order?: number;
          requires_absence_count?: boolean;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          consultation_type_id?: string;
          name?: string;
          display_order?: number;
          requires_absence_count?: boolean;
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
          absence_count: number | null;
        };
        Insert: {
          attention_id: string;
          topic_id: string;
          absence_count?: number | null;
        };
        Update: {
          attention_id?: string;
          topic_id?: string;
          absence_count?: number | null;
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
          p_kinship_type_id?: string | null;
          p_destination_area_id?: string | null;
        };
        Returns: Json;
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
        };
        Returns: void;
      };
      set_service_channel_status: {
        Args: { p_service_channel_id: string; p_is_active: boolean };
        Returns: void;
      };
      conclude_attention_referral: {
        Args: { p_referral_id: string; p_conclusion: string };
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
