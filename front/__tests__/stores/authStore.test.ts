/**
 * Tests: Zustand Auth Store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      credentials: null,
    });
  });

  describe('Initial state', () => {
    it('should start unauthenticated', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('setSession()', () => {
    it('should set session and mark as authenticated', () => {
      const mockSession = {
        timestamp: '2026-05-06T00:00:00Z',
        agent_user: 'testuser',
        token: 'jwt-token-abc',
        user: {
          id: 'testuser',
          name: 'testuser',
          group: 'AGENT',
          level: 1,
          active: true,
          is_system: false,
        },
        campaigns: [
          { id: 'CAMP001', name: 'Campaign 1', active: true },
        ],
        permissions: {
          user_group: 'AGENT',
          role_id: 2,
          user_level: 1,
          active: true,
          campaigns: ['CAMP001'],
          ingroups: [],
          granted: ['view_campaigns', 'manage_leads'],
        },
        userGroupStatus: null,
        inGroupStatus: null,
        agentStatus: null,
        agentStatusError: null,
        loggedInAgent: null,
        isLogged: true,
      };

      useAuthStore.getState().setSession(mockSession);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.session).toEqual(mockSession);
      expect(state.error).toBeNull();
    });
  });

  describe('logout()', () => {
    it('should clear session and reset state', () => {
      // First set a session
      useAuthStore.getState().setSession({
        timestamp: '2026-05-06T00:00:00Z',
        agent_user: 'byeuser',
        user: { id: 'byeuser', name: 'byeuser', group: 'AGENT', level: 1, active: true },
        campaigns: [],
        permissions: { user_group: 'AGENT', user_level: 1, active: true, campaigns: [], ingroups: [] },
        userGroupStatus: null,
        inGroupStatus: null,
        agentStatus: null,
        agentStatusError: null,
        loggedInAgent: null,
        isLogged: true,
      });

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('setCredentials() / clearCredentials()', () => {
    it('should store and clear credentials', () => {
      useAuthStore.getState().setCredentials('myuser', 'mypass');
      expect(useAuthStore.getState().credentials).toEqual({
        agent_user: 'myuser',
        password: 'mypass',
      });

      useAuthStore.getState().clearCredentials();
      expect(useAuthStore.getState().credentials).toBeNull();
    });
  });

  describe('setLoading() / setError()', () => {
    it('should update loading state', () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().loading).toBe(true);

      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('should update error state', () => {
      useAuthStore.getState().setError('Connection failed');
      expect(useAuthStore.getState().error).toBe('Connection failed');

      useAuthStore.getState().setError(null);
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('Getters', () => {
    const baseSession = {
      timestamp: '2026-05-06T00:00:00Z',
      agent_user: 'adminuser',
      token: 'token123',
      user: {
        id: 'adminuser',
        name: 'adminuser',
        group: 'SUPER-ADMIN',
        level: 9,
        active: true,
        is_system: true,
      },
      campaigns: [
        { id: 'CAMP001', name: 'Campaign A', active: true },
        { id: 'CAMP002', name: 'Campaign B', active: false },
      ],
      permissions: {
        user_group: 'SUPER-ADMIN',
        role_id: 1,
        user_level: 9,
        active: true,
        campaigns: ['CAMP001', 'CAMP002'],
        ingroups: ['INGROUP_1'],
        granted: ['admin_all', 'manage_users'],
      },
      userGroupStatus: null,
      inGroupStatus: null,
      agentStatus: null,
      agentStatusError: null,
      loggedInAgent: null,
      isLogged: true,
    };

    beforeEach(() => {
      useAuthStore.getState().setSession(baseSession);
    });

    it('getUser() returns user object', () => {
      const user = useAuthStore.getState().getUser();
      expect(user).toBeDefined();
      expect(user?.id).toBe('adminuser');
      expect(user?.group).toBe('SUPER-ADMIN');
    });

    it('getUserLevel() returns level', () => {
      expect(useAuthStore.getState().getUserLevel()).toBe(9);
    });

    it('isAdmin() checks is_system flag', () => {
      expect(useAuthStore.getState().isAdmin()).toBe(true);
    });

    it('hasPermission() checks campaign access', () => {
      expect(useAuthStore.getState().hasPermission('CAMP001')).toBe(true);
      expect(useAuthStore.getState().hasPermission('CAMP999')).toBe(false);
    });

    it('hasRolePermission() returns true for all perms when is_system', () => {
      expect(useAuthStore.getState().hasRolePermission('admin_all')).toBe(true);
      expect(useAuthStore.getState().hasRolePermission('nonexistent')).toBe(true);
    });

    it('getCampaigns() returns campaign list', () => {
      const campaigns = useAuthStore.getState().getCampaigns();
      expect(campaigns).toHaveLength(2);
      expect(campaigns[0].id).toBe('CAMP001');
    });

    it('getCampaignIds() returns just IDs', () => {
      const ids = useAuthStore.getState().getCampaignIds();
      expect(ids).toEqual(['CAMP001', 'CAMP002']);
    });

    it('getIngroups() returns ingroups', () => {
      const ingroups = useAuthStore.getState().getIngroups();
      expect(ingroups).toEqual(['INGROUP_1']);
    });

    it('isLogged() checks authentication', () => {
      expect(useAuthStore.getState().isLogged()).toBe(true);
    });

    it('getFullSession() returns full session', () => {
      const session = useAuthStore.getState().getFullSession();
      expect(session?.agent_user).toBe('adminuser');
    });

    it('addCampaign() appends a new campaign', () => {
      useAuthStore.getState().addCampaign({
        id: 'CAMP003',
        name: 'New Campaign',
        active: true,
      });

      const ids = useAuthStore.getState().getCampaignIds();
      expect(ids).toContain('CAMP003');
      expect(ids).toHaveLength(3);
    });
  });
});
