const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

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
    const openPositionsCollection = db.collection("openPositions");
    const researchAreasCollection = db.collection("researchAreas");
    const applicationsCollection = db.collection("applications");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadDir);
      },
      filename: function (req, file, cb) {
        const fileExt = path.extname(file.originalname);
        const fileNem =
          file.originalname
            .replace(fileExt, "")
            .toLowerCase()
            .split(" ")
            .join("_") +
          "_" +
          Date.now();
        cb(null, fileNem + fileExt);
      },
    });

    const upload = multer({
      storage: storage,
      // limits: {
      //   fileSize: 1000000,
      // },
    });

    // must be user after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // get info
    app.get("/labInfo", async (req, res) => {
      const info = await labInfoCollection.findOne();
      res.send(info);
    });

    // users related api

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/user", verifyToken, async (req, res) => {
      const { email } = req.query;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
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
    app.get("/researchPaper/:_id", async (req, res) => {
      try {
        const { _id } = req.params;

        if (!_id) {
          return res
            .status(400)
            .json({ message: "Invalid researchPaper ID format" });
        }

        const query = { _id: new ObjectId(_id) };

        const researchPaper = await researchPapersCollection.findOne(query);

        if (!researchPaper) {
          return res.status(404).json({ message: "researchPaper not found" });
        }

        res.json(researchPaper);
      } catch (error) {
        console.error("Error fetching researchPaper:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });
    // join us related
    app.get("/researchPapers", async (req, res) => {
      const papers = await researchPapersCollection
        .find()
        .sort({ rating: -1 })
        .toArray();
      res.send(papers);
    });

    app.post(
      "/submitApplication",
      upload.single("resume"),
      async (req, res) => {
        try {
          // Access form data
          const formData = req.body;

          // Access the uploaded file
          const file = req.file;

          console.log("Form Data:", formData);
          console.log("Uploaded File:", file);

          if (!file) {
            throw new Error("No file uploaded");
          }

          // Combine form data and file information
          const applicationData = {
            ...formData,
            resume: {
              filename: file.filename,
              path: file.path,
              mimetype: file.mimetype,
              size: file.size,
            },
            createdAt: new Date(),
          };

          // Insert the application data into the collection
          const result = await applicationsCollection.insertOne(
            applicationData
          );
          console.log("upload to db result", result);

          // Send success response
          if (result)
            res
              .status(200)
              .json({ message: "Application submitted successfully!" });
        } catch (error) {
          console.error("Error processing application:", error);
          res
            .status(500)
            .json({ error: error.message || "Internal server error" });
        }
      }
    );

    app.get("/paperAuthor/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const query = { email: email };

        const result = await usersCollection.findOne(query, {
          projection: { name: 1, photoUrl: 1 },
        });

        if (!result) {
          return res.status(404).json({ message: "Author not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching provider:", error);
        res.status(500).json({ message: "Internal Server Error" });
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
    // open position related api
    app.get("/openPositions", async (req, res) => {
      const result = await openPositionsCollection.find().toArray();
      res.send(result);
    });
    // research area related api
    app.get("/researchArea", async (req, res) => {
      const result = await researchAreasCollection.find().toArray();
      res.send(result);
    });

    app.get("/researchArea/:_id", async (req, res) => {
      const _id = req.params._id;

      const query = { _id: new ObjectId(_id) };

      const result = await researchAreasCollection.findOne(query);

      if (!result) {
        return res.status(404).send({ message: "Research Area not found" });
      }

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
