const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { webln } = require('@getalby/sdk');
const utils = require('./utils');

// Admin routes for managing patients and billing
function createAdminRoutes(REPOS_PATH, repoConfigurations, validateAuthToken) {
  
  // Admin API endpoint - get all patients/repositories with real data
  router.get('/patients', validateAuthToken, async (req, res) => {
    try {
      // TODO: Add admin authorization check here
      // For now, assume anyone with a valid token can access admin endpoints
      
      const patients = [];
      const fsPromises = require('fs').promises;
      
      // Scan through all discovered repositories
      for (const [repoId, config] of Object.entries(repoConfigurations)) {
        try {
          const repoPath = path.join(REPOS_PATH, repoId);
          
          // Check if repository directory exists
          const repoExists = await fsPromises.access(repoPath).then(() => true).catch(() => false);
          if (!repoExists) continue;
          
          // Get repository size
          const { exec } = require('util').promisify(require('child_process').exec);
          let storageUsed = 0;
          try {
            const { stdout } = await exec(`du -s "${repoPath}"`, { timeout: 5000 });
            const sizeKB = parseInt(stdout.split('\t')[0]);
            storageUsed = Math.round(sizeKB / 1024); // Convert KB to MB
          } catch (err) {
            console.warn(`Could not get size for ${repoId}:`, err.message);
          }
          
          // Get git author info from recent commits
          let authorName = 'Unknown';
          let authorEmail = '';
          let nostrPubkey = '';
          
          try {
            // Get the most recent commit author
            const { stdout: authorInfo } = await exec(
              `git log -1 --format="%an|%ae" HEAD`, 
              { cwd: repoPath, timeout: 5000 }
            );
            
            if (authorInfo.trim()) {
              const [name, email] = authorInfo.trim().split('|');
              authorName = name || 'Unknown';
              authorEmail = email || '';
            }
          } catch (err) {
            console.warn(`Could not get author for ${repoId}:`, err.message);
          }
          
          // Extract Nostr pubkey from authorized_keys or git config
          if (config.authorized_keys && config.authorized_keys.length > 0) {
            nostrPubkey = config.authorized_keys[0].pubkey; // Use first authorized key
          }
          
          // Try to get Nostr pubkey from git config as fallback
          if (!nostrPubkey) {
            try {
              const { stdout: pubkeyConfig } = await exec(
                `git config user.pubkey`, 
                { cwd: repoPath, timeout: 5000 }
              );
              nostrPubkey = pubkeyConfig.trim();
            } catch (err) {
              // No pubkey in git config, that's ok
            }
          }

          // Extract Nostr pubkey from authorized_keys or git config
          console.log('keys:', config.authorized_keys[0].pubkey);
          if (config.authorized_keys && config.authorized_keys.length > 0) {
            const rawPubkey = config.authorized_keys[0].pubkey;
            // Convert hex to bech32 if needed
            if (rawPubkey.length === 64 && /^[0-9a-fA-F]+$/.test(rawPubkey)) {
              console.log('hex format for key detected, converting to bech32')
              nostrPubkey = utils.hexToBech32(rawPubkey); // Use your existing helper function
            } else {
              console.log('key already in bech32')
              nostrPubkey = rawPubkey; // Already in bech32 format
            }
          }
          
          // Create patient record
          const patient = {
            id: repoId,
            name: authorName,
            email: authorEmail,
            pubkey: nostrPubkey || 'Not configured',
            repositories: 1, // Each repo represents one patient for now
            storageUsed: storageUsed,
            lastBilled: new Date().toISOString().split('T')[0], // Today's date
            paymentStatus: 'pending', // Default status
            totalOwed: 0, // Will be calculated
            repoPath: repoPath,
            created: config.metadata?.created || new Date().toISOString()
          };
          
          patients.push(patient);
          
        } catch (error) {
          console.error(`Error processing repository ${repoId}:`, error);
        }
      }
      
      res.json(patients);
      
    } catch (error) {
      console.error('Error fetching admin patients:', error);
      res.status(500).json({ 
        status: 'error', 
        reason: 'Failed to fetch patient data',
        details: error.message 
      });
    }
  });

  // Update the invoice endpoint
  router.post('/invoice', validateAuthToken, async (req, res) => {
    try {
      const { patientId, amount, description } = req.body;
      
      if (!patientId || !amount || !description) {
        return res.status(400).json({
          status: 'error',
          reason: 'Missing required fields: patientId, amount, description'
        });
      }
      
      // Find the patient
      const config = repoConfigurations[patientId];
      if (!config || !config.authorized_keys.length) {
        return res.status(404).json({
          status: 'error',
          reason: 'Patient not found'
        });
      }
      
      const patientPubkey = config.authorized_keys[0].pubkey;
      
      // Convert amount from sats to millisats for Lightning
      const amountMsat = amount * 1000;
      
      try {
        // TODO: Initialize NWC connection - you'll need the admin's NWC connection string
        // const nwc = new webln.NostrWeblnProvider({ nostrWalletConnectUrl: process.env.ADMIN_NWC_URL });
        // await nwc.enable();
        
        // For now, create a mock invoice structure
        const invoice = {
          id: `inv_${Date.now()}`,
          paymentRequest: `lnbc${amount}u1...mock_invoice`, // Mock payment request
          paymentHash: 'mock_payment_hash_' + Date.now(),
          amount: amount,
          amountMsat: amountMsat,
          description: description,
          patientPubkey: patientPubkey,
          patientId: patientId,
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };
        
        // TODO: Generate real invoice using NWC
        // const invoiceResponse = await nwc.makeInvoice({
        //   amount: amountMsat,
        //   defaultMemo: description
        // });
        // invoice.paymentRequest = invoiceResponse.paymentRequest;
        // invoice.paymentHash = invoiceResponse.paymentHash;
        
        console.log('Generated invoice for patient:', {
          patientId,
          patientPubkey: patientPubkey.substring(0, 8) + '...',
          amount: `${amount} sats`,
          description,
          paymentRequest: invoice.paymentRequest
        });
        
        // TODO: Send NWC payment request to patient
        // This would involve sending a Nostr DM to the patient's pubkey
        // with the payment request and invoice details
        
        res.json({
          status: 'success',
          invoice: {
            id: invoice.id,
            amount: invoice.amount,
            description: invoice.description,
            paymentRequest: invoice.paymentRequest,
            status: invoice.status,
            createdAt: invoice.createdAt,
            expiresAt: invoice.expiresAt
          },
          message: `Invoice generated for ${patientId}`
        });
        
      } catch (nwcError) {
        console.error('NWC invoice generation failed:', nwcError);
        throw new Error(`Lightning invoice generation failed: ${nwcError.message}`);
      }
      
    } catch (error) {
      console.error('Invoice generation error:', error);
      res.status(500).json({
        status: 'error',
        reason: 'Failed to generate invoice',
        details: error.message
      });
    }
  });

  // Add to admin-routes.js
  async function sendPaymentRequestDM(patientPubkey, invoice) {
    try {
      // TODO: Send Nostr DM to patient with payment request
      const dmContent = {
        type: 'payment_request',
        invoice: {
          id: invoice.id,
          amount: invoice.amount,
          description: invoice.description,
          paymentRequest: invoice.paymentRequest,
          expiresAt: invoice.expiresAt
        },
        message: `Invoice for medical repository hosting: ${invoice.description}`
      };
      
      console.log('Would send DM to patient:', {
        pubkey: patientPubkey.substring(0, 8) + '...',
        content: dmContent
      });
      
      // This would use nostr-tools to send an encrypted DM
      // Implementation depends on having the admin's Nostr keys
      
    } catch (error) {
      console.error('Failed to send payment request DM:', error);
      throw error;
    }
  }

  // Add more admin routes here in the future
  // router.get('/stats', validateAuthToken, async (req, res) => { ... });
  
  return router;
}

module.exports = createAdminRoutes;