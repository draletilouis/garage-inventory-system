require('dotenv').config();
const DatabaseWrapper = require('./database');

/**
 * Verify database setup
 */
async function verifyDatabase() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Verifying database setup...\n');

        // Check connection
        const connected = await db.ping();
        if (!connected) {
            throw new Error('Failed to connect to PostgreSQL');
        }
        console.log('✓ Connection successful');

        // List all tables
        const tables = await db.all(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log(`\n✓ Found ${tables.length} tables:`);
        tables.forEach(t => console.log(`  - ${t.table_name}`));

        // Count records in each table
        console.log('\n✓ Table record counts:');
        for (const table of tables) {
            const result = await db.get(`SELECT COUNT(*) as count FROM ${table.table_name}`);
            console.log(`  - ${table.table_name}: ${result.count} records`);
        }

        // Show default users
        const users = await db.all('SELECT id, username, role, name FROM users');
        console.log('\n✓ Default users:');
        users.forEach(u => console.log(`  - ${u.username} (${u.role}) - ${u.name}`));

        console.log('\n✓ Database verification complete!');
        await db.close();

    } catch (error) {
        console.error('Error verifying database:', error);
        await db.close();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    verifyDatabase();
}

module.exports = verifyDatabase;
