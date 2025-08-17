(function() {
    'use strict';
    
    // Configuration constants
    const EXTENSION_CONFIG = {
        SCAN_INTERVAL: 2000,
        CHALLENGE_TIMEOUT: 3000,
        MODAL_ANIMATION_DELAY: 500,
        NIGHT_START: 22,
        NIGHT_END: 8,
        DEFAULT_SETTINGS: {
            enabled: true,
            nightMode: false,
            numProblems: 3,
            timeLimit: 60
        },
        SEND_BUTTON_SELECTORS: [
            '[role="button"][data-tooltip*="Send"]',
            '[aria-label*="Send"]', 
            '[data-tooltip*="Send"]',
            'div[data-tooltip="Send (Ctrl+Enter)"]',
            '.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3',
            '[data-testid="send"]',
            'button[name="send"]',
            '.Am.Al.editable .T-I.J-J5-Ji.aoO.T-I-atl.L3'
        ]
    };
    
    console.log('Mail Goggles v4.2 initialized');
    
    if (!window.location.hostname.includes('mail.google.com')) {
        return;
    }
    
    let challengeActive = false;
    let settings = { ...EXTENSION_CONFIG.DEFAULT_SETTINGS };
    
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
     * Load settings from Chrome storage with error handling
     * @returns {Promise<Object>} Promise resolving to settings
     */
    function loadSettings() {
        return new Promise((resolve) => {
            try {
                if (!chrome || !chrome.storage || !chrome.storage.sync) {
                    console.error('Chrome storage API not available');
                    resolve(settings);
                    return;
                }
                
                chrome.storage.sync.get(EXTENSION_CONFIG.DEFAULT_SETTINGS, function(result) {
                    if (chrome.runtime.lastError) {
                        console.error('Error loading settings:', chrome.runtime.lastError.message);
                        resolve(settings);
                    } else {
                        settings = validateSettings(result);
                        console.log('Settings loaded:', JSON.stringify(settings));
                        resolve(settings);
                    }
                });
            } catch (error) {
                console.error('Settings load failed:', error);
                resolve(settings);
            }
        });
    }
    
    /**
     * Check if extension should be active based on settings
     * @returns {boolean} Whether extension should be active
     */
    function shouldBeActive() {
        if (!settings.enabled) {
            console.log('Extension disabled in settings');
            return false;
        }
        
        if (!settings.nightMode) {
            console.log('Always active mode');
            return true;
        }
        
        const now = new Date();
        const hour = now.getHours();
        const isNightTime = hour >= EXTENSION_CONFIG.NIGHT_START || hour < EXTENSION_CONFIG.NIGHT_END;
        
        console.log(`Current hour: ${hour}, Night time: ${isNightTime}`);
        
        if (!isNightTime) {
            console.log('Night mode enabled but not night time');
            return false;
        }
        
        console.log('Night mode active');
        return true;
    }
    
    /**
     * Generate a random math problem
     * @returns {{question: string, answer: number}} Math problem object
     */
    function generateMathProblem() {
        const num1 = Math.floor(Math.random() * 25) + 5;
        const num2 = Math.floor(Math.random() * 25) + 5;
        const operators = ['+', '-', '*'];
        const operator = operators[Math.floor(Math.random() * operators.length)];
        
        let answer;
        let question;
        
        switch(operator) {
            case '+':
                answer = num1 + num2;
                question = `${num1} + ${num2}`;
                break;
            case '-':
                const larger = Math.max(num1, num2);
                const smaller = Math.min(num1, num2);
                answer = larger - smaller;
                question = `${larger} - ${smaller}`;
                break;
            case '*':
                const smallNum1 = Math.floor(Math.random() * 12) + 2;
                const smallNum2 = Math.floor(Math.random() * 12) + 2;
                answer = smallNum1 * smallNum2;
                question = `${smallNum1} × ${smallNum2}`;
                break;
        }
        
        return { question, answer };
    }
    
    /**
     * Find and protect Gmail send buttons
     */
    function findAndProtectSendButtons() {
        EXTENSION_CONFIG.SEND_BUTTON_SELECTORS.forEach(function(selector) {
            try {
                const buttons = document.querySelectorAll(selector);
                
                buttons.forEach(function(button) {
                    if (button.dataset.gadiProtected) {
                        return;
                    }
                    
                    const buttonText = button.textContent.toLowerCase();
                    const isVisibleSendButton = (
                        buttonText.includes('send') && 
                        !buttonText.includes('feedback') &&
                        button.offsetParent !== null
                    );
                    
                    if (!isVisibleSendButton) {
                        return;
                    }
                    
                    button.dataset.gadiProtected = 'true';
                    console.log('Protecting send button:', button.textContent.trim());
                    
                    button.addEventListener('click', function(event) {
                        if (challengeActive) {
                            return;
                        }
                        
                        console.log('Send button clicked - loading fresh settings...');
                        
                        loadSettings().then(() => {
                            console.log('Using settings for challenge:', JSON.stringify(settings));
                            
                            if (!shouldBeActive()) {
                                console.log('Extension not active, allowing email to send');
                                return;
                            }
                            
                            console.log('Intercepting email send');
                            
                            event.preventDefault();
                            event.stopPropagation();
                            event.stopImmediatePropagation();
                            
                            showMathChallenge(settings, function() {
                                console.log('Challenge passed - sending email');
                                
                                challengeActive = true;
                                
                                setTimeout(function() {
                                    button.dataset.gadiProtected = '';
                                    button.click();
                                    
                                    setTimeout(function() {
                                        challengeActive = false;
                                        button.dataset.gadiProtected = 'true';
                                    }, EXTENSION_CONFIG.CHALLENGE_TIMEOUT);
                                }, EXTENSION_CONFIG.MODAL_ANIMATION_DELAY);
                            });
                        }).catch(error => {
                            console.error('Error in send button handler:', error);
                        });
                    }, true);
                });
            } catch (error) {
                console.error('Error in findAndProtectSendButtons:', error);
            }
        });
    }
    
    /**
     * Display the math challenge modal
     * @param {Object} currentSettings - Current extension settings
     * @param {Function} onSuccess - Callback when challenge is passed
     */
    function showMathChallenge(currentSettings, onSuccess) {
        console.log('Starting challenge with settings:', JSON.stringify(currentSettings));
        
        if (challengeActive) return;
        challengeActive = true;
        
        const existing = document.getElementById('gadi-math-challenge');
        if (existing) {
            existing.remove();
        }
        
        let timeRemaining = currentSettings.timeLimit;
        let timerInterval = null;
        let currentProblems = [];
        let answerInputs = [];
        let questionDivs = [];
        let timerDiv = null;
        let errorDiv = null;
        
        // Generate initial problems
        for (let i = 0; i < currentSettings.numProblems; i++) {
            currentProblems.push(generateMathProblem());
        }
        
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'gadi-math-challenge';
        Object.assign(backdrop.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '999999',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backdropFilter: 'blur(3px)'
        });
        
        // Create main modal
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
            maxWidth: '420px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            textAlign: 'center',
            transform: 'scale(0.95)',
            animation: 'mailGogglesSlideIn 0.3s ease-out forwards'
        });
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes mailGogglesSlideIn {
                to {
                    transform: scale(1);
                }
            }
        `;
        document.head.appendChild(style);
        
        // Create header
        const header = document.createElement('div');
        header.textContent = '🤔';
        Object.assign(header.style, {
            fontSize: '48px',
            marginBottom: '16px'
        });
        
        const title = document.createElement('h2');
        title.textContent = 'Think Before You Send';
        Object.assign(title.style, {
            color: '#1f2937',
            fontSize: '24px',
            fontWeight: '600',
            margin: '0 0 8px 0'
        });
        
        const subtitle = document.createElement('p');
        const problemText = currentSettings.numProblems === 1 
            ? 'Solve this problem to send your email' 
            : `Solve all ${currentSettings.numProblems} problems to send your email`;
        subtitle.textContent = problemText;
        Object.assign(subtitle.style, {
            color: '#6b7280',
            fontSize: '16px',
            margin: '0 0 24px 0'
        });
        
        modal.appendChild(header);
        modal.appendChild(title);
        modal.appendChild(subtitle);
        
        // Create timer if enabled
        if (currentSettings.timeLimit > 0) {
            timerDiv = document.createElement('div');
            timerDiv.textContent = `Time: ${timeRemaining}s`;
            Object.assign(timerDiv.style, {
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '20px',
                padding: '8px 12px',
                background: '#fef2f2',
                borderRadius: '8px',
                border: '1px solid #fecaca'
            });
            modal.appendChild(timerDiv);
            
            // Function to handle timer expiration
            function handleTimerExpiration() {
                // Generate new problems
                currentProblems = [];
                for (let i = 0; i < currentSettings.numProblems; i++) {
                    currentProblems.push(generateMathProblem());
                }
                
                // Update UI
                currentProblems.forEach((problem, i) => {
                    if (questionDivs[i]) {
                        questionDivs[i].textContent = `${problem.question} = ?`;
                    }
                    if (answerInputs[i]) {
                        answerInputs[i].dataset.correct = problem.answer;
                        answerInputs[i].value = '';
                        answerInputs[i].style.borderColor = '#e5e7eb';
                        answerInputs[i].style.background = '#fafafa';
                    }
                });
                
                // Show temporary message
                if (errorDiv) {
                    errorDiv.textContent = "Time's up! New problems generated.";
                    errorDiv.style.display = 'block';
                    setTimeout(() => {
                        errorDiv.style.display = 'none';
                    }, 2000);
                }
                
                // Reset timer
                timeRemaining = currentSettings.timeLimit;
                timerDiv.textContent = `Time: ${timeRemaining}s`;
            }
            
            // Start timer
            timerInterval = setInterval(function() {
                timeRemaining--;
                timerDiv.textContent = `Time: ${timeRemaining}s`;
                
                if (timeRemaining <= 0) {
                    handleTimerExpiration();
                }
            }, 1000);
        }
        
        // Create problems container
        const problemsContainer = document.createElement('div');
        problemsContainer.style.margin = '24px 0';
        
        currentProblems.forEach((problem, i) => {
            const problemDiv = document.createElement('div');
            Object.assign(problemDiv.style, {
                padding: '20px 0',
                borderBottom: i < currentProblems.length - 1 ? '1px solid #f3f4f6' : 'none'
            });
            
            const questionDiv = document.createElement('div');
            questionDiv.textContent = `${problem.question} = ?`;
            Object.assign(questionDiv.style, {
                fontSize: '28px',
                fontWeight: '500',
                color: '#1f2937',
                marginBottom: '16px',
                fontFamily: '"SF Mono", Monaco, monospace'
            });
            
            questionDivs.push(questionDiv);
            
            const input = document.createElement('input');
            input.type = 'number';
            input.placeholder = 'Answer';
            input.dataset.correct = problem.answer;
            
            Object.assign(input.style, {
                padding: '12px 16px',
                fontSize: '20px',
                width: '120px',
                textAlign: 'center',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                background: '#fafafa',
                color: '#1f2937',
                fontWeight: '500',
                outline: 'none',
                fontFamily: '"SF Mono", Monaco, monospace',
                transition: 'all 0.2s ease'
            });
            
            // Validation function
            function validateInput(inputEl) {
                const userAnswer = parseInt(inputEl.value);
                const correctAnswer = parseInt(inputEl.dataset.correct);
                
                if (inputEl.value === '') {
                    Object.assign(inputEl.style, {
                        borderColor: '#e5e7eb',
                        background: '#fafafa',
                        boxShadow: 'none'
                    });
                } else if (userAnswer === correctAnswer) {
                    Object.assign(inputEl.style, {
                        borderColor: '#10b981',
                        background: '#f0fdf4',
                        boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.1)'
                    });
                } else {
                    Object.assign(inputEl.style, {
                        borderColor: '#ef4444',
                        background: '#fef2f2',
                        boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)'
                    });
                }
            }
            
            // Event listeners
            input.addEventListener('focus', function() {
                Object.assign(this.style, {
                    borderColor: '#3b82f6',
                    background: 'white',
                    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                });
            });
            
            input.addEventListener('blur', function() {
                validateInput(this);
            });
            
            input.addEventListener('input', function() {
                clearTimeout(this.validateTimeout);
                this.validateTimeout = setTimeout(() => {
                    validateInput(this);
                }, 300);
            });
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    validateInput(this);
                    
                    const currentIndex = answerInputs.indexOf(this);
                    if (currentIndex < answerInputs.length - 1) {
                        answerInputs[currentIndex + 1].focus();
                    } else {
                        checkAllAnswers();
                    }
                }
            });
            
            answerInputs.push(input);
            
            problemDiv.appendChild(questionDiv);
            problemDiv.appendChild(input);
            problemsContainer.appendChild(problemDiv);
        });
        
        modal.appendChild(problemsContainer);
        
        // Create submit button
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Send Email';
        Object.assign(submitBtn.style, {
            padding: '14px 32px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            marginTop: '20px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        });
        
        submitBtn.addEventListener('mouseover', function() {
            Object.assign(this.style, {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
            });
        });
        
        submitBtn.addEventListener('mouseout', function() {
            Object.assign(this.style, {
                transform: 'translateY(0)',
                boxShadow: 'none'
            });
        });
        
        modal.appendChild(submitBtn);
        
        // Create error message
        errorDiv = document.createElement('div');
        Object.assign(errorDiv.style, {
            color: '#ef4444',
            marginTop: '16px',
            fontSize: '14px',
            fontWeight: '500',
            display: 'none',
            padding: '8px 12px',
            background: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca'
        });
        modal.appendChild(errorDiv);
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        /**
         * Check all answers and determine if challenge is passed
         */
        function checkAllAnswers() {
            let allCorrect = true;
            
            answerInputs.forEach(function(input) {
                const userAnswer = parseInt(input.value);
                const correctAnswer = parseInt(input.dataset.correct);
                
                if (userAnswer !== correctAnswer || isNaN(userAnswer)) {
                    allCorrect = false;
                }
            });
            
            if (allCorrect) {
                console.log('Challenge passed');
                
                if (timerInterval) {
                    clearInterval(timerInterval);
                }
                
                submitBtn.textContent = 'Sending...';
                submitBtn.style.background = '#10b981';
                
                setTimeout(function() {
                    backdrop.remove();
                    challengeActive = false;
                    onSuccess();
                }, 800);
                
            } else {
                console.log('Challenge failed - incorrect answers');
                errorDiv.textContent = 'Please check your answers and try again.';
                errorDiv.style.display = 'block';
                
                const firstIncorrect = answerInputs.find(input => 
                    input.style.borderColor === 'rgb(239, 68, 68)'
                );
                if (firstIncorrect) {
                    firstIncorrect.focus();
                    firstIncorrect.select();
                }
                
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
        }
        
        submitBtn.addEventListener('click', checkAllAnswers);
        
        // Close on backdrop click
        backdrop.addEventListener('click', function(e) {
            if (e.target === backdrop) {
                if (timerInterval) {
                    clearInterval(timerInterval);
                }
                backdrop.remove();
                challengeActive = false;
            }
        });
        
        // Focus first input
        setTimeout(function() {
            if (answerInputs[0]) {
                answerInputs[0].focus();
            }
        }, 300);
    }
    
    // Initialize extension with error handling
    loadSettings().then(() => {
        findAndProtectSendButtons();
        setInterval(findAndProtectSendButtons, EXTENSION_CONFIG.SCAN_INTERVAL);
    }).catch(error => {
        console.error('Extension initialization failed:', error);
        // Fallback to basic functionality
        findAndProtectSendButtons();
        setInterval(findAndProtectSendButtons, EXTENSION_CONFIG.SCAN_INTERVAL);
    });
    
    // Listen for settings changes
    if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function(changes, namespace) {
            if (namespace === 'sync') {
                console.log('Settings changed, reloading...');
                loadSettings();
            }
        });
    }
    
    console.log('Mail Goggles ready');
    
})();
