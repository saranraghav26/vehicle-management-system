/* =============================================
   server.js — WheelWise Node.js HTTP Server
   Full Stack Server for Customer & Admin Module
   No Express required — uses native Node.js core modules
   ============================================= */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

// MIME types dictionary for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css':  'text/css; charset=UTF-8',
    '.js':   'text/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

// In-memory active sessions store: token => { userId, email, name, role, expiresAt }
const sessions = new Map();

// Helper: Password hashing
function hashPassword(password, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
    return salt + ':' + hash;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string' || storedHash.indexOf(':') === -1) {
        return false;
    }
    const salt = storedHash.split(':')[0];
    const computed = hashPassword(password, salt);
    return computed === storedHash;
}

// Ensure data directory and db.json exist
function loadDatabase() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let db = { users: [], vehicles: [], bookings: [] };

    if (fs.existsSync(DB_FILE)) {
        try {
            db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error('Error parsing db.json, using default structure');
        }
    }

    // Seed vehicles from json/vehicles.json if empty
    const vehiclesJson = path.join(__dirname, 'json', 'vehicles.json');
    if ((!db.vehicles || db.vehicles.length === 0) && fs.existsSync(vehiclesJson)) {
        try {
            const raw = JSON.parse(fs.readFileSync(vehiclesJson, 'utf8'));
            db.vehicles = raw.vehicles || raw || [];
        } catch (e) {
            console.error('Failed loading vehicles.json fallback');
        }
    }

    // Ensure default admin exists if ADMIN_PASSWORD environment variable is set
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@wheelwise.com').trim().toLowerCase();
    let admin = (db.users || []).find(u => u.role === 'admin' || u.email.toLowerCase() === adminEmail);
    if (!admin && process.env.ADMIN_PASSWORD) {
        admin = {
            userId: 'USR-ADMIN-001',
            name: 'WheelWise System Administrator',
            email: adminEmail,
            phone: '+1 800-555-0199',
            role: 'admin',
            status: 'active',
            passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (!db.users) db.users = [];
        db.users.push(admin);
    }

    return db;
}

function saveDatabase(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving db.json:', e);
    }
}

// Parse request body JSON
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 5 * 1024 * 1024) { // 5MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', err => reject(err));
    });
}

// Utility for JSON HTTP response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

// Authenticate session from request header
function authenticateRequest(req) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || '';
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else {
        token = authHeader.trim();
    }

    if (!token || !sessions.has(token)) {
        return null;
    }

    const sess = sessions.get(token);
    if (sess.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
    }

    return sess;
}

// Sanitize user object (omit password/hash)
function sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, password, ...safeUser } = user;
    return safeUser;
}

// Server request handler
const server = http.createServer(async (req, res) => {
    // Handle CORS preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
        });
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // ===================================================
    // API ROUTES (/api/*)
    // ===================================================
    if (pathname.startsWith('/api/')) {
        const db = loadDatabase();

        // ---------------------------------------------------
        // ADMIN AUTH & SESSION ENDPOINTS
        // ---------------------------------------------------

        // POST /api/admin/login
        if (pathname === '/api/admin/login' && method === 'POST') {
            const body = await getRequestBody(req);
            const email = (body.email || '').trim().toLowerCase();
            const password = body.password || '';

            if (!email || !password) {
                return sendJSON(res, 400, { success: false, message: 'Email and password are required.' });
            }

            const user = db.users.find(u => u.email.toLowerCase() === email);
            if (!user || user.role !== 'admin') {
                return sendJSON(res, 401, { success: false, message: 'Invalid admin credentials.' });
            }

            if (user.status === 'inactive') {
                return sendJSON(res, 403, { success: false, message: 'This admin account has been deactivated.' });
            }

            const isMatch = verifyPassword(password, user.passwordHash);
            if (!isMatch) {
                return sendJSON(res, 401, { success: false, message: 'Invalid admin credentials.' });
            }

            // Create admin session token
            const token = 'ADM-SESS-' + crypto.randomBytes(24).toString('hex');
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

            const sessData = {
                userId: user.userId,
                email: user.email,
                name: user.name,
                role: 'admin',
                expiresAt
            };
            sessions.set(token, sessData);

            return sendJSON(res, 200, {
                success: true,
                token: token,
                user: sanitizeUser(user),
                message: 'Admin login successful.'
            });
        }

        // GET /api/admin/check-auth
        if (pathname === '/api/admin/check-auth' && method === 'GET') {
            const session = authenticateRequest(req);
            if (!session || session.role !== 'admin') {
                return sendJSON(res, 401, { success: false, authenticated: false, message: 'Unauthorized admin session.' });
            }
            return sendJSON(res, 200, { success: true, authenticated: true, user: session });
        }

        // POST /api/admin/logout
        if (pathname === '/api/admin/logout' && method === 'POST') {
            const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || '';
            const token = authHeader.replace('Bearer ', '').trim();
            if (token && sessions.has(token)) {
                sessions.delete(token);
            }
            return sendJSON(res, 200, { success: true, message: 'Logged out successfully.' });
        }

        // ---------------------------------------------------
        // ADMIN DASHBOARD & MANAGEMENT APIs (REQUIRE ADMIN ROLE)
        // ---------------------------------------------------
        if (pathname.startsWith('/api/admin/')) {
            const session = authenticateRequest(req);
            if (!session || session.role !== 'admin') {
                return sendJSON(res, 403, { success: false, message: 'Access denied. Admin privileges required.' });
            }

            // GET /api/admin/dashboard
            if (pathname === '/api/admin/dashboard' && method === 'GET') {
                const customers = db.users.filter(u => u.role !== 'admin');
                const vehicles = db.vehicles || [];
                const bookings = db.bookings || [];

                const totalCustomers = customers.length;
                const totalVehicles  = vehicles.length;
                const availableVehicles = vehicles.filter(v => v.availability === true).length;
                const totalBookings   = bookings.length;

                const activeBookings    = bookings.filter(b => (b.status || 'Confirmed') === 'Confirmed').length;
                const completedBookings = bookings.filter(b => b.status === 'Completed').length;
                const cancelledBookings = bookings.filter(b => b.status === 'Cancelled').length;

                const totalRevenue = bookings
                    .filter(b => b.status !== 'Cancelled')
                    .reduce((sum, b) => sum + (parseFloat(b.totalPrice) || 0), 0);

                return sendJSON(res, 200, {
                    success: true,
                    stats: {
                        totalCustomers,
                        totalVehicles,
                        availableVehicles,
                        totalBookings,
                        activeBookings,
                        completedBookings,
                        cancelledBookings,
                        totalRevenue
                    }
                });
            }

            // GET /api/admin/customers
            if (pathname === '/api/admin/customers' && method === 'GET') {
                const search = (parsedUrl.query.search || '').trim().toLowerCase();
                let customers = db.users
                    .filter(u => u.role !== 'admin')
                    .map(u => {
                        const cusBookings = db.bookings.filter(b => (b.customerEmail || '').toLowerCase() === u.email.toLowerCase());
                        const safe = sanitizeUser(u);
                        safe.bookingCount = cusBookings.length;
                        return safe;
                    });

                if (search) {
                    customers = customers.filter(c =>
                        (c.name && c.name.toLowerCase().includes(search)) ||
                        (c.email && c.email.toLowerCase().includes(search)) ||
                        (c.phone && c.phone.toLowerCase().includes(search))
                    );
                }

                return sendJSON(res, 200, { success: true, customers });
            }

            // GET /api/admin/customers/:id
            const customerIdMatch = pathname.match(/^\/api\/admin\/customers\/([^\/]+)$/);
            if (customerIdMatch && method === 'GET') {
                const id = customerIdMatch[1];
                const customer = db.users.find(u => String(u.userId) === id || u.email.toLowerCase() === id.toLowerCase());
                if (!customer) {
                    return sendJSON(res, 404, { success: false, message: 'Customer not found.' });
                }
                const customerBookings = db.bookings.filter(b => (b.customerEmail || '').toLowerCase() === customer.email.toLowerCase());
                const safe = sanitizeUser(customer);
                safe.bookings = customerBookings;
                return sendJSON(res, 200, { success: true, customer: safe });
            }

            // PATCH /api/admin/customers/:id
            if (customerIdMatch && method === 'PATCH') {
                const id = customerIdMatch[1];
                const body = await getRequestBody(req);
                const customerIndex = db.users.findIndex(u => String(u.userId) === id || u.email.toLowerCase() === id.toLowerCase());
                if (customerIndex === -1) {
                    return sendJSON(res, 404, { success: false, message: 'Customer not found.' });
                }

                const cus = db.users[customerIndex];
                if (body.name) cus.name = body.name.trim();
                if (body.phone) cus.phone = body.phone.trim();
                if (body.status && ['active', 'inactive'].includes(body.status)) {
                    cus.status = body.status;
                }
                cus.updatedAt = new Date().toISOString();
                db.users[customerIndex] = cus;
                saveDatabase(db);

                return sendJSON(res, 200, { success: true, message: 'Customer updated successfully.', customer: sanitizeUser(cus) });
            }

            // DELETE /api/admin/customers/:id
            if (customerIdMatch && method === 'DELETE') {
                const id = customerIdMatch[1];
                const customerIndex = db.users.findIndex(u => String(u.userId) === id || u.email.toLowerCase() === id.toLowerCase());
                if (customerIndex === -1) {
                    return sendJSON(res, 404, { success: false, message: 'Customer not found.' });
                }
                const deleted = db.users.splice(customerIndex, 1)[0];
                saveDatabase(db);
                return sendJSON(res, 200, { success: true, message: 'Customer deleted successfully.', customer: sanitizeUser(deleted) });
            }

            // GET /api/admin/vehicles
            if (pathname === '/api/admin/vehicles' && method === 'GET') {
                return sendJSON(res, 200, { success: true, vehicles: db.vehicles || [] });
            }

            // POST /api/admin/vehicles
            if (pathname === '/api/admin/vehicles' && method === 'POST') {
                const body = await getRequestBody(req);
                if (!body.name || !body.type || body.pricePerDay === undefined) {
                    return sendJSON(res, 400, { success: false, message: 'Vehicle name, type, and price per day are required.' });
                }

                const maxId = (db.vehicles || []).reduce((max, v) => Math.max(max, parseInt(v.vehicleId, 10) || 0), 0);
                const newVehicle = {
                    vehicleId: maxId + 1,
                    name: body.name.trim(),
                    type: body.type.trim(),
                    seats: parseInt(body.seats, 10) || 5,
                    transmission: body.transmission || 'Automatic',
                    pricePerDay: parseFloat(body.pricePerDay) || 50,
                    location: body.location || 'Downtown',
                    availability: body.availability !== undefined ? Boolean(body.availability) : true,
                    fuelType: body.fuelType || 'Petrol',
                    year: parseInt(body.year, 10) || new Date().getFullYear(),
                    image: body.image || 'images/vehicles/camry.jpg',
                    description: body.description || '',
                    features: Array.isArray(body.features) ? body.features : (body.features ? String(body.features).split(',').map(s => s.trim()) : [])
                };

                db.vehicles.push(newVehicle);
                saveDatabase(db);
                return sendJSON(res, 201, { success: true, message: 'Vehicle added successfully.', vehicle: newVehicle });
            }

            // GET/PATCH/DELETE /api/admin/vehicles/:id
            const vehicleIdMatch = pathname.match(/^\/api\/admin\/vehicles\/([^\/]+)$/);
            if (vehicleIdMatch && method === 'GET') {
                const id = parseInt(vehicleIdMatch[1], 10);
                const vehicle = db.vehicles.find(v => v.vehicleId === id);
                if (!vehicle) return sendJSON(res, 404, { success: false, message: 'Vehicle not found.' });
                return sendJSON(res, 200, { success: true, vehicle });
            }

            if (vehicleIdMatch && method === 'PATCH') {
                const id = parseInt(vehicleIdMatch[1], 10);
                const body = await getRequestBody(req);
                const index = db.vehicles.findIndex(v => v.vehicleId === id);
                if (index === -1) return sendJSON(res, 404, { success: false, message: 'Vehicle not found.' });

                const v = db.vehicles[index];
                if (body.name !== undefined) v.name = body.name.trim();
                if (body.type !== undefined) v.type = body.type.trim();
                if (body.seats !== undefined) v.seats = parseInt(body.seats, 10);
                if (body.transmission !== undefined) v.transmission = body.transmission;
                if (body.pricePerDay !== undefined) v.pricePerDay = parseFloat(body.pricePerDay);
                if (body.location !== undefined) v.location = body.location;
                if (body.availability !== undefined) v.availability = Boolean(body.availability);
                if (body.fuelType !== undefined) v.fuelType = body.fuelType;
                if (body.year !== undefined) v.year = parseInt(body.year, 10);
                if (body.image !== undefined) v.image = body.image;
                if (body.description !== undefined) v.description = body.description;
                if (body.features !== undefined) {
                    v.features = Array.isArray(body.features) ? body.features : String(body.features).split(',').map(s => s.trim());
                }

                db.vehicles[index] = v;
                saveDatabase(db);
                return sendJSON(res, 200, { success: true, message: 'Vehicle updated successfully.', vehicle: v });
            }

            if (vehicleIdMatch && method === 'DELETE') {
                const id = parseInt(vehicleIdMatch[1], 10);
                const index = db.vehicles.findIndex(v => v.vehicleId === id);
                if (index === -1) return sendJSON(res, 404, { success: false, message: 'Vehicle not found.' });

                const deleted = db.vehicles.splice(index, 1)[0];
                saveDatabase(db);
                return sendJSON(res, 200, { success: true, message: 'Vehicle deleted successfully.', vehicle: deleted });
            }

            // GET /api/admin/bookings
            if (pathname === '/api/admin/bookings' && method === 'GET') {
                return sendJSON(res, 200, { success: true, bookings: db.bookings || [] });
            }

            // GET/PATCH /api/admin/bookings/:id
            const bookingIdMatch = pathname.match(/^\/api\/admin\/bookings\/([^\/]+)$/);
            if (bookingIdMatch && method === 'GET') {
                const id = bookingIdMatch[1];
                const booking = db.bookings.find(b => b.bookingId === id);
                if (!booking) return sendJSON(res, 404, { success: false, message: 'Booking not found.' });
                return sendJSON(res, 200, { success: true, booking });
            }

            if (bookingIdMatch && method === 'PATCH') {
                const id = bookingIdMatch[1];
                const body = await getRequestBody(req);
                const index = db.bookings.findIndex(b => b.bookingId === id);
                if (index === -1) return sendJSON(res, 404, { success: false, message: 'Booking not found.' });

                const b = db.bookings[index];
                if (body.status && ['Confirmed', 'Completed', 'Cancelled'].includes(body.status)) {
                    b.status = body.status;
                }
                db.bookings[index] = b;
                saveDatabase(db);
                return sendJSON(res, 200, { success: true, message: 'Booking status updated.', booking: b });
            }
        }

        // ---------------------------------------------------
        // PUBLIC / CUSTOMER APIs
        // ---------------------------------------------------

        // GET /api/vehicles
        if (pathname === '/api/vehicles' && method === 'GET') {
            return sendJSON(res, 200, { success: true, vehicles: db.vehicles || [] });
        }

        // GET /api/vehicles/:id
        const pubVehicleMatch = pathname.match(/^\/api\/vehicles\/([^\/]+)$/);
        if (pubVehicleMatch && method === 'GET') {
            const id = parseInt(pubVehicleMatch[1], 10);
            const v = (db.vehicles || []).find(item => item.vehicleId === id);
            if (!v) return sendJSON(res, 404, { success: false, message: 'Vehicle not found.' });
            return sendJSON(res, 200, { success: true, vehicle: v });
        }

        // POST /api/bookings
        if (pathname === '/api/bookings' && method === 'POST') {
            const body = await getRequestBody(req);
            if (!body.vehicleId || !body.customerEmail) {
                return sendJSON(res, 400, { success: false, message: 'Vehicle ID and Customer Email are required.' });
            }

            const now = new Date();
            const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
            const rand = Math.random().toString(36).toUpperCase().slice(2, 7);
            const bookingId = 'WW-' + datePart + '-' + rand;

            const newBooking = {
                bookingId,
                vehicleId: parseInt(body.vehicleId, 10),
                vehicleName: body.vehicleName || 'Vehicle',
                vehicleType: body.vehicleType || '',
                vehicleImage: body.vehicleImage || '',
                customerName: body.customerName || '',
                customerEmail: body.customerEmail.toLowerCase(),
                customerPhone: body.customerPhone || '',
                pickupDate: body.pickupDate || '',
                returnDate: body.returnDate || '',
                pickupLocation: body.pickupLocation || '',
                returnLocation: body.returnLocation || '',
                paymentMethod: body.paymentMethod || 'cash',
                days: parseInt(body.days, 10) || 1,
                totalPrice: parseFloat(body.totalPrice) || 0,
                status: 'Confirmed',
                bookingDate: now.toISOString()
            };

            db.bookings.push(newBooking);
            saveDatabase(db);
            return sendJSON(res, 201, { success: true, booking: newBooking });
        }

        // GET /api/bookings (for customer email)
        if (pathname === '/api/bookings' && method === 'GET') {
            const email = (parsedUrl.query.email || '').trim().toLowerCase();
            let userBookings = db.bookings || [];
            if (email) {
                userBookings = userBookings.filter(b => (b.customerEmail || '').toLowerCase() === email);
            }
            return sendJSON(res, 200, { success: true, bookings: userBookings });
        }

        // POST /api/auth/register
        if (pathname === '/api/auth/register' && method === 'POST') {
            const body = await getRequestBody(req);
            const email = (body.email || '').trim().toLowerCase();
            if (!email || !body.password || !body.name) {
                return sendJSON(res, 400, { success: false, message: 'Name, email and password are required.' });
            }

            const existing = db.users.find(u => u.email.toLowerCase() === email);
            if (existing) {
                return sendJSON(res, 400, { success: false, message: 'An account with this email already exists.' });
            }

            const newUser = {
                userId: 'USR-' + Date.now().toString(36).toUpperCase(),
                name: body.name.trim(),
                email: email,
                phone: (body.phone || '').trim(),
                role: 'customer',
                status: 'active',
                passwordHash: hashPassword(body.password),
                createdAt: new Date().toISOString()
            };

            db.users.push(newUser);
            saveDatabase(db);
            return sendJSON(res, 201, { success: true, user: sanitizeUser(newUser) });
        }

        // POST /api/auth/login
        if (pathname === '/api/auth/login' && method === 'POST') {
            const body = await getRequestBody(req);
            const email = (body.email || '').trim().toLowerCase();
            const user = db.users.find(u => u.email.toLowerCase() === email);
            if (!user || !verifyPassword(body.password, user.passwordHash)) {
                return sendJSON(res, 401, { success: false, message: 'Invalid email or password.' });
            }
            return sendJSON(res, 200, { success: true, user: sanitizeUser(user) });
        }

        // Unknown API route
        return sendJSON(res, 404, { success: false, message: 'API endpoint not found.' });
    }

    // ===================================================
    // STATIC FILE SERVER
    // ===================================================
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

    // Security check: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Check if adding .html helps
            if (!path.extname(filePath)) {
                filePath += '.html';
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
                return res.end('<h1>404 Page Not Found</h1><p><a href="/index.html">Return to Home</a></p>');
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

// Boot server
server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`WheelWise HTTP Server running at http://localhost:${PORT}`);
    console.log(`Customer Site: http://localhost:${PORT}/index.html`);
    console.log(`Admin Portal:  http://localhost:${PORT}/admin-login.html`);
    console.log(`=======================================================`);
});
