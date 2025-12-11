// API Base URL - automatically detects environment
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:3000/api`
    : `${window.location.protocol}//${window.location.host}/api`;

let currentUser = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds

// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.getElementById('sidebar');

    if (mobileMenuBtn && mobileOverlay && sidebar) {
        // Toggle menu when button is clicked
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            mobileOverlay.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        // Close menu when overlay is clicked
        mobileOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            mobileOverlay.classList.remove('active');
            mobileMenuBtn.classList.remove('active');
        });

        // Close menu when a navigation button is clicked
        const navButtons = sidebar.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Only close on mobile (when overlay is visible)
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('mobile-open');
                    mobileOverlay.classList.remove('active');
                    mobileMenuBtn.classList.remove('active');
                }
            });
        });

        // Close menu on window resize if it goes above mobile breakpoint
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                sidebar.classList.remove('mobile-open');
                mobileOverlay.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            }
        });
    }
});

// Sorting state for tables
let sortState = {
    inventory: { column: null, ascending: true },
    sales: { column: null, ascending: true },
    returns: { column: null, ascending: true },
    customers: { column: null, ascending: true },
    suppliers: { column: null, ascending: true }
};

// Pagination state for tables
let paginationState = {
    inventory: { page: 1, limit: 50, total: 0, totalPages: 0 },
    sales: { page: 1, limit: 50, total: 0, totalPages: 0 },
    returns: { page: 1, limit: 50, total: 0, totalPages: 0 },
    customers: { page: 1, limit: 50, total: 0, totalPages: 0 },
    suppliers: { page: 1, limit: 50, total: 0, totalPages: 0 },
    users: { page: 1, limit: 50, total: 0, totalPages: 0 },
    returnedItems: { page: 1, limit: 50, total: 0, totalPages: 0 }
};

// Generic sort function
const sortData = (data, column, ascending, type = 'string') => {
    return [...data].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        if (type === 'number') {
            aVal = Number.parseFloat(aVal) || 0;
            bVal = Number.parseFloat(bVal) || 0;
        } else if (type === 'string') {
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
        }

        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
    });
};

// Utility function to format currency (number with thousand separators)
const formatUGX = (amount) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// API Helper Functions
const apiRequest = async (endpoint, method = 'GET', data = null) => {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_URL}${endpoint}`, options);

        // Validate response status before parsing
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Server error occurred';

            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || errorMessage;
            } catch (e) {
                // If not JSON, use status text
                errorMessage = `Server error: ${response.status} ${response.statusText}`;
            }

            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error) {
        // Log error for debugging
        console.error(`API Request Failed [${method} ${endpoint}]:`, error);

        // Re-throw with user-friendly message
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Network error. Please check your connection and try again.');
        }

        throw error;
    }
};

// Helper function to show loading state in tables
const showTableLoading = (tableBodyId, colspan = 10) => {
    const tbody = document.getElementById(tableBodyId);
    tbody.innerHTML = `
        <tr>
            <td colspan="${colspan}" style="text-align: center; padding: 40px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
                    <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <span style="color: #666;">Loading data...</span>
                </div>
            </td>
        </tr>
    `;
};

// Session Management Functions
const saveSession = (user) => {
    const sessionData = {
        user: user,
        lastActivity: Date.now()
    };
    localStorage.setItem('userSession', JSON.stringify(sessionData));
};

const checkSessionValidity = () => {
    const sessionData = localStorage.getItem('userSession');
    if (!sessionData) return null;

    try {
        const session = JSON.parse(sessionData);
        const currentTime = Date.now();
        const timeSinceLastActivity = currentTime - session.lastActivity;

        // Check if session has expired (20 minutes of inactivity)
        if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
            clearSession();
            return null;
        }

        return session.user;
    } catch (error) {
        console.error('Error checking session:', error);
        clearSession();
        return null;
    }
};

const updateSessionActivity = () => {
    const sessionData = localStorage.getItem('userSession');
    if (sessionData) {
        try {
            const session = JSON.parse(sessionData);
            session.lastActivity = Date.now();
            localStorage.setItem('userSession', JSON.stringify(session));
        } catch (error) {
            console.error('Error updating session:', error);
        }
    }
};

const clearSession = () => {
    localStorage.removeItem('userSession');
    localStorage.removeItem('currentUser'); // Legacy cleanup
};

const startInactivityTimer = () => {
    // Clear any existing timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    // Set new timer
    inactivityTimer = setTimeout(() => {
        alert('Your session has expired due to inactivity. Please log in again.');
        logout();
    }, INACTIVITY_TIMEOUT);
};

const resetInactivityTimer = () => {
    updateSessionActivity();
    startInactivityTimer();
};

// Track user activity
const setupActivityTracking = () => {
    // Track mouse movements, clicks, and keyboard activity
    const activities = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activities.forEach(activity => {
        document.addEventListener(activity, () => {
            if (currentUser) {
                resetInactivityTimer();
            }
        }, { passive: true });
    });
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Application initialized');

    // Setup activity tracking
    setupActivityTracking();

    // Attach login button handler
    const loginButton = document.querySelector('#loginScreen button');
    if (loginButton) {
        console.log('Login button found, attaching click handler');
        loginButton.addEventListener('click', window.login);
    } else {
        console.error('Login button not found!');
    }

    // Allow Enter key to submit login
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                window.login();
            }
        });
    }

    // Check if there's a valid session
    const savedUser = checkSessionValidity();
    if (savedUser) {
        try {
            currentUser = savedUser;
            document.getElementById('currentUser').textContent = `${currentUser.name} (${currentUser.role})`;

            // Hide admin-only navigation items for regular users
            const isAdmin = currentUser.role === 'admin';
            document.querySelectorAll('.admin-only').forEach(element => {
                element.style.display = isAdmin ? '' : 'none';
            });

            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('mainApp').classList.add('active');

            // Start inactivity timer
            startInactivityTimer();

            await loadDashboard();
        } catch (error) {
            console.error('Error loading saved session:', error);
            clearSession();
        }
    } else {
        // Session expired or doesn't exist
        clearSession();
    }
});

// Authentication
window.login = async () => {
    console.log('Login function called!');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const loginButton = document.querySelector('#loginScreen button');

    // Show loading state
    const originalButtonText = loginButton.innerHTML;
    loginButton.disabled = true;
    loginButton.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 10px;">
            <div style="width: 16px; height: 16px; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
            <span>Logging in...</span>
        </div>
    `;

    console.log('Attempting login with username:', username);

    try {
        const result = await apiRequest('/login', 'POST', { username, password });

        if (result.success) {
            currentUser = result.user;
            console.log('Login successful, currentUser set to:', currentUser);

            // Save session with timestamp
            saveSession(result.user);

            document.getElementById('currentUser').textContent = `${result.user.name} (${result.user.role})`;

            // Hide admin-only navigation items for regular users
            const isAdmin = result.user.role === 'admin';
            document.querySelectorAll('.admin-only').forEach(element => {
                element.style.display = isAdmin ? '' : 'none';
            });

            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('mainApp').classList.add('active');

            // Start inactivity timer
            startInactivityTimer();

            console.log('About to load dashboard, currentUser is:', currentUser);
            await loadDashboard();
            errorDiv.textContent = '';

            // Restore button state after successful login
            loginButton.disabled = false;
            loginButton.innerHTML = originalButtonText;
        } else {
            errorDiv.textContent = 'Invalid username or password';
            // Restore button state
            loginButton.disabled = false;
            loginButton.innerHTML = originalButtonText;
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = `Connection error: ${error.message}. Please check server status.`;
        // Restore button state
        loginButton.disabled = false;
        loginButton.innerHTML = originalButtonText;
    }
};

window.logout = () => {
    currentUser = null;

    // Clear inactivity timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Clear saved session
    clearSession();

    // Reset login button to original state
    const loginButton = document.querySelector('#loginScreen button');
    if (loginButton) {
        loginButton.disabled = false;
        loginButton.innerHTML = 'Login';
    }

    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    // Clear any login error messages
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = '';
    }
};

// Tab navigation
window.showTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');

    // Find and activate the corresponding nav button
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName.toLowerCase()) ||
            btn.onclick?.toString().includes(tabName)) {
            btn.classList.add('active');
        }
    });

    // Load data for the active tab
    switch(tabName) {
        case 'dashboard': loadDashboard(); break;
        case 'inventory': loadInventory(); break;
        case 'returnedItems': if (typeof loadReturnedItems !== 'undefined') loadReturnedItems(); break;
        case 'sales': loadSales(); break;
        case 'returns': loadReturns(); break;
        case 'customers': loadCustomers(); break;
        case 'suppliers': loadSuppliers(); break;
        case 'users': loadUsers(); break;
    }
};

// Dashboard functions
const loadDashboard = async () => {
    try {
        // Safety check for currentUser
        if (!currentUser || !currentUser.id || !currentUser.role) {
            console.error('currentUser is not set properly:', currentUser);
            console.error('LocalStorage userSession:', localStorage.getItem('userSession'));
            throw new Error('User session is invalid. Please login again.');
        }

        const inventoryResponse = await apiRequest('/inventory');
        // Get sales filtered by user - admins see all, regular users see only their own
        const salesResponse = await apiRequest(`/sales?userId=${currentUser.id}&userRole=${currentUser.role}`);
        const returnsResponse = await apiRequest('/returns');

        // Extract data from paginated responses
        const inventory = inventoryResponse.data || [];
        const sales = salesResponse.data || [];
        const returns = returnsResponse.data || [];

        // Calculate metrics
        const isAdmin = currentUser.role === 'admin';

        // For admins: show total inventory value. For users: show value of items they can access
        const totalValue = inventory.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        const lowStockItems = inventory.filter(item => item.quantity <= item.reorder_level);

        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(sale => sale.date === today);
        const todayRevenue = todaySales.reduce((sum, sale) => sum + Number.parseFloat(sale.total || 0), 0);

        const pendingReturns = returns.filter(r => r.status === 'pending');

        // Update dashboard metrics
        // Total inventory value is hidden for regular users via admin-only class
        if (isAdmin) {
            document.getElementById('totalValue').textContent = formatUGX(totalValue);
            // Load initial profit data for admins
            await loadInitialProfitMetric();
        }

        document.getElementById('lowStock').textContent = lowStockItems.length;
        document.getElementById('todaySales').textContent = formatUGX(todayRevenue); // Show total sales revenue
        document.getElementById('pendingReturns').textContent = pendingReturns.length;

        // Low stock alerts
        const lowStockList = document.getElementById('lowStockList');
        if (lowStockItems.length === 0) {
            lowStockList.innerHTML = '<div class="empty-state"><p>No low stock items</p></div>';
        } else {
            lowStockList.innerHTML = lowStockItems.map(item => `
                <div class="alert-item ${item.quantity === 0 ? 'critical' : ''}">
                    <div>
                        <strong>${item.name}</strong> (${item.sku})<br>
                        <small>Current: ${item.quantity} | Reorder Level: ${item.reorder_level}</small>
                    </div>
                    <span class="status-badge low-stock">${item.quantity === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}</span>
                </div>
            `).join('');
        }

        // Recent sales
        const recentSalesList = document.getElementById('recentSalesList');
        if (todaySales.length === 0) {
            recentSalesList.innerHTML = '<div class="empty-state"><p>No sales today</p></div>';
        } else {
            recentSalesList.innerHTML = todaySales.map(sale => `
                <div class="recent-item">
                    <div>
                        <strong>Sales Receipt #${sale.invoice_number}</strong><br>
                        <small>${sale.customer_name} - ${sale.items.length} items</small>
                    </div>
                    <strong style="color: #27ae60;">${formatUGX(sale.total)}</strong>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        console.error('Current user state:', currentUser);
        alert(`Failed to load dashboard: ${error.message}`);
        // If the error is related to session, log out the user
        if (!currentUser || !currentUser.id) {
            clearSession();
            window.location.reload();
        }
    }
};

// Profit Analysis Functions
const loadInitialProfitMetric = async () => {
    try {
        // Fetch today's profits only for dashboard display
        const today = new Date().toISOString().split('T')[0];
        const profitData = await apiRequest(`/dashboard/profits?startDate=${today}&endDate=${today}`);
        document.getElementById('totalProfits').textContent = formatUGX(profitData.summary.totalProfit);
    } catch (error) {
        console.error('Error loading profit metric:', error);
        document.getElementById('totalProfits').textContent = 'Error';
    }
};

window.showProfitsBreakdown = async () => {
    const section = document.getElementById('profitsBreakdownSection');
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
    await loadProfitsData();
};

window.hideProfitsBreakdown = () => {
    document.getElementById('profitsBreakdownSection').style.display = 'none';
};

window.loadProfitsData = async () => {
    try {
        const startDate = document.getElementById('profitStartDate').value;
        const endDate = document.getElementById('profitEndDate').value;

        let url = '/dashboard/profits';
        const params = [];
        if (startDate) params.push(`startDate=${startDate}`);
        if (endDate) params.push(`endDate=${endDate}`);
        if (params.length > 0) url += '?' + params.join('&');

        const profitData = await apiRequest(url);

        // Update metrics
        document.getElementById('profitTotalRevenue').textContent = formatUGX(profitData.summary.totalRevenue);
        document.getElementById('profitNetProfit').textContent = formatUGX(profitData.summary.totalProfit);
        document.getElementById('profitMargin').textContent = profitData.summary.profitMargin.toFixed(2) + '%';
        document.getElementById('profitTotalSales').textContent = profitData.summary.totalSales;
        document.getElementById('profitAvgOrder').textContent = formatUGX(profitData.summary.averageOrderValue);

        // Update top selling items table
        const tbody = document.getElementById('topSellingBody');
        if (profitData.topSellingItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No sales data available</td></tr>';
        } else {
            tbody.innerHTML = profitData.topSellingItems.map((item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.sku}</td>
                    <td>${item.name}</td>
                    <td>${item.quantitySold}</td>
                    <td>${formatUGX(item.revenue)}</td>
                    <td style="color: #27ae60; font-weight: bold;">${formatUGX(item.profit)}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading profits data:', error);
        alert(`Failed to load profits data: ${error.message}`);
    }
};

window.clearProfitFilters = () => {
    document.getElementById('profitStartDate').value = '';
    document.getElementById('profitEndDate').value = '';
    loadProfitsData();
};

// Inventory functions
let inventoryData = [];

const loadInventory = async (page = 1) => {
    try {
        // Show loading state
        showTableLoading('inventoryTableBody', 11);

        paginationState.inventory.page = page;
        const response = await apiRequest(`/inventory?page=${page}&limit=${paginationState.inventory.limit}`);

        // Handle paginated response
        if (response.data && response.pagination) {
            inventoryData = response.data;
            paginationState.inventory = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response (backward compatibility)
            inventoryData = response;
        }

        renderInventoryTable();
        renderPaginationControls('inventory');
    } catch (error) {
        console.error('Error loading inventory:', error);
        alert(`Failed to load inventory: ${error.message}`);
    }
};

const renderInventoryTable = () => {
    const tbody = document.getElementById('inventoryTableBody');

    if (inventoryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No inventory items. Add your first item!</td></tr>';
        return;
    }

    const isAdmin = currentUser.role === 'admin';

    // Add calculated fields for sorting
    const dataWithCalc = inventoryData.map(item => ({
        ...item,
        totalValue: item.quantity * item.price
    }));

    tbody.innerHTML = dataWithCalc.map(item => {
        const status = item.quantity <= item.reorder_level ? 'low-stock' : 'in-stock';
        const statusText = item.quantity === 0 ? 'OUT OF STOCK' :
                          item.quantity <= item.reorder_level ? 'LOW STOCK' : 'IN STOCK';

        return `
            <tr>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity}</td>
                <td>${formatUGX(item.price)}</td>
                <td>${formatUGX(item.totalValue)}</td>
                <td>${item.reorder_level}</td>
                <td>${item.supplier}</td>
                <td>${item.last_restock}</td>
                <td><span class="status-badge ${status}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="btn-info" onclick="editInventoryItem(${item.id})">Edit</button>
                    ${isAdmin ? `<button class="btn-danger" onclick="deleteInventoryItem(${item.id})">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
};

window.sortInventory = (column, type = 'string') => {
    if (sortState.inventory.column === column) {
        sortState.inventory.ascending = !sortState.inventory.ascending;
    } else {
        sortState.inventory.column = column;
        sortState.inventory.ascending = true;
    }

    inventoryData = sortData(inventoryData, column, sortState.inventory.ascending, type);
    renderInventoryTable();
};

window.showAddInventoryModal = async () => {
    document.getElementById('inventoryModalTitle').textContent = 'Add New Inventory Item';
    document.getElementById('inventoryForm').reset();
    document.getElementById('editInventoryId').value = '';

    // Populate suppliers dropdown
    const suppliersResponse = await apiRequest('/suppliers');
    const suppliers = suppliersResponse.data || suppliersResponse; // Handle paginated response
    const supplierSelect = document.getElementById('itemSupplier');
    supplierSelect.innerHTML = '<option value="">Select Supplier</option>' +
        suppliers.map(s => `<option value="${s.company}">${s.company}</option>`).join('');

    openModal('inventoryModal');
};

const editInventoryItem = async (id) => {
    try {
        const item = await apiRequest(`/inventory/${id}`);
        document.getElementById('inventoryModalTitle').textContent = 'Edit Inventory Item';
        document.getElementById('editInventoryId').value = id;
        document.getElementById('itemSku').value = item.sku;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemQuantity').value = item.quantity;
        document.getElementById('itemCostPrice').value = item.cost_price || 0;
        document.getElementById('itemPrice').value = item.price;
        document.getElementById('itemReorderLevel').value = item.reorder_level;

        const suppliersResponse = await apiRequest('/suppliers');
        const suppliers = suppliersResponse.data || [];
        const supplierSelect = document.getElementById('itemSupplier');
        supplierSelect.innerHTML = suppliers.map(s =>
            `<option value="${s.company}" ${s.company === item.supplier ? 'selected' : ''}>${s.company}</option>`
        ).join('');

        openModal('inventoryModal');
    } catch (error) {
        console.error('Error loading inventory item:', error);
        alert(`Failed to load item for editing: ${error.message}`);
    }
};

window.saveInventoryItem = async (event) => {
    event.preventDefault();

    try {
        // Parse and validate numbers
        const quantity = Number.parseInt(document.getElementById('itemQuantity', 10).value);
        const costPrice = Number.parseFloat(document.getElementById('itemCostPrice').value);
        const price = Number.parseFloat(document.getElementById('itemPrice').value);
        const reorderLevel = Number.parseInt(document.getElementById('itemReorderLevel', 10).value);

        // Validate parsed values
        if (Number.isNaN(quantity) || quantity < 0) {
            alert('Please enter a valid quantity (must be a positive number)');
            return;
        }
        if (Number.isNaN(costPrice) || costPrice < 0) {
            alert('Please enter a valid cost price (must be a positive number)');
            return;
        }
        if (Number.isNaN(price) || price < 0) {
            alert('Please enter a valid selling price (must be a positive number)');
            return;
        }
        if (Number.isNaN(reorderLevel) || reorderLevel < 0) {
            alert('Please enter a valid reorder level (must be a positive number)');
            return;
        }

        const itemData = {
            sku: document.getElementById('itemSku').value,
            name: document.getElementById('itemName').value,
            category: document.getElementById('itemCategory').value,
            quantity: quantity,
            costPrice: costPrice,
            price: price,
            reorderLevel: reorderLevel,
            supplier: document.getElementById('itemSupplier').value,
            lastRestock: new Date().toISOString().split('T')[0]
        };

        const editId = document.getElementById('editInventoryId').value;

        if (editId) {
            await apiRequest(`/inventory/${editId}`, 'PUT', itemData);
        } else {
            await apiRequest('/inventory', 'POST', itemData);
        }

        closeModal();
        await loadInventory();
    } catch (error) {
        console.error('Error saving inventory item:', error);
        alert(`Failed to save inventory item: ${error.message}`);
    }
};

const deleteInventoryItem = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to delete inventory items.');
        return;
    }
    if (confirm('Are you sure you want to delete this item?')) {
        try {
            await apiRequest(`/inventory/${id}`, 'DELETE');
            await loadInventory();
        } catch (error) {
            console.error('Error deleting inventory item:', error);
            alert(`Failed to delete item: ${error.message}`);
        }
    }
};

window.filterInventory = () => {
    const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();

    // Use cached inventoryData instead of refetching
    const filtered = inventoryData.filter(item =>
        (item.name && item.name.toLowerCase().includes(searchTerm)) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm)) ||
        (item.category && item.category.toLowerCase().includes(searchTerm))
    );

    const tbody = document.getElementById('inventoryTableBody');
    const isAdmin = currentUser.role === 'admin';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No items match your search</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const totalValue = item.quantity * item.price;
        const status = item.quantity <= item.reorder_level ? 'low-stock' : 'in-stock';
        const statusText = item.quantity === 0 ? 'OUT OF STOCK' :
                          item.quantity <= item.reorder_level ? 'LOW STOCK' : 'IN STOCK';

        return `
            <tr>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity}</td>
                <td>${formatUGX(item.price)}</td>
                <td>${formatUGX(totalValue)}</td>
                <td>${item.reorder_level}</td>
                <td>${item.supplier}</td>
                <td>${item.last_restock}</td>
                <td><span class="status-badge ${status}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="btn-info" onclick="editInventoryItem(${item.id})">Edit</button>
                    ${isAdmin ? `<button class="btn-danger" onclick="deleteInventoryItem(${item.id})">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
};

// Sales functions
let saleItemCounter = 0;
let salesData = [];

const loadSales = async (page = 1) => {
    try {
        // Show loading state
        showTableLoading('salesTableBody', 11);

        paginationState.sales.page = page;
        // Filter sales by user - admins see all, regular users see only their own
        const response = await apiRequest(`/sales?userId=${currentUser.id}&userRole=${currentUser.role}&page=${page}&limit=${paginationState.sales.limit}`);

        let allSales;

        // Handle paginated response
        if (response.data && response.pagination) {
            allSales = response.data;
            paginationState.sales = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            allSales = response;
        }

        // Filter to show only today's sales
        const today = new Date().toISOString().split('T')[0];
        salesData = allSales.filter(sale => sale.date === today);

        renderSalesTable();
        renderPaginationControls('sales');
    } catch (error) {
        console.error('Error loading sales:', error);
        alert(`Failed to load sales: ${error.message}`);
    }
};

const renderSalesTable = () => {
    const tbody = document.getElementById('salesTableBody');

    if (salesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No sales recorded. Make your first sale!</td></tr>';
        return;
    }

    tbody.innerHTML = salesData.map(sale => {
        const invoiceNumber = sale.invoice_number;
        const customerName = sale.customer_name;
        const sellerName = sale.seller_name || 'N/A';
        const paymentMethod = sale.payment_method;
        const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
        const totalDiscount = Number.parseFloat(sale.total_discount || 0);

        return `
            <tr>
                <td>${invoiceNumber}</td>
                <td>${sale.date}</td>
                <td>${customerName}</td>
                <td>${sellerName}</td>
                <td>${items.length} items</td>
                <td>${formatUGX(sale.total)}</td>
                <td>${formatUGX(totalDiscount)}</td>
                <td>${formatUGX(sale.profit || 0)}</td>
                <td>${paymentMethod}</td>
                <td><span class="status-badge completed">Completed</span></td>
                <td class="action-buttons">
                    <button class="btn-info" onclick="viewSaleDetails(${sale.id})">View</button>
                    <button class="btn-success" onclick="printSaleReceipt(${sale.id})">Print</button>
                </td>
            </tr>
        `;
    }).join('');
};

window.sortSales = (column, type = 'string') => {
    if (sortState.sales.column === column) {
        sortState.sales.ascending = !sortState.sales.ascending;
    } else {
        sortState.sales.column = column;
        sortState.sales.ascending = true;
    }

    salesData = sortData(salesData, column, sortState.sales.ascending, type);
    renderSalesTable();
};

let allCustomers = [];

window.showNewSaleModal = async () => {
    saleItemCounter = 0;
    document.getElementById('saleForm').reset();

    // Load customers for autocomplete
    const customersResponse = await apiRequest('/customers');
    allCustomers = customersResponse.data || customersResponse;

    // Clear hidden customer ID field
    document.getElementById('selectedCustomerId').value = '';

    // Hide suggestions
    document.getElementById('customerSuggestions').classList.remove('show');

    // Load inventory for first item
    await updateSaleItemSelects();

    openModal('saleModal');
};

const showCustomerSuggestions = () => {
    const input = document.getElementById('manualCustomerName');
    const suggestionsDiv = document.getElementById('customerSuggestions');
    const searchTerm = input.value.trim().toLowerCase();

    // Clear selected customer ID when typing
    document.getElementById('selectedCustomerId').value = '';

    if (searchTerm.length === 0) {
        suggestionsDiv.classList.remove('show');
        return;
    }

    // Filter customers that match the search term
    const matches = allCustomers.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm) ||
        (customer.email && customer.email.toLowerCase().includes(searchTerm)) ||
        (customer.phone && customer.phone.includes(searchTerm))
    );

    if (matches.length === 0) {
        suggestionsDiv.classList.remove('show');
        return;
    }

    // Display suggestions
    suggestionsDiv.innerHTML = matches.map(customer => `
        <div class="suggestion-item" onclick="selectCustomerSuggestion(${customer.id}, '${customer.name.replaceAll(/'/g, "\\'")}')">
            <div class="suggestion-name">${customer.name}</div>
            <div class="suggestion-details">${customer.email || ''} ${customer.phone || ''}</div>
        </div>
    `).join('');

    suggestionsDiv.classList.add('show');
};

const selectCustomerSuggestion = (customer_id, customer_name) => {
    document.getElementById('manualCustomerName').value = customer_name;
    document.getElementById('selectedCustomerId').value = customer_id;
    document.getElementById('customerSuggestions').classList.remove('show');
};

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
    const suggestionsDiv = document.getElementById('customerSuggestions');
    const input = document.getElementById('manualCustomerName');

    if (suggestionsDiv && input && !suggestionsDiv.contains(e.target) && e.target !== input) {
        suggestionsDiv.classList.remove('show');
    }
});

const updateSaleItemSelects = async () => {
    const inventoryResponse = await apiRequest('/inventory');
    const inventory = inventoryResponse.data || inventoryResponse; // Handle paginated response
    const selects = document.querySelectorAll('.item-select');

    selects.forEach(select => {
        // Save the current selected value
        const currentValue = select.value;

        // Update the options
        select.innerHTML = '<option value="">Select Item</option>' +
            inventory.filter(item => item.quantity > 0)
                    .map(item => `<option value="${item.id}">${item.name} - ${formatUGX(item.price)} (Stock: ${item.quantity})</option>`)
                    .join('');

        // Restore the selected value if it still exists in the options
        if (currentValue) {
            select.value = currentValue;
        }
    });
};

window.addSaleItem = async () => {
    saleItemCounter++;
    const saleItems = document.getElementById('saleItems');
    const newItem = document.createElement('div');
    newItem.className = 'sale-item';
    newItem.innerHTML = `
        <select class="item-select" onchange="updateSaleItemPrice(${saleItemCounter})" required></select>
        <input type="number" class="item-quantity" placeholder="Qty" min="1" value="1" onchange="calculateSaleTotal()" required>
        <input type="number" class="item-price" placeholder="Price" step="0.01" min="0" onchange="calculateSaleTotal()" data-system-price="0">
        <span class="item-subtotal">$0.00</span>
        <button type="button" onclick="removeSaleItem(${saleItemCounter})" class="btn-remove">×</button>
    `;
    newItem.dataset.index = saleItemCounter;
    saleItems.appendChild(newItem);

    await updateSaleItemSelects();
};

window.removeSaleItem = (index) => {
    const item = document.querySelector(`.sale-item[data-index="${index}"]`);
    if (item && document.querySelectorAll('.sale-item').length > 1) {
        item.remove();
        calculateSaleTotal();
    }
};

const updateSaleItemPrice = async (index) => {
    const saleItem = document.querySelector(`.sale-item[data-index="${index}"]`) ||
                     document.querySelectorAll('.sale-item')[index];
    const select = saleItem.querySelector('.item-select');
    const priceInput = saleItem.querySelector('.item-price');

    if (select.value) {
        const item = await apiRequest(`/inventory/${select.value}`);
        const systemPrice = Number.parseFloat(item.price || 0);
        priceInput.value = systemPrice.toFixed(2);
        // Store the system price as a data attribute for discount calculation
        priceInput.setAttribute('data-system-price', systemPrice);
    } else {
        priceInput.value = '';
        priceInput.setAttribute('data-system-price', '0');
    }

    calculateSaleTotal();
};

window.calculateSaleTotal = () => {
    let total = 0;
    let totalDiscount = 0;
    document.querySelectorAll('.sale-item').forEach(item => {
        const qty = Number.parseFloat(item.querySelector('.item-quantity').value) || 0;
        const actualPrice = Number.parseFloat(item.querySelector('.item-price').value) || 0;
        const systemPrice = Number.parseFloat(item.querySelector('.item-price').getAttribute('data-system-price')) || 0;

        const subtotal = qty * actualPrice;
        const itemDiscount = (systemPrice - actualPrice) * qty;

        item.querySelector('.item-subtotal').textContent = formatUGX(subtotal);
        total += subtotal;
        totalDiscount += itemDiscount;
    });

    document.getElementById('saleTotal').textContent = total.toLocaleString('en-UG');

    // Display total discount if there's a discount element
    const discountElement = document.getElementById('saleDiscount');
    if (discountElement && totalDiscount > 0) {
        discountElement.textContent = `Discount: ${formatUGX(totalDiscount)}`;
        discountElement.style.display = 'block';
    } else if (discountElement) {
        discountElement.style.display = 'none';
    }
};

window.saveSale = async (event) => {
    event.preventDefault();

    try {
        const selectedCustomerId = document.getElementById('selectedCustomerId').value;
        const manualCustomerName = document.getElementById('manualCustomerName').value.trim();
        const paymentMethod = document.getElementById('salePaymentMethod').value;

        let customerId = null;
        let customerName = '';
        let isManualCustomer = false;

        // Check if an existing customer was selected from autocomplete
        if (selectedCustomerId) {
            customerId = Number.parseInt(selectedCustomerId, 10);

            // Validate parsed customer ID
            if (Number.isNaN(customerId)) {
                alert('Invalid customer selection. Please try again.');
                return;
            }

            const customer = await apiRequest(`/customers/${customerId}`);
            customerName = customer.name;
            isManualCustomer = false;
        } else if (manualCustomerName) {
            // Manual customer name entered (new customer)
            customerId = 0;
            customerName = manualCustomerName;
            isManualCustomer = true;
        } else {
            // No customer name provided - use default Walk-in Customer
            customerId = 0;
            customerName = 'Walk-in Customer';
            isManualCustomer = true;
        }

        const items = [];
        const saleItems = document.querySelectorAll('.sale-item');

        // Validate we have items
        if (saleItems.length === 0) {
            alert('Please add at least one item to the sale');
            return;
        }

        for (const item of saleItems) {
            const itemId = Number.parseInt(item.querySelector('.item-select', 10).value);
            const quantity = Number.parseInt(item.querySelector('.item-quantity', 10).value);
            const price = Number.parseFloat(item.querySelector('.item-price').value);

            // Validate parsed values
            if (Number.isNaN(itemId) || itemId <= 0) {
                alert('Please select a valid item');
                return;
            }
            if (Number.isNaN(quantity) || quantity <= 0) {
                alert('Please enter a valid quantity (must be greater than 0)');
                return;
            }
            if (Number.isNaN(price) || price <= 0) {
                alert('Please enter a valid price (must be greater than 0)');
                return;
            }

            if (itemId && quantity && price) {
                const inventoryItem = await apiRequest(`/inventory/${itemId}`);

                // Backend will validate stock and update inventory within a transaction
                items.push({
                    itemId,
                    name: inventoryItem.name,
                    sku: inventoryItem.sku,
                    quantity,
                    price,
                    subtotal: quantity * price
                });
            }
        }

        // Validate we processed at least one item
        if (items.length === 0) {
            alert('Please add valid items to the sale');
            return;
        }

        const total = items.reduce((sum, item) => sum + item.subtotal, 0);

        // Validate total is not NaN
        if (Number.isNaN(total) || total <= 0) {
            alert('Invalid sale total. Please check your items.');
            return;
        }

        // Invoice number will be generated on the backend to prevent race conditions
        const saleData = {
            date: new Date().toISOString().split('T')[0],
            customer_id: customerId,
            customer_name: customerName,
            seller_id: currentUser.id,
            seller_name: currentUser.name,
            items,
            total,
            payment_method: paymentMethod,
            status: 'completed'
        };

        // Backend will generate the invoice number and return it
        const result = await apiRequest('/sales', 'POST', saleData);
        const invoiceNumber = result.invoiceNumber;

        // Update customer only if it's an existing customer (not manual)
        if (!isManualCustomer && customerId > 0) {
            try {
                const customer = await apiRequest(`/customers/${customerId}`);
                // Handle PostgreSQL lowercase column names
                const currentPurchases = customer.totalpurchases || customer.totalPurchases || 0;
                const currentValue = Number.parseFloat(customer.lifetimevalue || customer.lifetimeValue || 0);

                const updatedCustomer = {
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone || '',
                    address: customer.address || '',
                    total_purchases: currentPurchases + 1,
                    lifetime_value: currentValue + total,
                    last_purchase: saleData.date
                };
                await apiRequest(`/customers/${customerId}`, 'PUT', updatedCustomer);
            } catch (error) {
                // Log error but don't fail the sale
                console.error('Failed to update customer stats:', error);
                alert('Sale completed, but customer stats update failed. Please update manually if needed.');
            }
        }

        closeModal();
        await loadSales();
        await loadDashboard();

        // Show receipt option
        if (confirm(`Sale completed! Sales Receipt: ${invoiceNumber}\n\nDo you want to print a receipt?`)) {
            printReceipt(await apiRequest(`/sales/${result.id}`));
        }
    } catch (error) {
        console.error('Error saving sale:', error);
        alert(`Failed to complete sale: ${error.message}`);
    }
};

const viewSaleDetails = async (id) => {
    const sale = await apiRequest(`/sales/${id}`);
    const details = `
Sales Receipt: ${sale.invoice_number}
Date: ${sale.date}
Customer: ${sale.customer_name}
Payment: ${sale.payment_method}

Items:
${sale.items.map(item => `${item.name} x${item.quantity} @ ${formatUGX(item.price)} = ${formatUGX(item.subtotal)}`).join('\n')}

Total: ${formatUGX(sale.total)}
    `;
    alert(details);
};

const printSaleReceipt = async (id) => {
    const sale = await apiRequest(`/sales/${id}`);
    printReceipt(sale);
};

window.filterSales = () => {
    const searchTerm = document.getElementById('salesSearch').value.toLowerCase();

    // Use cached salesData with null-safe filtering - handle PostgreSQL lowercase column names
    const filtered = salesData.filter(sale => {
        const invoiceNumber = (sale.invoice_number || '').toLowerCase();
        const customerName = (sale.customer_name || '').toLowerCase();
        return invoiceNumber.includes(searchTerm) || customerName.includes(searchTerm);
    });

    const tbody = document.getElementById('salesTableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No sales match your search</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(sale => {
        const invoiceNumber = sale.invoicenumber || sale.invoiceNumber;
        const customerName = sale.customername || sale.customerName;
        const sellerName = sale.sellername || sale.sellerName || 'N/A';
        const paymentMethod = sale.paymentmethod || sale.paymentMethod;
        const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
        const totalDiscount = Number.parseFloat(sale.totaldiscount || sale.totalDiscount || 0);

        return `
            <tr>
                <td>${invoiceNumber}</td>
                <td>${sale.date}</td>
                <td>${customerName}</td>
                <td>${sellerName}</td>
                <td>${items.length} items</td>
                <td>${formatUGX(sale.total)}</td>
                <td>${formatUGX(totalDiscount)}</td>
                <td>${formatUGX(sale.profit || 0)}</td>
                <td>${paymentMethod}</td>
                <td><span class="status-badge completed">Completed</span></td>
                <td class="action-buttons">
                    <button class="btn-info" onclick="viewSaleDetails(${sale.id})">View</button>
                    <button class="btn-success" onclick="printSaleReceipt(${sale.id})">Print</button>
                </td>
            </tr>
        `;
    }).join('');
};

// Returns functions
let returnsData = [];

const loadReturns = async (page = 1) => {
    try {
        paginationState.returns.page = page;
        const response = await apiRequest(`/returns?page=${page}&limit=${paginationState.returns.limit}`);

        // Handle paginated response
        if (response.data && response.pagination) {
            returnsData = response.data;
            paginationState.returns = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            returnsData = response;
        }

        renderReturnsTable(returnsData);
        renderPaginationControls('returns');
    } catch (error) {
        console.error('Error loading returns:', error);
        alert(`Failed to load returns: ${error.message}`);
    }
};

const renderReturnsTable = (returns) => {
    const tbody = document.getElementById('returnsTableBody');

    if (returns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No returns recorded.</td></tr>';
        return;
    }

    // Sort returns by ID in descending order (newest first)
    const sortedReturns = [...returns].sort((a, b) => b.id - a.id);

    tbody.innerHTML = sortedReturns.map(ret => {
        const isAdmin = currentUser.role === 'admin';
        // Handle PostgreSQL lowercase column names
        const invoiceNumber = ret.invoice_number;
        const customerName = ret.customer_name;

        const actions = ret.status === 'pending' && isAdmin ? `
            <button class="btn-success" onclick="approveReturn(${ret.id})">Approve</button>
            <button class="btn-danger" onclick="rejectReturn(${ret.id})">Reject</button>
        ` : `<button class="btn-info" onclick="viewReturnDetails(${ret.id})">View</button>`;

        return `
            <tr>
                <td>RET-${String(ret.id).padStart(5, '0')}</td>
                <td>${invoiceNumber}</td>
                <td>${ret.date}</td>
                <td>${customerName}</td>
                <td>${formatUGX(ret.amount)}</td>
                <td>${ret.reason}</td>
                <td><span class="status-badge ${ret.status}">${ret.status.toUpperCase()}</span></td>
                <td class="action-buttons">${actions}</td>
            </tr>
        `;
    }).join('');
};

window.showNewReturnModal = async () => {
    document.getElementById('returnForm').reset();
    document.getElementById('invoiceDetails').style.display = 'none';

    const salesResponse = await apiRequest('/sales');
    const sales = salesResponse.data || salesResponse;
    const invoiceSelect = document.getElementById('returnInvoice');
    invoiceSelect.innerHTML = '<option value="">Select Sales Receipt</option>' +
        sales.map(s => {
            // Handle PostgreSQL lowercase column names
            const invoiceNumber = s.invoice_number;
            const customerName = s.customer_name;
            return `<option value="${s.id}">${invoiceNumber} - ${customerName} (${formatUGX(s.total)})</option>`;
        }).join('');

    openModal('returnModal');
};

window.loadInvoiceDetails = async () => {
    const invoiceId = Number.parseInt(document.getElementById('returnInvoice', 10).value);

    if (invoiceId) {
        const sale = await apiRequest(`/sales/${invoiceId}`);
        // Handle PostgreSQL lowercase column names
        const customerName = sale.customer_name;
        document.getElementById('returnCustomerName').textContent = customerName;
        document.getElementById('returnInvoiceDate').textContent = sale.date;
        document.getElementById('returnInvoiceTotal').textContent = sale.total.toLocaleString('en-UG');

        // Parse items if stored as string
        const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;

        // Display items as checkboxes with quantity inputs
        const itemsList = document.getElementById('returnItemsList');
        itemsList.innerHTML = items.map((item, index) => `
            <div style="margin-bottom: 10px; padding: 8px; background: white; border-radius: 3px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox"
                           class="return-item-checkbox"
                           data-index="${index}"
                           data-unit-price="${item.price}"
                           data-max-qty="${item.quantity}"
                           onchange="toggleReturnItem(${index})"
                           style="width: 18px; height: 18px;">
                    <div style="flex: 1;">
                        <strong>${item.name}</strong> (${item.sku})
                        <br>
                        <small>Purchased: ${item.quantity} × ${formatUGX(item.price)} = ${formatUGX(item.subtotal)}</small>
                    </div>
                    <div>
                        <label style="font-size: 12px; margin-right: 5px;">Return Qty:</label>
                        <input type="number"
                               class="return-qty-input"
                               id="returnQty${index}"
                               data-index="${index}"
                               min="1"
                               max="${item.quantity}"
                               value="${item.quantity}"
                               disabled
                               onchange="calculateReturnAmount()"
                               style="width: 60px; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('returnAmount').value = 0;
        document.getElementById('invoiceDetails').style.display = 'block';
    } else {
        document.getElementById('invoiceDetails').style.display = 'none';
    }
};

const toggleReturnItem = (index) => {
    const checkbox = document.querySelector(`.return-item-checkbox[data-index="${index}"]`);
    const qtyInput = document.getElementById(`returnQty${index}`);

    if (checkbox.checked) {
        qtyInput.disabled = false;
    } else {
        qtyInput.disabled = true;
    }

    calculateReturnAmount();
};

const calculateReturnAmount = () => {
    const checkboxes = document.querySelectorAll('.return-item-checkbox:checked');
    let total = 0;

    checkboxes.forEach(checkbox => {
        const index = checkbox.dataset.index;
        const unitPrice = Number.parseFloat(checkbox.dataset.unitPrice);
        const qtyInput = document.getElementById(`returnQty${index}`);
        const returnQty = Number.parseInt(qtyInput.value, 10) || 0;

        total += unitPrice * returnQty;
    });

    document.getElementById('returnAmount').value = total;
};

window.saveReturn = async (event) => {
    event.preventDefault();

    try {
        const invoiceId = Number.parseInt(document.getElementById('returnInvoice', 10).value);
        const sale = await apiRequest(`/sales/${invoiceId}`);
        const amount = Number.parseFloat(document.getElementById('returnAmount').value);
        const reason = document.getElementById('returnReason').value;

        // Get selected items only
        const checkboxes = document.querySelectorAll('.return-item-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Please select at least one item to return');
            return;
        }

        // Parse items if stored as string
        const allItems = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;

        // Filter to only selected items with specified quantities
        const selectedItems = [];
        let hasInvalidQuantity = false;
        checkboxes.forEach(checkbox => {
            const index = Number.parseInt(checkbox.dataset.index, 10);
            const originalItem = allItems[index];
            const qtyInput = document.getElementById(`returnQty${index}`);
            const returnQty = Number.parseInt(qtyInput.value, 10) || 0;

            // Validate return quantity
            if (returnQty <= 0 || returnQty > originalItem.quantity) {
                alert(`Invalid return quantity for ${originalItem.name}. Must be between 1 and ${originalItem.quantity}`);
                hasInvalidQuantity = true;
                return;
            }

            // Create return item with specified quantity
            selectedItems.push({
                ...originalItem,
                quantity: returnQty,
                subtotal: returnQty * originalItem.price
            });
        });

        if (hasInvalidQuantity) {
            return;
        }

        const returnData = {
            invoice_number: sale.invoice_number,
            invoice_id: invoiceId,
            date: new Date().toISOString().split('T')[0],
            customer_name: sale.customer_name,
            customer_id: sale.customer_id || 1, // Default to 1 if 0 (walk-in customer)
            amount,
            reason,
            status: 'pending',
            items: selectedItems
        };

        await apiRequest('/returns', 'POST', returnData);

        closeModal();
        await loadReturns();
        await loadDashboard();

        alert('Return submitted for admin approval');
    } catch (error) {
        console.error('Error saving return:', error);
        alert(`Failed to save return: ${error.message || 'Please try again.'}`);
    }
};

const approveReturn = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to approve returns.');
        return;
    }
    if (!confirm('Approve this return?')) return;

    try {
        const returnData = await apiRequest(`/returns/${id}`);
        console.log('Return data:', returnData);

        // Parse items if they're stored as JSON string
        const items = typeof returnData.items === 'string' ? JSON.parse(returnData.items) : returnData.items;
        console.log('Parsed items:', items);

        // Add items to returned items inventory instead of main inventory
        for (const item of items) {
            console.log('Processing item:', item);

            // Get inventory item details for category info
            let category = '';
            if (item.itemId) {
                const inventoryItem = await apiRequest(`/inventory/${item.itemId}`);
                if (inventoryItem) {
                    category = inventoryItem.category;
                }
            }

            // Add to returned items inventory
            const returnedItem = {
                return_id: id,
                sku: item.sku || 'N/A',
                name: item.name,
                category: category,
                quantity: item.quantity,
                original_price: item.price,
                condition: 'returned',
                return_date: returnData.date,
                customer_name: returnData.customer_name,
                return_reason: returnData.reason
            };

            await apiRequest('/returned-items', 'POST', returnedItem);
        }

        // Note: Customer lifetime_value is updated automatically by the backend
        // when the return status is changed to 'approved' in the transaction

        // Update return status
        await apiRequest(`/returns/${id}`, 'PUT', {
            status: 'approved',
            approved_by: currentUser.name,
            approved_date: new Date().toISOString().split('T')[0],
            rejected_by: null,
            rejected_date: null,
            rejection_reason: null
        });

        await loadReturns();
        await loadDashboard();

        alert('Return approved and items added to Returned Items Inventory');
    } catch (error) {
        console.error('Error approving return:', error);
        alert(`Error approving return: ${error.message || 'Please try again.'}`);
    }
};

const rejectReturn = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to reject returns.');
        return;
    }
    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
        await apiRequest(`/returns/${id}`, 'PUT', {
            status: 'rejected',
            approved_by: null,
            approved_date: null,
            rejected_by: currentUser.name,
            rejected_date: new Date().toISOString().split('T')[0],
            rejection_reason: reason
        });

        await loadReturns();
        await loadDashboard();

        alert('Return rejected');
    } catch (error) {
        console.error('Error rejecting return:', error);
        alert(`Failed to reject return: ${error.message || 'Please try again.'}`);
    }
};

const viewReturnDetails = async (id) => {
    const ret = await apiRequest(`/returns/${id}`);
    let details = `
Return ID: RET-${String(ret.id).padStart(5, '0')}
Sales Receipt: ${ret.invoice_number}
Date: ${ret.date}
Customer: ${ret.customer_name}
Amount: ${formatUGX(ret.amount)}
Reason: ${ret.reason}
Status: ${ret.status.toUpperCase()}
    `;

    if (ret.status === 'approved') {
        details += `\nApproved by: ${ret.approved_by}\nApproved on: ${ret.approved_date}`;
    } else if (ret.status === 'rejected') {
        details += `\nRejected by: ${ret.rejected_by}\nRejected on: ${ret.rejected_date}\nReason: ${ret.rejection_reason}`;
    }

    alert(details);
};

window.filterReturns = () => {
    const searchTerm = document.getElementById('returnsSearch').value.toLowerCase();

    // Use cached returnsData with null-safe filtering - handle PostgreSQL lowercase column names
    const filtered = returnsData.filter(ret => {
        const invoiceNumber = (ret.invoice_number || '').toLowerCase();
        const customerName = (ret.customer_name || '').toLowerCase();
        return invoiceNumber.includes(searchTerm) || customerName.includes(searchTerm);
    });

    renderReturnsTable(filtered);
};

// Customer functions
let customersData = [];

const loadCustomers = async (page = 1) => {
    try {
        paginationState.customers.page = page;
        const response = await apiRequest(`/customers?page=${page}&limit=${paginationState.customers.limit}`);

        // Handle paginated response
        if (response.data && response.pagination) {
            customersData = response.data;
            paginationState.customers = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            customersData = response;
        }

        renderCustomersTable(customersData);
        renderPaginationControls('customers');
    } catch (error) {
        console.error('Error loading customers:', error);
        alert(`Failed to load customers: ${error.message}`);
    }
};

const renderCustomersTable = (customers) => {
    const tbody = document.getElementById('customersTableBody');

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No customers yet. Add your first customer!</td></tr>';
        return;
    }

    const isAdmin = currentUser.role === 'admin';
    tbody.innerHTML = customers.map(customer => `
        <tr>
            <td>CUST-${String(customer.id).padStart(5, '0')}</td>
            <td>${customer.name}</td>
            <td>${customer.email}</td>
            <td>${customer.phone}</td>
            <td>${formatUGX(customer.lifetimevalue || customer.lifetimeValue || 0)}</td>
            <td>${customer.lastpurchase || customer.lastPurchase || 'Never'}</td>
            <td class="action-buttons">
                <button class="btn-info" onclick="editCustomer(${customer.id})">Edit</button>
                ${isAdmin ? `<button class="btn-danger" onclick="deleteCustomer(${customer.id})">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
};

window.showAddCustomerModal = () => {
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('customerForm').reset();
    document.getElementById('editCustomerId').value = '';
    openModal('customerModal');
};

const editCustomer = async (id) => {
    try {
        const customer = await apiRequest(`/customers/${id}`);
        document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        document.getElementById('editCustomerId').value = id;
        document.getElementById('customerName').value = customer.name;
        document.getElementById('customerEmail').value = customer.email;
        document.getElementById('customerPhone').value = customer.phone;
        document.getElementById('customerAddress').value = customer.address || '';
        openModal('customerModal');
    } catch (error) {
        console.error('Error loading customer:', error);
        alert(`Failed to load customer for editing: ${error.message}`);
    }
};

window.saveCustomer = async (event) => {
    event.preventDefault();

    const customerData = {
        name: document.getElementById('customerName').value,
        email: document.getElementById('customerEmail').value,
        phone: document.getElementById('customerPhone').value,
        address: document.getElementById('customerAddress').value,
        totalPurchases: 0,
        lifetimeValue: 0,
        lastPurchase: null
    };

    const editId = document.getElementById('editCustomerId').value;

    if (editId) {
        const existing = await apiRequest(`/customers/${editId}`);
        // Handle PostgreSQL lowercase column names
        customerData.totalPurchases = existing.totalpurchases || existing.totalPurchases || 0;
        customerData.lifetimeValue = existing.lifetimevalue || existing.lifetimeValue || 0;
        customerData.lastPurchase = existing.lastpurchase || existing.lastPurchase || null;
        await apiRequest(`/customers/${editId}`, 'PUT', customerData);
    } else {
        await apiRequest('/customers', 'POST', customerData);
    }

    closeModal();
    await loadCustomers();
};

const deleteCustomer = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to delete customers.');
        return;
    }
    if (confirm('Are you sure you want to delete this customer?')) {
        try {
            await apiRequest(`/customers/${id}`, 'DELETE');
            await loadCustomers();
        } catch (error) {
            console.error('Error deleting customer:', error);
            alert(`Failed to delete customer: ${error.message}`);
        }
    }
};

window.filterCustomers = () => {
    const searchTerm = document.getElementById('customersSearch').value.toLowerCase();

    // Use cached customersData with null-safe filtering
    const filtered = customersData.filter(customer =>
        (customer.name && customer.name.toLowerCase().includes(searchTerm)) ||
        (customer.email && customer.email.toLowerCase().includes(searchTerm)) ||
        (customer.phone && customer.phone.includes(searchTerm))
    );

    renderCustomersTable(filtered);
};

// Supplier functions
let suppliersData = [];

const loadSuppliers = async (page = 1) => {
    try {
        paginationState.suppliers.page = page;
        const response = await apiRequest(`/suppliers?page=${page}&limit=${paginationState.suppliers.limit}`);

        // Handle paginated response
        if (response.data && response.pagination) {
            suppliersData = response.data;
            paginationState.suppliers = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            suppliersData = response;
        }

        renderSuppliersTable(suppliersData);
        renderPaginationControls('suppliers');
    } catch (error) {
        console.error('Error loading suppliers:', error);
        alert(`Failed to load suppliers: ${error.message}`);
    }
};

const renderSuppliersTable = (suppliers) => {
    const tbody = document.getElementById('suppliersTableBody');

    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No suppliers yet. Add your first supplier!</td></tr>';
        return;
    }

    const isAdmin = currentUser.role === 'admin';
    tbody.innerHTML = suppliers.map(supplier => `
        <tr>
            <td>SUP-${String(supplier.id).padStart(5, '0')}</td>
            <td>${supplier.company}</td>
            <td>${supplier.contact}</td>
            <td>${supplier.email}</td>
            <td>${supplier.phone}</td>
            <td>${supplier.terms}</td>
            <td>${supplier.categories || 'N/A'}</td>
            <td>${supplier.products}</td>
            <td class="action-buttons">
                <button class="btn-info" onclick="editSupplier(${supplier.id})">Edit</button>
                ${isAdmin ? `<button class="btn-danger" onclick="deleteSupplier(${supplier.id})">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
};

window.showAddSupplierModal = () => {
    document.getElementById('supplierModalTitle').textContent = 'Add New Supplier';
    document.getElementById('supplierForm').reset();
    document.getElementById('editSupplierId').value = '';
    openModal('supplierModal');
};

const editSupplier = async (id) => {
    try {
        const supplier = await apiRequest(`/suppliers/${id}`);
        document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
        document.getElementById('editSupplierId').value = id;
        document.getElementById('supplierCompany').value = supplier.company;
        document.getElementById('supplierContact').value = supplier.contact;
        document.getElementById('supplierEmail').value = supplier.email;
        document.getElementById('supplierPhone').value = supplier.phone;
        document.getElementById('supplierTerms').value = supplier.terms;
        document.getElementById('supplierCategories').value = supplier.categories || '';
        document.getElementById('supplierProducts').value = supplier.products;
        openModal('supplierModal');
    } catch (error) {
        console.error('Error loading supplier:', error);
        alert(`Failed to load supplier for editing: ${error.message}`);
    }
};

window.saveSupplier = async (event) => {
    event.preventDefault();

    const supplierData = {
        company: document.getElementById('supplierCompany').value,
        contact: document.getElementById('supplierContact').value,
        email: document.getElementById('supplierEmail').value,
        phone: document.getElementById('supplierPhone').value,
        terms: document.getElementById('supplierTerms').value,
        categories: document.getElementById('supplierCategories').value,
        products: document.getElementById('supplierProducts').value
    };

    const editId = document.getElementById('editSupplierId').value;

    if (editId) {
        await apiRequest(`/suppliers/${editId}`, 'PUT', supplierData);
    } else {
        await apiRequest('/suppliers', 'POST', supplierData);
    }

    closeModal();
    await loadSuppliers();
};

const deleteSupplier = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to delete suppliers.');
        return;
    }
    if (confirm('Are you sure you want to delete this supplier?')) {
        try {
            await apiRequest(`/suppliers/${id}`, 'DELETE');
            await loadSuppliers();
        } catch (error) {
            console.error('Error deleting supplier:', error);
            alert(`Failed to delete supplier: ${error.message}`);
        }
    }
};

window.filterSuppliers = () => {
    const searchTerm = document.getElementById('suppliersSearch').value.toLowerCase();

    // Use cached suppliersData with null-safe filtering
    const filtered = suppliersData.filter(supplier =>
        (supplier.company && supplier.company.toLowerCase().includes(searchTerm)) ||
        (supplier.contact && supplier.contact.toLowerCase().includes(searchTerm)) ||
        (supplier.email && supplier.email.toLowerCase().includes(searchTerm))
    );

    renderSuppliersTable(filtered);
};

// User management functions
let usersData = [];

const loadUsers = async (page = 1) => {
    try {
        paginationState.users.page = page;
        const response = await apiRequest(`/users?page=${page}&limit=${paginationState.users.limit}`);

        // Handle paginated response
        if (response.data && response.pagination) {
            usersData = response.data;
            paginationState.users = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            usersData = response;
        }

        renderUsersTable(usersData);
        renderPaginationControls('users');
    } catch (error) {
        console.error('Error loading users:', error);
        alert(`Failed to load users: ${error.message}`);
    }
};

const renderUsersTable = (users) => {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users yet. Add your first user!</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>USER-${String(user.id).padStart(5, '0')}</td>
            <td>${user.username}</td>
            <td>${user.name}</td>
            <td>${user.email || ''}</td>
            <td><span class="status-badge ${user.role === 'admin' ? 'completed' : 'pending'}">${user.role.toUpperCase()}</span></td>
            <td class="action-buttons">
                <button class="btn-info" onclick="editUser(${user.id})">Edit</button>
                ${user.id !== currentUser.id ? `<button class="btn-danger" onclick="deleteUser(${user.id})">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
};

window.showAddUserModal = () => {
    document.getElementById('userModalTitle').textContent = 'Add New User';
    document.getElementById('userForm').reset();
    document.getElementById('editUserId').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('userPassword').placeholder = 'Password';
    openModal('userModal');
};

const editUser = async (id) => {
    try {
        const user = await apiRequest(`/users/${id}`);
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('editUserId').value = id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userName').value = user.name;
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('userRole').value = user.role;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').required = false;
        document.getElementById('userPassword').placeholder = 'Leave blank to keep current password';
        openModal('userModal');
    } catch (error) {
        console.error('Error loading user:', error);
        alert(`Failed to load user for editing: ${error.message}`);
    }
};

window.saveUser = async (event) => {
    event.preventDefault();

    const userData = {
        username: document.getElementById('userUsername').value,
        name: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        role: document.getElementById('userRole').value
    };

    const password = document.getElementById('userPassword').value;
    if (password) {
        userData.password = password;
    }

    const editId = document.getElementById('editUserId').value;

    if (editId) {
        await apiRequest(`/users/${editId}`, 'PUT', userData);
    } else {
        if (!password) {
            alert('Password is required for new users');
            return;
        }
        await apiRequest('/users', 'POST', userData);
    }

    closeModal();
    await loadUsers();
};

const deleteUser = async (id) => {
    if (id === currentUser.id) {
        alert('You cannot delete your own account!');
        return;
    }
    if (confirm('Are you sure you want to delete this user?')) {
        try {
            await apiRequest(`/users/${id}`, 'DELETE');
            await loadUsers();
        } catch (error) {
            console.error('Error deleting user:', error);
            alert(`Failed to delete user: ${error.message}`);
        }
    }
};

window.filterUsers = () => {
    const searchTerm = document.getElementById('usersSearch').value.toLowerCase();

    // Use cached usersData with null-safe filtering
    const filtered = usersData.filter(user =>
        (user.username && user.username.toLowerCase().includes(searchTerm)) ||
        (user.name && user.name.toLowerCase().includes(searchTerm)) ||
        (user.role && user.role.toLowerCase().includes(searchTerm))
    );

    renderUsersTable(filtered);
};

// Returned Items Inventory functions
let returnedItemsData = [];

const loadReturnedItems = async (page = 1) => {
    try {
        paginationState.returnedItems.page = page;
        const response = await apiRequest(`/returned-items?page=${page}&limit=${paginationState.returnedItems.limit}`);

        let returnedItems;

        // Handle paginated response
        if (response.data && response.pagination) {
            returnedItems = response.data;
            paginationState.returnedItems = {
                page: response.pagination.page,
                limit: response.pagination.limit,
                total: response.pagination.total,
                totalPages: response.pagination.totalPages
            };
        } else {
            // Fallback for non-paginated response
            returnedItems = response;
        }

        // Cache the data for filtering
        returnedItemsData = returnedItems;

        const tbody = document.getElementById('returnedItemsTableBody');

        if (returnedItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No returned items yet.</td></tr>';
            return;
        }

        tbody.innerHTML = returnedItems.map(item => `
            <tr>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category || '-'}</td>
                <td>${item.quantity}</td>
                <td>${formatUGX(item.original_price)}</td>
                <td><span class="status-badge ${item.condition === 'good' ? 'completed' : 'pending'}">${item.condition.toUpperCase()}</span></td>
                <td>${item.return_date}</td>
                <td>${item.customer_name || '-'}</td>
                <td>${item.return_reason || '-'}</td>
                <td class="action-buttons">
                    <button class="btn-info" onclick="viewReturnedItemDetails(${item.id})">View</button>
                    <button class="btn-danger" onclick="deleteReturnedItem(${item.id})">Delete</button>
                </td>
            </tr>
        `).join('');

        renderPaginationControls('returnedItems');
    } catch (error) {
        console.error('Error loading returned items:', error);
        alert(`Failed to load returned items: ${error.message}`);
    }
};

window.filterReturnedItems = () => {
    const searchTerm = document.getElementById('returnedItemsSearch').value.toLowerCase();

    // Use cached data instead of refetching
    const filtered = returnedItemsData.filter(item =>
        item.sku.toLowerCase().includes(searchTerm) ||
        item.name.toLowerCase().includes(searchTerm) ||
        (item.category && item.category.toLowerCase().includes(searchTerm)) ||
        (item.customer_name && item.customer_name.toLowerCase().includes(searchTerm))
    );

    const tbody = document.getElementById('returnedItemsTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No matching returned items found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td>${item.sku}</td>
            <td>${item.name}</td>
            <td>${item.category || '-'}</td>
            <td>${item.quantity}</td>
            <td>${formatUGX(item.original_price)}</td>
            <td><span class="status-badge ${item.condition === 'good' ? 'completed' : 'pending'}">${item.condition.toUpperCase()}</span></td>
            <td>${item.return_date}</td>
            <td>${item.customer_name || '-'}</td>
            <td>${item.return_reason || '-'}</td>
            <td class="action-buttons">
                <button class="btn-info" onclick="viewReturnedItemDetails(${item.id})">View</button>
                <button class="btn-danger" onclick="deleteReturnedItem(${item.id})">Delete</button>
            </td>
        </tr>
    `).join('');
};

const viewReturnedItemDetails = async (id) => {
    const item = await apiRequest(`/returned-items/${id}`);
    const details = `
Returned Item ID: RET-${String(item.id).padStart(5, '0')}
SKU: ${item.sku}
Product: ${item.name}
Category: ${item.category || '-'}
Quantity: ${item.quantity}
Original Price: ${formatUGX(item.original_price)}
Condition: ${item.condition}
Return Date: ${item.return_date}
Customer: ${item.customer_name || '-'}
Reason: ${item.return_reason || '-'}
    `;
    alert(details);
};

const deleteReturnedItem = async (id) => {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required to delete returned items.');
        return;
    }
    if (confirm('Are you sure you want to delete this returned item?')) {
        await apiRequest(`/returned-items/${id}`, 'DELETE');
        await loadReturnedItems();
    }
};

// Pagination Controls
const renderPaginationControls = (module) => {
    const state = paginationState[module];
    const containerId = `${module}PaginationControls`;
    let container = document.getElementById(containerId);

    // Create container if it doesn't exist
    if (!container) {
        const tableContainer = document.querySelector(`#${module} .table-container`) ||
                              document.querySelector(`#${module}TableBody`)?.parentElement?.parentElement;
        if (!tableContainer) return;

        container = document.createElement('div');
        container.id = containerId;
        container.className = 'pagination-controls';
        tableContainer.parentElement.appendChild(container);
    }

    // Don't show pagination if there's only one page
    if (state.totalPages <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    // Generate pagination HTML
    const maxButtons = 7;
    let startPage = Math.max(1, state.page - Math.floor(maxButtons / 2));
    let endPage = Math.min(state.totalPages, startPage + maxButtons - 1);

    // Adjust if we're near the end
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    let paginationHTML = `
        <div class="pagination-info">
            Showing page ${state.page} of ${state.totalPages} (${state.total} total records)
        </div>
        <div class="pagination-buttons">
            <button
                class="btn-pagination"
                onclick="load${capitalize(module)}(1)"
                ${state.page === 1 ? 'disabled' : ''}
            >First</button>
            <button
                class="btn-pagination"
                onclick="load${capitalize(module)}(${state.page - 1})"
                ${state.page === 1 ? 'disabled' : ''}
            >Previous</button>
    `;

    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button
                class="btn-pagination ${i === state.page ? 'active' : ''}"
                onclick="load${capitalize(module)}(${i})"
            >${i}</button>
        `;
    }

    paginationHTML += `
            <button
                class="btn-pagination"
                onclick="load${capitalize(module)}(${state.page + 1})"
                ${state.page === state.totalPages ? 'disabled' : ''}
            >Next</button>
            <button
                class="btn-pagination"
                onclick="load${capitalize(module)}(${state.totalPages})"
                ${state.page === state.totalPages ? 'disabled' : ''}
            >Last</button>
        </div>
    `;

    container.innerHTML = paginationHTML;
};

// Helper function to capitalize first letter
const capitalize = (str) => {
    if (str === 'returnedItems') return 'ReturnedItems';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

// Modal management
const openModal = (modalId) => {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById(modalId).classList.add('active');
};

window.closeModal = () => {
    document.getElementById('modalOverlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
};

// Reports functions
window.showReportsModal = () => {
    document.getElementById('reportsForm').reset();
    document.getElementById('customDateRange').style.display = 'none';
    openModal('reportsModal');
};

const toggleCustomDates = () => {
    const dateRange = document.getElementById('dateRange').value;
    const customDiv = document.getElementById('customDateRange');
    customDiv.style.display = dateRange === 'custom' ? 'block' : 'none';
};

const getDateRange = () => {
    const range = document.getElementById('dateRange').value;
    let from, to;

    switch(range) {
        case 'today':
            const today = new Date();
            from = to = today.toISOString().split('T')[0];
            break;
        case 'week':
            const weekEnd = new Date();
            const weekStart = new Date();
            weekStart.setDate(weekEnd.getDate() - 7);
            from = weekStart.toISOString().split('T')[0];
            to = weekEnd.toISOString().split('T')[0];
            break;
        case 'month':
            const monthEnd = new Date();
            const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
            from = monthStart.toISOString().split('T')[0];
            to = monthEnd.toISOString().split('T')[0];
            break;
        case 'year':
            const yearEnd = new Date();
            const yearStart = new Date(yearEnd.getFullYear(), 0, 1);
            from = yearStart.toISOString().split('T')[0];
            to = yearEnd.toISOString().split('T')[0];
            break;
        case 'custom':
            from = document.getElementById('dateFrom').value;
            to = document.getElementById('dateTo').value;
            break;
    }
    return { from, to };
};

window.generateReport = async (event) => {
    event.preventDefault();

    const reportType = document.getElementById('reportType').value;
    const exportFormat = document.getElementById('exportFormat').value;
    const { from, to } = getDateRange();

    let data, reportTitle;
    const isAdmin = currentUser.role === 'admin';

    switch(reportType) {
        case 'sales':
            // Regular users can only see their own sales
            const salesEndpoint = isAdmin ? '/sales' : `/sales?userId=${currentUser.id}&userRole=${currentUser.role}`;
            const salesResponse = await apiRequest(salesEndpoint);
            const sales = salesResponse.data || salesResponse; // Handle paginated response
            data = sales.filter(s => s.date >= from && s.date <= to);
            reportTitle = isAdmin ? 'Sales Report' : 'My Sales Report';
            break;
        case 'inventory':
            // Only admins can generate inventory reports (already restricted in UI)
            if (!isAdmin) {
                alert('You do not have permission to generate inventory reports');
                return;
            }
            const inventoryResponse = await apiRequest('/inventory');
            data = inventoryResponse.data || inventoryResponse; // Handle paginated response
            reportTitle = 'Inventory Report';
            break;
        case 'customers':
            const customersResponse = await apiRequest('/customers');
            data = customersResponse.data || customersResponse; // Handle paginated response
            reportTitle = 'Customer Report';
            break;
        case 'returns':
            const returnsResponse = await apiRequest('/returns');
            const returns = returnsResponse.data || returnsResponse; // Handle paginated response
            // Filter returns based on user's sales if not admin
            if (!isAdmin) {
                const userSalesResponse = await apiRequest(`/sales?userId=${currentUser.id}&userRole=${currentUser.role}`);
                const userSales = userSalesResponse.data || userSalesResponse; // Handle paginated response
                const userInvoiceNumbers = userSales.map(s => s.invoice_number);
                data = returns.filter(r => r.date >= from && r.date <= to && userInvoiceNumbers.includes(r.invoice_number));
            } else {
                data = returns.filter(r => r.date >= from && r.date <= to);
            }
            reportTitle = isAdmin ? 'Returns Report' : 'My Returns Report';
            break;
    }

    if (exportFormat === 'excel') {
        exportToCSV(data, reportType, reportTitle, from, to);
    } else if (exportFormat === 'pdf' || exportFormat === 'print') {
        generatePDFReport(data, reportType, reportTitle, from, to, exportFormat === 'print');
    }

    closeModal();
};

const exportToCSV = (data, type, title, from, to) => {
    let csv = '';
    let headers = [];

    if (type === 'sales') {
        headers = ['Sales Receipt', 'Date', 'Customer', 'Staff', 'Items', 'Total (UGX)', 'Discount (UGX)', 'Profit (UGX)', 'Payment Method'];
        csv = headers.join(',') + '\n';
        data.forEach(sale => {
            const invoiceNumber = sale.invoice_number;
            const customerName = sale.customer_name;
            const sellerName = sale.seller_name || 'N/A';
            const paymentMethod = sale.payment_method;
            const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
            const totalDiscount = Number.parseFloat(sale.total_discount || 0);
            const profit = Number.parseFloat(sale.profit || 0);
            csv += `${invoiceNumber},${sale.date},${customerName},${sellerName},${items.length},${sale.total},${totalDiscount},${profit},${paymentMethod}\n`;
        });
    } else if (type === 'inventory') {
        headers = ['SKU', 'Product Name', 'Category', 'Quantity', 'Unit Price (UGX)', 'Total Value (UGX)', 'Reorder Level', 'Supplier'];
        csv = headers.join(',') + '\n';
        data.forEach(item => {
            const reorderLevel = item.reorder_level || item.reorderLevel;
            const totalValue = item.quantity * item.price;
            csv += `${item.sku},${item.name},${item.category},${item.quantity},${item.price},${totalValue},${reorderLevel},${item.supplier}\n`;
        });
    } else if (type === 'customers') {
        headers = ['ID', 'Name', 'Email', 'Phone', 'Lifetime Value (UGX)', 'Last Purchase'];
        csv = headers.join(',') + '\n';
        data.forEach(customer => {
            const lifetimeValue = customer.lifetime_value || 0;
            const lastPurchase = customer.last_purchase || 'Never';
            csv += `CUST-${String(customer.id).padStart(5, '0')},${customer.name},${customer.email},${customer.phone},${lifetimeValue},${lastPurchase}\n`;
        });
    } else if (type === 'returns') {
        headers = ['Return ID', 'Sales Receipt', 'Date', 'Customer', 'Amount (UGX)', 'Reason', 'Status'];
        csv = headers.join(',') + '\n';
        data.forEach(ret => {
            const invoiceNumber = ret.invoice_number;
            const customerName = ret.customer_name;
            csv += `RET-${String(ret.id).padStart(5, '0')},${invoiceNumber},${ret.date},${customerName},${ret.amount},"${ret.reason}",${ret.status}\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replaceAll(/ /g, '_')}_${from}_to_${to}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
};

const generatePDFReport = (data, type, title, from, to, printMode) => {
    let tableRows = '';
    let totalAmount = 0;

    if (type === 'sales') {
        tableRows = data.map(sale => {
            const invoiceNumber = sale.invoice_number;
            const customerName = sale.customer_name;
            const sellerName = sale.seller_name || 'N/A';
            const paymentMethod = sale.payment_method;
            const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
            const total = Number.parseFloat(sale.total);
            const totalDiscount = Number.parseFloat(sale.total_discount || 0);
            const profit = Number.parseFloat(sale.profit || 0);
            totalAmount += total;
            return `<tr>
                <td>${invoiceNumber}</td>
                <td>${sale.date}</td>
                <td>${customerName}</td>
                <td>${sellerName}</td>
                <td>${items.length}</td>
                <td>${formatUGX(total)}</td>
                <td>${formatUGX(totalDiscount)}</td>
                <td>${formatUGX(profit)}</td>
                <td>${paymentMethod}</td>
            </tr>`;
        }).join('');
    } else if (type === 'inventory') {
        tableRows = data.map(item => {
            const reorderLevel = item.reorder_level || item.reorderLevel;
            const totalValue = item.quantity * item.price;
            totalAmount += totalValue;
            const statusText = item.quantity === 0 ? 'OUT OF STOCK' : item.quantity <= reorderLevel ? 'LOW STOCK' : 'IN STOCK';
            return `<tr>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity}</td>
                <td>${formatUGX(item.price)}</td>
                <td>${formatUGX(totalValue)}</td>
                <td>${statusText}</td>
            </tr>`;
        }).join('');
    } else if (type === 'customers') {
        tableRows = data.map(customer => {
            const lifetimeValue = customer.lifetime_value || 0;
            const lastPurchase = customer.last_purchase || 'Never';
            totalAmount += Number.parseFloat(lifetimeValue);
            return `<tr>
                <td>CUST-${String(customer.id).padStart(5, '0')}</td>
                <td>${customer.name}</td>
                <td>${customer.email}</td>
                <td>${customer.phone}</td>
                <td>${formatUGX(lifetimeValue)}</td>
                <td>${lastPurchase}</td>
            </tr>`;
        }).join('');
    } else if (type === 'returns') {
        tableRows = data.map(ret => {
            const invoiceNumber = ret.invoice_number;
            const customerName = ret.customer_name;
            const amount = Number.parseFloat(ret.amount);
            totalAmount += amount;
            return `<tr>
                <td>RET-${String(ret.id).padStart(5, '0')}</td>
                <td>${invoiceNumber}</td>
                <td>${ret.date}</td>
                <td>${customerName}</td>
                <td>${formatUGX(amount)}</td>
                <td>${ret.reason}</td>
                <td>${ret.status.toUpperCase()}</td>
            </tr>`;
        }).join('');
    }

    const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    background: white;
                    padding: 20px;
                    color: #000;
                    font-weight: 600;
                }
                .report-container {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .header {
                    text-align: center;
                    padding: 20px 0;
                    border-bottom: 2px solid #000;
                    margin-bottom: 20px;
                }
                .header img {
                    max-width: 100px;
                    height: auto;
                    margin-bottom: 10px;
                }
                .header h1 {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .header h2 {
                    font-size: 14px;
                    margin-bottom: 5px;
                }
                .header p {
                    font-size: 10px;
                }
                .info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    padding: 10px;
                    border: 1px solid #000;
                }
                .info-item {
                    font-size: 9px;
                }
                .info-label {
                    font-weight: bold;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    table-layout: fixed;
                }
                th, td {
                    border: 1px solid #000;
                    padding: 4px 2px;
                    text-align: left;
                    font-size: 8px;
                    word-wrap: break-word;
                    overflow: hidden;
                    font-weight: 600;
                }
                th {
                    background: #f0f0f0;
                    font-weight: 700;
                }
                tbody tr:nth-child(even) {
                    background: #fafafa;
                }
                .summary {
                    margin-top: 20px;
                    padding: 15px;
                    border: 2px solid #000;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .summary-label {
                    font-size: 11px;
                    font-weight: bold;
                }
                .summary-value {
                    font-size: 14px;
                    font-weight: bold;
                }
                .footer {
                    margin-top: 20px;
                    padding-top: 10px;
                    border-top: 1px solid #000;
                    text-align: center;
                    font-size: 8px;
                }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="report-container">
                <div class="header">
                    <img src="logo.png" alt="HR Family Spare Parts Logo">
                    <h1>HR FAMILY SPARE PARTS</h1>
                    <h2>${title}</h2>
                    <p>Period: ${from} to ${to}</p>
                </div>
                <div class="info">
                    <div class="info-item">
                        <span class="info-label">Generated:</span> ${new Date().toLocaleString()}
                    </div>
                    <div class="info-item">
                        <span class="info-label">Total Records:</span> ${data.length}
                    </div>
                </div>
                <table>
                    ${type === 'sales' ? '<thead><tr><th>Sales Receipt</th><th>Date</th><th>Customer</th><th>Staff</th><th>Items</th><th>Total</th><th>Discount</th><th>Profit</th><th>Payment</th></tr></thead>' : ''}
                    ${type === 'inventory' ? '<thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Qty</th><th>Unit Price</th><th>Total Value</th><th>Status</th></tr></thead>' : ''}
                    ${type === 'customers' ? '<thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Lifetime Value</th><th>Last Purchase</th></tr></thead>' : ''}
                    ${type === 'returns' ? '<thead><tr><th>ID</th><th>Sales Receipt</th><th>Date</th><th>Customer</th><th>Amount</th><th>Reason</th><th>Status</th></tr></thead>' : ''}
                    <tbody>${tableRows}</tbody>
                </table>
                ${(type === 'sales' || type === 'customers' || type === 'returns' || type === 'inventory') ? `
                    <div class="summary">
                        <span class="summary-label">Total ${type === 'inventory' ? 'Inventory Value' : 'Amount'}:</span>
                        <span class="summary-value">${formatUGX(totalAmount)}</span>
                    </div>
                ` : ''}
                <div class="footer">
                    <p>This is a computer-generated report from HR Family Spare Parts</p>
                    <p>Generated on ${new Date().toLocaleString()} | © ${new Date().getFullYear()}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    if (printMode) {
        // For print mode, open in new window
        const reportWindow = window.open('', '_blank', 'width=1024,height=768');
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
        setTimeout(() => reportWindow.print(), 500);
    } else {
        // For PDF mode, generate and download actual PDF file
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = reportHTML;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);

        const opt = {
            margin: [5, 5, 5, 5],
            filename: `${title.replaceAll(/ /g, '_')}_${from}_to_${to}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(tempDiv.querySelector('.report-container')).save().then(() => {
            document.body.removeChild(tempDiv);
        });
    }
};

// Receipt printing function
const printReceipt = (sale) => {
    const receiptWindow = window.open('', '_blank', 'width=350,height=600');

    if (!receiptWindow) {
        alert('Unable to open receipt window. Please check your popup blocker settings.');
        return;
    }

    // Handle PostgreSQL lowercase column names
    const invoiceNumber = sale.invoice_number;
    const customerName = sale.customer_name;
    const paymentMethod = sale.payment_method;
    const sellerName = sale.seller_name || 'Cashier';
    const saleItems = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;

    // Format date and time
    const saleDate = new Date(sale.date);
    const dateStr = saleDate.toLocaleDateString('en-GB');
    const timeStr = saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt - ${invoiceNumber}</title>
            <meta charset="UTF-8">
            <style>
                /* Thermal Receipt CSS - Optimized for 80mm thermal printers */
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                @page {
                    size: 80mm auto;
                    margin: 0;
                }

                body {
                    width: 72mm;
                    margin: 2mm 4mm;
                    padding: 0;
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 9pt;
                    line-height: 1.4;
                    color: #000;
                    background: #fff;
                }

                .receipt-container {
                    width: 100%;
                }

                /* Header Section */
                .header {
                    text-align: center;
                    margin-bottom: 3mm;
                }

                .header img {
                    max-width: 50mm;
                    height: auto;
                    margin-bottom: 2mm;
                }

                .company-name {
                    font-size: 14pt;
                    font-weight: bold;
                    margin: 2mm 0;
                    letter-spacing: 0.5px;
                }

                .header-subtitle {
                    font-size: 8pt;
                    margin: 1mm 0;
                }

                .separator {
                    border-bottom: 1px dashed #000;
                    margin: 2mm 0;
                }

                .separator-thick {
                    border-bottom: 2px solid #000;
                    margin: 2mm 0;
                }

                /* Info Section */
                .info-section {
                    margin: 2mm 0;
                }

                .info-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9pt;
                    line-height: 1.6;
                    margin: 1mm 0;
                }

                .info-label {
                    font-weight: normal;
                }

                .info-value {
                    text-align: right;
                }

                .receipt-title {
                    text-align: center;
                    font-size: 12pt;
                    font-weight: bold;
                    margin: 2mm 0;
                }

                /* Items Section */
                .items-section {
                    margin: 2mm 0;
                }

                .items-header {
                    font-weight: bold;
                    font-size: 9pt;
                    margin-bottom: 1mm;
                }

                .item {
                    margin: 2mm 0;
                    page-break-inside: avoid;
                }

                .item-name {
                    font-weight: bold;
                    font-size: 9pt;
                    margin-bottom: 0.5mm;
                }

                .item-details {
                    display: flex;
                    justify-content: space-between;
                    font-size: 8pt;
                    line-height: 1.5;
                }

                /* Total Section */
                .totals-section {
                    margin: 2mm 0;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9pt;
                    line-height: 1.8;
                }

                .grand-total {
                    font-size: 16pt;
                    font-weight: bold;
                    margin-top: 2mm;
                }

                .grand-total .label {
                    font-size: 12pt;
                }

                /* Payment Section */
                .payment-section {
                    margin: 2mm 0;
                }

                /* Footer Section */
                .footer {
                    text-align: center;
                    margin-top: 3mm;
                    font-size: 8pt;
                }

                .footer-message {
                    margin: 1mm 0;
                }

                .footer-small {
                    font-size: 7pt;
                    margin: 1mm 0;
                }

                .timestamp {
                    font-size: 7pt;
                    margin-top: 2mm;
                }

                .cut-line {
                    text-align: center;
                    font-size: 8pt;
                    margin-top: 3mm;
                    color: #666;
                }

                /* Print-specific styles */
                @media print {
                    body {
                        margin: 0;
                        padding: 2mm 4mm;
                    }

                    .no-print {
                        display: none !important;
                    }

                    .receipt-container {
                        page-break-after: auto;
                    }

                    .item {
                        page-break-inside: avoid;
                    }
                }

                /* Screen preview styles */
                @media screen {
                    body {
                        background: #f0f0f0;
                        padding: 10mm;
                    }

                    .receipt-container {
                        background: white;
                        padding: 4mm;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        margin: 0 auto;
                    }

                    .print-button {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        padding: 12px 24px;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 14px;
                        cursor: pointer;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        z-index: 1000;
                    }

                    .print-button:hover {
                        background: #0056b3;
                    }
                }
            </style>
        </head>
        <body>
            <button class="print-button no-print" onclick="window.print()">🖨️ Print Receipt</button>

            <div class="receipt-container">
                <!-- Header -->
                <div class="header">
                    <img src="logo.png" alt="Logo" onerror="this.style.display='none'">
                    <div class="company-name">HR FAMILY SPARE PARTS</div>
                    <div class="header-subtitle">Kampala, Uganda</div>
                    <div class="header-subtitle">Tel: +256-XXX-XXXX</div>
                </div>

                <div class="separator-thick"></div>

                <!-- Receipt Title -->
                <div class="receipt-title">SALES RECEIPT</div>

                <div class="separator"></div>

                <!-- Receipt Info -->
                <div class="info-section">
                    <div class="info-row">
                        <span class="info-label">Receipt #:</span>
                        <span class="info-value">${invoiceNumber}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Date:</span>
                        <span class="info-value">${dateStr}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Cashier:</span>
                        <span class="info-value">${sellerName}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Customer:</span>
                        <span class="info-value">${customerName}</span>
                    </div>
                </div>

                <div class="separator-thick"></div>

                <!-- Items -->
                <div class="items-section">
                    <div class="items-header">ITEMS</div>
                    <div class="separator"></div>
                    ${saleItems.map(item => `
                        <div class="item">
                            <div class="item-name">${item.name}</div>
                            <div class="item-details">
                                <span>Qty: ${item.quantity} @ ${formatUGX(item.price || item.actualPrice)}</span>
                                <span>${formatUGX(item.subtotal)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="separator"></div>

                <!-- Totals -->
                <div class="totals-section">
                    <div class="total-row">
                        <span>Subtotal:</span>
                        <span>${formatUGX(sale.total)}</span>
                    </div>
                    <div class="total-row">
                        <span>Discount:</span>
                        <span>${formatUGX(sale.total_discount || 0)}</span>
                    </div>
                </div>

                <div class="separator-thick"></div>

                <div class="grand-total">
                    <div class="info-row">
                        <span class="label">TOTAL:</span>
                        <span>${formatUGX(sale.total)} UGX</span>
                    </div>
                </div>

                <div class="separator-thick"></div>

                <!-- Payment Info -->
                <div class="payment-section">
                    <div class="info-row">
                        <span>Payment Method:</span>
                        <span>${paymentMethod}</span>
                    </div>
                    <div class="info-row">
                        <span>Amount Paid:</span>
                        <span>${formatUGX(sale.total)}</span>
                    </div>
                    <div class="info-row">
                        <span>Change:</span>
                        <span>${formatUGX(0)}</span>
                    </div>
                </div>

                <div class="separator-thick"></div>

                <!-- Footer -->
                <div class="footer">
                    <div class="footer-message">Thank you!</div>
                    <div class="footer-small">Quality parts, fair prices</div>
                    <div class="separator" style="margin: 3mm 0;"></div>
                    <div class="footer-small">Sold by: HR Family Spare Parts</div>
                    <div class="footer-small">No returns without this receipt</div>
                    <div class="timestamp">${new Date().toLocaleString('en-GB')}</div>
                </div>

                <div class="cut-line">✂ ---- Cut Here ----</div>
            </div>
        </body>
        </html>
    `;

    receiptWindow.document.write(receiptHTML);
    receiptWindow.document.close();
};

// Allow Enter key to submit login
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginScreen').classList.contains('active')) {
        login();
    }
});
