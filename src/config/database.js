const { Pool } = require('pg');

/**
 * Database Abstraction Layer for PostgreSQL
 */

class DatabaseWrapper {
    constructor(config = {}) {
        this.type = 'postgres';
        this.healthCheckInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.isHealthy = true;

        this.pool = new Pool({
            host: config.host || process.env.POSTGRES_HOST || 'localhost',
            port: config.port || process.env.POSTGRES_PORT || 5432,
            database: config.database || process.env.POSTGRES_DB || 'inventory',
            user: config.user || process.env.POSTGRES_USER || 'postgres',
            password: config.password || process.env.POSTGRES_PASSWORD,
            max: config.max || 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            // Enable keep-alive for better connection stability
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            ssl: process.env.POSTGRES_SSL === 'false' ? false : {
                rejectUnauthorized: false
            }
        });

        // Add error handlers to prevent application crashes
        this.pool.on('error', (err, client) => {
            console.error('Unexpected pool error on idle client:', err);
            this.isHealthy = false;
            // Don't exit process - let the pool handle reconnection
        });

        this.pool.on('connect', (client) => {
            console.log('New pool connection established');
            this.reconnectAttempts = 0;
            this.isHealthy = true;
        });

        this.pool.on('remove', (client) => {
            console.log('Pool connection removed');
        });

        console.log('Database: PostgreSQL connection pool initialized');
    }

    /**
     * Retry a database operation with exponential backoff
     * @param {Function} operation - The async operation to retry
     * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
     * @returns {Promise} - Result of the operation
     */
    async _retryOperation(operation, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                // Check if error is connection-related and retryable
                const isRetryable =
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ENOTFOUND' ||
                    error.code === 'ENETUNREACH' ||
                    error.code === '57P01' || // PostgreSQL: connection terminated
                    error.code === '57P03' || // PostgreSQL: cannot connect now
                    error.code === '08006' || // PostgreSQL: connection failure
                    error.code === '08003' || // PostgreSQL: connection does not exist
                    error.message?.includes('Connection terminated') ||
                    error.message?.includes('Connection reset') ||
                    error.message?.includes('server closed the connection');

                if (!isRetryable || attempt === maxRetries) {
                    // Not retryable or max attempts reached
                    console.error(`Database operation failed after ${attempt} attempt(s):`, error.message);
                    throw error;
                }

                // Calculate delay with exponential backoff (1s, 2s, 4s)
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.warn(`Database connection issue (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
                this.reconnectAttempts++;

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    /**
     * Execute a statement (INSERT, UPDATE, DELETE)
     * Returns: { changes, lastInsertRowid }
     */
    async run(sql, params = []) {
        return this._retryOperation(async () => {
            // Convert SQLite placeholder ? to PostgreSQL $1, $2, etc.
            let pgSql = sql;
            let paramIndex = 1;
            pgSql = sql.replaceAll(/\?/g, () => `$${paramIndex++}`);

            const client = await this.pool.connect();
            try {
                const result = await client.query(pgSql, params);

                // For INSERT statements, get the last inserted ID
                if (sql.trim().toUpperCase().startsWith('INSERT')) {
                    const idResult = await client.query('SELECT lastval() as id');
                    return {
                        changes: result.rowCount,
                        lastInsertRowid: idResult.rows[0]?.id
                    };
                }

                return {
                    changes: result.rowCount,
                    lastInsertRowid: null
                };
            } finally {
                client.release();
            }
        });
    }

    /**
     * Get a single row
     */
    async get(sql, params = []) {
        return this._retryOperation(async () => {
            let pgSql = sql;
            let paramIndex = 1;
            pgSql = sql.replaceAll(/\?/g, () => `$${paramIndex++}`);

            const result = await this.pool.query(pgSql, params);
            return result.rows[0];
        });
    }

    /**
     * Get all rows
     */
    async all(sql, params = []) {
        return this._retryOperation(async () => {
            let pgSql = sql;
            let paramIndex = 1;
            pgSql = sql.replaceAll(/\?/g, () => `$${paramIndex++}`);

            const result = await this.pool.query(pgSql, params);
            return result.rows;
        });
    }

    /**
     * Execute raw SQL (for schema creation)
     */
    async exec(sql) {
        return this._retryOperation(async () => {
            await this.pool.query(sql);
        });
    }

    /**
     * Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
     */
    _convertPlaceholders(sql) {
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = sql.replaceAll(/\?/g, () => `$${paramIndex++}`);
        return pgSql;
    }

    /**
     * Create a transaction function
     */
    transaction(fn) {
        return async (...args) => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('SET statement_timeout = 30000'); // 30 second timeout

                // Create transaction context object with client-bound methods
                const txContext = {
                    query: async (sql, params = []) => {
                        const pgSql = this._convertPlaceholders(sql);
                        return await client.query(pgSql, params);
                    },
                    get: async (sql, params = []) => {
                        const pgSql = this._convertPlaceholders(sql);
                        const result = await client.query(pgSql, params);
                        return result.rows[0] || null;
                    },
                    all: async (sql, params = []) => {
                        const pgSql = this._convertPlaceholders(sql);
                        const result = await client.query(pgSql, params);
                        return result.rows;
                    },
                    run: async (sql, params = []) => {
                        const pgSql = this._convertPlaceholders(sql);
                        const result = await client.query(pgSql, params);

                        // For INSERT statements, get the last inserted ID
                        if (sql.trim().toUpperCase().startsWith('INSERT')) {
                            try {
                                const idResult = await client.query('SELECT lastval() as id');
                                return {
                                    changes: result.rowCount,
                                    lastInsertRowid: idResult.rows[0]?.id
                                };
                            } catch (e) {
                                // lastval() fails if no sequence used
                                return { changes: result.rowCount };
                            }
                        }

                        return { changes: result.rowCount };
                    }
                };

                // Pass transaction context as first argument
                const result = await fn(txContext, ...args);
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Transaction rolled back:', error.message);
                throw error;
            } finally {
                client.release();
            }
        };
    }

    /**
     * Close database connection
     */
    async close() {
        this.stopHealthCheck();
        await this.pool.end();
        console.log('Database: PostgreSQL connection pool closed');
    }

    /**
     * Check if connected
     */
    async ping() {
        try {
            await this.pool.query('SELECT 1');
            this.isHealthy = true;
            return true;
        } catch (error) {
            console.error('Database ping failed:', error);
            this.isHealthy = false;
            return false;
        }
    }

    /**
     * Start periodic health check monitoring
     * @param {number} intervalMs - Health check interval in milliseconds (default: 30000 = 30 seconds)
     */
    startHealthCheck(intervalMs = 30000) {
        // Don't start if already running
        if (this.healthCheckInterval) {
            console.log('Health check already running');
            return;
        }

        console.log(`Starting database health check (interval: ${intervalMs}ms)`);

        this.healthCheckInterval = setInterval(async () => {
            const isHealthy = await this.ping();

            if (!isHealthy) {
                console.error(`[${new Date().toISOString()}] Database health check FAILED - connection unhealthy`);

                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Manual intervention may be required.`);
                }
            } else {
                // Only log success if we were previously unhealthy
                if (!this.isHealthy || this.reconnectAttempts > 0) {
                    console.log(`[${new Date().toISOString()}] Database health check PASSED - connection restored`);
                    this.reconnectAttempts = 0;
                }
            }
        }, intervalMs);

        // Prevent the interval from keeping the process alive
        if (this.healthCheckInterval.unref) {
            this.healthCheckInterval.unref();
        }
    }

    /**
     * Stop the health check monitoring
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            console.log('Database health check stopped');
        }
    }

    /**
     * Get current connection health status
     * @returns {Object} Health status information
     */
    getHealthStatus() {
        return {
            isHealthy: this.isHealthy,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            poolStats: {
                total: this.pool.totalCount,
                idle: this.pool.idleCount,
                waiting: this.pool.waitingCount
            }
        };
    }
}

module.exports = DatabaseWrapper;
