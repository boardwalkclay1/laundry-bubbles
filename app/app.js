/* public/app.js
   Frontend logic:
   - Simple SPA navigation between screens
   - Socket.IO realtime location & messaging
   - Google Maps dynamic loader + Places POI search (laundromats, Dollar Tree, Dollar General)
   - Job creation and local job list (calls server /api/jobs)
   - Payment test endpoint calls /api/payments/charge (server handles NMI)
   - Settings allow you to set server base URL and Google Maps key for demo
*/

const socket = io(); // connects to same origin

// Basic helpers
const $ = (s) => document.querySelector(s);
const $all = (s) => Array.from(document.querySelectorAll(s));
const SERVER = { baseUrl: localStorage.getItem('lb_server_url') || (location.origin) };

function showToast(msg){
  const c = $("#toast-container");
  if(!c) return;
  const el = document.createElement("div");
  el.className = "lb-toast";
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity = "0"; setTimeout(()=>c.removeChild(el),220) },2500);
}

// SPA navigation
function showScreen(id){
  $all('.lb-screen').forEach(s => s.classList.add('lb-hidden'));
  const el = document.getElementById(id);
  if(el) el.classList.remove('lb-hidden');
}
$all('.lb-nav-btn').forEach(btn => btn.addEventListener('click', () => {
  const target = btn.dataset.nav;
  if(target === 'map') initMap(); // ensure map loads
  if(target === 'messages') initMessages();
  showScreen('screen-' + target);
}));

// Profile save
$('#btn-save-profile').addEventListener('click', () => {
  const name = $('#input-name').value.trim();
  const email = $('#input-email').value.trim();
  const phone = $('#input-phone').value.trim();
  if(!name || !email) { showToast('Name and email required'); return; }
  const profile = { name, email, phone, role: 'client' };
  localStorage.setItem('lb_profile', JSON.stringify(profile));
  hydrateProfileUI();
  showToast('Profile saved locally');
});

// Profile UI
function hydrateProfileUI(){
  const p = JSON.parse(localStorage.getItem('lb_profile') || 'null');
  if(!p) return;
  $('#profile-name').value = p.name || '';
  $('#profile-email').value = p.email || '';
  $('#profile-role').value = p.role || 'client';
}
$('#btn-profile-save').addEventListener('click', () => {
  const p = JSON.parse(localStorage.getItem('lb_profile') || '{}');
  p.name = $('#profile-name').value.trim();
  p.email = $('#profile-email').value.trim();
  p.role = $('#profile-role').value;
  localStorage.setItem('lb_profile', JSON.stringify(p));
  showToast('Profile updated');
});

// Settings
$('#btn-save-settings').addEventListener('click', () => {
  const url = $('#settings-server-url').value.trim() || location.origin;
  const gkey = $('#settings-google-key').value.trim();
  localStorage.setItem('lb_server_url', url);
  localStorage.setItem('lb_google_key', gkey);
  SERVER.baseUrl = url;
  showToast('Settings saved');
});

// Jobs: create
$('#client-job-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const profile = JSON.parse(localStorage.getItem('lb_profile') || '{}');
  if(!profile || !profile.email){ showToast('Create profile first'); return; }
  const jobId = 'job_' + Date.now();
  const serviceType = $('#client-service-type').value;
  const weight = Number($('#client-job-weight').value || 0);
  const tip = Number($('#client-job-tip').value || 0);
  const base = 1.5 * weight; // simple pricing; replace with washer pricing in real app
  const total = Math.round((base + tip) * 100) / 100;
  const job = {
    id: jobId,
    client: { name: profile.name, email: profile.email },
    serviceType, weight, tip, total,
    status: 'pending',
    createdAt: Date.now()
  };
  // send to server
  const resp = await fetch(`${SERVER.baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job)
  });
  const data = await resp.json();
  if(data.ok){ showToast('Job created'); loadJobs(); } else showToast('Job creation failed');
});

// Load jobs
async function loadJobs(){
  const resp = await fetch(`${SERVER.baseUrl}/api/jobs`);
  const data = await resp.json();
  const list = $('#client-job-list');
  list.innerHTML = '';
  if(!data.jobs || !data.jobs.length){ list.innerHTML = '<li class="lb-muted">No jobs yet</li>'; return; }
  data.jobs.forEach(job => {
    const li = document.createElement('li'); li.className = 'lb-list-item';
    const main = document.createElement('div'); main.className = 'lb-list-item-main';
    const title = document.createElement('div'); title.textContent = `${job.serviceType} · $${job.total}`;
    const meta = document.createElement('div'); meta.className = 'lb-muted'; meta.textContent = `Status: ${job.status}`;
    main.appendChild(title); main.appendChild(meta);
    li.appendChild(main);
    list.appendChild(li);
  });
}

// Washer job list (same endpoint)
async function loadWasherJobs(){
  const resp = await fetch(`${SERVER.baseUrl}/api/jobs`);
  const data = await resp.json();
  const list = $('#washer-job-list');
  list.innerHTML = '';
  if(!data.jobs || !data.jobs.length){ list.innerHTML = '<li class="lb-muted">No jobs yet</li>'; return; }
  data.jobs.forEach(job => {
    const li = document.createElement('li'); li.className = 'lb-list-item';
    const main = document.createElement('div'); main.className = 'lb-list-item-main';
    const title = document.createElement('div'); title.textContent = `${job.client.name} · ${job.serviceType} · $${job.total}`;
    const meta = document.createElement('div'); meta.className = 'lb-muted'; meta.textContent = `Status: ${job.status}`;
    main.appendChild(title); main.appendChild(meta);
    const actions = document.createElement('div');
    const btnAccept = document.createElement('button'); btnAccept.className = 'lb-primary'; btnAccept.textContent = 'Accept';
    btnAccept.addEventListener('click', async () => {
      // Accept: update job locally on server (set status accepted)
      const resp = await fetch(`${SERVER.baseUrl}/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted', washer: { name: localStorage.getItem('lb_profile') ? JSON.parse(localStorage.getItem('lb_profile')).name : 'washer' } })
      });
      const d = await resp.json();
      if(d.ok){ showToast('Job accepted'); loadWasherJobs(); loadJobs(); }
    });
    actions.appendChild(btnAccept);
    li.appendChild(main); li.appendChild(actions);
    list.appendChild(li);
  });
}

// Test charge (calls server /api/payments/charge)
$('#btn-test-charge')?.addEventListener('click', async () => {
  const token = $('#test-payment-token').value.trim();
  const jobId = $('#test-job-id').value.trim();
  if(!token || !jobId){ showToast('token and jobId required'); return; }
  const resp = await fetch(`${SERVER.baseUrl}/api/payments/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, paymentToken: token })
  });
  const data = await resp.json();
  if(data.ok){ showToast('Charge successful (server)'); loadJobs(); } else showToast('Charge failed');
});

// Socket.IO: publish location and listen for updates
function startPublishingLocation(){
  const profile = JSON.parse(localStorage.getItem('lb_profile') || '{}');
  if(!profile || !profile.email) return;
  const userKey = profile.email.replace(/[@.]/g, '_');
  socket.emit('join:user', userKey);
  socket.emit('join:job', ''); // join job rooms as needed
  if(navigator.geolocation){
    navigator.geolocation.watchPosition(pos => {
      const payload = { userKey, lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
      socket.emit('location:update', payload);
    }, err => console.warn('geo err', err), { enableHighAccuracy: true });
  }
}

// Messaging UI
function initMessages(){
  const select = $('#messages-job-select');
  select.innerHTML = '';
  fetch(`${SERVER.baseUrl}/api/jobs`).then(r=>r.json()).then(data=>{
    (data.jobs||[]).forEach(j => {
      const opt = document.createElement('option'); opt.value = j.id; opt.textContent = `${j.id} · ${j.serviceType}`;
      select.appendChild(opt);
    });
  });
  select.addEventListener('change', () => {
    const jobId = select.value;
    if(jobId) socket.emit('join:job', jobId);
    $('#messages-list').innerHTML = '';
  });
  $('#btn-send-message').addEventListener('click', () => {
    const jobId = select.value;
    const text = $('#messages-input').value.trim();
    if(!jobId || !text) return;
    const profile = JSON.parse(localStorage.getItem('lb_profile') || '{}');
    const msg = { jobId, from: profile.name || 'anon', text, ts: Date.now() };
    socket.emit('message:send', msg);
    $('#messages-input').value = '';
  });
  socket.on('message:received', (msg) => {
    const list = $('#messages-list');
    const el = document.createElement('div'); el.style.marginBottom = '8px';
    el.innerHTML = `<strong>${msg.from}</strong> <span class="lb-muted" style="font-size:12px">${new Date(msg.ts).toLocaleTimeString()}</span><div>${msg.text}</div>`;
    list.appendChild(el); list.scrollTop = list.scrollHeight;
  });
}

// Map: dynamic loader and POI search
let mapInstance = null;
let mapMarkers = [];
let poiMarkers = [];
let placesService = null;
function loadGoogleMaps(key){
  return new Promise((resolve, reject) => {
    if(window.google && window.google.maps) return resolve(window.google.maps);
    const id = 'gmaps-script';
    if(document.getElementById(id)) return resolve(window.google.maps);
    const s = document.createElement('script');
    s.id = id;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initMap(){
  const key = localStorage.getItem('lb_google_key') || '';
  if(!key){ showToast('Set Google Maps key in Settings'); return; }
  await loadGoogleMaps(key);
  const el = document.getElementById('map-canvas');
  if(!el) return;
  mapInstance = new google.maps.Map(el, { center: { lat: 33.7490, lng: -84.3880 }, zoom: 12 });
  placesService = new google.maps.places.PlacesService(mapInstance);
  refreshMapMarkers();
  refreshPOIs('all');
}

function clearMarkers(arr){ arr.forEach(m => m.setMap(null)); arr.length = 0; }

function refreshMapMarkers(){
  if(!mapInstance) return;
  clearMarkers(mapMarkers);
  // show local user and washer markers from server jobs or local storage
  fetch(`${SERVER.baseUrl}/api/jobs`).then(r=>r.json()).then(data=>{
    (data.jobs||[]).forEach(job => {
      if(job.washer && job.washer.location){
        const m = new google.maps.Marker({ map: mapInstance, position: job.washer.location, title: job.washer.name || 'Washer' });
        mapMarkers.push(m);
      }
    });
  });
}

function refreshPOIs(type){
  if(!mapInstance || !placesService) return;
  clearMarkers(poiMarkers);
  const center = mapInstance.getCenter();
  const requests = [];
  if(type === 'laundromat' || type === 'all') requests.push({ keyword: 'laundromat', location: center, radius: 5000 });
  if(type === 'dollar_tree' || type === 'all') requests.push({ keyword: 'Dollar Tree', location: center, radius: 8000 });
  if(type === 'dollar_general' || type === 'all') requests.push({ keyword: 'Dollar General', location: center, radius: 8000 });

  requests.forEach(req => {
    placesService.nearbySearch(req, (results, status) => {
      if(status === google.maps.places.PlacesServiceStatus.OK && results){
        results.slice(0,8).forEach(place => {
          const marker = new google.maps.Marker({ map: mapInstance, position: place.geometry.location, title: place.name });
          const info = `<strong>${place.name}</strong><div class="lb-muted">${place.vicinity || ''}</div><div style="margin-top:6px"><em>Tip:</em> Check machine sizes and detergent availability.</div>`;
          const infowindow = new google.maps.InfoWindow({ content: info });
          marker.addListener('click', () => infowindow.open(mapInstance, marker));
          poiMarkers.push(marker);
        });
      }
    });
  });
}

// UI wiring
$('#btn-client-open-map')?.addEventListener('click', () => { initMap(); showScreen('screen-map'); });
$('#btn-map-refresh-pois')?.addEventListener('click', () => { const sel = $('#map-poi-select').value; refreshPOIs(sel); });
$('#btn-map-back')?.addEventListener('click', () => showScreen('screen-dashboard'));

// initial load
document.addEventListener('DOMContentLoaded', () => {
  hydrateProfileUI();
  loadJobs();
  loadWasherJobs();
  startPublishingLocation();
  showScreen('screen-home');

  // populate settings inputs
  $('#settings-server-url').value = localStorage.getItem('lb_server_url') || location.origin;
  $('#settings-google-key').value = localStorage.getItem('lb_google_key') || '';
});
