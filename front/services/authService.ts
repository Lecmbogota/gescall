import type { AuthSession } from '../stores/authStore';

class AuthService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getApiUrl();
  }

  private getApiUrl(): string {
    // Try to get from saved settings first
    try {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.apiUrl) {
          return settings.apiUrl;
        }
      }
    } catch (error) {
      console.error('[AuthService] Error loading settings:', error);
    }

    // Fallback to environment variable
    return import.meta.env.VITE_API_URL || 'https://urlpro.cc/api';
  }

  /**
   * Get public key for RSA encryption
   */
  async getPublicKey(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/pubkey`);
      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to get public key');
      }

      return data.publicKey;
    } catch (error) {
      console.error('[AuthService] Error getting public key:', error);
      throw error;
    }
  }

  /**
   * Encrypt data using RSA public key
   */
  private async encryptData(data: string, publicKey: string): Promise<string> {
    try {
      // Import public key
      const pemHeader = '-----BEGIN PUBLIC KEY-----';
      const pemFooter = '-----END PUBLIC KEY-----';

      // Remove header, footer, and all whitespace (including newlines)
      const pemContents = publicKey
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, ''); // Remove ALL whitespace characters including \n, \r, spaces, tabs

      const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        binaryDer,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['encrypt']
      );

      // Encrypt data
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP',
        },
        cryptoKey,
        dataBuffer
      );

      // Convert to base64
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    } catch (error) {
      console.error('[AuthService] Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Login to Vicidial using the backend API
   * @param agent_user - Vicidial agent username
   * @param password - Vicidial agent password
   * @param useEncryption - Whether to use RSA encryption (default: true)
   */
  async login(
    agent_user: string,
    password: string,
    useEncryption: boolean = true
  ): Promise<AuthSession> {
    try {
      console.log('[AuthService] Starting login for user:', agent_user);

      let payload: any;

      if (useEncryption) {
        // Get public key and encrypt credentials
        console.log('[AuthService] Getting public key for encryption...');
        const publicKey = await this.getPublicKey();

        console.log('[AuthService] Encrypting credentials...');
        const agent_user_enc = await this.encryptData(agent_user, publicKey);
        const password_enc = await this.encryptData(password, publicKey);

        payload = {
          agent_user_enc,
          password_enc,
        };
      } else {
        // Send credentials in plain text (not recommended for production)
        payload = {
          agent_user,
          password,
        };
      }

      console.log('[AuthService] Sending login request...');
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('[AuthService] Login failed:', data.error);
        throw new Error(data.error || 'Login failed');
      }

      console.log('[AuthService] Login successful');
      console.log('[AuthService] User info:', data);

      // Return session data with all fields from backend
      const session: AuthSession = {
        timestamp: data.timestamp,
        agent_user: data.agent_user,
        token: data.token,
        user: data.user,
        campaigns: data.campaigns || [],  // IMPORTANTE: Incluir campaigns array
        permissions: data.permissions,
        vicidialUser: data.vicidialUser,   // Raw Vicidial data
        userGroupStatus: data.userGroupStatus,
        inGroupStatus: data.inGroupStatus,
        agentStatus: data.agentStatus,
        agentStatusError: data.agentStatusError,
        loggedInAgent: data.loggedInAgent,
        isLogged: data.isLogged || true,   // Helper flag
      };

      console.log('[AuthService] ✓ Session created with', session.campaigns?.length || 0, 'campaigns');

      return session;
    } catch (error) {
      console.error('[AuthService] Login error:', error);
      throw error;
    }
  }

  /**
   * Verify if current session is still valid
   */
  async verifySession(agent_user: string, password: string): Promise<boolean> {
    try {
      // We can use the same login endpoint to verify
      // In production, you might want a dedicated verify endpoint
      await this.login(agent_user, password, false);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Logout (client-side only, Vicidial logout handled separately)
   */
  logout(): void {
    console.log('[AuthService] Logging out...');
    // Clear any local state if needed
    // Note: Actual Vicidial logout should be handled via NON-AGENT API
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
