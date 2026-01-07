// public/app.js
// Full SPA frontend: map, feed, washer dashboard, photo confirmations, payment hooks.
// IMPORTANT: This file never contains secret keys. It fetches /api/config for the browser Maps key.

const state = {
  user: { id: 'guest', name: 'Neutral Profile', role: 'client' },
  washers: [],
  jobs: [],
  map: null,
  markers: {},
  userLocation: null,
  radiusMiles: 10
};

// Helpers
const el = id => document.getElementById(id);
const on = (sel, ev, fn) => document.addEventListener(ev, e => {
  if (e.target.matches(sel) || e.target.closest(sel)) fn(e);
});
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Load config and Google Maps dynamically
async function loadConfigAndMaps() {
  const cfg = await fetch('/api/config').then(r => r.json());
  const key = cfg.googleMapsBrowserKey;
  if (!key) {
    console.warn('No browser maps key from /api/config; map will not load.');
    return;
  }
  return new Promise((resolve, reject) => {
    window.initMap = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=initMap`;
    s.async = true; s.defer = true; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Initialize app
async function init() {
  wireUI();
  await loadConfigAndMaps().catch(err => console.warn('Maps load failed', err));
  initMap();
  await refreshAll();
  showHome();
}

// Wire UI controls and nav
function wireUI() {
  on('.bubble-btn', 'click', e => {
    const nav = e.target.closest('.bubble-btn').dataset.nav;
    if (nav === 'map') showMap(); else if (nav === 'dashboard') openWasherDashboard(); else showHome();
  });

  el('btn-new-job')?.addEventListener('click', () => openCreateJobModal());
  el('btn-become-washer')?.addEventListener('click', () => openBecomeWasherModal());
  el('btn-center-me')?.addEventListener('click', () => {
    if (state.userLocation && state.map) state.map.setCenter(state.userLocation);
  });

  el('map-radius')?.addEventListener('input', e => {
    state.radiusMiles = Number(e.target.value);
    el('map-radius-label').textContent = `${state.radiusMiles} mi`;
    filterAndRenderWashers();
  });
}

// Map init
function initMap() {
  if (!window.google || !google.maps) {
    // fallback: create a placeholder
    el('map-canvas').innerHTML = '<div class="map-placeholder">Map unavailable</div>';
    return;
  }
  state.map = new google.maps.Map(el('map-canvas'), { center: { lat: 33.7490, lng: -84.3880 }, zoom: 13, disableDefaultUI: true });
  // try geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => {
      state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
      state.map.setCenter(state.userLocation);
      addUserMarker();
    }, () => {});
  }
}

// Add user marker
function addUserMarker() {
  if (!state.userLocation || !state.map) return;
  new google.maps.Marker({
    position: state.userLocation,
    map: state.map,
    title: 'You',
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#7c4dff', fillOpacity: 1, strokeWeight: 0 }
  });
}

// Load washers and jobs
async function refreshAll() {
  await Promise.all([loadWashers(), loadJobs()]);
}

// API calls
async function loadWashers() {
  try {
    const res = await fetch('/api/washers');
    state.washers = await res.json();
    filterAndRenderWashers();
    renderFeed();
  } catch (err) { console.error('loadWashers', err); }
}
async function loadJobs() {
  try {
    const res = await fetch('/api/jobs');
    state.jobs = await res.json();
    renderFeed();
  } catch (err) { console.error('loadJobs', err); }
}

// Filter by radius and render
function filterAndRenderWashers() {
  if (!state.map || !state.userLocation) {
    renderWashers(state.washers);
    return;
  }
  const filtered = state.washers.filter(w => {
    if (!w.lat || !w.lng) return false;
    const d = distanceMiles(state.userLocation.lat, state.userLocation.lng, Number(w.lat), Number(w.lng));
    w.distance = d.toFixed(1);
    return d <= state.radiusMiles;
  });
  renderWashers(filtered);
}

// Render washers on map and feed
function renderWashers(list) {
  // clear markers
  Object.values(state.markers).forEach(m => m.setMap(null));
  state.markers = {};
  if (!state.map || !window.google) {
    renderFeed(); return;
  }
  list.forEach(w => {
    const pos = { lat: Number(w.lat), lng: Number(w.lng) };
    const marker = new google.maps.Marker({
      position: pos,
      map: state.map,
      title: w.displayName,
      icon: w.active ? undefined : undefined
    });
    marker.addListener('click', () => openWasherHover(w, marker));
    state.markers[w.id] = marker;
  });
  renderFeed();
}

// Feed rendering (jobs + washer cards)
function renderFeed() {
  const feed = el('feed-list'); if (!feed) return;
  feed.innerHTML = '';
  // Jobs
  state.jobs.slice().reverse().forEach(job => {
    const div = document.createElement('div'); div.className = 'feed-item';
    div.innerHTML = `
      <div class="feed-item-head">
        <strong>${escapeHtml(job.client?.name || 'Client')}</strong>
        <span class="muted">${new Date(job.createdAt || Date.now()).toLocaleString()}</span>
      </div>
      <div class="feed-item-body">
        <div>${escapeHtml(job.serviceType || 'service')}</div>
        <div class="muted">Total: $${Number(job.total || 0).toFixed(2)}</div>
      </div>
      <div class="feed-item-actions">
        <button class="lb-secondary btn-view-job" data-id="${job.id}">View</button>
        <button class="lb-primary btn-pay-job" data-id="${job.id}">Pay</button>
      </div>
    `;
    feed.appendChild(div);
  });
  // Washers
  state.washers.forEach(w => {
    const card = document.createElement('div'); card.className = 'washer-card';
    card.innerHTML = `
      <div class="washer-head">
        <strong>${escapeHtml(w.displayName)}</strong>
        <span class="muted">${w.distance ? w.distance + ' mi' : ''}</span>
      </div>
      <div class="washer-body">
        <div class="muted">${escapeHtml(w.bio || '')}</div>
        <div class="washer-services">${(w.services || []).map(s => `<div class="service-line">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</div>`).join('')}</div>
      </div>
      <div class="washer-actions">
        <button class="lb-secondary btn-open-washer" data-id="${w.id}">Open</button>
        <button class="lb-primary btn-request" data-id="${w.id}">Request Pickup</button>
      </div>
    `;
    feed.appendChild(card);
  });
}

// Open washer hover/profile (map click or feed)
function openWasherHover(w, marker) {
  const html = `
    <h3>${escapeHtml(w.displayName)}</h3>
    <p class="muted">${escapeHtml(w.bio || '')}</p>
    <p>Services:</p>
    <ul>${(w.services || []).map(s => `<li>${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</li>`).join('')}</ul>
    <div class="modal-actions">
      <button id="modal-request" class="lb-primary" data-id="${w.id}">Request Pickup</button>
      <button id="modal-message" class="lb-secondary" data-id="${w.id}">Message</button>
      <button id="modal-close" class="lb-secondary">Close</button>
    </div>
  `;
  openModal(html);
  on('#modal-request', 'click', async e => {
    const washerId = e.target.dataset.id;
    await createJobForWasher(washerId);
    closeModal();
    await loadJobs();
  });
}

// Create job flow (client fills order, confirmation photos)
async function openCreateJobModal() {
  const html = `
    <h3>Create Pickup</h3>
    <form id="create-job-form" class="lb-form">
      <label><span>Name</span><input id="cj-name" required /></label>
      <label><span>Email</span><input id="cj-email" type="email" required /></label>
      <label><span>Service</span><select id="cj-service"></select></label>
      <label><span>Weight (lbs)</span><input id="cj-weight" type="number" min="1" value="10" /></label>
      <label><span>Tip</span><input id="cj-tip" type="number" min="0" step="0.5" value="0" /></label>
      <label><span>Photos (required)</span><input id="cj-photos" type="file" accept="image/*" multiple required /></label>
      <div class="modal-actions">
        <button type="submit" class="lb-primary">Create</button>
        <button type="button" id="modal-cancel" class="lb-secondary">Cancel</button>
      </div>
    </form>
  `;
  openModal(html);
  // populate services from washers (aggregate)
  const services = aggregateServices();
  const sel = document.querySelector('#cj-service');
  sel.innerHTML = services.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</option>`).join('');
  on('#create-job-form', 'submit', async e => {
    e.preventDefault();
    const name = el('cj-name').value.trim();
    const email = el('cj-email').value.trim();
    const service = el('cj-service').value;
    const weight = Number(el('cj-weight').value);
    const tip = Number(el('cj-tip').value);
    const photos = el('cj-photos').files;
    if (!photos || photos.length === 0) return alert('Please add photos of your items.');
    // upload photos to server or store as base64 (server must accept)
    const photoUrls = await uploadPhotos(photos);
    const total = calculatePrice(service, weight, tip);
    const job = {
      id: 'job_' + Date.now(),
      client: { name, email },
      serviceType: service,
      weight, tip, total,
      photos: photoUrls,
      status: 'pending',
      createdAt: Date.now()
    };
    await fetch('/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(job) });
    closeModal();
    await loadJobs();
  });
  on('#modal-cancel', 'click', closeModal);
}

// Aggregate services from washers for client selection
function aggregateServices() {
  const map = {};
  state.washers.forEach(w => (w.services || []).forEach(s => {
    const key = s.name;
    if (!map[key] || map[key].price > s.price) map[key] = { name: s.name, price: s.price };
  }));
  return Object.values(map);
}

// Upload photos helper (server must implement /api/upload returning URLs)
async function uploadPhotos(files) {
  const form = new FormData();
  for (const f of files) form.append('photos', f);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error('Photo upload failed');
  return res.json();
}

// Create job for a specific washer (request pickup)
async function createJobForWasher(washerId) {
  const job = {
    id: 'job_' + Date.now(),
    client: { name: state.user.name },
    serviceType: 'wash',
    weight: 10,
    tip: 0,
    total: 15,
    washerId,
    status: 'pending',
    createdAt: Date.now()
  };
  await fetch('/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(job) });
}

// Payment flow: collect token (implement NMI Collect.js) and call server
async function collectPaymentToken() {
  // Replace this with your NMI Collect.js implementation.
  // This placeholder prompts for a test token in dev.
  return prompt('Enter test payment token (dev only)');
}
on('.btn-pay-job', 'click', async e => {
  const id = e.target.dataset.id;
  const job = state.jobs.find(j => j.id === id);
  if (!job) return alert('Job not found');
  try {
    const token = await collectPaymentToken();
    const resp = await fetch('/api/payments/charge', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ jobId: id, paymentToken: token, idempotencyKey: `job-${id}` })
    });
    const data = await resp.json();
    if (data.success) { alert('Payment success'); await loadJobs(); } else alert('Payment failed: ' + (data.error || JSON.stringify(data)));
  } catch (err) { console.error(err); alert('Payment error'); }
});

// Washer dashboard (for washers to configure services, photos, distance)
function openWasherDashboard() {
  const html = `
    <h3>Washer Dashboard</h3>
    <form id="washer-setup" class="lb-form">
      <label><span>Display name</span><input id="wd-name" /></label>
      <label><span>Bio</span><textarea id="wd-bio"></textarea></label>
      <label><span>Active</span><input id="wd-active" type="checkbox" /></label>
      <label><span>Service list (name:price per line)</span><textarea id="wd-services" placeholder="Wash:10\nWash & Fold:15"></textarea></label>
      <label><span>Service radius (miles)</span><input id="wd-radius" type="number" min="1" value="10" /></label>
      <label><span>Photos (washer)</span><input id="wd-photos" type="file" accept="image/*" multiple /></label>
      <div class="modal-actions">
        <button type="submit" class="lb-primary">Save</button>
        <button type="button" id="wd-close" class="lb-secondary">Close</button>
      </div>
    </form>
  `;
  openModal(html);
  on('#washer-setup', 'submit', async e => {
    e.preventDefault();
    const name = el('wd-name').value.trim();
    const bio = el('wd-bio').value.trim();
    const active = el('wd-active').checked;
    const servicesText = el('wd-services').value.trim();
    const services = servicesText.split('\n').map(line => {
      const [n,p] = line.split(':').map(s => s && s.trim());
      return n ? { name: n, price: Number(p || 0) } : null;
    }).filter(Boolean);
    const radius = Number(el('wd-radius').value);
    const photos = el('wd-photos').files;
    const photoUrls = photos.length ? await uploadPhotos(photos) : [];
    const washer = {
      id: state.user.id,
      displayName: name || state.user.name,
      bio, active, services, radius, photos: photoUrls, lat: state.userLocation?.lat, lng: state.userLocation?.lng
    };
    await fetch('/api/washers', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(washer) });
    closeModal();
    await loadWashers();
  });
  on('#wd-close', 'click', closeModal);
}

// Modal helpers
function openModal(html) {
  const root = el('modal-root'); root.innerHTML = `<div class="modal"><div class="modal-body">${html}</div></div>`; root.setAttribute('aria-hidden','false');
  return root;
}
function closeModal() { const root = el('modal-root'); root.innerHTML=''; root.setAttribute('aria-hidden','true'); }

// Utility: distance in miles between lat/lng
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Simple photo upload fallback (server must implement /api/upload)
async function uploadPhotos(files) {
  const form = new FormData();
  for (const f of files) form.append('photos', f);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

// UI views
function showHome() {
  document.querySelector('.pane-left').style.display = 'block';
  document.querySelector('.pane-right').style.display = 'none';
}
function showMap() {
  document.querySelector('.pane-left').style.display = 'none';
  document.querySelector('.pane-right').style.display = 'block';
  if (state.map) google.maps.event.trigger(state.map, 'resize');
}

// Start
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.error('Init error', err));
});
