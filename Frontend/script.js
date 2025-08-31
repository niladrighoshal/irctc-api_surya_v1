document.addEventListener('DOMContentLoaded', () => {
    // --- 1. STATE MANAGEMENT ---
    const state = {
        credentials: [],
        proxies: [],
        bookingGroups: [],
        isRunning: false,
        ws: null,
        serverTimeOffset: 0,
    };

    // --- 2. DOM ELEMENT CACHE ---
    const elements = {
        startBookingBtn: document.getElementById('startBooking'),
        stopSessionsBtn: document.getElementById('stopSessions'),
        totalSessionsInput: document.getElementById('totalSessions'),
        sessionsPerCredentialInput: document.getElementById('sessionsPerCredential'),
        ocrMethodSelect: document.getElementById('ocrMethod'),
        useProxiesToggle: document.getElementById('useProxies'),
        intelligentPartitioningToggle: document.getElementById('intelligentPartitioning'),
        testModeEnabledToggle: document.getElementById('testModeEnabled'),
        testModeSettings: document.getElementById('testModeSettings'),
        customBookTimeInput: document.getElementById('customBookTime'),
        credentialCount: document.getElementById('credentialCount'),
        proxyCountBadge: document.getElementById('proxyCountBadge'),
        toggleCredentialForm: document.getElementById('toggleCredentialForm'),
        credentialForm: document.getElementById('credentialForm'),
        userIdInput: document.getElementById('userIdInput'),
        passwordInput: document.getElementById('passwordInput'),
        addCredentialBtn: document.getElementById('addCredential'),
        credentialsList: document.getElementById('credentialsList'),
        toggleProxyForm: document.getElementById('toggleProxyForm'),
        proxyForm: document.getElementById('proxyForm'),
        proxyInput: document.getElementById('proxyInput'),
        addProxyBtn: document.getElementById('addProxy'),
        proxyFileUpload: document.getElementById('proxyFileUpload'),
        proxiesList: document.getElementById('proxiesList'),
        bookingGroupsContainer: document.getElementById('bookingGroups'),
        addGroupBtn: document.getElementById('addGroup'),
        groupsOverview: document.getElementById('groupsOverview'),
        statusDashboardView: document.getElementById('statusDashboardView'),
        bookingGroupsView: document.getElementById('bookingGroupsView'),
        statusDashboard: document.getElementById('statusDashboard'),
        realTimeClock: document.getElementById('realTimeClock'),
    };

    // --- 3. INITIALIZATION ---
    function init() {
        loadFromLocalStorage();
        setupEventListeners();
        renderAll();
        connectWebSocket();
        startRealTimeClock();
    }

    // --- 4. PERSISTENCE (LOCAL STORAGE) ---
    function loadFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('irctcBookingState');
            if (!savedState) return;
            const parsed = JSON.parse(savedState);

            elements.totalSessionsInput.value = parsed.totalSessions || 1;
            elements.sessionsPerCredentialInput.value = parsed.sessionsPerCredential || 1;
            elements.ocrMethodSelect.value = parsed.ocrMethod || 'parseq';
            elements.useProxiesToggle.checked = parsed.useProxies || false;
            elements.intelligentPartitioningToggle.checked = parsed.intelligentPartitioning !== false;
            elements.testModeEnabledToggle.checked = parsed.testMode?.enabled || false;
            elements.customBookTimeInput.value = parsed.testMode?.customBookTime || '';

            state.credentials = parsed.credentials || [];
            state.proxies = parsed.proxies || [];
            state.bookingGroups = parsed.bookingGroups || [];
        } catch (e) { console.error("Failed to load state from Local Storage:", e); }
    }

    function saveToLocalStorage() {
        const stateToSave = {
            totalSessions: elements.totalSessionsInput.value,
            sessionsPerCredential: elements.sessionsPerCredentialInput.value,
            ocrMethod: elements.ocrMethodSelect.value,
            useProxies: elements.useProxiesToggle.checked,
            intelligentPartitioning: elements.intelligentPartitioningToggle.checked,
            testMode: {
                enabled: elements.testModeEnabledToggle.checked,
                customBookTime: elements.customBookTimeInput.value,
            },
            credentials: state.credentials,
            proxies: state.proxies,
            bookingGroups: state.bookingGroups,
        };
        localStorage.setItem('irctcBookingState', JSON.stringify(stateToSave));
    }

    function saveAndRender() {
        saveToLocalStorage();
        renderAll();
    }

    // --- 5. EVENT HANDLING ---
    function setupEventListeners() {
        document.body.addEventListener('click', handleDelegatedClick);
        document.body.addEventListener('change', handleDelegatedChange);
        document.body.addEventListener('input', handleDelegatedInput);
        elements.proxyFileUpload.addEventListener('change', handleProxyFileUpload);
    }

    function handleDelegatedClick(e) {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        const groupIndex = target.closest('[data-group-index]')?.dataset.groupIndex;
        const passengerIndex = target.closest('[data-passenger-index]')?.dataset.passengerIndex;

        const actions = {
            toggleCredentialForm: () => elements.credentialForm.classList.toggle('hidden'),
            toggleProxyForm: () => elements.proxyForm.classList.toggle('hidden'),
            addCredential, addProxy, addBookingGroup, startBooking, stopSessions,
            deleteCredential: () => deleteItem('credentials', target.closest('[data-index]').dataset.index),
            deleteProxy: () => deleteItem('proxies', target.closest('[data-index]').dataset.index),
            deleteGroup: () => deleteItem('bookingGroups', groupIndex),
            addPassenger: () => addPassenger(groupIndex),
            deletePassenger: () => deletePassenger(groupIndex, passengerIndex),
            toggleGroupCollapse: () => toggleGroupCollapse(groupIndex),
        };

        if (actions[action]) actions[action]();
    }

    function handleDelegatedChange(e) {
        const { groupIndex, passengerIndex, field } = e.target.dataset;
        if (field) {
            updateState(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value, groupIndex, passengerIndex);
        } else {
            saveAndRender();
        }
    }

    function handleDelegatedInput(e) {
        if (e.target.id === 'userIdInput') e.target.style.textTransform = 'none';
        else if (e.target.dataset.field === 'name') e.target.value = e.target.value.replace(/\b\w/g, char => char.toUpperCase());

        const { groupIndex, passengerIndex, field } = e.target.dataset;
        if (field) {
            updateState(field, e.target.value, groupIndex, passengerIndex);
        }
    }

    // --- 6. STATE & RENDER ---
    function updateState(field, value, groupIndex, passengerIndex) {
        if (groupIndex === undefined) return;
        const group = state.bookingGroups[groupIndex];
        if (!group) return;

        if (passengerIndex !== undefined) {
            if (!group.passengers[passengerIndex]) return;
            group.passengers[passengerIndex][field] = value;
        } else {
            group[field] = field === 'date' ? value.replace(/-/g, '') : value;
        }
        saveToLocalStorage();
    }

    function renderAll() {
        renderCredentialsList();
        renderProxiesList();
        renderBookingGroups();
        renderGroupsOverview();
        updateCounts();
        toggleAdvancedSettings();
    }

    function renderCredentialsList() {
        elements.credentialsList.innerHTML = state.credentials.map((cred, index) => `
            <div class="credential-item"><span>${cred.userID}</span><button class="delete-btn" data-action="deleteCredential" data-index="${index}">❌</button></div>`).join('');
    }

    function renderProxiesList() {
        elements.proxiesList.innerHTML = state.proxies.map((proxy, index) => `
            <div class="proxy-item"><span>${proxy}</span><button class="delete-btn" data-action="deleteProxy" data-index="${index}">❌</button></div>`).join('');
    }

    function renderBookingGroups() {
        elements.bookingGroupsContainer.innerHTML = state.bookingGroups.map(createGroupHTML).join('');
    }

    function renderGroupsOverview() {
        elements.groupsOverview.innerHTML = state.bookingGroups.map((group, index) => `
            <div class="group-overview-item" data-action="toggleGroupCollapse" data-group-index="${index}">
                Group ${index + 1}: ${group.from || '...'} to ${group.to || '...'}
            </div>`).join('');
    }

    function createGroupHTML(group, groupIndex) {
        const isCollapsed = group.collapsed;
        const showManualSessionCount = !elements.intelligentPartitioningToggle.checked;
        return `
            <div class="booking-group-card ${isCollapsed ? 'collapsed' : ''}" data-group-index="${groupIndex}">
                <div class="group-header" data-action="toggleGroupCollapse">
                    <div class="group-title">Group ${groupIndex + 1}</div>
                    <div class="group-header-controls">
                        ${showManualSessionCount ? `<input type="number" class="manual-session-count" placeholder="Sessions" data-field="sessionCount" value="${group.sessionCount || ''}" min="1">` : ''}
                        <button class="btn btn-danger" data-action="deleteGroup">Delete</button>
                    </div>
                </div>
                <div class="group-content" style="display: ${isCollapsed ? 'none' : 'grid'};">
                    <div class="group-form">
                        <input type="text" placeholder="From Station" data-field="from" value="${group.from || ''}">
                        <input type="text" placeholder="To Station" data-field="to" value="${group.to || ''}">
                        <input type="date" data-field="date" value="${formatDateForInput(group.date)}">
                        <input type="text" placeholder="Train No (5 digits)" data-field="train" value="${group.train || ''}">
                        <select data-field="class" value="${group.class || 'SL'}"><option value="SL">SL</option><option value="3A">3A</option></select>
                        <select data-field="quota" value="${group.quota || 'GN'}"><option value="GN">GN</option><option value="TQ">TQ</option></select>
                        <input type="text" placeholder="UPI ID or 'wallet'" data-field="paymentId" value="${group.paymentId || ''}">
                        <input type="text" placeholder="10-digit Mobile No" data-field="mobileNumber" value="${group.mobileNumber || ''}">
                    </div>
                    <div class="passengers-section">
                        <h4>Passengers</h4>
                        <div class="passengers-list">${(group.passengers || []).map((p, pIndex) => createPassengerHTML(groupIndex, pIndex, p)).join('')}</div>
                        <button class="btn btn-secondary" data-action="addPassenger">+ Add Passenger</button>
                    </div>
                </div>
            </div>
        `;
    }

    function createPassengerHTML(groupIndex, passengerIndex, passenger) {
        return `
            <div class="passenger-item" data-passenger-index="${passengerIndex}">
                <input type="text" placeholder="Name" data-field="name" value="${passenger.name || ''}">
                <input type="number" placeholder="Age" data-field="age" value="${passenger.age || ''}">
                <select data-field="gender" value="${passenger.gender || 'M'}"><option value="M">Male</option><option value="F">Female</option></select>
                <select data-field="berthChoice" value="${passenger.berthChoice || 'No Preference'}"><option>No Preference</option><option>Lower</option><option>Upper</option></select>
                <button class="delete-btn" data-action="deletePassenger">❌</button>
            </div>
        `;
    }

    // --- 7. ACTIONS ---
    function addCredential() {
        const userID = elements.userIdInput.value.trim();
        const password = elements.passwordInput.value.trim();
        if (userID && password) {
            state.credentials.push({ userID, password });
            elements.userIdInput.value = '';
            elements.passwordInput.value = '';
            saveAndRender();
        }
    }

    function addProxy() {
        const proxy = elements.proxyInput.value.trim();
        if (proxy) {
            state.proxies.push(proxy);
            elements.proxyInput.value = '';
            saveAndRender();
        }
    }

    function handleProxyFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n').filter(line => line.trim() !== '');
            state.proxies.push(...lines);
            saveAndRender();
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function addBookingGroup() {
        state.bookingGroups.push({ passengers: [], collapsed: false, date: getDefaultDate(true) });
        saveAndRender();
    }

    function addPassenger(groupIndex) {
        const group = state.bookingGroups[groupIndex];
        if (!group) return;
        if (!group.passengers) group.passengers = [];
        group.passengers.push({ name: '', age: '', gender: 'M', berthChoice: 'No Preference' });
        saveAndRender();
    }

    function toggleGroupCollapse(groupIndex) {
        const group = state.bookingGroups[groupIndex];
        if (group) {
            group.collapsed = !group.collapsed;
            saveAndRender();
        }
    }

    function deleteItem(type, index) {
        if (state[type] && state[type][index]) {
            state[type].splice(index, 1);
            saveAndRender();
        }
    }

    function deletePassenger(groupIndex, passengerIndex) {
        const group = state.bookingGroups[groupIndex];
        if (group?.passengers?.[passengerIndex]) {
            group.passengers.splice(passengerIndex, 1);
            saveAndRender();
        }
    }

    // --- 8. WEBSOCKET & BACKEND ---
    function connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws`;
        state.ws = new WebSocket(wsUrl);
        state.ws.onopen = () => console.log('Connected to backend server.');
        state.ws.onmessage = (event) => handleBackendUpdate(JSON.parse(event.data));
        state.ws.onclose = () => setTimeout(connectWebSocket, 3000);
        state.ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    function handleBackendUpdate(update) {
        if (update.type === 'manager' && (update.message === 'All sessions have completed.' || update.message.includes('stopped by user'))) {
            setRunningState(false);
        } else if (update.type === 'worker') {
            updateSessionLog(update.sessionId, update.status, update.message);
        }
    }

    function startBooking() {
        if (state.isRunning) return;
        const activeGroups = state.bookingGroups.filter(g => !g.collapsed);
        if (activeGroups.length === 0) return alert("Please expand at least one booking group to start.");

        const config = buildConfigFromState();
        if (!config) return;

        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'start-booking', config }));
            setRunningState(true, config.globalSettings.totalSessions);
        } else {
            alert("Not connected to server. Please refresh the page.");
        }
    }

    function stopSessions() {
        if (!state.isRunning) return;
        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'stop-all' }));
        }
        setRunningState(false);
    }

    // --- 9. UTILITY & HELPERS ---
    function toggleAdvancedSettings() {
        elements.testModeSettings.classList.toggle('hidden', !elements.testModeEnabledToggle.checked);
        renderBookingGroups();
    }
    function updateCounts() {
        elements.credentialCount.textContent = state.credentials.length;
        elements.proxyCountBadge.textContent = state.proxies.length;
    }
    function formatDateForInput(d) { return d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : getDefaultDate(false); }
    function getDefaultDate(s) { const d=new Date(); d.setDate(d.getDate()+1); const i=d.toISOString().split('T')[0]; return s?i.replace(/-/g,''):i; }
    function startRealTimeClock() { setInterval(() => { elements.realTimeClock.textContent = new Date(Date.now() + state.serverTimeOffset).toLocaleString('en-IN', { hour12: false }); }, 100); }

    function setRunningState(isRunning, sessionCount = 0) {
        state.isRunning = isRunning;
        elements.startBookingBtn.disabled = isRunning;
        elements.stopSessionsBtn.disabled = !isRunning;
        elements.bookingGroupsView.classList.toggle('hidden', isRunning);
        elements.statusDashboardView.classList.toggle('hidden', !isRunning);
        if (isRunning) {
            initializeSessionCards(sessionCount);
        }
    }

    function initializeSessionCards(sessionCount) {
        elements.statusDashboard.innerHTML = '';
        for (let i = 1; i <= sessionCount; i++) {
            const card = document.createElement('div');
            card.id = `sessionCard${i}`;
            card.className = 'session-card';
            card.innerHTML = `<div class="session-header"><div>Session ${i}</div><div class="session-status status-waiting">Waiting</div></div><div class="log-viewer" id="logViewer${i}"></div>`;
            elements.statusDashboard.appendChild(card);
        }
    }

    function updateSessionLog(sessionId, status, message) {
        const logViewer = document.getElementById(`logViewer${sessionId}`);
        const statusElement = document.querySelector(`#sessionCard${sessionId} .session-status`);
        if (logViewer) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${status}`;
            logEntry.textContent = message;
            logViewer.appendChild(logEntry);
            logViewer.scrollTop = logViewer.scrollHeight;
        }
        if (statusElement) {
            statusElement.className = `session-status status-${status}`;
            statusElement.textContent = status;
        }
    }

    function buildConfigFromState() {
        // Validation can be added here
        return {
            globalSettings: {
                totalSessions: parseInt(elements.totalSessionsInput.value),
                sessionsPerCredential: parseInt(elements.sessionsPerCredentialInput.value),
                ocrMethod: elements.ocrMethodSelect.value,
                useProxies: elements.useProxiesToggle.checked,
                intelligentPartitioning: elements.intelligentPartitioningToggle.checked,
                testMode: {
                    enabled: elements.testModeEnabledToggle.checked,
                    customBookTime: elements.testModeEnabledToggle.checked ? new Date(elements.customBookTimeInput.value).toISOString() : null,
                }
            },
            credentials: state.credentials,
            proxies: state.proxies,
            bookingGroups: state.bookingGroups.filter(g => !g.collapsed),
        };
    }

    // --- KICK-OFF ---
    init();
});
