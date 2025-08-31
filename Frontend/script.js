document.addEventListener('DOMContentLoaded', () => {
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
        // Fetch station and train lists in parallel with loading other state
        await Promise.all([
            loadStateAndRender(),
            fetchStations(),
            fetchTrainData()
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
            const response = await fetch('railwayStationsList.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            state.stations = data.map(s => `${s.station_code} - ${s.station_name}`);
        } catch (error) {
            console.error("Could not fetch station list:", error);
        }
    }

    async function fetchTrainData() {
        try {
            const response = await fetch('train_data_simple.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            state.trains = await response.json();
        } catch (error) {
            console.error("Could not fetch train data:", error);
        }
    }

    function getStationNameFromCode(code) {
        if (!code) return '';
        const station = state.stations.find(s => s.startsWith(code));
        return station ? station.split(' - ')[1] : 'Unknown Station';
    }

    function getTrainNameFromNumber(number) {
        if (!number) return '';
        const train = state.trains.find(t => t.train_number === number);
        return train ? train.train_name : 'Unknown Train';
    }

    // --- 4. RENDERING LAYER ---
    function renderAll() {
        renderCredentialsList();
        renderProxiesList();
        renderStationDatalist(); // Create the datalist before rendering groups that use it
        renderBookingGroups();
        renderGroupsOverview();
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
        const container = document.getElementById('bookingGroups');
        if (!container) return;
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
                        <h3>${group.name || 'New Group'}</h3>
                        <span class="status-indicator ${group.collapsed ? '' : 'active'}">${group.collapsed ? 'Inactive' : 'Active'}</span>
                    </div>
                    <div class="group-content">
                        <div class="form-grid">
                            <input type="text" class="full-width" data-group-id="${group.id}" data-field="name" value="${group.name || ''}" placeholder="Group Name">
                            <div class="input-with-lookup">
                                <input type="text" data-group-id="${group.id}" data-field="trainNumber" value="${group.trainNumber || ''}" placeholder="Train No.">
                                <span class="lookup-result" id="trainName-${group.id}">${getTrainNameFromNumber(group.trainNumber)}</span>
                            </div>
                            <input type="text" data-group-id="${group.id}" data-field="class" value="${group.class || ''}" placeholder="Class (e.g., SL, 3A)">
                             <div class="input-with-lookup">
                                <input type="text" data-group-id="${group.id}" data-field="source" value="${group.source || ''}" placeholder="Source Station" list="station-list">
                                <span class="lookup-result" id="sourceName-${group.id}">${getStationNameFromCode(group.source)}</span>
                            </div>
                            <div class="input-with-lookup">
                                <input type="text" data-group-id="${group.id}" data-field="destination" value="${group.destination || ''}" placeholder="Destination Station" list="station-list">
                                <span class="lookup-result" id="destName-${group.id}">${getStationNameFromCode(group.destination)}</span>
                            </div>
                            <input type="date" data-group-id="${group.id}" data-field="journeyDate" value="${group.journeyDate || ''}">
                             <select data-group-id="${group.id}" data-field="quota">
                                <option value="GN" ${group.quota === 'GN' ? 'selected' : ''}>General</option>
                                <option value="TQ" ${group.quota === 'TQ' ? 'selected' : ''}>Tatkal</option>
                                <option value="PT" ${group.quota === 'PT' ? 'selected' : ''}>Premium Tatkal</option>
                                <option value="SS" ${group.quota === 'SS' ? 'selected' : ''}>Lower Berth</option>
                            </select>
                        </div>
                        <div class="form-grid">
                            <input type="text" data-group-id="${group.id}" data-field="mobile" value="${group.mobile || ''}" placeholder="Mobile Number">
                        </div>
                        <div class="payment-options">
                            <select data-group-id="${group.id}" data-field="paymentMethod">
                                <option value="upi" ${group.paymentMethod !== 'wallet' ? 'selected' : ''}>UPI</option>
                                <option value="wallet" ${group.paymentMethod === 'wallet' ? 'selected' : ''}>IRCTC Wallet</option>
                            </select>
                            <input type="text" data-group-id="${group.id}" data-field="paymentId" value="${group.paymentId || ''}" placeholder="UPI ID" class="${group.paymentMethod === 'wallet' ? 'hidden' : ''}">
                        </div>
                        <div class="checkbox-options">
                            <label><input type="checkbox" data-group-id="${group.id}" data-field="autoUpgradation" ${group.autoUpgradation !== false ? 'checked' : ''}> Auto Upgradation</label>
                            <label><input type="checkbox" data-group-id="${group.id}" data-field="bookOnlyIfConfirm" ${group.bookOnlyIfConfirm !== false ? 'checked' : ''}> Book only if confirm</label>
                        </div>
                        <h4>Passengers <button data-action="addPassenger" class="btn btn-secondary add-btn-small">+</button></h4>
                        <div class="passengers-list">${passengersHTML}</div>
                        <div class="group-actions">
                            <button data-action="saveGroup" data-id="${group.id}" class="btn btn-success">💾 Save Group</button>
                            <button data-action="deleteGroup" data-id="${group.id}" class="btn btn-danger">🗑️ Delete Group</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderGroupsOverview() {
        const overviewContainer = document.getElementById('groupsOverview');
        if (!overviewContainer) return;
        overviewContainer.innerHTML = state.bookingGroups.map(group => {
            const date = group.journeyDate ? new Date(group.journeyDate).toLocaleDateString('en-GB').replace(/\//g, '') : 'N/A';
            const from = group.source ? group.source.split(' - ')[0] : 'FROM';
            const to = group.destination ? group.destination.split(' - ')[0] : 'TO';
            const trainNo = group.trainNumber || 'Train';

            return `
                <div class="group-summary-item" data-id="${group.id}" data-action="focusGroup">
                    <span>${from}-${to}:${trainNo}#${date}</span>
                    <button data-action="deleteGroup" class="delete-btn-small" data-id="${group.id}">×</button>
                </div>
            `;
        }).join('');
    }

    function updateCounts() {
        const credsEl = document.getElementById('credentialCount');
        if (credsEl) credsEl.textContent = state.credentials.length;
        const proxyEl = document.getElementById('proxyCountBadge');
        if (proxyEl) proxyEl.textContent = state.proxies.length;
        // The main group count is now implicit in the lists
    }

    // --- 5. EVENT HANDLING ---
    function setupEventListeners() {
        document.body.addEventListener('click', handleDelegatedClick);
        document.body.addEventListener('input', handleDelegatedInput);
        document.querySelector('.sidebar').addEventListener('change', saveGlobalSettings);
        document.getElementById('proxyFileUpload').addEventListener('change', handleProxyFileUpload);
    }

    async function handleDelegatedClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (state.isBooking && !['stopBooking', 'toggleLogCollapse'].includes(action)) return;

        const id = target.closest('[data-id]')?.dataset.id;

        const actions = {
            addCredential, addProxy, addBookingGroup,
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
            if (e.target.type === 'checkbox') {
                itemToUpdate[field] = e.target.checked;
            } else {
                itemToUpdate[field] = e.target.value;
            }
            // State is updated, and now it's saved to IDB on every input.
            await idb.update('bookingGroups', group);

            if (field === 'trainNumber') {
                document.getElementById(`trainName-${groupId}`).textContent = getTrainNameFromNumber(e.target.value);
            } else if (field === 'source') {
                document.getElementById(`sourceName-${groupId}`).textContent = getStationNameFromCode(e.target.value);
            } else if (field === 'destination') {
                document.getElementById(`destName-${groupId}`).textContent = getStationNameFromCode(e.target.value);
            }

            // Conditional rendering still needs to happen.
            if (field === 'paymentMethod' || field === 'quota') {
                renderAll();
            }
        }
    }

    // --- 6. ACTIONS (CRUD) ---
    async function addCredential() {
        const uidInput = document.getElementById('userIdInput');
        const pwdInput = document.getElementById('passwordInput');
        const uid = uidInput.value.trim();
        const pwd = pwdInput.value.trim();
        if (!uid || !pwd) {
            showToast('User ID and Password cannot be empty.', 'error');
            return;
        }
        state.credentials.push({ userID: uid, password: pwd });
        saveListToLocalStorage('credentials', state.credentials);
        uidInput.value = '';
        pwdInput.value = '';
        showToast('Credential saved successfully.', 'success');
        await loadStateAndRender();
    }
    async function deleteCredential(index) {
        state.credentials.splice(index, 1);
        saveListToLocalStorage('credentials', state.credentials);
        showToast('Credential deleted.', 'info');
        await loadStateAndRender();
    }
    async function addProxy() {
        const p = document.getElementById('proxyInput');
        if (!p.value.trim()) return;
        state.proxies.push(p.value.trim());
        saveListToLocalStorage('proxies', state.proxies);
        p.value = '';
        showToast('Proxy saved successfully.', 'success');
        await loadStateAndRender();
    }
    async function deleteProxy(index) {
        state.proxies.splice(index, 1);
        saveListToLocalStorage('proxies', state.proxies);
        showToast('Proxy deleted.', 'info');
        await loadStateAndRender();
    }
    async function addBookingGroup() {
        const newGroup = { id: Date.now(), name: `New Group`, passengers: [], collapsed: false };
        await idb.add('bookingGroups', newGroup);
        showToast('New booking group added.', 'success');
        await loadStateAndRender();
    }
    async function deleteGroup(id) {
        await idb.delete('bookingGroups', id);
        showToast('Booking group deleted.', 'info');
        await loadStateAndRender();
    }
    async function addPassenger(groupId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (!group) return;

        const passengerCount = group.passengers ? group.passengers.length : 0;
        const quota = group.quota || 'GN'; // Default to General quota

        if ((quota === 'TQ' || quota === 'PT') && passengerCount >= 4) {
            showToast('Tatkal quotas allow a maximum of 4 passengers.', 'error');
            return;
        }

        if (passengerCount >= 6) {
            showToast('A maximum of 6 passengers are allowed per booking.', 'error');
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

    async function saveGroup(groupId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (!group) {
            showToast('Could not find group to save.', 'error');
            return;
        }
        await idb.update('bookingGroups', { ...group });
        group.collapsed = true;
        await idb.update('bookingGroups', { ...group });
        showToast(`Group "${group.name}" saved successfully.`, 'success');
        renderAll();
    }

    function focusGroup(groupId) {
        const group = state.bookingGroups.find(g => g.id === groupId);
        if (group) {
            group.collapsed = false;
            idb.update('bookingGroups', { ...group });
            renderAll();

            setTimeout(() => {
                const groupElement = document.querySelector(`.booking-group[data-id="${groupId}"]`);
                if (groupElement) {
                    groupElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    groupElement.style.transition = 'outline 0.1s ease-in-out';
                    groupElement.style.outline = '2px solid var(--primary-color)';
                    setTimeout(() => {
                        groupElement.style.outline = 'none';
                    }, 1500);
                }
            }, 100); // Delay to allow rendering
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
                showToast(`${newProxies.length} proxies loaded successfully.`, 'success');
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

        const activeGroups = state.bookingGroups.filter(g => !g.collapsed);
        if (activeGroups.length === 0) {
            showToast("No active booking groups. Please expand at least one group to start.", "error");
            return;
        }

        state.isBooking = true;
        toggleBookingView(true);

        document.getElementById('statusDashboard').innerHTML = '<li>Connecting to server...</li>';

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        state.ws.onopen = () => {
            console.log('WebSocket connected.');
            showToast(`Starting booking for ${activeGroups.length} active group(s).`, 'info');

            const processedGroups = JSON.parse(JSON.stringify(activeGroups));
            processedGroups.forEach(group => {
                if (group.journeyDate) {
                    group.journeyDate = group.journeyDate.replace(/-/g, '');
                }
            });

            const config = {
                ocrMethod: document.getElementById('ocrMethod').value,
                totalSessions: parseInt(document.getElementById('totalSessions').value),
                sessionsPerCredential: parseInt(document.getElementById('sessionsPerCredential').value),
                useProxies: document.getElementById('useProxies').checked,
                intelligentPartitioning: document.getElementById('intelligentPartitioning').checked,
                testModeEnabled: document.getElementById('testModeEnabled').checked,
                customBookTime: document.getElementById('customBookTime').value,
                credentials: state.credentials,
                proxies: state.proxies,
                bookingGroups: processedGroups,
            };
            state.ws.send(JSON.stringify({ type: 'start-booking', payload: config }));
        };

        state.ws.onmessage = (event) => {
            const dashboard = document.getElementById('statusDashboard');
            // ... more complex dashboard rendering logic here ...
            const message = event.data;
            const logEntry = document.createElement('div');
            logEntry.className = 'status-card';
            logEntry.textContent = message;
            dashboard.appendChild(logEntry);
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            showToast('Connection Error. Is the server running?', 'error');
            stopBooking(false);
        };

        state.ws.onclose = () => {
            console.log('WebSocket disconnected.');
            if (state.isBooking) { // Unexpected close
                showToast('Connection to server lost.', 'error');
                stopBooking(false);
            }
        };
    }

    function stopBooking(sendMessage = true) {
        if (sendMessage && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'stop-booking' }));
            showToast('Stopping all booking sessions.', 'info');
        }
        if (state.ws) {
            state.ws.onclose = null;
            state.ws.close();
            state.ws = null;
        }
        state.isBooking = false;
        toggleBookingView(false);
    }

    function toggleBookingView(isBooking) {
        document.getElementById('bookingGroupsView').classList.toggle('hidden', isBooking);
        document.getElementById('statusDashboardView').classList.toggle('hidden', !isBooking);
        document.getElementById('startBooking').disabled = isBooking;
        document.getElementById('stopSessions').disabled = !isBooking;
        document.getElementById('main-header-title').textContent = isBooking ? 'Live Status Dashboard' : 'Booking Groups Configuration';

        // Disable sidebar controls during booking
        const sidebarControls = document.querySelectorAll('.sidebar input, .sidebar select, .sidebar button:not(#startBooking):not(#stopSessions)');
        sidebarControls.forEach(el => {
            if(el.id !== 'startBooking' && el.id !== 'stopSessions') {
                el.disabled = isBooking;
            }
        });
    }

    // --- 8. UI FEEDBACK ---
    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.5s forwards';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, duration);
    }

    // --- KICK-OFF ---
    initializeUI();
});
