import { createServer, IncomingMessage, ServerResponse } from 'http';
import { TwitterApi } from 'twitter-api-v2';
import open from 'open';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { XTokens, XTokensStore } from '../types/x-tokens.js';
import { logger } from '../utils/logger.js';

const REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'like.write', 'offline.access'];

export class XAuthService {
  private cwd: string;
  private clientId: string;
  private tokensPath: string;

  constructor(cwd: string, clientId: string) {
    this.cwd = cwd;
    this.clientId = clientId;
    this.tokensPath = join(cwd, '.shippost-tokens.json');
  }

  /**
   * Start OAuth flow and get access token
   */
  async authorize(): Promise<XTokens> {
    // Create Twitter API client
    const client = new TwitterApi({
      clientId: this.clientId,
    });

    // Generate auth link (PKCE is handled automatically by the library)
    const { url: authUrl, codeVerifier, state } = client.generateOAuth2AuthLink(REDIRECT_URI, {
      scope: SCOPES,
    });

    // Start local server to receive callback
    const authCode = await this.startCallbackServer(state, authUrl);

    // Exchange code for tokens
    let loginResult;
    try {
      loginResult = await client.loginWithOAuth2({
        code: authCode,
        codeVerifier,
        redirectUri: REDIRECT_URI,
      });
    } catch (error) {
      // Provide more helpful error messages for common issues
      const err = error as { code?: number; message?: string };
      if (err.code === 401 || err.message?.includes('401')) {
        throw new Error(
          'X API authentication failed (401). This usually means:\n' +
          '  1. The Client ID is invalid or the app was deleted\n' +
          '  2. The app\'s OAuth 2.0 settings are misconfigured\n' +
          '  3. The redirect URI doesn\'t match: http://127.0.0.1:3000/callback\n' +
          'Please check your app at https://developer.x.com/en/portal/dashboard'
        );
      }
      throw error;
    }

    const {
      accessToken,
      refreshToken,
      expiresIn,
    } = loginResult;

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const tokens: XTokens = {
      accessToken,
      refreshToken,
      expiresAt,
    };

    // Save tokens
    this.saveTokens(tokens);

    return tokens;
  }

  /**
   * Start local HTTP server to receive OAuth callback
   */
  private startCallbackServer(expectedState: string, authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`Authorization failed: ${error}`));
            return;
          }

          if (!code || state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Invalid Request</h1>
                  <p>Missing or invalid parameters.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('Invalid OAuth callback'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);
          server.close();
          resolve(code);
        }
      });

      server.listen(3000, () => {
        logger.step('Opening browser for authentication...');
        open(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Load tokens from disk
   */
  loadTokens(): XTokens | null {
    if (!existsSync(this.tokensPath)) {
      return null;
    }

    try {
      const data = readFileSync(this.tokensPath, 'utf-8');
      const store: XTokensStore = JSON.parse(data);
      return store.x || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save tokens to disk
   */
  private saveTokens(tokens: XTokens): void {
    let store: XTokensStore = {};

    if (existsSync(this.tokensPath)) {
      try {
        const data = readFileSync(this.tokensPath, 'utf-8');
        store = JSON.parse(data);
      } catch (error) {
        // Ignore parse errors, will overwrite
      }
    }

    store.x = tokens;
    writeFileSync(this.tokensPath, JSON.stringify(store, null, 2));
  }

  /**
   * Check if tokens are expired
   */
  isTokenExpired(tokens: XTokens): boolean {
    return new Date(tokens.expiresAt) < new Date();
  }

  /**
   * Refresh expired access token
   */
  async refreshTokens(tokens: XTokens): Promise<XTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available');
    }

    const client = new TwitterApi({
      clientId: this.clientId,
    });

    const {
      accessToken,
      refreshToken,
      expiresIn,
    } = await client.refreshOAuth2Token(tokens.refreshToken);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const newTokens: XTokens = {
      accessToken,
      refreshToken,
      expiresAt,
    };

    this.saveTokens(newTokens);

    return newTokens;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string> {
    let tokens = this.loadTokens();

    if (!tokens) {
      tokens = await this.authorize();
    } else if (this.isTokenExpired(tokens)) {
      tokens = await this.refreshTokens(tokens);
    }

    return tokens.accessToken;
  }
}
