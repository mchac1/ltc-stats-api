const { MongoClient, ServerApiVersion } = require('mongodb');
const { mongoUri, mongoDbName } = require('./config')
const dotenv = require('dotenv');

dotenv.config()

const testuri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log(`CAM testuri: ${testuri}`)

const state = {
  db: null,
  anotherDb: null
};

const connectAnother = () => {
    // Create a MongoClient with a MongoClientOptions object to set the Stable API version
    const client = new MongoClient(mongoUri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });
    async function run() {
        if (!state.anotherDb) {
            // try {
                // Connect the client to the server	(optional starting in v4.7)
                await client.connect();
                // Send a ping to confirm a successful connection
                await client.db("admin").command({ ping: 1 });
                console.log("Pinged your deployment. You successfully connected to MongoDB!");
                // state.anotherDb = client.db('tennis');
                state.anotherDb = client.db(mongoDbName);
            // } finally {
            //     // Ensures that the client will close when you finish/error
            //     await client.close();
            // }
        }
    }
    run().catch(console.dir);
}

const connect = () => {
    if (!state.db) {
        try {
            const client = new MongoClient(mongoUri);
            // const client = new MongoClient(newUri);
            console.log("Connected to server");
            state.db = client.db(mongoDbName);
            console.log("Connected to MongoDB");
        } catch (err) {
            throw new Error(err.message);
        }
    }
}

const getDB = () => {
  return state.db;
}

const getAnotherDb = () => {
  return state.anotherDb;
}

module.exports = { getDB, getAnotherDb, connect, connectAnother };
