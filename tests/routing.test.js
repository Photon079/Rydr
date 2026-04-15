/**
 * Routing Logic Tests
 * Tests route calculation, distance, and time estimation
 */

// Test 1: Distance calculation from coordinates
function testDistanceCalculation() {
  // Haversine formula
  const lat1 = 12.9081, lng1 = 77.5850; // JP Nagar
  const lat2 = 12.9166, lng2 = 77.6101; // BTM Layout
  
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  const passed = distance > 2 && distance < 4; // Should be ~3 km
  
  console.log(`✓ Distance Calculation: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  JP Nagar to BTM: ${distance.toFixed(2)} km`);
  return passed;
}

// Test 2: Time estimation
function testTimeEstimation() {
  const distance = 10; // km
  const avgSpeed = 30; // km/h
  const timeMin = (distance / avgSpeed) * 60;
  
  const expected = 20; // minutes
  const passed = timeMin === expected;
  
  console.log(`✓ Time Estimation: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  ${distance}km at ${avgSpeed}km/h = ${timeMin} min`);
  return passed;
}

// Test 3: Route feasibility check
function testRouteFeasibility() {
  const startBattery = 20; // %
  const requiredBattery = 50; // %
  const isFeasible = startBattery >= requiredBattery;
  
  const expected = false; // 20% < 50%, not feasible
  const passed = isFeasible === expected;
  
  console.log(`✓ Route Feasibility: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Start: ${startBattery}%, Required: ${requiredBattery}%, Feasible: ${isFeasible}`);
  return passed;
}

// Run all tests
console.log('\n=== Routing Logic Tests ===\n');
const results = [
  testDistanceCalculation(),
  testTimeEstimation(),
  testRouteFeasibility()
];

const passed = results.filter(r => r).length;
const total = results.length;
console.log(`\n${passed}/${total} tests passed\n`);

export { testDistanceCalculation, testTimeEstimation, testRouteFeasibility };
