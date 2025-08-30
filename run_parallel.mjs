import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

// --- Console Colors for Logging ---
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
};

// --- Logger Functions ---
function logManager(message) {
    console.log(`${colors.magenta}[Manager]:${colors.reset} ${message}`);
}

function logWorker(sessionId, groupIndex, status, message) {
    const prefix = `${colors.cyan}[Session ${sessionId.toString().padStart(2, '0')} - Group ${groupIndex}]:${colors.reset}`;
    let coloredMessage = message;

    switch (status) {
        case 'success':
            coloredMessage = `${colors.green}${message}${colors.reset}`;
            break;
        case 'error':
            coloredMessage = `${colors.red}${message}${colors.reset}`;
            break;
        case 'warn':
            coloredMessage = `${colors.yellow}${message}${colors.reset}`;
            break;
    }
    console.log(`${prefix} ${coloredMessage}`);
}


// --- Main Execution ---
async function run() {
    // 1. Load and Validate Config
    let config;
    try {
        const configPath = path.resolve(process.cwd(), 'config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error(`config.json not found at ${configPath}. Please create it from config.json.example.`);
        }
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
    } catch (error) {
        logManager(`${colors.red}Error loading config.json: ${error.message}${colors.reset}`);
        return;
    }

    const { globalSettings, credentials, proxies, bookingGroups } = config;

    if (!credentials || credentials.length === 0) {
        logManager(`${colors.red}No credentials found in config.json. Aborting.${colors.reset}`);
        return;
    }
    if (!bookingGroups || bookingGroups.length === 0) {
        logManager(`${colors.red}No bookingGroups found in config.json. Aborting.${colors.reset}`);
        return;
    }

    // 2. Determine Final Session Count based on Credentials
    const maxSessions = credentials.length * globalSettings.sessionsPerCredential;
    let totalSessions = globalSettings.totalSessions;
    if (totalSessions > maxSessions) {
        logManager(`${colors.yellow}Warning: Requested ${totalSessions} sessions, but only ${maxSessions} are possible with the given credentials.${colors.reset}`);
        logManager(`${colors.yellow}Running with ${maxSessions} sessions instead.${colors.reset}`);
        totalSessions = maxSessions;
    }

    // 3. Prepare Session Assignments
    const sessionAssignments = [];

    // 3a. Allocate Credentials
    const allocatedCredentials = [];
    const credsToUseOnce = Math.max(0, credentials.length - (totalSessions - credentials.length));
    const credsToUseTwice = credentials.length - credsToUseOnce;

    for(let i=0; i < credsToUseTwice; i++) {
        allocatedCredentials.push(credentials[i]);
        if(globalSettings.sessionsPerCredential > 1) allocatedCredentials.push(credentials[i]);
    }
    for(let i=0; i < credsToUseOnce; i++) {
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
            logManager(`${colors.red}Manual partitioning error: Sum of sessionCount in bookingGroups (${sessionSum}) does not match totalSessions (${totalSessions}).${colors.reset}`);
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
    logManager(`Starting ${totalSessions} parallel sessions...`);
    let activeWorkers = totalSessions;

    for (let i = 0; i < totalSessions; i++) {
        const sessionId = i + 1;
        const assignment = sessionAssignments[i];

        const workerData = {
            credential: allocatedCredentials[i],
            proxy: allocatedProxies[i],
            journeyDetails: assignment.journeyDetails,
            gcloudVision: globalSettings.gcloudVision,
            testMode: globalSettings.testMode
        };

        const worker = new Worker(path.resolve(process.cwd(), 'worker.mjs'), { workerData });

        worker.on('message', (msg) => {
            logWorker(sessionId, assignment.groupIndex, msg.status, msg.message);
        });

        worker.on('error', (err) => {
            logWorker(sessionId, assignment.groupIndex, 'error', `A fatal error occurred: ${err.message}`);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logWorker(sessionId, assignment.groupIndex, 'warn', `Worker stopped with exit code ${code}`);
            }
            activeWorkers--;
            if (activeWorkers === 0) {
                logManager(`${colors.green}All sessions have completed.${colors.reset}`);
            }
        });
    }
}

run();
