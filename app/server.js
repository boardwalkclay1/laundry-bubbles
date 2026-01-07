/**
 * server.js
 * Express server + Socket.IO
 * - Serves static frontend from /public
 * - Exposes /api/jobs and /api/payments endpoints (payments routed in routes/payments.js)
 * - Socket.IO for realtime location & messaging
 *
 * Environment variables (see .env.example):
 *  - PORT
 *  - NMI_API_URL
 *  - NMI_API_USERNAME
 *  - NMI_API_PASSWORD
 *  - GOOGLE_MAPS_API_KEY (frontend needs this; you can inject it into index.html or set in client)
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const paymentsRouter = require('./routes/payments');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());

// Simple in-memory store for jobs (replace with DB in production)
const JOBS = {}; // jobId -> job object

// Expose a simple jobs API for frontend to create/read/update jobs
app.post('/api/jobs', (req, res) => {
  const job = req.body;
  if(!job || !job.id) return res.status(400).json({ error: 'job.id required' });
  JOBS[job.id] = job;
  // broadcast new job to washers
  io.emit('job:created', job);
  return res.json({ ok:true, job });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = JOBS[req.params.id];
  if(!job) return res.status(404).json({ error: 'not found' });
  return res.json({ ok:true, job });
});

app.get('/api/jobs', (req, res) => {
  return res.json({ ok:true, jobs: Object.values(JOBS) });
});

app.put('/api/jobs/:id', (req, res) => {
  const job = JOBS[req.params.id];
  if(!job) return res.status(404).json({ error: 'not found' });
  const updated = Object.assign(job, req.body);
  JOBS[req.params.id] = updated;
  io.emit('job:updated', updated);
  return res.json({ ok:true, job: updated });
});

// Payments routes (charges, refunds, capture)
app.use('/api/payments', paymentsRouter({ JOBS }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO: realtime location & messaging
io.on('connection', (socket) => {
  // join room for a user (by emailKey) or job
  socket.on('join:user', (userKey) => {
    socket.join(`user:${userKey}`);
  });

  socket.on('join:job', (jobId) => {
    socket.join(`job:${jobId}`);
  });

  // location updates: { userKey, lat, lng, ts }
  socket.on('location:update', (payload) => {
    if(!payload || !payload.userKey) return;
    // broadcast to interested clients
    io.to(`user:${payload.userKey}`).emit('location:update', payload);
    // also broadcast to job rooms if provided
    if(payload.jobId) io.to(`job:${payload.jobId}`).emit('location:update', payload);
  });

  // messaging: { jobId, from, text, ts }
  socket.on('message:send', (msg) => {
    if(!msg || !msg.jobId) return;
    io.to(`job:${msg.jobId}`).emit('message:received', msg);
  });

  socket.on('disconnect', () => {});
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
