/* =============================================
   booking.js — Booking form & checkout logic
   Stack: JavaScript / jQuery / JSON
   Reads ww_booking → validates the form client-side,
   builds the booking locally, stores it in
   ww_latest_booking (+ ww_bookings for the My
   Bookings page) and redirects to confirmation.html.
   No backend / database — all client-side (R1).
   ============================================= */

/* ======================================================
   FILE-SCOPE HELPERS
   Accessible from every $(function(){…}) block below
   (booking page, confirmation page, My Bookings page).
   ====================================================== */

/* -----------------------------------------------
   Vehicle photo fallback map.
   Used when a booking record predates the
   vehicleImage field (older localStorage bookings).
   Keys match vehicleId in frontend/json/vehicles.json.
   ----------------------------------------------- */
var VEHICLE_IMAGE_BY_ID = {
    1: 'images/vehicles/camry.jpg',    // Toyota Camry
    2: 'images/vehicles/creta.jpg',    // Hyundai Creta
    3: 'images/vehicles/i20.jpg',      // Hyundai i20
    4: 'images/vehicles/cclass.jpg',   // Mercedes C-Class
    5: 'images/vehicles/seltos.jpg',   // Kia Seltos
    6: 'images/vehicles/innova.jpg',   // Toyota Innova Crysta
    7: 'images/vehicles/nexon.jpg',    // Tata Nexon
    8: 'images/vehicles/zsev.jpg'      // MG ZS EV
};

function vehicleImageFor(b) {
    if (b && b.vehicleImage) return b.vehicleImage;
    if (b && b.image) return b.image;
    if (b && b.vehicleId) return VEHICLE_IMAGE_BY_ID[b.vehicleId] || '';
    return '';
}

/* Show a form-level alert message on the booking page. */
function showFormAlert(message) {
    var $alert = $('#bookingFormAlert');
    if ($alert.length) {
        $alert.text(message).removeClass('d-none');
    }
}

/* Hide the form-level alert on the booking page. */
function clearFormAlert() {
    $('#bookingFormAlert').addClass('d-none').text('');
}

$(function () {

    /* =========================================
       LOAD the vehicle selected on the details
       page (localStorage key: ww_booking)
       ========================================= */
    var bookingData = null;
    try {
        bookingData = JSON.parse(localStorage.getItem('ww_booking') || 'null');
    } catch (e) {
        bookingData = null;
    }

    // The logged-in user (created at login: name, email, phone).
    var user = null;
    try {
        user = JSON.parse(localStorage.getItem('ww_user') || 'null');
    } catch (e) {
        user = null;
    }

    if (!bookingData || !bookingData.vehicleId) {
        // Friendly fallback — no booking in progress
        $('#bookingContent').addClass('d-none');
        $('#bookingError').removeClass('d-none');
        return;
    }

    // A booking must be tied to a signed-in account.
    if (!user || !user.email) {
        $('#bookingContent').addClass('d-none');
        $('#bookingError').removeClass('d-none');
        $('.no-results h3').text('Please log in first');
        $('.no-results p')
            .text('You need to be signed in to book a vehicle. Please log in and come back.');
        return;
    }

    // Prefill customer fields from the logged-in account.
    // Email is always the authenticated one — never editable below.
    $('#cusEmail').val(user.email);
    if (!$.trim($('#cusName').val())) {
        $('#cusName').val(user.name || '');
    }
    if (!$.trim($('#cusPhone').val())) {
        $('#cusPhone').val(user.phone || '');
    }

    var pricePerDay = bookingData.pricePerDay || 0;

    // Vehicles page → unused here, but keeps things tidy
    $('#bookingContent').removeClass('d-none');
    $('#bookingError').addClass('d-none');

    /* =========================================
       Fill the "Your Ride" summary
       ========================================= */
    var summaryImgSrc = vehicleImageFor(bookingData);
    if (summaryImgSrc) {
        $('#summaryImg').attr('src', summaryImgSrc).attr('alt', bookingData.name || 'Vehicle');
        $('#summaryImgWrap').show();
    }

    $('#summaryName').text(bookingData.name);
    $('#summaryType').text(bookingData.type);
    $('#summaryLocation').text(bookingData.location);
    $('#summarySeats').text(bookingData.seats + ' Seats');
    $('#summaryPrice').text('$' + pricePerDay + ' / day');

    // Sensible date defaults: pickup today, return after the chosen days
    var initialDays = (parseInt(bookingData.days, 10) >= 1) ? parseInt(bookingData.days, 10) : 1;
    function toDateInput(d) { return d.toISOString().split('T')[0]; }

    var today = new Date();
    $('#pickupDate').val(toDateInput(today));

    var returnDate = new Date();
    returnDate.setDate(today.getDate() + initialDays);
    $('#returnDate').val(toDateInput(returnDate));

    $('#pickupLocation').val(bookingData.location || '');
    $('#returnLocation').val(bookingData.location || '');

    /* =========================================
       Live total: rental days from dates
       ========================================= */
    function rentalDays() {
        var pick = $('#pickupDate').val();
        var ret  = $('#returnDate').val();
        if (!pick || !ret) return null;

        var p = new Date(pick + 'T00:00:00');
        var r = new Date(ret  + 'T00:00:00');
        var diff = Math.round((r - p) / 86400000); // ms per day
        return diff;
    }

    function recalc() {
        var days = rentalDays();

        if (days === null || days < 1) {
            $('#summaryDays').text('—');
            $('#summaryTotal').text('—');
            return;
        }
        $('#summaryDays').text(days + (days === 1 ? ' day' : ' days'));
        $('#summaryTotal').text('$' + (pricePerDay * days));
    }

    $('#pickupDate, #returnDate').on('input change', recalc);

    // Clear a field's error as soon as the user types
    $('#cusName, #cusEmail, #cusPhone, #pickupDate, #returnDate, #pickupLocation, #returnLocation, #termsCheck')
        .on('input change', function () {
            // The terms group lives in an `.mb-4` block (not `.mb-3`), so
            // resolve the error group from the field's own id group first.
            var $group = $(this).closest('.mb-3, .mb-4');
            if ($group.length) {
                $group.removeClass('has-error')
                      .find('.invalid-feedback').text('');
                $(this).removeClass('is-invalid');
            }
        });

    /* =========================================
       Payment method (UI only)
       ========================================= */
    $('input[name="payment"]').on('change', function () {
        var val = $(this).val();
        $('.payment-option').removeClass('selected');
        $(this).closest('.payment-option').addClass('selected');
        $('#cardFields').toggleClass('d-none', val !== 'card');

        // Clear any card field errors when switching payment method
        if (val !== 'card') {
            $('#cardNumber, #cardExpiry, #cardCvv').removeClass('is-invalid')
                .siblings('.invalid-feedback').remove();
        }
    });

    // Clear card field errors as the user types
    $('#cardNumber, #cardExpiry, #cardCvv').on('input', function () {
        $(this).removeClass('is-invalid').siblings('.invalid-feedback').remove();
    });

    $('#termsGroup a').on('click', function (e) { e.preventDefault(); });

    /* =========================================
       Validation helpers
       ========================================= */
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    }
    function isValidPhone(phone) {
        var digits = phone.replace(/[^\d]/g, '');
        return digits.length >= 10 && digits.length <= 15;
    }
    function setError(groupId, message) {
        $('#' + groupId)
            .addClass('has-error')
            .find('.invalid-feedback').text(message);
        $('#' + groupId).find('.form-control, .form-check-input').addClass('is-invalid');
    }
    function resetErrors() {
        $('.details-card .mb-3').removeClass('has-error')
            .find('.invalid-feedback').text('');
        $('.form-control, .form-check-input').removeClass('is-invalid');
    }

    /* =========================================
       Confirm Booking
       ========================================= */
    $('#btnConfirm').on('click', function () {
        // A booking always belongs to the logged-in account.
        if (!user || !user.email) {
            showFormAlert('Please log in first to book a vehicle.');
            return;
        }
        resetErrors();

        var name  = $.trim($('#cusName').val());
        var email = user.email; // authenticated email — never the typed value
        var phone = $.trim($('#cusPhone').val());
        var pick  = $('#pickupDate').val();
        var ret   = $('#returnDate').val();
        var pickLoc = $.trim($('#pickupLocation').val());
        var retLoc  = $.trim($('#returnLocation').val());
        var terms   = $('#termsCheck').is(':checked');
        var days    = rentalDays();

        var valid = true;

        // Customer
        if (name === '')            { setError('nameGroup', 'Full name is required.'); valid = false; }
        else if (name.length < 2)   { setError('nameGroup', 'Full name must be at least 2 characters.'); valid = false; }
        else if (/^\d+$/.test(name)) { setError('nameGroup', 'Name cannot contain only numbers.'); valid = false; }
        else if (/^[^a-zA-Z]+$/.test(name)) { setError('nameGroup', 'Please enter a valid name (letters only).'); valid = false; }
        else if (/^(.)\1+$/.test(name)) { setError('nameGroup', 'Please enter a meaningful name.'); valid = false; }

        if (email === '')           { setError('emailGroup', 'Email is required.'); valid = false; }
        else if (!isValidEmail(email)) { setError('emailGroup', 'Please enter a valid email address.'); valid = false; }

        if (phone === '')           { setError('phoneGroup', 'Phone number is required.'); valid = false; }
        else if (!isValidPhone(phone)) { setError('phoneGroup', 'Please enter a valid phone number.'); valid = false; }

        // Rental
        if (!pick) {
            setError('pickupGroup', 'Pick-up date is required.');
            valid = false;
        } else {
            // Pick-up date must not be in the past
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var pickDate = new Date(pick + 'T00:00:00');
            if (pickDate < today) {
                setError('pickupGroup', 'Pick-up date cannot be in the past.');
                valid = false;
            }
        }
        if (!ret)       { setError('returnGroup', 'Return date is required.'); valid = false; }
        if (pick && ret && days !== null && days < 1) {
            setError('returnGroup', 'Return date must be after the pick-up date.');
            valid = false;
        }
        if (pickLoc === '') { setError('pickupLocGroup', 'Pick-up location is required.'); valid = false; }
        if (retLoc === '')  { setError('returnLocGroup', 'Return location is required.'); valid = false; }

        // Payment — card fields must be filled when Card Payment is selected
        var payment = $('input[name="payment"]:checked').val() || 'cash';
        if (payment === 'card') {
            var cardNum    = $.trim($('#cardNumber').val());
            var cardExpiry = $.trim($('#cardExpiry').val());
            var cardCvv    = $.trim($('#cardCvv').val());
            var cardDigits = cardNum.replace(/\D/g, '');

            if (cardNum === '') {
                $('#cardNumber').addClass('is-invalid');
                $('#cardNumber').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardNumber').after('<div class="invalid-feedback d-block">Card number is required.</div>');
                valid = false;
            } else if (cardDigits.length < 13 || cardDigits.length > 19) {
                $('#cardNumber').addClass('is-invalid');
                $('#cardNumber').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardNumber').after('<div class="invalid-feedback d-block">Please enter a valid card number (13–19 digits).</div>');
                valid = false;
            }

            if (cardExpiry === '') {
                $('#cardExpiry').addClass('is-invalid');
                $('#cardExpiry').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardExpiry').after('<div class="invalid-feedback d-block">Expiry date is required.</div>');
                valid = false;
            } else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry)) {
                $('#cardExpiry').addClass('is-invalid');
                $('#cardExpiry').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardExpiry').after('<div class="invalid-feedback d-block">Enter expiry as MM/YY.</div>');
                valid = false;
            }

            if (cardCvv === '') {
                $('#cardCvv').addClass('is-invalid');
                $('#cardCvv').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardCvv').after('<div class="invalid-feedback d-block">CVV is required.</div>');
                valid = false;
            } else if (!/^\d{3,4}$/.test(cardCvv)) {
                $('#cardCvv').addClass('is-invalid');
                $('#cardCvv').closest('.col-md-6, .col-6').find('.invalid-feedback').remove();
                $('#cardCvv').after('<div class="invalid-feedback d-block">CVV must be 3 or 4 digits.</div>');
                valid = false;
            }
        }

        // Terms
        if (!terms) {
            $('#termsGroup').addClass('has-error');
            $('#termsError').text('Please accept the Terms & Conditions to continue.');
            // Flag the checkbox itself as invalid (same as the register
            // page) so the terms error is visible on this page too.
            $('#termsCheck').addClass('is-invalid');
            valid = false;
        }

        if (!valid) return;

        // Payment method (cash | card) — UI only (already read above for card validation)
        // re-read to ensure the value is correct at submission time

        payment = $('input[name="payment"]:checked').val() || 'cash';
        clearFormAlert();

        // ---- Build the booking client-side (R1 — no backend / database) ----
        // days + totalPrice are computed here in the browser.
        var totalPrice = pricePerDay * days;

        function makeBookingId() {
            var now = new Date();
            var datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
            var rand = Math.random().toString(36).toUpperCase().slice(2, 7);
            return 'WW-' + datePart + '-' + rand;
        }

        var booking = {
            bookingId:      makeBookingId(),
            vehicleId:      bookingData.vehicleId,
            vehicleName:    bookingData.name,
            vehicleType:    bookingData.type,
            vehicleImage:   bookingData.image || '',
            customerName:   name,
            customerEmail:  email,
            customerPhone:  phone,
            pickupDate:     pick,
            returnDate:     ret,
            pickupLocation: pickLoc,
            returnLocation: retLoc,
            paymentMethod:  payment,
            days:           days,
            totalPrice:     totalPrice,
            status:         'Confirmed',
            bookingDate:    new Date()
        };

        // 1) Store the booking for the confirmation page.
        localStorage.setItem('ww_latest_booking', JSON.stringify(booking));

        // 2) Keep a copy for the My Bookings page (localStorage).
        var allBookings = [];
        try {
            allBookings = JSON.parse(localStorage.getItem('ww_bookings') || '[]');
            if (!Array.isArray(allBookings)) allBookings = [];
        } catch (e) {
            allBookings = [];
        }
        allBookings.push(booking);
        localStorage.setItem('ww_bookings', JSON.stringify(allBookings));

        // 3) Sync with Backend API asynchronously
        $.ajax({
            url: '/api/bookings',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(booking)
        }).always(function () {
            // 4) Navigate to Confirmation page
            window.location.href = 'confirmation.html';
        });
    });

    // Logout confirmation — clear the session, then go to Login
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });
});

/* =============================================
   CONFIRMATION PAGE  (frontend/confirmation.html)
   Reads the completed booking from localStorage
   key: ww_latest_booking and populates the
   summary cards. No-ops on every other page.
   ============================================= */

$(function () {

    // Bail early if this page has no confirmation elements
    if (!$('#confirmationContent').length) return;

    var latest = null;
    try {
        latest = JSON.parse(localStorage.getItem('ww_latest_booking') || 'null');
    } catch (e) {
        latest = null;
    }

    if (!latest || !latest.bookingId) {
        // No booking found — show friendly error
        $('#confirmationContent').addClass('d-none');
        $('#confirmationError').removeClass('d-none');
        return;
    }

    $('#confirmationContent').removeClass('d-none');
    $('#confirmationError').addClass('d-none');

    /* ---------- Populate fields ---------- */

    // Header
    $('#confirmationId').text(latest.bookingId);
    $('#bookingStatus').text(latest.status || 'Confirmed');

    // Vehicle
    $('#vehicleName').text(latest.vehicleName || '—');
    $('#vehicleType').text(latest.vehicleType || '—');
    $('#vehicleLocation').text(latest.pickupLocation || '—');

    // Vehicle photo
    var confImgSrc = vehicleImageFor(latest);
    if (confImgSrc && $('#confirmationImg').length) {
        $('#confirmationImg').attr('src', confImgSrc).attr('alt', latest.vehicleName || 'Vehicle');
        $('#confirmationImgWrap').show();
    }

    // Customer
    $('#summaryCusName').text(latest.customerName || '—');
    $('#summaryCusEmail').text(latest.customerEmail || '—');
    $('#summaryCusPhone').text(latest.customerPhone || '—');

    // Rental
    $('#summaryPickupDate').text(latest.pickupDate || '—');
    $('#summaryReturnDate').text(latest.returnDate || '—');
    $('#summaryPickupLoc').text(latest.pickupLocation || '—');
    $('#summaryReturnLoc').text(latest.returnLocation || '—');
    $('#summaryDays').text(latest.days || '—');

    // Payment & price
    var payText = latest.paymentMethod === 'card'
        ? 'Card Payment'
        : 'Cash on Delivery (Pay at pickup)';
    $('#summaryPayment').text(payText);
    $('#summaryPricePerDay').text('$' + (latest.totalPrice / (latest.days || 1)));
    $('#summaryDays2').text(latest.days || '—');
    $('#summaryTotal').text('$' + latest.totalPrice);

    /* ---------- Print ---------- */
    $('#btnPrint').on('click', function () {
        window.print();
    });

    /* ---------- Navigation buttons (jQuery) ---------- */
    $('.btn-action').on('click', function (e) {
        e.preventDefault();
        var href = $(this).attr('href');
        if (href) window.location.href = href;
    });

    // Logout confirmation — clear the session, then go to Login
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });
});

/* =============================================
   MY BOOKINGS PAGE  (frontend/my-bookings.html)
   Loads the user's bookings from localStorage
   (key: ww_bookings — saved by the booking form)
   and renders, filters, sorts, searches and cancels
   them. Cancellation is client-side only (updates
   ww_bookings). No backend / database (R1).
   No-ops on every other page.
   ============================================= */

$(function () {

    if (!$('#bookingsRow').length) return;

    /* ---------- State ---------- */
    var bookings = [];
    var pendingCancelId = null;
    var user = null;

    var state = {
        status: 'all',
        search: '',
        sort:   'newest'
    };

    /* ---------- Identity: read the logged-in user ---------- */
    try {
        user = JSON.parse(localStorage.getItem('ww_user') || 'null');
    } catch (e) {
        user = null;
    }

    // No signed-in user → friendly login prompt (no bookings shown).
    if (!user || !user.email) {
        showLoginRequired();
        return;
    }

    /* ---------- Friendly "please log in" state ---------- */
    function showLoginRequired() {
        $('#bookingControls').addClass('d-none');
        $('#bookingsRow').addClass('d-none');
        $('#bookingCount').text('');

        $('#bookingsEmpty').removeClass('d-none');
        $('.no-results h3').text('Please log in first');
        $('.no-results p').text('Log in to view and manage your vehicle bookings.');

        // Repurpose the empty-state action button into a login button.
        $('.no-results .btn-login')
            .attr('href', 'login.html')
            .text('Log In');
    }

    /* ---------- Load the user's bookings from localStorage ---------- */
    function loadBookings() {
        $('#bookingsRow').addClass('d-none');
        $('#bookingsEmpty').addClass('d-none');
        $('#bookingCount').text('');

        var stored = [];
        try {
            stored = JSON.parse(localStorage.getItem('ww_bookings') || '[]');
            if (!Array.isArray(stored)) stored = [];
        } catch (e) {
            stored = [];
        }
        bookings = stored;
        render();
    }

    /* ---------- Replace a booking in the local list ---------- */
    function replaceBooking(updated) {
        var found = false;
        $.each(bookings, function (i, b) {
            if (b.bookingId === updated.bookingId) {
                bookings[i] = updated;
                found = true;
                return false;
            }
        });
        if (!found) bookings.push(updated); // keep it visible as a fallback
    }

    /* ---------- Helpers ---------- */
    function statusBadge(status) {
        var cls = 'status-confirmed';
        if (status === 'Cancelled') cls = 'status-cancelled';
        else if (status === 'Completed') cls = 'status-completed';
        return '<span class="booking-status-badge ' + cls + '">' + (status || 'Confirmed') + '</span>';
    }

    function paymentText(method) {
        return method === 'card' ? 'Card Payment' : 'Cash on Delivery';
    }

    /* ---------- Filter / Search / Sort ---------- */
    function filtered() {
        var list = bookings.slice();
        var s    = state.search.toLowerCase();

        if (state.status !== 'all') {
            list = list.filter(function (b) { return b.status === state.status; });
        }

        if (s) {
            list = list.filter(function (b) {
                return (b.bookingId && b.bookingId.toLowerCase().indexOf(s) !== -1) ||
                       (b.vehicleName && b.vehicleName.toLowerCase().indexOf(s) !== -1);
            });
        }

        if (state.sort === 'newest') {
            list.sort(function (a, b) { return (b.bookingDate || '').localeCompare(a.bookingDate || ''); });
        } else if (state.sort === 'oldest') {
            list.sort(function (a, b) { return (a.bookingDate || '').localeCompare(b.bookingDate || ''); });
        } else if (state.sort === 'price-asc') {
            list.sort(function (a, b) { return (a.totalPrice || 0) - (b.totalPrice || 0); });
        } else if (state.sort === 'price-desc') {
            list.sort(function (a, b) { return (b.totalPrice || 0) - (a.totalPrice || 0); });
        }

        return list;
    }

    /* ---------- Render ---------- */
    function render() {
        var list = filtered();
        var $row = $('#bookingsRow').empty();

        if (bookings.length === 0) {
            $('#bookingCount').text('');
        } else if (list.length === bookings.length) {
            $('#bookingCount').text('Showing all ' + list.length + ' bookings.');
        } else {
            $('#bookingCount').text('Showing ' + list.length + ' of ' + bookings.length + ' bookings.');
        }

        if (list.length === 0) {
            $row.addClass('d-none');
            $('#bookingsEmpty').removeClass('d-none');
            return;
        }

        $row.removeClass('d-none');
        $('#bookingsEmpty').addClass('d-none');

        $.each(list, function (i, b) {
            $row.append(bookingCard(b));
        });
    }

    /* ---------- Single booking card ---------- */
    function bookingCard(b) {
        var status      = b.status || 'Confirmed';
        var isCancelled = (status === 'Cancelled');
        var isCompleted = (status === 'Completed');

        // Cancellation is only offered for Confirmed bookings. A
        // Completed booking can never be cancelled, and an already
        // Cancelled one is shown as such.
        var cancelBtn;
        if (isCancelled) {
            cancelBtn = '<button type="button" class="btn btn-card-action btn-disabled-action" disabled>Cancelled</button>';
        } else if (isCompleted) {
            cancelBtn = '<button type="button" class="btn btn-card-action btn-disabled-action" disabled>Completed</button>';
        } else {
            cancelBtn = '<button type="button" class="btn btn-card-action btn-cancel-action" data-id="' + b.bookingId + '">Cancel Booking</button>';
        }

        var imgSrc = vehicleImageFor(b);
        var imgHtml = imgSrc
            ? '<img src="' + imgSrc + '" alt="' + (b.vehicleName || 'Vehicle') +
              '" class="booking-card-img" loading="lazy" onerror="this.style.display=\'none\'">'
            : '';

        return '' +
        '<div class="col-12 col-md-6 col-xl-4">' +
            '<article class="booking-card h-100">' +
                imgHtml +
                '<div class="booking-card-head">' +
                    '<div class="booking-card-id">' + (b.bookingId || '—') + '</div>' +
                    statusBadge(status) +
                '</div>' +
                '<div class="booking-card-body">' +
                    '<h5 class="booking-card-title">' + (b.vehicleName || '—') + '</h5>' +
                    '<div class="booking-card-vehicle-id">Vehicle ID: ' + (b.vehicleId || '—') + '</div>' +
                    '<div class="booking-card-details">' +
                        '<div class="booking-card-row"><span>Pick-up</span><strong>' + (b.pickupDate || '—') + '</strong></div>' +
                        '<div class="booking-card-row"><span>Return</span><strong>' + (b.returnDate || '—') + '</strong></div>' +
                        '<div class="booking-card-row"><span>Pick-up loc</span><strong>' + (b.pickupLocation || '—') + '</strong></div>' +
                        '<div class="booking-card-row"><span>Return loc</span><strong>' + (b.returnLocation || '—') + '</strong></div>' +
                        '<div class="booking-card-row"><span>Days</span><strong>' + (b.days || '—') + '</strong></div>' +
                        '<div class="booking-card-row"><span>Payment</span><strong>' + paymentText(b.paymentMethod) + '</strong></div>' +
                    '</div>' +
                '</div>' +
                '<div class="booking-card-foot">' +
                    '<div class="booking-card-price">$' + (b.totalPrice || 0) + '<small>/total</small></div>' +
                    '<div class="booking-card-actions">' +
                        '<button type="button" class="btn btn-card-action btn-view-action" data-id="' + b.bookingId + '">View Details</button>' +
                        cancelBtn +
                    '</div>' +
                '</div>' +
            '</article>' +
        '</div>';
    }

    /* ---------- Modal: View Details ---------- */
    function populateModal(b) {
        var mdImgSrc = vehicleImageFor(b);
        if (mdImgSrc) {
            $('#mdImg').attr('src', mdImgSrc).attr('alt', b.vehicleName || 'Vehicle');
            $('#mdImgWrap').show();
        } else {
            $('#mdImgWrap').hide();
        }

        $('#mdVehicleName').text(b.vehicleName || '—');
        $('#mdVehicleId').text(b.vehicleId || '—');
        $('#mdCusName').text(b.customerName || '—');
        $('#mdCusEmail').text(b.customerEmail || '—');
        $('#mdCusPhone').text(b.customerPhone || '—');
        $('#mdPickupDate').text(b.pickupDate || '—');
        $('#mdReturnDate').text(b.returnDate || '—');
        $('#mdPickupLoc').text(b.pickupLocation || '—');
        $('#mdReturnLoc').text(b.returnLocation || '—');
        $('#mdDays').text(b.days || '—');
        $('#mdPayment').text(paymentText(b.paymentMethod));
        $('#mdTotal').text('$' + (b.totalPrice || 0));
        $('#mdStatus').html(statusBadge(b.status || 'Confirmed'));
        $('#mdBookingDate').text(b.bookingDate || '—');
    }

    function findBooking(id) {
        var match = null;
        $.each(bookings, function (i, b) {
            if (b.bookingId === id) { match = b; return false; }
        });
        return match;
    }

    // Delegated: View Details
    $('#bookingsRow').on('click', '.btn-view-action', function () {
        var id = $(this).data('id');
        var b  = findBooking(id);
        if (!b) return;
        populateModal(b);
        var modal = new bootstrap.Modal(document.getElementById('bookingDetailModal'));
        modal.show();
    });

    // Delegated: Cancel Booking
    $('#bookingsRow').on('click', '.btn-cancel-action', function () {
        pendingCancelId = $(this).data('id');
        $('#cancelBookingIdLabel').text(pendingCancelId);
        var modal = new bootstrap.Modal(document.getElementById('cancelModal'));
        modal.show();
    });

    $('#btnConfirmCancel').on('click', function () {
        if (!pendingCancelId) return;

        // Client-side cancel: mark the booking as Cancelled in ww_bookings.
        var updated = null;
        $.each(bookings, function (i, b) {
            if (b.bookingId === pendingCancelId) {
                b.status = 'Cancelled';
                updated = b;
                return false;
            }
        });

        if (updated) {
            // Persist back to localStorage and re-render.
            localStorage.setItem('ww_bookings', JSON.stringify(bookings));
            replaceBooking(updated);
            pendingCancelId = null;
            bootstrap.Modal.getInstance(document.getElementById('cancelModal')).hide();
            render();
        }
    });

    /* ---------- Controls ---------- */
    $('#bookingFilter').on('change', function () {
        state.status = $(this).val();
        render();
    });

    $('#bookingSort').on('change', function () {
        state.sort = $(this).val();
        render();
    });

    $('#bookingSearch').on('input', function () {
        state.search = $.trim($(this).val());
        render();
    });

    $('#btnClearBookings').on('click', function () {
        $('#bookingSearch').val('');
        $('#bookingFilter').val('all');
        $('#bookingSort').val('newest');
        state = { status: 'all', search: '', sort: 'newest' };
        render();
    });

    // Logout confirmation — clear the session, then go to Login
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });

    /* ---------- Init ---------- */
    loadBookings(); // triggers render() once the data arrives
});