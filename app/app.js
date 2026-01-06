/* Laundry Bubbles — Real-time edition
   - Real-time location & messaging via Firebase Realtime Database
   - Google Maps + Places for POIs (laundromats, Dollar Tree, Dollar General)
   - Washer multi-order rules (max 5 concurrent)
   - Notifications to clients when washer accepts extra orders
   - Paddle-ready hooks (server required)
   - IndexedDB for media storage (local)
*/

/* -------------------------
   CONFIG — FILL THESE BEFORE RUNNING
   ------------------------- */

/*
  1) Firebase: create a Firebase project, enable Realtime Database (test rules for dev).
     Replace FIREBASE_CONFIG below with your project's config object.
  2) Google Maps: ensure the key below is enabled for Maps JavaScript API and Places API.
  3) Paddle: you need a server endpoint to create checkouts and handle webhooks. Put your server URL in settings (Settings -> Paddle server endpoint).
*/

const GOOGLE_MAPS_KEY = "AIzaSyB02c_eleXuhHWdSMJzqk9mESbXn_PT2zc"; // already provided
const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
// Replace above with your Firebase config. For local testing you can use test rules.

/* -------------------------
   Minimal libs loader (Firebase + Google Maps)
   ------------------------- */
function loadScript(src, id){
  return new Promise((resolve, reject) => {
    if(document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    if(id) s.id = id;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

/* -------------------------
   Firebase init (Realtime DB)
   ------------------------- */
let firebaseApp = null;
let firebaseDb = null;
async function initFirebase(){
  if(window.firebase && window.firebase.apps && window.firebase.apps.length){
    firebaseApp = window.firebase.app();
    firebaseDb = window.firebase.database();
    return;
  }
  // load firebase scripts
  await loadScript("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js", "fb-app");
  await loadScript("https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js", "fb-db");
  window.firebase.initializeApp(FIREBASE_CONFIG);
  firebaseApp = window.firebase.app();
  firebaseDb = window.firebase.database();
}

/* -------------------------
   IndexedDB for media (same as before)
   ------------------------- */
const DB_NAME = "lb_media_db";
const DB_VERSION = 1;
let dbPromise = null;
function openDb(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains("media")){
        db.createObjectStore("media", { keyPath: "id" });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
  });
  return dbPromise;
}
async function saveMediaBlob({ id, type, blob, meta }){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("media","readwrite");
    const store = tx.objectStore("media");
    store.put({ id, type, blob, meta, createdAt: new Date().toISOString() });
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}
async function getMediaById(id){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("media","readonly");
    const store = tx.objectStore("media");
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = e => rej(e);
  });
}

/* -------------------------
   Local storage helpers & models
   ------------------------- */
const LS_KEYS = {
  USER: "lb_user",
  WASHER_PROFILE: "lb_washer_profile",
  WASHER_PAYOUT: "lb_washer_payout",
  CLIENT_PAYMENT: "lb_client_payment",
  JOBS: "lb_jobs",
  SETTINGS: "lb_settings"
};
function $(s){ return document.querySelector(s) }
function $all(s){ return Array.from(document.querySelectorAll(s)) }
function loadLS(k, fallback){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback } catch { return fallback } }
function saveLS(k,v){ localStorage.setItem(k, JSON.stringify(v)) }
function showToast(msg){ const c = $("#toast-container"); if(!c) return; const el = document.createElement("div"); el.className="lb-toast"; el.textContent=msg; c.appendChild(el); setTimeout(()=>{ el.style.opacity="0"; setTimeout(()=>c.removeChild(el),220) },2500) }

function getUser(){ return loadLS(LS_KEYS.USER, null) }
function setUser(u){ saveLS(LS_KEYS.USER, u); hydrateProfileScreen(u); updateDashboardForRole(u) }

function getWasherProfile(){ return loadLS(LS_KEYS.WASHER_PROFILE, { active:false, displayName:"Local washer", location:null, prices:{ wash:1.5, fold:2.0, iron:2.5, pickup:5.0, shoes:8.0, sewing:6.0, other:10.0 }, gallery:[], ownerEmail:null, profilePhotoId:null }) }
function setWasherProfile(p){ saveLS(LS_KEYS.WASHER_PROFILE, p) }

function getWasherPayout(){ return loadLS(LS_KEYS.WASHER_PAYOUT, { method:"none", handle:"" }) }
function setWasherPayout(p){ saveLS(LS_KEYS.WASHER_PAYOUT, p) }

function getClientPayment(){ return loadLS(LS_KEYS.CLIENT_PAYMENT, { method:"none", handle:"" }) }
function setClientPayment(p){ saveLS(LS_KEYS.CLIENT_PAYMENT, p) }

function getJobs(){ return loadLS(LS_KEYS.JOBS, []) }
function setJobs(j){ saveLS(LS_KEYS.JOBS, j) }

function getSettings(){ return loadLS(LS_KEYS.SETTINGS, { publicProfile:true, shareRating:true, saveHistory:true, allowLocation:true, allowCamera:true, allowMediaGallery:true, notifyJobStatus:true, notifyMarketing:false, unlockPro:false, unlockAnalytics:false, cloudUploadEndpoint:"", paddleEndpoint:"" }) }
function setSettings(s){ saveLS(LS_KEYS.SETTINGS, s) }

/* -------------------------
   Totals & platform fee
   ------------------------- */
function calculateTotals(prices, serviceType, weight, includePickup, tip=0){
  const w = Number(weight || 0);
  let base = 0;
  if(serviceType==="wash") base = prices.wash * w;
  else if(serviceType==="wash_fold") base = prices.fold * w;
  else if(serviceType==="wash_fold_iron") base = prices.iron * w;
  else if(serviceType==="shoes") base = prices.shoes;
  else if(serviceType==="sewing") base = prices.sewing;
  else if(serviceType==="other") base = prices.other;
  if(includePickup) base += prices.pickup;
  base = Math.round(base*100)/100;
  const platformFee = Math.round(base * 0.07 * 100) / 100;
  const washerTake = Math.round((base - platformFee) * 100) / 100;
  const total = Math.round((base + Number(tip || 0)) * 100) / 100;
  return { total, washerTake, platformFee, base };
}

/* -------------------------
   Real-time helpers (Firebase paths)
   - /locations/{userEmailSafe} => { lat, lng, ts }
   - /jobs/{jobId} => job object
   - /messages/{jobId} => list of messages
   ------------------------- */
function emailToKey(email){ return email.replace(/[@.]/g, "_") }

/* -------------------------
   Google Maps loader & Places
   ------------------------- */
let googleMapsLoaded = false;
let mapInstance = null;
let mapMarkers = [];
let poiMarkers = [];
let directionsService = null;
let directionsRenderer = null;

function loadGoogleMapsScript(apiKey){
  return new Promise((resolve, reject) => {
    if(googleMapsLoaded) return resolve();
    const id = "google-maps-script";
    if(document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => { googleMapsLoaded = true; resolve(); };
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

async function initGoogleMaps(){
  const settings = getSettings();
  if(!settings.allowLocation){ showToast("Location disabled in Settings."); return; }
  try{
    await loadGoogleMapsScript(GOOGLE_MAPS_KEY);
    const el = document.getElementById("map-canvas");
    if(!el) return;
    mapInstance = new google.maps.Map(el, { center:{lat:33.7490,lng:-84.3880}, zoom:12, disableDefaultUI:false });
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers:true });
    directionsRenderer.setMap(mapInstance);
    refreshMapMarkers();
    refreshPOIs("all");
  }catch(err){
    console.error(err);
    showToast("Failed to load Google Maps. Check key & billing.");
  }
}

function clearMapMarkers(){ mapMarkers.forEach(m=>m.setMap(null)); mapMarkers = [] }
function clearPOIMarkers(){ poiMarkers.forEach(m=>m.setMap(null)); poiMarkers = [] }

function refreshMapMarkers(){
  if(!mapInstance) return;
  clearMapMarkers();
  const washer = getWasherProfile();
  if(washer && washer.active && washer.location){
    const marker = new google.maps.Marker({ position: washer.location, map: mapInstance, title: washer.displayName || "Washer", icon: { path: google.maps.SymbolPath.CIRCLE, scale:8, fillColor:"#5ad1ff", fillOpacity:1, strokeWeight:1 } });
    mapMarkers.push(marker);
  }
  const user = getUser();
  if(user && user.location){
    const marker = new google.maps.Marker({ position: user.location, map: mapInstance, title: user.name || "You", icon: { path: google.maps.SymbolPath.CIRCLE, scale:6, fillColor:"#c287ff", fillOpacity:1, strokeWeight:1 } });
    mapMarkers.push(marker);
  }
  // fit bounds
  const bounds = new google.maps.LatLngBounds();
  mapMarkers.forEach(m => bounds.extend(m.getPosition()));
  if(!bounds.isEmpty()) mapInstance.fitBounds(bounds);
}

/* -------------------------
   POI search: laundromats, Dollar Tree, Dollar General
   - Uses PlacesService.nearbySearch
   - Adds markers with helpful descriptions and washing tips
   ------------------------- */
function refreshPOIs(type){
  if(!mapInstance || !google.maps.places) return;
  clearPOIMarkers();
  const center = mapInstance.getCenter();
  const service = new google.maps.places.PlacesService(mapInstance);
  const requests = [];

  if(type === "laundromat" || type === "all"){
    requests.push({ keyword:"laundromat", radius:5000, location:center, type:["laundry"] });
  }
  if(type === "dollar_tree" || type === "all"){
    requests.push({ keyword:"Dollar Tree", radius:8000, location:center, type:["store"] });
  }
  if(type === "dollar_general" || type === "all"){
    requests.push({ keyword:"Dollar General", radius:8000, location:center, type:["store"] });
  }

  requests.forEach(req => {
    service.nearbySearch(req, (results, status) => {
      if(status === google.maps.places.PlacesServiceStatus.OK && results){
        results.slice(0,8).forEach(place => {
          const marker = new google.maps.Marker({ map: mapInstance, position: place.geometry.location, title: place.name });
          const info = document.createElement("div");
          const name = `<strong>${place.name}</strong>`;
          const addr = place.vicinity || "";
          const tips = place.types && place.types.includes("laundry") ? `<p><em>Tip:</em> Use warm water for mixed loads; separate delicates.</p>` : `<p><em>Note:</em> Nearby store for supplies (detergent, mesh bags).</p>`;
          info.innerHTML = `${name}<div class="lb-muted">${addr}</div>${tips}`;
          const infowindow = new google.maps.InfoWindow({ content: info });
          marker.addListener("click", () => infowindow.open(mapInstance, marker));
          poiMarkers.push(marker);
        });
      }
    });
  });
}

/* -------------------------
   Real-time location publishing & watching
   - Each signed-in user publishes to /locations/{emailKey}
   - Watch other user's location via Firebase listeners
   ------------------------- */
let locationWatchId = null;
async function startPublishingLocation(){
  const settings = getSettings();
  if(!settings.allowLocation) return;
  const user = getUser();
  if(!user) return;
  if(!navigator.geolocation) { showToast("Geolocation not supported."); return; }
  // publish via Firebase
  await initFirebase();
  const db = firebaseDb;
  const key = emailToKey(user.email);
  // watchPosition for continuous updates
  locationWatchId = navigator.geolocation.watchPosition(pos => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
    // local
    user.location = loc; setUser(user);
    // firebase
    db.ref(`/locations/${key}`).set(loc).catch(()=>{});
    // update map markers
    if(mapInstance) refreshMapMarkers();
  }, err => {
    console.warn("watchPosition error", err);
  }, { enableHighAccuracy:true, maximumAge:3000, timeout:10000 });
}

function stopPublishingLocation(){
  if(locationWatchId !== null){
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  // optionally remove from firebase presence
  const user = getUser();
  if(user && firebaseDb){
    const key = emailToKey(user.email);
    firebaseDb.ref(`/locations/${key}`).remove().catch(()=>{});
  }
}

/* -------------------------
   Messaging (Firebase Realtime DB)
   - messages stored under /messages/{jobId}
   - simple push + listener
   ------------------------- */
async function sendMessage(jobId, fromName, fromEmail, text){
  if(!text || !jobId) return;
  await initFirebase();
  const db = firebaseDb;
  const msg = { fromName, fromEmail, text, ts: Date.now() };
  const ref = db.ref(`/messages/${jobId}`).push();
  await ref.set(msg);
}

async function listenMessages(jobId, onMessage){
  await initFirebase();
  const db = firebaseDb;
  const ref = db.ref(`/messages/${jobId}`);
  ref.off(); // remove previous
  ref.on("child_added", snap => {
    const val = snap.val();
    if(onMessage) onMessage(val);
  });
}

/* -------------------------
   Jobs: create, accept, rules
   - When washer accepts a job: check concurrent count (max 5)
   - Notify client via messages and local toast
   - Jobs stored locally and mirrored to Firebase /jobs/{jobId} for cross-device sync
   ------------------------- */
function createLocalJob(job){
  const jobs = getJobs();
  jobs.push(job);
  setJobs(jobs);
  // mirror to firebase
  if(firebaseDb){
    firebaseDb.ref(`/jobs/${job.id}`).set(job).catch(()=>{});
  }
}

async function createJobAndEscrow(payload){
  // payload: { client, washerProfile, serviceType, notes, weight, total, washerTake, platformFee, distanceKm, tip, clientMediaIds }
  const id = "job_" + Date.now();
  const job = { id, status:"escrowed", createdAt:Date.now(), ...payload };
  createLocalJob(job);
  showToast("Job created and escrowed locally (simulation).");
  // publish job to firebase for washer to see
  if(firebaseDb){
    await initFirebase();
    firebaseDb.ref(`/jobs/${job.id}`).set(job).catch(()=>{});
  }
  return job;
}

async function washerAcceptJob(jobId){
  // check washer concurrent jobs
  const user = getUser();
  if(!user) { showToast("Sign in as washer first."); return false; }
  const jobs = getJobs();
  const myJobs = jobs.filter(j => j.washerProfile && j.washerProfile.ownerEmail === user.email && (j.status === "in_progress" || j.status === "accepted" || j.status === "escrowed"));
  if(myJobs.length >= 5){ showToast("You cannot accept more than 5 active orders."); return false; }
  // update local job
  const idx = jobs.findIndex(j => j.id === jobId);
  if(idx === -1){ showToast("Job not found."); return false; }
  jobs[idx].status = "accepted";
  jobs[idx].washerProfile.ownerEmail = user.email;
  setJobs(jobs);
  // notify client via message
  const clientEmail = jobs[idx].client.email;
  const msgText = `${user.name || "Washer"} accepted your job. They may pick up multiple loads; you'll be notified if your job is delayed.`;
  await sendMessage(jobId, user.name || "Washer", user.email, msgText);
  showToast("Job accepted. Client notified.");
  // mirror to firebase
  if(firebaseDb){
    await initFirebase();
    firebaseDb.ref(`/jobs/${jobId}`).update({ status:"accepted", "washerProfile/ownerEmail": user.email }).catch(()=>{});
  }
  return true;
}

/* -------------------------
   Messaging UI wiring
   ------------------------- */
function initMessagesUI(){
  const select = $("#messages-job-select");
  select.innerHTML = "";
  const jobs = getJobs();
  jobs.forEach(j => {
    const opt = document.createElement("option");
    opt.value = j.id;
    opt.textContent = `${j.id} · ${j.serviceType} · ${j.status}`;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    const jobId = select.value;
    openMessageChannel(jobId);
  });
  $("#btn-send-message").addEventListener("click", async () => {
    const jobId = select.value;
    const text = $("#messages-input").value.trim();
    if(!jobId || !text) return;
    const user = getUser();
    await sendMessage(jobId, user.name, user.email, text);
    $("#messages-input").value = "";
  });
}

let currentMessageListenerJob = null;
function openMessageChannel(jobId){
  const list = $("#messages-list");
  list.innerHTML = "";
  if(!jobId) return;
  listenMessages(jobId, (msg) => {
    const el = document.createElement("div");
    el.style.marginBottom = "8px";
    el.innerHTML = `<strong>${msg.fromName}</strong> <span class="lb-muted" style="font-size:12px"> ${new Date(msg.ts).toLocaleTimeString()}</span><div>${msg.text}</div>`;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  });
}

/* -------------------------
   Payments: Paddle stub + helper to call server
   - startPaddleCheckoutForJob(job) calls server endpoint (settings.paddleEndpoint)
   - Server must create Paddle checkout and return redirect URL or token
   ------------------------- */
async function startPaddleCheckoutForJob(job){
  const settings = getSettings();
  if(!settings.paddleEndpoint){
    showToast("Paddle server endpoint not configured in Settings.");
    return;
  }
  try{
    const res = await fetch(`${settings.paddleEndpoint}/create-checkout`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ jobId: job.id, amount: job.total })
    });
    if(!res.ok) throw new Error("Checkout creation failed");
    const data = await res.json();
    // server should return { checkoutUrl } or { checkoutToken }
    if(data.checkoutUrl){
      window.open(data.checkoutUrl, "_blank");
      showToast("Paddle checkout opened.");
    } else {
      showToast("Paddle checkout created. Follow server instructions.");
    }
  }catch(err){
    console.error(err);
    showToast("Failed to start Paddle checkout. Check server logs.");
  }
}

/* -------------------------
   UI wiring & initialization
   ------------------------- */
function showScreen(id){ $all(".lb-screen").forEach(s=>s.classList.add("lb-hidden")); const el = $("#"+id); if(el) el.classList.remove("lb-hidden") }

function initNav(){
  $all(".lb-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      if(target === "dashboard"){
        const user = getUser();
        if(user) updateDashboardForRole(user);
      }
      if(target === "map"){
        initGoogleMaps();
      }
      if(target === "messages"){
        initMessagesUI();
      }
      showScreen("screen-" + target);
    });
  });
}

/* updateDashboardForRole */
function updateDashboardForRole(user){
  const title = $("#dashboard-title");
  const subtitle = $("#dashboard-subtitle");
  const clientDash = $("#client-dashboard");
  const washerDash = $("#washer-dashboard");
  if(!user){
    if(title) title.textContent = "Dashboard";
    if(subtitle) subtitle.textContent = "Create a profile to get started.";
    if(clientDash) clientDash.classList.add("lb-hidden");
    if(washerDash) washerDash.classList.add("lb-hidden");
    return;
  }
  if(user.role === "client"){
    if(title) title.textContent = "Client dashboard";
    if(subtitle) subtitle.textContent = "Find a washer, request pickup or drop off, and track your jobs.";
    if(clientDash) clientDash.classList.remove("lb-hidden");
    if(washerDash) washerDash.classList.add("lb-hidden");
  } else if(user.role === "washer"){
    if(title) title.textContent = "Washer dashboard";
    if(subtitle) subtitle.textContent = "Set prices, go active, manage incoming jobs.";
    if(washerDash) washerDash.classList.remove("lb-hidden");
    if(clientDash) clientDash.classList.add("lb-hidden");
  } else {
    if(title) title.textContent = "Dashboard";
    if(subtitle) subtitle.textContent = "";
    if(clientDash) clientDash.classList.add("lb-hidden");
    if(washerDash) washerDash.classList.add("lb-hidden");
  }
}

/* Home/profile wiring */
function hydrateHomeFromUser(user){
  if(!user) return;
  $("#input-name").value = user.name || "";
  $("#input-email").value = user.email || "";
  $("#input-phone").value = user.phone || "";
  if(user.profilePhotoId){
    getMediaById(user.profilePhotoId).then(rec => {
      if(rec && rec.blob){
        const url = URL.createObjectURL(rec.blob);
        const p = $("#home-profile-photo-preview");
        p.innerHTML = `<img src="${url}" alt="profile" />`;
        p.classList.remove("lb-hidden");
      }
    }).catch(()=>{});
  }
  $("#role-section").classList.remove("lb-hidden");
}
function hydrateProfileScreen(user){
  if(!user) return;
  $("#profile-name").value = user.name || "";
  $("#profile-email").value = user.email || "";
  $("#profile-phone").value = user.phone || "";
  $("#profile-role").value = user.role || "client";
  if(user.profilePhotoId){
    getMediaById(user.profilePhotoId).then(rec => {
      if(rec && rec.blob){
        const url = URL.createObjectURL(rec.blob);
        const p = $("#profile-photo-preview");
        p.innerHTML = `<img src="${url}" alt="profile" />`;
        p.classList.remove("lb-hidden");
      }
    }).catch(()=>{});
  }
}

function initHome(){
  $("#btn-save-profile").addEventListener("click", async () => {
    const name = $("#input-name").value.trim();
    const email = $("#input-email").value.trim();
    const phone = $("#input-phone").value.trim();
    if(!name || !email){ showToast("Name and email required."); return; }
    let user = getUser() || {};
    user.name = name; user.email = email; user.phone = phone; user.role = user.role || "client";
    const fileInput = $("#input-profile-photo");
    if(fileInput && fileInput.files && fileInput.files[0]){
      const f = fileInput.files[0];
      const id = "media_profile_" + Date.now();
      await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: email, purpose:"profile" } });
      user.profilePhotoId = id;
    }
    setUser(user);
    $("#role-section").classList.remove("lb-hidden");
    showToast("Profile saved.");
    // start publishing location if allowed
    startPublishingLocation().catch(()=>{});
  });

  $all(".lb-role-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      const user = getUser();
      if(!user){ showToast("Save profile first."); return; }
      user.role = role; setUser(user); updateDashboardForRole(user); showToast(`Role set to ${role}.`); showScreen("screen-dashboard");
    });
  });

  $("#btn-profile-save")?.addEventListener("click", async () => {
    const user = getUser() || {};
    user.name = $("#profile-name").value.trim();
    user.email = $("#profile-email").value.trim();
    user.phone = $("#profile-phone").value.trim();
    user.role = $("#profile-role").value;
    const pf = $("#profile-photo");
    if(pf && pf.files && pf.files[0]){
      const f = pf.files[0];
      const id = "media_profile_" + Date.now();
      await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: user.email, purpose:"profile" } });
      user.profilePhotoId = id;
    }
    setUser(user);
    showToast("Profile updated.");
    startPublishingLocation().catch(()=>{});
  });
}

/* Washer dashboard wiring */
function hydrateWasherDashboard(){
  const profile = getWasherProfile();
  $("#washer-active-toggle").checked = !!profile.active;
  $("#washer-display-name").value = profile.displayName || "Local washer";
  if(profile.profilePhotoId){
    getMediaById(profile.profilePhotoId).then(rec => {
      if(rec && rec.blob){
        const url = URL.createObjectURL(rec.blob);
        $("#washer-photo-preview").innerHTML = `<img src="${url}" alt="washer" />`; $("#washer-photo-preview").classList.remove("lb-hidden");
      }
    }).catch(()=>{});
  }
  if(profile.location) $("#washer-location-display").textContent = `Lat ${profile.location.lat.toFixed(4)}, Lng ${profile.location.lng.toFixed(4)}`; else $("#washer-location-display").textContent = "No location set.";
  const p = profile.prices;
  $("#washer-price-wash").value = p.wash; $("#washer-price-fold").value = p.fold; $("#washer-price-iron").value = p.iron; $("#washer-price-pickup").value = p.pickup; $("#washer-price-shoes").value = p.shoes; $("#washer-price-sewing").value = p.sewing; $("#washer-price-other").value = p.other;
  const payout = getWasherPayout(); $("#washer-payout-method").value = payout.method; $("#washer-payout-handle").value = payout.handle;
  const gallery = profile.gallery || [];
  const container = $("#washer-gallery-preview"); container.innerHTML = "";
  gallery.forEach(item => {
    getMediaById(item.id).then(rec => {
      if(!rec) return;
      const div = document.createElement("div"); div.className = "thumb";
      if(rec.type.startsWith("image/")) { const url = URL.createObjectURL(rec.blob); div.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" />`; }
      else if(rec.type.startsWith("video/")) { const url = URL.createObjectURL(rec.blob); div.innerHTML = `<video src="${url}" muted playsinline></video>`; }
      container.appendChild(div);
    }).catch(()=>{});
  });
}

function initWasherDashboard(){
  $("#washer-active-toggle").addEventListener("change", () => {
    const profile = getWasherProfile();
    profile.active = $("#washer-active-toggle").checked;
    profile.ownerEmail = (getUser()||{}).email || profile.ownerEmail;
    setWasherProfile(profile);
    showToast(profile.active ? "You are now active." : "You went inactive.");
    if(mapInstance) refreshMapMarkers();
  });

  $("#btn-washer-use-location").addEventListener("click", () => {
    const settings = getSettings();
    if(!settings.allowLocation){ showToast("Location disabled in Settings."); return; }
    if(!navigator.geolocation){ showToast("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const profile = getWasherProfile();
      profile.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setWasherProfile(profile);
      $("#washer-location-display").textContent = `Lat ${profile.location.lat.toFixed(4)}, Lng ${profile.location.lng.toFixed(4)}`;
      showToast("Location updated.");
      if(mapInstance) refreshMapMarkers();
    }, ()=> showToast("Unable to get location."));
  });

  $("#btn-save-washer-profile").addEventListener("click", async () => {
    const profile = getWasherProfile();
    profile.displayName = $("#washer-display-name").value.trim() || "Local washer";
    profile.prices = {
      wash: Number($("#washer-price-wash").value || 0),
      fold: Number($("#washer-price-fold").value || 0),
      iron: Number($("#washer-price-iron").value || 0),
      pickup: Number($("#washer-price-pickup").value || 0),
      shoes: Number($("#washer-price-shoes").value || 0),
      sewing: Number($("#washer-price-sewing").value || 0),
      other: Number($("#washer-price-other").value || 0)
    };
    profile.ownerEmail = (getUser()||{}).email || profile.ownerEmail;
    const pf = $("#washer-profile-photo");
    if(pf && pf.files && pf.files[0]){
      const f = pf.files[0];
      const id = "media_washer_profile_" + Date.now();
      await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: profile.ownerEmail, purpose:"washer_profile" } });
      profile.profilePhotoId = id;
    }
    setWasherProfile(profile);
    showToast("Washer profile saved.");
    hydrateWasherDashboard();
  });

  $("#btn-save-washer-payout").addEventListener("click", () => {
    const payout = { method: $("#washer-payout-method").value, handle: $("#washer-payout-handle").value.trim() };
    setWasherPayout(payout);
    showToast("Payout settings saved.");
  });

  $("#btn-save-washer-gallery").addEventListener("click", async () => {
    const settings = getSettings();
    if(!settings.allowMediaGallery){ showToast("Media gallery disabled in Settings."); return; }
    const profile = getWasherProfile();
    const photos = $("#washer-gallery-photos").files || [];
    const video = $("#washer-gallery-video").files && $("#washer-gallery-video").files[0];
    for(const f of photos){
      const id = "media_gallery_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
      await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: profile.ownerEmail, purpose:"gallery" } });
      profile.gallery = profile.gallery || [];
      profile.gallery.push({ id, type: f.type });
    }
    if(video){
      const id = "media_gallery_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
      await saveMediaBlob({ id, type: video.type, blob: video, meta:{ ownerEmail: profile.ownerEmail, purpose:"gallery_video" } });
      profile.gallery = profile.gallery || [];
      profile.gallery.push({ id, type: video.type });
    }
    setWasherProfile(profile);
    showToast("Gallery saved locally.");
    hydrateWasherDashboard();
  });
}

/* Client flows & jobs */
let clientLocation = null;
let selectedWasher = null;

function initClientDashboard(){
  $("#btn-client-refresh-location").addEventListener("click", () => {
    const settings = getSettings();
    if(!settings.allowLocation){ showToast("Location disabled in Settings."); return; }
    if(!navigator.geolocation){ showToast("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      clientLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const user = getUser() || {}; user.location = clientLocation; setUser(user);
      showToast("Client location updated.");
      hydrateClientWashers();
      if(mapInstance) refreshMapMarkers();
    }, ()=> showToast("Unable to get location."));
  });

  $("#btn-client-refresh-washers").addEventListener("click", () => { hydrateClientWashers(); if(mapInstance) refreshMapMarkers(); });
  $("#btn-client-open-map").addEventListener("click", () => { initGoogleMaps(); showScreen("screen-map"); });

  $("#btn-job-calc").addEventListener("click", () => {
    if(!selectedWasher){ showToast("Select a washer first."); return; }
    const serviceType = $("#client-service-type").value;
    const weight = Number($("#client-job-weight").value || 0);
    const includePickup = $("#client-job-pickup").value === "yes";
    const tip = Number($("#client-job-tip").value || 0);
    const totals = calculateTotals(selectedWasher.prices, serviceType, weight, includePickup, tip);
    $("#client-job-total").textContent = `Total: $${totals.total} · Washer gets $${totals.washerTake} · Platform fee: $${totals.platformFee} · Tip: $${tip}`;
  });

  $("#client-job-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!selectedWasher){ showToast("Select a washer first."); return; }
    const user = getUser(); if(!user){ showToast("Create profile first."); return; }
    const clientPayment = getClientPayment();
    if(clientPayment.method === "none" || !clientPayment.handle.trim()){ showToast("Set up payment in Payments screen."); return; }

    const serviceType = $("#client-service-type").value;
    const notes = $("#client-job-notes").value.trim();
    const weight = Number($("#client-job-weight").value || 0);
    const includePickup = $("#client-job-pickup").value === "yes";
    const tip = Number($("#client-job-tip").value || 0);

    const totals = calculateTotals(selectedWasher.prices, serviceType, weight, includePickup, tip);
    const distanceKm = clientLocation && selectedWasher.location ? calcDistanceKm(clientLocation, selectedWasher.location) : null;

    const settings = getSettings();
    const mediaIds = [];
    if(settings.allowCamera){
      const photos = $("#client-job-photos").files || [];
      for(const f of photos){
        const id = "media_client_job_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
        await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: user.email, purpose:"client_job_photo" } });
        mediaIds.push(id);
      }
      const video = $("#client-job-video").files && $("#client-job-video").files[0];
      if(video){
        const id = "media_client_job_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
        await saveMediaBlob({ id, type: video.type, blob: video, meta:{ ownerEmail: user.email, purpose:"client_job_video" } });
        mediaIds.push(id);
      }
    }

    const job = {
      id: "job_" + Date.now(),
      status: "escrowed",
      createdAt: Date.now(),
      client: { name: user.name, email: user.email },
      washerProfile: selectedWasher,
      serviceType, notes, weight,
      total: totals.total, washerTake: totals.washerTake, platformFee: totals.platformFee,
      distanceKm, tip, clientMediaIds: mediaIds, washerMediaIds: []
    };

    createLocalJob(job);
    // mirror to firebase
    if(firebaseDb){ await initFirebase(); firebaseDb.ref(`/jobs/${job.id}`).set(job).catch(()=>{}); }
    showToast("Job created and escrowed locally (simulation).");
    hydrateClientJobs(); hydrateWasherJobs(); hydratePaymentsScreen();
  });
}

function hydrateClientWashers(){
  const list = $("#client-washer-list"); list.innerHTML = "";
  const washerProfile = getWasherProfile();
  if(!washerProfile.active){ const li = document.createElement("li"); li.className="lb-muted"; li.textContent="No active washers right now."; list.appendChild(li); selectedWasher=null; $("#client-selected-washer").classList.add("lb-hidden"); return; }
  const washerLoc = washerProfile.location;
  const distanceKm = clientLocation && washerLoc ? calcDistanceKm(clientLocation, washerLoc) : null;
  const li = document.createElement("li"); li.className="lb-list-item";
  const main = document.createElement("div"); main.className="lb-list-item-main";
  const title = document.createElement("div"); title.textContent = washerProfile.displayName || "Local washer";
  const meta = document.createElement("div"); meta.className="lb-muted"; meta.textContent = distanceKm != null ? `· ${distanceKm} km away` : "Active washer";
  main.appendChild(title); main.appendChild(meta);
  const actions = document.createElement("div"); const btnView = document.createElement("button"); btnView.className="lb-primary"; btnView.textContent="View";
  btnView.addEventListener("click", () => {
    const user = getUser();
    selectedWasher = { ...washerProfile, ownerEmail: washerProfile.ownerEmail || (user?user.email:"washer@example.com") };
    hydrateClientSelectedWasher();
  });
  actions.appendChild(btnView); li.appendChild(main); li.appendChild(actions); list.appendChild(li);
}

function hydrateClientSelectedWasher(){
  const panel = $("#client-selected-washer"); const container = $("#client-washer-profile");
  if(!selectedWasher){ panel.classList.add("lb-hidden"); return; }
  panel.classList.remove("lb-hidden"); container.innerHTML = "";
  const name = selectedWasher.displayName || "Local washer"; const p = selectedWasher.prices;
  let html = `<p><strong>${name}</strong></p><p class="lb-muted">Only active washers appear here.</p><div class="lb-grid-2" style="margin-top:8px;">`;
  html += `<div class="lb-muted">Wash (per lb): $${p.wash}</div><div class="lb-muted">Wash &amp; fold (per lb): $${p.fold}</div><div class="lb-muted">Wash, fold &amp; iron (per lb): $${p.iron}</div><div class="lb-muted">Pickup / delivery: $${p.pickup}</div><div class="lb-muted">Shoes (per pair): $${p.shoes}</div><div class="lb-muted">Sewing / repair (per item): $${p.sewing}</div><div class="lb-muted">Other: $${p.other}</div></div>`;
  if(selectedWasher.gallery && selectedWasher.gallery.length){
    html += `<h4 style="margin-top:10px">Gallery</h4><div class="lb-gallery-preview" id="client-washer-gallery"></div>`;
  }
  // Add washing tips and laundromat guidance
  html += `<div style="margin-top:12px"><h4>Helpful washing tips</h4><ul class="lb-muted"><li>Sort colors and delicates; use mesh bags for small items.</li><li>Check care labels; use cold water for colors to prevent bleeding.</li><li>For heavy loads, consider using a laundromat with large-capacity machines.</li><li>Wash shoes separately and air-dry when possible.</li></ul></div>`;
  container.innerHTML = html;
  const galleryEl = $("#client-washer-gallery");
  if(galleryEl && selectedWasher.gallery){
    galleryEl.innerHTML = "";
    selectedWasher.gallery.forEach(item => {
      getMediaById(item.id).then(rec => {
        if(!rec) return;
        const div = document.createElement("div"); div.className = "thumb";
        if(rec.type.startsWith("image/")) { const url = URL.createObjectURL(rec.blob); div.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" />`; }
        else if(rec.type.startsWith("video/")) { const url = URL.createObjectURL(rec.blob); div.innerHTML = `<video src="${url}" muted playsinline controls></video>`; }
        galleryEl.appendChild(div);
      }).catch(()=>{});
    });
  }
}

function hydrateClientJobs(){
  const list = $("#client-job-list"); list.innerHTML = ""; const jobs = getJobs(); const user = getUser(); if(!user) return;
  const relevant = jobs.filter(j => j.client && j.client.email === user.email);
  if(!relevant.length){ const li = document.createElement("li"); li.className="lb-muted"; li.textContent="No jobs yet."; list.appendChild(li); return; }
  relevant.forEach(job => {
    const li = document.createElement("li"); li.className="lb-list-item";
    const main = document.createElement("div"); main.className="lb-list-item-main";
    const title = document.createElement("div"); title.textContent = `${job.serviceType} with ${job.washerProfile.displayName || "washer"}`;
    const meta = document.createElement("div"); meta.className="lb-muted"; const dist = job.distanceKm != null ? `${job.distanceKm} km · ` : "";
    meta.textContent = `${dist}Total $${job.total} · Status: ${job.status}`;
    main.appendChild(title); main.appendChild(meta);
    li.appendChild(main);
    if(job.status === "escrowed"){
      const btnCancel = document.createElement("button"); btnCancel.className="lb-secondary"; btnCancel.textContent="Cancel";
      btnCancel.addEventListener("click", () => {
        updateJobStatus(job.id, "cancelled");
        if(firebaseDb){ firebaseDb.ref(`/jobs/${job.id}`).update({ status:"cancelled" }).catch(()=>{}); }
        showToast("Job cancelled locally.");
        hydrateClientJobs(); hydrateWasherJobs(); hydratePaymentsScreen();
      });
      li.appendChild(btnCancel);
    }
    list.appendChild(li);
  });
}

/* Washer jobs UI */
function hydrateWasherJobs(){
  const list = $("#washer-job-list"); list.innerHTML = ""; const jobs = getJobs(); const user = getUser(); if(!user) return;
  const relevant = jobs.filter(j => j.washerProfile && (j.washerProfile.ownerEmail === user.email || j.washerProfile.ownerEmail == null));
  if(!relevant.length){ const li = document.createElement("li"); li.className="lb-muted"; li.textContent="No jobs yet."; list.appendChild(li); return; }
  relevant.forEach(job => {
    const li = document.createElement("li"); li.className="lb-list-item";
    const main = document.createElement("div"); main.className="lb-list-item-main";
    const title = document.createElement("div"); title.textContent = `${job.client.name} · ${job.serviceType}`;
    const meta = document.createElement("div"); meta.className="lb-muted"; meta.textContent = `Total $${job.total} · Washer gets $${job.washerTake} · Status: ${job.status}`;
    main.appendChild(title); main.appendChild(meta);
    const actions = document.createElement("div");
    const btnAccept = document.createElement("button"); btnAccept.className="lb-primary"; btnAccept.textContent="Accept";
    const btnStart = document.createElement("button"); btnStart.className="lb-secondary"; btnStart.textContent="Start";
    const btnComplete = document.createElement("button"); btnComplete.className="lb-primary"; btnComplete.textContent="Complete";

    btnAccept.addEventListener("click", async () => {
      // accept job with concurrency check
      const user = getUser();
      if(!user){ showToast("Sign in as washer."); return; }
      const jobsAll = getJobs();
      const myActive = jobsAll.filter(j => j.washerProfile && j.washerProfile.ownerEmail === user.email && (j.status === "accepted" || j.status === "in_progress")).length;
      if(myActive >= 5){ showToast("Cannot accept more than 5 active orders."); return; }
      // assign job
      const idx = jobsAll.findIndex(j => j.id === job.id);
      if(idx>=0){
        jobsAll[idx].washerProfile.ownerEmail = user.email;
        jobsAll[idx].status = "accepted";
        setJobs(jobsAll);
        // notify client
        await sendMessage(job.id, user.name || "Washer", user.email, `${user.name || "Washer"} accepted your job. They may take additional orders; you'll be notified.`);
        if(firebaseDb){ await initFirebase(); firebaseDb.ref(`/jobs/${job.id}`).update({ status:"accepted", "washerProfile/ownerEmail": user.email }).catch(()=>{}); }
        showToast("Job accepted and client notified.");
        hydrateWasherJobs(); hydrateClientJobs(); hydratePaymentsScreen();
      }
    });

    btnStart.addEventListener("click", async () => {
      const user = getUser();
      if(!user){ showToast("Sign in as washer."); return; }
      // require pickup photos
      const settings = getSettings();
      if(settings.allowCamera){
        const files = await promptForFiles(true);
        const mediaIds = [];
        for(const f of files){
          const id = "media_washer_job_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
          await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: user.email, purpose:"washer_pickup_photo", jobId: job.id } });
          mediaIds.push(id);
        }
        const jobsAll = getJobs(); const idx = jobsAll.findIndex(j=>j.id===job.id);
        if(idx>=0){ jobsAll[idx].washerMediaIds = (jobsAll[idx].washerMediaIds||[]).concat(mediaIds); jobsAll[idx].status = "in_progress"; setJobs(jobsAll); if(firebaseDb){ firebaseDb.ref(`/jobs/${job.id}`).update({ status:"in_progress" }).catch(()=>{}); } showToast("Job started. Pickup photos saved."); hydrateWasherJobs(); hydrateClientJobs(); hydratePaymentsScreen(); }
      } else {
        showToast("Camera disabled in Settings; cannot attach pickup photos.");
      }
    });

    btnComplete.addEventListener("click", async () => {
      const user = getUser();
      if(!user){ showToast("Sign in as washer."); return; }
      const settings = getSettings();
      if(settings.allowCamera){
        const files = await promptForFiles(true);
        if(!files || files.length===0){ showToast("Completion photos required."); return; }
        const mediaIds = [];
        for(const f of files){
          const id = "media_washer_job_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
          await saveMediaBlob({ id, type: f.type, blob: f, meta:{ ownerEmail: user.email, purpose:"washer_completion_photo", jobId: job.id } });
          mediaIds.push(id);
        }
        const jobsAll = getJobs(); const idx = jobsAll.findIndex(j=>j.id===job.id);
        if(idx>=0){ jobsAll[idx].washerMediaIds = (jobsAll[idx].washerMediaIds||[]).concat(mediaIds); jobsAll[idx].status = "completed"; setJobs(jobsAll); if(firebaseDb){ firebaseDb.ref(`/jobs/${job.id}`).update({ status:"completed" }).catch(()=>{}); } showToast("Job completed. Funds released (simulated)."); hydrateWasherJobs(); hydrateClientJobs(); hydratePaymentsScreen(); }
      } else {
        showToast("Camera disabled in Settings; cannot attach completion photos.");
      }
    });

    actions.appendChild(btnAccept); actions.appendChild(btnStart); actions.appendChild(btnComplete);
    li.appendChild(main); li.appendChild(actions); list.appendChild(li);
  });
}

/* promptForFiles helper */
function promptForFiles(multiple=false){
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = !!multiple;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : [];
      document.body.removeChild(input);
      resolve(files);
    });
    input.click();
  });
}

/* Payments UI */
function hydratePaymentsScreen(){
  const payment = getClientPayment();
  $("#client-payment-method").value = payment.method;
  $("#client-payment-handle").value = payment.handle;
  const list = $("#escrow-summary"); list.innerHTML = "";
  const jobs = getJobs();
  if(!jobs.length){ const li = document.createElement("li"); li.className="lb-muted"; li.textContent="No jobs yet. Escrow will appear here."; list.appendChild(li); return; }
  jobs.forEach(job => {
    const li = document.createElement("li"); li.className="lb-list-item";
    const main = document.createElement("div"); main.className="lb-list-item-main";
    const title = document.createElement("div"); title.textContent = `Job ${job.id.split("_")[1]} · ${job.serviceType}`;
    const meta = document.createElement("div"); meta.className="lb-muted"; meta.textContent = `Total $${job.total} · Washer $${job.washerTake} · Platform $${job.platformFee} · Tip $${job.tip} · Status ${job.status}`;
    main.appendChild(title); main.appendChild(meta); li.appendChild(main); list.appendChild(li);
  });
}

function initPaymentsScreen(){
  $("#btn-save-client-payment").addEventListener("click", () => {
    const method = $("#client-payment-method").value;
    const handle = $("#client-payment-handle").value.trim();
    if(method === "none" || !handle){ showToast("Select a method and enter a label."); return; }
    setClientPayment({ method, handle });
    showToast("Client payment setup saved.");
  });

  $("#btn-test-paddle-latest-job").addEventListener("click", () => {
    const jobs = getJobs();
    if(!jobs.length){ showToast("No jobs yet."); return; }
    const latest = jobs[jobs.length - 1];
    startPaddleCheckoutForJob(latest);
  });
}

/* Settings */
function hydrateSettingsUI(){
  const s = getSettings();
  $("#settings-public-profile").checked = !!s.publicProfile;
  $("#settings-share-rating").checked = !!s.shareRating;
  $("#settings-save-history").checked = !!s.saveHistory;
  $("#settings-allow-location").checked = !!s.allowLocation;
  $("#settings-allow-camera").checked = !!s.allowCamera;
  $("#settings-allow-media-gallery").checked = !!s.allowMediaGallery;
  $("#settings-cloud-endpoint").value = s.cloudUploadEndpoint || "";
  $("#settings-paddle-endpoint").value = s.paddleEndpoint || "";
}
function initSettings(){
  hydrateSettingsUI();
  $("#btn-save-settings").addEventListener("click", () => {
    const s = getSettings();
    s.publicProfile = $("#settings-public-profile").checked;
    s.shareRating = $("#settings-share-rating").checked;
    s.saveHistory = $("#settings-save-history").checked;
    s.allowLocation = $("#settings-allow-location").checked;
    s.allowCamera = $("#settings-allow-camera").checked;
    s.allowMediaGallery = $("#settings-allow-media-gallery").checked;
    s.cloudUploadEndpoint = $("#settings-cloud-endpoint").value.trim();
    s.paddleEndpoint = $("#settings-paddle-endpoint").value.trim();
    setSettings(s);
    showToast("Settings saved locally.");
  });
  $("#btn-clear-data").addEventListener("click", () => {
    if(!confirm("Clear all Laundry Bubbles data on this device?")) return;
    Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { showToast("All local data cleared."); window.location.reload(); };
    req.onerror = () => { showToast("Failed to clear DB."); };
  });
}

/* Map controls */
$("#btn-map-refresh-pois")?.addEventListener("click", () => {
  const sel = $("#map-poi-select").value;
  refreshPOIs(sel === "all" ? "all" : sel);
});

/* Messages UI wiring */
function initMessages(){
  const select = $("#messages-job-select");
  select.innerHTML = "";
  const jobs = getJobs();
  jobs.forEach(j => {
    const opt = document.createElement("option");
    opt.value = j.id;
    opt.textContent = `${j.id} · ${j.serviceType} · ${j.status}`;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    const jobId = select.value;
    openMessageChannel(jobId);
  });
  $("#btn-send-message").addEventListener("click", async () => {
    const jobId = select.value;
    const text = $("#messages-input").value.trim();
    if(!jobId || !text) return;
    const user = getUser();
    await sendMessage(jobId, user.name, user.email, text);
    $("#messages-input").value = "";
  });
}

/* Map back */
$("#btn-map-back")?.addEventListener("click", () => {
  const user = getUser();
  if(user) updateDashboardForRole(user);
  showScreen("screen-dashboard");
});

/* -------------------------
   Init app
   ------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  openDb();
  initNav();
  initHome();
  initWasherDashboard();
  initClientDashboard();
  initPaymentsScreen();
  initSettings();
  initFullMap = initGoogleMaps; // alias
  // hydrate UI
  const user = getUser();
  if(user){ hydrateHomeFromUser(user); hydrateProfileScreen(user); updateDashboardForRole(user); startPublishingLocation().catch(()=>{}); }
  hydrateWasherDashboard(); hydrateClientJobs(); hydratePaymentsScreen();
  showScreen(getUser() ? "screen-dashboard" : "screen-home");
});
