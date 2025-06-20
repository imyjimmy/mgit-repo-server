// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM Loaded')
  // Add event listeners instead of inline onclick
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  
  let token = localStorage.getItem('nostr_token');
  let userPubkey = localStorage.getItem('nostr_pubkey');
  
  // Check if already logged in
  if (token && userPubkey) {
    const isValidToken = await validateToken(token);
    if (isValidToken) {
      showDashboard();
    } else {
      // Token is invalid, clear localStorage
      localStorage.removeItem('nostr_token');
      localStorage.removeItem('nostr_pubkey');
      showLanding();
    }
  }  
});

async function validateToken(token) {
  try {
    const response = await fetch('/api/auth/validate', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Token validation failed:', error);
    return false;
  }
}

// Add this function to load existing repositories
async function loadExistingRepositories() {
  const token = localStorage.getItem('nostr_token');
  const pubkey = localStorage.getItem('nostr_pubkey');
  
  console.log('🔍 Loading existing repositories...');
  console.log('Token exists:', !!token);
  console.log('Pubkey exists:', !!pubkey);
  
  if (!token || !pubkey) {
    console.error('No token or pubkey found');
    return;
  }

  try {
    console.log('📡 Calling /api/user/repositories...');
    const response = await fetch('/api/user/repositories', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Response status:', response.status);
    
    if (response.ok) {
      const repositories = await response.json();
      console.log('📁 Found repositories:', repositories);
      displayRepositories(repositories);
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to load repositories:', response.status, errorText);
      document.getElementById('reposList').innerHTML = `<p>Error loading repositories: ${response.status}</p>`;
    }
  } catch (error) {
    console.error('💥 Network error loading repositories:', error);
    document.getElementById('reposList').innerHTML = '<p>Network error loading repositories.</p>';
  }
}

// Display repositories in the UI
function displayRepositories(repositories) {
  const reposList = document.getElementById('reposList');
  
  if (!repositories || repositories.length === 0) {
    reposList.innerHTML = '<p>No repositories found. Create your first repository below!</p>';
    return;
  }

  let html = '';
  repositories.forEach(repo => {
    html += `
      <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; background-color: #f9f9f9;">
        <h3>${repo.name}</h3>
        <p><strong>Created:</strong> ${new Date(repo.created).toLocaleDateString()}</p>
        <p><strong>Description:</strong> ${repo.description || 'No description'}</p>
        <p><strong>Access Level:</strong> ${repo.access}</p>
        
        <div style="margin: 15px 0;">
          <button onclick="generateExistingQR('${repo.name}')" 
                  style="padding: 8px 16px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
            📱 Generate QR Code
          </button>
          <div class="jwt-section">
            <label><strong>JWT Token:</strong></label>
            <textarea readonly class="jwt-display">${localStorage.getItem('nostr_token') || 'No token available'}</textarea>
          </div>
        </div>
        
        <div id="qr-${repo.name}" style="margin: 15px 0; text-align: center;">
          <!-- QR code will appear here -->
        </div>
        
        <div id="debug-${repo.name}" style="margin: 15px 0;">
          <!-- Debug command will appear here -->
        </div>
      </div>
    `;
  });
  
  reposList.innerHTML = html;
}

// Generate QR code for existing repository
async function generateExistingQR(repoName) {
  const token = localStorage.getItem('nostr_token');
  
  try {
    const response = await fetch(`/api/qr/clone/${repoName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const svgText = await response.text();
      document.getElementById(`qr-${repoName}`).innerHTML = svgText;

      // Show debug command
      const debugCommand = `mgit clone -jwt "${token}" "https://plebemr.com/api/mgit/repos/${repoName}"`;
      document.getElementById(`debug-${repoName}`).innerHTML = `
        <h4>Debug Command:</h4>
        <code style="background: #f0f0f0; padding: 10px; display: block; margin: 10px 0; word-break: break-all; font-size: 12px;">
          ${debugCommand}
        </code>
        <p><em>Copy and run this command in terminal to test mgit clone manually</em></p>
      `;
      
      showMessage(`QR code generated for ${repoName}!`, 'success');
    } else {
      document.getElementById(`qr-${repoName}`).innerHTML = '<p>Error generating QR code</p>';
    }
  } catch (error) {
    console.error('QR code generation failed:', error);
    document.getElementById(`qr-${repoName}`).innerHTML = '<p>QR code unavailable</p>';
  }
}

// Copy clone command to clipboard
async function copyCloneCommand(repoName) {
  const token = localStorage.getItem('nostr_token');
  const command = `mgit clone -jwt "${token}" "https://plebemr.com/api/mgit/repos/${repoName}"`;
  
  try {
    await navigator.clipboard.writeText(command);
    showMessage(`Clone command copied to clipboard for ${repoName}!`, 'success');
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    showMessage('Failed to copy to clipboard', 'error');
  }
}

// Create repository functionality
document.getElementById('createRepoBtn').addEventListener('click', async () => {
  const repoName = document.getElementById('repoName').value.trim();
  const userName = document.getElementById('userName').value.trim();
  const userEmail = document.getElementById('userEmail').value.trim();
  const token = localStorage.getItem('nostr_token');
  
  console.log('test: ', /^[a-zA-Z0-9\s\-_]+$/.test(repoName), repoName);
  // Allow letters, numbers, spaces, hyphens, and underscores
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(repoName)) {
    console.log('another test:', !/^[a-zA-Z0-9\s\-_]+$/.test(repoName));
    alert('Repository name can only contain letters, numbers, spaces, hyphens, and underscores');
    return;
  }

  const normalizedRepoName = repoName.toLowerCase().replace(/\s+/g, '-');
  
  // Show user what the repo will be named (like GitHub does)
  if (normalizedRepoName !== repoName.toLowerCase()) {
    if (!confirm(`Your new repository will be created as "${normalizedRepoName}". Continue?`)) {
      return;
    }
  }

  if (!repoName) {
    alert('Please enter a name for your Medical Binder');
    return;
  }

  if (!userName) {
    alert('Please enter your name');
    return;
  }

  if (!userEmail) {
    alert('Please enter your email');
    return;
  }
  
  if (!token) {
    alert('Please authenticate first');
    return;
  }
  
  try {
    const response = await fetch('/api/mgit/repos/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        repoName: normalizedRepoName,
        userName,
        userEmail,
        description: `Medical records of ${document.getElementById('userName').value.trim()}, email: ${document.getElementById('userEmail').value.trim()}`,
      })
    });
    
    const result = await response.json();
    const resultDiv = document.getElementById('repoResult');
    
    if (response.ok) {
      // Show the repository view with QR code
      document.getElementById('repoView').classList.remove('hidden');
      document.querySelector('#repoView h1').textContent = `Repository: ${result.repoId}`;
      
      // Generate QR code
      generateQRCode(result.repoId, token);
      
      resultDiv.innerHTML = `
            <h3>✅ Repository Created Successfully!</h3>
            <p><strong>Repository ID:</strong> ${result.repoId}</p>
            <p>Scroll down to see your repository access options.</p>
        `;
      resultDiv.style.backgroundColor = '#d4edda';
      resultDiv.style.color = '#155724';
    } else {
      resultDiv.innerHTML = `
              <h3>❌ Repository Creation Failed</h3>
              <p><strong>Error:</strong> ${result.reason || 'Unknown error'}</p>
          `;
      resultDiv.style.backgroundColor = '#f8d7da';
      resultDiv.style.color = '#721c24';
    }
    
    resultDiv.style.display = 'block';
  } catch (error) {
    document.getElementById('repoResult').innerHTML = `
        <h3>❌ Request Failed</h3>
        <p><strong>Error:</strong> ${error.message}</p>
      `;
    document.getElementById('repoResult').style.display = 'block';
    document.getElementById('repoResult').style.backgroundColor = '#f8d7da';
    document.getElementById('repoResult').style.color = '#721c24';
  }
});

async function login() {
  try {
    console.log('LOGIN!!!')
    // Get challenge
    const challengeRes = await fetch('/api/auth/nostr/challenge', { method: 'POST' });
    const { challenge } = await challengeRes.json();
    
    // Sign with Nostr extension
    if (!window.nostr) {
      showMessage('Please install a Nostr browser extension like nos2x', 'error');
      return;
    }
    
    const signedEvent = await window.nostr.signEvent({
      kind: 1,
      content: challenge,
      tags: [['challenge', challenge]],
      created_at: Math.floor(Date.now() / 1000)
    });
    
    // Verify signature
    const verifyRes = await fetch('/api/auth/nostr/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedEvent })
    });
    
    const { status, token: authToken, pubkey } = await verifyRes.json();
    
    if (status === 'OK') {
      // Register user
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ profile: { name: 'User' } })
      });
      
      console.log('Register response status:', registerRes.status);
      const registerData = await registerRes.json();
      console.log('Register response data:', registerData);
      
      if (!registerRes.ok) {
        throw new Error(`Registration failed: ${registerData.reason || 'Unknown error'}`);
      }
      
      // Store credentials
      localStorage.setItem('nostr_token', authToken);
      localStorage.setItem('nostr_pubkey', pubkey);
      
      showDashboard();
      showMessage('Login successful!', 'success');
    }
  } catch (error) {
    showMessage('Login failed: ' + error.message, 'error');
  }
}

function logout() {
  localStorage.removeItem('nostr_token');
  localStorage.removeItem('nostr_pubkey');
  showLanding();
  showMessage('Logged out', 'success');
}

function showDashboard() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Show existing repositories section
  document.getElementById('existingRepos').classList.remove('hidden');
  
  // Load existing repositories
  loadExistingRepositories();
}

function showLanding() {
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

function showMessage(text, type) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = type;
  setTimeout(() => msg.textContent = '', 3000);
}

async function generateQRCode(repoId, token) {
  try {
    const response = await fetch(`/api/qr/clone/${repoId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const svgText = await response.text();
      document.getElementById('qrCode').innerHTML = svgText;

      // Show the debug command
      const debugCommand = `mgit clone -jwt "${token}" "http://localhost:3003/${repoId}"`;
      document.getElementById('debugCommand').innerHTML = `
        <h3>Debug Command:</h3>
        <code style="background: #f0f0f0; padding: 10px; display: block; margin: 10px 0; word-break: break-all;">
          ${debugCommand}
        </code>
        <p><em>Copy and run this command in terminal to test mgit clone manually</em></p>
      `;
    } else {
      document.getElementById('qrCode').innerHTML = '<p>Error generating QR code</p>';
    }
  } catch (error) {
    console.error('QR code generation failed:', error);
    document.getElementById('qrCode').innerHTML = '<p>QR code unavailable</p>';
  }
}
