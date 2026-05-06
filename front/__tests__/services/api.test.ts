/** Tests for ApiService */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import after mocks
const { default: api } = await import('@/services/api');

describe('ApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockReset();
  });

  describe('getApiUrl()', () => {
    it('should return default VITE_API_URL when no settings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      await api.get('/test');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/test');
    });

    it('should use localStorage settings when available', async () => {
      localStorageMock.setItem('systemSettings', JSON.stringify({ apiUrl: 'https://custom.api/api' }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      await api.get('/test');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('https://custom.api/api/test');
    });
  });

  describe('request()', () => {
    it('should send Authorization header when token exists', async () => {
      localStorageMock.setItem('auth-storage', JSON.stringify({
        state: { session: { token: 'test-jwt', user: { id: 'user1', group: 'ADMIN' } } },
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true, data: 'ok' }),
      });

      const result = await api.post('/data', { key: 'val' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/data'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-jwt',
          }),
        })
      );
      expect(result.success).toBe(true);
    });

    it('should handle 401 by clearing auth and throwing', async () => {
      localStorageMock.setItem('auth-storage', JSON.stringify({
        state: { session: { token: 'expired' } },
      }));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Token expired' }),
      });

      await expect(api.get('/protected')).rejects.toThrow('Session expired');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth-storage');
    });

    it('should throw on non-ok response with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(api.get('/failing')).rejects.toThrow('Server error');
    });
  });

  describe('REST methods', () => {
    it('get() sends GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: [] }),
      });

      await api.get('/items');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('post() sends POST with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      await api.post('/items', { name: 'test' });
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(JSON.stringify({ name: 'test' }));
    });

    it('put() sends PUT with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      await api.put('/items/1', { name: 'updated' });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('delete() sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      await api.delete('/items/1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('Campaign methods', () => {
    it('getCampaigns() builds correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      await api.getCampaigns({ campaignId: 'CAMP001' });
      expect(mockFetch.mock.calls[0][0]).toContain('campaign_id=CAMP001');
    });

    it('getCampaigns() with allowed campaigns', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      await api.getCampaigns({ allowedCampaigns: ['CAMP001', 'CAMP002'] });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('allowed_campaigns=CAMP001%2CCAMP002');
    });
  });

  describe('healthCheck()', () => {
    it('should call /health endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ status: 'ok', timestamp: '2026-05-06T00:00:00Z', system: 'GesCall Native' }),
      });

      const result = await api.healthCheck();
      expect(result.status).toBe('ok');
      expect(mockFetch.mock.calls[0][0]).toContain('/health');
    });
  });
});
