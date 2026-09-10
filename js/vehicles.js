/* =============================================
   vehicles.js — Vehicle listing, filtering, sorting
   Stack: JavaScript / jQuery
   Loads vehicles from the local JSON file:
     frontend/json/vehicles.json
   No backend / MongoDB / API required (R1).
   ============================================= */

$(function () {

    var ALL_VEHICLES = [];

    // Active filter state
    var state = {
        name:     '',
        type:     '',
        location: '',
        min:      null,
        max:      null,
        sort:     'default'
    };

    /* ---------- Load vehicles from the backend API or local JSON ---------- */
    $.ajax({
        url: '/api/vehicles',
        method: 'GET',
        dataType: 'json'
    }).done(function (data) {
        var list = (data && data.vehicles) ? data.vehicles : (Array.isArray(data) ? data : []);
        if (list.length) {
            ALL_VEHICLES = list;
            buildLocationOptions(ALL_VEHICLES);
            render();
        } else {
            fallbackLocalJson();
        }
    }).fail(function () {
        fallbackLocalJson();
    });

    function fallbackLocalJson() {
        $.ajax({
            url: 'json/vehicles.json',
            method: 'GET',
            dataType: 'json'
        }).done(function (data) {
            var list = (data && data.vehicles) ? data.vehicles : (Array.isArray(data) ? data : []);
            if (list.length) {
                ALL_VEHICLES = list;
                buildLocationOptions(ALL_VEHICLES);
                render();
            } else {
                $('#vehiclesRow').html(
                    '<p class="col-12 text-center text-muted py-4">Could not load the vehicle catalogue.</p>'
                );
            }
        }).fail(function () {
            $('#vehiclesRow').html(
                '<p class="col-12 text-center text-muted py-4">Could not load the vehicle catalogue.</p>'
            );
        });
    }

    // Populate the Location dropdown from the data (unique, sorted)
    function buildLocationOptions(list) {
        var locations = list
            .map(function (v) { return v.location; })
            .filter(function (loc, i, arr) { return arr.indexOf(loc) === i; })
            .sort();

        var $sel = $('#filterLocation');
        $sel.empty().append('<option value="">All Locations</option>');
        $.each(locations, function (i, loc) {
            $sel.append('<option value="' + loc + '">' + loc + '</option>');
        });
    }

    /* ---------- Rendering helpers ---------- */

    function vehicleCard(v) {
        var avail = v.availability
            ? '<span class="avail-badge available">Available</span>'
            : '<span class="avail-badge unavailable">Unavailable</span>';
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
                        '<div class="d-flex justify-content-between align-items-center mb-1">' +
                            '<span class="vehicle-meta">' + v.seats + ' Seats &middot; ' + v.transmission + '</span>' +
                            avail +
                        '</div>' +
                        '<div class="vehicle-meta mb-3">' + v.location + '</div>' +
                        '<div class="d-flex justify-content-between align-items-center">' +
                            '<p class="vehicle-price">$' + v.pricePerDay + '<small>/day</small></p>' +
                            '<button type="button" class="btn btn-view" data-id="' + v.vehicleId + '">View Details</button>' +
                        '</div>' +
                    '</div>' +
                '</article>' +
            '</div>';
    }

    /* ---------- Filtering ---------- */
    function matches(v) {
        if (state.name && v.name.toLowerCase().indexOf(state.name.toLowerCase()) === -1) {
            return false;
        }
        if (state.type && v.type.toLowerCase() !== state.type.toLowerCase()) {
            return false;
        }
        if (state.location && v.location.toLowerCase() !== state.location.toLowerCase()) {
            return false;
        }
        if (state.min != null && !isNaN(state.min) && v.pricePerDay < state.min) {
            return false;
        }
        if (state.max != null && !isNaN(state.max) && v.pricePerDay > state.max) {
            return false;
        }
        return true;
    }

    /* ---------- Sorting ---------- */
    function sorted(list) {
        var clone = list.slice(); // do not mutate the source array

        if (state.sort === 'price-asc')       { return clone.sort(function (a, b) { return a.pricePerDay - b.pricePerDay; }); }
        if (state.sort === 'price-desc')      { return clone.sort(function (a, b) { return b.pricePerDay - a.pricePerDay; }); }
        if (state.sort === 'name-asc')        { return clone.sort(function (a, b) { return a.name.localeCompare(b.name); }); }
        return clone; // 'default' — catalogue order
    }

    /* ---------- Render ---------- */
    function render() {
        var filtered = ALL_VEHICLES.filter(matches);
        var result   = sorted(filtered);

        var $row = $('#vehiclesRow');
        $row.empty();

        $.each(result, function (i, v) {
            $row.append(vehicleCard(v));
        });

        // Count line
        $('#vehiclesCount').text(
            result.length === ALL_VEHICLES.length
                ? 'Showing all ' + result.length + ' vehicles.'
                : 'Showing ' + result.length + ' of ' + ALL_VEHICLES.length + ' vehicles.'
        );

        // Empty state
        $('#vehiclesEmpty').toggleClass('d-none', result.length > 0);
    }

    /* ---------- Read the form into state ---------- */
    function readInputs() {
        var min = parseFloat($('#filterMinPrice').val());
        var max = parseFloat($('#filterMaxPrice').val());

        state.name     = $.trim($('#filterName').val());
        state.type     = $.trim($('#filterType').val());
        state.location = $.trim($('#filterLocation').val());
        state.min      = isNaN(min) ? null : min;
        state.max      = isNaN(max) ? null : max;
    }

    function clearFilters() {
        $('#filterForm')[0].reset();
        state = {
            name: '', type: '', location: '',
            min: null, max: null, sort: state.sort
        };
        render();
    }

    /* ---------- Events ---------- */
    $('#filterForm').on('submit', function (e) {
        e.preventDefault();

        // Validate price range
        var minRaw = $.trim($('#filterMinPrice').val());
        var maxRaw = $.trim($('#filterMaxPrice').val());
        var $filterAlert = $('#filterAlert');

        var minVal = minRaw !== '' ? parseFloat(minRaw) : NaN;
        var maxVal = maxRaw !== '' ? parseFloat(maxRaw) : NaN;

        if (minRaw !== '' && (isNaN(minVal) || minVal < 0)) {
            $filterAlert.text('Minimum price must be 0 or greater.').removeClass('d-none');
            return;
        }
        if (maxRaw !== '' && (isNaN(maxVal) || maxVal < 0)) {
            $filterAlert.text('Maximum price must be 0 or greater.').removeClass('d-none');
            return;
        }
        if (!isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
            $filterAlert.text('Minimum price cannot be greater than maximum price.').removeClass('d-none');
            return;
        }

        $filterAlert.addClass('d-none');
        readInputs();
        render();
    });

    $('#btnClearFilters').on('click', function () {
        $('#filterAlert').addClass('d-none');
        clearFilters();
    });
    $('#btnClearEmpty').on('click', function () {
        $('#filterAlert').addClass('d-none');
        clearFilters();
    });

    $('#sortVehicles').on('change', function () {
        state.sort = $(this).val();
        render();
    });

    // View Details → save id, go to vehicle-details.html
    $('#vehiclesRow').on('click', '.btn-view', function () {
        localStorage.setItem('ww_selected_vehicle', $(this).data('id'));
        window.location.href = 'vehicle-details.html';
    });

    // Logout confirmation — clear the session, then go to Login
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });
});

$(function () {

    /* =========================================
       VEHICLE DETAILS PAGE  (frontend/vehicle-details.html)
       Reads the selected id from localStorage
       key: ww_selected_vehicle, then finds the
       vehicle in the local JSON file:
         frontend/json/vehicles.json
       No backend / MongoDB / API required (R1).
       ========================================= */

    var currentVehicle = null;
    var $content = $('#detailsContent');
    var $error   = $('#detailsError');

    // Small shared helpers local to this page

    function showError(message) {
        $('#errorTitle').text('Vehicle not found');
        $('#errorMessage').text(message);
        $content.addClass('d-none');
        $error.removeClass('d-none');
    }

    // ----- Load the selected vehicle -----
    var vehicleId = parseInt(localStorage.getItem('ww_selected_vehicle'), 10);

    if (!vehicleId) {
        showError('No vehicle was selected. Please choose a vehicle from the listing to view its details.');
    } else {
        // Try backend API first, fallback to JSON
        $.ajax({
            url: '/api/vehicles/' + vehicleId,
            method: 'GET',
            dataType: 'json'
        }).done(function (res) {
            if (res && res.success && res.vehicle) {
                currentVehicle = res.vehicle;
                populate(res.vehicle);
            } else {
                fallbackDetailsLocalJson();
            }
        }).fail(function () {
            fallbackDetailsLocalJson();
        });
    }

    function fallbackDetailsLocalJson() {
        $.ajax({
            url: 'json/vehicles.json',
            method: 'GET',
            dataType: 'json'
        }).done(function (data) {
            var list = (data && data.vehicles) ? data.vehicles : (Array.isArray(data) ? data : []);
            var vehicle = null;
            $.each(list, function (i, v) {
                if (v.vehicleId === vehicleId) { vehicle = v; return false; }
            });
            if (vehicle) {
                currentVehicle = vehicle;
                populate(vehicle);
            } else {
                showError('We could not find the selected vehicle. It may no longer be available.');
            }
        }).fail(function () {
            showError('Could not load the vehicle catalogue. Please try again.');
        });
    }

    // ----- Fill in every section -----
    function populate(v) {
        // Visual tile — real vehicle photo
        var imgSrc = v.image || 'images/vehicles/camry.jpg';
        $('#detailTile').html(
            '<img src="' + imgSrc + '" alt="' + v.name + '" class="detail-tile-img" onerror="this.src=\'images/vehicles/camry.jpg\'">'
        );

        // Heading + badges
        $('#detailName').text(v.name);
        $('#detailType').text(v.type);
        $('#detailLocation').text(v.location + ' · ' + v.type);
        $('#detailAvailability')
            .removeClass('available unavailable')
            .addClass(v.availability ? 'available' : 'unavailable')
            .text(v.availability ? 'Available' : 'Unavailable');

        if (!v.availability) {
            $('#btnBookNow').prop('disabled', true).text('Currently Unavailable');
        } else {
            $('#btnBookNow').prop('disabled', false).text('Book Now');
        }

        // Description
        $('#detailDescription').text(v.description || 'No description available for this vehicle.');

        // Specifications
        $('#specSeats').text(v.seats + ' Seats');
        $('#specTransmission').text(v.transmission);
        $('#specFuel').text(v.fuelType || '—');
        $('#specYear').text(v.year || '—');

        // Features
        var features = v.features || [];
        if (features.length) {
            var $ul = $('#detailFeatures').empty();
            $.each(features, function (i, feature) {
                $ul.append('<li>' + feature + '</li>');
            });
        } else {
            $('#featuresCard').addClass('d-none');
        }

        // Summary defaults
        $('#summaryPrice').text('$' + v.pricePerDay + ' / day');
        $('#daysInput').val(1);

        // Reveal content
        $error.addClass('d-none');
        $content.removeClass('d-none');

        updateTotal();
    }

    // ----- Estimated total = price per day × days -----
    function updateTotal() {
        var price = currentVehicle ? (currentVehicle.pricePerDay || 0) : 0;
        var days  = parseInt($('#daysInput').val(), 10);

        clearDaysError();

        if (!currentVehicle || isNaN(days) || days < 1) {
            $('#summaryTotal').text('—');
            return;
        }
        $('#summaryTotal').text('$' + (price * days));
    }

    $('#daysInput').on('input change', updateTotal);

    $('#btnBookNow').on('click', function () {
        if (!currentVehicle) return;

        var days = parseInt($('#daysInput').val(), 10);

        // Validate: at least 1 day
        if (isNaN(days) || days < 1) {
            $('#daysError').text('Enter at least 1 day.').addClass('show');
            $('#daysInput').addClass('is-invalid').trigger('focus');
            return;
        }

        // Store everything the booking page needs
        var booking = {
            vehicleId:   currentVehicle.vehicleId,
            name:        currentVehicle.name,
            type:        currentVehicle.type,
            pricePerDay: currentVehicle.pricePerDay,
            seats:       currentVehicle.seats,
            location:    currentVehicle.location,
            image:       currentVehicle.image || '',
            days:        days,
            total:       currentVehicle.pricePerDay * days
        };
        localStorage.setItem('ww_booking', JSON.stringify(booking));

        window.location.href = 'booking.html';
    });

    function clearDaysError() {
        $('#daysError').removeClass('show').text('');
        $('#daysInput').removeClass('is-invalid');
    }

    // Logout confirmation — clear the session, then go to Login
    $('#btnLogout').on('click', function () {
        if (window.confirm('Are you sure you want to log out of WheelWise?')) {
            localStorage.removeItem('ww_user');
            window.location.href = 'login.html';
        }
    });
});