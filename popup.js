// Configuration constants
const POPUP_CONFIG = {
    SAVE_TIMEOUT: 3000,
    LOAD_TIMEOUT: 3000,
    STATUS_DISPLAY_TIME: 1500,
    DEFAULT_SETTINGS: {
        enabled: true,
        nightMode: false,
        numProblems: 3,
        timeLimit: 60
    }
};

// Global state
let settings = { ...POPUP_CONFIG.DEFAULT_SETTINGS };
let isLoading = false;
let loadTimeout = null;

/**
 * Validates and sanitizes settings object
 * @param {Object} rawSettings - Raw settings from storage
 * @returns {Object} Validated settings
 */
function validateSettings(rawSettings) {
    return {
        enabled: Boolean(rawSettings.enabled),
        nightMode: Boolean(rawSettings.nightMode),
        numProblems: Math.min(Math.max(parseInt(rawSettings.numProblems) || 3, 1), 10),
        timeLimit: Math.min(Math.max(parseInt(rawSettings.timeLimit) || 60, 0), 3600)
    };
}

/**
 * Safe logging function that prevents XSS
 * @param {string} msg - Log message
 * @param {string} type - Log type (info, success, error, warning)
 */
function log(msg, type = 'info') {
    const logEl = document.getElementById('log');
    const time = new Date().toLocaleTimeString();
    const colors = {
        info: '#475569',
        success: '#059669', 
        error: '#dc2626',
        warning: '#d97706'
    };
    
    // Create elements safely instead of innerHTML to prevent XSS
    const logEntry = document.createElement('div');
    logEntry.style.color = colors[type] || colors.info;
    logEntry.textContent = `[${time}] ${msg}`; // textContent is safe from XSS
    
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
    console.log(msg);
}

/**
 * Set status message and type
 * @param {string} message - Status message
 * @param {string} type - Status type (loading, success, error)
 */
function setStatus(message, type = 'loading') {
    const status = document.getElementById('status');
    const statusIcon = status.querySelector('.status-icon');
    const statusText = status.querySelector('span');
    
    // Safely update text content
    if (statusText) {
        statusText.textContent = message;
    } else {
        // Fallback: recreate status content safely
        status.innerHTML = '';
        const icon = document.createElement('div');
        icon.className = 'status-icon';
        const text = document.createElement('span');
        text.textContent = message;
        status.appendChild(icon);
        status.appendChild(text);
    }
    
    status.className = `status ${type}`;
}

/**
 * Update UI elements based on current settings
 */
function updateUI() {
    log('Updating UI', 'info');
    
    const enabledEl = document.getElementById('enabled');
    const nightEl = document.getElementById('nightMode');
    
    if (settings.enabled) {
        enabledEl.classList.add('on');
        document.getElementById('enabledText').textContent = 'ON';
        enabledEl.parentElement.parentElement.classList.add('highlight');
    } else {
        enabledEl.classList.remove('on');
        document.getElementById('enabledText').textContent = 'OFF';
        enabledEl.parentElement.parentElement.classList.remove('highlight');
    }
    
    if (settings.nightMode) {
        nightEl.classList.add('on');
        document.getElementById('nightText').textContent = 'ON';
    } else {
        nightEl.classList.remove('on');
        document.getElementById('nightText').textContent = 'OFF';
    }
    
    document.getElementById('numProblems').value = settings.numProblems;
    document.getElementById('timeLimit').value = settings.timeLimit;
    
    log('UI updated successfully', 'success');
}

/**
 * Save settings to Chrome storage
 * @returns {Promise<void>} Promise that resolves when save is complete
 */
function saveSettings() {
    if (isLoading) return Promise.resolve();
    
    isLoading = true;
    log('Saving settings...', 'info');
    setStatus('Saving settings...', 'loading');
    
    return new Promise((resolve) => {
        if (!hasStorageAPI()) {
            log('Chrome storage not available', 'error');
            setStatus('Storage unavailable', 'error');
            isLoading = false;
            resolve();
            return;
        }
        
        // Add timeout for save operation
        const saveTimeout = setTimeout(() => {
            isLoading = false;
            log('Save operation timed out', 'warning');
            setStatus('Save timeout - using defaults', 'warning');
            resolve();
        }, POPUP_CONFIG.SAVE_TIMEOUT);
        
        try {
            chrome.storage.sync.set(settings, function() {
                clearTimeout(saveTimeout);
                isLoading = false;
                
                if (chrome.runtime.lastError) {
                    log('Save error: ' + chrome.runtime.lastError.message, 'error');
                    setStatus('Save failed', 'error');
                } else {
                    log('Settings saved: ' + JSON.stringify(settings), 'success');
                    setStatus('Settings saved!', 'success');
                    setTimeout(() => {
                        setStatus('Ready', 'success');
                    }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
                }
                resolve();
            });
        } catch (error) {
            clearTimeout(saveTimeout);
            isLoading = false;
            log('Save exception: ' + error.message, 'error');
            setStatus('Save failed', 'error');
            resolve();
        }
    });
}

/**
 * Load settings from Chrome storage
 * @returns {Promise<void>} Promise that resolves when load is complete
 */
function loadSettings() {
    if (isLoading) return Promise.resolve();
    
    isLoading = true;
    log('Loading settings...', 'info');
    setStatus('Loading settings...', 'loading');
    
    return new Promise((resolve) => {
        if (!hasStorageAPI()) {
            log('Chrome storage not available, using defaults', 'warning');
            setStatus('Using defaults', 'warning');
            isLoading = false;
            updateUI();
            setTimeout(() => {
                setStatus('Ready', 'success');
            }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
            resolve();
            return;
        }
        
        // Add timeout to prevent hanging
        loadTimeout = setTimeout(() => {
            isLoading = false;
            log('Load operation timed out, using defaults', 'warning');
            setStatus('Load timeout - using defaults', 'warning');
            updateUI();
            setTimeout(() => {
                setStatus('Ready', 'success');
            }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
            resolve();
        }, POPUP_CONFIG.LOAD_TIMEOUT);
        
        try {
            chrome.storage.sync.get(POPUP_CONFIG.DEFAULT_SETTINGS, function(result) {
                if (loadTimeout) {
                    clearTimeout(loadTimeout);
                    loadTimeout = null;
                }
                isLoading = false;
                
                if (chrome.runtime.lastError) {
                    log('Load error: ' + chrome.runtime.lastError.message, 'error');
                    setStatus('Load failed - using defaults', 'warning');
                } else {
                    log('Settings loaded: ' + JSON.stringify(result), 'success');
                    settings = validateSettings(result);
                    setStatus('Settings loaded!', 'success');
                    setTimeout(() => {
                        setStatus('Ready', 'success');
                    }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
                }
                updateUI();
                resolve();
            });
        } catch (error) {
            if (loadTimeout) {
                clearTimeout(loadTimeout);
                loadTimeout = null;
            }
            isLoading = false;
            log('Load exception: ' + error.message, 'error');
            setStatus('Load failed - using defaults', 'warning');
            updateUI();
            setTimeout(() => {
                setStatus('Ready', 'success');
            }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
            resolve();
        }
    });
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    
    log('Resetting to defaults...', 'info');
    settings = { ...POPUP_CONFIG.DEFAULT_SETTINGS };
    updateUI();
    saveSettings();
}

/**
 * Check if Chrome storage API is available
 * @returns {boolean} Whether storage API is available
 */
function hasStorageAPI() {
    return !!(chrome?.storage?.sync);
}

/**
 * Setup event listeners for UI elements
 */
function setupEvents() {
    log('Setting up event listeners...', 'info');
    
    document.getElementById('enabled').onclick = function() {
        if (isLoading) return;
        log('Enabled toggle clicked', 'info');
        settings.enabled = !settings.enabled;
        updateUI();
        saveSettings();
    };
    
    document.getElementById('nightMode').onclick = function() {
        if (isLoading) return;
        log('Night mode toggle clicked', 'info');
        settings.nightMode = !settings.nightMode;
        updateUI();
        saveSettings();
    };
    
    document.getElementById('numProblems').onchange = function() {
        if (isLoading) return;
        log('Problems count changed to ' + this.value, 'info');
        settings.numProblems = parseInt(this.value);
        saveSettings();
    };
    
    document.getElementById('timeLimit').onchange = function() {
        if (isLoading) return;
        log('Time limit changed to ' + this.value, 'info');
        settings.timeLimit = parseInt(this.value);
        saveSettings();
    };
    
    document.getElementById('testBtn').onclick = function() {
        log('Test button clicked - reloading...', 'info');
        // Clear any existing timeout first
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
        isLoading = false;
        loadSettings();
    };
    
    document.getElementById('resetBtn').onclick = resetSettings;
    
    log('Event listeners set up', 'success');
}

/**
 * Initialize the popup
 */
function init() {
    log('=== Mail Goggles Popup v4.2 ===', 'info');
    
    // Test Chrome API
    log('Chrome object: ' + typeof chrome, 'info');
    if (typeof chrome !== 'undefined') {
        log('Storage API: ' + typeof chrome.storage, 'info');
        if (chrome.runtime && chrome.runtime.id) {
            log('Extension ID: ' + chrome.runtime.id, 'info');
        }
    }
    
    setupEvents();
    loadSettings();
    
    log('Initialization complete', 'success');
}

// Initialize popup with error handling
document.getElementById('status').innerHTML = '<div class="status-icon"></div><span>Script loaded!</span>';
document.getElementById('status').className = 'status success';

setTimeout(() => {
    try {
        init();
    } catch (error) {
        log('Initialization error: ' + error.message, 'error');
        setStatus('Init failed - using defaults', 'warning');
        isLoading = false;
        updateUI();
        setTimeout(() => {
            setStatus('Ready', 'success');
        }, POPUP_CONFIG.STATUS_DISPLAY_TIME);
    }
}, 100);

// DOM ready fallback
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        log('DOM ready fallback triggered', 'info');
        if (document.getElementById('status').textContent.includes('Initializing')) {
            try {
                init();
            } catch (error) {
                log('DOM init error: ' + error.message, 'error');
                setStatus('Ready', 'success');
                updateUI();
            }
        }
    });
}

// Global error handling
window.addEventListener('error', function(e) {
    log('ERROR: ' + e.message, 'error');
    setStatus('JavaScript error', 'error');
});

log('Popup script loaded', 'success');
