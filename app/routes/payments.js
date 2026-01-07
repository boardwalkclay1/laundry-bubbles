/**
 * routes/payments.js
 * - Exposes endpoints to charge, refund, capture, and webhook for NMI
 * - Uses services/nmiService.js to call NMI API (server-side only)
 *
 * NOTE: This file expects NMI credentials in environment variables.
 * Replace the nmiService implementation with exact NMI API parameters per your account.
 */

const express = require('express');
const router = express.Router();
const nmi = require('../services/nmiService');

module.exports = ({ JOBS }) => {
  // Charge (sale) - called when washer accepts job (or when you decide to charge)
  router.post('/charge', async (req, res) => {
    try {
      const { jobId, paymentToken } = req.body;
      if(!jobId || !paymentToken) return res.status(400).json({ error: 'jobId and paymentToken required' });
      const job = JOBS[jobId];
      if(!job) return res.status(404).json({ error: 'job not found' });

      // amount to charge
      const amount = Number(job.total || 0);
      const resp = await nmi.charge({ amount, token: paymentToken, orderId: jobId });

      // store transaction info
      job.transaction = { provider: 'nmi', raw: resp.raw, id: resp.transactionId || null, amount };
      job.status = 'paid';
      JOBS[jobId] = job;

      return res.json({ ok:true, job, resp });
    } catch (err) {
      console.error('charge error', err);
      return res.status(500).json({ error: 'charge failed' });
    }
  });

  // Refund
  router.post('/refund', async (req, res) => {
    try {
      const { jobId, reason } = req.body;
      if(!jobId || !reason) return res.status(400).json({ error: 'jobId and reason required' });
      const job = JOBS[jobId];
      if(!job || !job.transaction) return res.status(404).json({ error: 'job or transaction not found' });

      // compute refund amount
      let refundAmount = 0;
      if(reason === 'washer_cancel') refundAmount = job.transaction.amount;
      else if(reason === 'client_cancel') refundAmount = Math.round(job.transaction.amount * 0.90 * 100) / 100;
      else return res.status(400).json({ error: 'invalid reason' });

      const resp = await nmi.refund({ transactionId: job.transaction.id, amount: refundAmount });

      job.status = 'cancelled';
      job.refund = { amount: refundAmount, reason, raw: resp.raw };
      JOBS[jobId] = job;

      return res.json({ ok:true, job, resp });
    } catch (err) {
      console.error('refund error', err);
      return res.status(500).json({ error: 'refund failed' });
    }
  });

  // Capture (if you used auth on accept and capture on completion)
  router.post('/capture', async (req, res) => {
    try {
      const { jobId } = req.body;
      if(!jobId) return res.status(400).json({ error: 'jobId required' });
      const job = JOBS[jobId];
      if(!job || !job.transaction) return res.status(404).json({ error: 'job or transaction not found' });

      const resp = await nmi.capture({ transactionId: job.transaction.id, amount: job.transaction.amount });
      job.transaction.rawCapture = resp.raw;
      job.status = 'captured';
      JOBS[jobId] = job;
      return res.json({ ok:true, job, resp });
    } catch (err) {
      console.error('capture error', err);
      return res.status(500).json({ error: 'capture failed' });
    }
  });

  // Webhook endpoint (NMI should call this to notify of transaction updates)
  router.post('/webhook', async (req, res) => {
    // Validate webhook signature if NMI provides one
    // Update JOBS accordingly based on payload
    console.log('webhook received', req.body);
    res.json({ ok:true });
  });

  return router;
};
