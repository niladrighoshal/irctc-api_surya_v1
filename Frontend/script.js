document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Starting application script.");

    // --- 1. STATE MANAGEMENT ---
    const state = {
        credentials: [],
        proxies: [],
        bookingGroups: [],
        stations: [],
        trains: [],
        isBooking: false,
        ws: null
    };

    // --- 2. INITIALIZATION ---
    async function initializeUI() {
        console.log("LOG: Initializing UI...");
        await Promise.all([
            loadStateAndRender(),
            fetchStations(),
            fetchTrainData()
        ]);
        setupEventListeners();
        console.log("LOG: UI Initialized successfully.");
    }

    // --- 3. PERSISTENCE LAYER ---
    async function loadStateAndRender() {
        console.log("LOG: Loading state from storage...");
        try {
            const savedCreds = localStorage.getItem('credentials');
            state.credentials = savedCreds ? JSON.parse(savedCreds) : [];
            const savedProxies = localStorage.getItem('proxies');
            state.proxies = savedProxies ? JSON.parse(savedProxies) : [];
            state.bookingGroups = await idb.getAll('bookingGroups');

            document.getElementById('totalSessions').value = localStorage.getItem('totalSessions') || '1';
            document.getElementById('sessionsPerCredential').value = localStorage.getItem('sessionsPerCredential') || '1';
            document.getElementById('ocrMethod').value = localStorage.getItem('ocrMethod') || 'parseq';
            document.getElementById('useProxies').checked = localStorage.getItem('useProxies') === 'true';
            document.getElementById('intelligentPartitioning').checked = localStorage.getItem('intelligentPartitioning') === 'true';
            document.getElementById('testModeEnabled').checked = localStorage.getItem('testModeEnabled') === 'true';

            console.log(`LOG: Loaded ${state.credentials.length} credentials, ${state.proxies.length} proxies, ${state.bookingGroups.length} groups.`);
            renderAll();
        } catch (error) {
            console.error("FATAL: Could not load data from storage.", error);
            showToast("Error loading data from storage. Check console.", "error");
        }
    }

    function saveListToLocalStorage(key, data) {
        console.log(`LOG: Saving '${key}' to localStorage.`);
        localStorage.setItem(key, JSON.stringify(data));
    }

    function saveGlobalSettings() {
        console.log("LOG: Saving global settings to localStorage.");
        localStorage.setItem('totalSessions', document.getElementById('totalSessions').value);
        localStorage.setItem('sessionsPerCredential', document.getElementById('sessionsPerCredential').value);
        localStorage.setItem('ocrMethod', document.getElementById('ocrMethod').value);
        localStorage.setItem('useProxies', document.getElementById('useProxies').checked);
        localStorage.setItem('intelligentPartitioning', document.getElementById('intelligentPartitioning').checked);
        localStorage.setItem('testModeEnabled', document.getElementById('testModeEnabled').checked);
        localStorage.setItem('customBookTime', document.getElementById('customBookTime').value);
    }

    async function fetchStations() { /* ... unchanged ... */ }
    async function fetchTrainData() { /* ... unchanged ... */ }
    function getStationNameFromCode(code) { /* ... unchanged ... */ }
    function getTrainNameFromNumber(number) { /* ... unchanged ... */ }

    // --- 4. RENDERING LAYER ---
    function renderAll() {
        console.log("LOG: --- Performing full re-render of UI ---");
        renderCredentialsList();
        renderProxiesList();
        renderStationDatalist();
        renderBookingGroups();
        renderGroupsOverview();
        updateCounts();
        validateStateAndUI();
        console.log("LOG: --- Full re-render complete ---");
    }

    function renderCredentialsList() {
        console.log("LOG: Rendering credentials list.");
        /* ... unchanged ... */
    }
    function renderProxiesList() {
        console.log("LOG: Rendering proxies list.");
        /* ... unchanged ... */
    }
    function renderStationDatalist() {
        console.log("LOG: Rendering station datalist.");
        /* ... unchanged ... */
    }
    function renderBookingGroups() {
        console.log(`LOG: Rendering ${state.bookingGroups.length} booking groups.`);
        const container = document.getElementById('bookingGroups');
        if (!container) {
            console.error("FATAL: #bookingGroups container not found in DOM.");
            return;
        }
        /* ... unchanged ... */
    }
    function renderGroupsOverview() {
        console.log("LOG: Rendering groups overview sidebar.");
        /* ... unchanged ... */
    }
    function updateCounts() {
        console.log("LOG: Updating counts.");
        /* ... unchanged ... */
    }

    // --- 5. EVENT HANDLING ---
    function setupEventListeners() {
        console.log("LOG: Setting up event listeners...");
        document.body.addEventListener('click', handleDelegatedClick);
        document.body.addEventListener('input', handleDelegatedInput);
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('change', saveGlobalSettings);
            console.log("LOG: Attached global settings listener to .sidebar");
        } else {
            console.error("FATAL: Could not find .sidebar element to attach change listener.");
        }
        document.getElementById('proxyFileUpload').addEventListener('change', handleProxyFileUpload);
        console.log("LOG: Event listeners set up successfully.");
    }

    async function handleDelegatedClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        console.log(`LOG: Action triggered: '${action}'. Clicked element:`, target);

        if (state.isBooking && !['stopBooking', 'toggleLogCollapse'].includes(action)) {
            console.warn("WARN: Action blocked because booking is in progress.");
            return;
        }

        const id = target.closest('[data-id]')?.dataset.id;

        const actions = {
            toggleCredentialForm: () => {
                const form = document.getElementById('credentialForm');
                console.log("LOG: Toggling credential form. Found element:", form);
                if(form) form.classList.toggle('hidden');
            },
            toggleProxyForm: () => {
                const form = document.getElementById('proxyForm');
                console.log("LOG: Toggling proxy form. Found element:", form);
                if(form) form.classList.toggle('hidden');
            },
            addCredential: () => {
                const uidInput = document.getElementById('userIdInput');
                const pwdInput = document.getElementById('passwordInput');
                const cred = { userID: uidInput.value.trim(), password: pwdInput.value.trim() };
                console.log("LOG: Attempting to add credential:", cred);
                addCredential(cred);
            },
            addProxy,
            addBookingGroup,
            deleteCredential: () => deleteCredential(parseInt(id)),
            deleteProxy: () => deleteProxy(parseInt(id)),
            deleteGroup: () => deleteGroup(parseInt(id)),
            addPassenger: () => addPassenger(parseInt(id)),
            deletePassenger: () => {
                const passengerId = target.closest('[data-passenger-id]').dataset.passengerId;
                deletePassenger(parseInt(id), parseInt(passengerId));
            },
            toggleGroupCollapse: () => toggleGroupCollapse(parseInt(id)),
            saveGroup: () => saveGroup(parseInt(id)),
            focusGroup: () => focusGroup(parseInt(id)),
            startBooking,
            stopBooking: () => stopBooking(true)
        };

        if (actions[action]) {
            e.preventDefault();
            console.log(`LOG: Executing action '${action}'...`);
            await actions[action]();
            console.log(`LOG: Action '${action}' execution finished.`);
        } else {
            console.warn(`WARN: No handler found for action '${action}'.`);
        }
    }

    async function handleDelegatedInput(e) { /* ... unchanged ... */ }

    // --- 6. ACTIONS (CRUD) ---
    async function addCredential(cred) {
        if (!cred.userID || !cred.password) {
            showToast('User ID and Password cannot be empty.', 'error');
            return;
        }
        state.credentials.push(cred);
        saveListToLocalStorage('credentials', state.credentials);
        document.getElementById('userIdInput').value = '';
        document.getElementById('passwordInput').value = '';
        showToast('Credential saved successfully.', 'success');
        await loadStateAndRender();
    }

    async function addBookingGroup() {
        console.log("LOG: Adding new booking group...");
        const newGroup = { id: Date.now(), name: `New Group`, passengers: [], collapsed: false };
        await idb.add('bookingGroups', newGroup);
        showToast('New booking group added.', 'success');
        await loadStateAndRender();
        console.log("LOG: New booking group added and UI re-rendered.");
    }

    // ... other functions remain unchanged but the logging within them (if any) is preserved ...
    // The functions below are simplified for brevity, assuming their internal logic is the same as the last correct version.

    async function deleteCredential(index) { /* ... */ }
    async function addProxy() { /* ... */ }
    async function deleteProxy(index) { /* ... */ }
    async function deleteGroup(id) { /* ... */ }
    async function addPassenger(groupId) { /* ... */ }
    async function deletePassenger(groupId, passengerId) { /* ... */ }
    async function saveGroup(groupId) { /* ... */ }
    function focusGroup(groupId) { /* ... */ }
    async function toggleGroupCollapse(groupId) { /* ... */ }
    function handleProxyFileUpload(event) { /* ... */ }
    function validateStateAndUI() { /* ... */ }
    function startBooking() { /* ... */ }
    function stopBooking(sendMessage = true) { /* ... */ }
    function toggleBookingView(isBooking) { /* ... */ }
    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.5s forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    // --- KICK-OFF ---
    initializeUI();
});
