import { parentPort, workerData, isMainThread } from 'worker_threads';
import { spawn } from 'child_process';
import path from 'path';
import { IRCTC } from './lib/index.mjs';

// --- Status Reporting ---
function postStatus(status, message, details = {}) {
    if (parentPort) {
        parentPort.postMessage({ status, message, ...details });
    }
}

// Only redirect console output if running as a worker thread.
if (!isMainThread) {
    console.log = (...args) => postStatus('log', args.join(' '));
    console.error = (...args) => postStatus('warn', args.join(' '));
}

// --- OCR Engine Manager ---
export class OCREngine {
    constructor() {
        this.pythonProcess = null;
        this.requestQueue = [];
        this.isReady = false;
        this.readyPromise = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
    }

    async start() {
        postStatus('info', 'Starting PARSEQ OCR engine...');
        this.pythonProcess = spawn('python', [path.resolve(process.cwd(), 'CLI_OCR.py')]);

        this.pythonProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (!this.isReady && output === 'OCR_READY') {
                this.isReady = true;
                postStatus('info', 'PARSEQ OCR engine is ready.');
                this.resolveReady();
                return;
            }
            if (this.requestQueue.length > 0) {
                const { resolve } = this.requestQueue.shift();
                resolve(output);
            }
        });

        this.pythonProcess.stderr.on('data', (data) => {
            postStatus('warn', `[OCR Engine]: ${data.toString().trim()}`);
        });

        this.pythonProcess.on('close', (code) => {
            const errorMsg = `OCR engine process exited with code ${code}`;
            postStatus('error', errorMsg);
            if (!this.isReady) {
                this.rejectReady(new Error(errorMsg));
            }
        });

        return this.readyPromise;
    }

    solve(base64) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                return reject(new Error('OCR engine is not ready.'));
            }
            this.requestQueue.push({ resolve, reject });
            this.pythonProcess.stdin.write(base64 + '\n');
        });
    }

    kill() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            postStatus('info', 'PARSEQ OCR engine stopped.');
        }
    }
}

// --- Main Worker Logic ---
async function runBookingAsWorker() {
    const { credential, proxy, journeyDetails, ocrMethod, testMode } = workerData;
    let ocrEngine = null;

    try {
        if (ocrMethod === 'parseq') {
            ocrEngine = new OCREngine();
            await ocrEngine.start();
        }

        postStatus('info', `Initializing session with user: ${credential.userID}${proxy ? ` via proxy` : ''}`);

        const irctc = new IRCTC({
            userID: credential.userID,
            password: credential.password,
            proxy: proxy,
            ocrMethod: ocrMethod,
            testConfig: testMode,
            ocrEngine: ocrEngine,
        });

        const bookingResult = await irctc.book(journeyDetails);
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
