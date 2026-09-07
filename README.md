# WheelWise — Vehicle Booking Website

**R1: Frontend / Client-Side Validation**

A fully client-side vehicle booking web application built as a course project.

- **Frontend:** 10 responsive HTML pages (splash → login/register → home → browse → details → booking → confirmation → my bookings → profile)
- **Data:** vehicle catalogue loaded from a local JSON file (`frontend/json/vehicles.json`)
- **Auth & storage:** all user accounts, sessions, and bookings are handled entirely in the browser via `localStorage`
- **Validation:** comprehensive client-side (R1) validation on every form — login, register, booking, profile, change-password, search/filter

No backend, database, or server is required.

---

## 1. Project Purpose

WheelWise lets a visitor create an account, browse a vehicle catalogue, search/filter/sort vehicles, book a car for a date range, receive an on-screen confirmation (with print), manage and cancel their bookings, edit their profile, and change their password — all entirely in the browser.

---

## 2. Technologies Used

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Frontend | HTML5, CSS3, Bootstrap 5, JavaScript (ES5+), jQuery |
| Data     | Local JSON file (`frontend/json/vehicles.json`)     |
| Storage  | Browser `localStorage` (auth, bookings)             |
| Deps     | None — no npm packages, no build step, no bundler   |

---

## 3. Technology Restrictions Followed

The project is built strictly within the course R1 syllabus:

- **Used only:** HTML, CSS, Bootstrap 5, JavaScript, jQuery, JSON.
- **Not used:** Node.js, Express, MongoDB, Mongoose, Firebase, TypeScript, Next.js, Vite, Tailwind CSS, or any npm package.
- **No `package.json` dependencies** — `package.json` is included for project metadata only.

---

## 4. Project Structure

```
vehicle-booking-website/
│
├── frontend/
│   ├── index.html              Splash screen (animated progress → login)
│   ├── login.html              Sign in + remember-email
│   ├── register.html           Create an account
│   ├── home.html               Hero + featured vehicles + search
│   ├── vehicles.html           Filterable / sortable catalogue
│   ├── vehicle-details.html    One vehicle + days & total + Book Now
│   ├── booking.html            Checkout (customer, rental, payment, terms)
│   ├── confirmation.html       Booking summary + print
│   ├── my-bookings.html        List / search / sort / cancel bookings
│   ├── profile.html            View/edit profile + change password
│   ├── css/
│   │   └── style.css           All custom styling (Bootstrap-compatible)
│   ├── js/
│   │   ├── main.js             Splash + Home page logic
│   │   ├── auth.js             Login, Register, Profile, Change Password
│   │   ├── vehicles.js         Vehicles list + Vehicle Details
│   │   └── booking.js          Booking form + Confirmation + My Bookings
│   └── json/
│       └── vehicles.json       Vehicle catalogue (8 vehicles)
│
├── package.json                Project metadata (no dependencies)
└── README.md
```

---

## 5. Features

| # | Feature | Where |
|---|---------|-------|
| 1 | Splash screen (animated progress → auto navigate) | index.html / main.js |
| 2 | Register (name, email, phone, password, confirm, terms) | register.html / auth.js |
| 3 | Login (remember-email, show/hide password) | login.html / auth.js |
| 4 | Home (hero + featured vehicles + search) | home.html / main.js |
| 5 | Vehicle search / filter / sort (name, type, location, price) | vehicles.html / vehicles.js |
| 6 | Vehicle details (specs, features, days & estimated total) | vehicle-details.html / vehicles.js |
| 7 | Vehicle booking (dates, locations, payment, live total) | booking.html / booking.js |
| 8 | Confirmation (full summary + print) | confirmation.html / booking.js |
| 9 | My Bookings (search, status filter, sort, cancel) | my-bookings.html / booking.js |
| 10 | Booking cancellation (client-side, status → Cancelled) | booking.js (localStorage) |
| 11 | Profile (avatar initials, view mode, safe fields) | profile.html / auth.js |
| 12 | Edit profile (name + phone; email is immutable) | profile.html / auth.js |
| 13 | Change password (current + new + confirm) | profile.html / auth.js |
| 14 | Logout (confirm, clear session, → login) | every page's navbar |

---

## 6. How to Open the Project

No server is needed. Open any of the following approaches:

**Option A — Live Server (VS Code, recommended)**
1. Install the "Live Server" extension in VS Code.
2. Right-click `frontend/index.html` → **Open with Live Server**.

**Option B — Direct file open**
Open `frontend/index.html` directly in any modern browser.

> Note: Some browsers block `$.ajax()` for local `file://` URLs due to CORS policy.
> If the vehicle catalogue does not load, use **Option A** (Live Server) instead.

---

## 7. R1 Validations Implemented

Every form is validated entirely client-side. Invalid submissions are blocked.

### Login
- Email required + valid format
- Password required + minimum 6 characters
- Bootstrap `is-invalid` / `invalid-feedback` on every field

### Register
- Full Name required, min 2 chars, letters only, no all-digit / all-symbol / all-repeat
- Email required + valid format
- Phone required + 10–15 digits
- Password required + min 6 characters
- Confirm password must match
- Terms & Conditions checkbox required
- Live (`is-valid` / `is-invalid`) re-validation on input and blur

### Booking Form
- Customer name, email, phone validated
- Pick-up date required; **must not be in the past**
- Return date required; must be after the pick-up date
- Pick-up location required
- Return location required
- When **Card Payment** is selected:
  - Card number required + 13–19 digits
  - Expiry required + `MM/YY` format
  - CVV required + 3–4 digits
- Terms & Conditions checkbox required

### Search / Filter
- Minimum price must be **≥ 0**
- Maximum price must be **≥ 0**
- Minimum price must not exceed maximum price

### Profile — Edit Profile
- Full Name required, min 2 chars, letters only
- Phone required + 10–15 digits

### Profile — Change Password
- Current password required
- New password required + min 6 characters
- Confirm new password must match

---

## 8. localStorage Keys Used

| Key | Contents |
|-----|----------|
| `ww_accounts` | All registered user accounts (name, email, phone, hashed password) |
| `ww_user` | Currently logged-in user's safe fields (name, email, phone) — never the password |
| `ww_remember_email` | Remembered login email (if "Remember me" is checked) |
| `ww_selected_vehicle` | ID of the vehicle chosen on the browse page |
| `ww_booking` | Booking data passed from vehicle-details to the booking form |
| `ww_latest_booking` | Most recently confirmed booking |
| `ww_bookings` | All bookings for the logged-in user |

---

## 9. Password Security

- Passwords are hashed with the **browser's built-in `crypto.subtle.digest` (SHA-256)** with a random per-user salt.
- The stored value is `"salt:hex-hash"` — passwords are never stored as plaintext.
- `ww_user` and API responses **never contain a password or hash** — only the public fields (name, email, phone) are stored in the session.

---

## 10. How to Test R1 Validation

1. Open `frontend/index.html` (use Live Server or equivalent).
2. Follow the full user flow:
   - Splash → Register → Login → Home → Vehicles → Vehicle Details → Booking → Confirmation → My Bookings → Cancel → Profile → Edit Profile → Change Password → Logout.
3. Test invalid inputs on every form — submissions should be blocked and inline errors shown.
4. Test valid inputs — forms should submit / navigate correctly.

### Quick validation checks

| Form | Invalid input to try | Expected result |
|------|---------------------|-----------------|
| Login | Empty email | "Email is required." shown |
| Login | Bad password (< 6 chars) | "Password must be at least 6 characters." shown |
| Register | Duplicate email | "An account with this email already exists." shown |
| Booking | Pick-up date in past | "Pick-up date cannot be in the past." shown |
| Booking | Card fields empty (Card Payment selected) | "Card number / Expiry / CVV is required." shown |
| Filter | Min price = -50 | "Minimum price must be 0 or greater." shown |
| Profile | Name = "" | "Full name is required." shown |
| Change password | Wrong current password | "Current password is incorrect." shown |

---

## 11. Course Submission Checklist

- [x] All 10 frontend pages render and are responsive.
- [x] Full user flow works end-to-end in the browser.
- [x] All R1 client-side validations are implemented and tested.
- [x] No backend, no database, no npm dependencies.
- [x] No Express / MongoDB / Node.js / TypeScript / Firebase / JWT / Vite / Tailwind / bcrypt / any extra packages.
- [x] Browser console is clean (no errors).
- [x] README is complete and included.