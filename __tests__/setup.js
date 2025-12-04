// Test setup and utilities
require('dotenv').config();

// Ensure we're in test mode
process.env.NODE_ENV = 'test';

// Use test database configuration
if (!process.env.POSTGRES_DB_TEST) {
    // If no test database specified, append _test to the regular database
    process.env.POSTGRES_DB_TEST = (process.env.POSTGRES_DB || 'inventory') + '_test';
}

// Override database with test database
process.env.POSTGRES_DB = process.env.POSTGRES_DB_TEST;

// Disable session secret warning in tests
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-only-for-testing';

// Mock console.warn and console.log during tests to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: console.error, // Keep error for debugging
};

module.exports = {
    testDbConfig: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB_TEST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    }
};
