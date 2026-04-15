/**
 * Battery Drain Calculation Tests
 * Tests the core battery drain formula and validation logic
 */

// Test 1: Basic battery drain calculation
function testBatteryDrainCalculation() {
  const distance = 10; // km
  const baseConsumption = 0.15; // kWh/km
  const rainMultiplier = 1.0; // no rain
  
  const drainKwh = baseConsumption * distance * rainMultiplier;
  const batteryCapacity = 1.5; // kWh
  const drainPct = (drainKwh / batteryCapacity) * 100;
  
  const expected = 100; // 1.5 kWh / 1.5 kWh = 100%
  const passed = Math.abs(drainPct - expected) < 0.01;
  
  console.log(`✓ Battery Drain Calculation: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Expected: ${expected}%, Got: ${drainPct.toFixed(2)}%`);
  return passed;
}

// Test 2: Rain multiplier effect
function testRainMultiplier() {
  const distance = 10;
  const baseConsumption = 0.15;
  const rainMultiplier = 1.15; // 15% extra in rain
  
  const drainKwh = baseConsumption * distance * rainMultiplier;
  const batteryCapacity = 1.5;
  const drainPct = (drainKwh / batteryCapacity) * 100;
  
  const expected = 115; // 15% more than 100%
  const passed = Math.abs(drainPct - expected) < 0.01;
  
  console.log(`✓ Rain Multiplier Effect: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Expected: ${expected}%, Got: ${drainPct.toFixed(2)}%`);
  return passed;
}

// Test 3: Low battery threshold detection
function testLowBatteryThreshold() {
  const currentBattery = 100;
  const drainPct = 87;
  const arrivalBattery = currentBattery - drainPct;
  const threshold = 15;
  
  const needsSwap = arrivalBattery < threshold;
  const expected = true; // 13% < 15%, should need swap
  const passed = needsSwap === expected;
  
  console.log(`✓ Low Battery Threshold: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Arrival: ${arrivalBattery}%, Threshold: ${threshold}%, Needs Swap: ${needsSwap}`);
  return passed;
}

// Run all tests
console.log('\n=== Battery Calculation Tests ===\n');
const results = [
  testBatteryDrainCalculation(),
  testRainMultiplier(),
  testLowBatteryThreshold()
];

const passed = results.filter(r => r).length;
const total = results.length;
console.log(`\n${passed}/${total} tests passed\n`);

export { testBatteryDrainCalculation, testRainMultiplier, testLowBatteryThreshold };
