// const MongoClient = require('mongodb').MongoClient;
const { MongoClient, ServerApiVersion } = require('mongodb');
const Server = require('mongodb').Server;
const ObjectID = require('mongodb').ObjectID;
const dbname = "lakeshoreTennis";
const url = "mongodb://localhost:27017";
// const uri = "mongodb+srv://<username>:<password>@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

let _db;

const state = {
  db: null,
  anotherDb: null
};

const connectAnother = () => {
    const uri = "mongodb+srv://mchac4:VrqrHtLMGlWshQ7A@cluster0.6lpt7vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    // Create a MongoClient with a MongoClientOptions object to set the Stable API version
    const client = new MongoClient(uri, {
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
                state.anotherDb = client.db('sample_guides');
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
            const client = new MongoClient(url);
            console.log("Connected to server");
            // client.admin.command('ping')
            // console.log("Pinged your deployment. You successfully connected to MongoDB!")
            state.db = client.db(dbname);
            console.log("Connected to MongoDB");
        } catch (err) {
            throw new Error(err.message);
        }
    }
}

const getPrimaryKey = (_id) => {
  return ObjectID(_id);
}

const getDB = () => {
  return state.db;
}

const getAnotherDb = () => {
  return state.anotherDb;
}

module.exports = { getDB, getAnotherDb, connect, connectAnother, getPrimaryKey };
