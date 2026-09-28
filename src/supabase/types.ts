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
      profiles: {
        Row: {
          id: string;
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
        Relationships: [];
      };
      user_invitations: {
        Row: {
          email: string;
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
        Relationships: [];
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
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
