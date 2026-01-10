// public/app.js
// SPA: neutral profile, floating bubble nav, map loader via /api/config, washer dashboard,
// job creation with photo requirement, payment flow using NMI Collect.js tokenization.

const state = {
  user: { id: 'guest', name: 'Neutral Profile', role: 'client' },
  washers: [],
  jobs: [],
  map: null,
  markers: {},
  userLocation: null,
  radiusMiles: 10
};

const el = id => document.getElementById(id);
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Load config and Google Maps
async function loadConfigAndMaps() {
  const cfg = await fetch('/api/config').then(r => r.json());
  const key = cfg.googleMapsBrowserKey;
  if (!key) return;
  return new Promise((resolve, reject) => {
    window.initMap = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=initMap`;
    s.async = true; s.defer = true; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function init() {
  wireUI();
  await loadConfigAndMaps().catch(() => console.warn('Maps not loaded'));
  initMap();
  await refreshAll();
  showHome();
}

function wireUI() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.bubble-btn');
    if (btn) {
      const nav = btn.dataset.nav;
      if (nav === 'map') showMap();
      else if (nav === 'dashboard') openWasherDashboard();
      else showHome();
    }
  });

  el('btn-new-job')?.addEventListener('click', openCreateJobModal);
  el('btn-become-washer')?.addEventListener('click', openBecomeWasherModal);
  el('map-radius')?.addEventListener('input', e => {
    state.radiusMiles = Number(e.target.value);
    el('map-radius-label').textContent = `${state.radiusMiles} mi`;
    filterAndRenderWashers();
  });
  el('btn-center-me')?.addEventListener('click', () => {
    if (state.userLocation && state.map) state.map.setCenter(state.userLocation);
  });
}

function initMap() {
  if (!window.google || !google.maps) {
    el('map-canvas').innerHTML = '<div class="map-placeholder">Map unavailable</div>';
    return;
  }
  state.map = new google.maps.Map(el('map-canvas'), { center: { lat: 33.7490, lng: -84.3880 }, zoom: 13, disableDefaultUI: true });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => {
      state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
      state.map.setCenter(state.userLocation);
      new google.maps.Marker({ position: state.userLocation, map: state.map, title: 'You' });
    }, () => {});
  }
}

async function refreshAll() { await Promise.all([loadWashers(), loadJobs()]); }
async function loadWashers() {
  try { state.washers = await (await fetch('/api/washers')).json(); filterAndRenderWashers(); renderFeed(); } catch(e){console.error(e);}
}
async function loadJobs() {
  try { state.jobs = await (await fetch('/api/jobs')).json(); renderFeed(); } catch(e){console.error(e);}
}

function filterAndRenderWashers() {
  if (!state.userLocation) return renderWashers(state.washers);
  const filtered = state.washers.filter(w => {
    if (!w.lat || !w.lng) return false;
    const d = distanceMiles(state.userLocation.lat, state.userLocation.lng, Number(w.lat), Number(w.lng));
    w.distance = d.toFixed(1);
    return d <= state.radiusMiles;
  });
  renderWashers(filtered);
}

function renderWashers(list) {
  Object.values(state.markers).forEach(m => m.setMap(null));
  state.markers = {};
  if (!state.map || !window.google) return renderFeed();
  list.forEach(w => {
    const pos = { lat: Number(w.lat), lng: Number(w.lng) };
    const marker = new google.maps.Marker({ position: pos, map: state.map, title: w.displayName });
    marker.addListener('click', () => openWasherHover(w));
    state.markers[w.id] = marker;
  });
  renderFeed();
}

function renderFeed() {
  const feed = el('feed-list'); if (!feed) return;
  feed.innerHTML = '';
  state.jobs.slice().reverse().forEach(job => {
    const div = document.createElement('div'); div.className = 'feed-item';
    div.innerHTML = `<div class="feed-item-head"><strong>${escapeHtml(job.client?.name||'Client')}</strong><span class="muted">${new Date(job.createdAt||Date.now()).toLocaleString()}</span></div>
      <div class="feed-item-body"><div>${escapeHtml(job.serviceType||'service')}</div><div class="muted">Total: $${Number(job.total||0).toFixed(2)}</div></div>
      <div class="feed-item-actions"><button class="lb-secondary btn-view-job" data-id="${job.id}">View</button><button class="lb-primary btn-pay-job" data-id="${job.id}">Pay</button></div>`;
    feed.appendChild(div);
  });
  state.washers.forEach(w => {
    const card = document.createElement('div'); card.className = 'washer-card';
    card.innerHTML = `<div class="washer-head"><strong>${escapeHtml(w.displayName)}</strong><span class="muted">${w.distance? w.distance+' mi':''}</span></div>
      <div class="washer-body"><div class="muted">${escapeHtml(w.bio||'')}</div><div class="washer-services">${(w.services||[]).map(s=>`<div class="service-line">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</div>`).join('')}</div></div>
      <div class="washer-actions"><button class="lb-secondary btn-open-washer" data-id="${w.id}">Open</button><button class="lb-primary btn-request" data-id="${w.id}">Request Pickup</button></div>`;
    feed.appendChild(card);
  });
}

function openWasherHover(w) {
  const html = `<h3>${escapeHtml(w.displayName)}</h3><p class="muted">${escapeHtml(w.bio||'')}</p><p>Services:</p><ul>${(w.services||[]).map(s=>`<li>${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</li>`).join('')}</ul>
    <div class="modal-actions"><button id="modal-request" class="lb-primary" data-id="${w.id}">Request Pickup</button><button id="modal-message" class="lb-secondary" data-id="${w.id}">Message</button><button id="modal-close" class="lb-secondary">Close</button></div>`;
  openModal(html);
  document.getElementById('modal-request').addEventListener('click', async e => {
    const washerId = e.target.dataset.id;
    await createJobForWasher(washerId);
    closeModal(); await loadJobs();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
}

function openCreateJobModal() {
  const html = `<h3>Create Pickup</h3><form id="create-job-form" class="lb-form">
    <label><span>Name</span><input id="cj-name" required /></label>
    <label><span>Email</span><input id="cj-email" type="email" required /></label>
    <label><span>Service</span><select id="cj-service"></select></label>
    <label><span>Weight (lbs)</span><input id="cj-weight" type="number" min="1" value="10" /></label>
    <label><span>Tip</span><input id="cj-tip" type="number" min="0" step="0.5" value="0" /></label>
    <label><span>Photos (required)</span><input id="cj-photos" type="file" accept="image/*" multiple required /></label>
    <div class="modal-actions"><button type="submit" class="lb-primary">Create</button><button type="button" id="modal-cancel" class="lb-secondary">Cancel</button></div>
  </form>`;
  openModal(html);
  const services = aggregateServices();
  document.querySelector('#cj-service').innerHTML = services.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</option>`).join('');
  document.querySelector('#create-job-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = el('cj-name').value.trim(), email = el('cj-email').value.trim();
    const service = el('cj-service').value, weight = Number(el('cj-weight').value), tip = Number(el('cj-tip').value);
    const photos = el('cj-photos').files;
    if (!photos || photos.length === 0) return alert('Please add photos of your items.');
    const photoUrls = await uploadPhotos(photos);
    const total = calculatePrice(service, weight, tip);
    const job = { id: 'job_'+Date.now(), client:{name,email}, serviceType:service, weight, tip, total, photos:photoUrls, status:'pending', createdAt:Date.now() };
    await fetch('/api/jobs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(job) });
    closeModal(); await loadJobs();
  });
  document.querySelector('#modal-cancel').addEventListener('click', closeModal);
}

function aggregateServices() {
  const map = {};
  state.washers.forEach(w => (w.services||[]).forEach(s => {
    if (!map[s.name] || map[s.name].price > s.price) map[s.name] = { name: s.name, price: s.price };
  }));
  return Object.values(map);
}

async function uploadPhotos(files) {
  const form = new FormData();
  for (const f of files) form.append('photos', f);
  const res = await fetch('/api/upload', { method:'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

async function handlePayNow() {
  const statusEl = document.getElementById('payment-status');
  if (statusEl) statusEl.textContent = 'Collecting payment token…';
  try {
    if (typeof NMICollect === 'undefined') throw new Error('Payment library not loaded');
    const token = await new Promise((resolve, reject) => {
      NMICollect.createToken({}, (err, result) => {
        if (err) return reject(err);
        if (!result || !result.token) return reject(new Error('No token returned'));
        resolve(result.token);
      });
    });

    if (statusEl) statusEl.textContent = 'Processing payment…';
    const job = state.jobs.slice().reverse()[0];
    if (!job) throw new Error('No job to charge');
    const resp = await fetch('/api/payments/charge', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ jobId: job.id, paymentToken: token, idempotencyKey: `job-${job.id}` })
    });
    const data = await resp.json();
    if (resp.ok && data.success) { if (statusEl) statusEl.textContent = 'Payment successful'; await loadJobs(); }
    else if (statusEl) statusEl.textContent = 'Payment failed: ' + (data.error || data.details || JSON.stringify(data));
  } catch (err) {
    console.error(err); if (statusEl) statusEl.textContent = 'Payment error: ' + (err.message || err);
  }
}

function openWasherDashboard() {
  const html = `<h3>Washer Dashboard</h3><form id="washer-setup" class="lb-form">
    <label><span>Display name</span><input id="wd-name" /></label>
    <label><span>Bio</span><textarea id="wd-bio"></textarea></label>
    <label><span>Active</span><input id="wd-active" type="checkbox" /></label>
    <label><span>Service list (name:price per line)</span><textarea id="wd-services" placeholder="Wash:10\nWash & Fold:15"></textarea></label>
    <label><span>Service radius (miles)</span><input id="wd-radius" type="number" min="1" value="10" /></label>
    <label><span>Photos (washer)</span><input id="wd-photos" type="file" accept="image/*" multiple /></label>
    <div class="modal-actions"><button type="submit" class="lb-primary">Save</button><button type="button" id="wd-close" class="lb-secondary">Close</button></div>
  </form>`;
  openModal(html);
  document.querySelector('#washer-setup').addEventListener('submit', async e => {
    e.preventDefault();
    const name = el('wd-name').value.trim(), bio = el('wd-bio').value.trim(), active = el('wd-active').checked;
    const services = (el('wd-services').value||'').split('\n').map(l => { const [n,p]=l.split(':').map(s=>s&&s.trim()); return n?{name:n,price:Number(p||0)}:null; }).filter(Boolean);
    const photos = el('wd-photos').files; const photoUrls = photos.length ? await uploadPhotos(photos) : [];
    const washer = { id: state.user.id, displayName: name||state.user.name, bio, active, services, radius: Number(el('wd-radius').value), photos: photoUrls, lat: state.userLocation?.lat, lng: state.userLocation?.lng };
    await fetch('/api/washers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(washer) });
    closeModal(); await loadWashers();
  });
  document.querySelector('#wd-close').addEventListener('click', closeModal);
}

function createJobForWasher(washerId) {
  const job = { id: 'job_' + Date.now(), client: { name: state.user.name }, serviceType: 'wash', weight: 10, tip: 0, total: 15, washerId, status: 'pending', createdAt: Date.now() };
  return fetch('/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(job) });
}

function openModal(html) { const root = el('modal-root'); root.innerHTML = `<div class="modal"><div class="modal-body">${html}</div></div>`; root.setAttribute('aria-hidden','false'); return root; }
function closeModal() { const root = el('modal-root'); root.innerHTML=''; root.setAttribute('aria-hidden','true'); }

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function calculatePrice(service, weight, tip) {
  // simple pricing: find service price from aggregate
  const svc = aggregateServices().find(s => s.name === service);
  const base = svc ? svc.price : 10;
  return Number((base + (weight * 0.5) + tip).toFixed(2));
}

document.addEventListener('DOMContentLoaded', () => { init().catch(e => console.error('Init error', e)); });
