const dotenv = require('dotenv');
dotenv.config()

module.exports = {
    // mongoUri: "mongodb://localhost:27017",
    // mongoUri: "mongodb+srv://mchac4:VrqrHtLMGlWshQ7A@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    mongoUri: `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`,
    // mongoUri: `mongodb+srv://${{ DB_USER }}:${{ DB_PASS }}@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`,
    mongoDbName: "tennis",
    PORT: process.env.PORT || 3000,
}