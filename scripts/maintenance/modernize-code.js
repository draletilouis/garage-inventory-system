/**
 * Script to modernize JavaScript code:
 * - Replace parseInt with Number.parseInt (with radix)
 * - Replace parseFloat with Number.parseFloat
 * - Replace isNaN with Number.isNaN
 * - Replace .replace() with .replaceAll() where appropriate
 */

const fs = require('fs');
const path = require('path');

const FILES_TO_PROCESS = [
    'server.js',
    'app.js',
    'database.js',
    'init-postgres.js',
    'create-demo-users.js'
];

function modernizeCode(content) {
    let modified = content;

    // 1. Replace parseInt with Number.parseInt and add radix
    // Only replace if it's not already Number.parseInt
    // Handle parseInt(value) -> Number.parseInt(value, 10)
    modified = modified.replace(/(?<!Number\.)parseInt\(([^,)]+)\)/g, 'Number.parseInt($1, 10)');
    // Handle parseInt(value, radix) -> Number.parseInt(value, radix)
    modified = modified.replace(/(?<!Number\.)parseInt\(([^,]+),\s*(\d+)\)/g, 'Number.parseInt($1, $2)');

    // 2. Replace parseFloat with Number.parseFloat
    // Only replace if it's not already Number.parseFloat
    modified = modified.replace(/(?<!Number\.)parseFloat\(/g, 'Number.parseFloat(');

    // 3. Replace isNaN with Number.isNaN
    // Only replace if it's not already Number.isNaN
    modified = modified.replace(/(?<!Number\.)isNaN\(/g, 'Number.isNaN(');

    // 4. Replace .replace() with .replaceAll() for global string replacements
    // Pattern: .replace(/pattern/g, ...) -> .replaceAll(/pattern/g, ...)
    modified = modified.replace(/\.replace\(\/([^/]+)\/g,/g, '.replaceAll(/$1/g,');

    return modified;
}

function processFile(filePath) {
    try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log(`  ⚠ ${filePath} not found, skipping`);
            return false;
        }

        // Read file
        const content = fs.readFileSync(filePath, 'utf8');

        // Modernize code
        const modernized = modernizeCode(content);

        // Check if there were changes
        if (content === modernized) {
            console.log(`  ℹ ${filePath} - No changes needed`);
            return false;
        }

        // Create backup
        const backupPath = `${filePath}.backup`;
        fs.writeFileSync(backupPath, content, 'utf8');

        // Write modernized code
        fs.writeFileSync(filePath, modernized, 'utf8');

        // Count changes
        const oldLines = content.split('\n').length;
        const newLines = modernized.split('\n').length;

        console.log(`  ✓ ${filePath} modernized (${oldLines} lines)`);
        return true;

    } catch (error) {
        console.error(`  ✗ Error processing ${filePath}:`, error.message);
        return false;
    }
}

console.log('=== Modernizing JavaScript Code ===\n');

let totalProcessed = 0;
let totalModified = 0;

FILES_TO_PROCESS.forEach(file => {
    const filePath = path.join(__dirname, file);
    console.log(`Processing ${file}...`);
    totalProcessed++;
    if (processFile(filePath)) {
        totalModified++;
    }
});

console.log(`\n=== Summary ===`);
console.log(`Files processed: ${totalProcessed}`);
console.log(`Files modified: ${totalModified}`);
console.log(`\nBackup files created with .backup extension`);
console.log(`To restore: delete .backup extension from backup files\n`);
