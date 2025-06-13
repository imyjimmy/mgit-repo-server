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

// Create repository functionality
document.getElementById('createRepoBtn').addEventListener('click', async () => {
  const repoName = document.getElementById('repoName').value.trim();
  const userName = document.getElementById('userName').value.trim();
  const userEmail = document.getElementById('userEmail').value.trim();
  const token = localStorage.getItem('nostr_token');
  
  // Validate repository name format
  const validateRepoName = repoName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
  if (validateRepoName !== repoName.toLowerCase().replace(/\s+/g, '-')) {
    alert('Repository name can only contain letters, numbers, and spaces');
    return;
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
        repoName: document.getElementById('repoDisplayName').value.trim(),
        userName: document.getElementById('userName').value.trim(),
        userEmail: document.getElementById('userEmail').value.trim(),
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
    } else {
      document.getElementById('qrCode').innerHTML = '<p>Error generating QR code</p>';
    }
  } catch (error) {
    console.error('QR code generation failed:', error);
    document.getElementById('qrCode').innerHTML = '<p>QR code unavailable</p>';
  }
}
