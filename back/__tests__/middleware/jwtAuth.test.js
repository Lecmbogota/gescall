/**
 * Tests for JWT Authentication Middleware
 */
const jwt = require('jsonwebtoken');

// Mock dependencies BEFORE requiring the module under test
jest.mock('../../config/pgDatabase', () => ({
  query: jest.fn(),
  pool: {},
}));

// Set JWT_SECRET for deterministic tests
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRY = '1h';

const { generateToken, requireAuth, JWT_SECRET } = require('../../middleware/jwtAuth');
const pg = require('../../config/pgDatabase');

describe('JWT Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/api/campaigns',
      originalUrl: '/api/campaigns',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    pg.query.mockReset();
  });

  describe('generateToken()', () => {
    it('should generate a valid JWT token with user data', () => {
      const user = {
        username: 'testuser',
        role_name: 'AGENT',
        role_id: 2,
        user_id: 10,
        is_system: false,
      };

      const token = generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('AGENT');
      expect(decoded.role_id).toBe(2);
      expect(decoded.user_id).toBe(10);
      expect(decoded.is_system).toBe(false);
    });

    it('should generate a token that expires in 24h by default', () => {
      const user = { username: 'test', role: 'ADMIN', role_id: 1, user_id: 1 };

      const token = generateToken(user);
      const decoded = jwt.verify(token, JWT_SECRET);

      expect(decoded.exp).toBeDefined();
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(3600); // 1h as set in test env
    });
  });

  describe('requireAuth() middleware', () => {
    it('should skip auth for /auth paths', async () => {
      req.path = '/auth/login';
      req.originalUrl = '/api/auth/login';

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip auth for /health paths', async () => {
      req.path = '/health';
      req.originalUrl = '/api/health';

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip auth for /public paths', async () => {
      req.path = '/public/test';
      req.originalUrl = '/api/public/test';

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip auth for /tickets/webhook', async () => {
      req.path = '/tickets/webhook';
      req.originalUrl = '/api/tickets/webhook';

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when no auth header is present', async () => {
      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when auth header has wrong format', async () => {
      req.headers.authorization = 'Basic abc123';

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { username: 'test', role: 'AGENT', user_id: 1 },
        JWT_SECRET,
        { expiresIn: '0s' }
      );

      req.headers.authorization = `Bearer ${expiredToken}`;

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('expired') })
      );
    });

    it('should return 401 for invalid token', async () => {
      req.headers.authorization = 'Bearer invalid-token-yeah';

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid token') })
      );
    });

    it('should authenticate with valid Bearer token', async () => {
      const token = generateToken({
        username: 'validuser',
        role: 'ADMIN',
        role_id: 1,
        user_id: 42,
        is_system: true,
      });

      req.headers.authorization = `Bearer ${token}`;

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('validuser');
      expect(req.user.role).toBe('ADMIN');
      expect(req.user.user_id).toBe(42);
      expect(req.user.is_system).toBe(true);
    });

    it('should authenticate with valid X-API-Key from DB', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [{
          user_id: 5,
          username: 'apiuser',
          role_id: 3,
          role_name: 'MANAGER',
          is_system: false,
        }],
      });

      req.headers['x-api-key'] = 'valid-api-token-123';

      await requireAuth(req, res, next);

      expect(pg.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM gescall_users'),
        ['valid-api-token-123']
      );
      expect(next).toHaveBeenCalled();
      expect(req.user.username).toBe('apiuser');
      expect(req.user.role).toBe('MANAGER');
    });

    it('should authenticate with PUBLIC_API_KEYS when DB lookup fails', async () => {
      process.env.PUBLIC_API_KEYS = 'pubkey1,pubkey2,pubkey3';
      pg.query.mockRejectedValueOnce(new Error('DB error'));

      req.headers['x-api-key'] = 'pubkey2';

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('SUPER-ADMIN');
      expect(req.user.is_system).toBe(true);
    });
  });
});
