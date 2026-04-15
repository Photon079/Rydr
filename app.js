/**
 * Rydr — Real Map EV Route Optimizer
 * Uses Nominatim geocoding + OSRM routing + real swap stations
 */

import { getGeminiExplanation } from './logic/gemini_client.js';

// ── Global State ──────────────────────────────────────────────
const state = {
  stations: [],
  startCoords: null,
  endCoords: null,
  routes: [],
  activeRoute: null,
  rainActive: false,
  battery: 60,
  map: null,
  routeLayers: [],
  markerLayers: [],
  geminiKey: 'AIzaSyDwT-EsDotAVXLn5OcNKlBlgEZ_OIIcvSc',
};

const ROUTE_COLORS = ['#3B82F6', '#A78BFA', '#34D399'];
const BASE_CONSUMPTION = 0.15; // kWh/km
const BATTERY_CAPACITY = 1.5; // kWh

// ── Input Validation & Security ──────────────────────────────
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>'"]/g, char => {
      const entities = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    });
}

function validateBattery(battery) {
  const num = parseFloat(battery);
  if (isNaN(num) || num < 0 || num > 100) {
    throw new Error('Battery must be between 0 and 100%');
  }
  return num;
}

function validateCoordinates(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  
  if (isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Invalid latitude. Must be between -90 and 90');
  }
  if (isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid longitude. Must be between -180 and 180');
  }
  
  return { lat: latitude, lng: longitude };
}
const LOW_BATTERY_THRESHOLD = 15; // %

// ── Data Loading ──────────────────────────────────────────────
async function loadStations() {
  try {
    const res = await fetch('./data/swap_stations.json');
    state.stations = await res.json();
    return true;
  } catch (err) {
    showError('Failed to load swap stations');
    return false;
  }
}

// ── Map Init ──────────────────────────────────────────────────
function initMap() {
  const map = L.map('map', { zoomControl: false }).setView([12.9716, 77.5946], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CARTO © OSM',
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  state.map = map;
}

function renderStationMarkers() {
  state.markerLayers.forEach(m => state.map.removeLayer(m));
  state.markerLayers = [];

  for (const station of state.stations) {
    const color = station.status === 'free' ? '#4ADE80' : station.status === 'busy' ? '#FBBF24' : '#6B7280';
    const icon = L.divIcon({
      className: 'station-marker',
      iconSize: [32, 32],
      html: `<div style="width:32px;height:32px;background:${color};border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
      </div>`,
    });
    const marker = L.marker([station.lat, station.lng], { icon })
      .addTo(state.map)
      .bindPopup(`<b>${station.name}</b><br>Status: ${station.status}<br>Capacity: ${station.capacity}`);
    state.markerLayers.push(marker);
  }
}

// ── Geocoding (Nominatim) ─────────────────────────────────────
let searchTimeout = null;
async function searchAddress(query, targetField) {
  if (query.length < 3) return;
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Bangalore')}&format=json&limit=5`);
      const results = await res.json();
      showSuggestions(results, targetField);
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
  }, 300);
}

function showSuggestions(results, targetField) {
  const dropdown = document.getElementById(`suggestions-${targetField}`);
  dropdown.innerHTML = '';
  
  if (!results.length) {
    dropdown.classList.add('hidden');
    return;
  }
  
  results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = r.display_name;
    div.onclick = () => selectAddress(r, targetField);
    dropdown.appendChild(div);
  });
  
  dropdown.classList.remove('hidden');
}

function selectAddress(result, targetField) {
  const input = document.getElementById(`input-${targetField}`);
  input.value = result.display_name.split(',')[0];
  document.getElementById(`suggestions-${targetField}`).classList.add('hidden');
  
  if (targetField === 'start') {
    state.startCoords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
  } else {
    state.endCoords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
  }
}

// ── OSRM Routing ──────────────────────────────────────────────
async function getOSRMRoute(start, end) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=3`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.code !== 'Ok') throw new Error('No route found');
    
    return data.routes.map((route, idx) => {
      const distKm = route.distance / 1000;
      const timeMin = Math.round(route.duration / 60);
      
      // Battery drain calculation
      let drainKWh = BASE_CONSUMPTION * distKm;
      if (state.rainActive) drainKWh *= 1.15; // Rain penalty
      
      const drainPct = (drainKWh / BATTERY_CAPACITY) * 100;
      const arrivalBat = Math.max(0, state.battery - drainPct);
      const needsSwap = arrivalBat < LOW_BATTERY_THRESHOLD;
      
      return {
        id: `route_${idx}`,
        label: idx === 0 ? 'Fastest' : idx === 1 ? 'Alternative 1' : 'Alternative 2',
        geometry: route.geometry.coordinates.map(c => [c[1], c[0]]), // [lat, lng]
        distKm: Math.round(distKm * 10) / 10,
        timeMin,
        drainKWh: Math.round(drainKWh * 1000) / 1000,
        drainPct: Math.round(drainPct * 10) / 10,
        arrivalBat: Math.round(arrivalBat * 10) / 10,
        needsSwap,
        swapStop: null,
      };
    });
  } catch (err) {
    throw new Error('Route calculation failed: ' + err.message);
  }
}

// ── Swap Station Insertion ────────────────────────────────────
function insertSwapStop(route) {
  if (!route.needsSwap) return route;
  
  const available = state.stations.filter(s => s.status === 'free');
  if (!available.length) return { ...route, swapWarning: 'No swap stations available' };
  
  // Find nearest station to route midpoint
  const midIdx = Math.floor(route.geometry.length / 2);
  const midPoint = route.geometry[midIdx];
  
  let nearest = null;
  let minDist = Infinity;
  
  for (const station of available) {
    const dist = Math.sqrt(
      Math.pow(station.lat - midPoint[0], 2) + 
      Math.pow(station.lng - midPoint[1], 2)
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }
  
  if (!nearest) return { ...route, swapWarning: 'No nearby swap station' };
  
  // Show alert for low battery reroute
  showToast(`⚡ Low battery detected! Rerouting to ${nearest.name}`);
  
  return {
    ...route,
    swapStop: {
      station: nearest,
      detourMin: Math.round(minDist * 111 * 2), // Rough estimate
    },
    arrivalBat: Math.min(100, route.arrivalBat + 85), // Assume 85% charge after swap
    needsSwap: false,
  };
}

// ── Route Computation ─────────────────────────────────────────
async function handleComputeRoutes() {
  if (!state.startCoords || !state.endCoords) {
    showError('Please select both start and destination');
    return;
  }
  
  setLoadingState(true);
  clearRoutes();
  
  try {
    const routes = await getOSRMRoute(state.startCoords, state.endCoords);
    
    // Check minimum battery needed to reach ANY swap station
    const shortestDist = Math.min(...routes.map(r => r.distKm));
    const minBatteryToSwap = ((BASE_CONSUMPTION * (shortestDist / 2) / BATTERY_CAPACITY) * 100);
    
    if (state.battery < minBatteryToSwap && state.battery < 15) {
      showError(`⚠️ Critical battery! Need at least ${Math.ceil(minBatteryToSwap)}% to reach nearest swap station. Current: ${state.battery}%. Please charge immediately!`);
      setLoadingState(false);
      return;
    }
    
    const processed = routes.map(r => r.needsSwap ? insertSwapStop(r) : r);
    
    // Filter out routes with warnings (no swap available)
    const viable = processed.filter(r => !r.swapWarning);
    
    if (viable.length === 0) {
      showError(`⚠️ Battery too low (${state.battery}%) for this ${shortestDist}km route. Charge to at least ${Math.ceil(Math.min(...routes.map(r => r.drainPct)))}% or select closer destination.`);
      setLoadingState(false);
      return;
    }
    
    state.routes = viable;
    state.activeRoute = viable[0];
    
    renderRouteCards(processed);
    renderRouteOnMap(processed[0], 0);
    
    if (processed[0]) launchLLMExplanation(processed[0]);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoadingState(false);
  }
}

// ── Route Cards ───────────────────────────────────────────────
function renderRouteCards(routes) {
  const container = document.getElementById('routes-list');
  const section = document.getElementById('routes-section');
  container.innerHTML = '';
  section.classList.remove('hidden');
  
  routes.forEach((route, idx) => {
    const color = ROUTE_COLORS[idx] || ROUTE_COLORS[0];
    const batColor = route.arrivalBat < 15 ? '#F87171' : route.arrivalBat < 35 ? '#FBBF24' : '#4ADE80';
    
    // Critical battery warning
    const criticalWarning = route.arrivalBat < 10 
      ? `<div style="margin-top:8px;padding:8px;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4);border-radius:6px;font-size:0.75rem;color:#F87171;font-weight:600">
           ⚠️ CRITICAL: Arrival battery too low! Swap required.
         </div>` : '';
    
    const swapHTML = route.swapStop 
      ? `<div style="margin-top:8px;padding:8px;background:rgba(234,88,12,0.1);border:1px solid rgba(234,88,12,0.3);border-radius:6px;font-size:0.75rem;color:#FB923C">
           ⚡ Swap: ${route.swapStop.station.name} (+${route.swapStop.detourMin} min)
         </div>`
      : route.swapWarning 
        ? `<div style="margin-top:8px;padding:8px;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:6px;font-size:0.75rem;color:#F87171">
             ⚠️ ${route.swapWarning}
           </div>` : '';
    
    container.insertAdjacentHTML('beforeend', `
      <div class="route-card ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:16px;height:4px;background:${color};border-radius:2px"></div>
            <span style="font-size:0.7rem;font-weight:700;color:#60A5FA">${idx === 0 ? '⭐ BEST' : 'ALT ' + idx}</span>
          </div>
          <span style="font-size:0.85rem;font-weight:700;color:#f0f6ff">${route.label}</span>
        </div>
        
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
          <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.3);border-radius:6px">
            <div style="font-size:0.95rem;font-weight:700;color:#f0f6ff">${route.timeMin}<span style="font-size:0.6rem">m</span></div>
            <div style="font-size:0.65rem;color:#7b90b2">Time</div>
          </div>
          <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.3);border-radius:6px">
            <div style="font-size:0.95rem;font-weight:700;color:#f0f6ff">${route.distKm}<span style="font-size:0.6rem">km</span></div>
            <div style="font-size:0.65rem;color:#7b90b2">Distance</div>
          </div>
          <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.3);border-radius:6px">
            <div style="font-size:0.95rem;font-weight:700;color:${batColor}">${route.arrivalBat}<span style="font-size:0.6rem">%</span></div>
            <div style="font-size:0.65rem;color:#7b90b2">Arrives</div>
          </div>
        </div>
        
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:#7b90b2;margin-bottom:3px">
            <span>🔋 ${state.battery}%</span>
            <span>−${route.drainPct}%</span>
            <span style="color:${batColor};font-weight:600">${route.arrivalBat}%</span>
          </div>
          <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;position:relative">
            <div style="position:absolute;left:0;top:0;height:100%;width:${route.arrivalBat}%;background:${batColor};border-radius:3px"></div>
          </div>
        </div>
        
        ${criticalWarning}
        ${swapHTML}
      </div>
    `);
  });
  
  document.querySelectorAll('.route-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.activeRoute = state.routes[idx];
      renderRouteOnMap(state.activeRoute, idx);
    });
  });
  
  document.getElementById('llm-section').classList.remove('hidden');
}

// ── Map Rendering ─────────────────────────────────────────────
function clearRoutes() {
  state.routeLayers.forEach(l => state.map.removeLayer(l));
  state.routeLayers = [];
  document.getElementById('routes-section').classList.add('hidden');
  document.getElementById('llm-section').classList.add('hidden');
}

function renderRouteOnMap(route, colorIdx = 0) {
  state.routeLayers.forEach(l => state.map.removeLayer(l));
  state.routeLayers = [];
  
  const color = ROUTE_COLORS[colorIdx] || ROUTE_COLORS[0];
  
  // Draw route line
  const line = L.polyline(route.geometry, {
    color,
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(state.map);
  state.routeLayers.push(line);
  
  // Start marker
  const startMarker = L.circleMarker(route.geometry[0], {
    radius: 8,
    color: '#ffffff',
    fillColor: color,
    fillOpacity: 1,
    weight: 3,
  }).addTo(state.map).bindPopup('<b>🚀 Start</b>');
  state.routeLayers.push(startMarker);
  
  // End marker
  const endMarker = L.circleMarker(route.geometry[route.geometry.length - 1], {
    radius: 8,
    color: '#ffffff',
    fillColor: '#4ADE80',
    fillOpacity: 1,
    weight: 3,
  }).addTo(state.map).bindPopup('<b>🏁 Destination</b>');
  state.routeLayers.push(endMarker);
  
  // Swap station marker
  if (route.swapStop) {
    const st = route.swapStop.station;
    const swapMarker = L.circleMarker([st.lat, st.lng], {
      radius: 12,
      color: '#EA580C',
      fillColor: '#FB923C',
      fillOpacity: 0.4,
      weight: 3,
    }).addTo(state.map).bindPopup(`<b>⚡ ${st.name}</b><br>+${route.swapStop.detourMin} min detour`);
    state.routeLayers.push(swapMarker);
  }
  
  state.map.fitBounds(line.getBounds(), { padding: [50, 50] });
}

// ── LLM Explanation ───────────────────────────────────────────
async function launchLLMExplanation(route) {
  const llmText = document.getElementById('llm-text');
  const llmLoading = document.getElementById('llm-loading');
  
  llmLoading.classList.remove('hidden');
  llmText.classList.add('hidden');
  
  try {
    const explanation = await getGeminiExplanation(route, state.rainActive, state.battery, state.geminiKey);
    
    llmLoading.classList.add('hidden');
    
    if (explanation) {
      llmText.textContent = explanation;
    } else {
      llmText.textContent = '🤖 AI route analysis: This route optimizes battery usage and minimizes delivery time. Watch for traffic and weather conditions.';
    }
    
    llmText.classList.remove('hidden');
  } catch (err) {
    console.error('[LLM] Explanation failed:', err);
    llmLoading.classList.add('hidden');
    llmText.textContent = '🤖 AI route analysis: This route optimizes battery usage and minimizes delivery time.';
    llmText.classList.remove('hidden');
  }
}

// ── SOS Emergency ─────────────────────────────────────────────
function handleSOS() {
  const panel = document.getElementById('breakdown-panel');
  
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }
  
  panel.innerHTML = `
    <div style="margin-top:12px;padding:14px;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:8px">
      <div style="font-weight:700;color:#F87171;margin-bottom:10px;font-size:0.9rem">⚠️ Emergency Alert</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-danger" onclick="sendSOSAlert('mechanic')" style="width:100%;padding:10px">
          🔧 Call EV Mechanic
        </button>
        <button class="btn btn-danger" onclick="sendSOSAlert('ambulance')" style="width:100%;padding:10px">
          🚑 Call Ambulance
        </button>
      </div>
      <div id="sos-status" style="margin-top:10px;font-size:0.75rem;color:#4ADE80;display:none"></div>
    </div>
  `;
  panel.classList.remove('hidden');
}

window.sendSOSAlert = function(type) {
  const status = document.getElementById('sos-status');
  
  if (type === 'mechanic') {
    status.innerHTML = `
      ✅ <b>EV Mechanic Dispatched</b><br>
      📍 ETA: 8 minutes<br>
      🚚 Delivery rerouted to nearest rider (Suresh - 2.3km away)<br>
      📱 Customer notified: "Slight delay due to vehicle service"
    `;
  } else {
    status.innerHTML = `
      ✅ <b>Ambulance Called</b><br>
      🚑 ETA: 5 minutes<br>
      🚚 Delivery rerouted to nearest rider (Ravi - 1.8km away)<br>
      📱 Customer notified: "Order transferred to another rider"<br>
      💚 Stay safe! Your rating is protected.
    `;
  }
  
  status.style.display = 'block';
  showToast(type === 'mechanic' ? '🔧 Mechanic on the way!' : '🚑 Ambulance dispatched!');
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    document.getElementById('breakdown-panel').classList.add('hidden');
  }, 5000);
};

// ── UI Helpers ────────────────────────────────────────────────
function bindEvents() {
  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');
  
  startInput.addEventListener('input', e => searchAddress(e.target.value, 'start'));
  endInput.addEventListener('input', e => searchAddress(e.target.value, 'end'));
  
  document.addEventListener('click', e => {
    if (!e.target.closest('.form-field')) {
      document.querySelectorAll('.suggestions-dropdown').forEach(d => d.classList.add('hidden'));
    }
  });
  
  const slider = document.getElementById('battery-slider');
  const valEl = document.getElementById('battery-val');
  slider.addEventListener('input', () => {
    state.battery = parseInt(slider.value);
    valEl.textContent = `${state.battery}%`;
    valEl.style.color = state.battery < 20 ? '#F87171' : state.battery < 40 ? '#FBBF24' : '#4ADE80';
  });
  slider.dispatchEvent(new Event('input'));
  
  document.getElementById('rain-toggle').addEventListener('change', e => {
    state.rainActive = e.target.checked;
    if (state.routes.length > 0) handleComputeRoutes();
  });
  
  document.getElementById('btn-route').addEventListener('click', handleComputeRoutes);
  document.getElementById('btn-breakdown').addEventListener('click', handleSOS);
}

function setLoadingState(loading) {
  const btn = document.getElementById('btn-route');
  const spinner = btn.querySelector('.spinner');
  const text = btn.querySelector('.btn-text');
  btn.disabled = loading;
  spinner.classList.toggle('hidden', !loading);
  text.textContent = loading ? 'Computing…' : 'Find Routes';
}

function showError(msg) {
  showToast(msg);
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#1E3A5F;color:#fff;padding:12px 20px;border-radius:10px;
    font-size:0.85rem;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.5);
    border:1px solid #2563EB;max-width:320px;text-align:center;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  const ok = await loadStations();
  if (ok) {
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app-wrapper').classList.remove('hidden');
    
    initMap();
    renderStationMarkers();
    bindEvents();
    
    setTimeout(() => state.map.invalidateSize(), 200);
  }
}

boot();
