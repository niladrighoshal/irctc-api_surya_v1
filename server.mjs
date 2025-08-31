import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { runParallelEngine } from './lib/parallel_engine.mjs';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve the frontend files
const frontendPath = path.resolve(process.cwd(), 'Frontend');
app.use(express.static(frontendPath));

// API endpoint to serve station data
import { stations } from './lib/utils/stations.mjs';
app.get('/api/stations', (req, res) => {
    res.json(stations);
});

wss.on('connection', (ws) => {
    console.log('Frontend connected');
    let activeWorkers = []; // To hold the worker handles

    // Function to send messages to the connected frontend client
    const sendToFrontend = (message) => {
        if (ws.readyState === ws.OPEN) {
            // The parallel engine might send objects or strings
            const dataToSend = typeof message === 'object' ? JSON.stringify(message) : message;
            ws.send(dataToSend);
        }
    };

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start-booking') {
                if (activeWorkers.length > 0) {
                    sendToFrontend('Manager: A booking process is already running.');
                    return;
                }

                console.log('Received start-booking request');
                sendToFrontend('Manager: Starting booking engine...');

                try {
                    // Call the engine directly. It will return handles to the workers.
                    activeWorkers = await runParallelEngine(data.payload, sendToFrontend);
                    sendToFrontend('Manager: Engine started and workers are running.');
                } catch (engineError) {
                    console.error('Error starting parallel engine:', engineError);
                    sendToFrontend(`Manager: Error starting engine: ${engineError.message}`);
                    activeWorkers = [];
                }

            } else if (data.type === 'stop-booking') {
                console.log('Received stop-booking request');
                if (activeWorkers.length > 0) {
                    sendToFrontend('Manager: Stopping all booking sessions...');
                    activeWorkers.forEach(worker => worker.terminate());
                    activeWorkers = [];
                    sendToFrontend('Manager: All sessions stopped by user.');
                } else {
                    sendToFrontend('Manager: No booking process is currently running.');
                }
            }

        } catch (error) {
            console.error('Error processing message:', error);
            sendToFrontend(`Manager: Invalid request from frontend. ${error.message}`);
        }
    });

    ws.on('close', () => {
        console.log('Frontend disconnected. Stopping any active sessions.');
        if (activeWorkers.length > 0) {
            activeWorkers.forEach(worker => worker.terminate());
            activeWorkers = [];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running. Open http://localhost:${PORT} in your browser.`);
});
