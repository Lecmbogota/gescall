/**
 * Tests for Campaign routes (basic structure)
 */
const express = require('express');
const request = require('supertest');

// Mock dependencies
const mockPgQuery = jest.fn();
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('../../config/pgDatabase', () => ({
  query: mockPgQuery,
  pool: {},
}));

jest.mock('../../config/redisClient', () => mockRedis);

jest.mock('../../services/pgDatabaseService', () => ({
  getCampaignStats: jest.fn(),
  getAgentMetrics: jest.fn(),
}));

jest.mock('../../utils/dispositionUtils', () => ({
  resolveDisposition: jest.fn(),
  matchDispositionConditions: jest.fn(),
}));

// Set JWT_SECRET
process.env.JWT_SECRET = 'test-secret';

const { generateToken } = require('../../middleware/jwtAuth');
const campaignRoutes = require('../../routes/campaigns');

function createApp() {
  const app = express();
  app.use(express.json());

  // Mock auth middleware for testing
  app.use((req, res, next) => {
    req.user = {
      username: 'testadmin',
      role: 'SUPER-ADMIN',
      role_id: 1,
      user_id: 1,
      is_system: true,
    };
    // Attach io mock
    if (!req.app.get('io')) {
      req.app.set('io', { emit: jest.fn() });
    }
    next();
  });

  app.use('/api/campaigns', campaignRoutes);
  return app;
}

describe('Campaign Routes', () => {
  let app;
  const validToken = generateToken({
    username: 'testadmin',
    role_name: 'SUPER-ADMIN',
    role_id: 1,
    user_id: 1,
    is_system: true,
  });

  beforeEach(() => {
    app = createApp();
    mockPgQuery.mockReset();
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.del.mockReset();
  });

  describe('GET /api/campaigns', () => {
    it('should list all campaigns', async () => {
      mockPgQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'CAMP001',
            campaign_name: 'Test Campaign',
            active: true,
            campaign_type: 'OUTBOUND_PREDICTIVE',
            auto_dial_level: '2.0',
            campaign_cid: '3001234567',
            dial_prefix: '57',
            max_retries: 3,
            archived: false,
            dial_schedule: null,
            workspace_daily_target: 50,
          },
          {
            campaign_id: 'CAMP002',
            campaign_name: 'Second Campaign',
            active: false,
            campaign_type: 'BLASTER',
            auto_dial_level: '5.0',
            campaign_cid: '3007654321',
            dial_prefix: '57',
            max_retries: 2,
            archived: false,
            dial_schedule: null,
            workspace_daily_target: null,
          },
        ],
      });

      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should filter by campaign_id', async () => {
      mockPgQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'CAMP001',
            campaign_name: 'Test Campaign',
            active: true,
            campaign_type: 'OUTBOUND_PREDICTIVE',
            auto_dial_level: '2.0',
            campaign_cid: '3001234567',
            dial_prefix: '57',
            max_retries: 3,
            archived: false,
            dial_schedule: null,
            workspace_daily_target: 50,
          },
        ],
      });

      const res = await request(app)
        .get('/api/campaigns')
        .query({ campaign_id: 'CAMP001' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].campaign_id).toBe('CAMP001');
    });

    it('should handle database errors gracefully', async () => {
      mockPgQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
