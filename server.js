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
const { bech32 } = require('bech32');

console.log('=== MGit Server Starting - Build Version 2025-06-08-v2 ===');

// Add this constant after existing constants
const USERS_PATH = process.env.USERS_PATH || path.join(__dirname, 'users');

// nostr
const { verifyEvent, validateEvent, getEventHash } = require('nostr-tools');

// Import security configuration
const configureSecurity = require('./security');

const mgitUtils = require('./mgitUtils');

const app = express();
app.use(express.json());
app.use(cors());

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

// keeping this as is for now--
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
  await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
  return userData;
}

async function getUser(pubkey) {
  try {
    const userFile = path.join(USERS_PATH, `${pubkey}.json`);
    const data = await fs.readFile(userFile, 'utf8');
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

app.post('/api/auth/register', validateMGitToken, async (req, res) => {
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

    // Create WebSocket connection to get metadata
    const ws = new WebSocket('wss://relay.damus.io');
    
    const metadataPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Metadata fetch timeout'));
      }, 5000);

      ws.onopen = () => {
        const req = JSON.stringify([
          "REQ",
          "metadata-query",
          {
            "kinds": [0],
            "authors": [signedEvent.pubkey],
            "limit": 1
          }
        ]);
        ws.send(req);
      };

      ws.onmessage = (event) => {
        const [type, _, eventData] = JSON.parse(event.data);
        if (type === 'EVENT' && eventData.kind === 0) {
          clearTimeout(timeout);
          ws.close();
          resolve(eventData);
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });

    let metadata = null;
    try {
      metadata = await metadataPromise;
    } catch (error) {
      console.warn('Failed to fetch Nostr metadata:', error.message);
      // Continue without metadata
    }
    
    // Generate JWT token
    const token = jwt.sign({ 
      pubkey: signedEvent.pubkey,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hour expiration
    }, JWT_SECRET);

    console.log('Nostr login verified for pubkey:', signedEvent.pubkey);
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
    const bech32pubkey = hexToBech32(pubkey);
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

// Sample endpoint for repository info - protected by token validation
app.get('/api/mgit/repos/:repoId/info', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const { pubkey, access } = req.user;
  
  // The user is already authenticated and authorized via the middleware
  // Could fetch actual repository information here
  
  res.json({
    id: repoId,
    name: `${repoId}`,
    access: access,
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

/* 
  Functions needed to re-implement git's protocol for sending and receiving data
*/
// discovery phase of git's https smart discovery protocol
app.get('/api/mgit/repos/:repoId/info/refs', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
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
    const { access } = req.user;
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
app.post('/api/mgit/repos/:repoId/git-upload-pack', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  
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
app.post('/api/mgit/repos/:repoId/git-receive-pack', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const { access } = req.user;
  
  // Check write permissions
  if (access !== 'admin' && access !== 'read-write') {
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
app.get('/api/mgit/repos/:repoId/metadata', validateMGitToken, (req, res) => {
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

// Add CSP headers to allow Nostr extension functionality
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval'; " +
    "connect-src 'self'"
  );
  next();
});

// Start the server
const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  await ensureUsersDirectory();
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});