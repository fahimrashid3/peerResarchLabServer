const express = require("express");
const cors = require("cors");
require("dotenv").config(); // Load environment variables

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
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

    // Sample API route
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
