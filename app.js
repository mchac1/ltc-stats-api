var express = require('express');
var app = express();
const { PORT, mongoUri } = require('./config')
const cors = require('cors')
const tennisRoutes = require('./routes/api/tennis')
const db = require("./db");

app.use(cors())

// db.connectAnother();

try {
    db.connectAnother();
    db.connect();
    app.use('/api/tennis', tennisRoutes)
    app.listen(PORT, () => console.log(`App listening at http://localhost:${PORT}`))
} catch (err) {
    console.log(`Error connecting to MongoDB: ${err.message}`)
}