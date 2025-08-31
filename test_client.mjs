import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
    console.log('[Test Client]: Connected to server.');

    // Construct the configuration object based on the user's request
    const config = {
        globalSettings: {
            totalSessions: 1,
            sessionsPerCredential: 1,
            ocrMethod: 'parseq',
            useProxies: false,
            intelligentPartitioning: true,
            testMode: {
                enabled: false,
                customBookTime: null
            }
        },
        credentials: [{
            userID: "Niladrighoshal",
            password: "Niladrigh@21"
        }],
        proxies: [],
        bookingGroups: [{
            journeyDetails: {
                from: "HWH",
                to: "MAS",
                date: "25-09-2025",
                class: "3A",
                quota: "GN",
                train: "12841",
                mobileNumber: "9635311895",
                paymentId: "niladrighoshal.19-9@okicici",
                autoUpgradation: true,
                bookOnlyIfConfirm: true,
                passengers: [{
                    name: "Niladri Ghoshal",
                    age: 24,
                    gender: "M",
                    berthChoice: "UB"
                }]
            }
        }]
    };

    console.log('[Test Client]: Sending start-booking request...');
    ws.send(JSON.stringify({ type: 'start-booking', config }));
});

ws.on('message', (data) => {
    const update = JSON.parse(data);

    // Log the message from the server
    if (update.type === 'manager') {
        console.log(`[Manager]: ${update.message}`);
        if (update.message === 'All sessions have completed.') {
            ws.close(); // Close connection when done
        }
    } else if (update.type === 'worker') {
        console.log(`[Session ${update.sessionId}]: ${update.message}`);
    }
});

ws.on('close', () => {
    console.log('[Test Client]: Disconnected from server.');
});

ws.on('error', (error) => {
    console.error('[Test Client]: WebSocket error:', error);
});
