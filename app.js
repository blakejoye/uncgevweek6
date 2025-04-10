require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { DateTime } = require("luxon");
const WebSocket = require('ws');
const app = express();
app.use(express.static('public'));
const bcrypt = require('bcrypt');
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('admin'));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,

});

// ✅ Fetch all chargers
app.get('/chargers', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT chargerid, location, status FROM chargers');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Book a charger (Handles Time Zones)
app.post('/reservations', async (req, res) => {
    const { chargerid, starttime, endtime, user_id } = req.body;
    console.log("Received booking request:", { chargerid, starttime, endtime });

    try {
        const start = DateTime.fromISO(starttime, { zone: "America/New_York" }).toUTC().toISO();
        const end = DateTime.fromISO(endtime, { zone: "America/New_York" }).toUTC().toISO();

        const checkCharger = await pool.query('SELECT status FROM chargers WHERE chargerid = $1', [chargerid]);
        if (checkCharger.rows.length === 0) {
            return res.status(404).json({ message: "Charger not found." });
        }

        // ✅ Ensure charger isn't already booked during this time
        const conflict = await pool.query(`
            SELECT * FROM reservations 
            WHERE chargerid = $1 AND (
                (starttime < $3 AND endtime > $2)
            )
        `, [chargerid, start, end]);

        if (conflict.rows.length > 0) {
            return res.status(400).json({ message: "This charger is already booked at the selected time." });
        }

        await pool.query(
            'INSERT INTO reservations (chargerid, starttime, endtime, user_id) VALUES ($1, $2, $3, $4)',
            [chargerid, start, end, user_id]
        );

        console.log("✅ Booking stored successfully!");
        res.status(201).json({ message: "Charger booked successfully!" });

    } catch (err) {
        console.error("❌ Error booking charger:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
});

// ✅ Fetch all reservations with charger names
// Fetch reservations for a specific user
// app.js
app.get('/reservations', async (req, res) => {
    const userId = req.query.user_id;

    if (!userId) {
        return res.status(400).json({ error: "Missing user ID" });
    }

    try {
        const { rows } = await pool.query(`
            SELECT r.*, c.location
            FROM reservations r
            JOIN chargers c ON r.chargerid = c.chargerid
            WHERE r.user_id = CAST($1 AS INT)

        `, [userId]);

        res.json(rows);
    } catch (err) {
        console.error("Error fetching user bookings:", err);
        res.status(500).json({ error: err.message });
    }
});





// ✅ Cancel a booking
app.delete('/reservations/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('DELETE FROM reservations WHERE reservationid = $1', [id]);
        res.json({ message: "Reservation canceled." });

    } catch (err) {
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
});



app.put('/reservations/:id', async (req, res) => {
    const { id } = req.params;
    const { chargerid, starttime, endtime } = req.body;

    try {
        const start = DateTime.fromISO(starttime, { zone: "America/New_York" }).toUTC().toISO();
        const end = DateTime.fromISO(endtime, { zone: "America/New_York" }).toUTC().toISO();

        // Check if reservation exists
        const checkReservation = await pool.query('SELECT * FROM reservations WHERE reservationid = $1', [id]);
        if (checkReservation.rows.length === 0) {
            return res.status(404).json({ message: "Booking not found." });
        }

        // Conflict check to prevent overlaps during edit
        const conflict = await pool.query(`
            SELECT * FROM reservations 
            WHERE chargerid = $1 
              AND reservationid != $2
              AND (
                  (starttime < $4 AND endtime > $3)
              )
        `, [chargerid, id, start, end]);

        if (conflict.rows.length > 0) {
            return res.status(400).json({ message: "This time slot is already booked." });
        }

        // Update booking
        await pool.query(`
            UPDATE reservations 
            SET chargerid = $1, starttime = $2, endtime = $3 
            WHERE reservationid = $4
        `, [chargerid, start, end, id]);

        res.json({ message: "Booking updated successfully!" });
    } catch (err) {
        console.error("❌ Error updating booking:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
});
// 🔁 Cleanup past reservations
app.delete('/cleanup-reservations', async (req, res) => {
    try {
        const result = await pool.query(`
            DELETE FROM reservations
            WHERE endtime < NOW()
        `);
        res.json({ message: `Deleted ${result.rowCount} expired reservations.` });
    } catch (err) {
        console.error("❌ Error cleaning up reservations:", err);
        res.status(500).json({ message: "Cleanup failed.", error: err.message });
    }
});
// WebSocket server setup
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', socket => {
    socket.on('message', message => {
        const timestamp = new Date().toLocaleString(); // Get the current date and time
        const messageWithTimestamp = `${message}`;

        // Broadcast the message with the timestamp to all connected clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageWithTimestamp);
            }
        });
    });
});

// Express server setup
app.use(express.json());

app.get('/api/charger-locations', (req, res) => {
    const locations = [
        { id: 1, name: "Charger 1", lat: 36.0726, lng: -79.7910 },
        { id: 2, name: "Charger 2", lat: 36.0730, lng: -79.7920 },
        // Add more charger locations as needed
    ];
    res.json(locations);
});

app.get('/api/chargers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM chargers ORDER BY chargerid');
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching chargers:", err);
        res.status(500).json({ error: err.message });
    }
});


// Upgrade HTTP server to handle WebSocket connections

// ==================== Charger Management Routes ====================
app.get('/chargers/active-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS active_chargers FROM chargers WHERE status = 'available'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/chargers', async (req, res) => {
    const { location, status, last_serviced_date } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO chargers (location, status, last_serviced_date) VALUES ($1, $2, $3) RETURNING *",
            [location, status, last_serviced_date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/chargers/:id', async (req, res) => {
    const { location, status, last_serviced_date } = req.body;
    const { id } = req.params;
    try {
        const result = await pool.query(
            "UPDATE chargers SET location = $1, status = $2, last_serviced_date = $3 WHERE chargerid = $4 RETURNING *",
            [location, status, last_serviced_date, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Charger not found" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/chargers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM chargers WHERE chargerid = $1 RETURNING *", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Charger not found" });
        res.json({ message: "Charger deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==================== Maintenance Routes ====================
app.get('/maintenance', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM maintenance_reports");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/maintenance/unresolved', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM maintenance_reports WHERE status != 'resolved'");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/maintenance', async (req, res) => {
    const { chargerid, reported_by, issue_description } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO maintenance_reports (chargerid, reported_by, issue_description) VALUES ($1, $2, $3) RETURNING *",
            [chargerid, reported_by, issue_description]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/maintenance/:id/resolve', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            "UPDATE maintenance_reports SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE report_id = $1 RETURNING *",
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });
        res.json({ message: "Issue resolved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/maintenance/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM maintenance_reports WHERE report_id = $1 RETURNING *", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });
        res.json({ message: "Report deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/maintenance/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { assigned_to } = req.body;
    try {
        const result = await pool.query(
            "UPDATE maintenance_reports SET status = 'in_progress', assigned_to = $1 WHERE report_id = $2 RETURNING *",
            [assigned_to, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });
        res.json({ message: "Ticket assigned successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/maintenance/open-tickets-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS ticket_count FROM maintenance_reports WHERE status = 'in_progress'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/maintenance/unresolved-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS issue_count FROM maintenance_reports WHERE status = 'pending'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/maintenance/status-counts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
            FROM maintenance_reports
        `);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/signup', async (req, res) => {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ success: false, message: "Missing fields" });
    }

    try {
        // Check if email or username already exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        if (userExists.rows.length > 0) {
            return res.status(409).json({ success: false, message: "User already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [email, username, hashedPassword]
        );
        res.json({ success: true, userId: result.rows[0].id });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ✅ Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        res.json({ success: true, redirect: "/welcome.html", userId: user.id });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Admin route to fetch ALL reservations (no user filter)
app.get('/reservations/all', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.*, c.location, u.username
            FROM reservations r
            JOIN chargers c ON r.chargerid = c.chargerid
            JOIN users u ON r.user_id = u.id
        `);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching all reservations:", err);
        res.status(500).json({ error: err.message });
    }
});

// ✅ Route to get ALL reservations (used to show red/disabled slots regardless of user)
app.get('/reservations/all-bookings', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.*, c.location 
            FROM reservations r
            JOIN chargers c ON r.chargerid = c.chargerid
        `);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching all bookings:", err);
        res.status(500).json({ error: err.message });
    }
});


const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:3000`);
});
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit('connection', socket, request);
    });
});

// Active chargers
app.get('/chargers/active-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS active_chargers FROM chargers WHERE status = 'available'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reservation count
app.get('/reservations/count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS reservation_count FROM reservations");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Unresolved maintenance issues
app.get('/maintenance/unresolved-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS issue_count FROM maintenance_reports WHERE status != 'resolved'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Open maintenance tickets
app.get('/maintenance/open-tickets-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS ticket_count FROM maintenance_reports WHERE status = 'in_progress'");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registered users
app.get('/users/count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) AS user_count FROM users");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Maintenance report pie chart data
app.get('/maintenance/status-counts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'resolved') AS resolved
            FROM maintenance_reports
        `);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// CREATE a new charger
app.post('/api/chargers', async (req, res) => {
    const { location, status, last_serviced_date } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO chargers (location, status, last_serviced_date)
             VALUES ($1, $2, $3) RETURNING *`,
            [location, status, last_serviced_date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a charger
app.delete('/api/chargers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM chargers WHERE chargerid = $1 RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Charger not found" });
        }
        res.json({ message: "Charger deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/chargers/:id', async (req, res) => {
    const { id } = req.params;
    const { location, status, last_serviced_date } = req.body;

    try {
        const result = await pool.query(
            `UPDATE chargers SET location = $1, status = $2, last_serviced_date = $3
             WHERE chargerid = $4 RETURNING *`,
            [location, status, last_serviced_date, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Charger not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("❌ Error updating charger:", err);
        res.status(500).json({ error: err.message });
    }
});









