// provider-endpoints.js
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { pool } = require('./db-config');
const utils = require('./utils');

// Cache for one-time login tokens
const loginTokenCache = new Map();

const getEasyAppointmentsUrl = () => {
  // Check if we're in development environment
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:8080';
  }
  
  // Production URL
  return 'https://appointments.plebemr.com';
};

const getMySQLHost = () => {
  // Check if we're in development environment
  if (process.env.NODE_ENV !== 'production') {
    return 'mgit-repo-server_appointments_mysql_1';  // macOS container name
  }
  
  // Production hostname
  return 'mgitreposerver-mgit-repo-server_appointments_mysql_1';  // Umbrel container name
};

function setupProviderEndpoints(app, validateAuthToken) {
    // Get all providers - PUBLIC endpoint
  app.get('/api/admin/providers', async (req, res) => {
    try {
      // Connect to EasyAppointments database
      const appointmentsDb = await mysql.createConnection({
        host: getMySQLHost(),
        user: 'user',
        password: 'password',
        database: 'easyappointments'
      });

      // role = 5 is admin-provider
      const [providers] = await appointmentsDb.execute(
        'SELECT id, first_name, last_name, email, id_roles FROM users WHERE id_roles in (2,5)'
      );
      
      const formattedProviders = providers.map(provider => ({
        id: provider.id.toString(),
        name: `${provider.first_name} ${provider.last_name}`,
        email: provider.email,
        role: provider.id_roles === 2 ? 'provider' : 'admin-provider'
      }));

      await appointmentsDb.end();
      res.json(formattedProviders);
    } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({ error: 'Failed to fetch providers' });
    }
  });

  // Get services for a specific provider - PUBLIC endpoint  
  app.get('/api/admin/providers/:providerId/services', async (req, res) => {
    console.log('GET /api/admin/providers/:providerId/services');
    try {
      const { providerId } = req.params;
      
      // Connect to EasyAppointments database
      const appointmentsDb = await mysql.createConnection({
        host: getMySQLHost(),
        user: 'user',
        password: 'password',
        database: 'easyappointments'
      });
      
      const [services] = await appointmentsDb.execute(`
        SELECT s.id, s.name, s.duration, s.price, s.description
        FROM services s
        INNER JOIN services_providers sp ON s.id = sp.id_services
        WHERE sp.id_users = ? AND s.is_private = 0
      `, [providerId]);
      
      const formattedServices = services.map(service => ({
        id: service.id.toString(),
        name: service.name,
        duration: service.duration,
        price: service.price || '0'
      }));

      await appointmentsDb.end();
      res.json(formattedServices);
    } catch (error) {
      console.error('Error fetching services for provider:', error);
      res.status(500).json({ error: 'Failed to fetch services' });
    }
  });

  // Get available time slots for a provider on a specific date - PUBLIC endpoint
  app.get('/api/providers/:providerId/availability', async (req, res) => {
    console.log('GET /api/providers/:providerId/availability');
    
    let connection;
    try {
      const { providerId } = req.params;
      const { serviceId, date } = req.query;
      
      if (!serviceId || !date) {
        return res.status(400).json({ 
          error: 'Missing required parameters: serviceId, date' 
        });
      }

      connection = await pool.getConnection();

      // Get basic provider data
      const [providers] = await connection.execute(`
        SELECT id, first_name, last_name, timezone
        FROM users 
        WHERE id = ?
      `, [providerId]);

      if (providers.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const provider = providers[0];

      // Get company working plan from settings
      const [workingPlanRows] = await connection.execute(`
        SELECT value FROM settings WHERE name = 'company_working_plan'
      `);

      // Get service data
      const [services] = await connection.execute(`
        SELECT id, name, duration, availabilities_type, attendants_number
        FROM services 
        WHERE id = ?
      `, [serviceId]);

      if (services.length === 0) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const service = services[0];

      // Get existing appointments for this date and provider
      const [appointments] = await connection.execute(`
        SELECT start_datetime, end_datetime, is_unavailability
        FROM appointments 
        WHERE id_users_provider = ? 
        AND DATE(start_datetime) <= ? 
        AND DATE(end_datetime) >= ?
      `, [providerId, date, date]);

      // Build provider object with working plan
      const workingPlan = workingPlanRows.length > 0 ? workingPlanRows[0].value : null;
      const providerWithPlan = {
        ...provider,
        settings: {
          working_plan: workingPlan,
          working_plan_exceptions: '{}' // No exceptions for now
        }
      };

      console.log('🔍 Working plan:', workingPlan);

      // Calculate available hours
      const availableHours = utils.calculateAvailableHours(date, service, providerWithPlan, appointments);

      res.json({
        date,
        providerId,
        serviceId,
        providerName: `${provider.first_name} ${provider.last_name}`,
        serviceName: service.name,
        serviceDuration: service.duration,
        availableHours
      });

    } catch (error) {
      console.error('Error fetching provider availability:', error);
      res.status(500).json({ error: 'Failed to fetch availability' });
    } finally {
      if (connection) connection.release();
    }
  });

  // creates an appointment
  app.post('/api/appointments/verify-booking', async (req, res) => {
    const { bookingData, signedEvent } = req.body;
  
    try {
      console.log('=== BOOKING VERIFICATION DEBUG ===');
      console.log('Received bookingData:', JSON.stringify(bookingData, null, 2));
      console.log('Received signedEvent:', JSON.stringify(signedEvent, null, 2));
      
      // Import necessary Nostr verification functions
      const { validateEvent, verifyEvent } = require('nostr-tools/pure');
      
      // 1. Verify the Nostr event signature
      if (!validateEvent(signedEvent) || !verifyEvent(signedEvent)) {
        console.log('❌ Signature validation failed');
        return res.status(400).json({ 
          status: 'error', 
          reason: 'Invalid signature' 
        });
      }
      console.log('✅ Signature validation passed');

      // 2. Verify the signed content matches the booking data
      const expectedContent = JSON.stringify(bookingData);
      console.log('Expected content:', expectedContent);
      console.log('Signed content:', signedEvent.content);
      console.log('Contents match:', expectedContent === signedEvent.content);
      
      if (signedEvent.content !== expectedContent) {
        console.log('❌ Content mismatch detected');
        return res.status(400).json({ 
          status: 'error', 
          reason: 'Signed content does not match booking data' 
        });
      }
      console.log('✅ Content verification passed');
      console.log('signedEvent pubkey bech32: ', utils.hexToBech32(signedEvent.pubkey));

      // 3. Create appointment using connection pool
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // First, check if customer exists or create one
        let customerId;
        const [existingCustomers] = await connection.execute(
          'SELECT u.id FROM users u JOIN roles r ON u.id_roles = r.id WHERE u.notes = ? AND r.slug = "customer"',
          [signedEvent.pubkey]
        );

        if (existingCustomers.length > 0) {
          customerId = existingCustomers[0].id;
        } else {
          // Create new customer user
          const [customerRole] = await connection.execute(
            'SELECT id FROM roles WHERE slug = "customer"'
          );
          
          if (customerRole.length === 0) {
            throw new Error('Customer role not found');
          }

          const [customerResult] = await connection.execute(
            `INSERT INTO users (id_roles, first_name, last_name, email, phone_number, nostr_pubkey, create_datetime, update_datetime) 
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              customerRole[0].id,
              bookingData.patientInfo.firstName,
              bookingData.patientInfo.lastName,
              bookingData.patientInfo.email || null,
              bookingData.patientInfo.phone || null,
              signedEvent.pubkey
            ]
          );
          
          customerId = customerResult.insertId;
        }

        // Get service duration for end_datetime calculation
        const [serviceResult] = await connection.execute(
          'SELECT duration FROM services WHERE id = ?',
          [bookingData.serviceId]
        );
        
        if (serviceResult.length === 0) {
          throw new Error('Service not found');
        }

        const durationMinutes = serviceResult[0].duration;
        const startTime = new Date(bookingData.startTime);
        const endTime = new Date(startTime.getTime() + (durationMinutes * 60000));

        // Create appointment
        const [appointmentResult] = await connection.execute(
          `INSERT INTO appointments (
            id_users_provider, id_users_customer, id_services, 
            start_datetime, end_datetime, notes, 
            book_datetime, create_datetime, update_datetime, hash
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), ?)`,
          [
            bookingData.providerId,
            customerId,
            bookingData.serviceId,
            startTime.toISOString().slice(0, 19).replace('T', ' '),
            endTime.toISOString().slice(0, 19).replace('T', ' '),
            bookingData.patientInfo.notes || null,
            Math.random().toString(36).substring(7) // Simple hash
          ]
        );

        await connection.commit();

        res.json({ 
          status: 'OK',
          appointmentId: appointmentResult.insertId,
          message: 'Appointment created successfully'
        });
        
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error('Booking verification error:', error);
      res.status(500).json({ 
        status: 'error', 
        reason: error.message || 'Verification failed' 
      });
    }
  });

  // app.post('/api/appointments/register-provider', validateAuthToken, async (req, res) => {
  //   try {
  //     const userPubkey = req.user.pubkey;
  //     const { firstName, lastName, email, phone, specialties } = req.body;
      
  //     // Check if user already exists as provider
  //     const existingProvider = await checkExistingProvider(userPubkey);
  //     if (existingProvider) {
  //       return res.json({
  //         success: true,
  //         message: 'Already registered as provider',
  //         providerId: existingProvider.id
  //       });
  //     }

  //     // Connect to EasyAppointments database
  //     const appointmentsDb = await mysql.createConnection({
  //       host: getMySQLHost(),
  //       user: 'user',
  //       password: 'password',
  //       database: 'easyappointments'
  //     });

  //     // Create provider user account in EasyAppointments
  //     const [result] = await appointmentsDb.execute(
  //       `INSERT INTO users (first_name, last_name, email, phone_number, nostr_pubkey, id_roles, create_datetime, update_datetime) 
  //       VALUES (?, ?, ?, ?, ?, 2, NOW(), NOW())`,
  //       [firstName, lastName, email, phone || '', userPubkey]
  //     );

  //     const providerId = result.insertId;

  //     await appointmentsDb.end();

  //     res.json({
  //       success: true,
  //       message: 'Successfully registered as provider',
  //       providerId: providerId,
  //       email: email
  //     });

  //   } catch (error) {
  //     console.error('Provider registration error:', error);
  //     res.status(500).json({
  //       error: 'Failed to register as provider',
  //       details: error.message
  //     });
  //   }
  // });

  // Generate auto-login URL for EasyAppointments dashboard
  app.post('/api/appointments/dashboard-login', validateAuthToken, async (req, res) => {
    try {
      const { pubkey } = req.user; // From validated JWT
      
      // Check if provider exists in EasyAppointments
      // const provider = await checkProviderExists(pubkey);
      
      // if (!provider) {
      //   return res.status(403).json({ 
      //     success: false, 
      //     error: 'Not registered as provider' 
      //   });
      // }
      
      // Create a one-time login token for the handoff
      const loginToken = generateLoginToken(pubkey);
      
      // Return the EasyAppointments login URL
      const loginUrl = `/providers_nostr/nostr_login?token=${loginToken}`;
      
      res.json({
        success: true,
        loginUrl: loginUrl
      });
      
    } catch (error) {
      console.error('Dashboard login error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
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
      // const mysql = require('mysql2/promise');
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(
        'SELECT id, email, first_name, last_name FROM users WHERE nostr_pubkey = ? AND id_roles = 2',
        [tokenData.nostrPubkey]
      );
      
      connection.release();
      
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
  
  app.get('/api/admin/database-test', validateAuthToken, async (req, res) => {
    try {
      console.log('Testing database connection...');
      
      // Test basic connection
      const connection = await pool.getConnection();
      console.log('✅ Database connection successful');
      
      // Test query - get users count and sample data
      const [rows] = await connection.execute('SELECT COUNT(*) as user_count FROM users');
      const userCount = rows[0].user_count;
      
      // Get sample user data (excluding sensitive info)
      const [sampleUsers] = await connection.execute(`
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          timezone, 
          language,
          id_roles,
          create_datetime
        FROM users 
        LIMIT 5
      `);
      
      // Get roles data to understand user types
      const [roles] = await connection.execute('SELECT id, name, slug FROM roles');
      
      connection.release();
      
      res.json({
        status: 'success',
        message: 'Database connection successful',
        data: {
          userCount,
          sampleUsers,
          roles,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        error: error.message
      });
    }
  });

  // User lookup by Nostr pubkey
  app.get('/api/admin/user-lookup/:pubkey', validateAuthToken, async (req, res) => {
    try {
      const { pubkey } = req.params;
      console.log('Looking up user by pubkey:', pubkey);
      
      const connection = await pool.getConnection();
      
      // Query for user with matching nostr_pubkey (hex format)
      const [rows] = await connection.execute(`
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          timezone, 
          language,
          id_roles,
          nostr_pubkey,
          create_datetime,
          update_datetime
        FROM users 
        WHERE nostr_pubkey = ?
      `, [pubkey]);
      
      connection.release();
      
      if (rows.length > 0) {
        // User found
        const user = rows[0];
        
        // Get role information
        const roleConnection = await pool.getConnection();
        const [roleRows] = await roleConnection.execute(`
          SELECT id, name, slug FROM roles WHERE id = ?
        `, [user.id_roles]);
        roleConnection.release();
        
        res.json({
          status: 'success',
          userFound: true,
          user: {
            ...user,
            role: roleRows[0] || null
          }
        });
      } else {
        // User not found
        res.json({
          status: 'success',
          userFound: false,
          message: 'No user found with this Nostr pubkey'
        });
      }
      
    } catch (error) {
      console.error('❌ User lookup failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'User lookup failed',
        error: error.message
      });
    }
  });

  // User registration endpoint
  app.post('/api/admin/register-user', validateAuthToken, async (req, res) => {
    try {
      const { firstName, lastName, email, phoneNumber } = req.body;
      const { pubkey } = req.user; // From JWT token
      
      console.log('Registering new user:', { firstName, lastName, email, phoneNumber, pubkey });
      
      // Validate required fields
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          status: 'error',
          message: 'First name, last name, and email are required'
        });
      }
      
      const connection = await pool.getConnection();
      
      // Check if user with this email already exists
      const [existingUsers] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [email]
      );
      
      if (existingUsers.length > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'A user with this email already exists'
        });
      }
      
      // Check if user with this pubkey already exists
      const [existingPubkey] = await connection.execute(
        'SELECT id, email FROM users WHERE nostr_pubkey = ?',
        [pubkey]
      );
      
      if (existingPubkey.length > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'This Nostr identity is already registered'
        });
      }
      
      // Get the admin role ID (assuming role ID 5 is admin based on your sample data)
      // You might want to make this configurable
      const [roleRows] = await connection.execute(
        'SELECT id FROM roles WHERE slug = ? OR name = ? LIMIT 1',
        ['admin-provider', 'Admin Provider']
      );
      
      const roleId = roleRows.length > 0 ? roleRows[0].id : 5; // Default to 5 if no role found
      
      // Insert new user
      const [result] = await connection.execute(`
        INSERT INTO users (
          create_datetime,
          update_datetime, 
          first_name,
          last_name,
          email,
          phone_number,
          timezone,
          language,
          nostr_pubkey,
          id_roles
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '), // create_datetime
        new Date().toISOString().slice(0, 19).replace('T', ' '), // update_datetime
        firstName,
        lastName,
        email,
        phoneNumber || null,
        'UTC', // Default timezone
        'english', // Default language
        pubkey, // nostr_pubkey
        roleId // id_roles
      ]);
      
      const newUserId = result.insertId;
      
      // Get the newly created user with role info
      const [newUserRows] = await connection.execute(`
        SELECT 
          u.id, 
          u.first_name, 
          u.last_name, 
          u.email, 
          u.phone_number,
          u.timezone, 
          u.language,
          u.id_roles,
          u.nostr_pubkey,
          u.create_datetime,
          r.name as role_name,
          r.slug as role_slug
        FROM users u
        LEFT JOIN roles r ON u.id_roles = r.id
        WHERE u.id = ?
      `, [newUserId]);
      
      connection.release();
      
      const newUser = newUserRows[0];
      
      console.log('✅ User registered successfully:', newUser);
      
      res.json({
        status: 'success',
        message: 'User registered successfully',
        user: {
          id: newUser.id,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          email: newUser.email,
          phone_number: newUser.phone_number,
          timezone: newUser.timezone,
          language: newUser.language,
          id_roles: newUser.id_roles,
          nostr_pubkey: newUser.nostr_pubkey,
          role: {
            id: newUser.id_roles,
            name: newUser.role_name,
            slug: newUser.role_slug
          }
        }
      });
      
    } catch (error) {
      console.error('❌ User registration failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'User registration failed',
        error: error.message
      });
    }
  });

  // Service management endpoints
  app.get('/api/admin/services', validateAuthToken, async (req, res) => {
    try {
      const connection = await pool.getConnection();
      
      // Get all services with category information
      const [services] = await connection.execute(`
        SELECT 
          s.*,
          sc.name as category_name
        FROM services s
        LEFT JOIN service_categories sc ON s.id_service_categories = sc.id
        ORDER BY s.name
      `);
      
      connection.release();
      
      res.json({
        status: 'success',
        services: services
      });
      
    } catch (error) {
      console.error('❌ Failed to load services:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to load services',
        error: error.message
      });
    }
  });

  // Get service categories
  app.get('/api/admin/service-categories', validateAuthToken, async (req, res) => {
    try {
      const connection = await pool.getConnection();
      
      const [categories] = await connection.execute(`
        SELECT id, name, description
        FROM service_categories
        ORDER BY name
      `);
      
      connection.release();
      
      res.json({
        status: 'success',
        categories: categories
      });
      
    } catch (error) {
      console.error('❌ Failed to load service categories:', error);
      res.status(500).json({
        status: 'success', // Don't fail if categories don't exist
        categories: []
      });
    }
  });

  // Create new service
  app.post('/api/admin/services', validateAuthToken, async (req, res) => {
    try {
      const {
        name,
        duration,
        price,
        currency,
        description,
        location,
        color,
        availabilities_type,
        attendants_number,
        id_service_categories,
        is_private
      } = req.body;
      
      // Validation
      if (!name || !duration) {
        return res.status(400).json({
          status: 'error',
          message: 'Service name and duration are required'
        });
      }
      
      const connection = await pool.getConnection();
      
      const [result] = await connection.execute(`
        INSERT INTO services (
          create_datetime,
          update_datetime,
          name,
          duration,
          price,
          currency,
          description,
          location,
          color,
          availabilities_type,
          attendants_number,
          id_service_categories
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        name,
        duration,
        price || 0,
        currency || 'USD',
        description || '',
        location || '',
        color || '#3fbd5e',
        availabilities_type || 'flexible',
        attendants_number || 1,
        id_service_categories || null
      ]);
      
      const serviceId = result.insertId;

      // Get current user ID from users table using nostr_pubkey
      const [userRows] = await connection.execute(`
        SELECT id FROM users WHERE nostr_pubkey = ?
      `, [req.user.pubkey]);

      if (userRows.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'User not found in database'
        });
      }

      console.log('POST /api/admin/services got users: ', userRows);

      const currentUserId = userRows[0].id;

      // Insert into services_providers table
      await connection.execute(`
        INSERT INTO services_providers (id_users, id_services) 
        VALUES (?, ?)
      `, [currentUserId, serviceId]);
      
      // Commit transaction
      await connection.commit();

      connection.release();
      
      res.json({
        status: 'success',
        message: 'Service created successfully',
        service_id: result.insertId
      });
      
    } catch (error) {
      console.error('❌ Failed to create service:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create service',
        error: error.message
      });
    }
  });

  // Update service
  app.put('/api/admin/services/:id', validateAuthToken, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        duration,
        price,
        currency,
        description,
        location,
        color,
        availabilities_type,
        attendants_number,
        id_service_categories,
        is_private
      } = req.body;
      
      // Validation
      if (!name || !duration) {
        return res.status(400).json({
          status: 'error',
          message: 'Service name and duration are required'
        });
      }
      
      const connection = await pool.getConnection();
      
      const [result] = await connection.execute(`
        UPDATE services SET
          update_datetime = ?,
          name = ?,
          duration = ?,
          price = ?,
          currency = ?,
          description = ?,
          location = ?,
          color = ?,
          availabilities_type = ?,
          attendants_number = ?,
          id_service_categories = ?
        WHERE id = ?
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        name,
        duration,
        price || 0,
        currency || 'USD',
        description || '',
        location || '',
        color || '#3fbd5e',
        availabilities_type || 'flexible',
        attendants_number || 1,
        id_service_categories || null,
        id
      ]);
      
      connection.release();
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Service not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Service updated successfully'
      });
      
    } catch (error) {
      console.error('❌ Failed to update service:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update service',
        error: error.message
      });
    }
  });

  // Delete service
  app.delete('/api/admin/services/:id', validateAuthToken, async (req, res) => {
    try {
      const { id } = req.params;
      
      const connection = await pool.getConnection();
      
      // Check if service has any appointments
      const [appointments] = await connection.execute(
        'SELECT COUNT(*) as count FROM appointments WHERE id_services = ?',
        [id]
      );
      
      if (appointments[0].count > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete service with existing appointments'
        });
      }
      
      const [result] = await connection.execute(
        'DELETE FROM services WHERE id = ?',
        [id]
      );
      
      connection.release();
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Service not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Service deleted successfully'
      });
      
    } catch (error) {
      console.error('❌ Failed to delete service:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete service',
        error: error.message
      });
    }
  });

  // Get working plan from settings
  app.get('/api/admin/working-plan', validateAuthToken, async (req, res) => {
    try {
      console.log('GET /api/admin/working-plan');
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(`
        SELECT value FROM settings WHERE name = 'company_working_plan'
      `);
      
      connection.release();
      
      if (rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Working plan not found'
        });
      }
      
      const workingPlan = JSON.parse(rows[0].value);
      
      res.json({
        status: 'success',
        working_plan: workingPlan
      });
      
    } catch (error) {
      console.error('❌ Failed to fetch working plan:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch working plan',
        error: error.message
      });
    }
  });
}

async function checkExistingProvider(nostrPubkey) {
  const mysql = require('mysql2/promise');
  const appointmentsDb = await mysql.createConnection({
    host: getMySQLHost(),
    user: 'user',
    password: 'password',
    database: 'easyappointments'
  });
  
  const [rows] = await appointmentsDb.execute(
    'SELECT id FROM users WHERE nostr_pubkey = ? AND id_roles = 2',
    [nostrPubkey]
  );
  
  await appointmentsDb.end();
  return rows.length > 0 ? rows[0] : null;
}

module.exports = { setupProviderEndpoints };