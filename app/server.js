const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();

// -----------------------------
// CONFIG
// -----------------------------
const PORT = process.env.PORT || 3000;

// -----------------------------
// MIDDLEWARE
// -----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the renamed folder "public.html"
app.use(express.static(path.join(__dirname, 'public.html')));

// -----------------------------
// API: PUBLIC CONFIG (SAFE)
// -----------------------------
app.get('/api/config', (req, res) => {
  res.json({
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
    environment: process.env.NODE_ENV || 'development'
  });
});

// -----------------------------
// SPA FALLBACK → public.html/index.html
// -----------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html', 'index.html'));
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Laundry Bubbles server running on port ${PORT}`);
});
