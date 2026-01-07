// services/db.js
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'data.json'));
const db = low(adapter);

// defaults
db.defaults({ washers: [], jobs: [], transactions: [] }).write();

module.exports = {
  async getWashers() { return db.get('washers').value(); },
  async saveWasher(w) {
    if (!w.id) w.id = 'washer_' + Date.now();
    db.get('washers').remove({ id: w.id }).write();
    db.get('washers').push(w).write();
    return w;
  },
  async getJobs() { return db.get('jobs').value(); },
  async saveJob(j) {
    if (!j.id) j.id = 'job_' + Date.now();
    db.get('jobs').push(j).write();
    return j;
  },
  async getJob(id) { return db.get('jobs').find({ id }).value(); },
  async saveTransaction(t) {
    if (!t.id) t.id = 'txn_' + Date.now();
    db.get('transactions').push(t).write();
    return t;
  },
  async findTransactionByIdempotency(key) {
    return db.get('transactions').find({ idempotencyKey: key }).value();
  }
};
