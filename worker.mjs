import { parentPort, workerData, isMainThread } from 'worker_threads';
import { spawn } from 'child_process';
import path from 'path';
import { IRCTC } from './lib/index.mjs';

// --- Status Reporting ---
function postStatus(level, message, details = {}) {
    if (parentPort) {
        // Standardize the message format sent back to the main thread
        parentPort.postMessage({ level, message, workerId: workerData.credential.userID, ...details });
    } else {
        // Fallback for local testing
        console.log(`[${level.toUpperCase()}] ${message}`, details);
    }
}

// --- OCR Engine Manager ---
class OCREngine {
    // ... (This class remains unchanged, its implementation is correct)
    constructor() {
        this.pythonProcess = null; this.requestQueue = []; this.isReady = false;
        this.readyPromise = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    }
    async start() {
        postStatus('info', 'Starting PARSEQ OCR engine...');
        this.pythonProcess = spawn('python', [path.resolve(process.cwd(), 'CLI_OCR.py')]);
        this.pythonProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (!this.isReady && output === 'OCR_READY') {
                this.isReady = true; postStatus('info', 'PARSEQ OCR engine is ready.'); this.resolveReady(); return;
            }
            if (this.requestQueue.length > 0) { const { resolve } = this.requestQueue.shift(); resolve(output); }
        });
        this.pythonProcess.stderr.on('data', (data) => { postStatus('warn', `[OCR Engine]: ${data.toString().trim()}`); });
        this.pythonProcess.on('close', (code) => {
            const errorMsg = `OCR engine process exited with code ${code}`; postStatus('error', errorMsg);
            if (!this.isReady) { this.rejectReady(new Error(errorMsg)); }
        });
        return this.readyPromise;
    }
    solve(base64) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) { return reject(new Error('OCR engine is not ready.')); }
            this.requestQueue.push({ resolve, reject }); this.pythonProcess.stdin.write(base64 + '\n');
        });
    }
    kill() { if (this.pythonProcess) { this.pythonProcess.kill(); postStatus('info', 'PARSEQ OCR engine stopped.'); } }
}


// --- Main Worker Logic ---
async function runBookingAsWorker() {
    const { credential, proxy, journeyDetails, ocrMethod, testMode } = workerData;
    let ocrEngine = null;

    try {
        // Initialize OCR Engine if needed
        if (ocrMethod === 'parseq') {
            ocrEngine = new OCREngine();
            await ocrEngine.start();
        }

        const irctc = new IRCTC({
            userID: credential.userID,
            password: credential.password,
            proxy: proxy,
            ocrMethod: ocrMethod,
            testConfig: testMode,
            ocrEngine: ocrEngine,
        });

        // --- TIMING ENGINE LOGIC ---
        const isTatkal = ['TQ', 'PT'].includes(journeyDetails.quota);
        const isTimedGeneral = journeyDetails.quota === 'GN' && journeyDetails.gnBookingTime;

        if (!isTatkal && !isTimedGeneral) {
            postStatus('info', 'Untimed booking detected. Booking immediately.');
            await irctc.book(journeyDetails);
            postStatus('success', 'Booking process completed.');
            return;
        }

        // --- PRECISION TIMING LOGIC (TATKAL OR TIMED GN) ---
        postStatus('info', `Timed booking detected. Initializing timing engine.`);

        const timeOffset = await irctc.getTimeOffset();
        postStatus('info', `IRCTC time offset acquired: ${timeOffset}ms`);

        const getTargetTime = () => {
            const now = new Date(new Date().getTime() + timeOffset);
            const target = new Date(now); // Clones current date

            if (isTimedGeneral) {
                const [hours, minutes, seconds] = journeyDetails.gnBookingTime.split(':');
                target.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0);
            } else { // Is Tatkal
                const acClasses = ['2A', '3A', 'CC', '1A', '3E'];
                const isAcClass = acClasses.includes(journeyDetails.class);
                const targetHour = isAcClass ? 10 : 11;
                target.setHours(targetHour, 0, 0, 0);
            }
            return target;
        };

        const targetTime = getTargetTime();
        postStatus('info', `Booking window opens at ${targetTime.toLocaleTimeString('en-IN')}`);

        // 1. Schedule Login
        const loginTime = new Date(targetTime.getTime() - 60 * 1000); // T-60 seconds
        const timeToLogin = loginTime.getTime() - new Date(new Date().getTime() + timeOffset).getTime();

        if (timeToLogin > 0) {
            postStatus('info', `Waiting for ${Math.round(timeToLogin / 1000)}s to log in at ${loginTime.toLocaleTimeString('en-IN')}`);
            await new Promise(resolve => setTimeout(resolve, timeToLogin));
        }

        postStatus('info', 'Login window reached. Attempting resilient login...');
        await irctc.login_public();
        postStatus('info', 'Login successful. Preparing journey details.');

        // 2. Schedule Booking Submission
        const bookingTime = new Date(targetTime.getTime() + 200); // T+200ms
        const timeToBook = bookingTime.getTime() - new Date(new Date().getTime() + timeOffset).getTime();

        if (timeToBook > 0) {
            postStatus('info', `Waiting for ${timeToBook}ms to submit booking at ${bookingTime.toLocaleTimeString('en-IN', { timeZoneName: 'short' })}`);
            await new Promise(resolve => setTimeout(resolve, timeToBook));
        }

        postStatus('info', 'Booking window reached. Submitting journey details now!');
        const bookingResult = await irctc.book_journey(journeyDetails);
        postStatus('success', 'Booking successful!', { result: bookingResult });

    } catch (error) {
        postStatus('error', `Booking failed: ${error.message}`);
    } finally {
        if (ocrEngine) {
            ocrEngine.kill();
        }
    }
}

// --- Entry Point ---
if (!isMainThread) {
    runBookingAsWorker();
}
