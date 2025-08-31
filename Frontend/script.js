document.addEventListener('DOMContentLoaded', () => {
    // --- 1. STATE MANAGEMENT ---
    const state = {
        credentials: [],
        proxies: [],
        bookingGroups: [],
        stations: [],
        isBooking: false,
        ws: null
    };

    // --- 2. INITIALIZATION ---
    async function initializeUI() {
        // Fetch station list in parallel with loading other state
        await Promise.all([
            loadStateAndRender(),
            fetchStations()
        ]);
        setupEventListeners();
    }

    // --- 3. PERSISTENCE LAYER ---
    async function loadStateAndRender() {
        try {
            // Load credentials and proxies from Local Storage
            const savedCreds = localStorage.getItem('credentials');
            state.credentials = savedCreds ? JSON.parse(savedCreds) : [];
            const savedProxies = localStorage.getItem('proxies');
            state.proxies = savedProxies ? JSON.parse(savedProxies) : [];

            // Load booking groups from IndexedDB
            state.bookingGroups = await idb.getAll('bookingGroups');

            // Load simple settings from Local Storage
            document.getElementById('totalSessions').value = localStorage.getItem('totalSessions') || '1';
            document.getElementById('sessionsPerCredential').value = localStorage.getItem('sessionsPerCredential') || '1';
            document.getElementById('ocrMethod').value = localStorage.getItem('ocrMethod') || 'parseq';
            document.getElementById('loginTimeOffset').value = localStorage.getItem('loginTimeOffset') || '-60000';
            document.getElementById('bookingTimeOffset').value = localStorage.getItem('bookingTimeOffset') || '200';
            document.getElementById('useProxies').checked = localStorage.getItem('useProxies') === 'true';
            document.getElementById('intelligentPartitioning').checked = localStorage.getItem('intelligentPartitioning') === 'true';
            document.getElementById('testMode').checked = localStorage.getItem('testMode') === 'true';

            renderAll();
        } catch (error) {
            console.error("Fatal Error: Could not load data from storage.", error);
        }
    }

    function saveListToLocalStorage(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    function saveGlobalSettings() {
        localStorage.setItem('totalSessions', document.getElementById('totalSessions').value);
        localStorage.setItem('sessionsPerCredential', document.getElementById('sessionsPerCredential').value);
        localStorage.setItem('ocrMethod', document.getElementById('ocrMethod').value);
        localStorage.setItem('loginTimeOffset', document.getElementById('loginTimeOffset').value);
        localStorage.setItem('bookingTimeOffset', document.getElementById('bookingTimeOffset').value);
        localStorage.setItem('useProxies', document.getElementById('useProxies').checked);
        localStorage.setItem('intelligentPartitioning', document.getElementById('intelligentPartitioning').checked);
        localStorage.setItem('testMode', document.getElementById('testMode').checked);
    }

    async function fetchStations() {
        try {
            const response = await fetch('/api/stations');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            state.stations = await response.json();
        } catch (error) {
            console.error("Could not fetch station list:", error);
            // The app can still function without autocomplete
        }
    }

    // --- 4. RENDERING LAYER ---
    function renderAll() {
        renderCredentialsList();
        renderProxiesList();
        renderStationDatalist(); // Create the datalist before rendering groups that use it
        renderBookingGroups();
        updateCounts();
        validateStateAndUI();
    }

    function renderCredentialsList() {
        const list = document.getElementById('credentialsList');
        list.innerHTML = state.credentials.map((cred, index) => `
            <li data-id="${index}"><span>${cred.userID} / •••••••</span><button data-action="deleteCredential" class="delete-btn">×</button></li>
        `).join('');
    }

    function renderProxiesList() {
        const list = document.getElementById('proxiesList');
        list.innerHTML = state.proxies.map((proxy, index) => `
            <li data-id="${index}"><span>${proxy}</span><button data-action="deleteProxy" class="delete-btn">×</button></li>
        `).join('');
    }

    function renderStationDatalist() {
        let datalist = document.getElementById('station-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'station-list';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = state.stations.map(station => `<option value="${station}"></option>`).join('');
    }

    function renderBookingGroups() {
        const container = document.getElementById('bookingGroupsContainer');
        container.innerHTML = state.bookingGroups.map(group => {
            const passengersHTML = (group.passengers || []).map(pax => `
                <div class="passenger-item" data-passenger-id="${pax.id}">
                    <input type="text" data-group-id="${group.id}" data-field="name" value="${pax.name || ''}" placeholder="Name">
                    <input type="number" data-group-id="${group.id}" data-field="age" value="${pax.age || ''}" placeholder="Age">
                    <select data-group-id="${group.id}" data-field="gender">
                        <option value="M" ${pax.gender === 'M' ? 'selected' : ''}>M</option>
                        <option value="F" ${pax.gender === 'F' ? 'selected' : ''}>F</option>
                    </select>
                    <button data-action="deletePassenger" class="delete-btn-small">×</button>
                </div>
            `).join('');

            return `
                <div class="booking-group ${group.collapsed ? 'collapsed' : ''}" data-id="${group.id}">
                    <div class="group-header" data-action="toggleGroupCollapse">
                        <h3>${group.name || 'New Group'}</h3><span class="status-indicator ${group.collapsed ? '' : 'active'}">${group.collapsed ? 'Inactive' : 'Active'}</span>
                    </div>
                    <div class="group-content">
                        <div class="form-grid">
                            <input type="text" data-group-id="${group.id}" data-field="name" value="${group.name || ''}" placeholder="Group Name">
                            <input type="text" data-group-id="${group.id}" data-field="trainNumber" value="${group.trainNumber || ''}" placeholder="Train No.">
                            <input type="text" data-group-id="${group.id}" data-field="class" value="${group.class || ''}" placeholder="Class (e.g., SL, 3A)">
                            <input type="text" data-group-id="${group.id}" data-field="source" value="${group.source || ''}" placeholder="Source Station" list="station-list">
                            <input type="text" data-group-id="${group.id}" data-field="destination" value="${group.destination || ''}" placeholder="Destination Station" list="station-list">
                            <input type="date" data-group-id="${group.id}" data-field="journeyDate" value="${group.journeyDate || ''}">
                            <select data-group-id="${group.id}" data-field="quota">
                                <option value="GN" ${group.quota === 'GN' ? 'selected' : ''}>General</option>
                                <option value="TQ" ${group.quota === 'TQ' ? 'selected' : ''}>Tatkal</option>
                                <option value="PT" ${group.quota === 'PT' ? 'selected' : ''}>Premium Tatkal</option>
                                <option value="SS" ${group.quota === 'SS' ? 'selected' : ''}>Lower Berth</option>
                            </select>
                            <input type="text" data-group-id="${group.id}" data-field="mobile" value="${group.mobile || ''}" placeholder="Mobile Number">
                        </div>
                        <div class="payment-options">
                            <select data-group-id="${group.id}" data-field="paymentMethod">
                                <option value="upi" ${group.paymentMethod !== 'wallet' ? 'selected' : ''}>UPI</option>
                                <option value="wallet" ${group.paymentMethod === 'wallet' ? 'selected' : ''}>IRCTC Wallet</option>
                            </select>
                            <input type="text" data-group-id="${group.id}" data-field="paymentId" value="${group.paymentId || ''}" placeholder="UPI ID" class="${group.paymentMethod === 'wallet' ? 'hidden' : ''}">
                            <div class="wallet-warning ${group.paymentMethod !== 'wallet' ? 'hidden' : ''}">
                                <span>⚠️ Wallet must have sufficient funds.</span>
                            </div>
                        </div>
                        <div class="checkbox-options">
                            <label><input type="checkbox" data-group-id="${group.id}" data-field="autoUpgradation" ${group.autoUpgradation !== false ? 'checked' : ''}> Auto Upgradation</label>
                            <label><input type="checkbox" data-group-id="${group.id}" data-field="bookOnlyIfConfirm" ${group.bookOnlyIfConfirm !== false ? 'checked' : ''}> Book only if confirm</label>
                        </div>
                        ${group.quota === 'GN' ? `
                        <div class="gn-time-option">
                            <label>GN Custom Time (optional):</label>
                            <input type="time" data-group-id="${group.id}" data-field="gnBookingTime" value="${group.gnBookingTime || ''}" step="1">
                        </div>
                        ` : ''}
                        <h4>Passengers <button data-action="addPassenger" class="add-btn-small">+</button></h4>
                        <div class="passengers-list">${passengersHTML}</div>
                        <button data-action="deleteGroup" class="delete-btn group-delete-btn">Delete Group</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateCounts() {
        document.getElementById('credentialsCount').textContent = state.credentials.length;
        document.getElementById('proxiesCount').textContent = state.proxies.length;
        document.getElementById('groupsCount').textContent = state.bookingGroups.length;
    }

    // --- 5. EVENT HANDLING ---
    function setupEventListeners() {
        document.body.addEventListener('click', handleDelegatedClick);
        document.body.addEventListener('input', handleDelegatedInput);
        document.getElementById('configContainer').addEventListener('change', saveGlobalSettings);
        document.getElementById('proxyFileUpload').addEventListener('change', handleProxyFileUpload);
    }

    async function handleDelegatedClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (state.isBooking && !['stopBooking', 'toggleLogCollapse'].includes(action)) return;

        const id = target.closest('[data-id]')?.dataset.id;
        const groupId = target.closest('.booking-group')?.dataset.id;

        const actions = {
            addCredential, addProxy, addBookingGroup,
            deleteCredential: () => deleteCredential(parseInt(id)),
            deleteProxy: () => deleteProxy(parseInt(id)),
            deleteGroup: () => deleteGroup(parseInt(id)),
            addPassenger: () => addPassenger(parseInt(groupId)),
            deletePassenger: () => {
                const passengerId = target.closest('[data-passenger-id]').dataset.passengerId;
                deletePassenger(parseInt(groupId), parseInt(passengerId));
            },
            toggleGroupCollapse: () => toggleGroupCollapse(parseInt(id)),
            startBooking,
            stopBooking: () => stopBooking(true)
        };
        if (actions[action]) { e.preventDefault(); await actions[action](); }
    }

    async function handleDelegatedInput(e) {
        const { groupId, field } = e.target.dataset;
        if (!groupId || !field) return;

        const group = state.bookingGroups.find(g => g.id === parseInt(groupId));
        if (!group) return;

        const passengerId = e.target.closest('[data-passenger-id]')?.dataset.passengerId;
        const itemToUpdate = passengerId ? (group.passengers || []).find(p => p.id === parseInt(passengerId)) : group;

        if (itemToUpdate) {
            // Handle different input types correctly
            if (e.target.type === 'checkbox') {
                itemToUpdate[field] = e.target.checked;
            } else {
                itemToUpdate[field] = e.target.value;
            }

            await idb.update('bookingGroups', group);

            // If a field that affects conditional UI changes, re-render everything
            if (field === 'paymentMethod' || field === 'quota') {
                renderAll();
            }
        }
    }

    // --- 6. ACTIONS (CRUD) ---
    async function addCredential() {
        const uid = document.getElementById('userIdInput').value.trim();
        const pwd = document.getElementById('passwordInput').value.trim();
        if (!uid || !pwd) return;
        state.credentials.push({ userID: uid, password: pwd });
        saveListToLocalStorage('credentials', state.credentials);
        await loadStateAndRender();
    }
    async function deleteCredential(index) {
        state.credentials.splice(index, 1);
        saveListToLocalStorage('credentials', state.credentials);
        await loadStateAndRender();
    }
    async function addProxy() {
        const p = document.getElementById('proxyInput');
        if (!p.value.trim()) return;
        state.proxies.push(p.value.trim());
        saveListToLocalStorage('proxies', state.proxies);
        p.value = '';
        await loadStateAndRender();
    }
    async function deleteProxy(index) {
        state.proxies.splice(index, 1);
        saveListToLocalStorage('proxies', state.proxies);
        await loadStateAndRender();
    }
    async function addBookingGroup() {
        const newGroup = { name: `Group ${Date.now()}`, passengers: [], collapsed: false };
        await idb.add('bookingGroups', newGroup);
        await loadStateAndRender();
    }
    async function deleteGroup(id) {
        await idb.delete('bookingGroups', id);
        await loadStateAndRender();
    }
    async function addPassenger(groupId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (!group) return;

        const passengerCount = group.passengers ? group.passengers.length : 0;
        const quota = group.quota || 'GN'; // Default to General quota

        if ((quota === 'TQ' || quota === 'PT') && passengerCount >= 4) {
            alert('Tatkal and Premium Tatkal quotas only allow a maximum of 4 passengers.');
            return;
        }

        if (passengerCount >= 6) {
            alert('A maximum of 6 passengers are allowed per booking.');
            return;
        }

        if (!group.passengers) group.passengers = [];
        group.passengers.push({ id: Date.now(), name: '', age: '', gender: 'M' });
        await idb.update('bookingGroups', group);
        await loadStateAndRender();
    }
    async function deletePassenger(groupId, passengerId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (group) {
            group.passengers = (group.passengers || []).filter(p => p.id !== passengerId);
            await idb.update('bookingGroups', group);
            await loadStateAndRender();
        }
    }
    async function toggleGroupCollapse(groupId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (group) {
            group.collapsed = !group.collapsed;
            await idb.update('bookingGroups', group);
            renderAll();
        }
    }

    function handleProxyFileUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const newProxies = content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'));

            if (newProxies.length > 0) {
                // Add to existing proxies, avoiding duplicates
                const uniqueProxies = new Set([...state.proxies, ...newProxies]);
                state.proxies = Array.from(uniqueProxies);
                saveListToLocalStorage('proxies', state.proxies);
                await loadStateAndRender();
                alert(`${newProxies.length} proxies loaded successfully.`);
            }
        };
        reader.readAsText(file);

        // Reset file input so the same file can be loaded again
        event.target.value = '';
    }

    // --- 7. VALIDATION & UI LOGIC ---
    function validateStateAndUI() {
        const activeGroups = state.bookingGroups.filter(g => !g.collapsed).length;
        const totalSessionsInput = document.getElementById('totalSessions');
        let totalSessions = parseInt(totalSessionsInput.value);
        totalSessionsInput.min = activeGroups;
        if (totalSessions < activeGroups) {
            totalSessions = activeGroups;
            totalSessionsInput.value = totalSessions;
        }
        const sessionsPerCred = parseInt(document.getElementById('sessionsPerCredential').value) || 1;
        const credsAvailable = state.credentials.length;
        const credsNeeded = Math.ceil(totalSessions / sessionsPerCred);
        const startBtn = document.getElementById('startBookingBtn');
        if (credsAvailable < credsNeeded) {
            startBtn.disabled = true;
            startBtn.title = `Need ${credsNeeded} credentials for ${totalSessions} sessions, have ${credsAvailable}.`;
        } else if (activeGroups === 0) {
            startBtn.disabled = true;
            startBtn.title = 'No active booking groups. Expand at least one group.';
        } else {
            startBtn.disabled = false;
            startBtn.title = '';
        }
    }

    // --- 8. WEBSOCKET & BOOKING LOGIC ---
    function startBooking() {
        if (state.isBooking) return;
        state.isBooking = true;
        const startBtn = document.getElementById('startBookingBtn');
        startBtn.textContent = 'Stop Booking';
        startBtn.dataset.action = 'stopBooking';
        document.querySelectorAll('.main-container input, .main-container button, .main-container select').forEach(el => {
            if (el.id !== 'startBookingBtn') el.disabled = true;
        });
        document.getElementById('logsContainer').innerHTML = '<li>Connecting to server...</li>';

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        state.ws.onopen = () => {
            console.log('WebSocket connected.');
            const activeGroups = state.bookingGroups.filter(g => !g.collapsed);

            // Create a deep copy of active groups to modify for backend payload
            const processedGroups = JSON.parse(JSON.stringify(activeGroups));

            // Format the date for each group
            processedGroups.forEach(group => {
                if (group.journeyDate) {
                    // Removes hyphens from YYYY-MM-DD to get YYYYMMDD
                    group.journeyDate = group.journeyDate.replace(/-/g, '');
                }
            });

            const config = {
                ocrMethod: document.getElementById('ocrMethod').value,
                totalSessions: parseInt(document.getElementById('totalSessions').value),
                sessionsPerCredential: parseInt(document.getElementById('sessionsPerCredential').value),
                loginTimeOffset: parseInt(document.getElementById('loginTimeOffset').value),
                bookingTimeOffset: parseInt(document.getElementById('bookingTimeOffset').value),
                useProxies: document.getElementById('useProxies').checked,
                intelligentPartitioning: document.getElementById('intelligentPartitioning').checked,
                testMode: document.getElementById('testMode').checked,
                credentials: state.credentials,
                proxies: state.proxies,
                bookingGroups: processedGroups,
            };
            state.ws.send(JSON.stringify({ type: 'start-booking', payload: config }));
        };

        state.ws.onmessage = (event) => {
            const logContainer = document.getElementById('logsContainer');
            const message = event.data;
            if (message.startsWith('IRCTC_TIME:')) {
                document.getElementById('irctcTime').textContent = message.split(/:(.*)/s)[1];
            } else {
                const logEntry = document.createElement('li');
                logEntry.textContent = message;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            stopBooking(false, 'Connection Error. Is the server running?');
        };

        state.ws.onclose = () => {
            console.log('WebSocket disconnected.');
            if (state.isBooking) { // Unexpected close
                stopBooking(false, 'Connection to server lost.');
            }
        };
    }

    function stopBooking(sendMessage = true, reason = 'Process stopped by user.') {
        if (sendMessage && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'stop-booking' }));
        }
        if (state.ws) {
            state.ws.onclose = null;
            state.ws.close();
            state.ws = null;
        }
        state.isBooking = false;
        const startBtn = document.getElementById('startBookingBtn');
        startBtn.textContent = 'Start Booking';
        startBtn.dataset.action = 'startBooking';
        document.querySelectorAll('.main-container input, .main-container button, .main-container select').forEach(el => {
            el.disabled = false;
        });
        validateStateAndUI();
        const logContainer = document.getElementById('logsContainer');
        logContainer.innerHTML += `<li>${reason}</li>`;
    }

    // --- KICK-OFF ---
    initializeUI();
});
