// public/app.js
// Laundry Bubbles: browser-only SPA with 24-hour PayPal unlock,
// neutral profile, bubble nav, local demo data, and basic map placeholder.

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
const escapeHtml = s =>
  String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

// === PAYMENT: 24-HOUR PAYPAL UNLOCK =====================================

const PAYPAL_LINK = 'https://www.paypal.com/checkoutnow?token=REPLACE_ME_WITH_YOUR_LINK';

function setupPaymentGate() {
  const overlay = el('paywall-overlay');
  const statusEl = el('paywall-status');
  const btnPay = el('btn-pay-unlock');
  const btnRestore = el('btn-pay-restore');

  if (!overlay || !statusEl) return;

  // Detect PayPal return: ?paid=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('paid') === '1') {
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24h

    localStorage.setItem('laundryPaidAt', String(now));
    localStorage.setItem('laundryExpiresAt', String(expiresAt));

    // Clean URL (remove ?paid=1)
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }

  btnPay && btnPay.addEventListener('click', () => {
    window.location.href = PAYPAL_LINK;
  });

  btnRestore && btnRestore.addEventListener('click', () => {
    updatePaywall();
  });

  updatePaywall();

  function updatePaywall() {
    const { active, message } = getPaymentStatus();
    statusEl.textContent = message;
    overlay.style.display = active ? 'none' : 'flex';
    overlay.setAttribute('aria-hidden', active ? 'true' : 'false');
  }

  // Expose for other modules if needed
  window.isLaundryPaid = function () {
    return getPaymentStatus().active;
  };
}

function getPaymentStatus() {
  const expiresRaw = localStorage.getItem('laundryExpiresAt');
  if (!expiresRaw) {
    return {
      active: false,
      message: 'Access locked. Unlock Laundry Bubbles for 24 hours for $1.'
    };
  }

  const expiresAt = parseInt(expiresRaw, 10);
  const now = Date.now();

  if (Number.isNaN(expiresAt) || now >= expiresAt) {
    localStorage.removeItem('laundryPaidAt');
    localStorage.removeItem('laundryExpiresAt');
    return {
      active: false,
      message: 'Your 24-hour access has expired. Unlock again for $1.'
    };
  }

  const diffMs = expiresAt - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    active: true,
    message: `Access active: ${hours}h ${minutes}m remaining.`
  };
}

// === CORE INIT ==========================================================

async function init() {
  setupPaymentGate();
  wireUI();
  initMap();
  seedDemoDataIfEmpty();
  renderAll();
}

// === UI WIRING ==========================================================

function wireUI() {
  // Bubble nav
  document.addEventListener('click', e => {
    const btn = e.target.closest('.bubble-btn');
    if (!btn) return;
    const nav = btn.dataset.nav;
    if (nav === 'map') {
      showMap();
    } else {
      showHome();
    }
  });

  el('btn-new-job') && el('btn-new-job').addEventListener('click', openCreateJobModal);
  el('btn-become-washer') && el('btn-become-washer').addEventListener('click', openBecomeWasherModal);

  const radiusInput = el('map-radius');
  if (radiusInput) {
    radiusInput.addEventListener('input', e => {
      state.radiusMiles = Number(e.target.value);
      const label = el('map-radius-label');
      if (label) label.textContent = `${state.radiusMiles} mi`;
      filterAndRenderWashers();
    });
  }

  const centerBtn = el('btn-center-me');
  if (centerBtn) {
    centerBtn.addEventListener('click', () => {
      if (state.userLocation && state.map) {
        state.map.setCenter(state.userLocation);
      }
    });
  }
}

function showHome() {
  const homePane = el('home-pane');
  const mapPane = el('map-pane');
  if (homePane) homePane.style.display = 'block';
  if (mapPane) mapPane.style.display = 'block';
}

function showMap() {
  const homePane = el('home-pane');
  const mapPane = el('map-pane');
  if (homePane) homePane.style.display = 'none';
  if (mapPane) mapPane.style.display = 'block';
}

// === MAP ================================================================

function initMap() {
  const canvas = el('map-canvas');
  if (!canvas) return;

  if (!window.google || !window.google.maps) {
    canvas.innerHTML = '<div class="map-placeholder">Map unavailable</div>';
    return;
  }

  state.map = new google.maps.Map(canvas, {
    center: { lat: 33.7490, lng: -84.3880 }, // Atlanta
    zoom: 13,
    disableDefaultUI: true
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => {
        state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
        state.map.setCenter(state.userLocation);
        new google.maps.Marker({
          position: state.userLocation,
          map: state.map,
          title: 'You'
        });
        filterAndRenderWashers();
      },
      () => {
        // ignore error, keep default center
      }
    );
  }
}

// === DATA: LOCAL DEMO STATE ============================================

function seedDemoDataIfEmpty() {
  try {
    const storedWashers = JSON.parse(localStorage.getItem('lbWashers') || '[]');
    const storedJobs = JSON.parse(localStorage.getItem('lbJobs') || '[]');
    if (Array.isArray(storedWashers) && storedWashers.length) state.washers = storedWashers;
    if (Array.isArray(storedJobs) && storedJobs.length) state.jobs = storedJobs;
  } catch (e) {
    console.warn('Failed to parse local data', e);
  }

  if (!state.washers.length) {
    state.washers = [
      {
        id: 'w1',
        displayName: 'Midtown Fresh Wash',
        bio: 'Trusted local washer in Midtown.',
        lat: 33.7810,
        lng: -84.3880,
        services: [
          { name: 'Wash', price: 10 },
          { name: 'Wash & Fold', price: 15 }
        ],
        distance: null
      },
      {
        id: 'w2',
        displayName: 'Downtown Spin & Fold',
        bio: 'Same-day fold and delivery.',
        lat: 33.7550,
        lng: -84.3900,
        services: [
          { name: 'Wash', price: 11 },
          { name: 'Wash & Fold', price: 17 }
        ],
        distance: null
      }
    ];
  }

  if (!state.jobs.length) {
    state.jobs = [
      {
        id: 'job_demo',
        client: { name: 'Sample Client' },
        serviceType: 'Wash & Fold',
        weight: 12,
        tip: 2,
        total: 20,
        status: 'pending',
        createdAt: Date.now() - 1000 * 60 * 60
      }
    ];
  }

  saveLocal();
}

function saveLocal() {
  localStorage.setItem('lbWashers', JSON.stringify(state.washers));
  localStorage.setItem('lbJobs', JSON.stringify(state.jobs));
}

// === RENDERING ==========================================================

function renderAll() {
  filterAndRenderWashers();
  renderFeed();
}

function filterAndRenderWashers() {
  if (!state.userLocation) {
    renderWashers(state.washers);
    return;
  }
  const filtered = state.washers
    .map(w => {
      if (!w.lat || !w.lng) return null;
      const d = distanceMiles(
        state.userLocation.lat,
        state.userLocation.lng,
        Number(w.lat),
        Number(w.lng)
      );
      return { ...w, distance: d.toFixed(1), _distanceValue: d };
    })
    .filter(Boolean)
    .filter(w => w._distanceValue <= state.radiusMiles);

  renderWashers(filtered);
}

function renderWashers(list) {
  // Map markers reset
  Object.values(state.markers).forEach(m => m.setMap && m.setMap(null));
  state.markers = {};

  if (state.map && window.google && Array.isArray(list)) {
    list.forEach(w => {
      const pos = { lat: Number(w.lat), lng: Number(w.lng) };
      if (!pos.lat || !pos.lng) return;
      const marker = new google.maps.Marker({
        position: pos,
        map: state.map,
        title: w.displayName
      });
      marker.addListener('click', () => openWasherHover(w));
      state.markers[w.id] = marker;
    });
  }

  renderFeed();
}

function renderFeed() {
  const feed = el('feed-list');
  if (!feed) return;
  feed.innerHTML = '';

  // Jobs
  state.jobs
    .slice()
    .reverse()
    .forEach(job => {
      const div = document.createElement('div');
      div.className = 'feed-item';
      div.innerHTML =
        `<div class="feed-item-head">` +
        `<strong>${escapeHtml(job.client?.name || 'Client')}</strong>` +
        `<span class="muted">${new Date(job.createdAt || Date.now()).toLocaleString()}</span>` +
        `</div>` +
        `<div class="feed-item-body">` +
        `<div>${escapeHtml(job.serviceType || 'service')}</div>` +
        `<div class="muted">Total: $${Number(job.total || 0).toFixed(2)}</div>` +
        `</div>` +
        `<div class="feed-item-actions">` +
        `<button class="lb-secondary btn-view-job" data-id="${job.id}">View</button>` +
        `</div>`;
      feed.appendChild(div);
    });

  // Washers
  state.washers.forEach(w => {
    const card = document.createElement('div');
    card.className = 'washer-card';
    card.innerHTML =
      `<div class="washer-head">` +
      `<strong>${escapeHtml(w.displayName)}</strong>` +
      `<span class="muted">${w.distance ? w.distance + ' mi' : ''}</span>` +
      `</div>` +
      `<div class="washer-body">` +
      `<div class="muted">${escapeHtml(w.bio || '')}</div>` +
      `<div class="washer-services">` +
      ((w.services || [])
        .map(
          s =>
            `<div class="service-line">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</div>`
        )
        .join('')) +
      `</div>` +
      `</div>` +
      `<div class="washer-actions">` +
      `<button class="lb-secondary btn-open-washer" data-id="${w.id}">Open</button>` +
      `<button class="lb-primary btn-request" data-id="${w.id}">Request Pickup</button>` +
      `</div>`;
    feed.appendChild(card);
  });

  // Wire dynamic buttons
  feed.querySelectorAll('.btn-open-washer').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const washer = state.washers.find(w => w.id === id);
      if (washer) openWasherHover(washer);
    });
  });

  feed.querySelectorAll('.btn-request').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      createJobForWasher(id);
    });
  });
}

// === MODALS & FLOWS =====================================================

function openWasherHover(w) {
  const html =
    `<h3>${escapeHtml(w.displayName)}</h3>` +
    `<p class="muted">${escapeHtml(w.bio || '')}</p>` +
    `<p>Services:</p>` +
    `<ul>` +
    ((w.services || [])
      .map(
        s =>
          `<li>${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</li>`
      )
      .join('')) +
    `</ul>` +
    `<div class="modal-actions">` +
    `<button id="modal-request" class="lb-primary" data-id="${w.id}">Request Pickup</button>` +
    `<button id="modal-close" class="lb-secondary">Close</button>` +
    `</div>`;
  openModal(html);

  const reqBtn = document.getElementById('modal-request');
  const closeBtn = document.getElementById('modal-close');

  reqBtn && reqBtn.addEventListener('click', e => {
    const washerId = e.target.dataset.id;
    createJobForWasher(washerId);
    closeModal();
  });

  closeBtn && closeBtn.addEventListener('click', closeModal);
}

function openCreateJobModal() {
  const html =
    `<h3>Create Pickup</h3>` +
    `<form id="create-job-form" class="lb-form">` +
    `<label><span>Your name</span><input id="cj-name" required /></label>` +
    `<label><span>Email</span><input id="cj-email" type="email" required /></label>` +
    `<label><span>Service</span><select id="cj-service"></select></label>` +
    `<label><span>Weight (lbs)</span><input id="cj-weight" type="number" min="1" value="10" /></label>` +
    `<label><span>Tip</span><input id="cj-tip" type="number" min="0" step="0.5" value="0" /></label>` +
    `<label><span>Photos (required)</span><input id="cj-photos" type="file" accept="image/*" multiple required /></label>` +
    `<div class="modal-actions">` +
    `<button type="submit" class="lb-primary">Create</button>` +
    `<button type="button" id="modal-cancel" class="lb-secondary">Cancel</button>` +
    `</div>` +
    `</form>`;
  openModal(html);

  const services = aggregateServices();
  const serviceSelect = document.querySelector('#cj-service');
  if (serviceSelect) {
    serviceSelect.innerHTML = services
      .map(
        s =>
          `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} — $${Number(
            s.price
          ).toFixed(2)}</option>`
      )
      .join('');
  }

  const form = document.querySelector('#create-job-form');
  const cancelBtn = document.querySelector('#modal-cancel');

  form &&
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = el('cj-name').value.trim();
      const email = el('cj-email').value.trim();
      const service = el('cj-service').value;
      const weight = Number(el('cj-weight').value);
      const tip = Number(el('cj-tip').value);
      const photos = el('cj-photos').files;
      if (!photos || photos.length === 0) {
        alert('Please add photos of your items.');
        return;
      }
      const total = calculatePrice(service, weight, tip);
      const job = {
        id: 'job_' + Date.now(),
        client: { name, email },
        serviceType: service,
        weight,
        tip,
        total,
        photosCount: photos.length,
        status: 'pending',
        createdAt: Date.now()
      };
      state.jobs.push(job);
      saveLocal();
      closeModal();
      renderFeed();
    });

  cancelBtn && cancelBtn.addEventListener('click', closeModal);
}

function openBecomeWasherModal() {
  const html =
    `<h3>Washer Dashboard</h3>` +
    `<form id="washer-setup" class="lb-form">` +
    `<label><span>Display name</span><input id="wd-name" /></label>` +
    `<label><span>Bio</span><textarea id="wd-bio"></textarea></label>` +
    `<label><span>Active</span><input id="wd-active" type="checkbox" /></label>` +
    `<label><span>Service list (name:price per line)</span>` +
    `<textarea id="wd-services" placeholder="Wash:10\nWash & Fold:15"></textarea></label>` +
    `<label><span>Service radius (miles)</span><input id="wd-radius" type="number" min="1" value="10" /></label>` +
    `<label><span>Photos (washer)</span><input id="wd-photos" type="file" accept="image/*" multiple /></label>` +
    `<div class="modal-actions">` +
    `<button type="submit" class="lb-primary">Save</button>` +
    `<button type="button" id="wd-close" class="lb-secondary">Close</button>` +
    `</div>` +
    `</form>`;
  openModal(html);

  const form = document.querySelector('#washer-setup');
  const closeBtn = document.querySelector('#wd-close');

  form &&
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = el('wd-name').value.trim();
      const bio = el('wd-bio').value.trim();
      const active = el('wd-active').checked;
      const servicesLines = (el('wd-services').value || '').split('\n');
      const services = servicesLines
        .map(line => {
          const [n, p] = line.split(':').map(s => s && s.trim());
          return n ? { name: n, price: Number(p || 0) } : null;
        })
        .filter(Boolean);

      const washer = {
        id: state.user.id,
        displayName: name || state.user.name,
        bio,
        active,
        services,
        radius: Number(el('wd-radius').value) || 10,
        // Optional: attach current location if available
        lat: state.userLocation?.lat,
        lng: state.userLocation?.lng
      };

      const existingIndex = state.washers.findIndex(w => w.id === washer.id);
      if (existingIndex >= 0) {
        state.washers[existingIndex] = washer;
      } else {
        state.washers.push(washer);
      }
      saveLocal();
      closeModal();
      filterAndRenderWashers();
    });

  closeBtn && closeBtn.addEventListener('click', closeModal);
}

function createJobForWasher(washerId) {
  const washer = state.washers.find(w => w.id === washerId);
  const job = {
    id: 'job_' + Date.now(),
    client: { name: state.user.name },
    serviceType: 'Wash',
    weight: 10,
    tip: 0,
    total: 15,
    washerId,
    washerName: washer ? washer.displayName : undefined,
    status: 'pending',
    createdAt: Date.now()
  };
  state.jobs.push(job);
  saveLocal();
  renderFeed();
}

// === MODAL HELPERS ======================================================

function openModal(html) {
  const root = el('modal-root');
  if (!root) return;
  root.innerHTML = `<div class="modal"><div class="modal-body">${html}</div></div>`;
  root.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const root = el('modal-root');
  if (!root) return;
  root.innerHTML = '';
  root.setAttribute('aria-hidden', 'true');
}

// === UTILS =============================================================

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function aggregateServices() {
  const map = {};
  state.washers.forEach(w =>
    (w.services || []).forEach(s => {
      if (!map[s.name] || map[s.name].price > s.price) {
        map[s.name] = { name: s.name, price: s.price };
      }
    })
  );
  return Object.values(map);
}

function calculatePrice(service, weight, tip) {
  const svc = aggregateServices().find(s => s.name === service);
  const base = svc ? svc.price : 10;
  return Number((base + weight * 0.5 + tip).toFixed(2));
}

// === BOOTSTRAP =========================================================

document.addEventListener('DOMContentLoaded', init);
