const express = require("express");
const cors = require("cors");
require("dotenv").config(); // Load environment variables

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.maw05.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    // Define your database and collection
    const db = client.db("peerResearchLab");
    const researchPapersCollection = db.collection("researchPapers");
    const teamCollection = db.collection("team");
    const usersCollection = db.collection("users");
    const contactsCollection = db.collection("contacts");
    const labInfoCollection = db.collection("labInfo");

    // get info
    app.get("/labInfo", async (req, res) => {
      console.log("API hit");
      const info = await labInfoCollection.findOne();
      res.send(info);
    });

    // users related api

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({
          message: "User already exists in the database",
          insertedId: null,
        });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });
    // team related apis
    app.get("/team", async (req, res) => {
      const team = await teamCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(team);
    });

    // Research paper related api
    app.get("/topResearchPapers", async (req, res) => {
      try {
        const papers = await researchPapersCollection
          .find({ totalRating: { $gte: 130 } }) // Filter papers where totalRating >= 150
          .sort({ rating: -1 }) // Sort papers by rating in descending order
          .limit(6) // Limit to the top 6 papers
          .toArray();
        res.send(papers);
      } catch (error) {
        console.error("Error fetching research papers:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    app.get("/resentResearchPapers", async (req, res) => {
      try {
        const papers = await researchPapersCollection
          .find() // Filter papers where totalRating >= 150
          .sort({ createdAt: -1 }) // Sort papers by createdAt as newest order
          .limit(6) // Limit to the top 6 papers
          .toArray();
        res.send(papers);
      } catch (error) {
        console.error("Error fetching research papers:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // contact related api
    app.post("/contacts", async (req, res) => {
      const contactSMSInfo = req.body;
      const result = await contactsCollection.insertOne(contactSMSInfo);
      res.send(result);
    });

    app.get("/", (req, res) => {
      res.send("Lab is working");
    });
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run();

app.listen(port, () => {
  console.log("Server is running on port..:", port);
});
