/**
 * Tests for Auth routes (login, pubkey, verify)
 */
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock pgDatabase before requiring auth routes
const mockQuery = jest.fn();
jest.mock('../../config/pgDatabase', () => ({
  query: mockQuery,
  pool: {},
}));

// Set JWT_SECRET
process.env.JWT_SECRET = 'test-auth-routes-secret';

const authRoutes = require('../../routes/auth');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    mockQuery.mockReset();
  });

  describe('GET /api/auth/pubkey', () => {
    it('should return a valid RSA public key', async () => {
      const res = await request(app).get('/api/auth/pubkey');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.publicKey).toBeDefined();
      expect(res.body.publicKey).toContain('BEGIN PUBLIC KEY');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 401 when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user: 'nonexistent', password: 'test' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('User not found');
    });

    it('should return 401 when password is invalid', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          username: 'testuser',
          role_id: 2,
          password_hash: hashedPassword,
          is_system: false,
          role_name: 'AGENT',
          active: true,
        }],
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user: 'testuser', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid password');
    });

    it('should login successfully with valid bcrypt credentials', async () => {
      const hashedPassword = await bcrypt.hash('mypassword', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          username: 'testagent',
          role_id: 2,
          password_hash: hashedPassword,
          is_system: false,
          role_name: 'AGENT',
          active: true,
          sip_extension: '1001',
          sip_password: 'sip123',
        }],
      });

      // Mock campaigns query for non-system user
      mockQuery.mockResolvedValueOnce({
        rows: [{ campaign_id: 'CAMP001', campaign_name: 'Test Campaign', active: true }],
      });

      // Mock permissions query
      mockQuery.mockResolvedValueOnce({
        rows: [{ permission: 'view_campaigns' }, { permission: 'manage_leads' }],
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user: 'testagent', password: 'mypassword' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.id).toBe('testagent');
      expect(res.body.user.group).toBe('AGENT');
      expect(res.body.campaigns).toHaveLength(1);
      expect(res.body.campaigns[0].id).toBe('CAMP001');
      expect(res.body.permissions.granted).toContain('view_campaigns');
      expect(res.body.permissions.granted).toContain('manage_leads');
      expect(res.body.isLogged).toBe(true);

      // Verify the JWT token
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      expect(decoded.username).toBe('testagent');
      expect(decoded.role).toBe('AGENT');
    });

    it('should login as system user with all campaigns', async () => {
      const hashedPassword = await bcrypt.hash('adminpass', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 99,
          username: 'admin',
          role_id: 1,
          password_hash: hashedPassword,
          is_system: true,
          role_name: 'SUPER-ADMIN',
          active: true,
        }],
      });

      // All campaigns for system user
      mockQuery.mockResolvedValueOnce({
        rows: [
          { campaign_id: 'CAMP001', campaign_name: 'Campaign 1', active: true },
          { campaign_id: 'CAMP002', campaign_name: 'Campaign 2', active: true },
        ],
      });

      // Permissions
      mockQuery.mockResolvedValueOnce({
        rows: [{ permission: 'admin_all' }],
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user: 'admin', password: 'adminpass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.is_system).toBe(true);
      expect(res.body.user.level).toBe(9);
      expect(res.body.campaigns).toHaveLength(2);
    });

    it('should login with plain-text password and auto-upgrade to bcrypt', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 2,
          username: 'legacyuser',
          role_id: 2,
          password_hash: 'plaintextpassword', // Not bcrypt
          is_system: false,
          role_name: 'AGENT',
          active: true,
          sip_extension: '1002',
          sip_password: 'sip456',
        }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] }); // No assigned campaigns
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No permissions
      // UPDATE for password upgrade
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user: 'legacyuser', password: 'plaintextpassword' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the password was upgraded (UPDATE query should have been called)
      const updateCalls = mockQuery.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE gescall_users SET password_hash')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should handle RSA encrypted credentials', async () => {
      // First get the public key
      const pubKeyRes = await request(app).get('/api/auth/pubkey');
      const publicKey = pubKeyRes.body.publicKey;

      // Encrypt credentials with the public key
      const userEnc = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from('cryptouser', 'utf8')
      ).toString('base64');

      const passEnc = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from('cryptopass', 'utf8')
      ).toString('base64');

      const hashedPassword = await bcrypt.hash('cryptopass', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 3,
          username: 'cryptouser',
          role_id: 2,
          password_hash: hashedPassword,
          is_system: false,
          role_name: 'AGENT',
          active: true,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user_enc: userEnc, password_enc: passEnc });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe('cryptouser');
    });

    it('should return 400 on decryption failure', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ agent_user_enc: 'invalidbase64==', password_enc: 'bad!!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Decryption failed');
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should return 400 when no agent_user provided', async () => {
      const res = await request(app)
        .post('/api/auth/verify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should verify a valid user by username', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: 1, username: 'exists', active: true }],
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ agent_user: 'exists' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
    });

    it('should return invalid for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/auth/verify')
        .send({ agent_user: 'ghost' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.valid).toBe(false);
    });

    it('should verify via Bearer token', async () => {
      const token = jwt.sign(
        { username: 'tokentest', role: 'AGENT', user_id: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.user.username).toBe('tokentest');
    });
  });
});
