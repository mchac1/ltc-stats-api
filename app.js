var express = require('express');
var app = express();
const { PORT } = require('./config')
const cors = require('cors')
const dotenv = require('dotenv');
const tennisRoutes = require('./routes/api/tennis')
const db = require("./db");

app.use(cors())
dotenv.config()

console.log('CAM interesting');
console.log(`CAM PORT: ${process.env.PORT}`);
console.log(`CAM DB_USER: ${process.env.DB_USER}`);
console.log(`CAM process.env:`);
console.log(process.env);

try {
    db.connectAnother();
    db.connect();
    app.use('/api/tennis', tennisRoutes)
    // app.listen(PORT, () => console.log(`App listening at http://localhost:${PORT}`))
    app.listen(process.env.PORT, () => console.log(`App listening at http://localhost:${process.env.PORT}`))
} catch (err) {
    console.log(`Error connecting to MongoDB: ${err.message}`)
}