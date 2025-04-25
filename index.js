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
    const researchPapersRequest = db.collection("researchPapersRequest");
    const teamCollection = db.collection("team");
    const newsCollection = db.collection("news");
    const usersCollection = db.collection("users");
    const contactsCollection = db.collection("contacts");
    const labInfoCollection = db.collection("labInfo");
    const openPositionsCollection = db.collection("openPositions");
    const researchAreasCollection = db.collection("researchAreas");
    const applicationsCollection = db.collection("applications");

    app.use("/uploads", express.static(path.join(__dirname, "uploads")));

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
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

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }

    // Multer Storage Configuration
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname);
        const fileName =
          file.originalname
            .replace(fileExt, "")
            .toLowerCase()
            .split(" ")
            .join("_") +
          "_" +
          Date.now();
        cb(null, fileName + fileExt);
      },
    });
    const upload = multer({ storage });

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
    // must be user after verify token
    const verifyRole = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isRole = user?.role;
      if (!isRole) {
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

    app.get("/user/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let role = false;
      if (user) {
        role = user?.role;
      }
      res.send({ role });
    });

    // get info
    app.get("/labInfo", async (req, res) => {
      const info = await labInfoCollection.findOne();
      res.send(info);
    });
    app.patch("/basicInfo", verifyToken, verifyAdmin, async (req, res) => {
      const options = { upsert: true };
      const data = req.body;

      const updatedDoc = {
        $set: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          location: data.location,
        },
      };

      try {
        await labInfoCollection.updateOne({}, updatedDoc, options);
        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // For social media update
    app.patch("/socialMedia", verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;

      const updatedDoc = {
        $set: {
          socialMedia: data,
        },
      };

      const options = { upsert: true };

      try {
        const result = await labInfoCollection.updateOne(
          {},
          updatedDoc,
          options
        );

        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
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

    app.patch("/updateUserAndTeam", async (req, res) => {
      try {
        const {
          email,
          name,
          photoUrl,
          phone,
          university,
          details,
          socialMedia,
        } = req.body;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const query = { email };

        // Prepare update documents
        const userUpdateDoc = {
          $set: {
            name: name,
            photoUrl: photoUrl,
          },
        };

        const teamUpdateDoc = {
          $set: {
            name,
            phone,
            university,
            image: photoUrl,
            details,
            socialMedia: socialMedia || {},
          },
        };

        // Update both collections
        const userResult = await usersCollection.updateOne(
          query,
          userUpdateDoc
        );
        const teamResult = await teamCollection.updateOne(query, teamUpdateDoc);

        // Response
        if (userResult.modifiedCount > 0 || teamResult.modifiedCount > 0) {
          res.status(200).json({ message: "Profile updated successfully" });
        } else {
          res.status(200).json({ message: "No changes were made" });
        }
      } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Failed to update profile" });
      }
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
      const team = await teamCollection.find().toArray();
      res.send(team);
    });
    app.get("/userInfoInTeam", verifyToken, async (req, res) => {
      // const { email } = req.query;
      const email = req.decoded.email;
      const query = { email: email };
      const result = await teamCollection.findOne(query);
      res.send(result);
    });

    app.post("/team/:_id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { _id } = req.params;

        if (!ObjectId.isValid(_id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid ID format",
          });
        }

        const application = await applicationsCollection.findOne({
          _id: new ObjectId(_id),
        });

        if (!application) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        const existingMember = await teamCollection.findOne({
          email: application.email,
        });

        if (existingMember) {
          return res.status(400).json({
            success: false,
            message: "Member with this email already exists in the team",
            email: application.email,
          });
        }

        // Remove the resume object before inserting to teamCollection
        const { resume, ...applicationWithoutResume } = application;

        //TODO:remove one createdAt from team or user collection if needed
        const teamMember = {
          ...applicationWithoutResume,
          createdAt: new Date(),
        };

        const result = await teamCollection.insertOne(teamMember);

        await usersCollection.updateOne(
          { email: application.email },
          {
            $set: {
              role: application.role,
              isTeamMember: true,
              teamJoinDate: new Date(),
            },
          },
          { upsert: true }
        );

        // Delete the resume file from /uploads if it exists
        if (resume?.path) {
          const resumePath = path.join(__dirname, resume.path);
          fs.unlink(resumePath, (err) => {
            if (err) {
              console.error("Failed to delete resume file:", err.message);
            } else {
              console.log("Resume file deleted:", resume.path);
            }
          });
        }

        await applicationsCollection.deleteOne({ _id: new ObjectId(_id) });

        res.status(200).json({
          success: true,
          message: "Member added to team successfully",
          insertedId: result.insertedId,
          role: application.role,
        });
      } catch (error) {
        console.error("Error moving application to team:", error.message);
        res.status(500).json({
          success: false,
          message: error.message || "Internal server error",
        });
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

    const { ObjectId } = require("mongodb");

    app.get("/morePaper/:_id", async (req, res) => {
      try {
        const { _id } = req.params;

        const currentPaper = await researchPapersCollection.findOne({
          _id: new ObjectId(_id),
        });

        if (!currentPaper) {
          return res.status(404).json({ message: "Paper not found" });
        }

        const filter = {
          authorEmail: currentPaper.authorEmail,
          _id: { $ne: new ObjectId(_id) },
        };

        const morePapers = await researchPapersCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();

        if (!morePapers.length) {
          return res.status(404).json({
            message: "No other research papers found for this user",
          });
        }

        res.send(morePapers);
      } catch (error) {
        console.error("Error fetching research papers:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // join us related
    app.get("/researchPapers", async (req, res) => {
      const papers = await researchPapersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(papers);
    });

    app.post("/researchPaper/:_id", async (req, res) => {
      try {
        const { _id } = req.params;
        const query = { _id: new ObjectId(_id) };

        // Find the paper in the request collection
        const paper = await researchPapersRequest.findOne(query);

        if (!paper) {
          return res.status(404).send({ message: "Research paper not found" });
        }

        // Insert into the final research collection
        const insertResult = await researchPapersCollection.insertOne(paper);

        if (insertResult.insertedId) {
          // Delete from the request collection
          const deleteResult = await researchPapersRequest.deleteOne(query);
          return res.status(200).send({
            message: "Paper published and removed from request list",
            insertedId: insertResult.insertedId,
            deletedCount: deleteResult.deletedCount,
          });
        } else {
          return res.status(500).send({ message: "Failed to publish paper" });
        }
      } catch (error) {
        console.error("Error publishing research paper:", error);
        return res.status(500).send({ message: "Server error" });
      }
    });

    // news
    app.get("/news", async (req, res) => {
      const news = await newsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(news);
    });
    app.get("/news/:_id", async (req, res) => {
      try {
        const { _id } = req.params;

        if (!ObjectId.isValid(_id)) {
          return res.status(400).json({ message: "Invalid news ID format" });
        }

        const query = { _id: new ObjectId(_id) };
        const news = await newsCollection.findOne(query);

        if (!news) {
          return res.status(404).json({ message: "News not found" });
        }

        res.json(news);
      } catch (error) {
        console.error("Error fetching news:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/news", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const data = req.body;
        const email = data.authorEmail;

        // Get author details using email
        const authorINFO = await usersCollection.findOne({ email: email });

        if (!authorINFO) {
          return res.status(404).send({ message: "Author not found" });
        }

        const newNews = {
          title: data.title,
          summary: data.summary,
          details: data.details,
          authorEmail: req.decoded.email,
          image: data.image,
          createdAt: new Date(),
        };

        // Insert into MongoDB
        const result = await newsCollection.insertOne(newNews);
        res.send(result);
      } catch (error) {
        console.error("Error adding blog:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.get("/ResearchRequest", verifyToken, verifyAdmin, async (req, res) => {
      const researchRequest = await researchPapersRequest.find().toArray();
      res.send(researchRequest);
    });

    app.delete(
      "/ResearchRequest/:_id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { _id } = req.params;
        const query = { _id: new ObjectId(_id) };

        try {
          const result = await researchPapersRequest.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Delete error:", error);
          res.status(500).send({ error: "Failed to delete research request." });
        }
      }
    );

    app.post("/ResearchRequest", verifyToken, verifyRole, async (req, res) => {
      try {
        const data = req.body;
        const email = data.authorEmail;

        // Get author details using email
        const authorINFO = await usersCollection.findOne({ email: email });

        if (!authorINFO) {
          return res.status(404).send({ message: "Author not found" });
        }

        const newResearch = {
          title: data.title,
          details: data.details,
          category: data.category,
          authorEmail: req.decoded.email,
          image: data.image,
          createdAt: new Date(),
        };

        // Insert into MongoDB
        const result = await researchPapersRequest.insertOne(newResearch);
        res.send(result);
      } catch (error) {
        console.error("Error adding Research:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    // join us application related apis
    app.post(
      "/submitApplication",
      upload.single("resume"),
      verifyToken,
      async (req, res) => {
        try {
          const formData = req.body;
          const file = req.file;

          if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
          }
          if (formData.email !== req.decoded.email) {
            return res.status(403).json({ error: "Forbidden access" });
          }

          const applicationData = {
            ...formData,
            resume: {
              filename: file.filename,
              path: `uploads/${file.filename}`,
              mimetype: file.mimetype,
              size: file.size,
            },
            createdAt: new Date(),
          };

          const result = await applicationsCollection.insertOne(
            applicationData
          );
          res.status(200).json({
            message: "Application submitted successfully!",
            data: result,
          });
        } catch (error) {
          console.error("Error processing application:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    app.get("/applications", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const applications = await applicationsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(applications);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.delete(
      "/application/:_id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { _id } = req.params;
        const filter = { _id: new ObjectId(_id) };
        const application = await applicationsCollection.findOne(filter);
        const { resume } = application;

        // Delete the resume file from /uploads if it exists
        if (resume?.path) {
          const resumePath = path.join(__dirname, resume.path);
          fs.unlink(resumePath, (err) => {
            if (err) {
              console.error("Failed to delete resume file:", err.message);
            } else {
              console.log("Resume file deleted:", resume.path);
            }
          });
        }
        const result = await applicationsCollection.deleteOne(filter);
        res.send(result);
      }
    );

    app.get("/uploads/:filename", (req, res) => {
      const filePath = path.join(__dirname, "uploads", req.params.filename);

      // Set proper headers to display in browser
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(filePath);
    });

    app.get("/post/:email", async (req, res) => {
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
    app.post("/contacts", verifyToken, async (req, res) => {
      const contactSMSInfo = {
        email: req.decoded.email,
        ...req.body,
      };
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
