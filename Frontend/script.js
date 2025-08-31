document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        credentials: [],
        proxies: [],
        bookingGroups: [],
        isRunning: false,
        ws: null,
    };

    // --- DOM ELEMENTS ---
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
        userIdInput: document.getElementById('userIdInput'),
        passwordInput: document.getElementById('passwordInput'),
        credentialsList: document.getElementById('credentialsList'),
        proxiesList: document.getElementById('proxiesList'),
        bookingGroupsContainer: document.getElementById('bookingGroups'),
        addGroupBtn: document.getElementById('addGroup'),
        statusDashboardView: document.getElementById('statusDashboardView'),
        bookingGroupsView: document.getElementById('bookingGroupsView'),
        statusDashboard: document.getElementById('statusDashboard'),
    };

    // --- INITIALIZATION ---
    function init() {
        loadFromLocalStorage();
        setupEventListeners();
        renderAll();
        connectWebSocket();
    }

    // --- LOCAL STORAGE ---
    function loadFromLocalStorage() {
        const savedState = localStorage.getItem('irctcBookingState');
        if (!savedState) return;
        const parsed = JSON.parse(savedState);
        Object.assign(state, { credentials: parsed.credentials || [], proxies: parsed.proxies || [], bookingGroups: parsed.bookingGroups || [] });
        Object.assign(elements, {
            totalSessionsInput: { value: parsed.totalSessions || 1 },
            sessionsPerCredentialInput: { value: parsed.sessionsPerCredential || 1 },
            ocrMethodSelect: { value: parsed.ocrMethod || 'parseq' },
            useProxiesToggle: { checked: parsed.useProxies || false },
            intelligentPartitioningToggle: { checked: parsed.intelligentPartitioning !== false },
            testModeEnabledToggle: { checked: parsed.testMode?.enabled || false },
            customBookTimeInput: { value: parsed.testMode?.customBookTime || '' },
        });
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

    // --- EVENT HANDLING ---
    function setupEventListeners() {
        document.body.addEventListener('click', handleBodyClick);
        document.body.addEventListener('change', handleBodyChange);
        document.body.addEventListener('input', handleBodyInput);
    }

    function handleBodyClick(e) {
        const target = e.target;
        const groupIndex = target.closest('[data-group-index]')?.dataset.groupIndex;
        if (target.id === 'startBooking') startBooking();
        else if (target.id === 'stopSessions') stopSessions();
        else if (target.id === 'addGroup') addBookingGroup();
        else if (target.id === 'addCredential') addCredential();
        else if (target.id === 'addProxy') addProxy();
        else if (target.matches('.delete-credential-btn')) deleteItem('credentials', target.dataset.index);
        else if (target.matches('.delete-proxy-btn')) deleteItem('proxies', target.dataset.index);
        else if (target.matches('.delete-group-btn')) deleteItem('bookingGroups', groupIndex);
        else if (target.matches('.delete-passenger-btn')) deletePassenger(groupIndex, target.dataset.passengerIndex);
        else if (target.matches('.add-passenger-btn')) addPassenger(groupIndex);
        else if (target.closest('.group-header') && !target.matches('button, input')) toggleGroupCollapse(groupIndex);
    }

    function handleBodyChange(e) {
        const { groupIndex, passengerIndex, field } = e.target.dataset;
        if (field) updateState(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value, groupIndex, passengerIndex);
        else saveAndRender();
    }

    function handleBodyInput(e) {
        if (e.target.id === 'userIdInput') e.target.style.textTransform = 'none';
        else if (e.target.dataset.field === 'name') e.target.value = e.target.value.replace(/\b\w/g, char => char.toUpperCase());
        else if (e.target.matches('.manual-session-count')) updateState('sessionCount', e.target.value, e.target.dataset.groupIndex);
    }

    // --- STATE & UI MANAGEMENT ---
    function updateState(field, value, groupIndex, passengerIndex) {
        const group = state.bookingGroups[groupIndex];
        if (!group) return;
        if (passengerIndex !== undefined) group.passengers[passengerIndex][field] = value;
        else group[field] = field === 'date' ? value.replace(/-/g, '') : value;
        saveToLocalStorage();
    }

    function saveAndRender() {
        saveToLocalStorage();
        renderAll();
    }

    function renderAll() {
        renderCredentialsList();
        renderProxiesList();
        renderBookingGroups();
        updateCounts();
        toggleAdvancedSettings();
    }

    function renderCredentialsList() { /* ... */ }
    function renderProxiesList() { /* ... */ }
    function renderBookingGroups() {
        elements.bookingGroupsContainer.innerHTML = state.bookingGroups.map(createGroupHTML).join('');
    }

    function createGroupHTML(group, groupIndex) {
        // ... returns full HTML for a booking group card
        return `<div>Group ${groupIndex + 1}</div>`; // Placeholder
    }

    // --- ACTIONS ---
    function addCredential() { /* ... */ }
    function addProxy() { /* ... */ }
    function addBookingGroup() { /* ... */ }
    function addPassenger(groupIndex) { /* ... */ }
    function deleteItem(type, index) { /* ... */ }
    function deletePassenger(groupIndex, passengerIndex) { /* ... */ }
    function toggleGroupCollapse(groupIndex) { /* ... */ }

    // --- WEBSOCKET & BACKEND ---
    function connectWebSocket() {
        state.ws = new WebSocket(`ws://${window.location.host}/ws`);
        state.ws.onmessage = (event) => handleBackendUpdate(JSON.parse(event.data));
        state.ws.onclose = () => setTimeout(connectWebSocket, 3000);
    }

    function handleBackendUpdate(update) {
        if (update.type === 'manager' && update.message === 'All sessions have completed.') {
            state.isRunning = false;
            elements.startBookingBtn.disabled = false;
            elements.stopSessionsBtn.disabled = true;
        } else if (update.type === 'worker') {
            const { sessionId, status, message } = update;
            const logViewer = document.getElementById(`logViewer${sessionId}`);
            if (logViewer) {
                const logEntry = document.createElement('div');
                logEntry.className = `log-entry log-${status}`;
                logEntry.textContent = message;
                logViewer.appendChild(logEntry);
                logViewer.scrollTop = logViewer.scrollHeight;
            }
        }
    }

    function initializeSessionCards(sessionCount) {
        elements.statusDashboard.innerHTML = '';
        for (let i = 1; i <= sessionCount; i++) {
            const card = document.createElement('div');
            card.id = `sessionCard${i}`;
            card.className = 'session-card';
            card.innerHTML = `<div class="session-header">Session ${i}<div class="session-status status-waiting">Waiting</div></div><div class="log-viewer" id="logViewer${i}"></div>`;
            elements.statusDashboard.appendChild(card);
        }
    }

    function startBooking() {
        if (state.isRunning) return;
        const activeGroups = state.bookingGroups.filter(g => !g.collapsed);
        if (activeGroups.length === 0) return alert("Please expand at least one group to start.");

        const config = { /* ... build config object ... */ };

        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'start-booking', config }));
            state.isRunning = true;
            // ... update UI for running state
        } else {
            alert("Not connected to server.");
        }
    }

    function stopSessions() {
        if (!state.isRunning) return;
        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'stop-all' }));
        }
        state.isRunning = false;
        // ... update UI for stopped state
    }

    init();
});
