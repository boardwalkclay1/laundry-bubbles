// --- Storage keys ---
const LS_KEYS = {
  USER: "lb_user",
  WASHER_PROFILE: "lb_washer_profile",
  WASHER_PAYOUT: "lb_washer_payout",
  JOBS: "lb_jobs", // all jobs local (both client + washer view)
  SETTINGS: "lb_settings"
};

// --- Simple helpers ---
function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showToast(message) {
  const container = $("#toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "lb-toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => container.removeChild(el), 220);
  }, 2500);
}

// --- Router ---
function showScreen(id) {
  $all(".lb-screen").forEach(s => s.classList.add("lb-hidden"));
  const screen = "#" + id;
  const el = $(screen);
  if (el) el.classList.remove("lb-hidden");
}

function updateDashboardForRole(user) {
  const title = $("#dashboard-title");
  const subtitle = $("#dashboard-subtitle");
  const clientDash = $("#client-dashboard");
  const washerDash = $("#washer-dashboard");
  if (!user) return;

  if (user.role === "client") {
    title.textContent = "Client dashboard";
    subtitle.textContent = "Find a washer, request pickup or drop off, and track your jobs.";
    clientDash.classList.remove("lb-hidden");
    washerDash.classList.add("lb-hidden");
  } else if (user.role === "washer") {
    title.textContent = "Washer dashboard";
    subtitle.textContent = "Set your prices, go active, and manage incoming jobs.";
    washerDash.classList.remove("lb-hidden");
    clientDash.classList.add("lb-hidden");
  }
}

// --- Auth & profile ---
function getUser() {
  return loadLS(LS_KEYS.USER, null);
}

function setUser(user) {
  saveLS(LS_KEYS.USER, user);
  hydrateProfileScreen(user);
  updateDashboardForRole(user);
}

function hydrateHomeFromUser(user) {
  if (!user) return;
  $("#input-name").value = user.name || "";
  $("#input-email").value = user.email || "";
  $("#input-phone").value = user.phone || "";
  $("#role-section").classList.remove("lb-hidden");
}

function hydrateProfileScreen(user) {
  if (!user) return;
  $("#profile-name").value = user.name || "";
  $("#profile-email").value = user.email || "";
  $("#profile-phone").value = user.phone || "";
  $("#profile-role").value = user.role || "client";
}

// --- Washer profile & payouts ---
function getWasherProfile() {
  return loadLS(LS_KEYS.WASHER_PROFILE, {
    active: false,
    location: null,
    prices: {
      wash: 1.5,
      fold: 2.0,
      iron: 2.5,
      pickup: 5.0,
      shoes: 8.0,
      sewing: 6.0,
      other: 10.0
    }
  });
}

function setWasherProfile(profile) {
  saveLS(LS_KEYS.WASHER_PROFILE, profile);
}

function getWasherPayout() {
  return loadLS(LS_KEYS.WASHER_PAYOUT, {
    method: "none",
    handle: ""
  });
}

function setWasherPayout(payout) {
  saveLS(LS_KEYS.WASHER_PAYOUT, payout);
}

// --- Jobs & payments (local, simulated) ---
function getJobs() {
  return loadLS(LS_KEYS.JOBS, []);
}

function setJobs(jobs) {
  saveLS(LS_KEYS.JOBS, jobs);
}

function createJob({ client, washerProfile, serviceType, notes, weight, total, washerTake, platformFee, distanceKm }) {
  const jobs = getJobs();
  const id = "job_" + Date.now();
  const job = {
    id,
    status: "escrowed", // escrowed -> in_progress -> completed -> released
    createdAt: new Date().toISOString(),
    client,
    washerProfile,
    serviceType,
    notes,
    weight,
    total,
    washerTake,
    platformFee,
    distanceKm,
    // Since there is no backend, we treat "escrow" as local state only
  };
  jobs.push(job);
  setJobs(jobs);
  return job;
}

function updateJobStatus(id, status) {
  const jobs = getJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx >= 0) {
    jobs[idx].status = status;
    setJobs(jobs);
  }
}

// Escrow: local simulation with 7% platform fee
function calculateTotals(prices, serviceType, weight, includePickup) {
  const w = Number(weight || 0);
  let base = 0;

  if (serviceType === "wash") base = prices.wash * w;
  else if (serviceType === "wash_fold") base = prices.fold * w;
  else if (serviceType === "wash_fold_iron") base = prices.iron * w;
  else if (serviceType === "shoes") base = prices.shoes;
  else if (serviceType === "sewing") base = prices.sewing;
  else if (serviceType === "other") base = prices.other;

  if (includePickup) base += prices.pickup;

  const platformFee = Math.round(base * 0.07 * 100) / 100;
  const washerTake = Math.round((base - platformFee) * 100) / 100;
  const total = Math.round(base * 100) / 100;

  return { total, washerTake, platformFee };
}

// --- Simple distance mock (not real map) ---
function calcDistanceKm(a, b) {
  if (!a || !b) return null;
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  const approx = Math.sqrt(dx * dx + dy * dy) * 111; // very rough
  return Math.round(approx * 10) / 10;
}

// --- Navigation init ---
function initNav() {
  $all(".lb-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      const user = getUser();
      if (target === "dashboard" && user) {
        updateDashboardForRole(user);
      }
      showScreen(`screen-${target}`);
    });
  });
}

// --- Home: profile + role selection ---
function initHome() {
  const saveProfileBtn = $("#btn-save-profile");
  saveProfileBtn.addEventListener("click", () => {
    const name = $("#input-name").value.trim();
    const email = $("#input-email").value.trim();
    const phone = $("#input-phone").value.trim();

    if (!name || !email) {
      showToast("Name and email are required.");
      return;
    }

    let user = getUser() || {};
    user.name = name;
    user.email = email;
    user.phone = phone;
    user.role = user.role || "client";
    setUser(user);

    $("#role-section").classList.remove("lb-hidden");
    showToast("Profile saved.");
  });

  $all(".lb-role-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      const user = getUser();
      if (!user) {
        showToast("Save your profile first.");
        return;
      }
      user.role = role;
      setUser(user);
      updateDashboardForRole(user);
      showToast(`Role set to ${role}.`);
      showScreen("screen-dashboard");
    });
  });
}

// --- Profile screen ---
function initProfileScreen() {
  $("#btn-profile-save").addEventListener("click", () => {
    const user = getUser() || {};
    user.name = $("#profile-name").value.trim();
    user.email = $("#profile-email").value.trim();
    user.phone = $("#profile-phone").value.trim();
    user.role = $("#profile-role").value;
    setUser(user);
    showToast("Profile updated.");
  });
}

// --- Washer dashboard logic ---
function hydrateWasherDashboard() {
  const profile = getWasherProfile();
  $("#washer-active-toggle").checked = !!profile.active;

  if (profile.location) {
    $("#washer-location-display").textContent =
      `Lat ${profile.location.lat.toFixed(4)}, Lng ${profile.location.lng.toFixed(4)}`;
  } else {
    $("#washer-location-display").textContent = "No location set.";
  }

  const { prices } = profile;
  $("#washer-price-wash").value = prices.wash;
  $("#washer-price-fold").value = prices.fold;
  $("#washer-price-iron").value = prices.iron;
  $("#washer-price-pickup").value = prices.pickup;
  $("#washer-price-shoes").value = prices.shoes;
  $("#washer-price-sewing").value = prices.sewing;
  $("#washer-price-other").value = prices.other;

  const payout = getWasherPayout();
  $("#washer-payout-method").value = payout.method;
  $("#washer-payout-handle").value = payout.handle;

  hydrateWasherJobs();
}

function initWasherDashboard() {
  $("#washer-active-toggle").addEventListener("change", () => {
    const profile = getWasherProfile();
    profile.active = $("#washer-active-toggle").checked;
    setWasherProfile(profile);
    showToast(profile.active ? "You are now active." : "You went inactive.");
  });

  $("#btn-washer-use-location").addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const profile = getWasherProfile();
        profile.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setWasherProfile(profile);
        $("#washer-location-display").textContent =
          `Lat ${profile.location.lat.toFixed(4)}, Lng ${profile.location.lng.toFixed(4)}`;
        showToast("Location updated.");
      },
      () => {
        showToast("Unable to get location.");
      }
    );
  });

  $("#btn-save-washer-profile").addEventListener("click", () => {
    const profile = getWasherProfile();
    profile.prices = {
      wash: Number($("#washer-price-wash").value || 0),
      fold: Number($("#washer-price-fold").value || 0),
      iron: Number($("#washer-price-iron").value || 0),
      pickup: Number($("#washer-price-pickup").value || 0),
      shoes: Number($("#washer-price-shoes").value || 0),
      sewing: Number($("#washer-price-sewing").value || 0),
      other: Number($("#washer-price-other").value || 0)
    };
    setWasherProfile(profile);
    showToast("Washer profile saved.");
  });

  $("#btn-save-washer-payout").addEventListener("click", () => {
    const payout = {
      method: $("#washer-payout-method").value,
      handle: $("#washer-payout-handle").value.trim()
    };
    setWasherPayout(payout);
    showToast("Payout settings saved.");
  });
}

// Washer jobs UI
function hydrateWasherJobs() {
  const list = $("#washer-job-list");
  list.innerHTML = "";
  const jobs = getJobs();
  const user = getUser();
  if (!user) return;

  const relevant = jobs.filter(j => j.washerProfile && j.washerProfile.ownerEmail === user.email);
  if (!relevant.length) {
    const li = document.createElement("li");
    li.className = "lb-muted";
    li.textContent = "No jobs yet.";
    list.appendChild(li);
    return;
  }

  relevant.forEach(job => {
    const li = document.createElement("li");
    li.className = "lb-list-item";
    const main = document.createElement("div");
    main.className = "lb-list-item-main";

    const title = document.createElement("div");
    title.textContent = `${job.client.name} · ${job.serviceType}`;
    const meta = document.createElement("div");
    meta.className = "lb-muted";
    meta.textContent = `Total $${job.total} · Washer gets $${job.washerTake} · Status: ${job.status}`;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    const btnStart = document.createElement("button");
    btnStart.className = "lb-secondary";
    btnStart.textContent = "Start";
    const btnComplete = document.createElement("button");
    btnComplete.className = "lb-primary";
    btnComplete.textContent = "Complete";

    btnStart.addEventListener("click", () => {
      updateJobStatus(job.id, "in_progress");
      showToast("Job marked in progress.");
      hydrateWasherJobs();
      hydrateClientJobs();
    });
    btnComplete.addEventListener("click", () => {
      updateJobStatus(job.id, "completed");
      showToast("Job completed. Funds released (simulated).");
      hydrateWasherJobs();
      hydrateClientJobs();
    });

    actions.appendChild(btnStart);
    actions.appendChild(btnComplete);

    li.appendChild(main);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

// --- Client dashboard logic ---
let clientLocation = null;
let selectedWasher = null;

function initClientDashboard() {
  $("#btn-client-refresh-location").addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        clientLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        showToast("Client location updated.");
        hydrateClientWashers();
      },
      () => {
        showToast("Unable to get location.");
      }
    );
  });

  $("#btn-client-refresh-washers").addEventListener("click", () => {
    hydrateClientWashers();
  });

  $("#btn-job-calc").addEventListener("click", () => {
    if (!selectedWasher) {
      showToast("Select a washer first.");
      return;
    }
    const serviceType = $("#client-service-type").value;
    const weight = Number($("#client-job-weight").value || 0);
    const includePickup = true; // always includes pickup in this prototype
    const { total, washerTake, platformFee } = calculateTotals(
      selectedWasher.prices,
      serviceType,
      weight,
      includePickup
    );
    $("#client-job-total").textContent =
      `Total: $${total} · Washer gets $${washerTake} · Platform fee (7%): $${platformFee}`;
  });

  $("#client-job-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!selectedWasher) {
      showToast("Select a washer first.");
      return;
    }
    const user = getUser();
    if (!user) {
      showToast("Create your profile first.");
      return;
    }
    const serviceType = $("#client-service-type").value;
    const notes = $("#client-job-notes").value.trim();
    const weight = Number($("#client-job-weight").value || 0);
    const includePickup = true;
    const totals = calculateTotals(
      selectedWasher.prices,
      serviceType,
      weight,
      includePickup
    );
    const distanceKm = clientLocation && selectedWasher.location
      ? calcDistanceKm(clientLocation, selectedWasher.location)
      : null;

    const job = createJob({
      client: { name: user.name, email: user.email },
      washerProfile: {
        ...selectedWasher,
        ownerEmail: selectedWasher.ownerEmail || user.email // simplistic for prototype
      },
      serviceType,
      notes,
      weight,
      total: totals.total,
      washerTake: totals.washerTake,
      platformFee: totals.platformFee,
      distanceKm
    });

    showToast("Payment captured into escrow (local simulation).");
    hydrateClientJobs();
    hydrateWasherJobs();
  });
}

// Client washers list
function hydrateClientWashers() {
  const list = $("#client-washer-list");
  list.innerHTML = "";

  const washerProfile = getWasherProfile();
  const user = getUser();

  // Backend-less, single-device prototype:
  // if active, show exactly one washer: the current washer profile
  if (!washerProfile.active) {
    const li = document.createElement("li");
    li.className = "lb-muted";
    li.textContent = "No active washers right now.";
    list.appendChild(li);
    selectedWasher = null;
    $("#client-selected-washer").classList.add("lb-hidden");
    return;
  }

  const washerLoc = washerProfile.location;
  const distanceKm = clientLocation && washerLoc
    ? calcDistanceKm(clientLocation, washerLoc)
    : null;

  const li = document.createElement("li");
  li.className = "lb-list-item";

  const main = document.createElement("div");
  main.className = "lb-list-item-main";
  const title = document.createElement("div");
  title.textContent = washerProfile.displayName || "Local washer";

  const meta = document.createElement("div");
  meta.className = "lb-muted";
  const distanceText = distanceKm != null ? `· ${distanceKm} km away` : "";
  meta.textContent = `Active washer ${distanceText}`;

  main.appendChild(title);
  main.appendChild(meta);

  const actions = document.createElement("div");
  const btnView = document.createElement("button");
  btnView.className = "lb-primary";
  btnView.textContent = "View";

  btnView.addEventListener("click", () => {
    selectedWasher = {
      ...washerProfile,
      ownerEmail: user ? user.email : "washer@example.com"
    };
    hydrateClientSelectedWasher();
  });

  actions.appendChild(btnView);
  li.appendChild(main);
  li.appendChild(actions);
  list.appendChild(li);
}

function hydrateClientSelectedWasher() {
  const panel = $("#client-selected-washer");
  const container = $("#client-washer-profile");
  if (!selectedWasher) {
    panel.classList.add("lb-hidden");
    return;
  }
  panel.classList.remove("lb-hidden");
  container.innerHTML = "";

  const name = selectedWasher.displayName || "Local washer";
  const p = selectedWasher.prices;

  const html = `
    <p><strong>${name}</strong></p>
    <p class="lb-muted">Only active washers appear here.</p>
    <div class="lb-grid-2" style="margin-top:8px;">
      <div class="lb-muted">Wash (per lb): $${p.wash}</div>
      <div class="lb-muted">Wash &amp; fold (per lb): $${p.fold}</div>
      <div class="lb-muted">Wash, fold &amp; iron (per lb): $${p.iron}</div>
      <div class="lb-muted">Pickup / delivery: $${p.pickup}</div>
      <div class="lb-muted">Shoes (per pair): $${p.shoes}</div>
      <div class="lb-muted">Sewing / repair: $${p.sewing}</div>
      <div class="lb-muted">Other: $${p.other}</div>
    </div>
  `;
  container.innerHTML = html;
}

// Client jobs UI
function hydrateClientJobs() {
  const list = $("#client-job-list");
  list.innerHTML = "";
  const jobs = getJobs();
  const user = getUser();
  if (!user) return;

  const relevant = jobs.filter(j => j.client && j.client.email === user.email);
  if (!relevant.length) {
    const li = document.createElement("li");
    li.className = "lb-muted";
    li.textContent = "No jobs yet.";
    list.appendChild(li);
    return;
  }

  relevant.forEach(job => {
    const li = document.createElement("li");
    li.className = "lb-list-item";
    const main = document.createElement("div");
    main.className = "lb-list-item-main";

    const title = document.createElement("div");
    title.textContent = `${job.serviceType} with ${job.washerProfile.displayName || "washer"}`;
    const meta = document.createElement("div");
    meta.className = "lb-muted";
    const dist = job.distanceKm != null ? `${job.distanceKm} km · ` : "";
    meta.textContent =
      `${dist}Total $${job.total} · Status: ${job.status}`;

    main.appendChild(title);
    main.appendChild(meta);
    li.appendChild(main);
    list.appendChild(li);
  });
}

// --- Settings ---
function initSettings() {
  $("#btn-clear-data").addEventListener("click", () => {
    if (!confirm("Clear all Laundry Bubbles data on this device?")) return;
    Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
    clientLocation = null;
    selectedWasher = null;
    showToast("All local data cleared.");
    window.location.reload();
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initHome();
  initProfileScreen();
  initWasherDashboard();
  initClientDashboard();
  initSettings();

  const user = getUser();
  if (user) {
    hydrateHomeFromUser(user);
    hydrateProfileScreen(user);
    updateDashboardForRole(user);
  }
  hydrateWasherDashboard();
  hydrateClientJobs();
});
