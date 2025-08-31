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

wss.on('connection', (ws) => {
    console.log('Frontend connected');

    const statusCallback = (update) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(update));
        }
    };

    let activeWorkers = [];

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start-booking') {
                console.log('Received start-booking request');
                // Pass the config from the frontend directly to the engine
                activeWorkers = await runParallelEngine(data.config, statusCallback);
            }
            else if (data.type === 'stop-all') {
                console.log('Received stop-all request');
                activeWorkers.forEach(worker => worker.terminate());
                activeWorkers = [];
                statusCallback({ type: 'manager', level: 'warn', message: 'All sessions stopped by user.' });
            }
            // Placeholder for future message types like 'get-train-list'
            else if (data.type === 'get-train-list') {
                 console.log('Received get-train-list request (not implemented yet)');
                 // Here you would call a function to get trains and send them back
            }

        } catch (error) {
            console.error('Error processing message:', error);
            statusCallback({ type: 'manager', level: 'error', message: 'Invalid request from frontend.' });
        }
    });

    ws.on('close', () => {
        console.log('Frontend disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running. Open http://localhost:${PORT} in your browser.`);
});
