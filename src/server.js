const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();
const { testConnection } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const newsRoutes = require('./routes/newsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pageRoutes = require('./routes/pageRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dynamicContentRoutes = require('./routes/dynamicContentRoutes');
const magazineRoutes = require('./routes/magazineRoutes');
const app = express();
const PORT = process.env.PORT || 5000;
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/sections', sectionRoutes);
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/page', pageRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/content', dynamicContentRoutes);
app.use('/api/v1/magazines', magazineRoutes);
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});
const startServer = async () => {
    try {
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('Failed to connect to database. Exiting...');
            process.exit(1);
        }
        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀Gundusudhi News Backend Server                        ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}   ║
║   Port: ${PORT}                                           ║
║   Database: Connected ✅                                  ║
║                                                           ║
║   API Documentation:                                      ║
║   http://localhost:${PORT}/api/v1                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
startServer();
module.exports = app;
