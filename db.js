// services/db.js
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

// Cloud Run only allows writing to /tmp
const dataFile = process.env.NODE_ENV === 'production'
  ? '/tmp/data.json'
  : path.join(__dirname, '..', 'data.json');

// Ensure file exists
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ washers: [], jobs: [], transactions: [] }, null, 2));
}

const adapter = new JSONFile(dataFile);
const db = new Low(adapter);

async function init() {
  await db.read();
  db.data ||= { washers: [], jobs: [], transactions: [] };
  await db.write();
}

init();

module.exports = {
  async getWashers() {
    await db.read();
    return db.data.washers;
  },

  async saveWasher(w) {
    await db.read();
    if (!w.id) w.id = 'washer_' + Date.now();

    // Remove old version
    db.data.washers = db.data.washers.filter(x => x.id !== w.id);

    // Save new version
    db.data.washers.push(w);
    await db.write();
    return w;
  },

  async getJobs() {
    await db.read();
    return db.data.jobs;
  },

  async saveJob(j) {
    await db.read();
    if (!j.id) j.id = 'job_' + Date.now();
    db.data.jobs.push(j);
    await db.write();
    return j;
  },

  async getJob(id) {
    await db.read();
    return db.data.jobs.find(j => j.id === id);
  },

  async saveTransaction(t) {
    await db.read();
    if (!t.id) t.id = 'txn_' + Date.now();
    db.data.transactions.push(t);
    await db.write();
    return t;
  },

  async findTransactionByIdempotency(key) {
    await db.read();
    return db.data.transactions.find(t => t.idempotencyKey === key);
  }
};
