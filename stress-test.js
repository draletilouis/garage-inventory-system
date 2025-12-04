/**
 * Stress Test Script for Inventory Management System
 * Tests API endpoints with concurrent requests to verify rate limiting and performance
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Test configuration
const config = {
    username: 'admin',
    password: 'admin123',
    concurrentUsers: 4,
    requestsPerUser: 50,
    delayBetweenRequests: 100 // milliseconds
};

let sessionCookie = null;
let testResults = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitErrors: 0,
    errors: [],
    startTime: null,
    endTime: null,
    requestTimes: []
};

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Login and get session
async function login() {
    try {
        log('\n=== Logging in ===', 'blue');
        const response = await axios.post(`${API_BASE}/login`, {
            username: config.username,
            password: config.password
        });

        // Extract session cookie
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies[0].split(';')[0];
            log('✓ Login successful', 'green');
            return true;
        }
        return false;
    } catch (error) {
        log(`✗ Login failed: ${error.message}`, 'red');
        return false;
    }
}

// Make API request with timing
async function makeRequest(endpoint, method = 'GET', data = null) {
    const startTime = Date.now();
    testResults.totalRequests++;

    try {
        const options = {
            method,
            url: `${API_BASE}${endpoint}`,
            headers: {
                'Cookie': sessionCookie
            }
        };

        if (data) {
            options.data = data;
        }

        const response = await axios(options);
        const endTime = Date.now();
        const duration = endTime - startTime;

        testResults.successfulRequests++;
        testResults.requestTimes.push(duration);

        return { success: true, status: response.status, duration };
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        testResults.failedRequests++;

        if (error.response?.status === 429) {
            testResults.rateLimitErrors++;
            return { success: false, status: 429, duration, rateLimited: true };
        }

        testResults.errors.push({
            endpoint,
            error: error.message,
            status: error.response?.status
        });

        return { success: false, status: error.response?.status, duration, error: error.message };
    }
}

// Simulate user activity
async function simulateUser(userId, numRequests) {
    log(`\nUser ${userId}: Starting ${numRequests} requests...`, 'cyan');

    const endpoints = [
        '/inventory',
        '/sales?userId=1&userRole=admin',
        '/returns',
        '/customers',
        '/suppliers',
        '/dashboard/profits?startDate=2025-11-25&endDate=2025-11-25'
    ];

    let userSuccess = 0;
    let userFailed = 0;
    let userRateLimited = 0;

    for (let i = 0; i < numRequests; i++) {
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        const result = await makeRequest(endpoint);

        if (result.success) {
            userSuccess++;
        } else if (result.rateLimited) {
            userRateLimited++;
            log(`User ${userId}: Rate limited on request ${i + 1}`, 'yellow');
        } else {
            userFailed++;
        }

        // Small delay between requests
        if (config.delayBetweenRequests > 0) {
            await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
        }
    }

    log(`User ${userId}: Completed - ${userSuccess} success, ${userFailed} failed, ${userRateLimited} rate-limited`,
        userRateLimited > 0 ? 'yellow' : 'green');
}

// Test write operations
async function testWriteOperations() {
    log('\n=== Testing Write Operations ===', 'blue');

    const writeTests = [
        { name: 'Create Inventory Item', method: 'POST', endpoint: '/inventory', data: {
            sku: `TEST-${Date.now()}`,
            name: 'Stress Test Item',
            category: 'Test',
            quantity: 100,
            costPrice: 1000,
            price: 1500,
            reorderLevel: 10,
            supplier: 'Test Supplier',
            lastRestock: new Date().toISOString().split('T')[0]
        }},
        { name: 'Update Inventory Item', method: 'PUT', endpoint: '/inventory/2', data: {
            sku: 'LAP001',
            name: 'Updated Item',
            category: 'Test',
            quantity: 50,
            costPrice: 1000,
            price: 1500,
            reorderLevel: 10,
            supplier: 'Test Supplier',
            lastRestock: new Date().toISOString().split('T')[0]
        }}
    ];

    for (const test of writeTests) {
        const result = await makeRequest(test.endpoint, test.method, test.data);
        if (result.success) {
            log(`✓ ${test.name}: ${result.duration}ms`, 'green');
        } else {
            log(`✗ ${test.name}: ${result.error || 'Failed'}`, 'red');
        }
    }
}

// Calculate statistics
function calculateStats() {
    const totalDuration = testResults.endTime - testResults.startTime;
    const avgRequestTime = testResults.requestTimes.length > 0
        ? testResults.requestTimes.reduce((a, b) => a + b, 0) / testResults.requestTimes.length
        : 0;
    const minRequestTime = Math.min(...testResults.requestTimes);
    const maxRequestTime = Math.max(...testResults.requestTimes);
    const requestsPerSecond = (testResults.totalRequests / (totalDuration / 1000)).toFixed(2);

    return {
        totalDuration: (totalDuration / 1000).toFixed(2),
        avgRequestTime: avgRequestTime.toFixed(2),
        minRequestTime,
        maxRequestTime,
        requestsPerSecond
    };
}

// Print results
function printResults() {
    const stats = calculateStats();

    log('\n' + '='.repeat(60), 'cyan');
    log('STRESS TEST RESULTS', 'cyan');
    log('='.repeat(60), 'cyan');

    log('\n📊 Request Statistics:', 'blue');
    log(`   Total Requests:      ${testResults.totalRequests}`);
    log(`   Successful:          ${testResults.successfulRequests}`, 'green');
    log(`   Failed:              ${testResults.failedRequests}`, testResults.failedRequests > 0 ? 'red' : 'reset');
    log(`   Rate Limited (429):  ${testResults.rateLimitErrors}`, testResults.rateLimitErrors > 0 ? 'yellow' : 'green');
    log(`   Success Rate:        ${((testResults.successfulRequests / testResults.totalRequests) * 100).toFixed(2)}%`);

    log('\n⚡ Performance Metrics:', 'blue');
    log(`   Total Duration:      ${stats.totalDuration}s`);
    log(`   Requests/Second:     ${stats.requestsPerSecond}`);
    log(`   Avg Response Time:   ${stats.avgRequestTime}ms`);
    log(`   Min Response Time:   ${stats.minRequestTime}ms`);
    log(`   Max Response Time:   ${stats.maxRequestTime}ms`);

    if (testResults.rateLimitErrors > 0) {
        log('\n⚠️  Rate Limiting Status:', 'yellow');
        log(`   ${testResults.rateLimitErrors} requests were rate-limited (429 errors)`);
        log(`   This is expected if total requests exceed the configured limit`);
        log(`   Current limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 10000} requests per 15 minutes`);
    } else {
        log('\n✅ Rate Limiting Status:', 'green');
        log(`   No rate limit errors detected`);
        log(`   All ${testResults.totalRequests} requests were processed successfully`);
    }

    if (testResults.errors.length > 0 && testResults.errors.length <= 5) {
        log('\n❌ Errors:', 'red');
        testResults.errors.forEach((err, i) => {
            log(`   ${i + 1}. ${err.endpoint}: ${err.error} (Status: ${err.status})`);
        });
    } else if (testResults.errors.length > 5) {
        log(`\n❌ Errors: ${testResults.errors.length} errors occurred`, 'red');
    }

    log('\n' + '='.repeat(60), 'cyan');
}

// Main test function
async function runStressTest() {
    log('╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║     INVENTORY SYSTEM STRESS TEST                     ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝', 'cyan');

    log('\n📋 Test Configuration:', 'blue');
    log(`   Concurrent Users:    ${config.concurrentUsers}`);
    log(`   Requests per User:   ${config.requestsPerUser}`);
    log(`   Total Requests:      ${config.concurrentUsers * config.requestsPerUser}`);
    log(`   Delay per Request:   ${config.delayBetweenRequests}ms`);
    log(`   Rate Limit:          ${process.env.RATE_LIMIT_MAX_REQUESTS || 10000} requests / 15 min`);

    // Step 1: Login
    const loginSuccess = await login();
    if (!loginSuccess) {
        log('\n❌ Cannot proceed without login', 'red');
        process.exit(1);
    }

    // Step 2: Test write operations
    await testWriteOperations();

    // Step 3: Run concurrent user simulations
    log('\n=== Running Concurrent User Simulation ===', 'blue');
    testResults.startTime = Date.now();

    const userPromises = [];
    for (let i = 1; i <= config.concurrentUsers; i++) {
        userPromises.push(simulateUser(i, config.requestsPerUser));
    }

    await Promise.all(userPromises);

    testResults.endTime = Date.now();

    // Step 4: Print results
    printResults();
}

// Run the test
runStressTest().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
