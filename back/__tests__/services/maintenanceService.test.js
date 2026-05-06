/** Tests for maintenanceService */
const mockPgQuery = jest.fn();
const mockRedis = { keys: jest.fn(), del: jest.fn(), hGetAll: jest.fn() };

jest.mock('../../config/pgDatabase', () => ({ query: mockPgQuery, pool: {} }));
jest.mock('../../config/redisClient', () => mockRedis);
jest.mock('../../config/clickhouse', () => ({ queryClickHouse: jest.fn() }));
jest.mock('../../scripts/loadToRedisHopper', () => jest.fn().mockResolvedValue({ count: 0 }));

const service = require('../../services/maintenanceService');

describe('MaintenanceService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPgQuery.mockReset();
    mockRedis.keys.mockReset();
    mockRedis.del.mockReset();
    mockRedis.hGetAll.mockReset();
    service.intervals = [];
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('start() / stop()', () => {
    it('should register intervals on start', () => {
      service.start();
      expect(service.intervals.length).toBeGreaterThan(0);
    });

    it('should clear all intervals on stop', () => {
      service.start();
      const count = service.intervals.length;
      expect(count).toBeGreaterThan(0);
      service.stop();
      expect(service.intervals).toHaveLength(0);
    });
  });

  describe('cleanupStuckLeads()', () => {
    it('should run cleanup queries without error', async () => {
      mockPgQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await service.cleanupStuckLeads();
      expect(mockPgQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('cleanupStaleRedisKeys()', () => {
    it('should delete stale terminal keys older than 2 minutes', async () => {
      mockRedis.keys.mockResolvedValueOnce(['gescall:call:old:1']);
      const staleTime = Date.now() - 5 * 60 * 1000; // 5 min ago
      mockRedis.hGetAll.mockResolvedValueOnce({
        start_time: String(staleTime),
        ari_handled: 'YES',
        final_status: '',
      });

      await service.cleanupStaleRedisKeys();
      expect(mockRedis.del).toHaveBeenCalledWith('gescall:call:old:1');
    });

    it('should delete orphan keys older than 45 minutes', async () => {
      mockRedis.keys.mockResolvedValueOnce(['gescall:call:orphan:1']);
      const veryOld = Date.now() - 50 * 60 * 1000; // 50 min ago
      mockRedis.hGetAll.mockResolvedValueOnce({
        start_time: String(veryOld),
        ari_handled: 'NO',
        final_status: '',
      });

      await service.cleanupStaleRedisKeys();
      expect(mockRedis.del).toHaveBeenCalledWith('gescall:call:orphan:1');
    });

    it('should not delete recent active keys', async () => {
      mockRedis.keys.mockResolvedValueOnce(['gescall:call:active:1']);
      const recent = Date.now() - 30 * 1000; // 30 sec ago
      mockRedis.hGetAll.mockResolvedValueOnce({
        start_time: String(recent),
        ari_handled: 'NO',
        final_status: '',
      });

      await service.cleanupStaleRedisKeys();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should return early when no keys exist', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      await service.cleanupStaleRedisKeys();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
