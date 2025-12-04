require('dotenv').config();
const DatabaseWrapper = require('./database');

async function checkInventory() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('Checking inventory item ID 3...\n');

        const item = await db.get('SELECT * FROM inventory WHERE id = ?', [3]);

        if (item) {
            console.log('Item found:');
            console.log('ID:', item.id);
            console.log('SKU:', item.sku);
            console.log('Name:', item.name);
            console.log('Category:', item.category);
            console.log('Quantity:', item.quantity);
            console.log('Cost Price:', item.cost_price);
            console.log('Selling Price:', item.price);
            console.log('Reorder Level:', item.reorder_level);
            console.log('Supplier:', item.supplier);
            console.log('Last Restock:', item.last_restock);
        } else {
            console.log('Item not found!');
        }

        await db.close();
    } catch (error) {
        console.error('Error:', error);
        await db.close();
        process.exit(1);
    }
}

checkInventory();
