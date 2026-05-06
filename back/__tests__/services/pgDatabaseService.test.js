/** Tests for pgDatabaseService */
const mockPgQuery = jest.fn();
const mockRedis = { keys: jest.fn(), hGetAll: jest.fn() };

jest.mock('../../config/pgDatabase', () => ({ query: mockPgQuery, pool: {} }));
jest.mock('../../config/redisClient', () => mockRedis);

const service = require('../../services/pgDatabaseService');

describe('PgDatabaseService', () => {
  beforeEach(() => {
    mockPgQuery.mockReset();
    mockRedis.keys.mockReset();
    mockRedis.hGetAll.mockReset();
  });

  describe('getDashboardStats()', () => {
    it('should return dashboard stats with active calls from Redis', async () => {
      mockRedis.keys.mockResolvedValueOnce(['gescall:call:CAMP001:chan1', 'gescall:call:CAMP002:chan2']);
      mockPgQuery.mockResolvedValueOnce({
        rows: [{ active_agents: '5', active_campaigns: '3', pending_leads: '1200', calls_today: '450', sales_today: '12', avg_talk_time_today: '185.5', total_leads_active_lists: '5000' }],
      });

      const stats = await service.getDashboardStats();

      expect(stats.active_calls).toBe(2);
      expect(stats.active_agents).toBe(5);
      expect(stats.active_campaigns).toBe(3);
      expect(stats.pending_leads).toBe(1200);
      expect(stats.calls_today).toBe(450);
      expect(stats.sales_today).toBe(12);
      expect(stats.avg_talk_time_today).toBe(185.5);
      expect(stats.conversion_rate).toBe('2.67');
      expect(stats.calls_per_agent).toBe(90);
    });

    it('should handle Redis error gracefully', async () => {
      mockRedis.keys.mockRejectedValueOnce(new Error('Redis down'));
      mockPgQuery.mockResolvedValueOnce({
        rows: [{ active_agents: '3', active_campaigns: '1', pending_leads: '50', calls_today: '10', sales_today: '0', avg_talk_time_today: '30', total_leads_active_lists: '100' }],
      });

      const stats = await service.getDashboardStats();

      expect(stats.active_calls).toBe(0);
      expect(stats.active_agents).toBe(3);
    });

    it('should calculate conversion_rate correctly', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      mockPgQuery.mockResolvedValueOnce({
        rows: [{ active_agents: '0', active_campaigns: '0', pending_leads: '0', calls_today: '200', sales_today: '25', avg_talk_time_today: '120', total_leads_active_lists: '0' }],
      });

      const stats = await service.getDashboardStats();
      expect(stats.conversion_rate).toBe('12.50');
      expect(stats.calls_per_agent).toBe(0);
    });
  });

  describe('getActiveAgents()', () => {
    it('should return active agents from Redis', async () => {
      mockRedis.keys.mockResolvedValueOnce(['gescall:agent:agent1', 'gescall:agent:agent2', 'gescall:agent:agent3']);
      mockRedis.hGetAll
        .mockResolvedValueOnce({ state: 'READY', last_change: '1000', campaign_id: 'CAMP001' })
        .mockResolvedValueOnce({ state: 'OFFLINE', last_change: '900' })
        .mockResolvedValueOnce({ state: 'PAUSED', last_change: '1100', campaign_id: 'CAMP002' });

      const agents = await service.getActiveAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].username).toBe('agent1');
      expect(agents[0].state).toBe('READY');
      expect(agents[1].username).toBe('agent3');
      expect(agents[1].state).toBe('PAUSED');
    });

    it('should return empty when no agent keys exist', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      const agents = await service.getActiveAgents();
      expect(agents).toEqual([]);
    });
  });
});
