// Admin Dashboard JavaScript

// State management
let adminToken = null;
let adminPubkey = null;
let currentPatients = [];
let billingConfig = {
    storageRate: 10, // sats per MB per month
    baseRate: 1000   // base hosting fee per month
};

// DOM elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');
const adminName = document.getElementById('adminName');
const messageDiv = document.getElementById('message');

// Dashboard elements
const totalRepos = document.getElementById('totalRepos');
const totalUsers = document.getElementById('totalUsers');
const serverUptime = document.getElementById('serverUptime');
const monthlyRevenue = document.getElementById('monthlyRevenue');
const pendingInvoices = document.getElementById('pendingInvoices');
const totalStorage = document.getElementById('totalStorage');
const patientsTable = document.getElementById('patientsTable').getElementsByTagName('tbody')[0];

// Billing elements
const storageRateInput = document.getElementById('storageRate');
const baseRateInput = document.getElementById('baseRate');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const generateAllInvoicesBtn = document.getElementById('generateAllInvoicesBtn');
const sendOverdueRemindersBtn = document.getElementById('sendOverdueRemindersBtn');
const refreshPatientsBtn = document.getElementById('refreshPatientsBtn');

// Modal elements
const invoiceModal = document.getElementById('invoiceModal');
const closeModal = document.querySelector('.close');
const sendInvoiceBtn = document.getElementById('sendInvoiceBtn');
const cancelInvoiceBtn = document.getElementById('cancelInvoiceBtn');

// Event listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
saveConfigBtn.addEventListener('click', saveBillingConfig);
generateAllInvoicesBtn.addEventListener('click', generateAllInvoices);
sendOverdueRemindersBtn.addEventListener('click', sendOverdueReminders);
refreshPatientsBtn.addEventListener('click', loadPatientData);
sendInvoiceBtn.addEventListener('click', sendInvoice);
cancelInvoiceBtn.addEventListener('click', closeInvoiceModal);
closeModal.addEventListener('click', closeInvoiceModal);

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkExistingAuth();
    loadBillingConfig();
});

// Authentication functions
async function handleLogin() {
    try {
        showMessage('Connecting to Nostr...', 'info');
        
        if (!window.nostr) {
            throw new Error('Please install a Nostr browser extension like nos2x');
        }

        // Step 1: Get challenge
        const challengeRes = await fetch('/api/auth/nostr/challenge', { 
            method: 'POST' 
        });
        const { challenge } = await challengeRes.json();
        
        // Step 2: Sign with Nostr extension
        const signedEvent = await window.nostr.signEvent({
            kind: 1,
            content: challenge,
            tags: [['challenge', challenge]],
            created_at: Math.floor(Date.now() / 1000)
        });
        
        // Step 3: Verify signature
        const verifyRes = await fetch('/api/auth/nostr/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signedEvent })
        });
        
        const { status, token, pubkey, metadata } = await verifyRes.json();
        
        if (status === 'OK') {
            // TODO: Add server-side check that this pubkey is authorized as admin
            // For now, we assume the person with Nostr access is the admin
            
            adminToken = token;
            adminPubkey = pubkey;
            
            // Store credentials
            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_pubkey', pubkey);
            
            // Update UI
            adminName.textContent = metadata?.display_name || metadata?.name || 'Administrator';
            
            showDashboard();
            showMessage('Admin login successful!', 'success');
            
        } else {
            throw new Error('Authentication failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage(`Login failed: ${error.message}`, 'error');
    }
}

function handleLogout() {
    adminToken = null;
    adminPubkey = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_pubkey');
    
    showLogin();
    showMessage('Logged out successfully', 'info');
}

function checkExistingAuth() {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    
    if (token && pubkey) {
        adminToken = token;
        adminPubkey = pubkey;
        showDashboard();
    }
}

// UI management
function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    loadDashboardData();
}

// Dashboard data loading
async function loadDashboardData() {
    await Promise.all([
        loadServerStats(),
        loadPatientData(),
        loadBillingStats()
    ]);
}

async function loadServerStats() {
    try {
        // Mock server stats for now - would come from actual API
        totalRepos.textContent = '12';
        totalUsers.textContent = '8';
        serverUptime.textContent = '15 days';
        
        // TODO: Add real API endpoint for server stats
        // const response = await fetch('/api/admin/stats', {
        //     headers: { 'Authorization': `Bearer ${adminToken}` }
        // });
        // const stats = await response.json();
        
    } catch (error) {
        console.error('Error loading server stats:', error);
    }
}

async function loadPatientData() {
    try {
        // Mock patient data - would come from actual API
        currentPatients = [
            {
                id: '1',
                name: 'Dr. Jane Smith',
                pubkey: 'npub1abc...',
                repositories: 2,
                storageUsed: 45, // MB
                lastBilled: '2025-01-01',
                paymentStatus: 'paid',
                totalOwed: 0
            },
            {
                id: '2', 
                name: 'Dr. Bob Johnson',
                pubkey: 'npub1def...',
                repositories: 1,
                storageUsed: 23, // MB
                lastBilled: '2025-01-01',
                paymentStatus: 'pending',
                totalOwed: 1230
            },
            {
                id: '3',
                name: 'Dr. Alice Brown',
                pubkey: 'npub1ghi...',
                repositories: 3,
                storageUsed: 78, // MB
                lastBilled: '2024-12-15',
                paymentStatus: 'overdue',
                totalOwed: 2560
            }
        ];
        
        renderPatientsTable();
        
        // TODO: Add real API endpoint for patient data
        // const response = await fetch('/api/admin/patients', {
        //     headers: { 'Authorization': `Bearer ${adminToken}` }
        // });
        // currentPatients = await response.json();
        
    } catch (error) {
        console.error('Error loading patient data:', error);
    }
}

function renderPatientsTable() {
    patientsTable.innerHTML = '';
    
    currentPatients.forEach(patient => {
        const row = patientsTable.insertRow();
        
        const monthlyCost = calculateMonthlyCost(patient.storageUsed);
        const statusClass = `status-${patient.paymentStatus}`;
        
        // Format pubkey properly
        const pubkeyDisplay = patient.pubkey.length > 10 ? 
            patient.pubkey.substring(0, 4) + '...' + patient.pubkey.slice(-6) : 
            patient.pubkey;
        
        row.innerHTML = `
            <td>
                <div><strong>${patient.name}</strong></div>
                <div style="font-size: 0.8em; color: #666;">${pubkeyDisplay}</div>
            </td>
            <td>${patient.repositories}</td>
            <td>${patient.storageUsed} MB</td>
            <td>${monthlyCost} sats</td>
            <td><span class="${statusClass}">${patient.paymentStatus.toUpperCase()}</span></td>
            <td>
                <button class="btn btn-primary btn-small bill-patient-btn" data-patient-id="${patient.id}">
                    Bill Patient
                </button>
                ${patient.paymentStatus === 'overdue' ? 
                    `<button class="btn btn-warning btn-small remind-patient-btn" data-patient-id="${patient.id}">
                        Remind
                    </button>` : ''
                }
            </td>
        `;
    });
    
    // Add event listeners to the new buttons
    addPatientButtonListeners();
}

async function loadBillingStats() {
    try {
        // Calculate stats from patient data
        const totalStorageUsed = currentPatients.reduce((sum, p) => sum + p.storageUsed, 0);
        const totalRevenue = currentPatients.reduce((sum, p) => {
            if (p.paymentStatus === 'paid') {
                return sum + calculateMonthlyCost(p.storageUsed);
            }
            return sum;
        }, 0);
        const pendingCount = currentPatients.filter(p => p.paymentStatus === 'pending').length;
        
        totalStorage.textContent = `${totalStorageUsed} MB`;
        monthlyRevenue.textContent = `${totalRevenue} sats`;
        pendingInvoices.textContent = pendingCount;
        
    } catch (error) {
        console.error('Error loading billing stats:', error);
    }
}

// Billing functions
function calculateMonthlyCost(storageUsedMB) {
    return billingConfig.baseRate + (storageUsedMB * billingConfig.storageRate);
}

function loadBillingConfig() {
    const config = localStorage.getItem('billing_config');
    if (config) {
        const parsed = JSON.parse(config);
        billingConfig = { ...billingConfig, ...parsed };
        storageRateInput.value = billingConfig.storageRate;
        baseRateInput.value = billingConfig.baseRate;
    }
}

function saveBillingConfig() {
    billingConfig.storageRate = parseInt(storageRateInput.value);
    billingConfig.baseRate = parseInt(baseRateInput.value);
    
    localStorage.setItem('billing_config', JSON.stringify(billingConfig));
    showMessage('Billing configuration saved', 'success');
    
    // Refresh the display
    loadPatientData();
}

// Invoice modal functions
function openInvoiceModal(patientId) {
    const patient = currentPatients.find(p => p.id === patientId);
    if (!patient) return;
    
    const monthlyCost = calculateMonthlyCost(patient.storageUsed);
    
    document.getElementById('invoicePatientName').textContent = patient.name;
    document.getElementById('invoiceBaseFee').textContent = `${billingConfig.baseRate} sats`;
    document.getElementById('invoiceStorageAmount').textContent = patient.storageUsed;
    document.getElementById('invoiceStorageFee').textContent = `${patient.storageUsed * billingConfig.storageRate} sats`;
    document.getElementById('invoiceTotal').innerHTML = `<strong>${monthlyCost} sats</strong>`;
    
    // Store patient ID for later use
    invoiceModal.setAttribute('data-patient-id', patientId);
    
    invoiceModal.classList.remove('hidden');
}

function closeInvoiceModal() {
    invoiceModal.classList.add('hidden');
}

async function sendInvoice() {
    const patientId = invoiceModal.getAttribute('data-patient-id');
    const patient = currentPatients.find(p => p.id === patientId);
    const description = document.getElementById('invoiceDescription').value;
    const amount = calculateMonthlyCost(patient.storageUsed);
    
    try {
        showMessage('Sending invoice via NWC...', 'info');
        
        // TODO: Implement actual NWC invoice sending
        // This would integrate with a Lightning invoice generation service
        console.log('Sending invoice:', {
            patient: patient.name,
            pubkey: patient.pubkey,
            amount,
            description
        });
        
        // Mock successful sending for now
        setTimeout(() => {
            showMessage(`Invoice sent to ${patient.name}`, 'success');
            closeInvoiceModal();
            
            // Update patient status
            patient.paymentStatus = 'pending';
            renderPatientsTable();
        }, 1000);
        
    } catch (error) {
        console.error('Invoice sending error:', error);
        showMessage(`Failed to send invoice: ${error.message}`, 'error');
    }
}

async function sendReminder(patientId) {
    const patient = currentPatients.find(p => p.id === patientId);
    if (!patient) return;
    
    try {
        showMessage('Sending payment reminder...', 'info');
        
        // TODO: Implement NWC reminder
        console.log('Sending reminder to:', patient.name);
        
        setTimeout(() => {
            showMessage(`Reminder sent to ${patient.name}`, 'success');
        }, 1000);
        
    } catch (error) {
        console.error('Reminder sending error:', error);
        showMessage(`Failed to send reminder: ${error.message}`, 'error');
    }
}

async function generateAllInvoices() {
    try {
        showMessage('Generating invoices for all patients...', 'info');
        
        const unpaidPatients = currentPatients.filter(p => p.paymentStatus !== 'paid');
        
        for (const patient of unpaidPatients) {
            // TODO: Generate actual invoices
            console.log('Generating invoice for:', patient.name);
            patient.paymentStatus = 'pending';
        }
        
        renderPatientsTable();
        loadBillingStats();
        
        showMessage(`Generated ${unpaidPatients.length} invoices`, 'success');
        
    } catch (error) {
        console.error('Bulk invoice generation error:', error);
        showMessage(`Failed to generate invoices: ${error.message}`, 'error');
    }
}

async function sendOverdueReminders() {
    try {
        const overduePatients = currentPatients.filter(p => p.paymentStatus === 'overdue');
        
        showMessage(`Sending reminders to ${overduePatients.length} patients...`, 'info');
        
        for (const patient of overduePatients) {
            // TODO: Send actual reminders
            console.log('Sending overdue reminder to:', patient.name);
        }
        
        showMessage(`Sent ${overduePatients.length} overdue reminders`, 'success');
        
    } catch (error) {
        console.error('Overdue reminders error:', error);
        showMessage(`Failed to send reminders: ${error.message}`, 'error');
    }
}

// Add event listeners to patient action buttons
function addPatientButtonListeners() {
    // Bill Patient buttons
    const billButtons = document.querySelectorAll('.bill-patient-btn');
    billButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            openInvoiceModal(patientId);
        });
    });
    
    // Remind buttons
    const remindButtons = document.querySelectorAll('.remind-patient-btn');
    remindButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            sendReminder(patientId);
        });
    });
}

// Utility functions
function showMessage(text, type = 'info') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === invoiceModal) {
        closeInvoiceModal();
    }
});