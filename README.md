# Rydr - EV Route Optimizer for Delivery Riders

**PromptWars 2026 - DSU × Hack2Skill**

## Problem Statement
Electric two-wheeler delivery riders in Bangalore face range anxiety and unplanned battery swap detours, losing time and earnings.

## Solution
Rydr provides real-time, battery-aware route optimization using:
- **Real map routing** (OSRM API)
- **Real address search** (Nominatim geocoding)
- **Battery drain calculation** with rain conditions
- **Auto-reroute to nearest swap station** when battery is low
- **Emergency SOS** for EV mechanic or ambulance dispatch
- **AI-powered route insights** (Google Gemini / Claude)

## Features
✅ Real Bangalore addresses (no simulation)  
✅ 3 route alternatives with battery optimization  
✅ Rain toggle (15% extra drain)  
✅ 30+ swap stations across Bangalore for long-distance coverage  
✅ Swap station proximity detection  
✅ Emergency SOS with delivery reroute  
✅ Dark theme UI  
✅ Mobile responsive  
✅ Accessibility compliant (ARIA labels)  

## Tech Stack
- **Frontend**: Vanilla JS (ES6 modules)
- **Maps**: Leaflet.js + OpenStreetMap
- **Routing**: OSRM (free, no API key)
- **Geocoding**: Nominatim (free, no API key)
- **AI**: Google Gemini API (primary) / Claude (fallback)
- **Deployment**: Google Cloud App Engine

## Google Services Usage
- **Google Gemini AI** for natural language route explanations
- **Google Cloud App Engine** for hosting
- **Google Maps-compatible** geocoding and routing

## Local Development
```bash
cd rydr
npx serve .
# Open http://localhost:3000
```

## Deployment
```bash
gcloud app deploy app.yaml
```

## Security
- HTTPS enforced
- API keys stored client-side (user-provided)
- No backend data storage
- CSP headers via nginx.conf

## Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader compatible
- High contrast dark theme

## Code Quality
- Modular ES6 architecture
- Error handling on all async operations
- Graceful degradation (works without AI keys)
- Clean separation of concerns

---
Built for PromptWars 2026 by Team Rydr
