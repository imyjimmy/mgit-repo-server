// provider-endpoints.js
const crypto = require('crypto');

// Cache for one-time login tokens
const loginTokenCache = new Map();

function setupProviderEndpoints(app, validateAuthToken) {
    app.post('/api/appointments/register-provider', validateAuthToken, async (req, res) => {
    try {
      const userPubkey = req.user.pubkey;
      const { firstName, lastName, email, phone, specialties } = req.body;
      
      // Check if user already exists as provider
      const existingProvider = await checkExistingProvider(userPubkey);
      if (existingProvider) {
        return res.json({
          success: true,
          message: 'Already registered as provider',
          providerId: existingProvider.id
        });
      }

      // Connect to EasyAppointments database
      const appointmentsDb = await mysql.createConnection({
        host: 'mgitreposerver-mgit-repo-server_appointments_mysql_1',
        user: 'user',
        password: 'password',
        database: 'easyappointments'
      });

      // Create provider user account in EasyAppointments
      const [result] = await appointmentsDb.execute(
        `INSERT INTO ea_users (first_name, last_name, email, phone_number, nostr_pubkey, id_roles, create_datetime, update_datetime) 
        VALUES (?, ?, ?, ?, ?, 2, NOW(), NOW())`,
        [firstName, lastName, email, phone || '', userPubkey]
      );

      const providerId = result.insertId;

      await appointmentsDb.end();

      res.json({
        success: true,
        message: 'Successfully registered as provider',
        providerId: providerId,
        email: email
      });

    } catch (error) {
      console.error('Provider registration error:', error);
      res.status(500).json({
        error: 'Failed to register as provider',
        details: error.message
      });
    }
  });
  
  // Generate auto-login URL for EasyAppointments dashboard
  app.post('/api/appointments/dashboard-login', validateAuthToken, async (req, res) => {
    try {
      const userPubkey = req.user.pubkey;
      
      // Check if user is a registered provider
      const provider = await checkExistingProvider(userPubkey);
      if (!provider) {
        return res.status(403).json({ 
          error: 'Not registered as provider',
          needsRegistration: true
        });
      }

      // Generate a one-time login token
      const loginToken = crypto.randomBytes(32).toString('hex');
      
      // Store in temporary cache (expires in 2 minutes)
      loginTokenCache.set(loginToken, {
        nostrPubkey: userPubkey,
        expires: Date.now() + (2 * 60 * 1000)
      });

      // Return auto-login URL
      const autoLoginUrl = `https://appointments.plebemr.com/providers/nostr_login?token=${loginToken}`;
      
      res.json({
        success: true,
        loginUrl: autoLoginUrl,
        message: 'Click to access your provider dashboard'
      });

    } catch (error) {
      console.error('Dashboard login error:', error);
      res.status(500).json({ error: 'Failed to generate dashboard login' });
    }
  });

  // Endpoint for EasyAppointments to validate the login token
  app.post('/api/appointments/validate-login-token', async (req, res) => {
    try {
      const { token } = req.body;
      
      const tokenData = loginTokenCache.get(token);
      if (!tokenData || tokenData.expires < Date.now()) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Remove token (one-time use)
      loginTokenCache.delete(token);

      // Get provider's EasyAppointments credentials
      const mysql = require('mysql2/promise');
      const appointmentsDb = await mysql.createConnection({
        host: 'mgitreposerver-mgit-repo-server_appointments_mysql_1',
        user: 'user',
        password: 'password',
        database: 'easyappointments'
      });
      
      const [rows] = await appointmentsDb.execute(
        'SELECT id, email, first_name, last_name FROM ea_users WHERE nostr_pubkey = ? AND id_roles = 2',
        [tokenData.nostrPubkey]
      );
      
      await appointmentsDb.end();
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      res.json({
        success: true,
        provider: {
          id: rows[0].id,
          email: rows[0].email,
          firstName: rows[0].first_name,
          lastName: rows[0].last_name
        }
      });

    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({ error: 'Token validation failed' });
    }
  });
}

async function checkExistingProvider(nostrPubkey) {
  const mysql = require('mysql2/promise');
  const appointmentsDb = await mysql.createConnection({
    host: 'mgitreposerver-mgit-repo-server_appointments_mysql_1',
    user: 'user',
    password: 'password',
    database: 'easyappointments'
  });
  
  const [rows] = await appointmentsDb.execute(
    'SELECT id FROM ea_users WHERE nostr_pubkey = ? AND id_roles = 2',
    [nostrPubkey]
  );
  
  await appointmentsDb.end();
  return rows.length > 0 ? rows[0] : null;
}

module.exports = { setupProviderEndpoints };