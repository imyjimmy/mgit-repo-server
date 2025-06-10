// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM Loaded')
  // Add event listeners instead of inline onclick
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  
  let token = localStorage.getItem('mgit_token');
  let userPubkey = localStorage.getItem('mgit_pubkey');

  // Check if already logged in
  if (token && userPubkey) {
      showDashboard();
  }
  
});

// Create repository functionality
document.getElementById('createRepoBtn').addEventListener('click', async () => {
    const repoName = document.getElementById('repoName').value.trim();
    const repoDescription = document.getElementById('repoDescription').value.trim();
    const token = localStorage.getItem('nostr_token');

    if (!repoName) {
        alert('Please enter a repository name');
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
                repoName: repoName,
                description: repoDescription || 'Personal medical history repository'
            })
        });

        const result = await response.json();
        const resultDiv = document.getElementById('repoResult');

        if (response.ok) {
            resultDiv.innerHTML = `
                <h3>✅ Repository Created Successfully!</h3>
                <p><strong>Repository ID:</strong> ${result.repoId}</p>
                <p><strong>Clone URL:</strong> ${result.cloneUrl}</p>
                <p><strong>Clone Command:</strong></p>
                <code style="background-color: #e9ecef; padding: 5px; border-radius: 3px;">
                    mgit clone -jwt ${token.substring(0, 20)}... ${result.cloneUrl}
                </code>
                <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    Your medical repository is ready! You can now clone it using the MGit CLI.
                </p>
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
    localStorage.removeItem('mgit_token');
    localStorage.removeItem('mgit_pubkey');
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
