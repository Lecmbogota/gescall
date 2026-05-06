/**
 * Tests: SocketService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  connect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Dynamic import to trigger mock
const SocketModule = await import('@/services/socket');
const socketService = SocketModule.default;
const { io } = await import('socket.io-client');

describe('SocketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
  });

  describe('connect()', () => {
    it('should create a socket connection with correct config', () => {
      socketService.connect();

      expect(io).toHaveBeenCalledWith(
        expect.stringContaining('/'),
        expect.objectContaining({
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 10,
        })
      );
    });

    it('should reuse existing connection if already connected', () => {
      mockSocket.connected = true;
      io.mockClear();

      socketService.connect();

      expect(io).not.toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect and nullify socket', () => {
      socketService.connect();
      socketService.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(socketService.isConnected).toBe(false);
    });
  });

  describe('on() / off()', () => {
    it('should register event listeners', () => {
      const callback = vi.fn();

      socketService.on('test:event', callback);
      expect(mockSocket.on).toHaveBeenCalledWith('test:event', callback);
    });

    it('should unregister specific event listener', () => {
      const callback = vi.fn();
      socketService.on('test:event', callback);
      socketService.off('test:event', callback);

      expect(mockSocket.off).toHaveBeenCalledWith('test:event', callback);
    });

    it('should remove all listeners for an event', () => {
      socketService.on('test:event', vi.fn());
      socketService.off('test:event');

      expect(mockSocket.off).toHaveBeenCalledWith('test:event');
    });
  });

  describe('emit()', () => {
    it('should emit events to the server', () => {
      socketService.emit('custom:action', { key: 'value' });

      expect(mockSocket.emit).toHaveBeenCalledWith('custom:action', { key: 'value' });
    });
  });

  describe('subscribeToDashboard()', () => {
    it('should subscribe to both dashboard events', () => {
      const callback = vi.fn();

      socketService.subscribeToDashboard(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('dashboard:update', callback);
      expect(mockSocket.on).toHaveBeenCalledWith('dashboard:realtime:update', callback);
      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:subscribe', undefined);
    });
  });

  describe('unsubscribeFromDashboard()', () => {
    it('should unsubscribe from dashboard events', () => {
      const callback = vi.fn();

      socketService.unsubscribeFromDashboard(callback);

      expect(mockSocket.off).toHaveBeenCalledWith('dashboard:update', callback);
      expect(mockSocket.off).toHaveBeenCalledWith('dashboard:realtime:update', callback);
    });
  });

  describe('subscribeToCampaign()', () => {
    it('should subscribe to campaign real-time stats', () => {
      const callback = vi.fn();

      socketService.subscribeToCampaign('CAMP001', callback);

      expect(mockSocket.on).toHaveBeenCalledWith('campaign:realtime:update', callback);
      expect(mockSocket.emit).toHaveBeenCalledWith('campaign:subscribe', {
        campaign_id: 'CAMP001',
      });
    });
  });

  describe('updateAgentState()', () => {
    it('should emit agent state update with timestamp', () => {
      socketService.updateAgentState('agent1', 'READY', 'CAMP001');

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:state:update', {
        username: 'agent1',
        state: 'READY',
        campaignId: 'CAMP001',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('subscribeAgentWorkspaceMetrics()', () => {
    it('should subscribe to workspace metrics', () => {
      const callback = vi.fn();

      socketService.subscribeAgentWorkspaceMetrics('agent1', callback);

      expect(mockSocket.on).toHaveBeenCalledWith('agent:workspace:metrics', callback);
      expect(mockSocket.emit).toHaveBeenCalledWith('agent:workspace:subscribe', {
        username: 'agent1',
      });
    });
  });
});
