const DatabaseWrapper = require('../database');
require('./setup');

let db;

beforeAll(async () => {
    db = new DatabaseWrapper({ type: 'postgres' });
});

afterAll(async () => {
    if (db) {
        await db.close();
    }
});

describe('DatabaseWrapper', () => {
    describe('Connection', () => {
        test('should establish connection to database', async () => {
            const isConnected = await db.ping();
            expect(isConnected).toBe(true);
        });

        test('should handle connection errors gracefully', async () => {
            const badDb = new DatabaseWrapper({
                type: 'postgres',
                host: 'invalid-host',
                database: 'invalid-db',
                user: 'invalid-user',
                password: 'invalid-pass'
            });

            const isConnected = await badDb.ping();
            expect(isConnected).toBe(false);

            await badDb.close();
        });
    });

    describe('Table Operations', () => {
        beforeAll(async () => {
            // Create test table
            await db.exec(`DROP TABLE IF EXISTS test_table CASCADE`);
            await db.exec(`
                CREATE TABLE test_table (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    value INTEGER NOT NULL,
                    active BOOLEAN DEFAULT true
                )
            `);
        });

        afterAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_table CASCADE`);
        });

        test('should execute CREATE TABLE', async () => {
            await db.exec(`DROP TABLE IF EXISTS temp_test CASCADE`);
            await db.exec(`
                CREATE TABLE temp_test (
                    id SERIAL PRIMARY KEY,
                    data TEXT
                )
            `);

            const result = await db.get(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'temp_test'
                ) as exists
            `);

            expect(result.exists).toBe(true);

            await db.exec(`DROP TABLE temp_test`);
        });

        test('should handle CREATE TABLE IF NOT EXISTS', async () => {
            await db.exec(`DROP TABLE IF EXISTS idempotent_table CASCADE`);

            // First creation
            await db.exec(`
                CREATE TABLE IF NOT EXISTS idempotent_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT
                )
            `);

            // Second creation should not fail
            await expect(db.exec(`
                CREATE TABLE IF NOT EXISTS idempotent_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT
                )
            `)).resolves.not.toThrow();

            await db.exec(`DROP TABLE idempotent_table`);
        });
    });

    describe('INSERT Operations', () => {
        beforeEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_insert CASCADE`);
            await db.exec(`
                CREATE TABLE test_insert (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    value INTEGER NOT NULL
                )
            `);
        });

        afterEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_insert CASCADE`);
        });

        test('should insert row and return lastInsertRowid', async () => {
            const result = await db.run(
                'INSERT INTO test_insert (name, value) VALUES (?, ?)',
                ['Test', 123]
            );

            expect(result).toHaveProperty('lastInsertRowid');
            expect(result.lastInsertRowid).toBeGreaterThan(0);
            expect(result.changes).toBe(1);
        });

        test('should insert multiple rows', async () => {
            await db.run('INSERT INTO test_insert (name, value) VALUES (?, ?)', ['First', 1]);
            await db.run('INSERT INTO test_insert (name, value) VALUES (?, ?)', ['Second', 2]);
            await db.run('INSERT INTO test_insert (name, value) VALUES (?, ?)', ['Third', 3]);

            const rows = await db.all('SELECT * FROM test_insert ORDER BY id');

            expect(rows).toHaveLength(3);
            expect(rows[0].name).toBe('First');
            expect(rows[1].name).toBe('Second');
            expect(rows[2].name).toBe('Third');
        });

        test('should handle parameterized inserts', async () => {
            const params = ['Parameterized', 456];
            await db.run('INSERT INTO test_insert (name, value) VALUES (?, ?)', params);

            const row = await db.get('SELECT * FROM test_insert WHERE name = ?', ['Parameterized']);

            expect(row).toBeDefined();
            expect(row.value).toBe(456);
        });
    });

    describe('SELECT Operations', () => {
        beforeAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_select CASCADE`);
            await db.exec(`
                CREATE TABLE test_select (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    value INTEGER NOT NULL
                )
            `);

            // Insert test data
            await db.run('INSERT INTO test_select (name, category, value) VALUES (?, ?, ?)', ['Item1', 'A', 100]);
            await db.run('INSERT INTO test_select (name, category, value) VALUES (?, ?, ?)', ['Item2', 'B', 200]);
            await db.run('INSERT INTO test_select (name, category, value) VALUES (?, ?, ?)', ['Item3', 'A', 300]);
            await db.run('INSERT INTO test_select (name, category, value) VALUES (?, ?, ?)', ['Item4', 'C', 400]);
        });

        afterAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_select CASCADE`);
        });

        test('should get single row with get()', async () => {
            const row = await db.get('SELECT * FROM test_select WHERE name = ?', ['Item1']);

            expect(row).toBeDefined();
            expect(row.name).toBe('Item1');
            expect(row.value).toBe(100);
        });

        test('should return undefined for non-existent row', async () => {
            const row = await db.get('SELECT * FROM test_select WHERE name = ?', ['NonExistent']);

            expect(row).toBeUndefined();
        });

        test('should get all rows with all()', async () => {
            const rows = await db.all('SELECT * FROM test_select ORDER BY id');

            expect(rows).toHaveLength(4);
            expect(rows[0].name).toBe('Item1');
            expect(rows[3].name).toBe('Item4');
        });

        test('should filter with WHERE clause', async () => {
            const rows = await db.all('SELECT * FROM test_select WHERE category = ?', ['A']);

            expect(rows).toHaveLength(2);
            expect(rows.every(r => r.category === 'A')).toBe(true);
        });

        test('should support aggregate functions', async () => {
            const result = await db.get('SELECT COUNT(*) as count, SUM(value) as total FROM test_select');

            expect(result.count).toBe(4);
            expect(parseFloat(result.total)).toBe(1000);
        });

        test('should support ORDER BY and LIMIT', async () => {
            const rows = await db.all('SELECT * FROM test_select ORDER BY value DESC LIMIT 2');

            expect(rows).toHaveLength(2);
            expect(rows[0].value).toBe(400);
            expect(rows[1].value).toBe(300);
        });
    });

    describe('UPDATE Operations', () => {
        beforeEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_update CASCADE`);
            await db.exec(`
                CREATE TABLE test_update (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    value INTEGER NOT NULL
                )
            `);

            await db.run('INSERT INTO test_update (name, value) VALUES (?, ?)', ['Original', 100]);
        });

        afterEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_update CASCADE`);
        });

        test('should update row', async () => {
            const result = await db.run('UPDATE test_update SET value = ? WHERE name = ?', [200, 'Original']);

            expect(result.changes).toBe(1);

            const updated = await db.get('SELECT * FROM test_update WHERE name = ?', ['Original']);
            expect(updated.value).toBe(200);
        });

        test('should update multiple columns', async () => {
            await db.run('UPDATE test_update SET name = ?, value = ? WHERE id = ?', ['Updated', 300, 1]);

            const updated = await db.get('SELECT * FROM test_update WHERE id = ?', [1]);
            expect(updated.name).toBe('Updated');
            expect(updated.value).toBe(300);
        });

        test('should return 0 changes for non-existent row', async () => {
            const result = await db.run('UPDATE test_update SET value = ? WHERE id = ?', [999, 99999]);

            expect(result.changes).toBe(0);
        });
    });

    describe('DELETE Operations', () => {
        beforeEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_delete CASCADE`);
            await db.exec(`
                CREATE TABLE test_delete (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL
                )
            `);

            await db.run('INSERT INTO test_delete (name) VALUES (?)', ['ToDelete']);
        });

        afterEach(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_delete CASCADE`);
        });

        test('should delete row', async () => {
            const result = await db.run('DELETE FROM test_delete WHERE name = ?', ['ToDelete']);

            expect(result.changes).toBe(1);

            const check = await db.get('SELECT * FROM test_delete WHERE name = ?', ['ToDelete']);
            expect(check).toBeUndefined();
        });

        test('should return 0 changes when deleting non-existent row', async () => {
            const result = await db.run('DELETE FROM test_delete WHERE id = ?', [99999]);

            expect(result.changes).toBe(0);
        });
    });

    describe('Transaction Operations', () => {
        beforeAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_transaction CASCADE`);
            await db.exec(`
                CREATE TABLE test_transaction (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    value INTEGER NOT NULL
                )
            `);
        });

        afterAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_transaction CASCADE`);
        });

        beforeEach(async () => {
            await db.run('DELETE FROM test_transaction');
        });

        test('should commit successful transaction', async () => {
            await db.transaction(async () => {
                await db.run('INSERT INTO test_transaction (name, value) VALUES (?, ?)', ['Trans1', 100]);
                await db.run('INSERT INTO test_transaction (name, value) VALUES (?, ?)', ['Trans2', 200]);
            });

            const rows = await db.all('SELECT * FROM test_transaction');
            expect(rows).toHaveLength(2);
        });

        test('should rollback failed transaction', async () => {
            try {
                await db.transaction(async () => {
                    await db.run('INSERT INTO test_transaction (name, value) VALUES (?, ?)', ['Trans1', 100]);
                    throw new Error('Intentional error');
                });
            } catch (error) {
                // Expected error
            }

            const rows = await db.all('SELECT * FROM test_transaction');
            expect(rows).toHaveLength(0);
        });

        test('should handle nested operations in transaction', async () => {
            await db.transaction(async () => {
                await db.run('INSERT INTO test_transaction (name, value) VALUES (?, ?)', ['Item1', 1]);

                const item = await db.get('SELECT * FROM test_transaction WHERE name = ?', ['Item1']);
                expect(item).toBeDefined();

                await db.run('UPDATE test_transaction SET value = ? WHERE name = ?', [2, 'Item1']);
            });

            const final = await db.get('SELECT * FROM test_transaction WHERE name = ?', ['Item1']);
            expect(final.value).toBe(2);
        });
    });

    describe('Parameter Substitution', () => {
        beforeAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_params CASCADE`);
            await db.exec(`
                CREATE TABLE test_params (
                    id SERIAL PRIMARY KEY,
                    col1 TEXT,
                    col2 TEXT,
                    col3 INTEGER
                )
            `);
        });

        afterAll(async () => {
            await db.exec(`DROP TABLE IF EXISTS test_params CASCADE`);
        });

        test('should convert ? placeholders to $1, $2, etc.', async () => {
            await db.run('INSERT INTO test_params (col1, col2, col3) VALUES (?, ?, ?)', ['a', 'b', 3]);

            const row = await db.get('SELECT * FROM test_params WHERE col1 = ? AND col2 = ?', ['a', 'b']);

            expect(row).toBeDefined();
            expect(row.col3).toBe(3);
        });

        test('should handle multiple parameters in complex query', async () => {
            await db.run('INSERT INTO test_params (col1, col2, col3) VALUES (?, ?, ?)', ['x', 'y', 10]);
            await db.run('INSERT INTO test_params (col1, col2, col3) VALUES (?, ?, ?)', ['x', 'z', 20]);

            const rows = await db.all('SELECT * FROM test_params WHERE col1 = ? AND col3 > ? ORDER BY col3', ['x', 5]);

            expect(rows).toHaveLength(2);
            expect(rows[0].col3).toBe(10);
            expect(rows[1].col3).toBe(20);
        });
    });
});
