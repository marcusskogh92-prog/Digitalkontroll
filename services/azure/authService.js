/**
 * Azure AD / Microsoft Graph API Authentication Service
 * Handles OAuth authentication for Microsoft Graph API
 * Uses PKCE (Proof Key for Code Exchange) for Single-Page Application flow
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getAzureConfig } from './config';

// PKCE helper functions
/**
 * Generate a random code verifier for PKCE
 * @returns {string} Base64URL-encoded random string
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier using SHA256
 * @param {string} verifier - Code verifier
 * @returns {Promise<string>} Base64URL-encoded SHA256 hash
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64URL encode (without padding, with URL-safe characters)
 * @param {Uint8Array} array - Array to encode
 * @returns {string} Base64URL-encoded string
 */
function base64UrlEncode(array) {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Complete OAuth redirect flow
WebBrowser.maybeCompleteAuthSession();

const TOKEN_STORAGE_KEY = 'azure_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'azure_refresh_token';
const TOKEN_EXPIRY_KEY = 'azure_token_expiry';
const CODE_VERIFIER_KEY = 'azure_code_verifier'; // For PKCE

/**
 * Get stored access token
 * @returns {Promise<string|null>} Access token or null if not found/expired
 */
export async function getStoredAccessToken() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (!token || !expiry) {
      return null;
    }
    
    // Check if token is expired (with 5 minute buffer)
    const expiryTime = parseInt(expiry, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    if (now + bufferTime >= expiryTime) {
      // Token expired or expiring soon, try to refresh
      const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (refreshToken) {
        try {
          const newToken = await refreshAccessToken(refreshToken);
          return newToken;
        } catch (error) {
          console.warn('[Azure Auth] Failed to refresh token:', error);
          // Clear expired tokens
          await clearStoredTokens();
          return null;
        }
      } else {
        // No refresh token, clear stored token
        await clearStoredTokens();
        return null;
      }
    }
    
    return token;
  } catch (error) {
    console.error('[Azure Auth] Error getting stored token:', error);
    return null;
  }
}

/**
 * Store access token and metadata
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token (optional)
 * @param {number} expiresIn - Expiry time in seconds
 */
export async function storeAccessToken(accessToken, refreshToken = null, expiresIn = 3600) {
  try {
    const expiryTime = Date.now() + (expiresIn * 1000);
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
    if (refreshToken) {
      await AsyncStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }
  } catch (error) {
    console.error('[Azure Auth] Error storing token:', error);
    throw error;
  }
}

/**
 * Clear stored tokens
 */
export async function clearStoredTokens() {
  try {
    await AsyncStorage.multiRemove([TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY, TOKEN_EXPIRY_KEY]);
  } catch (error) {
    console.error('[Azure Auth] Error clearing tokens:', error);
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<string>} New access token
 */
async function refreshAccessToken(refreshToken) {
  const config = getAzureConfig();
  
  // For web, we can use the refresh token endpoint directly
  // For native, we might need to use a different flow
  if (Platform.OS === 'web') {
    const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: config.scopes.join(' '),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    await storeAccessToken(data.access_token, data.refresh_token, data.expires_in);
    return data.access_token;
  } else {
    // For native, we'll need to re-authenticate or use a backend service
    throw new Error('Token refresh not yet implemented for native platforms');
  }
}

/**
 * Authenticate with Microsoft Graph API using OAuth
 * @returns {Promise<string>} Access token
 */
export async function authenticate() {
  const config = getAzureConfig();
  
  if (!config.clientId) {
    throw new Error('Azure Client ID not configured. Please set EXPO_PUBLIC_AZURE_CLIENT_ID');
  }
  
  // Check if we have a valid stored token
  const storedToken = await getStoredAccessToken();
  if (storedToken) {
    return storedToken;
  }
  
  // For web, use OAuth redirect flow
  if (Platform.OS === 'web') {
    return authenticateWeb(config);
  } else {
    // For native, use Expo AuthSession
    return authenticateNative(config);
  }
}

/**
 * Authenticate on web using OAuth redirect flow with PKCE (for SPA)
 * @param {Object} config - Azure configuration
 * @returns {Promise<string>} Access token
 */
async function authenticateWeb(config) {
  // Ensure redirect URI matches where the app is actually running
  const redirectUri = config.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  
  // Check if we're returning from OAuth redirect (code in URL fragment or query)
  if (typeof window !== 'undefined' && window.location) {
    // For SPA, Azure returns code in fragment (#) not query (?)
    const hash = window.location.hash.substring(1); // Remove #
    const search = window.location.search.substring(1); // Remove ?
    const urlParams = new URLSearchParams(hash || search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
      throw new Error(`Azure authentication error: ${error}`);
    }
    
    if (code) {
      // We're returning from OAuth redirect - exchange code for token
      // Retrieve stored code_verifier for PKCE (use localStorage on web)
      let codeVerifier;
      if (typeof window !== 'undefined' && window.localStorage) {
        codeVerifier = window.localStorage.getItem(CODE_VERIFIER_KEY);
        console.log('[authenticateWeb] Retrieved code_verifier from localStorage:', codeVerifier ? 'found' : 'not found');
      } else {
        codeVerifier = await AsyncStorage.getItem(CODE_VERIFIER_KEY);
      }
      
      if (!codeVerifier) {
        console.warn('[authenticateWeb] Code verifier not found in storage (may have expired). Cleaning URL and starting new OAuth flow. Available keys:', typeof window !== 'undefined' && window.localStorage ? Object.keys(window.localStorage) : 'N/A');
        
        // Clean up URL fragment - code is invalid without verifier
        const url = new URL(window.location.href);
        url.hash = '';
        url.search = '';
        window.history.replaceState({}, '', url.toString());
        
        // Fall through to initiate a new OAuth flow (code below will handle this)
      } else {
        // We have code and verifier - exchange for token
        try {
          const token = await exchangeCodeForToken(code, codeVerifier, config);
          
          // Clean up URL (remove code and state from fragment/query)
          const url = new URL(window.location.href);
          url.hash = '';
          url.search = '';
          window.history.replaceState({}, '', url.toString());
          
          // Clear stored code_verifier after successful exchange (use localStorage on web)
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CODE_VERIFIER_KEY);
          } else {
            await AsyncStorage.removeItem(CODE_VERIFIER_KEY);
          }
          
          return token;
        } catch (tokenError) {
          // Clear code_verifier on error (use localStorage on web)
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CODE_VERIFIER_KEY);
          } else {
            await AsyncStorage.removeItem(CODE_VERIFIER_KEY);
          }
          throw new Error(`Token exchange failed: ${tokenError?.message || tokenError}`);
        }
      }
    }
  }
  
  // Not a redirect return - initiate OAuth flow with PKCE
  const state = Date.now().toString();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store code_verifier and state for later use (use localStorage on web)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('azure_oauth_state', state);
      window.localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
      
      // Verify it was actually saved
      const savedVerifier = window.localStorage.getItem(CODE_VERIFIER_KEY);
      if (savedVerifier !== codeVerifier) {
        console.error('[authenticateWeb] CRITICAL: code_verifier was not saved correctly! Expected:', codeVerifier?.substring(0, 10), 'Got:', savedVerifier?.substring(0, 10));
        throw new Error('Failed to save code_verifier to localStorage');
      }
      console.log('[authenticateWeb] ✅ Stored code_verifier in localStorage. Key:', CODE_VERIFIER_KEY, 'Length:', codeVerifier?.length);
    } catch (e) {
      console.error('[authenticateWeb] ❌ Failed to store code_verifier in localStorage:', e);
      throw new Error(`Failed to store code_verifier: ${e?.message || e}`);
    }
  } else {
    await AsyncStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  }
  
  // Build authorization URL with PKCE
  const authUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_mode=fragment&` + // SPA uses fragment, not query
    `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
    `state=${state}&` +
    `code_challenge=${encodeURIComponent(codeChallenge)}&` +
    `code_challenge_method=S256&` +
    `prompt=select_account`; // Force account selection to avoid automatic SSO with wrong tenant
  
  // Small delay to ensure localStorage is committed before redirect
  // This is especially important on some browsers
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Full page redirect (works better than popup for web)
  if (typeof window !== 'undefined') {
    window.location.href = authUrl;
    // This will redirect away, so we won't return from this function
    // The function will be called again when user returns with code in URL
    throw new Error('Redirecting to Azure login...');
  } else {
    throw new Error('Window object not available for authentication');
  }
}

/**
 * Authenticate on native using Expo AuthSession
 * @param {Object} config - Azure configuration
 * @returns {Promise<string>} Access token
 */
async function authenticateNative(config) {
  // TODO: Implement native authentication using expo-auth-session
  // For now, we'll use a similar flow but might need different redirect handling
  throw new Error('Native authentication not yet implemented. Please use web platform for now.');
}

/**
 * Exchange authorization code for access token using PKCE
 * @param {string} code - Authorization code
 * @param {string} codeVerifier - Code verifier (for PKCE)
 * @param {Object} config - Azure configuration
 * @returns {Promise<string>} Access token
 */
async function exchangeCodeForToken(code, codeVerifier, config) {
  // For SPA (Single-Page Application), we use PKCE instead of client_secret
  // This is secure for client-side applications
  
  const redirectUri = config.redirectUri || (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier, // PKCE: send the verifier
      scope: config.scopes.join(' '),
      // NOTE: For SPA, we do NOT use client_secret (PKCE replaces it)
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch (_e) {
      errorData = { error: errorText };
    }
    throw new Error(`Token exchange failed: ${response.statusText} - ${JSON.stringify(errorData, null, 2)}`);
  }
  
  const data = await response.json();
  await storeAccessToken(data.access_token, data.refresh_token, data.expires_in);
  return data.access_token;
}

/**
 * Get authenticated access token (with automatic authentication if needed)
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  const storedToken = await getStoredAccessToken();
  if (storedToken) {
    return storedToken;
  }
  
  // No valid token, authenticate
  return await authenticate();
}
