require('dotenv').config();
const DatabaseWrapper = require('../../src/config/database');

async function verifyProfitAnalysis() {
    const db = new DatabaseWrapper({ type: 'postgres' });

    try {
        console.log('═══════════════════════════════════════════════════════');
        console.log('          PROFIT ANALYSIS VERIFICATION');
        console.log('═══════════════════════════════════════════════════════\n');

        // Get today's date
        const today = new Date().toISOString().split('T')[0];

        // Fetch today's completed sales
        const sales = await db.all(
            'SELECT * FROM sales WHERE status = ? AND date = ?',
            ['completed', today]
        );

        console.log(`📊 Sales for ${today}: ${sales.length} transactions\n`);

        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;

        // Process each sale
        sales.forEach((sale, index) => {
            console.log(`Sale #${index + 1}: ${sale.invoicenumber}`);
            console.log(`  💰 Revenue: ${parseFloat(sale.total).toLocaleString()} UGX`);
            console.log(`  💵 Cost: ${parseFloat(sale.totalcost).toLocaleString()} UGX`);
            console.log(`  ✨ Profit: ${parseFloat(sale.profit).toLocaleString()} UGX`);
            console.log('');

            totalRevenue += parseFloat(sale.total);
            totalCost += parseFloat(sale.totalcost);
            totalProfit += parseFloat(sale.profit);
        });

        // Calculate profit margin
        const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

        console.log('═══════════════════════════════════════════════════════');
        console.log('                    SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`  Total Revenue:    ${totalRevenue.toLocaleString()} UGX`);
        console.log(`  Total Cost:       ${totalCost.toLocaleString()} UGX`);
        console.log(`  Total Profit:     ${totalProfit.toLocaleString()} UGX`);
        console.log(`  Profit Margin:    ${profitMargin.toFixed(2)}%`);
        console.log(`  Avg Order Value:  ${sales.length > 0 ? (totalRevenue / sales.length).toLocaleString() : 0} UGX`);
        console.log(`  Avg Profit/Sale:  ${sales.length > 0 ? (totalProfit / sales.length).toLocaleString() : 0} UGX`);
        console.log('═══════════════════════════════════════════════════════\n');

        // Get top items by profit
        const allItems = [];
        sales.forEach(sale => {
            const items = JSON.parse(sale.items);
            items.forEach(item => {
                const existingItem = allItems.find(i => i.id === item.id || i.id === item.itemId);
                if (existingItem) {
                    existingItem.quantitySold += item.quantity;
                    existingItem.revenue += (item.actualPrice || item.price) * item.quantity;
                    existingItem.profit += ((item.actualPrice || item.price) - (item.costPrice || 0)) * item.quantity;
                } else {
                    allItems.push({
                        id: item.id || item.itemId,
                        name: item.name,
                        sku: item.sku,
                        quantitySold: item.quantity,
                        revenue: (item.actualPrice || item.price) * item.quantity,
                        profit: ((item.actualPrice || item.price) - (item.costPrice || 0)) * item.quantity
                    });
                }
            });
        });

        // Sort by profit
        const topItems = allItems.sort((a, b) => b.profit - a.profit);

        if (topItems.length > 0) {
            console.log('🏆 TOP SELLING ITEMS (by Profit):\n');
            topItems.forEach((item, index) => {
                console.log(`${index + 1}. ${item.name} (${item.sku})`);
                console.log(`   Quantity Sold: ${item.quantitySold}`);
                console.log(`   Revenue: ${item.revenue.toLocaleString()} UGX`);
                console.log(`   Profit: ${item.profit.toLocaleString()} UGX`);
                console.log('');
            });
        } else {
            console.log('No items sold today.\n');
        }

        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ Profit Analysis Verification Complete!');
        console.log('═══════════════════════════════════════════════════════\n');

        await db.close();

    } catch (error) {
        console.error('❌ Error:', error);
        await db.close();
        process.exit(1);
    }
}

verifyProfitAnalysis();
