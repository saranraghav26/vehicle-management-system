/* =============================================
   auth.js — Login / Register / Profile logic
   Stack: JavaScript / jQuery + localStorage
   R1 ONLY — no backend, no MongoDB, no API calls.

   Auth is handled entirely client-side:
     - Register: stores hashed-enough credentials in
       localStorage key ww_accounts (array).
     - Login: looks up the account in ww_accounts,
       stores safe user fields in ww_user.
     - Profile: reads/writes ww_user in localStorage.
     - Change password: updates ww_accounts entry.

   Passwords are salted + hashed with a simple
   client-side digest (SHA-256 via SubtleCrypto)
   so they are never stored as plaintext.
   This is appropriate for a course R1 project.
   ============================================= */

/* ---------- Shared UI helpers (used by login + register) ---------- */

/* Show (or update) a Bootstrap alert inside a form.
   type: 'danger' (errors) or 'success' (success messages). */
function wwShowAlert($form, type, message) {
    var $alert = $form.find('.ww-auth-alert');
    if (!$alert.length) {
        $alert = $('<div class="alert ww-auth-alert py-2" role="alert"></div>');
        $form.prepend($alert);
    }
    $alert
        .removeClass('alert-danger alert-success')
        .addClass('alert-' + type)
        .html(message);
}

/* Remove any previously shown auth alert. */
function wwHideAlert($form) {
    $form.find('.ww-auth-alert').remove();
}

/* Disable a submit button and show a spinner while a request runs. */
function wwSetBusy($btn, label) {
    $btn.prop('disabled', true)
        .data('ww-label', label)
        .html('<span class="spinner-border spinner-border-sm me-2"></span>' + label);
}

/* Re-enable a submit button and restore its normal label. */
function wwSetIdle($btn) {
    var label = $btn.data('ww-label') || 'Submit';
    $btn.prop('disabled', false).text(label);
}

/* ---------- localStorage account helpers ---------- */

/* Load the accounts array from localStorage. */
function wwLoadAccounts() {
    try {
        var raw = localStorage.getItem('ww_accounts');
        var parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/* Save the accounts array back to localStorage. */
function wwSaveAccounts(accounts) {
    localStorage.setItem('ww_accounts', JSON.stringify(accounts));
}

/* Find an account by email (case-insensitive). Returns the object or null. */
function wwFindAccount(email) {
    var accounts = wwLoadAccounts();
    var target = email.trim().toLowerCase();
    for (var i = 0; i < accounts.length; i++) {
        if (accounts[i].email.toLowerCase() === target) return accounts[i];
    }
    return null;
}

/* ---------- Simple password security (SubtleCrypto SHA-256) ---------- */
/* Returns a Promise that resolves to "salt:hex-hash". */
function wwHashPassword(password, salt) {
    salt = salt || Math.random().toString(36).slice(2) + Date.now().toString(36);
    var input = salt + ':' + password;
    var encoded = new TextEncoder().encode(input);
    return crypto.subtle.digest('SHA-256', encoded).then(function (buf) {
        var hex = Array.from(new Uint8Array(buf))
            .map(function (b) { return ('00' + b.toString(16)).slice(-2); })
            .join('');
        return salt + ':' + hex;
    });
}

/* Verify password against a stored "salt:hash" string. Returns a Promise<boolean>. */
function wwVerifyPassword(password, stored) {
    if (typeof stored !== 'string' || stored.indexOf(':') === -1) {
        return Promise.resolve(false);
    }
    var salt = stored.split(':')[0];
    return wwHashPassword(password, salt).then(function (computed) {
        return computed === stored;
    });
}

$(function () {

    /* =========================================
       LOGIN PAGE  (frontend/login.html)
       ========================================= */

    // 1. Pre-fill email if it was remembered earlier
    var savedEmail = localStorage.getItem('ww_remember_email');
    if (savedEmail) {
        $('#loginEmail').val(savedEmail);
        $('#rememberMe').prop('checked', true);
    }

    // 2. Show / hide password toggle
    $('#togglePassword').on('click', function () {
        var $input = $('#loginPassword');
        var isPassword = $input.attr('type') === 'password';

        $input.attr('type', isPassword ? 'text' : 'password');

        // Swap the eye / eye-off icons
        $('#iconEyeShow').toggle(isPassword);
        $('#iconEyeHide').toggle(!isPassword);

        // Keep the caret at the end of the field
        $input.trigger('focus');
    });

    // 3. "Forgot Password?" — info only
    $('#forgotLink').on('click', function (e) {
        e.preventDefault();
        $('#forgotAlert').removeClass('d-none');
    });

    // 4. Clear an error as soon as the user types
    $('#loginEmail, #loginPassword').on('input', function () {
        var $group = $(this).closest('.mb-3');
        $group.removeClass('has-error');
        $(this).removeClass('is-invalid');
    });

    // 5. Submit — validate, then authenticate against localStorage accounts
    $('#loginForm').on('submit', function (e) {
        e.preventDefault();

        var $form    = $(this);
        var email    = $.trim($('#loginEmail').val());
        var password = $('#loginPassword').val();
        var valid    = true;

        resetErrors();
        wwHideAlert($form);

        // --- Email validation ---
        if (email === '') {
            setError('#loginEmail', 'Email is required.');
            valid = false;
        } else if (!isValidEmail(email)) {
            setError('#loginEmail', 'Please enter a valid email address.');
            valid = false;
        }

        // --- Password validation ---
        if (password === '') {
            setError('#loginPassword', 'Password is required.');
            valid = false;
        } else if (password.length < 6) {
            setError('#loginPassword', 'Password must be at least 6 characters.');
            valid = false;
        }

        if (!valid) return; // errors shown — do not submit

        // Remember me: persist the email in localStorage
        if ($('#rememberMe').is(':checked')) {
            localStorage.setItem('ww_remember_email', email);
        } else {
            localStorage.removeItem('ww_remember_email');
        }

        // Show the loading state on the button
        var $btn = $('#btnLogin');
        wwSetBusy($btn, 'Signing in&hellip;');

        // Look up the account in localStorage
        var account = wwFindAccount(email);
        if (!account) {
            wwShowAlert($form, 'danger', 'Invalid email or password.');
            wwSetIdle($btn);
            return;
        }

        // Verify the password asynchronously
        wwVerifyPassword(password, account.passwordHash).then(function (ok) {
            if (ok) {
                // Store ONLY safe user info — never the password hash
                localStorage.setItem('ww_user', JSON.stringify({
                    name:  account.name,
                    email: account.email,
                    phone: account.phone
                }));
                window.location.href = 'home.html';
            } else {
                wwShowAlert($form, 'danger', 'Invalid email or password.');
                wwSetIdle($btn);
            }
        });
    });

    /* ---------- Validation helpers ---------- */

    function isValidEmail(email) {
        // Simple but solid email format check
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    }

    function setError(inputSelector, message) {
        // Mark the field + its feedback under the same group
        var $input = $(inputSelector);
        $input.addClass('is-invalid');
        $input.closest('.mb-3').addClass('has-error')
              .find('.invalid-feedback').text(message);
    }

    function resetErrors() {
        $('#loginEmail, #loginPassword').closest('.mb-3')
            .removeClass('has-error')
            .find('.invalid-feedback').text('');
        $('#loginEmail, #loginPassword').removeClass('is-invalid');
    }
});

$(function () {

    /* =========================================
       REGISTER PAGE  (frontend/register.html)
       ========================================= */

    // 1. Show / hide "Password" field
    $('#toggleRegPassword').on('click', function () {
        var $input = $('#regPassword');
        var isPassword = $input.attr('type') === 'password';
        $input.attr('type', isPassword ? 'text' : 'password');
        $('#regIconEyeShow').toggle(isPassword);
        $('#regIconEyeHide').toggle(!isPassword);
        $input.trigger('focus');
    });

    // 2. Show / hide "Confirm Password" field
    $('#toggleRegConfirm').on('click', function () {
        var $input = $('#regConfirm');
        var isPassword = $input.attr('type') === 'password';
        $input.attr('type', isPassword ? 'text' : 'password');
        $('#regConfirmIconEyeShow').toggle(isPassword);
        $('#regConfirmIconEyeHide').toggle(!isPassword);
        $input.trigger('focus');
    });

    // 3. Terms & Conditions links — informational
    $('#termsGroup a').on('click', function (e) {
        e.preventDefault();
    });

    // 4. REAL-TIME validation while typing / changing
    $('#regName, #regEmail, #regPhone, #regPassword, #regConfirm')
        .on('input', function () {
            liveCheck($(this));
        })
        .on('blur', function () {
            liveCheck($(this), true);
        });
    $('#termsCheck').on('change', function () {
        liveCheck($(this), true);
    });

    // 5. Submit — validate everything, then register in localStorage
    $('#regForm').on('submit', function (e) {
        e.preventDefault();

        var $form = $(this);

        var valid = true;
        valid = validateField('nameGroup')        && valid;
        valid = validateField('regEmailGroup')    && valid;
        valid = validateField('phoneGroup')       && valid;
        valid = validateField('regPasswordGroup') && valid;
        valid = validateField('regConfirmGroup')  && valid;
        valid = validateField('termsGroup')       && valid;

        if (!valid) return; // errors shown — do not submit

        wwHideAlert($form);

        var email = $.trim($('#regEmail').val()).toLowerCase();

        // Duplicate email check
        if (wwFindAccount(email)) {
            wwShowAlert($form, 'danger', 'An account with this email already exists.');
            return;
        }

        // Show the loading state on the button
        var $btn = $('#btnRegister');
        wwSetBusy($btn, 'Creating account&hellip;');

        var name  = $.trim($('#regName').val());
        var phone = $.trim($('#regPhone').val());
        var pass  = $('#regPassword').val();

        // Hash the password, then store the account in localStorage
        wwHashPassword(pass).then(function (hash) {
            var accounts = wwLoadAccounts();
            accounts.push({
                name:         name,
                email:        email,
                phone:        phone,
                passwordHash: hash,
                createdAt:    new Date().toISOString()
            });
            wwSaveAccounts(accounts);

            // Success — show a message, then go to the login page
            wwShowAlert($form, 'success', 'Account created! Redirecting to login&hellip;');
            setTimeout(function () {
                window.location.href = 'login.html';
            }, 1200);
        }).catch(function () {
            wwShowAlert($form, 'danger', 'Registration failed. Please try again.');
            wwSetIdle($btn);
        });
    });

    /* ---------- Register validation helpers ---------- */

    // Re-validate a single field as the user types / on blur
    function liveCheck($el, force) {
        var $group = $el.closest('.mb-3');
        // Only re-check if the field is already flagged, or we were asked to
        if (force || $group.hasClass('has-error') || $el.hasClass('is-valid')) {
            validateField($group.attr('id'));
        }
    }

    function validateField(groupId) {
        var value, ok = false, msg = '';

        switch (groupId) {
            case 'nameGroup':
                value = $.trim($('#regName').val());
                if (value === '') {
                    msg = 'Full name is required.';
                } else if (value.length < 2) {
                    msg = 'Full name must be at least 2 characters.';
                } else if (/^\d+$/.test(value)) {
                    msg = 'Name cannot contain only numbers.';
                } else if (/^[^a-zA-Z]+$/.test(value)) {
                    msg = 'Please enter a valid name (letters only).';
                } else if (/^(.)\1+$/.test(value)) {
                    msg = 'Please enter a meaningful name.';
                } else {
                    ok = true;
                }
                break;

            case 'regEmailGroup':
                value = $.trim($('#regEmail').val());
                if (value === '') {
                    msg = 'Email is required.';
                } else if (!isValidEmail(value)) {
                    msg = 'Please enter a valid email address.';
                } else {
                    ok = true;
                }
                break;

            case 'phoneGroup':
                value = $.trim($('#regPhone').val());
                if (value === '') {
                    msg = 'Phone number is required.';
                } else if (!isValidPhone(value)) {
                    msg = 'Please enter a valid phone number.';
                } else {
                    ok = true;
                }
                break;

            case 'regPasswordGroup':
                value = $('#regPassword').val();
                if (value === '') {
                    msg = 'Password is required.';
                } else if (value.length < 6) {
                    msg = 'Password must be at least 6 characters.';
                } else {
                    ok = true;
                }
                break;

            case 'regConfirmGroup':
                value = $('#regConfirm').val();
                if (value === '') {
                    msg = 'Please confirm your password.';
                } else if (value !== $('#regPassword').val()) {
                    msg = 'Passwords do not match.';
                } else {
                    ok = true;
                }
                break;

            case 'termsGroup':
                ok = $('#termsCheck').is(':checked');
                msg = ok ? '' : 'You must accept the Terms & Conditions to continue.';
                break;
        }

        applyResult(groupId, ok, msg);
        return ok;
    }

    function applyResult(groupId, ok, msg) {
        var $group = $('#' + groupId);
        var $field = $group.find('.form-control, .form-check-input');

        $group.removeClass('has-error');
        $group.find('.invalid-feedback').text(msg);

        if (ok) {
            $field.addClass('is-valid').removeClass('is-invalid');
        } else {
            $field.addClass('is-invalid').removeClass('is-valid');
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    }

    function isValidPhone(phone) {
        // Ignore spaces, hyphens, parentheses, leading '+'
        var digits = phone.replace(/[^\d]/g, '');
        return digits.length >= 10 && digits.length <= 15;
    }
});

/* =============================================
   PROFILE PAGE  (frontend/profile.html)
   Reads the logged-in user from ww_user
   (localStorage) and lets the user update
   name + phone via ww_accounts + ww_user.
   Change password updates ww_accounts.
   No backend / MongoDB / API (R1 only).
   No-ops on every other page.
   ============================================= */

$(function () {

    if (!$('#profileContent').length && !$('#profileError').length) return;

    /* ---------- Read / write localStorage ---------- */
    var user = null;

    function loadUser() {
        try {
            user = JSON.parse(localStorage.getItem('ww_user') || 'null');
        } catch (e) {
            user = null;
        }
        if (!user || typeof user !== 'object') user = null;
    }

    function saveUser() {
        localStorage.setItem('ww_user', JSON.stringify(user));
    }

    /* ---------- Show a friendly error state ---------- */
    function showProfileError(title, message) {
        $('#profileContent').addClass('d-none');
        $('#profileError').removeClass('d-none');
        $('#profileError .no-results h3').text(title);
        $('#profileError .no-results p').text(message);
    }

    /* ---------- Shared helpers ---------- */
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    }

    function isValidPhone(phone) {
        var digits = phone.replace(/[^\d]/g, '');
        return digits.length >= 10 && digits.length <= 15;
    }

    function initialsOf(name) {
        var parts = $.trim(name || '').split(/\s+/).filter(function (p) { return p.length > 0; });
        if (!parts.length) return '—';
        var first = parts[0].charAt(0);
        var last  = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
    }

    function setError(groupId, message) {
        var $group = $('#' + groupId);
        $group.addClass('has-error')
              .find('.invalid-feedback').text(message);
        $group.find('.form-control').addClass('is-invalid');
    }

    function clearFieldError($el) {
        var $group = $el.closest('.mb-3');
        $group.removeClass('has-error')
              .find('.invalid-feedback').text('');
        $el.removeClass('is-invalid');
    }

    /* ---------- No signed-in user — existing friendly login state ---------- */
    loadUser();

    if (!user || !user.email) {
        $('#profileContent').addClass('d-none');
        $('#profileError').removeClass('d-none');
        return;
    }

    /* =========================================
       LOAD the profile from localStorage
       ========================================= */
    $('#profileContent').removeClass('d-none');
    bootProfile();

    /* =========================================
       PROFILE COMPONENTS
       ========================================= */
    function bootProfile() {
        displayProfile();

        /* ============ DISPLAY the profile ============ */
        function displayProfile() {
            $('#avatarInitials').text(initialsOf(user.name));
            $('#avatarName').text(user.name || '—');
            $('#avatarEmail').text(user.email || '—');
            $('#pvName').text(user.name || '—');
            $('#pvEmail').text(user.email || '—');
            $('#pvPhone').text(user.phone || '—');
        }

        /* ---------- Edit profile mode ---------- */
        function enterViewMode() {
            $('#profileView').removeClass('d-none');
            $('#profileEditForm').addClass('d-none');
            $('#btnEditProfile').prop('disabled', false).text('Edit Profile');
        }

        function enterEditMode() {
            // Pre-fill from the current user
            $('#pfName').val(user.name || '');
            $('#pfEmail').val(user.email || '');
            $('#pfPhone').val(user.phone || '');

            $('#profileView').addClass('d-none');
            $('#profileEditForm').removeClass('d-none');
            $('#btnEditProfile').prop('disabled', true).text('Editing…');
        }

        // The email cannot be changed — shown read-only
        $('#pfEmail').prop('readonly', true);

        $('#btnEditProfile').on('click', enterEditMode);

        $('#btnCancelProfile').on('click', function () {
            enterViewMode();
        });

        // Live clear of errors while editing
        $('#pfName, #pfEmail, #pfPhone').on('input', function () {
            clearFieldError($(this));
        });

        /* ---------- Save profile ---------- */
        $('#profileEditForm').on('submit', function (e) {
            e.preventDefault();

            var name  = $.trim($('#pfName').val());
            var email = $.trim($('#pfEmail').val());
            var phone = $.trim($('#pfPhone').val());
            var valid = true;

            // Validation
            if (name === '') {
                setError('editNameGroup', 'Full name is required.');
                valid = false;
            } else if (name.length < 2) {
                setError('editNameGroup', 'Full name must be at least 2 characters.');
                valid = false;
            } else if (/^\d+$/.test(name)) {
                setError('editNameGroup', 'Name cannot contain only numbers.');
                valid = false;
            } else if (/^[^a-zA-Z]+$/.test(name)) {
                setError('editNameGroup', 'Please enter a valid name (letters only).');
                valid = false;
            } else if (/^(.)\1+$/.test(name)) {
                setError('editNameGroup', 'Please enter a meaningful name.');
                valid = false;
            }
            if (email === '') {
                setError('editEmailGroup', 'Email is required.');
                valid = false;
            } else if (!isValidEmail(email)) {
                setError('editEmailGroup', 'Please enter a valid email address.');
                valid = false;
            }
            if (phone === '') {
                setError('editPhoneGroup', 'Phone number is required.');
                valid = false;
            } else if (!isValidPhone(phone)) {
                setError('editPhoneGroup', 'Please enter a valid phone number (10–15 digits).');
                valid = false;
            }

            if (!valid) return;

            var $btn = $('#btnSaveProfile');
            $btn.prop('disabled', true).html(
                '<span class="spinner-border spinner-border-sm me-2"></span>Saving&hellip;'
            );
            wwHideAlert($('#profileEditForm'));

            // Update name + phone in localStorage (email is never changed)
            var accounts = wwLoadAccounts();
            var targetEmail = user.email.toLowerCase();
            for (var i = 0; i < accounts.length; i++) {
                if (accounts[i].email.toLowerCase() === targetEmail) {
                    accounts[i].name  = name;
                    accounts[i].phone = phone;
                    break;
                }
            }
            wwSaveAccounts(accounts);

            // Update ww_user with the new safe fields
            user.name  = name;
            user.phone = phone;
            saveUser();

            displayProfile();
            enterViewMode();

            // Success alert (show + auto dismiss)
            var $alert = $('#profileSuccessAlert');
            $alert.addClass('show');
            setTimeout(function () { $alert.removeClass('show'); }, 3000);

            $btn.prop('disabled', false).text('Save Changes');
        });

        /* ============ CHANGE PASSWORD (localStorage) ============ */
        function refreshPasswordCard() {
            $('#passwordForm').removeClass('d-none');
            $('#passwordInfoAlert').addClass('d-none');
        }

        refreshPasswordCard();

        // Password show / hide toggles
        function bindToggle($btn, $input) {
            $btn.on('click', function () {
                var isPassword = $input.attr('type') === 'password';
                $input.attr('type', isPassword ? 'text' : 'password');
                $btn.text(isPassword ? 'Hide' : 'Show');
                $input.trigger('focus');
            });
        }

        bindToggle($('#btnToggleCurrent'), $('#pwCurrent'));
        bindToggle($('#btnToggleNew'),     $('#pwNew'));
        bindToggle($('#btnToggleConfirm'), $('#pwConfirm'));

        // Live clear of password field errors + success alert on input
        $('#pwCurrent, #pwNew, #pwConfirm').on('input', function () {
            clearFieldError($(this));
            $('#passwordSuccessAlert').removeClass('show');
        });

        // Submit: validate locally, then update localStorage
        $('#passwordForm').on('submit', function (e) {
            e.preventDefault();

            var currentPassword = $.trim($('#pwCurrent').val());
            var newPassword     = $.trim($('#pwNew').val());
            var confirmPassword = $.trim($('#pwConfirm').val());

            // --- Local validation ---
            clearFieldError($('#pwCurrent'));
            clearFieldError($('#pwNew'));
            clearFieldError($('#pwConfirm'));

            var valid = true;

            if (!currentPassword) {
                setError('pwCurrentGroup', 'Current password is required.');
                valid = false;
            }
            if (!newPassword) {
                setError('pwNewGroup', 'New password is required.');
                valid = false;
            } else if (newPassword.length < 6) {
                setError('pwNewGroup', 'New password must be at least 6 characters.');
                valid = false;
            }
            if (newPassword && confirmPassword !== newPassword) {
                setError('pwConfirmGroup', 'Passwords do not match.');
                valid = false;
            }
            if (!valid) return;

            var userEmail = (user && user.email) || '';
            if (!userEmail) {
                wwShowAlert($('#passwordForm'), 'danger',
                    'You must be logged in to change your password.');
                return;
            }

            var $btn = $('#btnChangePassword');
            wwHideAlert($('#passwordForm'));
            $btn.prop('disabled', true).html(
                '<span class="spinner-border spinner-border-sm me-1"></span>Updating…'
            );

            // Find the account and verify the current password
            var account = wwFindAccount(userEmail);
            if (!account) {
                wwShowAlert($('#passwordForm'), 'danger',
                    'Account not found. Please log in again.');
                $btn.prop('disabled', false).text('Change Password');
                return;
            }

            wwVerifyPassword(currentPassword, account.passwordHash).then(function (ok) {
                if (!ok) {
                    wwShowAlert($('#passwordForm'), 'danger', 'Current password is incorrect.');
                    $btn.prop('disabled', false).text('Change Password');
                    return;
                }

                // Hash the new password and save it
                return wwHashPassword(newPassword).then(function (newHash) {
                    var accounts = wwLoadAccounts();
                    var target = userEmail.toLowerCase();
                    for (var i = 0; i < accounts.length; i++) {
                        if (accounts[i].email.toLowerCase() === target) {
                            accounts[i].passwordHash = newHash;
                            break;
                        }
                    }
                    wwSaveAccounts(accounts);

                    // Clear form fields
                    $('#passwordForm')[0].reset();

                    $('#passwordSuccessAlert')
                        .contents()
                        .filter(function () { return this.nodeType === 3; })
                        .remove();

                    $('#passwordSuccessAlert').addClass('show');
                    setTimeout(function () {
                        $('#passwordSuccessAlert').removeClass('show');
                    }, 4000);

                    $btn.prop('disabled', false).text('Change Password');
                });
            }).catch(function () {
                wwShowAlert($('#passwordForm'), 'danger',
                    'Could not change password. Please try again.');
                $btn.prop('disabled', false).text('Change Password');
            });
        });

        /* ============ ACCOUNT ACTIONS & LOGOUT ============ */

        // Account action links (My Bookings / Browse Vehicles) — jQuery navigation
        $('.account-action[href]').on('click', function (e) {
            e.preventDefault();
            var href = $(this).attr('href');
            if (href) window.location.href = href;
        });

        // Logout (both navbar + account action) — confirm, clear session, go to login
        function handleLogout() {
            if (!window.confirm('Are you sure you want to log out of WheelWise?')) return;

            // Clear session / login related values
            localStorage.removeItem('ww_user');
            localStorage.removeItem('ww_remember_email');
            localStorage.removeItem('ww_booking');
            localStorage.removeItem('ww_selected_vehicle');

            window.location.href = 'login.html';
        }

        $('#btnLogout').on('click', handleLogout);
        $('#btnAccountLogout').on('click', handleLogout);
    }
});