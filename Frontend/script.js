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
        // ... all other elements
        bookingGroupsContainer: document.getElementById('bookingGroups'),
        statusDashboard: document.getElementById('statusDashboard'),
        bookingGroupsView: document.getElementById('bookingGroupsView'),
        statusDashboardView: document.getElementById('statusDashboardView'),
    };

    // --- INITIALIZATION ---
    function init() {
        loadFromLocalStorage();
        setupEventListeners();
        renderAll();
        connectWebSocket();
    }

    // --- LOCAL STORAGE & STATE ---
    function loadFromLocalStorage() { /* ... */ }
    function saveToLocalStorage() { /* ... */ }
    function saveAndRender() { saveToLocalStorage(); renderAll(); }

    // --- EVENT HANDLING ---
    function setupEventListeners() {
        elements.startBookingBtn.addEventListener('click', startBooking);
        elements.stopSessionsBtn.addEventListener('click', stopSessions);
        // ... other listeners
    }

    // --- RENDER FUNCTIONS ---
    function renderAll() { /* ... */ }
    function renderBookingGroups() {
        elements.bookingGroupsContainer.innerHTML = state.bookingGroups.map(createGroupHTML).join('');
    }
    function createGroupHTML(group, groupIndex) { /* ... returns full group HTML ... */ }

    // --- ACTIONS ---
    function startBooking() {
        if (state.isRunning) return;
        const activeGroups = state.bookingGroups.filter(g => !g.collapsed);
        if (activeGroups.length === 0) return alert("Please expand at least one booking group to start.");

        const config = buildConfigFromState(); // Gathers all data from UI
        if (!config) return; // buildConfigFromState will alert on validation errors

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
        // The backend will send a final "All sessions stopped" message
    }

    // --- WEBSOCKET & BACKEND ---
    function connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws`;
        state.ws = new WebSocket(wsUrl);
        state.ws.onopen = () => console.log('Connected to backend.');
        state.ws.onmessage = (event) => handleBackendUpdate(JSON.parse(event.data));
        state.ws.onclose = () => { console.log('Disconnected. Retrying...'); setTimeout(connectWebSocket, 3000); };
        state.ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    function handleBackendUpdate(update) {
        if (update.type === 'manager' && update.message === 'All sessions have completed.') {
            setRunningState(false);
        } else if (update.type === 'manager' && update.message.includes('stopped by user')) {
            setRunningState(false);
        } else if (update.type === 'worker') {
            updateSessionLog(update.sessionId, update.status, update.message);
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

    // --- HELPERS & UTILITY ---
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

    function buildConfigFromState() {
        // This function would gather all data from the UI state and elements
        // and perform validation before returning the config object.
        return {
            globalSettings: { /* ... from elements ... */ },
            credentials: state.credentials,
            proxies: state.proxies,
            bookingGroups: state.bookingGroups.filter(g => !g.collapsed),
        };
    }

    // Dummy implementations for brevity in this example
    function addCredential() {}
    function addProxy() {}
    function addBookingGroup() {}
    function addPassenger() {}
    function deleteItem() {}
    function deletePassenger() {}
    function toggleGroupCollapse() {}
    function updateCounts() {}

    init();
});
