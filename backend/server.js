const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables FIRST before other imports
dotenv.config();

const session = require('express-session');
const passport = require('./config/passport');

const app = express();

// CORS Configuration - Allow frontend to access backend
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow in development
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Disposition'],
    exposedHeaders: ['Content-Disposition']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware (required for passport)
app.use(session({
    secret: process.env.SESSION_SECRET || 'hec-university-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Import routes
const authRoutes = require('./routes/auth.routes');
const hecRoutes = require('./routes/hec.routes');
const universityRoutes = require('./routes/university.routes');
const networkRoutes = require('./routes/network.routes');
const degreeRoutes = require('./routes/degree.routes');
const approvalRoutes = require('./routes/approval.routes');
const approverRoutes = require('./routes/approver.routes');
const templateRoutes = require('./routes/template.routes');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/hec', hecRoutes);
app.use('/api/university', universityRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/degrees', degreeRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/approver', approverRoutes);
app.use('/api/templates', templateRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'HEC-University API is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

const PORT = process.env.PORT || 5000;

// Initialize database and start server
const { initializeDatabase } = require('./config/couchdb');
const { verifyEmailConfig } = require('./config/email');
const { initStudentDatabases } = require('./services/studentDatabase.service');

initializeDatabase()
    .then(async () => {
        // Initialize student database system
        await initStudentDatabases();
        
        // Verify email configuration
        await verifyEmailConfig();
        
        app.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`HEC-University API Server`);
            console.log(`========================================`);
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`Health check: http://localhost:${PORT}/api/health`);
            console.log(`Google OAuth: http://localhost:${PORT}/api/auth/google`);
            console.log(`========================================\n`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;
