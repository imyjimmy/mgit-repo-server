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

// nostr
const { verifyEvent, validateEvent, getEventHash } = require('nostr-tools');

// Import security configuration
const configureSecurity = require('./security');

const app = express();
app.use(express.json());
app.use(cors());

// Apply security configurations
const security = configureSecurity(app);

// JWT secret key for authentication tokens
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Token expiration time in seconds (30 minutes)
const TOKEN_EXPIRATION = 30 * 60;

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

/* 
* NOSTR Login additions
*/
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

app.get('/api/mgit/repos/:repoId/git-upload-pack', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const { pubkey, access } = req.user;
  
  // Get physical repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  // In a real implementation, this would invoke git-upload-pack on the repository
  // ...
});

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
  
  const mgitPath = process.env.MGIT_PATH || '../../../mgit/mgit'; // workaround for now

  // Execute mgit show command
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

  // Find the mgit binary path
  const mgitPath = process.env.MGIT_PATH || '../../../mgit/mgit'; // workaround for now
  
  // For now, we'll use mgit show (as we discussed)
  // Later this will be replaced with the actual mgit clone implementation
  console.log(`Executing mgit show for repository ${repoId}`);
  
  // Execute mgit show command
  const { exec } = require('child_process');
  exec(`${mgitPath} show`, { cwd: repoPath }, (error, stdout, stderr) => {
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

// more clone endpoints
// discovery phase of git's https smart discovery protocol
app.get('/api/mgit/repos/:repoId/info/refs', validateMGitToken, (req, res) => {
  const { repoId } = req.params;
  const service = req.query.service;
  
  if (service !== 'git-upload-pack') {
    return res.status(400).send('Service not supported');
  }
  
  // Set appropriate headers
  res.setHeader('Content-Type', `application/x-${service}-advertisement`);
  res.setHeader('Cache-Control', 'no-cache');
  
  // Get repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Format the packet properly
  // The format is: [4 hex digits of length][content]
  // Length includes the 4 hex digits themselves
  const serviceHeader = `# service=${service}\n`;
  const length = (serviceHeader.length + 4).toString(16).padStart(4, '0');
  
  // Write the packet
  res.write(length + serviceHeader);
  // Write the flush packet (0000)
  res.write('0000');
  
  // Now run git upload-pack to advertise refs
  const { spawn } = require('child_process');
  const process = spawn('git', ['upload-pack', '--stateless-rpc', '--advertise-refs', repoPath]);
  
  // Pipe stdout to response
  process.stdout.pipe(res);
  
  // Log any errors
  process.stderr.on('data', (data) => {
    console.error(`git stderr: ${data}`);
  });
  
  process.on('error', (err) => {
    console.error('Error spawning git process:', err);
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
  
  // Check if the nostr mappings file exists
  const nostrMappingsPath = path.join(repoPath, '.mgit', 'nostr_mappings.json');
  if (!fs.existsSync(nostrMappingsPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'MGit metadata not found' 
    });
  }
  
  // Read the nostr mappings file
  try {
    const mappingsData = fs.readFileSync(nostrMappingsPath, 'utf8');
    
    // Set content type and send the mappings data
    res.setHeader('Content-Type', 'application/json');
    res.send(mappingsData);
  } catch (err) {
    console.error(`Error reading nostr mappings: ${err.message}`);
    res.status(500).json({ 
      status: 'error', 
      reason: 'Failed to read MGit metadata',
      details: err.message
    });
  }
});

/*
 * Helper functions for MGit operations
 */

function getDefaultBranch(repoPath) {
  try {
    // We could make this actually use the mgit command, but for simplicity:
    // Try to find which branch HEAD points to
    const headPath = path.join(repoPath, '.mgit', 'HEAD');
    if (fs.existsSync(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf8').trim();
      const match = headContent.match(/ref: refs\/heads\/(.+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Fallback to assuming main or master
    return 'main';
  } catch (err) {
    console.error('Error getting default branch:', err);
    return 'main'; // Default fallback
  }
}

function getBranches(repoPath) {
  try {
    // Use mgit branch command to list branches
    const output = execSync('mgit branch', { cwd: repoPath, encoding: 'utf8' });
    
    // Parse output to get branch names
    return output.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^\*\s+/, '')); // Remove asterisk from current branch
  } catch (err) {
    console.error('Error getting branches:', err);
    return ['main']; // Default fallback
  }
}

function getRepoDescription(repoPath) {
  // Try to read description from README.md
  const readmePath = path.join(repoPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8');
    const firstLine = readme.split('\n')[0];
    // Remove markdown heading markers
    return firstLine.replace(/^#+\s+/, '');
  }
  
  return 'No description available';
}

function getLastCommitDate(repoPath) {
  try {
    // Use mgit log to get last commit date
    const output = execSync('mgit log -1 --format=%cd', { cwd: repoPath, encoding: 'utf8' });
    return new Date(output.trim()).toISOString();
  } catch (err) {
    console.error('Error getting last commit date:', err);
    return new Date().toISOString(); // Fallback to current date
  }
}

function getRepoCreationDate(repoPath) {
  try {
    // Use mgit log to get first commit date
    const output = execSync('mgit log --reverse --format=%cd | head -1', { cwd: repoPath, encoding: 'utf8' });
    return new Date(output.trim()).toISOString();
  } catch (err) {
    console.error('Error getting repo creation date:', err);
    return new Date().toISOString(); // Fallback to current date
  }
}

function getLicense(repoPath) {
  // Check for common license files
  const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.md'];
  
  for (const file of licenseFiles) {
    const licensePath = path.join(repoPath, file);
    if (fs.existsSync(licensePath)) {
      const content = fs.readFileSync(licensePath, 'utf8');
      
      // Very simple license detection
      if (content.includes('MIT')) return 'MIT';
      if (content.includes('Apache License')) return 'Apache-2.0';
      if (content.includes('GNU GENERAL PUBLIC')) return 'GPL-3.0';
      
      return 'Other';
    }
  }
  
  return 'None';
}

function getRepoContents(repoPath, filePath, branch) {
  const fullPath = path.join(repoPath, filePath);
  
  // Check if path exists
  if (!fs.existsSync(fullPath)) {
    throw new Error('Path not found');
  }
  
  // Check if it's a directory
  const isDirectory = fs.statSync(fullPath).isDirectory();
  
  if (isDirectory) {
    // List directory contents
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    return entries.map(entry => {
      const entryPath = path.join(filePath, entry.name);
      
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: entryPath,
          type: 'dir',
          lastCommit: getLastCommitForPath(repoPath, entryPath)
        };
      } else {
        const stats = fs.statSync(path.join(repoPath, entryPath));
        
        return {
          name: entry.name,
          path: entryPath,
          type: 'file',
          size: stats.size,
          sha: '', // Would normally compute this
          lastCommit: getLastCommitForPath(repoPath, entryPath)
        };
      }
    });
  } else {
    // Return file content info
    const stats = fs.statSync(fullPath);
    
    return {
      name: path.basename(filePath),
      path: filePath,
      type: 'file',
      size: stats.size,
      sha: '', // Would normally compute this
      lastCommit: getLastCommitForPath(repoPath, filePath)
    };
  }
}

function getLastCommitForPath(repoPath, filePath) {
  try {
    // Use mgit log to get last commit for this file or directory
    const output = execSync(`mgit log -1 --format="%h|%an|%at|%s" -- "${filePath}"`, { 
      cwd: repoPath, 
      encoding: 'utf8' 
    });
    
    const [hash, author, timestamp, message] = output.trim().split('|');
    
    return {
      hash,
      message,
      author,
      date: new Date(parseInt(timestamp) * 1000).toISOString()
    };
  } catch (err) {
    console.error(`Error getting last commit for ${filePath}:`, err);
    
    // Return placeholder commit info
    return {
      hash: '',
      message: 'Unknown',
      author: 'Unknown',
      date: new Date().toISOString()
    };
  }
}

function getFileContent(repoPath, filePath, branch) {
  try {
    // First, ensure we're on the right branch
    execSync(`mgit checkout ${branch}`, { cwd: repoPath });
    
    // Read the file
    const fullPath = path.join(repoPath, filePath);
    return fs.readFileSync(fullPath);
  } catch (err) {
    console.error(`Error getting file content for ${filePath}:`, err);
    throw err;
  }
}

function isBinaryFile(extension) {
  // Common binary file extensions
  const binaryExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.pdf', '.doc', '.docx',
    '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.gz', '.tar', '.bin',
    '.exe', '.dll', '.so', '.o', '.class'
  ];
  
  return binaryExtensions.includes(extension);
}

function getCommitHistory(repoPath, branch, filePath) {
  try {
    // Create the git log command
    let command = 'mgit log --format="%h|%an|%ae|%at|%s"';
    
    if (branch) {
      command += ` ${branch}`;
    }
    
    if (filePath) {
      command += ` -- "${filePath}"`;
    }
    
    // Execute the command
    const output = execSync(command, { cwd: repoPath, encoding: 'utf8' });
    
    // Parse the output
    return output.split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        const [hash, author, email, timestamp, message] = line.split('|');
        
        // Look for mgit commit mapping if available
        let mgitHash = getMGitHash(repoPath, hash);
        
        return {
          hash: hash,
          mgitHash: mgitHash || null,
          author: {
            name: author,
            email: email
          },
          date: new Date(parseInt(timestamp) * 1000).toISOString(),
          message: message
        };
      });
  } catch (err) {
    console.error('Error getting commit history:', err);
    return [];
  }
}

function getCommitDetail(repoPath, sha) {
  try {
    // Get commit details
    const commitOutput = execSync(`mgit show --no-color --format="%H|%an|%ae|%at|%cn|%ce|%ct|%P|%B" ${sha}`, {
      cwd: repoPath,
      encoding: 'utf8'
    });
    
    const lines = commitOutput.split('\n');
    const headerLine = lines[0];
    const [hash, authorName, authorEmail, authorTimestamp, committerName, committerEmail, commitTimestamp, parents, ...messageParts] = headerLine.split('|');
    
    // The rest of the output is the diff
    const diffStart = commitOutput.indexOf('diff --git');
    const diff = diffStart >= 0 ? commitOutput.substring(diffStart) : '';
    
    // Check for nostr pubkey
    const nostrPubkey = getNostrPubkey(repoPath, hash);
    
    return {
      hash: hash,
      mgitHash: getMGitHash(repoPath, hash) || null,
      author: {
        name: authorName,
        email: authorEmail,
        date: new Date(parseInt(authorTimestamp) * 1000).toISOString(),
        nostrPubkey: nostrPubkey
      },
      committer: {
        name: committerName,
        email: committerEmail,
        date: new Date(parseInt(commitTimestamp) * 1000).toISOString()
      },
      message: messageParts.join('|').trim(),
      parents: parents.split(' ').filter(p => p.length > 0),
      diff: diff
    };
  } catch (err) {
    console.error(`Error getting commit detail for ${sha}:`, err);
    return null;
  }
}

function getMGitHash(repoPath, gitHash) {
  try {
    // Try to read the nostr_mappings.json file
    const mappingsPath = path.join(repoPath, '.mgit', 'nostr_mappings.json');
    
    if (!fs.existsSync(mappingsPath)) {
      return null;
    }
    
    const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    
    // Find the mapping for this git hash
    const mapping = mappings.find(m => m.GitHash === gitHash);
    
    return mapping ? mapping.MGitHash : null;
  } catch (err) {
    console.error(`Error getting MGit hash for ${gitHash}:`, err);
    return null;
  }
}

function getNostrPubkey(repoPath, gitHash) {
  try {
    // Try to read the nostr_mappings.json file
    const mappingsPath = path.join(repoPath, '.mgit', 'nostr_mappings.json');
    
    if (!fs.existsSync(mappingsPath)) {
      return null;
    }
    
    const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    
    // Find the mapping for this git hash
    const mapping = mappings.find(m => m.GitHash === gitHash);
    
    return mapping ? mapping.Pubkey : null;
  } catch (err) {
    console.error(`Error getting Nostr pubkey for ${gitHash}:`, err);
    return null;
  }
}

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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});