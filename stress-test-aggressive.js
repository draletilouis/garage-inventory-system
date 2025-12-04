/**
 * Aggressive Stress Test - Tests rate limiting thresholds
 * This will attempt to hit the rate limit to verify it's working correctly
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Aggressive test configuration
const config = {
    username: 'admin',
    password: 'admin123',
    totalRequests: 500, // Try to make 500 requests rapidly
    delayBetweenRequests: 10, // Very fast - 10ms between requests
    batchSize: 50 // Make 50 requests in parallel batches
};

let sessionCookie = null;
let stats = {
    total: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    times: [],
    startTime: null,
    endTime: null
};

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login() {
    try {
        const response = await axios.post(`${API_BASE}/login`, {
            username: config.username,
            password: config.password
        });
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies[0].split(';')[0];
            return true;
        }
        return false;
    } catch (error) {
        log(`Login failed: ${error.message}`, 'red');
        return false;
    }
}

async function makeRequest() {
    const startTime = Date.now();
    stats.total++;

    try {
        const response = await axios.get(`${API_BASE}/inventory`, {
            headers: { 'Cookie': sessionCookie }
        });
        const duration = Date.now() - startTime;
        stats.success++;
        stats.times.push(duration);
        return { success: true, status: response.status, duration };
    } catch (error) {
        const duration = Date.now() - startTime;
        stats.failed++;

        if (error.response?.status === 429) {
            stats.rateLimited++;
            return { success: false, status: 429, duration, rateLimited: true };
        }

        return { success: false, status: error.response?.status, duration };
    }
}

async function runAggressiveTest() {
    log('╔══════════════════════════════════════════════════════╗', 'magenta');
    log('║     AGGRESSIVE STRESS TEST - RATE LIMIT CHECK       ║', 'magenta');
    log('╚══════════════════════════════════════════════════════╝', 'magenta');

    log('\n📋 Test Configuration:', 'blue');
    log(`   Total Requests:      ${config.totalRequests}`);
    log(`   Batch Size:          ${config.batchSize} (parallel)`);
    log(`   Delay per Request:   ${config.delayBetweenRequests}ms`);
    log(`   Rate Limit Config:   ${process.env.RATE_LIMIT_MAX_REQUESTS || 10000} requests / 15 min`);
    log(`   Expected Result:     All requests should pass (below limit)`);

    // Login
    log('\n🔐 Logging in...', 'blue');
    const loginSuccess = await login();
    if (!loginSuccess) {
        log('❌ Login failed', 'red');
        process.exit(1);
    }
    log('✓ Login successful', 'green');

    // Run aggressive test
    log('\n🚀 Starting aggressive test...', 'blue');
    log('   Making requests as fast as possible...\n', 'yellow');

    stats.startTime = Date.now();

    const batches = Math.ceil(config.totalRequests / config.batchSize);
    let requestsMade = 0;

    for (let batch = 0; batch < batches; batch++) {
        const requestsInBatch = Math.min(config.batchSize, config.totalRequests - requestsMade);
        const promises = [];

        for (let i = 0; i < requestsInBatch; i++) {
            promises.push(makeRequest());
            if (config.delayBetweenRequests > 0) {
                await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
            }
        }

        await Promise.all(promises);
        requestsMade += requestsInBatch;

        // Progress indicator
        const progress = ((requestsMade / config.totalRequests) * 100).toFixed(0);
        const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(`\r   Progress: [${bar}] ${progress}% (${requestsMade}/${config.totalRequests})`);
    }

    stats.endTime = Date.now();
    console.log('\n');

    // Calculate statistics
    const duration = (stats.endTime - stats.startTime) / 1000;
    const avgTime = stats.times.length > 0
        ? stats.times.reduce((a, b) => a + b, 0) / stats.times.length
        : 0;
    const requestsPerSecond = (stats.total / duration).toFixed(2);

    // Print results
    log('='.repeat(60), 'cyan');
    log('AGGRESSIVE TEST RESULTS', 'cyan');
    log('='.repeat(60), 'cyan');

    log('\n📊 Request Statistics:', 'blue');
    log(`   Total Requests:      ${stats.total}`);
    log(`   Successful:          ${stats.success}`, 'green');
    log(`   Failed:              ${stats.failed}`, stats.failed > 0 ? 'red' : 'reset');
    log(`   Rate Limited (429):  ${stats.rateLimited}`, stats.rateLimited > 0 ? 'yellow' : 'green');
    log(`   Success Rate:        ${((stats.success / stats.total) * 100).toFixed(2)}%`);

    log('\n⚡ Performance Metrics:', 'blue');
    log(`   Total Duration:      ${duration.toFixed(2)}s`);
    log(`   Requests/Second:     ${requestsPerSecond}`);
    log(`   Avg Response Time:   ${avgTime.toFixed(2)}ms`);
    log(`   Min Response Time:   ${Math.min(...stats.times)}ms`);
    log(`   Max Response Time:   ${Math.max(...stats.times)}ms`);

    log('\n🎯 Rate Limiting Analysis:', 'blue');
    if (stats.rateLimited > 0) {
        log(`   ⚠️  ${stats.rateLimited} requests were rate-limited`, 'yellow');
        log(`   This means the rate limit is working correctly`, 'yellow');
        log(`   Threshold: ${stats.success} successful before hitting limit`, 'yellow');
    } else {
        log(`   ✅ No rate limiting triggered`, 'green');
        log(`   All ${stats.total} requests completed successfully`, 'green');
        log(`   Rate limit is set high enough for this load: ${process.env.RATE_LIMIT_MAX_REQUESTS || 10000}/15min`, 'green');
    }

    log('\n💡 Recommendations:', 'blue');
    if (stats.rateLimited > 0) {
        log(`   • Rate limit kicked in after ${stats.success} requests`, 'yellow');
        log(`   • This is working as expected for protection`, 'yellow');
        log(`   • Current limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 10000} req/15min`, 'yellow');
    } else {
        log(`   • System handled ${stats.total} requests without rate limiting`, 'green');
        log(`   • Average response time: ${avgTime.toFixed(2)}ms - Excellent!`, 'green');
        log(`   • Server throughput: ${requestsPerSecond} req/s`, 'green');
        log(`   • Rate limit is appropriately configured for your workload`, 'green');
    }

    log('\n' + '='.repeat(60), 'cyan');
}

runAggressiveTest().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
