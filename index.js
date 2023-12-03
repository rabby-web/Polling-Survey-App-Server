const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5002;

// middleware
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.gnm5d1v.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const userCollection = client.db("surveyDB").collection("users");
    const surveyCollection = client.db("surveyDB").collection("survey");
    const paymentCollection = client.db("surveyDB").collection("payment");
    const commentCollection = client.db("surveyDB").collection("comment");
    const reportCollection = client.db("surveyDB").collection("report");

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
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifySurveyor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isSurveyor = user?.role === "surveyor";
      if (!isSurveyor) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user related api
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().sort({ status: 1 }).toArray();
      res.send(result);
    });
    // admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    // Surveyor
    app.get("/users/surveyor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let surveyor = false;
      if (user) {
        surveyor = user?.role === "surveyor";
      }
      res.send({ surveyor });
    });
    app.get("/users/pro-user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let prouser = false;
      if (user) {
        prouser = user?.role === "prouser";
      }
      res.send({ prouser });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user do not exit
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // handle make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // handle make Surveyor
    app.patch("/users/surveyor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "surveyor",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // delete
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    // survey--------------------

    // report
    app.get("/api/v1/report", async (req, res) => {
      const result = await reportCollection.find().toArray();
      res.send(result);
    });
    app.post("/api/v1/report", async (req, res) => {
      const report = req.body;
      console.log(report);
      const result = await reportCollection.insertOne(report);
      res.send(result);
    });

    // get :: show comment
    app.get("/api/v1/show-comment", async (req, res) => {
      let query = {};
      if (req.query.commentId) {
        query = { commentId: req.query.commentId };
      }
      const result = await commentCollection.find(query).toArray();
      res.send(result);
    });

    // post :: create comment
    app.post("/api/v1/comment", async (req, res) => {
      const comment = req.body;
      // console.log(comment);
      const result = await commentCollection.insertOne(comment);
      res.send(result);
    });
    // get :: recent survey (for featured survey)
    app.get("/api/v1/recent-surveys", async (req, res) => {
      try {
        const recentSurveys = await surveyCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.send(recentSurveys);
      } catch (error) {
        console.error("Error fetching recent surveys:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    // post :: create survey
    app.post("/api/v1/create-surveyVote", async (req, res) => {
      const survey = req.body;
      console.log(survey.email, "survey email");
      const result = await surveyCollection.insertOne(survey);
      res.send(result);
    });
    // get show survey data
    app.get("/api/v1/show-survey", async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });
    // update survey
    app.get("/api/v1/update-survey/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.findOne(query);
      res.send(result);
    });

    // update :: update survey data
    app.patch(
      "/api/v1/:surveyId/update-survey",

      async (req, res) => {
        const surveyData = req.body;
        const surveyId = req.params.surveyId;
        const query = { _id: new ObjectId(surveyId) };
        const updatedSurvey = {
          $set: {
            surveyorEmail: surveyData.surveyorEmail,
            surveyTitle: surveyData.surveyTitle,
            category: surveyData.category,
            date: surveyData.date,
            description: surveyData.description,
            question1: surveyData.question1,
          },
        };
        const result = await surveyCollection.updateOne(query, updatedSurvey);
        res.send(result);
      }
    );
    // post create survey

    app.post("/api/v1/create-survey", async (req, res) => {
      const survey = req.body;
      console.log(survey);
      const result = await surveyCollection.insertOne(survey);
      res.send(result);
    });

    // delete  create survey
    app.delete("/api/v1/delete-survey/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.deleteOne(query);
      res.send(result);
    });
    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, "a");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // app.post("/payments", async (req, res) => {
    //   const payment = req.body;
    // });
    app.get("/payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });
    //  post :: payments and user data
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      // console.log(payment);
      const result = await paymentCollection.insertOne(payment);
      // console.log(payment.email);
      const userEmail = payment.email;
      // console.log(userEmail,'ja payment korse tar email');

      // update user role
      const updateUserRole = await userCollection.updateOne(
        { email: userEmail },
        { $set: { role: "prouser" } }
      );

      res.send({ result, updateUserRole });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Crud is running...");
});

app.listen(port, () => {
  console.log(`Simple Crud is Running on port ${port}`);
});
