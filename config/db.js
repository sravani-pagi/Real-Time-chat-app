// config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp_db';
        
        await mongoose.connect(mongoURI, {
            // useNewUrlParser and useUnifiedTopology are typically default in newer Mongoose versions, 
            // but including them here for compatibility.
        });
        
        console.log('MongoDB Connected successfully.');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        // Exit process with failure
        process.exit(1);
    }
};

module.exports = connectDB;