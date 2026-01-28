/**
 * Azure / Microsoft Graph API Configuration
 * 
 * NOTE: These values should be set via environment variables or Azure App Registration
 * For production, use secure storage (e.g., Firebase Functions config, Azure Key Vault)
 */

// Azure App Registration credentials
// These should be set via environment variables or secure configuration
export const AZURE_CONFIG = {
  // Azure AD App Registration Client ID
  clientId: process.env.EXPO_PUBLIC_AZURE_CLIENT_ID || '',
  
  // Azure AD Tenant ID (optional, defaults to 'common')
  tenantId: process.env.EXPO_PUBLIC_AZURE_TENANT_ID || 'common',
  
  // SharePoint Site ID (will be fetched dynamically)
  sharePointSiteId: process.env.EXPO_PUBLIC_SHAREPOINT_SITE_ID || '',
  
  // SharePoint Site URL (e.g., https://yourcompany.sharepoint.com/sites/DigitalKontroll)
  sharePointSiteUrl: process.env.EXPO_PUBLIC_SHAREPOINT_SITE_URL || '',
  
  // OAuth redirect URI (must match Azure App Registration)
  // For web, automatically use current origin (localhost in dev, production URL in prod)
  // This ensures OAuth redirects always match where the app is actually running
  redirectUri: (typeof window !== 'undefined' && window.location && window.location.origin) 
    ? `${window.location.origin}/`
    : (process.env.EXPO_PUBLIC_AZURE_REDIRECT_URI || ''),
  
  // Microsoft Graph API endpoint
  graphApiEndpoint: 'https://graph.microsoft.com/v1.0',
  
  // Required scopes for Microsoft Graph API
  scopes: [
    'Files.ReadWrite.All',    // Read and write files in SharePoint
    'Sites.ReadWrite.All',    // Read and write SharePoint sites
    'User.Read',              // Read user profile
  ],
};

/**
 * Get Azure configuration
 * @returns {Object} Azure configuration object
 */
export function getAzureConfig() {
  if (!AZURE_CONFIG.clientId) {
    console.warn('[Azure Config] Azure Client ID not configured. Please set EXPO_PUBLIC_AZURE_CLIENT_ID');
  }
  if (!AZURE_CONFIG.sharePointSiteUrl) {
    console.warn('[Azure Config] SharePoint Site URL not configured. Please set EXPO_PUBLIC_SHAREPOINT_SITE_URL');
  }
  return AZURE_CONFIG;
}
