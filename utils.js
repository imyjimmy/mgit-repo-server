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
  // console.log('extractTokenFromAuthHeader: ', authHeader);
  try {
    // Handle Bearer token (standard format)
    if (authHeader.startsWith('Bearer ')) {
      // console.log('✅ Bearer token detected');
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
    // console.log('🔍 Validating JWT token...');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, jwtSecret);
    // console.log('✅ JWT validation successful for user:', decoded.pubkey);
    
    return {
      success: true,
      decoded: decoded,
      error: null
    };
  } catch (error) {
    console.log('❌ JWT validation failed:', error.message, error.name);
    
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
  // console.log("about to extract token from auth header")
  const extractResult = extractTokenFromAuthHeader(authHeader);
  if (!extractResult.success) {
    return extractResult;
  }
  
  // Step 2: Validate the JWT
  return validateJWTToken(extractResult.token, jwtSecret);
}

/**
 * Complete availability calculation with working plan, breaks, appointments, and time filtering
 */
function calculateAvailableHours(date, service, provider, appointments) {
  try {
    if (!provider.settings.working_plan) {
      console.log('❌ No working plan found');
      return [];
    }

    const workingPlan = JSON.parse(provider.settings.working_plan);
    const workingPlanExceptions = JSON.parse(provider.settings.working_plan_exceptions || '{}');
    
    // Get day of week (monday, tuesday, etc.)
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    // Check if there's a custom plan for this specific date
    let dayPlan = workingPlanExceptions[date] || workingPlan[dayOfWeek];
    
    if (!dayPlan || !dayPlan.start || !dayPlan.end) {
      console.log('❌ No day plan found for', dayOfWeek);
      return []; // Provider doesn't work on this day
    }

    console.log('📋 Day plan for', dayOfWeek, ':', dayPlan);

    const slots = [];
    const startTime = dayPlan.start; // e.g., "09:00"
    const endTime = dayPlan.end;     // e.g., "18:00"
    const duration = parseInt(service.duration); // service duration in minutes
    const interval = service.availabilities_type === 'flexible' ? 15 : Math.min(duration, 30); // 15 min intervals for flexible, max 30 min
    const bufferMinutes = 15; // 15 minute advance booking buffer

    console.log('slots: ', slots);
    // WORKING timezone conversion
    const selectedDate = new Date(date);
    const today = new Date();

    // Get current time in Central timezone 
    const utcTime = today.getTime();
    const centralOffset = -5 * 60 * 60 * 1000; // CDT is UTC-5
    const centralTime = new Date(utcTime + centralOffset);

    const isToday = selectedDate.toDateString() === centralTime.toDateString();
    const nowMinutes = isToday ? (centralTime.getUTCHours() * 60 + centralTime.getUTCMinutes() + bufferMinutes) : 0;

    console.log('🕐 Timezone debug:');
    console.log('  UTC time:', today.toISOString());
    console.log('  Central time:', centralTime.toISOString()); 
    console.log('  Central hours:minutes:', centralTime.getUTCHours() + ':' + centralTime.getUTCMinutes());
    console.log('  nowMinutes (Central + buffer):', nowMinutes);

    // Convert times to minutes for easier calculation
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    console.log('🔍 Debug values:');
    console.log('  startTime:', startTime, '-> startMinutes:', startMinutes);
    console.log('  endTime:', endTime, '-> endMinutes:', endMinutes);
    console.log('  duration:', duration);
    console.log('  interval:', interval);
    console.log('  Loop condition: startMinutes + duration <= endMinutes?', startMinutes + duration <= endMinutes);

    for (let time = startMinutes; time + duration <= endMinutes; time += interval) {
      console.log('🔄 Loop iteration: time =', time);
      const slotMinutes = time;
      
      // Debug the time filtering
      console.log('  🕐 Time filtering debug:');
      console.log('    isToday:', isToday);
      console.log('    slotMinutes:', slotMinutes);
      console.log('    nowMinutes:', nowMinutes);
      console.log('    slotMinutes <= nowMinutes?', slotMinutes <= nowMinutes);
      
      // Skip past times + buffer if it's today
      if (isToday && slotMinutes <= nowMinutes) {
        console.log('  ⏭️ SKIPPING: Past time + buffer');
        continue;
      }

      const slotTime = minutesToTime(time);
      const slotEndTime = minutesToTime(time + duration);
      
      console.log('  🕐 Slot time:', slotTime, 'to', slotEndTime);
      
      // Check if this slot conflicts with breaks
      const conflictsWithBreak = dayPlan.breaks?.some(breakPeriod => {
        const breakStart = timeToMinutes(breakPeriod.start);
        const breakEnd = timeToMinutes(breakPeriod.end);
        const hasConflict = time < breakEnd && (time + duration) > breakStart;
        console.log(`    🛑 Break check: ${breakPeriod.start}-${breakPeriod.end} (${breakStart}-${breakEnd}) conflicts? ${hasConflict}`);
        return hasConflict;
      });

      console.log('  🛑 Conflicts with break?', conflictsWithBreak);

      // Check if this slot conflicts with existing appointments
      const conflictsWithAppointment = appointments.some(apt => {
        const aptStart = new Date(apt.start_datetime);
        const aptEnd = new Date(apt.end_datetime);
        const slotStart = new Date(`${date} ${slotTime}`);
        const slotEnd = new Date(`${date} ${slotEndTime}`);
        
        const hasConflict = slotStart < aptEnd && slotEnd > aptStart;
        console.log(`    📅 Appointment check: ${apt.start_datetime} conflicts? ${hasConflict}`);
        return hasConflict;
      });

      console.log('  📅 Conflicts with appointment?', conflictsWithAppointment);
      console.log('  appointments.length:', appointments.length);

      if (!conflictsWithBreak && !conflictsWithAppointment) {
        console.log('  ✅ ADDING slot:', slotTime);
        slots.push(slotTime);
      } else {
        console.log('  ❌ SKIPPING slot due to conflicts');
      }
    }

    console.log('slots: ', slots);
    return slots;

  } catch (error) {
    console.error('Error calculating available hours:', error);
    return [];
  }
}

// check an appointment time against current time
function timeCheck(appointmentDateTime, doctorTimezone = 'UTC') {
  try {
    console.log('🕐 Time check debug:');
    console.log('  Appointment datetime:', appointmentDateTime);
    console.log('  Doctor timezone:', doctorTimezone);
    
    // Get current time in doctor's timezone (following your existing pattern)
    const today = new Date();
    const utcTime = today.getTime();
    
    // Determine timezone offset (expanding your existing pattern)
    let timezoneOffset;
    switch(doctorTimezone.toLowerCase()) {
      case 'UTC':
      case 'america/chicago':
        timezoneOffset = -5 * 60 * 60 * 1000; // CDT is UTC-5
        break;
      case 'eastern':
      case 'america/new_york':
        timezoneOffset = -4 * 60 * 60 * 1000; // EDT is UTC-4
        break;
      case 'pacific':
      case 'america/los_angeles':
        timezoneOffset = -7 * 60 * 60 * 1000; // PDT is UTC-7
        break;
      case 'utc':
      default:
        timezoneOffset = 0; // UTC
    }
    
    const doctorTime = new Date(utcTime + timezoneOffset);
    
    // Parse appointment datetime
    const appointmentTime = new Date(appointmentDateTime);
    
    // Calculate 15 minutes before appointment in doctor's timezone
    const appointmentTimeInDoctorTz = new Date(appointmentTime.getTime() + timezoneOffset);
    const earliestJoinTime = new Date(appointmentTimeInDoctorTz.getTime() - (15 * 60 * 1000)); // 15 minutes before
    
    console.log('  UTC time:', today.toISOString());
    console.log('  Doctor time:', doctorTime.toISOString());
    console.log('  Appointment time:', appointmentTime.toISOString());
    console.log('  Earliest join time:', earliestJoinTime.toISOString());
    
    const canJoin = doctorTime >= earliestJoinTime;
    console.log('  Can join?', canJoin);
    
    // Optional: Check if appointment is too far in the past (2 hours after)
    const maxTimeAfter = new Date(appointmentTimeInDoctorTz.getTime() + (2 * 60 * 60 * 1000));
    const tooLate = doctorTime > maxTimeAfter;
    
    if (tooLate) {
      console.log('  Appointment has ended');
      return false;
    }
    
    return canJoin;
    
  } catch (error) {
    console.error('Error in timeCheck:', error);
    return false; // Fail closed - don't allow access on error
  }
}

// Helper functions
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

module.exports = {
  hexToBech32,
  bech32ToHex,
  extractTokenFromAuthHeader,
  validateJWTToken,
  processAuthToken,
  calculateAvailableHours,
  timeCheck
}