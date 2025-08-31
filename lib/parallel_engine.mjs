import { Worker } from 'worker_threads';
import path from 'path';

// --- Logger Functions ---
// The engine will not log directly to console. It will use a status callback.
function log(level, message, callback) {
    if (callback) {
        callback({ type: 'manager', level, message });
    }
}

export async function runParallelEngine(config, statusCallback) {
    log('info', 'Parallel engine started.', statusCallback);

    const { globalSettings, credentials, proxies, bookingGroups } = config;

    // 1. Validate Config
    if (!credentials || credentials.length === 0) {
        log('error', 'No credentials provided. Aborting.', statusCallback);
        return;
    }
    if (!bookingGroups || bookingGroups.length === 0) {
        log('error', 'No booking groups provided. Aborting.', statusCallback);
        return;
    }

    // 2. Determine Final Session Count
    const maxSessions = credentials.length * globalSettings.sessionsPerCredential;
    let totalSessions = globalSettings.totalSessions;
    if (totalSessions > maxSessions) {
        log('warn', `Requested ${totalSessions} sessions, but only ${maxSessions} are possible. Adjusting count.`, statusCallback);
        totalSessions = maxSessions;
    }

    // 3. Prepare Session Assignments
    const sessionAssignments = [];

    // 3a. Allocate Credentials
    const allocatedCredentials = [];
    const credsToUseOnce = Math.max(0, credentials.length - (totalSessions - credentials.length));
    const credsToUseTwice = credentials.length - credsToUseOnce;

    for (let i = 0; i < credsToUseTwice; i++) {
        allocatedCredentials.push(credentials[i]);
        if (globalSettings.sessionsPerCredential > 1) {
            allocatedCredentials.push(credentials[i]);
        }
    }
    for (let i = 0; i < credsToUseOnce; i++) {
        allocatedCredentials.push(credentials[credsToUseTwice + i]);
    }

    // 3b. Allocate Proxies
    const allocatedProxies = [];
    if (globalSettings.useProxies && proxies && proxies.length > 0) {
        for (let i = 0; i < totalSessions; i++) {
            allocatedProxies.push(proxies[i % proxies.length]);
        }
    } else {
        for (let i = 0; i < totalSessions; i++) {
            allocatedProxies.push(null);
        }
    }

    // 3c. Allocate Booking Groups
    if (globalSettings.intelligentPartitioning) {
        for (let i = 0; i < totalSessions; i++) {
            const groupIndex = i % bookingGroups.length;
            sessionAssignments.push({
                groupIndex,
                journeyDetails: bookingGroups[groupIndex].journeyDetails,
            });
        }
    } else { // Manual partitioning
        const sessionSum = bookingGroups.reduce((acc, group) => acc + (group.sessionCount || 0), 0);
        if (sessionSum !== totalSessions) {
            log('error', `Manual partitioning error: Sum of sessionCount (${sessionSum}) does not match totalSessions (${totalSessions}).`, statusCallback);
            return;
        }
        let groupIndex = 0;
        for (const group of bookingGroups) {
            for (let i = 0; i < (group.sessionCount || 0); i++) {
                sessionAssignments.push({
                    groupIndex,
                    journeyDetails: group.journeyDetails,
                });
            }
            groupIndex++;
        }
    }

    // 4. Launch Workers
    log('info', `Starting ${totalSessions} parallel sessions...`, statusCallback);
    let activeWorkers = totalSessions;
    const workers = [];

    for (let i = 0; i < totalSessions; i++) {
        const sessionId = i + 1;
        const assignment = sessionAssignments[i];

        const workerData = {
            credential: allocatedCredentials[i],
            proxy: allocatedProxies[i],
            journeyDetails: assignment.journeyDetails,
            ocrMethod: globalSettings.ocrMethod,
            testMode: globalSettings.testMode
        };

        const worker = new Worker(path.resolve(process.cwd(), 'worker.mjs'), { workerData });
        workers.push(worker);

        worker.on('message', (msg) => {
            statusCallback({ type: 'worker', sessionId, groupIndex: assignment.groupIndex, ...msg });
        });

        worker.on('error', (err) => {
            statusCallback({ type: 'worker', sessionId, groupIndex: assignment.groupIndex, status: 'error', message: `A fatal error occurred: ${err.message}` });
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                statusCallback({ type: 'worker', sessionId, groupIndex: assignment.groupIndex, status: 'warn', message: `Worker stopped with exit code ${code}` });
            }
            activeWorkers--;
            if (activeWorkers === 0) {
                log('info', 'All sessions have completed.', statusCallback);
            }
        });
    }

    return workers;
}
