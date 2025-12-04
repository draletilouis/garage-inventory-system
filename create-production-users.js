/**
 * Create Production Users
 * Creates admin and regular user accounts for production deployment
 */

require('dotenv').config();
const DatabaseWrapper = require('./database');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

/**
 * Production user credentials
 * IMPORTANT: Change these credentials after first login!
 */
const PRODUCTION_USERS = [
    {
        username: 'hradmin',
        password: 'HRSpares2025!Admin',
        role: 'admin',
        name: 'HR Spares Administrator',
        email: 'admin@hrspares.com'
    },
    {
        username: 'hruser',
        password: 'HRSpares2025!User',
        role: 'user',
        name: 'HR Spares User',
        email: 'user@hrspares.com'
    }
];

async function createProductionUsers() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║         CREATING PRODUCTION USER ACCOUNTS                ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // Check connection
        const connected = await db.ping();
        if (!connected) {
            throw new Error('Failed to connect to PostgreSQL');
        }
        console.log('✅ Connected to PostgreSQL database\n');

        // Delete demo users if they exist
        console.log('Removing demo users (if any)...');
        await db.run('DELETE FROM users WHERE username IN (?, ?)', ['admin', 'user']);
        console.log('✅ Demo users removed\n');

        // Create production users
        console.log('Creating production users...\n');

        for (const user of PRODUCTION_USERS) {
            // Check if user already exists
            const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [user.username]);

            if (existingUser) {
                console.log(`⚠️  User '${user.username}' already exists - skipping`);
                continue;
            }

            // Hash password
            const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);

            // Create user
            await db.run(
                'INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)',
                [user.username, passwordHash, user.role, user.name, user.email]
            );

            console.log(`✅ Created ${user.role.toUpperCase()} user: ${user.username}`);
        }

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║              PRODUCTION USERS CREATED                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        console.log('📋 PRODUCTION LOGIN CREDENTIALS:\n');
        console.log('┌─────────────────────────────────────────────────────────┐');
        console.log('│ ADMIN USER                                              │');
        console.log('├─────────────────────────────────────────────────────────┤');
        console.log('│ Username: hradmin                                       │');
        console.log('│ Password: HRSpares2025!Admin                            │');
        console.log('│ Role:     Administrator (Full Access)                   │');
        console.log('└─────────────────────────────────────────────────────────┘\n');

        console.log('┌─────────────────────────────────────────────────────────┐');
        console.log('│ REGULAR USER                                            │');
        console.log('├─────────────────────────────────────────────────────────┤');
        console.log('│ Username: hruser                                        │');
        console.log('│ Password: HRSpares2025!User                             │');
        console.log('│ Role:     User (Limited Access)                         │');
        console.log('└─────────────────────────────────────────────────────────┘\n');

        console.log('⚠️  IMPORTANT SECURITY NOTES:\n');
        console.log('1. ⚠️  Change these default passwords immediately after first login!');
        console.log('2. 🔒 Store these credentials securely (password manager recommended)');
        console.log('3. 🚫 Do NOT share these credentials');
        console.log('4. 📝 Save this information before closing this window\n');

        console.log('✅ Production users are ready for deployment!\n');

        await db.close();

    } catch (error) {
        console.error('\n❌ Error creating production users:', error);
        await db.close();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    createProductionUsers();
}

module.exports = createProductionUsers;
