import { parentPort, workerData } from 'worker_threads';
import { IRCTC } from './lib/index.mjs';

// --- Status Reporting ---
// Helper function to post structured status messages to the main thread.
function postStatus(status, message, details = {}) {
    parentPort.postMessage({ status, message, ...details });
}

// Redirect all console output from the underlying library to the parent thread.
// This allows the manager to receive and display logs with the correct session prefix.
console.log = (...args) => {
    postStatus('log', args.join(' '));
};
console.error = (...args) => {
    // Treat console.error from the library as a warning, not a fatal error for the worker.
    postStatus('warn', args.join(' '));
};

// --- Main Worker Logic ---
async function runBooking() {
    const { credential, proxy, journeyDetails, gcloudVision, testMode } = workerData;

    try {
        postStatus('info', `Initializing session with user: ${credential.userID}${proxy ? ` via proxy` : ''}`);

        const irctc = new IRCTC({
            userID: credential.userID,
            password: credential.password,
            proxy: proxy, // Pass the proxy URL
            gcloud: gcloudVision, // Pass the gcloud vision setting
            testConfig: testMode, // Pass the test mode config
        });

        const bookingResult = await irctc.book(journeyDetails);

        postStatus('success', 'Booking successful!', { result: bookingResult });

    } catch (error) {
        // Post the error message back to the main thread for proper logging.
        postStatus('error', `Booking failed: ${error.message}`, { stack: error.stack });
    }
}

// Start the booking process.
runBooking();
