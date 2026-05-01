import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Campaign interface with detailed information
export interface Campaign {
  id: string;
  name: string;
  active: boolean;
  ttsTemplates?: { id: string; name: string; content: string }[];
}

// Structured user interface (simplified for easy access)
export interface User {
  id: string;
  name: string;
  group: string | null;
  level: number;
  active: boolean;
  email?: string | null;
  phone_login?: string | null;
  user_code?: string | null;
  territory?: string | null;
  is_system?: boolean;
}


export interface UserPermissions {
  user_group: string | null;
  role_id?: number;
  user_level: number | null;
  active: boolean;
  campaigns: string[];
  ingroups: string[];
  granted?: string[]; // The array of explicit string permissions from PostgreSQL
}

export interface UserGroupStatus {
  user_group: string;
  group_name?: string;
  allowed_campaigns?: string;
  admin_viewable_groups?: string;
  [key: string]: any;
}

export interface InGroupStatus {
  group_id: string;
  group_name?: string;
  active?: string;
  group_color?: string;
  [key: string]: any;
}

export interface AgentStatus {
  user: string;
  status?: string;
  campaign_id?: string;
  conf_exten?: string;
  extension?: string;
  server_ip?: string;
  login_time?: string;
  last_call_time?: string;
  calls_today?: string;
  [key: string]: any;
}

export interface LoggedInAgent {
  user: string;
  campaign_id?: string;
  status?: string;
  sub_status?: string;
  calls_today?: string;
  server_ip?: string;
  [key: string]: any;
}

export interface AuthSession {
  timestamp: string;
  agent_user: string;

  // JWT token for API authentication
  token?: string;

  // Structured user data (easy access)
  user: User;

  // Detailed campaigns array
  campaigns: Campaign[];

  // Complete permissions object
  permissions: UserPermissions;


  // Additional status information
  userGroupStatus: UserGroupStatus[] | null;
  inGroupStatus: InGroupStatus[] | null;
  agentStatus: AgentStatus | null;
  agentStatusError: string | null;
  loggedInAgent: LoggedInAgent | null;

  // Helper flag
  isLogged: boolean;
}

interface AuthState {
  // Session data
  session: AuthSession | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  // Credentials (encrypted in transit)
  credentials: {
    agent_user: string;
    password: string;
  } | null;

  // Actions
  setSession: (session: AuthSession) => void;
  setCredentials: (agent_user: string, password: string) => void;
  clearCredentials: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Getters
  getUser: () => User | null;
  getUserLevel: () => number;
  isAdmin: () => boolean;
  hasPermission: (campaign: string) => boolean;
  hasRolePermission: (permission: string) => boolean; // New method for granular feature access
  getCampaigns: () => Campaign[];
  getCampaignIds: () => string[];
  getIngroups: () => string[];
  isLogged: () => boolean;
  getFullSession: () => AuthSession | null;
  addCampaign: (campaign: Campaign) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      credentials: null,

      // Actions
      setSession: (session) => {
        set({
          session,
          isAuthenticated: true,
          error: null,
        });
      },

      setCredentials: (agent_user, password) => {
        set({
          credentials: { agent_user, password },
        });
      },

      clearCredentials: () => {
        set({
          credentials: null,
        });
      },

      logout: () => {
        set({
          session: null,
          isAuthenticated: false,
          credentials: null,
          error: null,
        });
      },

      setLoading: (loading) => {
        set({ loading });
      },

      setError: (error) => {
        set({ error });
      },

      // Getters
      getUser: () => {
        const state = get();
        return state.session?.user || null;
      },

      getUserLevel: () => {
        const state = get();
        return state.session?.user?.level || 0;
      },

      isAdmin: () => {
        const state = get();
        // New role system uses is_system flag instead of hardcoded 'ADMIN' or levels
        return state.session?.user?.is_system === true;
      },

      hasPermission: (campaign: string) => {
        const state = get();
        const campaigns = state.session?.campaigns || [];
        return campaigns.some(c => c.id === campaign);
      },

      hasRolePermission: (permission: string) => {
        const state = get();
        // Super admins have all permissions implicitly
        if (state.session?.user?.is_system) return true;
        
        const granted = state.session?.permissions?.granted || [];
        return granted.includes(permission);
      },

      getCampaigns: () => {
        const state = get();
        return state.session?.campaigns || [];
      },

      getCampaignIds: () => {
        const state = get();
        const campaigns = state.session?.campaigns || [];
        return campaigns.map(c => c.id);
      },

      getIngroups: () => {
        const state = get();
        return state.session?.permissions?.ingroups || [];
      },

      isLogged: () => {
        const state = get();
        return state.isAuthenticated && state.session?.isLogged === true;
      },

      getFullSession: () => {
        const state = get();
        return state.session;
      },

      addCampaign: (campaign: Campaign) => {
        const state = get();
        if (state.session) {
          const newSession = { ...state.session };
          newSession.campaigns = [...newSession.campaigns, campaign];
          newSession.permissions = {
            ...newSession.permissions,
            campaigns: [...newSession.permissions.campaigns, campaign.id]
          };
          set({ session: newSession });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist session, not credentials or temporary state
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
