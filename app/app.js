// public/app.js
// Lightweight SPA for Laundry Bubbles
// Placeholders: implement collectPaymentToken() with your NMI Collect.js integration

const state = {
  washers: [],
  jobs: [],
  map: null,
  markers: {},
  userLocation: null
};

// Utility
function el(id) { return document.getElementById(id); }
function q(sel, root=document) { return root.querySelector(sel); }
function on(selector, event, fn) {
  document.addEventListener(event, e => {
    if (e.target.matches(selector) || e.target.closest(selector)) fn(e);
  });
}

// Init
window.initMap = function initMap() {
  const defaultCenter = { lat: 33.7490, lng: -84.3880 };
  state.map = new google.maps.Map(el('map-canvas'), {
    center: defaultCenter,
    zoom: 13,
    disableDefaultUI: true
  });

  // Try to get user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.map.setCenter(state.userLocation);
      addUserMarker();
    }, () => {});
  }

  loadWashers();
  loadJobs();
};

// Fetch washers from server
async function loadWashers() {
  try {
    const res = await fetch('/api/washers');
    state.washers = await res.json();
    renderWashersOnMap();
    renderFeed();
  } catch (err) {
    console.error('Failed to load washers', err);
  }
}

// Fetch jobs
async function loadJobs() {
  try {
    const res = await fetch('/api/jobs');
    state.jobs = await res.json();
    renderFeed();
  } catch (err) {
    console.error('Failed to load jobs', err);
  }
}

// Map helpers
function addUserMarker() {
  if (!state.userLocation) return;
  new google.maps.Marker({
    position: state.userLocation,
    map: state.map,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#1976d2', fillOpacity: 1, strokeWeight: 0 }
  });
}

function renderWashersOnMap() {
  // clear existing
  Object.values(state.markers).forEach(m => m.setMap(null));
  state.markers = {};

  state.washers.forEach(w => {
    const pos = { lat: Number(w.lat), lng: Number(w.lng) };
    const marker = new google.maps.Marker({
      position: pos,
      map: state.map,
      title: w.displayName,
      icon: w.active ? undefined : '/icons/washer-offline.png'
    });
    marker.addListener('click', () => showWasherProfile(w));
    state.markers[w.id] = marker;
  });
}

// UI rendering
function renderFeed() {
  const feed = el('feed-list');
  if (!feed) return;
  feed.innerHTML = '';

  // Jobs first
  state.jobs.slice().reverse().forEach(job => {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
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
    feed.appendChild(item);
  });

  // Washers as cards
  state.washers.forEach(w => {
    const card = document.createElement('div');
    card.className = 'washer-card';
    card.innerHTML = `
      <div class="washer-head">
        <strong>${escapeHtml(w.displayName)}</strong>
        <span class="muted">${w.distance ? w.distance + ' mi' : ''}</span>
      </div>
      <div class="washer-body">
        <div class="muted">${escapeHtml(w.bio || '')}</div>
      </div>
      <div class="washer-actions">
        <button class="lb-secondary btn-open-washer" data-id="${w.id}">Open</button>
        <button class="lb-primary btn-request" data-id="${w.id}">Request Pickup</button>
      </div>
    `;
    feed.appendChild(card);
  });
}

// Navigation
on('.bubble-btn', 'click', e => {
  const nav = e.target.closest('.bubble-btn').dataset.nav;
  navigateTo(nav);
});

function navigateTo(nav) {
  // simple mapping
  if (nav === 'map') {
    document.querySelector('.pane-left').style.display = 'none';
    document.querySelector('.pane-right').style.display = 'block';
    google.maps.event.trigger(state.map, 'resize');
  } else {
    document.querySelector('.pane-left').style.display = 'block';
    document.querySelector('.pane-right').style.display = 'none';
  }
}

// Job actions
on('.btn-pay-job', 'click', async e => {
  const id = e.target.dataset.id;
  const job = state.jobs.find(j => j.id === id);
  if (!job) return alert('Job not found');

  // Collect payment token via your NMI Collect.js integration
  try {
    const token = await collectPaymentToken(); // implement this with NMI Collect.js
    const resp = await fetch('/api/payments/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: id, paymentToken: token, idempotencyKey: `job-${id}-${Date.now()}` })
    });
    const data = await resp.json();
    if (data.success) {
      alert('Payment successful: ' + data.transactionId);
      loadJobs();
    } else {
      alert('Payment failed: ' + (data.error || data.details || JSON.stringify(data)));
    }
  } catch (err) {
    console.error(err);
    alert('Payment error');
  }
});

// Placeholder for tokenization integration
async function collectPaymentToken() {
  // Replace this with your NMI Collect.js flow.
  // Example: return await NMICollect.createToken({ cardNumber, exp, cvv });
  // For now, prompt for a test token in dev
  return prompt('Enter test payment token (dev only)');
}

// Washer profile modal
function showWasherProfile(w) {
  const modal = openModal(`
    <h3>${escapeHtml(w.displayName)}</h3>
    <p class="muted">${escapeHtml(w.bio || '')}</p>
    <p>Rating: ${w.rating || '—'}</p>
    <div class="modal-actions">
      <button id="modal-request" class="lb-primary">Request Pickup</button>
      <button id="modal-close" class="lb-secondary">Close</button>
    </div>
  `);
  on('#modal-request', 'click', async () => {
    // create a job for this washer
    const job = {
      id: 'job_' + Date.now(),
      client: { name: 'Guest' },
      serviceType: 'wash',
      weight: 10,
      tip: 0,
      total: 15,
      washerId: w.id
    };
    await fetch('/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(job) });
    closeModal();
    loadJobs();
  });
}

// Modal helpers
function openModal(html) {
  const root = el('modal-root');
  root.innerHTML = `<div class="modal"><div class="modal-body">${html}</div></div>`;
  root.setAttribute('aria-hidden', 'false');
  return root;
}
function closeModal() {
  const root = el('modal-root');
  root.innerHTML = '';
  root.setAttribute('aria-hidden', 'true');
}

// Helpers
function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Wire up controls
el('btn-center-me')?.addEventListener('click', () => {
  if (state.userLocation) state.map.setCenter(state.userLocation);
});
el('btn-new-job')?.addEventListener('click', () => {
  navigateTo('home');
  openModal(`<h3>Create Pickup</h3>
    <p>Use the feed to create a job or request a washer from the map.</p>
    <div class="modal-actions"><button id="modal-close2" class="lb-secondary">Close</button></div>`);
  on('#modal-close2', 'click', closeModal);
});

// initial layout
document.addEventListener('DOMContentLoaded', () => {
  // show both panes on wide screens
  if (window.innerWidth > 900) {
    document.querySelector('.pane-left').style.display = 'block';
    document.querySelector('.pane-right').style.display = 'block';
  } else {
    document.querySelector('.pane-left').style.display = 'block';
    document.querySelector('.pane-right').style.display = 'none';
  }
});
