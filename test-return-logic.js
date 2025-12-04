/**
 * Test script to verify return logic functionality
 * This script tests the full return flow:
 * 1. Login as admin
 * 2. Get an inventory item
 * 3. Create a sale with that item
 * 4. Create a return for that sale
 * 5. Approve the return
 * 6. Verify inventory was restocked
 */

const BASE_URL = 'http://localhost:3000';

// Helper function to make HTTP requests
async function request(method, path, body = null, cookie = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (cookie) {
        headers['Cookie'] = cookie;
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();

    // Extract cookie from response
    const setCookie = response.headers.get('set-cookie');

    return { data, cookie: setCookie || cookie, status: response.status };
}

async function testReturnLogic() {
    console.log('=== Testing Return Logic ===\n');

    try {
        // Step 1: Login
        console.log('1. Logging in as admin...');
        const loginResult = await request('POST', '/api/login', {
            username: 'admin',
            password: 'admin123'
        });

        if (!loginResult.data.success) {
            throw new Error('Login failed');
        }

        const sessionCookie = loginResult.cookie;
        console.log('✓ Login successful\n');

        // Step 2: Get an inventory item
        console.log('2. Fetching inventory...');
        const inventoryResult = await request('GET', '/api/inventory?page=1&limit=1', null, sessionCookie);

        if (!inventoryResult.data.data || inventoryResult.data.data.length === 0) {
            throw new Error('No inventory items found');
        }

        const item = inventoryResult.data.data[0];
        console.log(`✓ Found item: ${item.name} (SKU: ${item.sku})`);
        console.log(`  Initial quantity: ${item.quantity}\n`);

        const initialQuantity = item.quantity;

        // Step 3: Create a sale
        console.log('3. Creating a sale...');
        const saleData = {
            date: new Date().toISOString().split('T')[0],
            customerId: 1,
            customerName: 'Test Customer',
            sellerId: 4,
            sellerName: 'Admin User',
            items: [{
                id: item.id,
                itemId: item.id,
                sku: item.sku,
                name: item.name,
                category: item.category,
                quantity: 2,
                price: item.price,
                actualPrice: item.price
            }],
            total: item.price * 2,
            paymentMethod: 'cash',
            status: 'completed'
        };

        const saleResult = await request('POST', '/api/sales', saleData, sessionCookie);

        if (!saleResult.data.id) {
            throw new Error('Sale creation failed: ' + JSON.stringify(saleResult.data));
        }

        const saleId = saleResult.data.id;
        const invoiceNumber = saleResult.data.invoiceNumber;
        console.log(`✓ Sale created: ${invoiceNumber} (ID: ${saleId})\n`);

        // Step 4: Verify inventory decreased
        console.log('4. Verifying inventory decreased...');
        const inventoryAfterSale = await request('GET', `/api/inventory/${item.id}`, null, sessionCookie);
        const quantityAfterSale = inventoryAfterSale.data.quantity;
        console.log(`  Quantity after sale: ${quantityAfterSale}`);

        if (quantityAfterSale !== initialQuantity - 2) {
            throw new Error(`Inventory not updated correctly. Expected ${initialQuantity - 2}, got ${quantityAfterSale}`);
        }
        console.log('✓ Inventory correctly decreased\n');

        // Step 5: Create a return
        console.log('5. Creating a return...');
        const returnData = {
            invoiceNumber: invoiceNumber,
            invoiceId: saleId,
            date: new Date().toISOString().split('T')[0],
            customerName: 'Test Customer',
            customerId: 1,
            amount: item.price * 2,
            reason: 'Defective product',
            status: 'pending',
            items: [{
                id: item.id,
                itemId: item.id,
                sku: item.sku,
                name: item.name,
                category: item.category,
                quantity: 2,
                price: item.price,
                originalPrice: item.price
            }]
        };

        const returnResult = await request('POST', '/api/returns', returnData, sessionCookie);

        if (!returnResult.data.success) {
            throw new Error('Return creation failed: ' + JSON.stringify(returnResult.data));
        }

        const returnId = returnResult.data.id;
        console.log(`✓ Return created (ID: ${returnId})\n`);

        // Step 6: Verify returned_items were created
        console.log('6. Verifying returned items were created...');
        const returnedItemsResult = await request('GET', `/api/returns/${returnId}/items`, null, sessionCookie);

        if (!returnedItemsResult.data.success || returnedItemsResult.data.items.length === 0) {
            throw new Error('Returned items not created');
        }

        console.log(`✓ ${returnedItemsResult.data.items.length} returned item(s) created\n`);

        // Step 7: Approve the return
        console.log('7. Approving the return...');
        const approveData = {
            status: 'approved',
            approvedBy: 'Admin User',
            approvedDate: new Date().toISOString().split('T')[0]
        };

        const approveResult = await request('PUT', `/api/returns/${returnId}`, approveData, sessionCookie);

        if (!approveResult.data.success) {
            throw new Error('Return approval failed: ' + JSON.stringify(approveResult.data));
        }
        console.log('✓ Return approved\n');

        // Step 8: Verify inventory was NOT restocked (items should stay in returned_items)
        console.log('8. Verifying inventory was NOT restocked...');
        const inventoryAfterReturn = await request('GET', `/api/inventory/${item.id}`, null, sessionCookie);
        const quantityAfterReturn = inventoryAfterReturn.data.quantity;
        console.log(`  Quantity after return approval: ${quantityAfterReturn}`);
        console.log(`  Expected quantity (should still be reduced): ${quantityAfterSale}`);

        if (quantityAfterReturn !== quantityAfterSale) {
            throw new Error(`Inventory should NOT be restocked. Expected ${quantityAfterSale}, got ${quantityAfterReturn}`);
        }
        console.log('✓ Inventory correctly remains reduced (items in returned_items)\n');

        // Step 8b: Verify returned items are marked as approved
        console.log('8b. Verifying returned items are marked as approved...');
        const returnedItemsAfterApproval = await request('GET', `/api/returns/${returnId}/items`, null, sessionCookie);
        if (returnedItemsAfterApproval.data.items.length === 0) {
            throw new Error('Returned items were deleted instead of being marked as approved');
        }
        if (returnedItemsAfterApproval.data.items[0].condition !== 'approved') {
            throw new Error('Returned items not marked as approved');
        }
        console.log('✓ Returned items correctly marked as approved\n');

        // Step 9: Test rejecting a return
        console.log('9. Testing return rejection...');

        // Create another sale
        const saleResult2 = await request('POST', '/api/sales', saleData, sessionCookie);
        const saleId2 = saleResult2.data.id;
        const invoiceNumber2 = saleResult2.data.invoiceNumber;

        // Get inventory after second sale
        const inventoryAfterSale2 = await request('GET', `/api/inventory/${item.id}`, null, sessionCookie);
        const quantityAfterSale2 = inventoryAfterSale2.data.quantity;

        // Create a return
        const returnData2 = {
            ...returnData,
            invoiceNumber: invoiceNumber2,
            invoiceId: saleId2
        };
        const returnResult2 = await request('POST', '/api/returns', returnData2, sessionCookie);
        const returnId2 = returnResult2.data.id;

        // Verify returned items were created
        const returnedItemsBeforeReject = await request('GET', `/api/returns/${returnId2}/items`, null, sessionCookie);
        if (returnedItemsBeforeReject.data.items.length === 0) {
            throw new Error('Returned items not created for second return');
        }

        // Reject the return
        const rejectData = {
            status: 'rejected',
            rejectedBy: 'Admin User',
            rejectedDate: new Date().toISOString().split('T')[0],
            rejectionReason: 'Past return window'
        };

        const rejectResult = await request('PUT', `/api/returns/${returnId2}`, rejectData, sessionCookie);

        if (!rejectResult.data.success) {
            throw new Error('Return rejection failed');
        }

        // Verify inventory was NOT changed (remains as sale)
        const inventoryAfterReject = await request('GET', `/api/inventory/${item.id}`, null, sessionCookie);
        const quantityAfterReject = inventoryAfterReject.data.quantity;

        if (quantityAfterReject !== quantityAfterSale2) {
            throw new Error(`Inventory should remain as sold. Expected ${quantityAfterSale2}, got ${quantityAfterReject}`);
        }

        // Verify returned items were deleted
        const returnedItemsAfterReject = await request('GET', `/api/returns/${returnId2}/items`, null, sessionCookie);
        if (returnedItemsAfterReject.data.items.length > 0) {
            throw new Error('Returned items should be deleted for rejected return');
        }

        console.log('✓ Return rejection works correctly (items removed from returned_items)\n');

        console.log('=== ALL TESTS PASSED ===');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

// Run the test
testReturnLogic();
