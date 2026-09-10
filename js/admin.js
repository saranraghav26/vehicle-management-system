/* =============================================
   admin.js — WheelWise Admin Module Frontend Logic
   Stack: JavaScript / jQuery / Bootstrap 5
   Handles Admin Auth, Dashboard Metrics, and
   CRUD operations for Customers, Vehicles, Bookings.
   ============================================= */

$(function () {
    const API_BASE = '/api/admin';

    /* ---------------------------------------------
       SESSION & AUTH HELPERS
       --------------------------------------------- */
    function getAdminToken() {
        return localStorage.getItem('ww_admin_token') || sessionStorage.getItem('ww_admin_token') || '';
    }

    function getAdminUser() {
        try {
            return JSON.parse(localStorage.getItem('ww_admin_user') || sessionStorage.getItem('ww_admin_user') || 'null');
        } catch (e) {
            return null;
        }
    }

    function setAdminSession(token, user, remember) {
        if (remember) {
            localStorage.setItem('ww_admin_token', token);
            localStorage.setItem('ww_admin_user', JSON.stringify(user));
        } else {
            sessionStorage.setItem('ww_admin_token', token);
            sessionStorage.setItem('ww_admin_user', JSON.stringify(user));
        }
    }

    function clearAdminSession() {
        localStorage.removeItem('ww_admin_token');
        localStorage.removeItem('ww_admin_user');
        sessionStorage.removeItem('ww_admin_token');
        sessionStorage.removeItem('ww_admin_user');
    }

    // Ajax helper with Admin Auth Headers
    function adminAjax(options) {
        const token = getAdminToken();
        options.headers = options.headers || {};
        if (token) {
            options.headers['Authorization'] = 'Bearer ' + token;
            options.headers['x-admin-token'] = token;
        }
        return $.ajax(options);
    }

    /* ---------------------------------------------
       1. ADMIN LOGIN PAGE LOGIC (admin-login.html)
       --------------------------------------------- */
    if ($('#adminLoginForm').length) {
        // Redirect if already logged in as admin
        const token = getAdminToken();
        if (token) {
            adminAjax({ url: API_BASE + '/check-auth', method: 'GET' })
                .done(function (res) {
                    if (res && res.authenticated) {
                        window.location.href = 'admin-dashboard.html';
                    }
                });
        }

        // Form Submit
        $('#adminLoginForm').on('submit', function (e) {
            e.preventDefault();
            const $form = $(this);
            const email = $.trim($('#adminEmail').val());
            const password = $('#adminPassword').val();
            const remember = $('#rememberAdmin').is(':checked');

            let valid = true;
            $form.find('.form-control').removeClass('is-invalid');
            $('#adminLoginAlert').addClass('d-none').text('');

            if (!email) {
                $('#adminEmail').addClass('is-invalid');
                valid = false;
            }
            if (!password) {
                $('#adminPassword').addClass('is-invalid');
                valid = false;
            }

            if (!valid) return;

            const $btn = $('#btnAdminLogin');
            $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Authenticating...');

            adminAjax({
                url: API_BASE + '/login',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ email: email, password: password })
            }).done(function (res) {
                if (res && res.success && res.token) {
                    setAdminSession(res.token, res.user, remember);
                    $('#adminLoginAlert')
                        .removeClass('d-none alert-danger')
                        .addClass('alert-success')
                        .text('Authentication successful! Redirecting...');
                    setTimeout(function () {
                        window.location.href = 'admin-dashboard.html';
                    }, 800);
                } else {
                    $('#adminLoginAlert')
                        .removeClass('d-none alert-success')
                        .addClass('alert-danger')
                        .text(res.message || 'Invalid email or password.');
                    $btn.prop('disabled', false).text('Sign In to Admin Panel');
                }
            }).fail(function (xhr) {
                let msg = 'Invalid admin credentials.';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg = xhr.responseJSON.message;
                }
                $('#adminLoginAlert')
                    .removeClass('d-none alert-success')
                    .addClass('alert-danger')
                    .text(msg);
                $btn.prop('disabled', false).text('Sign In to Admin Panel');
            });
        });

        // Toggle password view
        $('#toggleAdminPassword').on('click', function () {
            const $input = $('#adminPassword');
            const type = $input.attr('type') === 'password' ? 'text' : 'password';
            $input.attr('type', type);
        });
        return;
    }

    /* ---------------------------------------------
       2. ADMIN DASHBOARD ROUTE GUARD & LOGIC
       --------------------------------------------- */
    if ($('#adminDashboardView').length) {
        const token = getAdminToken();
        const user  = getAdminUser();

        if (!token) {
            window.location.href = 'admin-login.html';
            return;
        }

        // Verify Session with Backend
        adminAjax({ url: API_BASE + '/check-auth', method: 'GET' })
            .fail(function () {
                clearAdminSession();
                window.location.href = 'admin-login.html';
            })
            .done(function (res) {
                if (!res || !res.authenticated) {
                    clearAdminSession();
                    window.location.href = 'admin-login.html';
                } else {
                    if (user && user.name) {
                        $('#adminUserDisplayName').text(user.name);
                    }
                    bootAdminDashboard();
                }
            });
    }

    /* ---------------------------------------------
       3. DASHBOARD MANAGEMENT FUNCTIONS
       --------------------------------------------- */
    function bootAdminDashboard() {
        // Logout handler
        $('#btnAdminLogout').on('click', function (e) {
            e.preventDefault();
            if (confirm('Are you sure you want to log out of Admin Dashboard?')) {
                adminAjax({ url: API_BASE + '/logout', method: 'POST' });
                clearAdminSession();
                window.location.href = 'admin-login.html';
            }
        });

        // Navigation Tabs switching
        $('.admin-nav-item[data-tab]').on('click', function (e) {
            e.preventDefault();
            const targetTab = $(this).data('tab');
            $('.admin-nav-item').removeClass('active');
            $(this).addClass('active');

            $('.admin-tab-content').addClass('d-none');
            $('#tab-' + targetTab).removeClass('d-none');

            // Refresh tab data
            if (targetTab === 'dashboard') loadMetrics();
            if (targetTab === 'customers') loadCustomers();
            if (targetTab === 'vehicles') loadVehicles();
            if (targetTab === 'bookings') loadBookings();
        });

        // Initial Load
        loadMetrics();
        loadCustomers();
        loadVehicles();
        loadBookings();
    }

    /* ---------------------------------------------
       METRICS / STATS CARDS
       --------------------------------------------- */
    function loadMetrics() {
        adminAjax({ url: API_BASE + '/dashboard', method: 'GET' })
            .done(function (res) {
                if (res && res.success && res.stats) {
                    const s = res.stats;
                    $('#statCustomers').text(s.totalCustomers || 0);
                    $('#statVehicles').text(s.totalVehicles || 0);
                    $('#statAvailableVehicles').text(s.availableVehicles || 0);
                    $('#statBookings').text(s.totalBookings || 0);
                    $('#statActiveBookings').text(s.activeBookings || 0);
                    $('#statCompletedBookings').text(s.completedBookings || 0);
                    $('#statCancelledBookings').text(s.cancelledBookings || 0);
                    $('#statRevenue').text('₹' + Number(s.totalRevenue || 0).toLocaleString());
                }
            });
    }

    /* ---------------------------------------------
       CUSTOMER MANAGEMENT
       --------------------------------------------- */
    let ALL_CUSTOMERS = [];

    function loadCustomers() {
        adminAjax({ url: API_BASE + '/customers', method: 'GET' })
            .done(function (res) {
                if (res && res.success) {
                    ALL_CUSTOMERS = res.customers || [];
                    renderCustomers(ALL_CUSTOMERS);
                }
            });
    }

    function renderCustomers(list) {
        const $tbody = $('#customersTableBody').empty();
        if (!list.length) {
            $tbody.html('<tr><td colspan="6" class="text-center py-4 text-muted">No customers found.</td></tr>');
            return;
        }

        $.each(list, function (i, c) {
            const statusClass = c.status === 'inactive' ? 'badge-inactive' : 'badge-active';
            const statusText  = c.status === 'inactive' ? 'Inactive' : 'Active';
            const regDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—';

            $tbody.append(`
                <tr>
                    <td>
                        <strong class="text-white">${escapeHtml(c.name || '—')}</strong><br>
                        <small class="text-muted">ID: ${escapeHtml(c.userId || '—')}</small>
                    </td>
                    <td>${escapeHtml(c.email || '—')}</td>
                    <td>${escapeHtml(c.phone || '—')}</td>
                    <td><span class="admin-badge ${statusClass}">${statusText}</span></td>
                    <td><span class="badge bg-secondary">${c.bookingCount || 0} bookings</span></td>
                    <td>
                        <button type="button" class="btn btn-sm btn-outline-info btn-cus-view me-1" data-id="${c.userId || c.email}">History</button>
                        <button type="button" class="btn btn-sm btn-outline-warning btn-cus-edit me-1" data-id="${c.userId || c.email}">Edit</button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-cus-del" data-id="${c.userId || c.email}">Delete</button>
                    </td>
                </tr>
            `);
        });
    }

    // Customer Search & Filter
    $('#cusSearchInput, #cusStatusFilter').on('input change', function () {
        const query  = $.trim($('#cusSearchInput').val()).toLowerCase();
        const status = $('#cusStatusFilter').val();

        let filtered = ALL_CUSTOMERS.filter(function (c) {
            const matchQuery = !query ||
                (c.name && c.name.toLowerCase().includes(query)) ||
                (c.email && c.email.toLowerCase().includes(query)) ||
                (c.phone && c.phone.toLowerCase().includes(query));
            const matchStatus = (status === 'all') || (c.status || 'active') === status;
            return matchQuery && matchStatus;
        });
        renderCustomers(filtered);
    });

    // View History Modal
    $('#customersTableBody').on('click', '.btn-cus-view', function () {
        const id = $(this).data('id');
        adminAjax({ url: API_BASE + '/customers/' + encodeURIComponent(id), method: 'GET' })
            .done(function (res) {
                if (res && res.success && res.customer) {
                    const c = res.customer;
                    $('#modalCusName').text(c.name);
                    $('#modalCusEmail').text(c.email);
                    $('#modalCusPhone').text(c.phone);

                    const $bList = $('#modalCusBookingList').empty();
                    const bookings = c.bookings || [];
                    if (!bookings.length) {
                        $bList.html('<p class="text-muted mb-0">No booking history recorded for this customer.</p>');
                    } else {
                        $.each(bookings, function (i, b) {
                            $bList.append(`
                                <div class="p-3 mb-2 rounded border border-secondary bg-dark">
                                    <div class="d-flex justify-content-between">
                                        <strong>${escapeHtml(b.bookingId)}</strong>
                                        <span class="admin-badge badge-${(b.status || 'Confirmed').toLowerCase()}">${b.status || 'Confirmed'}</span>
                                    </div>
                                    <small class="text-muted">${b.vehicleName} &middot; Pick-up: ${b.pickupDate} to ${b.returnDate}</small>
                                    <div class="text-end fw-bold text-success mt-1">₹${b.totalPrice}</div>
                                </div>
                            `);
                        });
                    }
                    const modal = new bootstrap.Modal(document.getElementById('customerHistoryModal'));
                    modal.show();
                }
            });
    });

    // Edit Customer Modal
    $('#customersTableBody').on('click', '.btn-cus-edit', function () {
        const id = $(this).data('id');
        adminAjax({ url: API_BASE + '/customers/' + encodeURIComponent(id), method: 'GET' })
            .done(function (res) {
                if (res && res.success && res.customer) {
                    const c = res.customer;
                    $('#editCusId').val(c.userId || c.email);
                    $('#editCusName').val(c.name);
                    $('#editCusEmail').val(c.email);
                    $('#editCusPhone').val(c.phone);
                    $('#editCusStatus').val(c.status || 'active');

                    const modal = new bootstrap.Modal(document.getElementById('editCustomerModal'));
                    modal.show();
                }
            });
    });

    // Save Edited Customer
    $('#editCustomerForm').on('submit', function (e) {
        e.preventDefault();
        const id = $('#editCusId').val();
        const name  = $.trim($('#editCusName').val());
        const phone = $.trim($('#editCusPhone').val());
        const status = $('#editCusStatus').val();

        adminAjax({
            url: API_BASE + '/customers/' + encodeURIComponent(id),
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify({ name, phone, status })
        }).done(function (res) {
            if (res && res.success) {
                bootstrap.Modal.getInstance(document.getElementById('editCustomerModal')).hide();
                loadCustomers();
                loadMetrics();
            }
        });
    });

    // Delete Customer
    $('#customersTableBody').on('click', '.btn-cus-del', function () {
        const id = $(this).data('id');
        if (confirm('Are you sure you want to delete this customer account?')) {
            adminAjax({ url: API_BASE + '/customers/' + encodeURIComponent(id), method: 'DELETE' })
                .done(function () {
                    loadCustomers();
                    loadMetrics();
                });
        }
    });

    /* ---------------------------------------------
       VEHICLE MANAGEMENT
       --------------------------------------------- */
    let ALL_ADMIN_VEHICLES = [];

    function loadVehicles() {
        adminAjax({ url: API_BASE + '/vehicles', method: 'GET' })
            .done(function (res) {
                if (res && res.success) {
                    ALL_ADMIN_VEHICLES = res.vehicles || [];
                    renderVehiclesTable(ALL_ADMIN_VEHICLES);
                }
            });
    }

    function renderVehiclesTable(list) {
        const $tbody = $('#vehiclesTableBody').empty();
        if (!list.length) {
            $tbody.html('<tr><td colspan="7" class="text-center py-4 text-muted">No vehicles found.</td></tr>');
            return;
        }

        $.each(list, function (i, v) {
            const availBadge = v.availability
                ? '<span class="admin-badge badge-active">Available</span>'
                : '<span class="admin-badge badge-inactive">Unavailable</span>';
            const imgPath = v.image || 'images/vehicles/camry.jpg';

            $tbody.append(`
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${imgPath}" alt="${escapeHtml(v.name)}" style="width: 44px; height: 32px; object-fit: cover; border-radius: 4px;" onerror="this.src='images/vehicles/camry.jpg'">
                            <div>
                                <strong class="text-white">${escapeHtml(v.name)}</strong><br>
                                <small class="text-muted">ID: ${v.vehicleId}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge bg-primary">${escapeHtml(v.type)}</span></td>
                    <td>${escapeHtml(v.location || 'Downtown')}</td>
                    <td><strong>₹${v.pricePerDay}</strong>/day</td>
                    <td>${v.seats || 5} Seats &middot; ${v.transmission || 'Auto'}</td>
                    <td>${availBadge}</td>
                    <td>
                        <button type="button" class="btn btn-sm btn-outline-warning btn-veh-edit me-1" data-id="${v.vehicleId}">Edit</button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-veh-del" data-id="${v.vehicleId}">Delete</button>
                    </td>
                </tr>
            `);
        });
    }

    // Vehicle Search & Filter
    $('#vehSearchInput, #vehTypeFilter, #vehAvailFilter').on('input change', function () {
        const query = $.trim($('#vehSearchInput').val()).toLowerCase();
        const type  = $('#vehTypeFilter').val();
        const avail = $('#vehAvailFilter').val();

        let filtered = ALL_ADMIN_VEHICLES.filter(function (v) {
            const matchQuery = !query || v.name.toLowerCase().includes(query) || (v.location && v.location.toLowerCase().includes(query));
            const matchType  = (type === 'all') || (v.type && v.type.toLowerCase() === type.toLowerCase());
            const matchAvail = (avail === 'all') || (avail === 'available' && v.availability) || (avail === 'unavailable' && !v.availability);
            return matchQuery && matchType && matchAvail;
        });
        renderVehiclesTable(filtered);
    });

    // Add Vehicle Submit
    $('#addVehicleForm').on('submit', function (e) {
        e.preventDefault();
        const name  = $.trim($('#addVehName').val());
        const type  = $('#addVehType').val();
        const price = parseFloat($('#addVehPrice').val());
        const seats = parseInt($('#addVehSeats').val(), 10);
        const transmission = $('#addVehTrans').val();
        const fuelType = $('#addVehFuel').val();
        const location = $.trim($('#addVehLoc').val());
        const availability = $('#addVehAvail').val() === 'true';
        const image = $.trim($('#addVehImg').val()) || 'images/vehicles/camry.jpg';
        const description = $.trim($('#addVehDesc').val());
        const features = $.trim($('#addVehFeatures').val());

        if (!name || !type || isNaN(price) || price <= 0) {
            alert('Please provide valid vehicle name, type and a positive price.');
            return;
        }

        adminAjax({
            url: API_BASE + '/vehicles',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ name, type, pricePerDay: price, seats, transmission, fuelType, location, availability, image, description, features })
        }).done(function (res) {
            if (res && res.success) {
                $('#addVehicleForm')[0].reset();
                bootstrap.Modal.getInstance(document.getElementById('addVehicleModal')).hide();
                loadVehicles();
                loadMetrics();
            }
        });
    });

    // Edit Vehicle Modal Open
    $('#vehiclesTableBody').on('click', '.btn-veh-edit', function () {
        const id = parseInt($(this).data('id'), 10);
        const v = ALL_ADMIN_VEHICLES.find(item => item.vehicleId === id);
        if (!v) return;

        $('#editVehId').val(v.vehicleId);
        $('#editVehName').val(v.name);
        $('#editVehType').val(v.type);
        $('#editVehPrice').val(v.pricePerDay);
        $('#editVehSeats').val(v.seats || 5);
        $('#editVehTrans').val(v.transmission || 'Automatic');
        $('#editVehFuel').val(v.fuelType || 'Petrol');
        $('#editVehLoc').val(v.location || 'Downtown');
        $('#editVehAvail').val(v.availability ? 'true' : 'false');
        $('#editVehImg').val(v.image || '');
        $('#editVehDesc').val(v.description || '');
        $('#editVehFeatures').val(Array.isArray(v.features) ? v.features.join(', ') : (v.features || ''));

        const modal = new bootstrap.Modal(document.getElementById('editVehicleModal'));
        modal.show();
    });

    // Save Edited Vehicle
    $('#editVehicleForm').on('submit', function (e) {
        e.preventDefault();
        const id = parseInt($('#editVehId').val(), 10);
        const name  = $.trim($('#editVehName').val());
        const type  = $('#editVehType').val();
        const price = parseFloat($('#editVehPrice').val());
        const seats = parseInt($('#editVehSeats').val(), 10);
        const transmission = $('#editVehTrans').val();
        const fuelType = $('#editVehFuel').val();
        const location = $.trim($('#editVehLoc').val());
        const availability = $('#editVehAvail').val() === 'true';
        const image = $.trim($('#editVehImg').val());
        const description = $.trim($('#editVehDesc').val());
        const features = $.trim($('#editVehFeatures').val());

        adminAjax({
            url: API_BASE + '/vehicles/' + id,
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify({ name, type, pricePerDay: price, seats, transmission, fuelType, location, availability, image, description, features })
        }).done(function (res) {
            if (res && res.success) {
                bootstrap.Modal.getInstance(document.getElementById('editVehicleModal')).hide();
                loadVehicles();
                loadMetrics();
            }
        });
    });

    // Delete Vehicle
    $('#vehiclesTableBody').on('click', '.btn-veh-del', function () {
        const id = parseInt($(this).data('id'), 10);
        if (confirm('Are you sure you want to delete this vehicle from catalogue?')) {
            adminAjax({ url: API_BASE + '/vehicles/' + id, method: 'DELETE' })
                .done(function () {
                    loadVehicles();
                    loadMetrics();
                });
        }
    });

    /* ---------------------------------------------
       BOOKING MANAGEMENT
       --------------------------------------------- */
    let ALL_ADMIN_BOOKINGS = [];

    function loadBookings() {
        adminAjax({ url: API_BASE + '/bookings', method: 'GET' })
            .done(function (res) {
                if (res && res.success) {
                    ALL_ADMIN_BOOKINGS = res.bookings || [];
                    renderBookingsTable(ALL_ADMIN_BOOKINGS);
                }
            });
    }

    function renderBookingsTable(list) {
        const $tbody = $('#bookingsTableBody').empty();
        if (!list.length) {
            $tbody.html('<tr><td colspan="7" class="text-center py-4 text-muted">No bookings recorded yet.</td></tr>');
            return;
        }

        $.each(list, function (i, b) {
            const status = b.status || 'Confirmed';
            const badgeClass = status === 'Completed' ? 'badge-completed' : (status === 'Cancelled' ? 'badge-cancelled' : 'badge-confirmed');

            $tbody.append(`
                <tr>
                    <td><strong class="text-white">${escapeHtml(b.bookingId)}</strong></td>
                    <td>
                        ${escapeHtml(b.customerName)}<br>
                        <small class="text-muted">${escapeHtml(b.customerEmail)}</small>
                    </td>
                    <td>${escapeHtml(b.vehicleName)}</td>
                    <td><small>${b.pickupDate} to ${b.returnDate}</small></td>
                    <td><strong>₹${b.totalPrice}</strong></td>
                    <td><span class="admin-badge ${badgeClass}">${status}</span></td>
                    <td>
                        <select class="form-select form-select-sm admin-form-select select-booking-status" data-id="${b.bookingId}">
                            <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                            <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
                            <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </td>
                </tr>
            `);
        });
    }

    // Booking Search & Filter
    $('#bkSearchInput, #bkStatusFilter').on('input change', function () {
        const query  = $.trim($('#bkSearchInput').val()).toLowerCase();
        const status = $('#bkStatusFilter').val();

        let filtered = ALL_ADMIN_BOOKINGS.filter(function (b) {
            const matchQuery = !query ||
                (b.bookingId && b.bookingId.toLowerCase().includes(query)) ||
                (b.customerName && b.customerName.toLowerCase().includes(query)) ||
                (b.customerEmail && b.customerEmail.toLowerCase().includes(query)) ||
                (b.vehicleName && b.vehicleName.toLowerCase().includes(query));
            const matchStatus = (status === 'all') || (b.status || 'Confirmed') === status;
            return matchQuery && matchStatus;
        });
        renderBookingsTable(filtered);
    });

    // Update Booking Status
    $('#bookingsTableBody').on('change', '.select-booking-status', function () {
        const id = $(this).data('id');
        const status = $(this).val();

        adminAjax({
            url: API_BASE + '/bookings/' + encodeURIComponent(id),
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify({ status })
        }).done(function (res) {
            if (res && res.success) {
                loadBookings();
                loadMetrics();
            }
        });
    });

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});
