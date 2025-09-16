// captcha.js - Frontend CAPTCHA functionality

let currentCaptcha = null;

// Create CAPTCHA modal HTML
function createCaptchaModal() {
  const modalHTML = `
    <div id="captchaModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>🤖 Security Verification</h3>
          <span class="close" data-modal="captchaModal">&times;</span>
        </div>
        <div style="padding: 24px;">
          <p>To ensure you're human, please solve this simple math problem:</p>
          <div id="captchaQuestion" style="font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 20px; background: #1f2937; border-radius: 8px;"></div>
          <input type="number" id="captchaAnswer" placeholder="Enter your answer" style="text-align: center; font-size: 18px; margin-bottom: 16px;" />
          <button id="verifyCaptcha" style="width: 100%;">Verify</button>
          <button id="refreshCaptcha" class="btn-secondary" style="width: 100%; margin-top: 8px;">Get New Question</button>
          <p id="captchaMsg" class="muted" style="margin-top: 16px;"></p>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if present
  const existing = document.getElementById('captchaModal');
  if (existing) existing.remove();
  
  // Add new modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add event listeners
  document.getElementById('verifyCaptcha').addEventListener('click', verifyCaptchaAnswer);
  document.getElementById('refreshCaptcha').addEventListener('click', loadNewCaptcha);
  document.querySelector('[data-modal="captchaModal"]').addEventListener('click', () => {
    hideCaptchaModal();
  });
  
  // Allow Enter key to submit
  document.getElementById('captchaAnswer').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      verifyCaptchaAnswer();
    }
  });
}

// Load a new CAPTCHA challenge
async function loadNewCaptcha() {
  try {
    const response = await fetch('/api/security/captcha');
    const data = await response.json();
    
    if (response.ok) {
      currentCaptcha = data;
      document.getElementById('captchaQuestion').textContent = data.question + ' = ?';
      document.getElementById('captchaAnswer').value = '';
      document.getElementById('captchaMsg').textContent = '';
    } else {
      document.getElementById('captchaMsg').textContent = '❌ Failed to load CAPTCHA: ' + (data.error || 'Unknown error');
    }
  } catch (error) {
    document.getElementById('captchaMsg').textContent = '❌ Network error loading CAPTCHA';
    console.error('CAPTCHA load error:', error);
  }
}

// Verify CAPTCHA answer
async function verifyCaptchaAnswer() {
  if (!currentCaptcha) {
    document.getElementById('captchaMsg').textContent = '❌ No CAPTCHA challenge loaded';
    return;
  }
  
  const answer = document.getElementById('captchaAnswer').value;
  if (!answer) {
    document.getElementById('captchaMsg').textContent = '❌ Please enter an answer';
    return;
  }
  
  try {
    const response = await fetch('/api/security/captcha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: currentCaptcha.challengeId,
        solution: answer
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.valid) {
      document.getElementById('captchaMsg').textContent = '✅ Verification successful!';
      setTimeout(() => {
        hideCaptchaModal();
        // Trigger the pending action if any
        if (window.pendingCaptchaCallback) {
          window.pendingCaptchaCallback();
          window.pendingCaptchaCallback = null;
        }
      }, 1500);
    } else {
      document.getElementById('captchaMsg').textContent = '❌ ' + (data.error || 'Incorrect answer, please try again');
      document.getElementById('captchaAnswer').value = '';
      document.getElementById('captchaAnswer').focus();
    }
  } catch (error) {
    document.getElementById('captchaMsg').textContent = '❌ Network error verifying CAPTCHA';
    console.error('CAPTCHA verification error:', error);
  }
}

// Show CAPTCHA modal
async function showCaptchaModal() {
  createCaptchaModal();
  await loadNewCaptcha();
  document.getElementById('captchaModal').classList.add('show');
  document.getElementById('captchaModal').style.display = 'flex';
  document.getElementById('captchaAnswer').focus();
}

// Hide CAPTCHA modal
function hideCaptchaModal() {
  const modal = document.getElementById('captchaModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
  currentCaptcha = null;
}

// Handle API responses that require CAPTCHA
function handleCaptchaResponse(response, retryCallback) {
  if (response.code === 'CAPTCHA_REQUIRED') {
    window.pendingCaptchaCallback = retryCallback;
    showCaptchaModal();
    return true;
  }
  return false;
}

// Enhanced fetch wrapper that handles CAPTCHA challenges
async function secureApiFetch(url, options = {}, retryCallback = null) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok && data.code === 'CAPTCHA_REQUIRED') {
      if (retryCallback) {
        window.pendingCaptchaCallback = () => secureApiFetch(url, options, retryCallback);
        await showCaptchaModal();
        return null; // Will retry after CAPTCHA
      }
    }
    
    return { response, data };
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Export functions
export {
  showCaptchaModal,
  hideCaptchaModal,
  handleCaptchaResponse,
  secureApiFetch,
  loadNewCaptcha,
  verifyCaptchaAnswer
};