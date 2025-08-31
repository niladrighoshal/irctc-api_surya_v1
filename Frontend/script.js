// Application state
const state = {
    credentials: [],
    proxies: [],
    bookingGroups: [],
    isRunning: false,
    sessions: [],
    stations: [],
    serverTimeOffset: 0
};

// DOM Elements
const startBookingBtn = document.getElementById('startBooking');
const stopSessionsBtn = document.getElementById('stopSessions');
const totalSessionsInput = document.getElementById('totalSessions');
const sessionsPerCredentialInput = document.getElementById('sessionsPerCredential');
const ocrMethodSelect = document.getElementById('ocrMethod');
const useProxiesToggle = document.getElementById('useProxies');
const credentialCount = document.getElementById('credentialCount');
const proxyCountBadge = document.getElementById('proxyCountBadge');
const proxyCount = document.getElementById('proxyCount');
const toggleCredentialForm = document.getElementById('toggleCredentialForm');
const credentialForm = document.getElementById('credentialForm');
const userIdInput = document.getElementById('userIdInput');
const passwordInput = document.getElementById('passwordInput');
const addCredentialBtn = document.getElementById('addCredential');
const credentialsList = document.getElementById('credentialsList');
const toggleProxyForm = document.getElementById('toggleProxyForm');
const proxyForm = document.getElementById('proxyForm');
const proxyInput = document.getElementById('proxyInput');
const addProxyBtn = document.getElementById('addProxy');
const proxyFileUpload = document.getElementById('proxyFileUpload');
const proxiesList = document.getElementById('proxiesList');
const bookingGroupsView = document.getElementById('bookingGroupsView');
const statusDashboardView = document.getElementById('statusDashboardView');
const bookingGroupsContainer = document.getElementById('bookingGroups');
const addGroupBtn = document.getElementById('addGroup');
const statusDashboard = document.getElementById('statusDashboard');
const realTimeClock = document.getElementById('realTimeClock');
const groupsOverview = document.getElementById('groupsOverview');

// Initialize the application
async function init() {
    await loadStations();
    loadFromLocalStorage();
    renderCredentialsList();
    renderProxiesList();
    renderBookingGroups();
    renderGroupsOverview();
    setupEventListeners();
    updateCounts();
    startRealTimeClock();
    fetchServerTime();
}

// Load stations from JSON file
async function loadStations() {
    try {
        const response = await fetch('railwayStationsList.json');
        if (response.ok) {
            const data = await response.json();
            state.stations = data.stations;
        } else {
            console.error('Failed to load stations:', response.status);
        }
    } catch (error) {
        console.error('Error loading stations:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    startBookingBtn.addEventListener('click', startBooking);
    stopSessionsBtn.addEventListener('click', stopSessions);
    
    toggleCredentialForm.addEventListener('click', () => {
        credentialForm.classList.toggle('hidden');
    });
    
    toggleProxyForm.addEventListener('click', () => {
        proxyForm.classList.toggle('hidden');
    });
    
    addCredentialBtn.addEventListener('click', addCredential);
    addProxyBtn.addEventListener('click', addProxy);
    addGroupBtn.addEventListener('click', addBookingGroup);
    proxyFileUpload.addEventListener('change', handleProxyFileUpload);
    
    // Auto-save when inputs change
    const saveableInputs = [
        totalSessionsInput, sessionsPerCredentialInput, ocrMethodSelect, useProxiesToggle
    ];
    
    saveableInputs.forEach(input => {
        input.addEventListener('change', saveToLocalStorage);
    });
    
    // Uppercase transformation for station inputs
    document.addEventListener('input', function(e) {
        if (e.target.matches('.station-input')) {
            e.target.value = e.target.value.toUpperCase();
            showStationSuggestions(e.target);
        }
    });
}

// Fetch server time to sync clock
async function fetchServerTime() {
    try {
        // In a real application, this would be an API call to your backend
        // For now, we'll simulate a small random offset
        state.serverTimeOffset = Math.floor(Math.random() * 120000) - 60000; // ±1 minute
        console.log('Simulated server time offset:', state.serverTimeOffset, 'ms');
    } catch (error) {
        console.error('Error fetching server time:', error);
    }
}

// Start real-time clock with server time
function startRealTimeClock() {
    function updateClock() {
        const now = new Date(Date.now() + state.serverTimeOffset);
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
        
        realTimeClock.textContent = `${day}:${month}:${year}-${hours}:${minutes}:${seconds}.${milliseconds}`;
    }
    
    updateClock();
    setInterval(updateClock, 1);
}

// Show station suggestions
function showStationSuggestions(input) {
    // Remove any existing suggestions
    const existingSuggestions = document.getElementById('stationSuggestions');
    if (existingSuggestions) {
        existingSuggestions.remove();
    }
    
    const value = input.value.toUpperCase();
    if (value.length < 2) return;
    
    // Filter stations
    const filteredStations = state.stations.filter(station => 
        station.stnCode.includes(value) || station.stnName.toUpperCase().includes(value)
    ).slice(0, 10); // Limit to 10 suggestions
    
    if (filteredStations.length === 0) return;
    
    // Create suggestions container
    const suggestions = document.createElement('div');
    suggestions.id = 'stationSuggestions';
    suggestions.className = 'station-suggestions';
    
    // Add suggestion items
    filteredStations.forEach(station => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = `${station.stnCode} - ${station.stnName}`;
        item.addEventListener('click', () => {
            input.value = station.stnCode;
            suggestions.remove();
            
            // Trigger change event to save to localStorage
            const event = new Event('change');
            input.dispatchEvent(event);
        });
        suggestions.appendChild(item);
    });
    
    // Position and add to DOM
    const rect = input.getBoundingClientRect();
    suggestions.style.position = 'absolute';
    suggestions.style.top = `${rect.bottom + window.scrollY}px`;
    suggestions.style.left = `${rect.left + window.scrollX}px`;
    suggestions.style.width = `${rect.width}px`;
    
    document.body.appendChild(suggestions);
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function closeSuggestions(e) {
        if (!suggestions.contains(e.target) && e.target !== input) {
            suggestions.remove();
            document.removeEventListener('click', closeSuggestions);
        }
    });
}

// Load data from localStorage
function loadFromLocalStorage() {
    const savedState = localStorage.getItem('irctcBookingState');
    if (savedState) {
        const parsed = JSON.parse(savedState);
        
        // Restore simple values
        if (parsed.totalSessions) totalSessionsInput.value = parsed.totalSessions;
        if (parsed.sessionsPerCredential) sessionsPerCredentialInput.value = parsed.sessionsPerCredential;
        if (parsed.ocrMethod) ocrMethodSelect.value = parsed.ocrMethod;
        if (parsed.useProxies !== undefined) useProxiesToggle.checked = parsed.useProxies;
        
        // Restore arrays
        if (parsed.credentials) state.credentials = parsed.credentials;
        if (parsed.proxies) state.proxies = parsed.proxies;
        if (parsed.bookingGroups) state.bookingGroups = parsed.bookingGroups;
    }
}

// Save data to localStorage
function saveToLocalStorage() {
    const stateToSave = {
        totalSessions: totalSessionsInput.value,
        sessionsPerCredential: sessionsPerCredentialInput.value,
        ocrMethod: ocrMethodSelect.value,
        useProxies: useProxiesToggle.checked,
        credentials: state.credentials,
        proxies: state.proxies,
        bookingGroups: state.bookingGroups
    };
    
    localStorage.setItem('irctcBookingState', JSON.stringify(stateToSave));
    updateCounts();
    renderGroupsOverview();
}

// Update counts display
function updateCounts() {
    credentialCount.textContent = state.credentials.length;
    proxyCount.textContent = state.proxies.length;
    proxyCountBadge.textContent = state.proxies.length;
}

// Render credentials list
function renderCredentialsList() {
    credentialsList.innerHTML = '';
    state.credentials.forEach((cred, index) => {
        const item = document.createElement('div');
        item.className = 'credential-item';
        item.innerHTML = `
            <div class="credential-info">${cred.userId}</div>
            <div class="credential-actions">
                <button class="delete-btn" data-index="${index}">❌</button>
            </div>
        `;
        credentialsList.appendChild(item);
    });
    
    // Add delete event listeners
    document.querySelectorAll('#credentialsList .delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.delete-btn').dataset.index);
            state.credentials.splice(index, 1);
            saveToLocalStorage();
            renderCredentialsList();
        });
    });
}

// Render proxies list
function renderProxiesList() {
    proxiesList.innerHTML = '';
    state.proxies.forEach((proxy, index) => {
        const item = document.createElement('div');
        item.className = 'proxy-item';
        item.innerHTML = `
            <div class="proxy-info">${proxy}</div>
            <div class="proxy-actions">
                <button class="delete-btn" data-index="${index}">❌</button>
            </div>
        `;
        proxiesList.appendChild(item);
    });
    
    // Add delete event listeners
    document.querySelectorAll('#proxiesList .delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.delete-btn').dataset.index);
            state.proxies.splice(index, 1);
            saveToLocalStorage();
            renderProxiesList();
        });
    });
}

// Add a new credential
function addCredential() {
    const userId = userIdInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (userId && password) {
        state.credentials.push({ userId, password });
        saveToLocalStorage();
        renderCredentialsList();
        
        // Clear and hide form
        userIdInput.value = '';
        passwordInput.value = '';
        credentialForm.classList.add('hidden');
    }
}

// Add a new proxy
function addProxy() {
    const proxy = proxyInput.value.trim();
    
    if (proxy) {
        state.proxies.push(proxy);
        saveToLocalStorage();
        renderProxiesList();
        
        // Clear and hide form
        proxyInput.value = '';
        proxyForm.classList.add('hidden');
    }
}

// Handle proxy file upload
function handleProxyFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n').filter(line => line.trim() !== '');
        
        lines.forEach(line => {
            const proxy = line.trim();
            if (proxy && !state.proxies.includes(proxy)) {
                state.proxies.push(proxy);
            }
        });
        
        saveToLocalStorage();
        renderProxiesList();
        event.target.value = ''; // Reset file input
    };
    
    reader.readAsText(file);
}

// Render groups overview in sidebar
function renderGroupsOverview() {
    groupsOverview.innerHTML = '';
    
    if (state.bookingGroups.length === 0) {
        groupsOverview.innerHTML = '<div class="no-groups">No groups saved</div>';
        return;
    }
    
    // Show groups in reverse order (newest first)
    [...state.bookingGroups].reverse().forEach((group, index) => {
        const originalIndex = state.bookingGroups.length - 1 - index;
        const item = document.createElement('div');
        item.className = 'group-overview-item';
        item.dataset.index = originalIndex;
        
        const fromCode = group.from || 'XXX';
        const toCode = group.to || 'XXX';
        const date = group.date ? formatDateForDisplay(group.date) : 'DD.MM';
        const train = group.train || 'XXXXX';
        
        item.innerHTML = `
            <div class="group-overview-title">${fromCode} - ${toCode}</div>
            <div class="group-overview-details">${date} | Train: ${train}</div>
        `;
        
        item.addEventListener('click', () => {
            // Scroll to and expand this group
            const groupElement = document.querySelector(`.booking-group-card:nth-child(${originalIndex + 1})`);
            if (groupElement) {
                groupElement.scrollIntoView({ behavior: 'smooth' });
                const content = groupElement.querySelector('.group-content');
                if (content && content.style.display === 'none') {
                    content.style.display = 'block';
                    state.bookingGroups[originalIndex].collapsed = false;
                    saveToLocalStorage();
                }
            }
        });
        
        groupsOverview.appendChild(item);
    });
}

// Format date for display (from yyyymmdd to DD.MM)
function formatDateForDisplay(dateStr) {
    if (dateStr.length !== 8) return dateStr;
    return `${dateStr.slice(6, 8)}.${dateStr.slice(4, 6)}`;
}

// Render booking groups
function renderBookingGroups() {
    bookingGroupsContainer.innerHTML = '';
    
    state.bookingGroups.forEach((group, groupIndex) => {
        const groupElement = document.createElement('div');
        groupElement.className = `booking-group-card ${group.collapsed ? 'collapsed' : ''}`;
        groupElement.innerHTML = `
            <div class="group-header" data-group-index="${groupIndex}">
                <div class="group-title">Booking Group ${groupIndex + 1}</div>
                <button class="btn btn-danger delete-group" data-group-index="${groupIndex}">Delete Group</button>
            </div>
            <div class="group-content" data-group-index="${groupIndex}" style="display: ${group.collapsed ? 'none' : 'block'}">
                <div class="group-form">
                    <div class="form-group">
                        <label for="fromStation${groupIndex}">From Station *</label>
                        <input type="text" id="fromStation${groupIndex}" value="${group.from || ''}" 
                            data-group-index="${groupIndex}" data-field="from" required class="station-input">
                    </div>
                    <div class="form-group">
                        <label for="toStation${groupIndex}">To Station *</label>
                        <input type="text" id="toStation${groupIndex}" value="${group.to || ''}" 
                            data-group-index="${groupIndex}" data-field="to" required class="station-input">
                    </div>
                    <div class="form-group">
                        <label for="journeyDate${groupIndex}">Date *</label>
                        <input type="date" id="journeyDate${groupIndex}" value="${group.date ? formatDateForInput(group.date) : getDefaultDate()}" 
                            data-group-index="${groupIndex}" data-field="date" required
                            min="${getTodayDate()}" max="${getMaxDate()}">
                    </div>
                    <div class="form-group">
                        <label for="trainClass${groupIndex}">Class *</label>
                        <select id="trainClass${groupIndex}" data-group-index="${groupIndex}" data-field="class" required>
                            <option value="">Select Class</option>
                            <option value="2A" ${group.class === '2A' ? 'selected' : ''}>2A</option>
                            <option value="3A" ${group.class === '3A' ? 'selected' : ''}>3A</option>
                            <option value="SL" ${group.class === 'SL' ? 'selected' : ''}>SL</option>
                            <option value="CC" ${group.class === 'CC' ? 'selected' : ''}>CC</option>
                            <option value="2S" ${group.class === '2S' ? 'selected' : ''}>2S</option>
                            <option value="FC" ${group.class === 'FC' ? 'selected' : ''}>FC</option>
                            <option value="1A" ${group.class === '1A' ? 'selected' : ''}>1A</option>
                            <option value="3E" ${group.class === '3E' ? 'selected' : ''}>3E</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="quota${groupIndex}">Quota *</label>
                        <select id="quota${groupIndex}" data-group-index="${groupIndex}" data-field="quota" required>
                            <option value="">Select Quota</option>
                            <option value="GN" ${group.quota === 'GN' ? 'selected' : ''}>GN</option>
                            <option value="TQ" ${group.quota === 'TQ' ? 'selected' : ''}>TQ</option>
                            <option value="PT" ${group.quota === 'PT' ? 'selected' : ''}>PT</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="trainNumber${groupIndex}">Train Number *</label>
                        <input type="text" id="trainNumber${groupIndex}" value="${group.train || ''}" 
                            data-group-index="${groupIndex}" data-field="train" pattern="[0-9]{5}" required
                            title="Train number must be a 5-digit number">
                    </div>
                    <div class="form-group">
                        <label for="upiId${groupIndex}">UPI ID *</label>
                        <input type="text" id="upiId${groupIndex}" value="${group.upiId || ''}" 
                            data-group-index="${groupIndex}" data-field="upiId" required
                            pattern=".+@.+" title="UPI ID must contain @ symbol">
                    </div>
                    <div class="form-group">
                        <label for="mobileNumber${groupIndex}">Mobile Number *</label>
                        <input type="text" id="mobileNumber${groupIndex}" value="${group.mobileNumber ? group.mobileNumber.replace('+91', '') : ''}" 
                            data-group-index="${groupIndex}" data-field="mobileNumber" pattern="[0-9]{10}" required
                            title="Mobile number must be 10 digits">
                    </div>
                    <div class="checkbox-group">
                        <div class="checkbox-item">
                            <input type="checkbox" id="autoUpgrade${groupIndex}" 
                                data-group-index="${groupIndex}" data-field="autoUpgrade" 
                                ${group.autoUpgrade !== false ? 'checked' : ''}>
                            <label for="autoUpgrade${groupIndex}">Consider for auto upgradation</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="confirmBerth${groupIndex}" 
                                data-group-index="${groupIndex}" data-field="confirmBerth"
                                ${group.confirmBerth !== false ? 'checked' : ''}>
                            <label for="confirmBerth${groupIndex}">Book only if confirm berth is alloted</label>
                        </div>
                        ${group.quota === 'GN' ? `
                        <div class="timer-input" id="timerContainer${groupIndex}">
                            <label>Timer (HH:MM:SS):</label>
                            <input type="number" id="timerHours${groupIndex}" min="0" max="6" value="0" placeholder="HH">
                            <span class="timer-separator">:</span>
                            <input type="number" id="timerMinutes${groupIndex}" min="0" max="59" value="0" placeholder="MM">
                            <span class="timer-separator">:</span>
                            <input type="number" id="timerSeconds${groupIndex}" min="0" max="59" value="0" placeholder="SS">
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="passengers-section">
                    <h4>Passengers</h4>
                    <div class="passengers-list" id="passengersList${groupIndex}">
                        ${renderPassengers(groupIndex, group.passengers || [])}
                    </div>
                    <button class="btn btn-primary add-passenger-btn" data-group-index="${groupIndex}" 
                        ${!group.quota ? 'disabled' : ''}>Add Passenger</button>
                </div>
                <button class="btn btn-success submit-group-btn" data-group-index="${groupIndex}">Submit Group</button>
            </div>
        `;
        
        bookingGroupsContainer.appendChild(groupElement);
    });
    
    // Add event listeners for group inputs
    document.querySelectorAll('.group-form input, .group-form select, .group-form input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const groupIndex = parseInt(e.target.dataset.groupIndex);
            const field = e.target.dataset.field;
            let value;
            
            if (e.target.type === 'checkbox') {
                value = e.target.checked;
            } else if (field === 'date') {
                // Convert date to yyyymmdd format
                const dateObj = new Date(e.target.value);
                value = dateObj.toISOString().slice(0, 10).replace(/-/g, '');
            } else if (field === 'mobileNumber' && e.target.value) {
                // Add +91 prefix for mobile numbers
                value = '+91' + e.target.value;
            } else {
                value = e.target.value;
            }
            
            if (!state.bookingGroups[groupIndex]) return;
            
            state.bookingGroups[groupIndex][field] = value;
            saveToLocalStorage();
            
            // Enable/disable add passenger button based on quota selection
            if (field === 'quota') {
                const addPassengerBtn = document.querySelector(`.add-passenger-btn[data-group-index="${groupIndex}"]`);
                if (addPassengerBtn) {
                    addPassengerBtn.disabled = !value;
                }
                
                // Show/hide timer based on quota
                const timerContainer = document.getElementById(`timerContainer${groupIndex}`);
                if (timerContainer) {
                    timerContainer.style.display = value === 'GN' ? 'flex' : 'none';
                }
                
                // Re-render to update UI
                renderBookingGroups();
            }
        });
    });
    
    // Add event listeners for delete group buttons
    document.querySelectorAll('.delete-group').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const groupIndex = parseInt(e.target.dataset.groupIndex);
            state.bookingGroups.splice(groupIndex, 1);
            saveToLocalStorage();
            renderBookingGroups();
            renderGroupsOverview();
        });
    });
    
    // Add event listeners for group header collapse/expand
    document.querySelectorAll('.group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-group')) {
                const groupIndex = parseInt(e.target.closest('.group-header').dataset.groupIndex);
                const content = document.querySelector(`.group-content[data-group-index="${groupIndex}"]`);
                const groupCard = document.querySelector(`.booking-group-card:nth-child(${groupIndex + 1})`);
                
                if (content && groupCard) {
                    const isVisible = content.style.display !== 'none';
                    content.style.display = isVisible ? 'none' : 'block';
                    groupCard.classList.toggle('collapsed', isVisible);
                    state.bookingGroups[groupIndex].collapsed = isVisible;
                    saveToLocalStorage();
                }
            }
        });
    });
    
    // Add event listeners for add passenger buttons
    document.querySelectorAll('.add-passenger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const groupIndex = parseInt(e.target.dataset.groupIndex);
            const group = state.bookingGroups[groupIndex];
            
            if (!group.passengers) {
                group.passengers = [];
            }
            
            // Check passenger limit based on quota
            const maxPassengers = (group.quota === 'GN') ? 6 : 4;
            if (group.passengers.length >= maxPassengers) {
                alert(`Maximum ${maxPassengers} passengers allowed for ${group.quota} quota`);
                return;
            }
            
            group.passengers.push({
                name: '',
                age: '',
                gender: 'M',
                berthChoice: 'No Preference'
            });
            
            saveToLocalStorage();
            renderBookingGroups();
        });
    });
    
    // Add event listeners for submit group buttons
    document.querySelectorAll('.submit-group-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const groupIndex = parseInt(e.target.dataset.groupIndex);
            const group = state.bookingGroups[groupIndex];
            
            // Validate all required fields
            let isValid = true;
            const requiredFields = ['from', 'to', 'date', 'class', 'quota', 'train', 'upiId', 'mobileNumber'];
            
            for (const field of requiredFields) {
                if (!group[field]) {
                    isValid = false;
                    alert(`Please fill in all required fields for Group ${groupIndex + 1}`);
                    break;
                }
            }
            
            // Validate UPI ID format
            if (isValid && !group.upiId.includes('@')) {
                isValid = false;
                alert('UPI ID must contain @ symbol');
            }
            
            // Validate mobile number format
            if (isValid && group.mobileNumber.replace('+91', '').length !== 10) {
                isValid = false;
                alert('Mobile number must be 10 digits');
            }
            
            // Validate train number format
            if (isValid && !/^\d{5}$/.test(group.train)) {
                isValid = false;
                alert('Train number must be a 5-digit number');
            }
            
            // Validate passengers
            if (isValid && (!group.passengers || group.passengers.length === 0)) {
                isValid = false;
                alert('Please add at least one passenger');
            }
            
            if (isValid) {
                alert(`Group ${groupIndex + 1} submitted successfully!`);
                // In a real application, you would send this data to the backend
            }
        });
    });
}

// Format date for input (from yyyymmdd to yyyy-mm-dd)
function formatDateForInput(dateStr) {
    if (dateStr.length !== 8) return dateStr;
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

// Render passengers for a booking group
function renderPassengers(groupIndex, passengers) {
    if (!passengers || passengers.length === 0) {
        return '<div class="no-passengers">No passengers added</div>';
    }
    
    return passengers.map((passenger, passengerIndex) => `
        <div class="passenger-item">
            <input type="text" placeholder="Name *" value="${passenger.name || ''}" 
                data-group-index="${groupIndex}" data-passenger-index="${passengerIndex}" data-field="name" 
                maxlength="16" required>
            <input type="number" placeholder="Age *" value="${passenger.age || ''}" 
                data-group-index="${groupIndex}" data-passenger-index="${passengerIndex}" data-field="age" 
                min="1" max="99" required>
            <select data-group-index="${groupIndex}" data-passenger-index="${passengerIndex}" data-field="gender" required>
                <option value="M" ${passenger.gender === 'M' ? 'selected' : ''}>Male</option>
                <option value="F" ${passenger.gender === 'F' ? 'selected' : ''}>Female</option>
                <option value="T" ${passenger.gender === 'T' ? 'selected' : ''}>Transgender</option>
            </select>
            <select data-group-index="${groupIndex}" data-passenger-index="${passengerIndex}" data-field="berthChoice">
                <option value="No Preference" ${passenger.berthChoice === 'No Preference' ? 'selected' : ''}>No Preference</option>
                <option value="Lower" ${passenger.berthChoice === 'Lower' ? 'selected' : ''}>Lower</option>
                <option value="Middle" ${passenger.berthChoice === 'Middle' ? 'selected' : ''}>Middle</option>
                <option value="Upper" ${passenger.berthChoice === 'Upper' ? 'selected' : ''}>Upper</option>
                <option value="Side Lower" ${passenger.berthChoice === 'Side Lower' ? 'selected' : ''}>Side Lower</option>
                <option value="Side Upper" ${passenger.berthChoice === 'Side Upper' ? 'selected' : ''}>Side Upper</option>
            </select>
            <button class="delete-btn delete-passenger" 
                data-group-index="${groupIndex}" 
                data-passenger-index="${passengerIndex}">❌</button>
        </div>
    `).join('');
    
    // After rendering, we need to add event listeners for passenger inputs
    setTimeout(() => {
        // Add event listeners for passenger inputs
        document.querySelectorAll('.passenger-item input, .passenger-item select').forEach(input => {
            input.addEventListener('change', (e) => {
                const groupIndex = parseInt(e.target.dataset.groupIndex);
                const passengerIndex = parseInt(e.target.dataset.passengerIndex);
                const field = e.target.dataset.field;
                const value = e.target.value;
                
                if (!state.bookingGroups[groupIndex] || 
                    !state.bookingGroups[groupIndex].passengers ||
                    !state.bookingGroups[groupIndex].passengers[passengerIndex]) {
                    return;
                }
                
                state.bookingGroups[groupIndex].passengers[passengerIndex][field] = value;
                saveToLocalStorage();
            });
        });
        
        // Add event listeners for delete passenger buttons
        document.querySelectorAll('.delete-passenger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupIndex = parseInt(e.target.dataset.groupIndex);
                const passengerIndex = parseInt(e.target.dataset.passengerIndex);
                
                if (!state.bookingGroups[groupIndex] || 
                    !state.bookingGroups[groupIndex].passengers) {
                    return;
                }
                
                state.bookingGroups[groupIndex].passengers.splice(passengerIndex, 1);
                saveToLocalStorage();
                renderBookingGroups();
            });
        });
    }, 0);
}

// Get today's date in yyyy-mm-dd format
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Get default date (tomorrow) in yyyy-mm-dd format
function getDefaultDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
}

// Get maximum date (60 days from today) in yyyy-mm-dd format
function getMaxDate() {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 60);
    return maxDate.toISOString().split('T')[0];
}

// Add a new booking group
function addBookingGroup() {
    state.bookingGroups.push({
        from: '',
        to: '',
        date: getDefaultDate().replace(/-/g, ''),
        class: '',
        quota: '',
        train: '',
        upiId: '',
        mobileNumber: '',
        autoUpgrade: true,
        confirmBerth: true,
        passengers: [],
        collapsed: false
    });
    saveToLocalStorage();
    renderBookingGroups();
    renderGroupsOverview();
}

// Start the booking process
// Start the booking process
function startBooking() {
    if (state.credentials.length === 0) {
        alert('Please add at least one credential before starting');
        return;
    }
    
    if (state.bookingGroups.length === 0) {
        alert('Please add at least one booking group before starting');
        return;
    }
    
    // Save which groups were originally expanded before collapsing everything
    const originallyExpandedGroups = state.bookingGroups.map(group => !group.collapsed);
    
    // Prepare configuration object (only for groups that were originally expanded)
    const activeGroups = state.bookingGroups.filter((group, index) => 
        originallyExpandedGroups[index]
    );
    
    if (activeGroups.length === 0) {
        alert('Please expand at least one group to book');
        return;
    }
    
    // Validate all active groups
    for (let i = 0; i < activeGroups.length; i++) {
        const group = activeGroups[i];
        const requiredFields = ['from', 'to', 'date', 'class', 'quota', 'train', 'upiId', 'mobileNumber'];
        
        for (const field of requiredFields) {
            if (!group[field]) {
                alert(`Please fill in all required fields for Group ${i + 1}`);
                return;
            }
        }
        
        // Validate UPI ID format
        if (group.upiId && !group.upiId.includes('@')) {
            alert('UPI ID must contain @ symbol');
            return;
        }
        
        // Validate mobile number format
        if (group.mobileNumber && group.mobileNumber.replace('+91', '').length !== 10) {
            alert('Mobile number must be 10 digits');
            return;
        }
        
        // Validate train number format
        if (group.train && !/^\d{5}$/.test(group.train)) {
            alert('Train number must be a 5-digit number');
            return;
        }
        
        // Validate passengers
        if (!group.passengers || group.passengers.length === 0) {
            alert(`Please add at least one passenger for Group ${i + 1}`);
            return;
        }
    }
    
    const config = {
        globalSettings: {
            totalSessions: parseInt(totalSessionsInput.value),
            sessionsPerCredential: parseInt(sessionsPerCredentialInput.value),
            ocrMethod: ocrMethodSelect.value,
            useProxies: useProxiesToggle.checked
        },
        credentials: state.credentials,
        proxies: state.proxies,
        journeyDetails: activeGroups
    };
    
    // Update UI state - collapse ALL groups and save to localStorage
    state.bookingGroups.forEach(group => {
        group.collapsed = true; // Force collapse all groups
    });
    saveToLocalStorage();
    
    // Update UI to show all collapsed
    renderBookingGroups();
    
    // Update UI state
    state.isRunning = true;
    startBookingBtn.disabled = true;
    stopSessionsBtn.disabled = false;
    
    // Switch to status dashboard view
    bookingGroupsView.classList.add('hidden');
    statusDashboardView.classList.remove('hidden');
    
    // Initialize sessions
    initializeSessions(config.globalSettings.totalSessions);
    
    // In a real application, you would send the config to the backend via WebSocket
    console.log('Sending configuration to backend (only originally expanded groups):', config);
    
    // Simulate WebSocket connection and messages for demonstration
    simulateWebSocketConnection();
}

// Stop all sessions
// Stop all sessions
function stopSessions() {
    state.isRunning = false;
    startBookingBtn.disabled = false;
    stopSessionsBtn.disabled = true;
    
    // All groups remain collapsed as requested - no need to change anything
    
    // In a real application, you would send a stop command to the backend via WebSocket
    console.log('Sending stop command to backend');
    console.log('All groups remain collapsed as requested');
}

// Initialize session cards
function initializeSessions(totalSessions) {
    statusDashboard.innerHTML = '';
    state.sessions = [];
    
    for (let i = 1; i <= totalSessions; i++) {
        const session = {
            id: i,
            status: 'waiting',
            logs: [`Session ${i} initialized - Waiting to start...`]
        };
        
        state.sessions.push(session);
        
        const sessionCard = document.createElement('div');
        sessionCard.className = 'session-card';
        sessionCard.innerHTML = `
            <div class="session-header">
                <div class="session-id">Session ${i}</div>
                <div class="session-status status-waiting">Waiting</div>
            </div>
            <div class="log-viewer" id="logViewer${i}">
                ${session.logs.map(log => `<div class="log-entry log-info">${log}</div>`).join('')}
            </div>
        `;
        
        statusDashboard.appendChild(sessionCard);
    }
}

// Simulate WebSocket connection and messages (for demonstration)
function simulateWebSocketConnection() {
    if (!state.isRunning) return;
    
    const statuses = ['running', 'success', 'error', 'waiting'];
    const logTypes = ['info', 'success', 'warning', 'error'];
    const messages = [
        'Attempting login...',
        'Login successful',
        'Searching for trains...',
        'Train found: 12301 Rajdhani Express',
        'Checking seat availability...',
        'Seats available: 5',
        'Filling passenger details...',
        'Making payment...',
        'Payment successful',
        'Booking confirmed - PNR: 1234567890',
        'Captcha solving failed, retrying...',
        'Proxy connection error',
        'Invalid credentials',
        'Session timeout, reconnecting...'
    ];
    
    // Periodically update session statuses and logs
    const interval = setInterval(() => {
        if (!state.isRunning) {
            clearInterval(interval);
            return;
        }
        
        // Randomly update a session
        const randomSessionIndex = Math.floor(Math.random() * state.sessions.length);
        const session = state.sessions[randomSessionIndex];
        
        // Random status change (occasionally)
        if (Math.random() < 0.2) {
            const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
            session.status = newStatus;
            
            const statusElement = document.querySelector(`#statusDashboard .session-card:nth-child(${randomSessionIndex + 1}) .session-status`);
            if (statusElement) {
                statusElement.className = 'session-status';
                statusElement.classList.add(`status-${newStatus}`);
                statusElement.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
            }
        }
        
        // Add a random log message
        const logType = logTypes[Math.floor(Math.random() * logTypes.length)];
        const message = messages[Math.floor(Math.random() * messages.length)];
        session.logs.push(message);
        
        const logViewer = document.getElementById(`logViewer${session.id}`);
        if (logViewer) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${logType}`;
            logEntry.textContent = message;
            logViewer.appendChild(logEntry);
            logViewer.scrollTop = logViewer.scrollHeight;
        }
        
        // Occasionally complete a session
        if (Math.random() < 0.05 && session.status === 'running') {
            session.status = Math.random() < 0.7 ? 'success' : 'error';
            const finalMessage = session.status === 'success' 
                ? 'Booking completed successfully!' 
                : 'Booking failed!';
            
            session.logs.push(finalMessage);
            
            const statusElement = document.querySelector(`#statusDashboard .session-card:nth-child(${randomSessionIndex + 1}) .session-status`);
            if (statusElement) {
                statusElement.className = 'session-status';
                statusElement.classList.add(`status-${session.status}`);
                statusElement.textContent = session.status.charAt(0).toUpperCase() + session.status.slice(1);
            }
            
            const logViewer = document.getElementById(`logViewer${session.id}`);
            if (logViewer) {
                const logEntry = document.createElement('div');
                logEntry.className = `log-entry log-${session.status === 'success' ? 'success' : 'error'}`;
                logEntry.textContent = finalMessage;
                logViewer.appendChild(logEntry);
                logViewer.scrollTop = logViewer.scrollHeight;
            }
        }
        
        
        // Check if all sessions are completed
        const allCompleted = state.sessions.every(s => s.status === 'success' || s.status === 'error');
        if (allCompleted) {
            clearInterval(interval);
            state.isRunning = false;
            startBookingBtn.disabled = false;
            stopSessionsBtn.disabled = true;
            
            // All groups remain collapsed as requested
            console.log('Booking process completed - all groups remain collapsed');
        }
    }, 1000);
}


// Add this function to handle train info display like station info
function showTrainSuggestions(input) {
    // Remove any existing suggestions
    const existingSuggestions = document.getElementById('trainSuggestions');
    if (existingSuggestions) {
        existingSuggestions.remove();
    }
    
    const value = input.value;
    if (value.length < 1) return;
    
    // Filter trains (assuming you have a trainDatabase from train_fetch.js)
    if (!window.trainFetcher || !window.trainFetcher.trainDatabase) return;
    
    const filteredTrains = Object.entries(window.trainFetcher.trainDatabase)
        .filter(([trainNo, trainName]) => 
            trainNo.startsWith(value) || trainName.toUpperCase().includes(value.toUpperCase())
        )
        .slice(0, 5);
    
    if (filteredTrains.length === 0) return;
    
    // Create suggestions container
    const suggestions = document.createElement('div');
    suggestions.id = 'trainSuggestions';
    suggestions.className = 'station-suggestions';
    
    // Add suggestion items
    filteredTrains.forEach(([trainNo, trainName]) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = `${trainNo} - ${trainName}`;
        item.addEventListener('click', () => {
            input.value = trainNo;
            suggestions.remove();
            
            // Trigger change event to save to localStorage
            const event = new Event('change');
            input.dispatchEvent(event);
        });
        suggestions.appendChild(item);
    });
    
    // Position and add to DOM
    const rect = input.getBoundingClientRect();
    suggestions.style.position = 'absolute';
    suggestions.style.top = `${rect.bottom + window.scrollY}px`;
    suggestions.style.left = `${rect.left + window.scrollX}px`;
    suggestions.style.width = `${rect.width}px`;
    
    document.body.appendChild(suggestions);
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function closeSuggestions(e) {
        if (!suggestions.contains(e.target) && e.target !== input) {
            suggestions.remove();
            document.removeEventListener('click', closeSuggestions);
        }
    });
}

// Modify the renderGroupsOverview function to fix sidebar loading
function renderGroupsOverview() {
    groupsOverview.innerHTML = '';
    
    if (state.bookingGroups.length === 0) {
        groupsOverview.innerHTML = '<div class="no-groups">No groups saved</div>';
        return;
    }
    
    // Show groups in reverse order (newest first)
    [...state.bookingGroups].reverse().forEach((group, index) => {
        const originalIndex = state.bookingGroups.length - 1 - index;
        const item = document.createElement('div');
        item.className = 'group-overview-item';
        
        const fromCode = group.from || 'XXX';
        const toCode = group.to || 'XXX';
        const date = group.date ? formatDateForDisplay(group.date) : 'DD.MM';
        const train = group.train || 'XXXXX';
        
        item.innerHTML = `
            <div class="group-overview-header">
                <div class="group-overview-title">${fromCode} - ${toCode}</div>
                <div class="group-overview-actions">
                    <button class="load-group-btn" data-group-index="${originalIndex}" title="Load Group">📂</button>
                    <button class="delete-group-btn" data-group-index="${originalIndex}" title="Delete Group">❌</button>
                </div>
            </div>
            <div class="group-overview-details">${date} | Train: ${train}</div>
        `;
        
        // Add load functionality
        const loadBtn = item.querySelector('.load-group-btn');
        loadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            loadGroup(originalIndex);
        });
        
        // Add delete functionality
        const deleteBtn = item.querySelector('.delete-group-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this group?')) {
                deleteGroup(originalIndex);
            }
        });
        
        // Make entire item clickable
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.group-overview-actions')) {
                loadGroup(originalIndex);
            }
        });
        
        groupsOverview.appendChild(item);
    });
}

// Add these helper functions
function loadGroup(groupIndex) {
    if (state.bookingGroups[groupIndex]) {
        // Expand the group
        state.bookingGroups[groupIndex].collapsed = false;
        saveToLocalStorage();
        renderBookingGroups();
        
        // Scroll to the group
        setTimeout(() => {
            const groupElement = document.querySelector(`.booking-group-card:nth-child(${groupIndex + 1})`);
            if (groupElement) {
                groupElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }
}

function deleteGroup(groupIndex) {
    state.bookingGroups.splice(groupIndex, 1);
    saveToLocalStorage();
    renderBookingGroups();
    renderGroupsOverview();
}

// Modify the input event listener to handle train suggestions
document.addEventListener('input', function(e) {
    if (e.target.matches('input[data-field="train"]')) {
        showTrainSuggestions(e.target);
    }
    
    if (e.target.matches('.station-input')) {
        e.target.value = e.target.value.toUpperCase();
        showStationSuggestions(e.target);
    }
});

// Add this CSS for the suggestions
const suggestionsStyle = `
    .station-suggestions {
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .suggestion-item {
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
    }
    
    .suggestion-item:hover {
        background-color: #f5f5f5;
    }
    
    .group-overview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
    }
    
    .group-overview-actions {
        display: flex;
        gap: 5px;
    }
    
    .load-group-btn, .delete-group-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 5px;
        border-radius: 3px;
        font-size: 1.1em;
    }
    
    .load-group-btn:hover {
        background-color: #e8f5e9;
    }
    
    .delete-group-btn:hover {
        background-color: #ffebee;
    }
`;

// Inject the styles
const styleElement = document.createElement('style');
styleElement.textContent = suggestionsStyle;
document.head.appendChild(styleElement);

// Modify the passenger deletion to work properly
// Replace the existing delete passenger event listener with this:
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-passenger')) {
        const groupIndex = parseInt(e.target.dataset.groupIndex);
        const passengerIndex = parseInt(e.target.dataset.passengerIndex);
        
        if (state.bookingGroups[groupIndex] && state.bookingGroups[groupIndex].passengers) {
            state.bookingGroups[groupIndex].passengers.splice(passengerIndex, 1);
            saveToLocalStorage();
            renderBookingGroups();
        }
    }
});
// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);