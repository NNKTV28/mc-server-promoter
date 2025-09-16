// Import auth functions
import { 
  initAuth, 
  register, 
  login, 
  logout, 
  getAuthState, 
  onAuthStateChange, 
  updateProfile, 
  changePassword 
} from './auth.js';

// Import CAPTCHA functions
import { 
  showCaptchaModal, 
  handleCaptchaResponse, 
  secureApiFetch 
} from './captcha.js';

// DOM elements
const elements = {
  // Main view
  serverList: document.getElementById('serverList'),
  serverForm: document.getElementById('serverForm'),
  formMsg: document.getElementById('formMsg'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  submitFormAuth: document.getElementById('submitFormAuth'),
  planSection: document.getElementById('planSection'),
  
  // Auth UI
  authButtons: document.getElementById('authButtons'),
  userMenu: document.getElementById('userMenu'),
  username: document.getElementById('username'),
  loginBtn: document.getElementById('loginBtn'),
  registerBtn: document.getElementById('registerBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  profileBtn: document.getElementById('profileBtn'),
  myServersBtn: document.getElementById('myServersBtn'),
  dashboardBtn: document.getElementById('dashboardBtn'),
  adminBtn: document.getElementById('adminBtn'),
  
  // Modals
  loginModal: document.getElementById('loginModal'),
  registerModal: document.getElementById('registerModal'),
  editServerModal: document.getElementById('editServerModal'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  editServerForm: document.getElementById('editServerForm'),
  loginMsg: document.getElementById('loginMsg'),
  registerMsg: document.getElementById('registerMsg'),
  editServerMsg: document.getElementById('editServerMsg'),
  
  // Views
  mainView: document.getElementById('mainView'),
  profileView: document.getElementById('profileView'),
  myServersView: document.getElementById('myServersView'),
  dashboardView: document.getElementById('dashboardView'),
  dashboardContent: document.getElementById('dashboardContent'),
  adminView: document.getElementById('adminView'),
  
  // Profile
  profileForm: document.getElementById('profileForm'),
  profileUsername: document.getElementById('profileUsername'),
  profileEmail: document.getElementById('profileEmail'),
  passwordForm: document.getElementById('passwordForm'),
  profileMsg: document.getElementById('profileMsg'),
  
  // User servers
  myServersList: document.getElementById('myServersList'),
  myServersMsg: document.getElementById('myServersMsg'),
  
  // Admin
  adminStats: document.getElementById('adminStats'),
  statsGrid: document.getElementById('statsGrid'),
  usersList: document.getElementById('usersList'),
  adminServersList: document.getElementById('adminServersList'),
  adminMsg: document.getElementById('adminMsg')
};

let currentView = 'main';
let currentUser = null;

// Initialize the app
async function init() {
  await initAuth();
  setupEventListeners();
  await fetchServers();
}

// Setup all event listeners
function setupEventListeners() {
  // Auth state changes
  onAuthStateChange(handleAuthStateChange);
  
  // Main form
  elements.serverForm.addEventListener('submit', handleServerSubmit);
  elements.search.addEventListener('input', fetchServers);
  elements.sort.addEventListener('change', fetchServers);
  
  // Auth buttons
  elements.loginBtn.addEventListener('click', () => showModal('loginModal'));
  elements.registerBtn.addEventListener('click', () => showModal('registerModal'));
  elements.logoutBtn.addEventListener('click', handleLogout);
  
  // Navigation
  elements.profileBtn.addEventListener('click', () => showView('profile'));
  elements.myServersBtn.addEventListener('click', () => showView('myServers'));
  elements.dashboardBtn.addEventListener('click', () => showView('dashboard'));
  elements.adminBtn.addEventListener('click', () => showView('admin'));
  
  // Back buttons
  document.getElementById('backToMain').addEventListener('click', () => showView('main'));
  document.getElementById('backToMainFromServers').addEventListener('click', () => showView('main'));
  document.getElementById('backToMainFromDashboard').addEventListener('click', () => showView('main'));
  document.getElementById('backToMainFromAdmin').addEventListener('click', () => showView('main'));
  
  // Modal forms
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.editServerForm.addEventListener('submit', handleEditServer);
  
  // Profile forms
  elements.profileForm.addEventListener('submit', handleProfileUpdate);
  elements.passwordForm.addEventListener('submit', handlePasswordChange);
  
  // Modal close buttons
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
      const modal = e.target.getAttribute('data-modal');
      hideModal(modal);
    });
  });
  
  // Modal links
  document.getElementById('switchToRegister').addEventListener('click', () => {
    hideModal('loginModal');
    showModal('registerModal');
  });
  document.getElementById('switchToLogin').addEventListener('click', () => {
    hideModal('registerModal');
    showModal('loginModal');
  });
  document.getElementById('loginLink').addEventListener('click', () => showModal('loginModal'));
  document.getElementById('registerLink').addEventListener('click', () => showModal('registerModal'));
  
  // Admin tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
  
  // Click outside modal to close
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.style.display = 'none';
    }
  });
}

// Handle auth state changes
function handleAuthStateChange(authState) {
  currentUser = authState.user;
  
  if (authState.isLoggedIn) {
    elements.authButtons.style.display = 'none';
    elements.userMenu.style.display = 'flex';
    elements.username.textContent = authState.user.username;
    elements.dashboardBtn.style.display = authState.isAdmin ? 'block' : 'none';
    elements.adminBtn.style.display = authState.isAdmin ? 'block' : 'none';
    
    // Show server form, hide auth message
    elements.serverForm.style.display = 'block';
    elements.submitFormAuth.style.display = 'none';
    
    // Hide paid option for non-admins
    if (!authState.isAdmin) {
      const paidOption = elements.serverForm.querySelector('option[value="paid"]');
      if (paidOption) paidOption.style.display = 'none';
    }
    
    // Load profile data if in profile view
    if (currentView === 'profile') {
      loadProfileData();
    }
  } else {
    elements.authButtons.style.display = 'flex';
    elements.userMenu.style.display = 'none';
    
    // Hide server form, show auth message
    elements.serverForm.style.display = 'none';
    elements.submitFormAuth.style.display = 'block';
    
    // Switch to main view if not logged in
    if (currentView !== 'main') {
      showView('main');
    }
  }
}

// Server listing functions
async function fetchServers() {
  try {
    const q = encodeURIComponent(elements.search.value || '');
    const sort = encodeURIComponent(elements.sort.value || 'rank');
    const res = await fetch(`/api/servers?q=${q}&sort=${sort}`);
    const data = await res.json();
    renderServerList(data);
  } catch (error) {
    console.error('Error fetching servers:', error);
  }
}

function renderServerList(servers) {
  elements.serverList.innerHTML = '';
  if (!servers.length) {
    elements.serverList.innerHTML = '<p class="muted">No servers yet. Be the first to list yours!</p>';
    return;
  }
  
  servers.forEach(server => {
    const serverEl = createServerElement(server);
    elements.serverList.appendChild(serverEl);
  });
}

function createServerElement(server) {
  const div = document.createElement('div');
  div.className = 'server';
  
  const banner = document.createElement('img');
  banner.className = 'banner';
  banner.src = server.banner_url || 'https://placehold.co/240x128?text=Alliance';
  banner.alt = server.name;
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  
  const h3 = document.createElement('h3');
  h3.textContent = server.name;
  
  const badge = document.createElement('span');
  badge.className = server.plan === 'paid' ? 'badge paid' : 'badge';
  badge.textContent = server.plan === 'paid' ? 'Featured' : 'Free';
  h3.appendChild(badge);
  
  const p = document.createElement('p');
  p.innerHTML = `<strong>IP:</strong> ${server.ip} &nbsp; • &nbsp; <strong>Votes:</strong> <span class="count">${server.votes}</span>`;
  if (server.owner_username) {
    p.innerHTML += ` &nbsp; • &nbsp; <strong>Owner:</strong> ${server.owner_username}`;
  }
  
  const description = document.createElement('p');
  description.textContent = server.description || '';
  
  const links = document.createElement('p');
  links.className = 'muted';
  if (server.website_url) {
    const a = document.createElement('a');
    a.href = server.website_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Website';
    links.appendChild(a);
  }
  
  meta.appendChild(h3);
  meta.appendChild(p);
  meta.appendChild(description);
  meta.appendChild(links);
  
  const actions = document.createElement('div');
  actions.className = 'actions';
  
  const voteBtn = document.createElement('button');
  voteBtn.className = 'vote';
  voteBtn.textContent = 'Vote';
  voteBtn.onclick = () => voteForServer(server.id);
  
  const created = document.createElement('span');
  created.className = 'muted';
  created.textContent = new Date(server.created_at).toLocaleString();
  
  actions.appendChild(voteBtn);
  actions.appendChild(created);
  
  div.appendChild(banner);
  div.appendChild(meta);
  div.appendChild(actions);
  
  return div;
}

async function voteForServer(serverId) {
  try {
    const res = await fetch(`/api/servers/${serverId}/vote`, { method: 'POST' });
    const data = await res.json();
    
    if (res.ok) {
      await fetchServers();
    } else {
      alert(data.error || 'Vote failed');
    }
  } catch (error) {
    alert('Network error');
  }
}

async function handleServerSubmit(e) {
  e.preventDefault();
  const formData = new FormData(elements.serverForm);
  const body = Object.fromEntries(formData.entries());
  
  try {
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    
    if (res.ok) {
      elements.serverForm.reset();
      elements.formMsg.textContent = '✅ Listing created!';
      await fetchServers();
    } else {
      elements.formMsg.textContent = '❌ ' + (data.error || 'Error creating listing');
    }
  } catch (error) {
    elements.formMsg.textContent = '❌ Network error';
  }
}

// Authentication functions
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  const doLogin = async () => {
    const result = await login(username, password);
    
    if (result.success) {
      elements.loginMsg.textContent = '✅ ' + result.message;
      hideModal('loginModal');
      elements.loginForm.reset();
    } else {
      if (result.error && result.error.includes('CAPTCHA')) {
        handleCaptchaResponse({ code: 'CAPTCHA_REQUIRED' }, doLogin);
      } else {
        elements.loginMsg.textContent = '❌ ' + result.error;
      }
    }
  };
  
  await doLogin();
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  const doRegister = async () => {
    const result = await register(username, email, password);
    
    if (result.success) {
      elements.registerMsg.textContent = '✅ ' + result.message;
      hideModal('registerModal');
      elements.registerForm.reset();
    } else {
      if (result.error && result.error.includes('CAPTCHA')) {
        handleCaptchaResponse({ code: 'CAPTCHA_REQUIRED' }, doRegister);
      } else {
        elements.registerMsg.textContent = '❌ ' + result.error;
      }
    }
  };
  
  await doRegister();
}

async function handleLogout() {
  const result = await logout();
  if (result.success) {
    showView('main');
  }
}

// View management
function showView(viewName) {
  // Hide all views
  document.querySelectorAll('.view, #mainView').forEach(view => {
    view.style.display = 'none';
  });
  
  currentView = viewName;
  
  switch (viewName) {
    case 'main':
      elements.mainView.style.display = 'block';
      break;
    case 'profile':
      elements.profileView.style.display = 'block';
      loadProfileData();
      break;
    case 'myServers':
      elements.myServersView.style.display = 'block';
      loadUserServers();
      break;
    case 'dashboard':
      elements.dashboardView.style.display = 'block';
      loadDashboardData();
      break;
    case 'admin':
      elements.adminView.style.display = 'block';
      loadAdminData();
      break;
  }
}

// Modal management
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('show');
  modal.style.display = 'flex';
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('show');
  modal.style.display = 'none';
}

// Profile management
function loadProfileData() {
  if (currentUser) {
    elements.profileUsername.value = currentUser.username;
    elements.profileEmail.value = currentUser.email;
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const email = elements.profileEmail.value;
  
  const result = await updateProfile(email);
  
  if (result.success) {
    elements.profileMsg.textContent = '✅ ' + result.message;
  } else {
    elements.profileMsg.textContent = '❌ ' + result.error;
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  
  const result = await changePassword(currentPassword, newPassword);
  
  if (result.success) {
    elements.profileMsg.textContent = '✅ ' + result.message;
    elements.passwordForm.reset();
  } else {
    elements.profileMsg.textContent = '❌ ' + result.error;
  }
}

// User servers management
async function loadUserServers() {
  try {
    const res = await fetch('/api/user/servers');
    const servers = await res.json();
    
    if (res.ok) {
      renderUserServers(servers);
    } else {
      elements.myServersMsg.textContent = '❌ ' + (servers.error || 'Error loading servers');
    }
  } catch (error) {
    elements.myServersMsg.textContent = '❌ Network error';
  }
}

function renderUserServers(servers) {
  elements.myServersList.innerHTML = '';
  
  if (!servers.length) {
    elements.myServersList.innerHTML = '<p class="muted">You haven\'t submitted any servers yet.</p>';
    return;
  }
  
  servers.forEach(server => {
    const serverEl = createUserServerElement(server);
    elements.myServersList.appendChild(serverEl);
  });
}

function createUserServerElement(server) {
  const div = document.createElement('div');
  div.className = 'my-server-item';
  
  div.innerHTML = `
    <div class="header">
      <h4>${server.name} <span class="badge ${server.plan === 'paid' ? 'paid' : ''}">${server.plan === 'paid' ? 'Featured' : 'Free'}</span></h4>
    </div>
    <div class="meta">
      <p><strong>IP:</strong> ${server.ip}</p>
      <p><strong>Votes:</strong> ${server.votes}</p>
      <p><strong>Created:</strong> ${new Date(server.created_at).toLocaleDateString()}</p>
      ${server.description ? `<p><strong>Description:</strong> ${server.description}</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn-edit" onclick="editServer(${server.id})">Edit</button>
      <button class="btn-danger" onclick="deleteServer(${server.id})">Delete</button>
    </div>
  `;
  
  return div;
}

window.editServer = function(serverId) {
  // Find the server data from the current user's servers
  loadServerForEdit(serverId);
};

// Load server data for editing
async function loadServerForEdit(serverId) {
  try {
    const res = await fetch(`/api/user/servers/${serverId}`);
    const server = await res.json();
    
    if (res.ok) {
      populateEditForm(server);
      showModal('editServerModal');
    } else {
      elements.myServersMsg.textContent = '❌ ' + (server.error || 'Error loading server data');
    }
  } catch (error) {
    elements.myServersMsg.textContent = '❌ Network error';
  }
}

// Populate the edit form with server data
function populateEditForm(server) {
  document.getElementById('editServerId').value = server.id;
  document.getElementById('editServerName').value = server.name;
  document.getElementById('editServerIp').value = server.ip;
  document.getElementById('editServerWebsite').value = server.website_url || '';
  document.getElementById('editServerBanner').value = server.banner_url || '';
  document.getElementById('editServerDescription').value = server.description || '';
  elements.editServerMsg.textContent = '';
  
  // Set banner URL in the upload component if it exists
  if (window.editBannerUpload && server.banner_url) {
    window.editBannerUpload.setBannerUrl(server.banner_url);
  }
}

// Handle edit server form submission
async function handleEditServer(e) {
  e.preventDefault();
  
  const serverId = document.getElementById('editServerId').value;
  const serverData = {
    name: document.getElementById('editServerName').value,
    ip: document.getElementById('editServerIp').value,
    website_url: document.getElementById('editServerWebsite').value,
    banner_url: document.getElementById('editServerBanner').value,
    description: document.getElementById('editServerDescription').value
  };
  
  try {
    const res = await fetch(`/api/user/servers/${serverId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverData)
    });
    
    const data = await res.json();
    
    if (res.ok) {
      elements.editServerMsg.textContent = '✅ ' + data.message;
      
      // Hide modal after a short delay to show success message
      setTimeout(() => {
        hideModal('editServerModal');
        elements.editServerForm.reset();
      }, 1500);
      
      // Refresh the user's servers list if we're on that view
      if (currentView === 'myServers') {
        await loadUserServers();
      }
      
      // Also refresh the main server list
      await fetchServers();
    } else {
      elements.editServerMsg.textContent = '❌ ' + (data.error || 'Error updating server');
    }
  } catch (error) {
    elements.editServerMsg.textContent = '❌ Network error';
  }
}

window.deleteServer = async function(serverId) {
  if (!confirm('Are you sure you want to delete this server?')) return;
  
  try {
    const res = await fetch(`/api/user/servers/${serverId}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (res.ok) {
      elements.myServersMsg.textContent = '✅ ' + data.message;
      await loadUserServers();
    } else {
      elements.myServersMsg.textContent = '❌ ' + (data.error || 'Error deleting server');
    }
  } catch (error) {
    elements.myServersMsg.textContent = '❌ Network error';
  }
};

// Dashboard functions
async function loadDashboardData() {
  console.log('🔍 [FRONTEND] Loading dashboard data...');
  console.log('🔍 [FRONTEND] Current user:', currentUser);
  console.log('🔍 [FRONTEND] Current view:', currentView);
  
  try {
    elements.dashboardContent.innerHTML = '<div class="loading-spinner" style="text-align: center; padding: 40px;">🔄 Loading dashboard data...</div>';
    
    console.log('🔍 [FRONTEND] Making fetch request to /api/admin/dashboard');
    const res = await fetch('/api/admin/dashboard', {
      credentials: 'include', // Ensure cookies are sent
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🔍 [FRONTEND] Response status:', res.status);
    console.log('🔍 [FRONTEND] Response statusText:', res.statusText);
    console.log('🔍 [FRONTEND] Response headers:', Object.fromEntries(res.headers.entries()));
    
    let data;
    try {
      data = await res.json();
      console.log('🔍 [FRONTEND] Response data:', data);
    } catch (jsonError) {
      console.error('❌ [FRONTEND] Failed to parse JSON:', jsonError);
      throw new Error('Invalid JSON response');
    }
    
    if (res.ok) {
      console.log('✅ [FRONTEND] Dashboard data loaded successfully');
      renderDashboard(data);
    } else {
      console.error('❌ [FRONTEND] Dashboard API returned error:', res.status, data);
      elements.dashboardContent.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;">❌ Failed to load dashboard data<br><small>Status: ${res.status} - ${data.error || res.statusText}</small></div>`;
    }
  } catch (error) {
    console.error('❌ [FRONTEND] Dashboard load error:', error);
    console.error('❌ [FRONTEND] Error stack:', error.stack);
    elements.dashboardContent.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;">❌ Network error loading dashboard<br><small>${error.message}</small></div>`;
  }
}

function renderDashboard(data) {
  const lastUpdate = new Date(data.timestamp).toLocaleString();
  
  elements.dashboardContent.innerHTML = `
    <div class="dashboard-header">
      <div>
        <h2 class="dashboard-title">📊 System Overview</h2>
        <p class="dashboard-subtitle">Real-time analytics and monitoring • Last updated: ${lastUpdate}</p>
      </div>
      <button class="refresh-btn" onclick="loadDashboardData()">🔄 Refresh</button>
    </div>
    
    <div class="dashboard-grid">
      <!-- User Statistics -->
      <div class="dashboard-section">
        <h3>👥 User Analytics</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value">${data.userStats.total_users || 0}</div>
            <div class="metric-label">Total Users</div>
            <div class="metric-trend trend-neutral">📈 ${data.userStats.new_users_month || 0} this month</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.userStats.admin_users || 0}</div>
            <div class="metric-label">Admins</div>
            <div class="metric-trend trend-up">👑 ${((data.userStats.admin_users / data.userStats.total_users) * 100 || 0).toFixed(1)}% of users</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.userStats.active_24h || 0}</div>
            <div class="metric-label">Active Today</div>
            <div class="metric-trend trend-up">⚡ ${data.userStats.active_week || 0} this week</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.userStats.new_users_week || 0}</div>
            <div class="metric-label">New This Week</div>
            <div class="metric-trend trend-neutral">📅 Growth rate</div>
          </div>
        </div>
      </div>
      
      <!-- Server Statistics -->
      <div class="dashboard-section">
        <h3>🖥️ Server Analytics</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value">${data.serverStats.total_servers || 0}</div>
            <div class="metric-label">Total Servers</div>
            <div class="metric-trend trend-up">📊 ${data.serverStats.new_servers_month || 0} this month</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.serverStats.paid_servers || 0}</div>
            <div class="metric-label">Featured</div>
            <div class="metric-trend trend-up">💰 Premium listings</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.serverStats.total_votes || 0}</div>
            <div class="metric-label">Total Votes</div>
            <div class="metric-trend trend-neutral">⭐ ${(data.serverStats.avg_votes || 0).toFixed(1)} avg/server</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.serverStats.new_servers_week || 0}</div>
            <div class="metric-label">New This Week</div>
            <div class="metric-trend trend-up">🆕 Recent additions</div>
          </div>
        </div>
      </div>
      
      <!-- Security Overview -->
      <div class="dashboard-section">
        <h3>🛡️ Security Status</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.securityStats.critical_events > 0 ? '#ef4444' : '#22c55e'}">${data.securityStats.total_events || 0}</div>
            <div class="metric-label">Security Events</div>
            <div class="metric-trend ${data.securityStats.events_24h > 10 ? 'trend-down' : 'trend-up'}">📅 ${data.securityStats.events_24h || 0} today</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.securityStats.bot_detections > 0 ? '#f59e0b' : '#22c55e'}">${data.securityStats.bot_detections || 0}</div>
            <div class="metric-label">Bot Detections</div>
            <div class="metric-trend trend-neutral">🤖 Automated threats</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.securityStats.critical_events > 0 ? '#ef4444' : '#22c55e'}">${data.securityStats.critical_events || 0}</div>
            <div class="metric-label">Critical Events</div>
            <div class="metric-trend ${data.securityStats.critical_events > 0 ? 'trend-down' : 'trend-up'}">🚨 High priority</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.securityStats.unique_ips || 0}</div>
            <div class="metric-label">Unique IPs</div>
            <div class="metric-trend trend-neutral">🌐 Traffic sources</div>
          </div>
        </div>
      </div>
      
      <!-- Device & Login Analytics -->
      <div class="dashboard-section">
        <h3>📱 Device Analytics</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value">${data.deviceStats.total_devices || 0}</div>
            <div class="metric-label">Total Devices</div>
            <div class="metric-trend trend-up">📱 Registered</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.deviceStats.active_devices_24h || 0}</div>
            <div class="metric-label">Active Today</div>
            <div class="metric-trend trend-up">⚡ ${data.deviceStats.active_devices_week || 0} this week</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.deviceStats.unique_browsers || 0}</div>
            <div class="metric-label">Browser Types</div>
            <div class="metric-trend trend-neutral">🌐 Diversity</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.deviceStats.unique_os || 0}</div>
            <div class="metric-label">OS Types</div>
            <div class="metric-trend trend-neutral">💻 Platforms</div>
          </div>
        </div>
      </div>
      
      <!-- Login Statistics -->
      <div class="dashboard-section">
        <h3>🔑 Login Analytics</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value">${data.loginStats.total_logins || 0}</div>
            <div class="metric-label">Total Logins</div>
            <div class="metric-trend trend-up">📊 All time</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.loginStats.failed_logins > 10 ? '#ef4444' : '#22c55e'}">${data.loginStats.failed_logins || 0}</div>
            <div class="metric-label">Failed Attempts</div>
            <div class="metric-trend ${data.loginStats.failed_logins > 10 ? 'trend-down' : 'trend-up'}">❌ Security risk</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.loginStats.logins_24h || 0}</div>
            <div class="metric-label">Today</div>
            <div class="metric-trend trend-up">📅 ${data.loginStats.logins_week || 0} this week</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${data.loginStats.unique_countries || 0}</div>
            <div class="metric-label">Countries</div>
            <div class="metric-trend trend-neutral">🌍 Global reach</div>
          </div>
        </div>
      </div>
      
      <!-- Bot Detection Overview -->
      <div class="dashboard-section">
        <h3>🤖 Bot Detection</h3>
        <div class="dashboard-metrics">
          <div class="dashboard-metric">
            <div class="metric-value">${data.botOverview.total_tracked_ips || 0}</div>
            <div class="metric-label">Tracked IPs</div>
            <div class="metric-trend trend-neutral">📊 Monitoring</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.botOverview.high_risk > 0 ? '#ef4444' : '#22c55e'}">${data.botOverview.high_risk || 0}</div>
            <div class="metric-label">High Risk</div>
            <div class="metric-trend trend-down">🔴 Dangerous</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value" style="color: ${data.botOverview.medium_risk > 0 ? '#f59e0b' : '#22c55e'}">${data.botOverview.medium_risk || 0}</div>
            <div class="metric-label">Medium Risk</div>
            <div class="metric-trend trend-neutral">🟡 Suspicious</div>
          </div>
          <div class="dashboard-metric">
            <div class="metric-value">${(data.botOverview.avg_score || 0).toFixed(1)}</div>
            <div class="metric-label">Avg Bot Score</div>
            <div class="metric-trend trend-neutral">📈 0-100 scale</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="dashboard-grid">
      <!-- Recent Activity -->
      <div class="dashboard-section">
        <h3>📋 Recent Activity</h3>
        <div class="activity-list">
          ${data.recentActivity.map(activity => {
            const icon = activity.type === 'user_registered' ? '👤' : 
                        activity.type === 'server_created' ? '🖥️' : '🚨';
            const iconClass = activity.type === 'user_registered' ? 'user' : 
                             activity.type === 'server_created' ? 'server' : 'security';
            const timeAgo = getTimeAgo(activity.timestamp);
            
            return `
              <div class="activity-item">
                <div class="activity-icon ${iconClass}">${icon}</div>
                <div class="activity-details">
                  <div class="activity-title">${activity.detail}</div>
                  <div class="activity-time">${timeAgo}</div>
                </div>
              </div>
            `;
          }).join('') || '<div style="text-align: center; color: #64748b; padding: 20px;">No recent activity</div>'}
        </div>
      </div>
      
      <!-- Top Countries -->
      <div class="dashboard-section">
        <h3>🌍 Top Countries</h3>
        <div class="country-list">
          ${data.topCountries.map((country, index) => `
            <div class="country-item">
              <span class="country-name">${index + 1}. ${country.country}</span>
              <div class="country-stats">
                ${country.login_count} logins • ${country.unique_users} users
              </div>
            </div>
          `).join('') || '<div style="text-align: center; color: #64748b; padding: 20px;">No data available</div>'}
        </div>
      </div>
    </div>
  `;
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

// Make loadDashboardData available globally for refresh button
window.loadDashboardData = loadDashboardData;

// Admin functions
async function loadAdminData() {
  await loadAdminStats();
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const stats = await res.json();
    
    if (res.ok) {
      renderAdminStats(stats);
    } else {
      elements.adminMsg.textContent = '❌ Error loading stats';
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
}

function renderAdminStats(stats) {
  elements.statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${stats.totalUsers || 0}</div>
      <div class="stat-label">Total Users</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.totalServers || 0}</div>
      <div class="stat-label">Total Servers</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.totalVotes || 0}</div>
      <div class="stat-label">Total Votes</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.paidServers || 0}</div>
      <div class="stat-label">Featured Servers</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.recentUsers || 0}</div>
      <div class="stat-label">New Users (7d)</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.recentServers || 0}</div>
      <div class="stat-label">New Servers (7d)</div>
    </div>
  `;
}

function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(`admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Load data based on selected tab
  switch (tabName) {
    case 'users':
      loadAdminUsers();
      break;
    case 'servers':
      loadAdminServers();
      break;
  }
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    
    if (res.ok) {
      renderAdminUsers(users);
    } else {
      elements.adminMsg.textContent = '❌ Error loading users';
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
}

function renderAdminUsers(users) {
  elements.usersList.innerHTML = '';
  
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.innerHTML = `
      <div class="header">
        <h4>${user.username} <span class="badge ${user.role === 'admin' ? 'paid' : ''}">${user.role}</span></h4>
      </div>
      <div class="info">
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Joined:</strong> ${new Date(user.created_at).toLocaleDateString()}</p>
        <p><strong>Last Login:</strong> ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</p>
      </div>
      <div class="actions">
        <button class="btn-warning" onclick="toggleUserRole(${user.id}, '${user.role}')">
          ${user.role === 'admin' ? 'Make User' : 'Make Admin'}
        </button>
        <button class="btn-danger" onclick="deleteUser(${user.id})">Delete</button>
      </div>
    `;
    elements.usersList.appendChild(userEl);
  });
}

async function loadAdminServers() {
  try {
    const res = await fetch('/api/admin/servers');
    const servers = await res.json();
    
    if (res.ok) {
      renderAdminServers(servers);
    } else {
      elements.adminMsg.textContent = '❌ Error loading servers';
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
}

function renderAdminServers(servers) {
  elements.adminServersList.innerHTML = '';
  
  servers.forEach(server => {
    const serverEl = document.createElement('div');
    serverEl.className = 'server-item';
    serverEl.innerHTML = `
      <div class="header">
        <h4>${server.name} <span class="badge ${server.plan === 'paid' ? 'paid' : ''}">${server.plan === 'paid' ? 'Featured' : 'Free'}</span></h4>
      </div>
      <div class="info">
        <p><strong>IP:</strong> ${server.ip}</p>
        <p><strong>Owner:</strong> ${server.owner_username || 'None'}</p>
        <p><strong>Votes:</strong> ${server.votes}</p>
        <p><strong>Created:</strong> ${new Date(server.created_at).toLocaleDateString()}</p>
      </div>
      <div class="actions">
        <button class="btn-warning" onclick="toggleServerPlan(${server.id}, '${server.plan}')">
          ${server.plan === 'paid' ? 'Make Free' : 'Make Featured'}
        </button>
        <button class="btn-danger" onclick="deleteAdminServer(${server.id})">Delete</button>
      </div>
    `;
    elements.adminServersList.appendChild(serverEl);
  });
}

// Global admin functions
window.toggleUserRole = async function(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      elements.adminMsg.textContent = '✅ ' + data.message;
      await loadAdminUsers();
    } else {
      elements.adminMsg.textContent = '❌ ' + (data.error || 'Error updating user role');
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
};

window.deleteUser = async function(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  
  try {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (res.ok) {
      elements.adminMsg.textContent = '✅ ' + data.message;
      await loadAdminUsers();
    } else {
      elements.adminMsg.textContent = '❌ ' + (data.error || 'Error deleting user');
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
};

window.toggleServerPlan = async function(serverId, currentPlan) {
  const newPlan = currentPlan === 'paid' ? 'free' : 'paid';
  
  try {
    const res = await fetch(`/api/admin/servers/${serverId}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: newPlan })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      elements.adminMsg.textContent = '✅ ' + data.message;
      await loadAdminServers();
    } else {
      elements.adminMsg.textContent = '❌ ' + (data.error || 'Error updating server plan');
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
};

window.deleteAdminServer = async function(serverId) {
  if (!confirm('Are you sure you want to delete this server?')) return;
  
  try {
    const res = await fetch(`/api/admin/servers/${serverId}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (res.ok) {
      elements.adminMsg.textContent = '✅ ' + data.message;
      await loadAdminServers();
      await fetchServers(); // Refresh main server list too
    } else {
      elements.adminMsg.textContent = '❌ ' + (data.error || 'Error deleting server');
    }
  } catch (error) {
    elements.adminMsg.textContent = '❌ Network error';
  }
};

// Initialize the app when DOM is loaded
init();
