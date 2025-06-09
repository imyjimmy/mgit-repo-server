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
        localStorage.setItem('mgit_token', authToken);
        localStorage.setItem('mgit_pubkey', pubkey);
        
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
