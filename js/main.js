/* =============================================
   main.js — App-wide logic
   Stack: JavaScript / jQuery
   ============================================= */

$(function () {
    /* =========================================
       SPLASH SCREEN  (frontend/index.html)
       Auto-navigates to login.html after a
       short delay, or on "Continue" click.
       Only runs on the index splash page.
       ========================================= */

    // Only run splash logic on index.html
    if (!$('#splashProgress').length) return;

    var SPLASH_DELAY = 2600; // ms — how long the loader runs
    var REDIRECT_URL  = 'login.html';

    // Avoid double-navigation if the page is reloaded mid-redirect
    if (window.location.pathname.endsWith(REDIRECT_URL)) {
        return;
    }

    // Utility: send the user to the login page
    var goToLogin = function () {
        window.location.href = REDIRECT_URL;
    };

    // 1. Animate the loading progress bar (0 → 100%)
    $('#splashProgress')
        .css('width', '0%')
        .animate({ width: '100%' }, SPLASH_DELAY, 'linear', function () {
            $('#splashStatus').text('Ride ready — taking you in…');
        });

    // 2. Rotate status messages during load
    var statusSteps = ['Starting engine…', 'Checking vehicles…', 'Almost there…'];
    $.each(statusSteps, function (i, message) {
        setTimeout(function () {
            $('#splashStatus').text(message);
        }, (i + 1) * (SPLASH_DELAY / (statusSteps.length + 1)));
    });

    // 3. Auto-navigate after the short delay
    var autoTimer = setTimeout(function () {
        goToLogin();
    }, SPLASH_DELAY + 400);

    // 4. Manual "Continue" button — instant navigation
    $('#btnContinue').on('click', function () {
        clearTimeout(autoTimer);
        goToLogin();
    });
});

$(function () {

    /* =========================================
       HOME PAGE  (frontend/home.html)
       Reads vehicles from local JSON:
       json/vehicles.json
       ========================================= */

    var VEHICLES = [];

    // ------------- Data: load vehicles from local JSON -------------
    $.ajax({
        url: 'json/vehicles.json',
        method: 'GET',
        dataType: 'json'
    }).done(function (data) {
        VEHICLES = (data && data.vehicles) || (Array.isArray(data) ? data : []);
        renderVehicles(VEHICLES);

        // Update hero vehicle count
        var $stat = $('#heroVehicleCount');
        if ($stat.length) {
            $stat.text(VEHICLES.length);
        }
    }).fail(function () {
        $('#featuredRow').html(
            '<p class="col-12 text-center text-muted py-4">Could not load the vehicle catalogue.</p>'
        );
    });

    // ------------- Rendering -------------
    function vehicleCard(v) {
        var imgSrc = v.image || 'images/vehicles/camry.jpg';
        return '' +
            '<div class="col-12 col-sm-6 col-lg-4 col-xl-3">' +
                '<article class="vehicle-card h-100">' +
                    '<div class="vehicle-tile-wrap">' +
                        '<img src="' + imgSrc + '" alt="' + v.name + '" class="vehicle-tile-img" loading="lazy" onerror="this.src=\'images/vehicles/camry.jpg\'">' +
                    '</div>' +
                    '<div class="p-3">' +
                        '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">' +
                            '<h5 class="vehicle-name mb-0">' + v.name + '</h5>' +
                            '<span class="type-badge">' + v.type + '</span>' +
                        '</div>' +
                        '<div class="vehicle-meta">' +
                            v.seats + ' Seats &middot; ' + v.transmission + ' &middot; ' + v.location +
                        '</div>' +
                        '<div class="d-flex justify-content-between align-items-center mt-3">' +
                            '<p class="vehicle-price">$' + v.pricePerDay + '<small>/day</small></p>' +
                            '<button type="button" class="btn btn-view" data-id="' + v.vehicleId + '">View Details</button>' +
                        '</div>' +
                    '</div>' +
                '</article>' +
            '</div>';
    }

    function renderVehicles(list) {
        var $row = $('#featuredRow');
        $row.empty();

        $.each(list, function (i, v) {
            $row.append(vehicleCard(v));
        });

        // Status line
        if (list.length === VEHICLES.length) {
            $('#searchCount').text('Showing all ' + list.length + ' vehicles.');
        } else {
            $('#searchCount').text('Showing ' + list.length + ' of ' + VEHICLES.length + ' vehicles.');
        }

        // Empty state
        $('#featuredEmpty').toggleClass('d-none', list.length > 0);
    }

    // ------------- Search / filter -------------
    $('#searchForm').on('submit', function (e) {
        e.preventDefault();

        var type = $.trim($('#searchType').val());
        var loc  = $.trim($('#searchLocation').val()).toLowerCase();

        var filtered = VEHICLES.filter(function (v) {
            var matchType = !type || v.type.toLowerCase() === type.toLowerCase();
            var matchLoc  = !loc ||
                (v.name + ' ' + v.type + ' ' + v.location).toLowerCase().indexOf(loc) !== -1;
            return matchType && matchLoc;
        });

        renderVehicles(filtered);

        // Update hero vehicle count
        var $stat = $('#heroVehicleCount');
        if ($stat.length) {
            $stat.text(filtered.length);
        }
    });

    // Reset filters (clear) on the location/type when empty submitted
    $('#searchType, #searchLocation').on('input change', function () {
        var type = $.trim($('#searchType').val());
        var loc  = $.trim($('#searchLocation').val());
        if (!type && !loc) {
            renderVehicles(VEHICLES); // back to full list
        }
    });

    // Fill sensible date defaults
    function toDateInput(d) { return d.toISOString().split('T')[0]; }
    var today = new Date();
    $('#pickupDate').val(toDateInput(today));
    var later = new Date();
    later.setDate(today.getDate() + 2);
    $('#returnDate').val(toDateInput(later));

    // ------------- View Details → vehicle-details.html -------------
    // Stores the vehicleId in ww_selected_vehicle, then the
    // details page loads vehicle data from json/vehicles.json.
    $('#featuredRow').on('click', '.btn-view', function () {
        var id = $(this).data('id');
        localStorage.setItem('ww_selected_vehicle', id);
        window.location.href = 'vehicle-details.html';
    });

    // ------------- Logout (with confirmation) -------------
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });
});