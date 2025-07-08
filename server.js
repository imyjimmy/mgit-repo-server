require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

console.log('=== MGit Server Starting - Build Version 2025-06-08-v2 ===');

// Add this constant after existing constants
const USERS_PATH = process.env.USERS_PATH || path.join(__dirname, 'users');

// nostr
const { verifyEvent, validateEvent } = require('nostr-tools');

// Import security configuration
const configureSecurity = require('./security');

const mgitUtils = require('./mgitUtils');
const utils = require('./utils');

const app = express();
app.use(express.json());
app.use(cors());

// Add CSP headers to allow Nostr extension functionality
app.use((req, res, next) => {
  const cspPolicy = 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' chrome-extension: moz-extension:; " +
    "connect-src 'self' wss: https: chrome-extension: moz-extension:; " +
    "img-src 'self' data: https: chrome-extension: moz-extension: https://blossom.primal.net; " +
    "style-src 'self' 'unsafe-inline' chrome-extension: moz-extension:; " +
    "font-src 'self' data: chrome-extension: moz-extension:; " +
    "object-src 'none';";
  
  console.log('=== CSP DEBUG ===');
  console.log('Request URL:', req.url);
  console.log('Setting CSP:', cspPolicy);
  
  res.setHeader('Content-Security-Policy', cspPolicy);
  
  console.log('CSP Header set:', res.getHeader('Content-Security-Policy'));
  console.log('=================');
  next();
});

// Apply security configurations
const security = configureSecurity(app);

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', true);

// JWT secret key for authentication tokens
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Token expiration time in seconds (2 hrs)
const TOKEN_EXPIRATION = 120 * 60;

// Store pending challenges in memory (use a database in production)
const pendingChallenges = new Map();

// Path to repositories storage - secure path verified by security module
const REPOS_PATH = security.ensureSecurePath();

// Get base URL from environment or construct from request
const getBaseUrl = (req) => {
  // Priority 1: Environment variable
  if (process.env.MGIT_SERVER_URL) {
    return process.env.MGIT_SERVER_URL;
  }
  
  // Priority 2: Construct from request headers (works with reverse proxies)
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3003';
  return `${protocol}://${host}`;
};

// In-memory repository configuration - in production, use a database
// This would store which nostr pubkeys are authorized for each repository
let repoConfigurations = {
  'hello-world': {
    authorized_keys: [
      { pubkey: 'npub19jlhl9twyjajarvrjeeh75a5ylzngv4tj8y9wgffsguylz9eh73qd85aws', access: 'admin' }, // admin, read-write, read-only
      { pubkey: 'npub1gpqpv9rsdt04jhqgz3w3sh4xr8ns0zz8677j3uzhpw8w6qq3za8sdqhh2f', access: 'read-only' }
    ]
  },
};

// Add this function near the top of server.js
async function discoverExistingRepositories() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Try Docker path first, fallback to local
    let repoDir;
    try {
      await fs.access('/private_repos');
      repoDir = '/private_repos';  // Docker environment
      console.log('🐳 Running in Docker - using /private_repos');
    } catch {
      repoDir = path.resolve(__dirname, '../private_repos');  // Local environment
      console.log('💻 Running locally - using ../private_repos');
    }
    
    console.log(`🔍 Scanning for repositories in: ${repoDir}`);
    const items = await fs.readdir(repoDir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory() && !repoConfigurations[item.name]) {
        console.log(`🔍 Discovered repository: ${item.name}`);
        
        // Add with default configuration
        repoConfigurations[item.name] = {
          authorized_keys: [
            { pubkey: '2cbf7f956e24bb2e8d8396737f53b427c53432ab91c857212982384f88b9bfa2', access: 'admin' }
          ],
          metadata: {
            description: `Auto-discovered repository: ${item.name}`,
            created: new Date().toISOString(),
            type: 'repository'
          }
        };
      }
    }
  } catch (error) {
    console.error('Error discovering repositories:', error);
  }
}

// Call it on server startup (add this after the repoConfigurations object)
discoverExistingRepositories();

// Load repository configurations from file if available
try {
  const configPath = path.join(__dirname, 'repo-config.json');
  if (fs.existsSync(configPath)) {
    repoConfigurations = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Loaded repository configurations from file');
  }
} catch (error) {
  console.error('Error loading repository configurations:', error);
}

// Auth middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ status: 'error', reason: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ status: 'error', reason: 'No authentication token provided' });
  }
};

// Simple token validation for auth endpoints (no RepoId required)
const validateAuthToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('🔧 DEBUG: validateAuthToken', authHeader?.substring(0, 50) + '...');
  
  if (!authHeader) {
    console.log('❌ No auth header provided');
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Authentication required' 
    });
  }

  let token;

  // Handle Bearer token (existing)
  if (authHeader.startsWith('Bearer ')) {
    console.log('✅ Bearer token detected');
    token = authHeader.split(' ')[1];
  } 
  // Handle Basic Auth (for go-git compatibility)
  else if (authHeader.startsWith('Basic ')) {
    console.log('✅ Basic Auth detected');
    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');
      
      console.log('Basic Auth username:', username);
      console.log('Basic Auth password length:', password.length);
      
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
        // "Normal" Basic Auth but still has "Basic " prefix due to go-git double-encoding
        if (password.startsWith('Basic ')) {
          token = password.substring(6); // Remove "Basic " prefix
          console.log('🔧 Removed Basic prefix from password field, using JWT token');
        } else {
          token = password;
          console.log('Using password as JWT token');
        }
      }
    } catch (error) {
      console.log('❌ Basic Auth parsing failed:', error.message);
      return res.status(401).json({ 
        status: 'error', 
        reason: 'Invalid Basic Auth format' 
      });
    }
  }
  else {
    console.log('❌ Unknown auth format');
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Invalid authentication format. Use Bearer or Basic Auth.' 
    });
  }

  // Validate the JWT token (works for both Bearer and Basic Auth)
  try {
    console.log('🔍 Validating JWT token...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ JWT validation successful for user:', decoded.pubkey);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('❌ JWT validation failed:', error.message);
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Invalid token' 
    });
  }
};

// validates the MGitToken which includes RepoId
const validateMGitToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Authentication required' 
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add the decoded token to the request object for route handlers to use
    req.user = decoded;
    
    // Check if the token matches the requested repository
    if (req.params.repoId && req.params.repoId !== decoded.repoId) {
      return res.status(403).json({ 
        status: 'error', 
        reason: 'Token not valid for this repository' 
      });
    }
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        status: 'error', 
        reason: 'Token expired' 
      });
    }
    
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Invalid token' 
    });
  }
};

// Ensure repositories directory exists
if (!fs.existsSync(REPOS_PATH)) {
  fs.mkdirSync(REPOS_PATH, { recursive: true });
}

/* 
 * Admin Routes
 */
// create admin routes
const createAdminRoutes = require('./admin-routes');
const adminRoutes = createAdminRoutes(REPOS_PATH, repoConfigurations, validateAuthToken);
// UI for accessing admin dashboard
app.use('/admin', express.static(path.join(__dirname, 'admin')));
// admin-related API endpoints 
app.use('/api/admin', adminRoutes);

app.get('/api/auth/:type/status', (req, res) => {
  const { type } = req.params;
  const { k1 } = req.query;
  
  console.log(`Status check for ${type}:`, k1);
  
  if (!pendingChallenges.has(k1)) {
    return res.status(400).json({ status: 'error', reason: 'Challenge not found' });
  }

  const challenge = pendingChallenges.get(k1);
  console.log('Challenge status:', challenge);

  res.json({
    status: challenge.verified ? 'verified' : 'pending',
    nodeInfo: challenge.verified ? {
      pubkey: challenge.pubkey
    } : null
  });
});

/**
 * Users utility functions
 */

async function ensureUsersDirectory() {
  try {
    await fs.promises.mkdir(USERS_PATH, { recursive: true });
  } catch (err) {
    console.error('Error creating users directory:', err);
  }
}

async function saveUser(pubkey, profile) {
  const userFile = path.join(USERS_PATH, `${pubkey}.json`);
  const userData = {
    pubkey,
    profile,
    createdAt: new Date().toISOString(),
    repositories: []
  };
  await fs.promises.writeFile(userFile, JSON.stringify(userData, null, 2));
  return userData;
}

async function getUser(pubkey) {
  try {
    const userFile = path.join(USERS_PATH, `${pubkey}.json`);
    const data = await fs.promises.readFile(userFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/* 
* NOSTR Login Functionality
*
* Flow:
* User authenticates via existing /api/auth/nostr/verify → gets JWT token
* Call /api/auth/register with token → creates user profile
* User is now registered and logged in
*/

app.post('/api/auth/register', validateAuthToken, async (req, res) => {
  try {
    const { pubkey } = req.user;
    const { profile = {} } = req.body;

    const existingUser = await getUser(pubkey);
    if (existingUser) {
      return res.json({ 
        status: 'success', 
        message: 'User already registered',
        user: existingUser 
      });
    }

    const newUser = await saveUser(pubkey, profile);
    res.json({ 
      status: 'success', 
      message: 'User registered successfully',
      user: newUser 
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      reason: 'Registration failed',
      details: err.message 
    });
  }
});

app.post('/api/auth/nostr/challenge', (req, res) => {
  const challenge = crypto.randomBytes(32).toString('hex');
  
  pendingChallenges.set(challenge, {
    timestamp: Date.now(),
    verified: false,
    pubkey: null,
    type: 'nostr'
  });

  console.log('Generated Nostr challenge:', challenge);

  res.json({
    challenge,
    tag: 'login'
  });
});

app.post('/api/auth/nostr/verify', async (req, res) => {
  const { signedEvent } = req.body;
  
  try {
    // Validate the event format
    if (!validateEvent(signedEvent)) {
      return res.status(400).json({ 
        status: 'error', 
        reason: 'Invalid event format' 
      });
    }

    // Verify the event signature
    if (!verifyEvent(signedEvent)) {
      return res.status(400).json({ 
        status: 'error', 
        reason: 'Invalid signature' 
      });
    }

    // Fixed metadata fetching with proper error handling
    let metadata = null;
    try {
      console.log(`Fetching metadata for pubkey: ${signedEvent.pubkey}`);
      metadata = await fetchNostrMetadata(signedEvent.pubkey);
      
      if (metadata) {
        console.log('✅ Successfully fetched user metadata:', {
          name: metadata.name,
          display_name: metadata.display_name,
          has_picture: !!metadata.picture
        });
      } else {
        console.log('⚠️ No metadata found for this pubkey');
      }
    } catch (error) {
      console.warn('Failed to fetch Nostr metadata:', error.message);
      // Continue without metadata - this is handled gracefully
    }
    
    // Generate JWT token
    const token = jwt.sign({ 
      pubkey: signedEvent.pubkey,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hour expiration
    }, JWT_SECRET);

    console.log('Nostr login verified for pubkey:', signedEvent.pubkey);
    console.log('Created JWT:', token);
    res.json({ 
      status: 'OK',
      pubkey: signedEvent.pubkey,
      metadata,
      token
    });

  } catch (error) {
    console.error('Nostr verification error:', error);
    res.status(500).json({ 
      status: 'error', 
      reason: 'Verification failed' 
    });
  }
});

// Add this function right after your imports and before your routes
// This is the corrected metadata fetching function based on your working test
function fetchNostrMetadata(pubkey, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    // Try multiple relays in order of preference
    const relays = [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://relay.nostr.band'
    ];
    
    let currentRelayIndex = 0;
    
    function tryNextRelay() {
      if (currentRelayIndex >= relays.length) {
        reject(new Error('All relays failed to provide metadata'));
        return;
      }
      
      const relayUrl = relays[currentRelayIndex++];
      console.log(`Trying relay: ${relayUrl}`);
      
      tryFetchFromRelay(relayUrl, pubkey, timeoutMs / relays.length)
        .then(resolve)
        .catch((error) => {
          console.log(`Relay ${relayUrl} failed: ${error.message}`);
          tryNextRelay();
        });
    }
    
    tryNextRelay();
  });
}

function tryFetchFromRelay(relayUrl, pubkey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let metadataReceived = false;
    
    const timeout = setTimeout(() => {
      if (!metadataReceived) {
        ws.close();
        reject(new Error('Metadata fetch timeout'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      const subscriptionId = `metadata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const req = JSON.stringify([
        "REQ",
        subscriptionId,
        {
          "kinds": [0],
          "authors": [pubkey],
          "limit": 1
        }
      ]);
      console.log(`Sending request to ${relayUrl}: ${req}`);
      ws.send(req);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const [type, subscriptionId, eventData] = data;
        
        console.log(`Received from ${relayUrl}: ${event.data}`);
        
        if (type === 'EVENT' && eventData && eventData.kind === 0) {
          // Found metadata!
          metadataReceived = true;
          clearTimeout(timeout);
          ws.close();
          
          // Parse the metadata content
          const parsedMetadata = parseMetadataContent(eventData.content);
          resolve(parsedMetadata);
          
        } else if (type === 'EOSE') {
          // End of stored events - no metadata found on this relay
          if (!metadataReceived) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error('No metadata found on this relay'));
          }
        }
      } catch (parseError) {
        console.log(`Parse error from ${relayUrl}: ${parseError.message}`);
        // Continue listening for more messages
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message || 'Connection failed'}`));
    };

    ws.onclose = (event) => {
      if (!metadataReceived && event.code !== 1000) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
      }
    };
  });
}

function parseMetadataContent(contentString) {
  if (!contentString) {
    return null;
  }

  try {
    const content = JSON.parse(contentString);
    return {
      name: content.name || '',
      display_name: content.display_name || content.displayName || '',
      about: content.about || '',
      picture: content.picture || '',
      nip05: content.nip05 || '',
      banner: content.banner || '',
      website: content.website || '',
      lud06: content.lud06 || '',
      lud16: content.lud16 || ''
    };
  } catch (error) {
    console.log('Failed to parse metadata content:', error.message);
    return null;
  }
}

app.get('/api/auth/nostr/status', (req, res) => {
  const { challenge } = req.query;
  
  if (!pendingChallenges.has(challenge)) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Challenge not found' 
    });
  }

  const challengeData = pendingChallenges.get(challenge);
  
  // Only return status for Nostr challenges
  if (challengeData.type !== 'nostr') {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Invalid challenge type' 
    });
  }

  res.json({
    status: challengeData.verified ? 'verified' : 'pending',
    userInfo: challengeData.verified ? {
      pubkey: challengeData.pubkey
    } : null
  });
});

app.get('/api/nostr/nip05/verify', async (req, res) => {
  const { domain, name } = req.query;

  if (!domain || !name) {
    return res.status(400).json({ error: 'Domain and name parameters are required' });
  }

  const agent = new https.Agent({
    rejectUnauthorized: false
  });

  try {
    const response = await axios.get(
      `https://nostr-check.com/.well-known/nostr.json?name=${name}`,
      { 
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        httpsAgent: agent
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error('NIP-05 verification error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to verify NIP-05' });
  }
});

// NEW ENDPOINTS FOR MGIT REPOSITORY-SPECIFIC AUTH

// 1. Repository-specific challenge generation
app.post('/api/mgit/auth/challenge', (req, res) => {
  const { repoId } = req.body;
  
  if (!repoId) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Repository ID is required' 
    });
  }

  // Check if the repository exists in our configuration
  if (!repoConfigurations[repoId]) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  const challenge = crypto.randomBytes(32).toString('hex');
  
  // Store the challenge with repository info
  pendingChallenges.set(challenge, {
    timestamp: Date.now(),
    verified: false,
    pubkey: null,
    repoId,
    type: 'mgit'
  });

  console.log(`Generated MGit challenge for repo ${repoId}:`, challenge);

  res.json({
    challenge,
    repoId
  });
});

// 2. Verify signature and check repository authorization
app.post('/api/mgit/auth/verify', async (req, res) => {
  const { signedEvent, challenge, repoId } = req.body;
  
  // Validate request parameters
  if (!signedEvent || !challenge || !repoId) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Missing required parameters' 
    });
  }

  // Check if the challenge exists
  if (!pendingChallenges.has(challenge)) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Invalid or expired challenge' 
    });
  }

  const challengeData = pendingChallenges.get(challenge);
  
  // Verify the challenge is for the requested repository
  if (challengeData.repoId !== repoId) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Challenge does not match repository' 
    });
  }
  
  try {
    // Validate the event format
    if (!validateEvent(signedEvent)) {
      return res.status(400).json({ 
        status: 'error', 
        reason: 'Invalid event format' 
      });
    }

    // Verify the event signature
    if (!verifyEvent(signedEvent)) {
      return res.status(400).json({ 
        status: 'error', 
        reason: 'Invalid signature' 
      });
    }

    // Check the event content (should contain the challenge)
    if (!signedEvent.content.includes(challenge)) {
      return res.status(400).json({ 
        status: 'error', 
        reason: 'Challenge mismatch in signed content' 
      });
    }

    // Check if the pubkey is authorized for the repository
    const pubkey = signedEvent.pubkey;
    const repoConfig = repoConfigurations[repoId];
    
    if (!repoConfig) {
      return res.status(404).json({ 
        status: 'error', 
        reason: 'Repository not found' 
      });
    }

    // Find the authorization entry for this pubkey
    const bech32pubkey = utils.hexToBech32(pubkey);
    console.log('the pubkey is: ', pubkey, 'bech32 version: ', bech32pubkey);
    const authEntry = repoConfig.authorized_keys.find(entry => entry.pubkey === bech32pubkey);
    
    if (!authEntry) {
      return res.status(403).json({ 
        status: 'error', 
        reason: 'Not authorized for this repository' 
      });
    }

    // Update challenge status
    pendingChallenges.set(challenge, {
      ...challengeData,
      verified: true,
      pubkey
    });

    // Generate a temporary access token for repository operations
    const token = jwt.sign({
      pubkey,
      repoId,
      access: authEntry.access
    }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRATION
    });

    console.log(`MGit auth successful - pubkey ${pubkey} granted ${authEntry.access} access to repo ${repoId}`);
    
    res.json({ 
      status: 'OK',
      token,
      access: authEntry.access,
      expiresIn: TOKEN_EXPIRATION
    });

  } catch (error) {
    console.error('MGit auth verification error:', error);
    res.status(500).json({ 
      status: 'error', 
      reason: 'Verification failed: ' + error.message 
    });
  }
});

function checkRepoAccess(repoId, pubkey) {
  const repoConfig = repoConfigurations[repoId];
  if (!repoConfig) {
    return { 
      success: false, 
      status: 404, 
      error: 'Repository not found' 
    };
  }
  
  // Find the user's access level for this repository
  const authEntry = repoConfig.authorized_keys.find(key => 
    key.pubkey === pubkey || utils.hexToBech32(pubkey) === key.pubkey
  );
  
  if (!authEntry) {
    return { 
      success: false, 
      status: 403, 
      error: 'Not authorized for this repository' 
    };
  }

  return { 
    success: true, 
    access: authEntry.access,
    authEntry: authEntry
  };
}

// Sample endpoint for repository info - protected by token validation
app.get('/api/mgit/repos/:repoId/info', validateAuthToken, (req, res) => {
  const { repoId } = req.params;
  const { pubkey } = req.user; // From the general token
  
  const accessCheck = checkRepoAccess(repoId, pubkey);
  
  if (!accessCheck.success) {
    return res.status(accessCheck.status).json({ 
      status: 'error', 
      reason: accessCheck.error 
    });
  }
  
  // Return repository info with user's access level
  res.json({
    id: repoId,
    name: `${repoId}`,
    access: accessCheck.access,
    authorized_pubkey: pubkey
  });
});

// app.get('/api/mgit/repos/:repoId/git-upload-pack', validateMGitToken, (req, res) => {
//   const { repoId } = req.params;
//   const { pubkey, access } = req.user;
  
//   // Get physical repository path
//   const repoPath = path.join(REPOS_PATH, repoId);
  
//   // Check if repository exists
//   if (!fs.existsSync(repoPath)) {
//     return res.status(404).json({ 
//       status: 'error', 
//       reason: 'Repository not found' 
//     });
//   }
  
//   // In a real implementation, this would invoke git-upload-pack on the repository
//   // ...
// });

/*
 * MGit Repository API Endpoints
 */

app.get('/api/mgit/repos/:repoId/show', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const { access } = req.user;
  
  // Check access rights
  if (access !== 'admin' && access !== 'read-write' && access !== 'read-only') {
    return res.status(403).json({ 
      status: 'error', 
      reason: 'Insufficient permissions to view repository' 
    });
  }
  
  // Get the physical repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  console.log('MGITPATH set by system: ', process.env.MGITPATH)
  const mgitPath = `${process.env.MGITPATH}/mgit` || '../mgit/mgit';

  // Execute mgit status command for now
  const { exec } = require('child_process');
  // the current working directory of exec is private_repos/hello-world
  exec(`${mgitPath} show`, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing mgit show: ${error.message}`);
      return res.status(500).json({ 
        status: 'error', 
        reason: 'Failed to execute mgit show',
        details: error.message
      });
    }
    
    if (stderr) {
      console.error(`mgit show stderr: ${stderr}`);
    }
    
    // Return the output from mgit show
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  });
});

app.get('/api/mgit/repos/:repoId/clone', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const { access } = req.user;
  
  // Check if the user has access to the repository
  if (access !== 'admin' && access !== 'read-write' && access !== 'read-only') {
    return res.status(403).json({ 
      status: 'error', 
      reason: 'Insufficient permissions to access repository' 
    });
  }
  
  // Get the repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if the repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }

  console.log('MGITPATH set by system: ', process.env.MGITPATH)
  const mgitPath = `${process.env.MGITPATH}/mgit` || '../mgit/mgit';
  
  console.log(`Executing mgit status for repository ${repoId}`);
  
  // Execute mgit show command
  const { exec } = require('child_process');
  exec(`${mgitPath} log --oneline --graph --decorate=short --all`, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing mgit clone: ${error.message}`);
      return res.status(500).json({ 
        status: 'error', 
        reason: 'Failed to execute mgit clone',
        details: error.message
      });
    }
    
    if (stderr) {
      console.error(`mgit clone stderr: ${stderr}`);
    }
    
    // Return the output from mgit show
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  });
});

// QR Code generation endpoint-- used for mobile mgit clone
app.get('/api/qr/clone/:repoId', authenticateJWT, async (req, res) => {
  const { repoId } = req.params;
  const { pubkey } = req.user;
  
  const accessCheck = checkRepoAccess(repoId, pubkey);
  
  if (!accessCheck.success) {
    return res.status(accessCheck.status).json({ 
      status: 'error', 
      reason: accessCheck.error 
    });
  }

  try {
    // Create the QR code data
    const qrData = {
      action: "mgit_clone",
      clone_url: `${getBaseUrl(req)}/api/mgit/repos/${repoId}`,
      jwt_token: req.headers.authorization.split(' ')[1], // Extract token from Bearer header
      repo_name: repoId
    };

    // Generate SVG QR code
    const qrCodeSVG = await QRCode.toString(JSON.stringify(qrData), {
      type: 'svg',
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(qrCodeSVG);
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({
      status: 'error',
      reason: 'Failed to generate QR code',
      details: error.message
    });
  }
});

// Repository creation endpoint
app.post('/api/mgit/repos/create', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      status: 'error', 
      reason: 'Authentication required' 
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    // Verify the token (but don't require a specific repoId since we're creating one)
    const decoded = jwt.verify(token, JWT_SECRET);
    const { pubkey } = decoded;
    
    const { repoName, userName, userEmail, description } = req.body;
    if (!repoName || !userName || !userEmail) {
      return res.status(400).json({
        status: 'error',
        reason: 'Display name, user name, and email are required'
      });
    }
    
    // Check if repository already exists
    if (repoConfigurations[repoName]) {
      return res.status(409).json({
        status: 'error',
        reason: 'Repository already exists'
      });
    }
    
    // Create the repository
    console.log('REPOS_PATH:', REPOS_PATH);
    const repoResult = await mgitUtils.createRepository(repoName, userName, userEmail, pubkey, description, REPOS_PATH);
    
    if (repoResult.success) {
      repoConfigurations[repoName] = repoResult.repoConfig;
      res.json({
        status: 'OK',
        repoId: repoName,
        repoPath: repoResult.repoPath,
        cloneUrl: `http://localhost:3003/${repoName}`,
        message: 'Repository created successfully'
      });
    } else {
      res.status(500).json({
        status: 'error',
        reason: 'Failed to create repository',
        details: repoResult.error
      });
    }
    
  } catch (error) {
    console.error('Repository creation error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        status: 'error', 
        reason: 'Token expired' 
      });
    }
    
    return res.status(500).json({ 
      status: 'error', 
      reason: 'Repository creation failed: ' + error.message 
    });
  }
});

/* 
  Functions needed to re-implement git's protocol for sending and receiving data
*/
// discovery phase of git's https smart discovery protocol
app.get('/api/mgit/repos/:repoId/info/refs', validateAuthToken, (req, res) => {
  const { repoId } = req.params;
  const { pubkey } = req.user;
  
  const accessCheck = checkRepoAccess(repoId, pubkey);
  
  if (!accessCheck.success) {
    return res.status(accessCheck.status).json({ 
      status: 'error', 
      reason: accessCheck.error 
    });
  }

  const service = req.query.service;

  // Support both upload-pack (clone) and receive-pack (push)
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    return res.status(400).json({
      status: 'error',
      reason: 'Service not supported'
    });
  }
  
  // For push operations (git-receive-pack), check write permissions
  if (service === 'git-receive-pack') {
    const access = accessCheck.access;  // ✅ Use access from the check
    if (access !== 'admin' && access !== 'read-write') {
      return res.status(403).json({ 
        status: 'error', 
        reason: 'Insufficient permissions to push to repository' 
      });
    }
  }
  
  // Set appropriate headers
  res.setHeader('Content-Type', `application/x-${service}-advertisement`);
  res.setHeader('Cache-Control', 'no-cache');
  
  // Get repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Format the packet properly
  const serviceHeader = `# service=${service}\n`;
  const length = (serviceHeader.length + 4).toString(16).padStart(4, '0');
  
  // Write the packet
  res.write(length + serviceHeader);
  // Write the flush packet (0000)
  res.write('0000');
  
  // Extract the command name from the service
  const gitCommand = service.replace('git-', ''); // 'upload-pack' or 'receive-pack'
  
  // Log what we're doing
  console.log(`Advertising refs for ${repoId} using ${service}`);
  
  // Run git command to advertise refs
  const { spawn } = require('child_process');
  const process = spawn('git', [gitCommand, '--stateless-rpc', '--advertise-refs', repoPath]);
  
  // Pipe stdout to response
  process.stdout.pipe(res);
  
  // Log any errors
  process.stderr.on('data', (data) => {
    console.error(`git ${gitCommand} stderr: ${data}`);
  });
  
  process.on('error', (err) => {
    console.error(`Error spawning git process: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        reason: 'Error advertising refs',
        details: err.message
      });
    }
  });
});

// Git protocol endpoint for git-upload-pack (needed for clone)
// data transfer phase
app.post('/api/mgit/repos/:repoId/git-upload-pack', validateAuthToken, (req, res) => {
  console.log('🔧 DEBUG: git-upload-pack route hit for repoId:', req.params.repoId);
  const { repoId } = req.params;
  const { pubkey } = req.user;
  
  const accessCheck = checkRepoAccess(repoId, pubkey);
  
  if (!accessCheck.success) {
    return res.status(accessCheck.status).json({ 
      status: 'error', 
      reason: accessCheck.error 
    });
  }

  // Get repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Set content type for git response
  res.setHeader('Content-Type', 'application/x-git-upload-pack-result');
  
  // Spawn git upload-pack process
  const { spawn } = require('child_process');
  const process = spawn('git', ['upload-pack', '--stateless-rpc', repoPath]);
  
  // Add better logging
  console.log(`POST git-upload-pack for ${repoId}`);
  
  // Pipe the request body to git's stdin
  req.pipe(process.stdin);
  
  // Pipe git's stdout to the response
  process.stdout.pipe(res);
  
  // Log stderr
  process.stderr.on('data', (data) => {
    console.error(`git-upload-pack stderr: ${data.toString()}`);
  });
  
  // Handle errors
  process.on('error', (err) => {
    console.error(`git-upload-pack process error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).send('Git error');
    }
  });
  
  // Handle process exit
  process.on('exit', (code) => {
    console.log(`git-upload-pack process exited with code ${code}`);
  });
});

// Git protocol endpoint for git-receive-pack (needed for push)
app.post('/api/mgit/repos/:repoId/git-receive-pack', validateAuthToken, (req, res) => {
  const { repoId } = req.params;
  const { pubkey } = req.user;
  
  const accessCheck = checkRepoAccess(repoId, pubkey);
  
  if (!accessCheck.success) {
    return res.status(accessCheck.status).json({ 
      status: 'error', 
      reason: accessCheck.error 
    });
  }
  
  // Check write permissions
  if (accessCheck.access !== 'admin' && accessCheck.access !== 'read-write') {
    return res.status(403).json({ 
      status: 'error', 
      reason: 'Insufficient permissions to push to repository' 
    });
  }
  
  // Get repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if the repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  // Set content type for git response
  res.setHeader('Content-Type', 'application/x-git-receive-pack-result');
  
  // Spawn git receive-pack process
  const { spawn } = require('child_process');
  const process = spawn('git', ['receive-pack', '--stateless-rpc', repoPath]);
  
  // Add better logging
  console.log(`POST git-receive-pack for ${repoId}`);
  
  // Pipe the request body to git's stdin
  req.pipe(process.stdin);
  
  // Pipe git's stdout to the response
  process.stdout.pipe(res);
  
  // Log stderr
  process.stderr.on('data', (data) => {
    console.error(`git-receive-pack stderr: ${data.toString()}`);
  });
  
  // Handle errors
  process.on('error', (err) => {
    console.error(`git-receive-pack process error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        reason: 'Git error',
        details: err.message
      });
    }
  });
  
  // Handle process exit
  process.on('exit', (code) => {
    console.log(`git-receive-pack process exited with code ${code}`);
    
    // If we wanted to extend this to handle MGit metadata, we would do it here
    // after the git process completes successfully
    if (code === 0) {
      console.log(`Successfully processed push for repository ${repoId}`);
      
      // In the future, you might want to add code here to:
      // 1. Extract commit info from the pushed data
      // 2. Update nostr_mappings.json
      // 3. Perform any other MGit-specific operations
    }
  });
});

// Endpoint to get MGit-specific metadata (e.g., nostr mappings)
app.get('/api/mgit/repos/:repoId/metadata', validateAuthToken, (req, res) => {
  const { repoId } = req.params;
  const { access } = req.user;
  
  // Check if the user has access to the repository
  if (access !== 'admin' && access !== 'read-write' && access !== 'read-only') {
    return res.status(403).json({ 
      status: 'error', 
      reason: 'Insufficient permissions to access repository' 
    });
  }
  
  // Get the repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if the repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  // Updated path to check both potential locations for mappings
  const mappingsPaths = [
    path.join(repoPath, '.mgit', 'mappings', 'hash_mappings.json'),  // New location
    path.join(repoPath, '.mgit', 'nostr_mappings.json')               // Old location
  ];
  
  let mappingsPath = null;
  
  // Find the first existing mappings file
  for (const path of mappingsPaths) {
    if (fs.existsSync(path)) {
      mappingsPath = path;
      break;
    }
  }
  
  // If no mappings file exists
  if (!mappingsPath) {
    // Create an empty mappings file in the new location
    mappingsPath = mappingsPaths[0];
    const mgitDir = path.dirname(mappingsPath);
    
    if (!fs.existsSync(path.dirname(mgitDir))) {
      fs.mkdirSync(path.dirname(mgitDir), { recursive: true });
    }
    
    if (!fs.existsSync(mgitDir)) {
      fs.mkdirSync(mgitDir, { recursive: true });
    }
    
    fs.writeFileSync(mappingsPath, '[]');
    console.log(`Created empty mappings file at ${mappingsPath}`);
  }
  
  // Read the mappings file
  try {
    const mappingsData = fs.readFileSync(mappingsPath, 'utf8');
    
    // Set content type and send the mappings data
    res.setHeader('Content-Type', 'application/json');
    res.send(mappingsData);
    console.log(`Successfully served mappings from ${mappingsPath}`);
  } catch (err) {
    console.error(`Error reading nostr mappings: ${err.message}`);
    res.status(500).json({ 
      status: 'error', 
      reason: 'Failed to read MGit metadata',
      details: err.message
    });
  }
});

// show repos of a user
app.get('/api/user/repositories', validateAuthToken, (req, res) => {
  try {
    console.log('USER REPOSITORIES LIST')
    const userPubkey = req.user.pubkey;
    const userRepositories = [];
    
    // Search through all repository configurations to find user's repos
    for (const [repoId, config] of Object.entries(repoConfigurations)) {
      // Check if user has access to this repository
      const hasAccess = config.authorized_keys.some(key => key.pubkey === userPubkey);
      
      if (hasAccess) {
        userRepositories.push({
          name: repoId,
          id: repoId,
          description: config.metadata?.description || '',
          created: config.metadata?.created || new Date().toISOString(),
          type: config.metadata?.type || 'repository',
          access: config.authorized_keys.find(key => key.pubkey === userPubkey)?.access || 'read-only'
        });
      }
    }
    
    // Sort by creation date (newest first)
    userRepositories.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    res.json(userRepositories);
  } catch (error) {
    console.error('Error fetching user repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// helper fns moved to mgitUtils

// Express static file serving for the React frontend ONLY
// This should point to your compiled frontend files, NOT the repository directory
app.use(express.static(path.join(__dirname, 'public')));

// For any routes that should render the React app (client-side routing)
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // Serve the main index.html for all non-API routes to support client-side routing
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  await ensureUsersDirectory();
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});