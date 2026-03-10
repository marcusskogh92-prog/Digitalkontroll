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
const CODE_STORAGE_KEY = 'azure_oauth_code'; // Cached auth code for redirect race safety

/** SessionStorage key: after redirect from tenant login we open sync picker for this company. Value: JSON { companyId, tenantId } */
export const PENDING_SYNC_PICKER_KEY = 'azure_pending_sync_picker';

/** Return true if we're in tenant-sync callback (getAccessToken returns null, skippa hierarchy-anrop för att undvika fel/loop) */
export function isPendingTenantSync() {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    return !!window.sessionStorage.getItem(PENDING_SYNC_PICKER_KEY);
  } catch (_e) {
    return false;
  }
}
/** State prefix for OAuth when logging in for a specific tenant (customer's SharePoint). State format: tenant_<tenantId>|<companyId>|<random> */
const STATE_PREFIX_TENANT = 'tenant_';
const STATE_TENANT_SEP = '|';

function tokenKeyTenant(tenantId) {
  const tid = String(tenantId || '').trim();
  return tid ? `azure_access_token_tenant_${tid}` : null;
}
function refreshKeyTenant(tenantId) {
  const tid = String(tenantId || '').trim();
  return tid ? `azure_refresh_token_tenant_${tid}` : null;
}
function expiryKeyTenant(tenantId) {
  const tid = String(tenantId || '').trim();
  return tid ? `azure_token_expiry_tenant_${tid}` : null;
}

function cacheOauthCodeFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location || !window.sessionStorage) return;
  try {
    const hash = window.location.hash.substring(1);
    const search = window.location.search.substring(1);
    const urlParams = new URLSearchParams(hash || search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    if (code) {
      window.sessionStorage.setItem(CODE_STORAGE_KEY, code);
    }
    // Sätt nyckeln direkt vid modulladdning så att getAccessToken() aldrig startar huvudapp-inloggning (bryter loop)
    if (code && state && String(state).startsWith(STATE_PREFIX_TENANT)) {
      const rest = String(state).slice(STATE_PREFIX_TENANT.length);
      const parts = rest.split(STATE_TENANT_SEP);
      const tenantId = parts[0] && String(parts[0]).trim();
      const companyId = parts[1] && String(parts[1]).trim();
      if (tenantId && companyId) {
        try {
          window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId, tenantId }));
        } catch (_e) {}
      }
    }
  } catch (_e) {}
}

cacheOauthCodeFromUrl();

/**
 * Get stored access token
 * @returns {Promise<string|null>} Access token or null if not found/expired
 */
export async function getStoredAccessToken() {
  try {
    let token = null;
    let expiry = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      expiry = window.localStorage.getItem(TOKEN_EXPIRY_KEY);
    } else {
      token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
      expiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
    }
    
    if (!token || !expiry) {
      return null;
    }
    
    // Check if token is expired (with 5 minute buffer)
    const expiryTime = parseInt(expiry, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    if (now + bufferTime >= expiryTime) {
      // Token expired or expiring soon, try to refresh
      const refreshToken = (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
        : await AsyncStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
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
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      window.localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      if (refreshToken) {
        window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      }
    } else {
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      if (refreshToken) {
        await AsyncStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      }
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
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
    } else {
      await AsyncStorage.multiRemove([TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY, TOKEN_EXPIRY_KEY]);
    }
  } catch (error) {
    console.error('[Azure Auth] Error clearing tokens:', error);
  }
}

/**
 * Get stored access token for a specific tenant (customer's SharePoint).
 * @param {string} tenantId - Azure AD tenant ID (company's Microsoft 365 tenant)
 * @returns {Promise<string|null>}
 */
export async function getStoredAccessTokenForTenant(tenantId) {
  const tk = tokenKeyTenant(tenantId);
  if (!tk) return null;
  try {
    let token = null;
    let expiry = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      token = window.localStorage.getItem(tk);
      expiry = window.localStorage.getItem(expiryKeyTenant(tenantId));
    } else {
      token = await AsyncStorage.getItem(tk);
      expiry = await AsyncStorage.getItem(expiryKeyTenant(tenantId));
    }
    if (!token || !expiry) return null;
    const expiryTime = parseInt(expiry, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000;
    if (now + bufferTime >= expiryTime) {
      const rtk = refreshKeyTenant(tenantId);
      const refreshToken = (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(rtk)
        : rtk ? await AsyncStorage.getItem(rtk) : null;
      if (refreshToken) {
        try {
          return await refreshAccessTokenForTenant(refreshToken, tenantId);
        } catch (_e) {
          return null;
        }
      }
      return null;
    }
    return token;
  } catch (_e) {
    return null;
  }
}

/**
 * Store access token for a specific tenant (customer SharePoint).
 * @param {string} tenantId - Azure AD tenant ID
 * @param {string} accessToken
 * @param {string|null} refreshToken
 * @param {number} expiresIn - seconds
 */
export async function storeAccessTokenForTenant(tenantId, accessToken, refreshToken = null, expiresIn = 3600) {
  const tk = tokenKeyTenant(tenantId);
  const rk = refreshKeyTenant(tenantId);
  const ek = expiryKeyTenant(tenantId);
  if (!tk) return;
  const expiryTime = Date.now() + (expiresIn * 1000);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(tk, accessToken);
    window.localStorage.setItem(ek, expiryTime.toString());
    if (refreshToken && rk) window.localStorage.setItem(rk, refreshToken);
  } else {
    await AsyncStorage.setItem(tk, accessToken);
    await AsyncStorage.setItem(ek, expiryTime.toString());
    if (refreshToken && rk) await AsyncStorage.setItem(rk, refreshToken);
  }
}

/**
 * Refresh access token for a specific tenant.
 * @param {string} refreshToken
 * @param {string} tenantId
 * @returns {Promise<string>}
 */
async function refreshAccessTokenForTenant(refreshToken, tenantId) {
  const config = getAzureConfig();
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  if (Platform.OS !== 'web') throw new Error('Tenant token refresh only supported on web');
  const response = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: config.scopes.join(' '),
    }),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.statusText}`);
  const data = await response.json();
  await storeAccessTokenForTenant(tenantId, data.access_token, data.refresh_token, data.expires_in);
  return data.access_token;
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
    const codeFromUrl = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    // Vid tenant-återkomst: sätt nyckeln direkt (synkront) så att andra getAccessToken()-anrop inte startar om inloggning
    const isTenantReturn = codeFromUrl && state && String(state).startsWith(STATE_PREFIX_TENANT);
    if (isTenantReturn && typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const rest = String(state).slice(STATE_PREFIX_TENANT.length);
        const parts = rest.split(STATE_TENANT_SEP);
        const tenantId = parts[0] && String(parts[0]).trim();
        const companyId = parts[1] && String(parts[1]).trim();
        if (tenantId && companyId) {
          window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId, tenantId }));
        }
      } catch (_e) {}
    }
    
    if (error) {
      throw new Error(`Azure authentication error: ${error}`);
    }
    
    let code = codeFromUrl;
    if (!code && typeof window !== 'undefined' && window.sessionStorage) {
      code = window.sessionStorage.getItem(CODE_STORAGE_KEY);
      if (code) {
        // Using cached OAuth code from sessionStorage
      }
    }

    if (code) {
      if (typeof window !== 'undefined' && window.sessionStorage && codeFromUrl) {
        try {
          window.sessionStorage.setItem(CODE_STORAGE_KEY, codeFromUrl);
        } catch (_e) {}
      }
      // We're returning from OAuth redirect - exchange code for token
      // Retrieve stored code_verifier for PKCE (use localStorage on web)
      let codeVerifier;
      if (typeof window !== 'undefined' && window.localStorage) {
        codeVerifier = window.localStorage.getItem(CODE_VERIFIER_KEY);
      } else {
        codeVerifier = await AsyncStorage.getItem(CODE_VERIFIER_KEY);
      }
      
      if (!codeVerifier) {
        console.warn('[authenticateWeb] Code verifier not found in storage (may have expired). Cleaning URL and starting new OAuth flow. Available keys:', typeof window !== 'undefined' && window.localStorage ? Object.keys(window.localStorage) : 'N/A');
        if (typeof window !== 'undefined' && window.sessionStorage) {
          try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
        }
        
        // Clean up URL fragment - code is invalid without verifier
        const url = new URL(window.location.href);
        url.hash = '';
        url.search = '';
        window.history.replaceState({}, '', url.toString());
        
        // Fall through to initiate a new OAuth flow (code below will handle this)
      } else {
        // We have code and verifier - check if this was tenant-specific login (customer SharePoint)
        const isTenantState = state && String(state).startsWith(STATE_PREFIX_TENANT);
        if (isTenantState && typeof window !== 'undefined' && window.sessionStorage) {
          const rest = String(state).slice(STATE_PREFIX_TENANT.length);
          const parts = rest.split(STATE_TENANT_SEP);
          const tenantId = parts[0] && String(parts[0]).trim();
          const companyId = parts[1] && String(parts[1]).trim();
          if (tenantId && companyId) {
            // Sätt nyckeln FÖRE exchange så att andra getAccessToken()-anrop (t.ex. hierarchyService) returnerar null istället för att starta om inloggning = loop
            try {
              window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId, tenantId }));
            } catch (_e) {}
            try {
              await exchangeCodeForTokenForTenant(code, codeVerifier, tenantId, config);
              if (typeof console !== 'undefined' && console.info) {
                console.info('[Azure Auth] Tenant token exchange OK for tenant', tenantId?.slice(0, 8) + '…');
              }
              const url = new URL(window.location.href);
              url.hash = '';
              url.search = '';
              window.history.replaceState({}, '', url.toString());
              if (window.localStorage) window.localStorage.removeItem(CODE_VERIFIER_KEY);
              try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
              return null;
            } catch (tenantErr) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('[Azure Auth] Tenant token exchange failed:', tenantErr?.message || tenantErr);
              }
              if (window.localStorage) window.localStorage.removeItem(CODE_VERIFIER_KEY);
              try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
              throw new Error(`Tenant login failed: ${tenantErr?.message || tenantErr}`);
            }
          }
        }
        // Default: exchange for app token
        try {
          const token = await exchangeCodeForToken(code, codeVerifier, config);
          
          // Clean up URL (remove code and state from fragment/query)
          const url = new URL(window.location.href);
          url.hash = '';
          url.search = '';
          window.history.replaceState({}, '', url.toString());
          
          // Clear stored code_verifier/code after successful exchange (use localStorage on web)
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CODE_VERIFIER_KEY);
          } else {
            await AsyncStorage.removeItem(CODE_VERIFIER_KEY);
          }
          if (typeof window !== 'undefined' && window.sessionStorage) {
            try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
          }
          
          return token;
        } catch (tokenError) {
          // Clear code_verifier/code on error (use localStorage on web)
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CODE_VERIFIER_KEY);
          } else {
            await AsyncStorage.removeItem(CODE_VERIFIER_KEY);
          }
          if (typeof window !== 'undefined' && window.sessionStorage) {
            try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
          }
          throw new Error(`Token exchange failed: ${tokenError?.message || tokenError}`);
        }
      }
    }
  }

  // Vi har precis kommit tillbaka från tenant-inloggning (SharePoint-synk). Om vi nu startar huvudappens OAuth
  // blir det en loop (redirect → välj konto → tillbaka → ingen huvud-token → redirect igen). Bryt genom att
  // inte starta inloggning när PENDING_SYNC_PICKER_KEY är satt.
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const pending = window.sessionStorage.getItem(PENDING_SYNC_PICKER_KEY);
      if (pending) {
        if (typeof console !== 'undefined' && console.info) {
          console.info('[Azure Auth] PENDING_SYNC_PICKER_KEY satt – avbryter huvudapp-inloggning för att undvika loop.');
        }
        return null;
      }
    } catch (_e) {}
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
 * Exchange authorization code for token in a specific tenant; store in tenant-specific storage.
 */
async function exchangeCodeForTokenForTenant(code, codeVerifier, tenantId, config) {
  const redirectUri = config.redirectUri || (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required');
  const response = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
      scope: config.scopes.join(' '),
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  await storeAccessTokenForTenant(tid, data.access_token, data.refresh_token, data.expires_in);
  return data.access_token;
}

/**
 * Vid återkomst från Microsoft (URL har code+state=tenant_): gör tenant-exchange och rensa URL.
 * Anropas från App/AdminModalContext – inte getAccessToken() – så att vi aldrig startar huvudapp-inloggning (bryter loop).
 * PENDING_SYNC_PICKER_KEY sätts redan vid modulladdning (cacheOauthCodeFromUrl).
 * @returns {Promise<void>}
 */
export async function processTenantReturnFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return;
  try {
    const hash = (window.location.hash || '').substring(1);
    const search = (window.location.search || '').substring(1);
    const urlParams = new URLSearchParams(hash || search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    if (!code || !state || !String(state).startsWith(STATE_PREFIX_TENANT)) return;
    const rest = String(state).slice(STATE_PREFIX_TENANT.length);
    const parts = rest.split(STATE_TENANT_SEP);
    const tenantId = parts[0] && String(parts[0]).trim();
    const companyId = parts[1] && String(parts[1]).trim();
    if (!tenantId || !companyId) return;
    let codeVerifier = null;
    if (window.localStorage) codeVerifier = window.localStorage.getItem(CODE_VERIFIER_KEY);
    if (!codeVerifier) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[Azure Auth] processTenantReturnFromUrl: ingen code_verifier');
      return;
    }
    const config = getAzureConfig();
    if (!config.clientId) return;
    await exchangeCodeForTokenForTenant(code, codeVerifier, tenantId, config);
    if (typeof console !== 'undefined' && console.info) console.info('[Azure Auth] Tenant exchange OK, rensar URL');
    try {
      window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId, tenantId }));
    } catch (_e) {}
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    if (window.localStorage) window.localStorage.removeItem(CODE_VERIFIER_KEY);
    try { window.sessionStorage.removeItem(CODE_STORAGE_KEY); } catch (_e) {}
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('[Azure Auth] processTenantReturnFromUrl:', e?.message || e);
  }
}

/**
 * Get access token for a specific tenant (customer's SharePoint).
 * If no token exists, starts tenant-specific login (redirect). Before redirect, sets PENDING_SYNC_PICKER_KEY.
 * @param {string} tenantId - Company's Azure AD tenant ID (from profile.azureTenantId)
 * @param {string} [companyId] - Company ID (required when triggering redirect)
 * @returns {Promise<string|null>} Token, or null if redirect was triggered
 */
export async function getAccessTokenForTenant(tenantId, companyId) {
  const tid = String(tenantId || '').trim();
  if (!tid) return null;
  const stored = await getStoredAccessTokenForTenant(tid);
  if (stored) return stored;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!companyId) return null;
  try {
    window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId: String(companyId).trim(), tenantId: tid }));
  } catch (_e) {}
  await authenticateForTenant(tid, String(companyId).trim());
  return null;
}

/**
 * Start OAuth flow for a specific tenant (customer's Microsoft 365). Redirects away.
 */
export async function authenticateForTenant(tenantId, companyId) {
  const config = getAzureConfig();
  if (!config.clientId) throw new Error('Azure Client ID not configured');
  const redirectUri = config.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  const state = `${STATE_PREFIX_TENANT}${tenantId}${STATE_TENANT_SEP}${companyId}${STATE_TENANT_SEP}${Date.now()}`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  } else {
    await AsyncStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  }
  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_mode=fragment&` +
    `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
    `state=${encodeURIComponent(state)}&` +
    `code_challenge=${encodeURIComponent(codeChallenge)}&` +
    `code_challenge_method=S256&` +
    `prompt=select_account`;
  if (typeof console !== 'undefined' && console.info) {
    console.info('[Azure Auth] Omdirigerar till Microsoft (tenant). Redirect URI måste matcha i Azure:', redirectUri);
  }
  await new Promise(resolve => setTimeout(resolve, 50));
  if (typeof window !== 'undefined') {
    window.location.href = authUrl;
    throw new Error('Redirecting to Azure login...');
  }
  throw new Error('Window object not available for authentication');
}

/**
 * Get authenticated access token (with automatic authentication if needed)
 * @returns {Promise<string|null>} Access token, or null if in tenant-sync callback (avoids redirect loop)
 */
export async function getAccessToken() {
  const storedToken = await getStoredAccessToken();
  if (storedToken) {
    return storedToken;
  }

  // På web: om vi väntar på tenant-synk (picker) ska vi ALDRIG starta huvudapp-inloggning – returnera null direkt
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const pending = window.sessionStorage.getItem(PENDING_SYNC_PICKER_KEY);
      if (pending) {
        if (typeof console !== 'undefined' && console.info) {
          console.info('[Azure Auth] getAccessToken: PENDING_SYNC_PICKER_KEY satt – returnerar null (undviker loop)');
        }
        return null;
      }
    } catch (_e) {}
    // Sätt nyckeln direkt om URL redan innehåller tenant-återkomst, så att andra anrop inte hinner redirecta
    try {
      const hash = (window.location.hash || '').substring(1);
      const search = (window.location.search || '').substring(1);
      const urlParams = new URLSearchParams(hash || search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      if (code && state && String(state).startsWith(STATE_PREFIX_TENANT)) {
        const rest = String(state).slice(STATE_PREFIX_TENANT.length);
        const parts = rest.split(STATE_TENANT_SEP);
        const tenantId = parts[0] && String(parts[0]).trim();
        const companyId = parts[1] && String(parts[1]).trim();
        if (tenantId && companyId) {
          window.sessionStorage.setItem(PENDING_SYNC_PICKER_KEY, JSON.stringify({ companyId, tenantId }));
        }
      }
    } catch (_e) {}
  }

  // No valid token, authenticate
  return await authenticate();
}
