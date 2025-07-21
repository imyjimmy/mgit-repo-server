const { bech32 } = require('bech32');

/* hex and bech32 helper functions */
function hexToBech32(hexStr, hrp = 'npub') {
  // Validate hex input
  if (!/^[0-9a-fA-F]{64}$/.test(hexStr)) {
    throw new Error('Invalid hex format for Nostr public key');
  }
  
  const bytes = Buffer.from(hexStr, 'hex');
  const words = bech32.toWords(bytes);
  return bech32.encode(hrp, words);
}

function bech32ToHex(bech32Str) {
  const decoded = bech32.decode(bech32Str);
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 32) throw new Error('Invalid public key length');
  return Buffer.from(bytes).toString('hex');
}

/**
 * Authentication utilities for handling various token formats
 * including double-encoded Basic Auth from go-git clients
 */

/**
 * Extracts JWT token from Authorization header, handling multiple formats:
 * - Bearer tokens: "Bearer eyJhbGciOiJIUzI1NiIs..."
 * - Basic Auth: "Basic base64(username:token)"
 * - Double-encoded Basic Auth (go-git bug): "Basic base64(:Basic base64(:token))"
 * 
 * @param {string} authHeader - The Authorization header value
 * @returns {object} - { success: boolean, token: string|null, error: string|null }
 */
function extractTokenFromAuthHeader(authHeader) {
  if (!authHeader) {
    return {
      success: false,
      token: null,
      error: 'No authorization header provided'
    };
  }

  let token = null;
  console.log('extractTokenFromAuthHeader: ', authHeader);
  try {
    // Handle Bearer token (standard format)
    if (authHeader.startsWith('Bearer ')) {
      console.log('✅ Bearer token detected');
      token = authHeader.split(' ')[1];
      return {
        success: true,
        token: token,
        error: null
      };
    }
    
    // Handle Basic Auth (for go-git compatibility)
    else if (authHeader.startsWith('Basic ')) {
      console.log('✅ Basic Auth detected');
      
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');
      
      console.log('Basic Auth username:', username);
      console.log('Basic Auth password length:', password?.length || 0);
      
      // Check for double-encoded Basic Auth (go-git bug)
      if (credentials.startsWith('Basic ')) {
        console.log('🔧 Detected double-encoded Basic Auth, fixing...');
        // Extract the inner base64 part
        const innerBase64 = credentials.substring(6); // Remove "Basic "
        const innerCredentials = Buffer.from(innerBase64, 'base64').toString('ascii');
        const [innerUsername, innerPassword] = innerCredentials.split(':');
        token = innerPassword;
        console.log('🔧 Using inner JWT token from double-encoded auth');
      } else {
        // "Normal" Basic Auth but password might still have "Basic " prefix due to go-git double-encoding
        if (password && password.startsWith('Basic ')) {
          token = password.substring(6); // Remove "Basic " prefix
          console.log('🔧 Removed Basic prefix from password field, using JWT token');
        } else {
          token = password;
          console.log('Using password as JWT token');
        }
      }
      
      return {
        success: true,
        token: token,
        error: null
      };
    }
    
    // Unknown format
    else {
      console.log('❌ Unknown auth format');
      return {
        success: false,
        token: null,
        error: 'Invalid authentication format. Use Bearer or Basic Auth.'
      };
    }
    
  } catch (error) {
    console.log('❌ Token extraction failed:', error.message);
    return {
      success: false,
      token: null,
      error: `Token extraction failed: ${error.message}`
    };
  }
}

/**
 * Validates a JWT token and returns the decoded payload
 * 
 * @param {string} token - The JWT token to validate
 * @param {string} jwtSecret - The secret used to sign the JWT
 * @returns {object} - { success: boolean, decoded: object|null, error: string|null }
 */
function validateJWTToken(token, jwtSecret) {
  try {
    console.log('🔍 Validating JWT token...');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, jwtSecret);
    console.log('✅ JWT validation successful for user:', decoded.pubkey);
    
    return {
      success: true,
      decoded: decoded,
      error: null
    };
  } catch (error) {
    console.log('❌ JWT validation failed:', error.message);
    
    let errorMessage = 'Invalid token';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token expired';
    }
    
    return {
      success: false,
      decoded: null,
      error: errorMessage
    };
  }
}

/**
 * Complete token processing: extract from header and validate
 * 
 * @param {string} authHeader - The Authorization header value
 * @param {string} jwtSecret - The secret used to sign the JWT
 * @returns {object} - { success: boolean, decoded: object|null, error: string|null }
 */
function processAuthToken(authHeader, jwtSecret) {
  // Step 1: Extract token from header
  console.log("about to extract token from auth header")
  const extractResult = extractTokenFromAuthHeader(authHeader);
  if (!extractResult.success) {
    return extractResult;
  }
  
  // Step 2: Validate the JWT
  return validateJWTToken(extractResult.token, jwtSecret);
}

module.exports = {
  
};

module.exports = {
  hexToBech32,
  bech32ToHex,
  extractTokenFromAuthHeader,
  validateJWTToken,
  processAuthToken
}