// 1. SETUP EXPRESS
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const express = require('express');
const cors = require("cors");
require('dotenv').config()
const MongoClient = require("mongodb").MongoClient;
const mongoUri = process.env.MONGO_URI;
const dbname = "sctp-delivery-jen"; // CHANGE THIS TO YOUR ACTUAL DATABASE NAME

// 1a. create the app
const app = express();

//Lab 8, Step 3: Create a Log In Route
const generateAccessToken = (id, email) => {
    return jwt.sign({
        'user_id': id,
        'email': email
    }, process.env.TOKEN_SECRET, {
        expiresIn: "1h"
    });
}

//Lab 8, Step 4: Protect Routes with a Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(403);
    jwt.verify(token, process.env.TOKEN_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };


// !! Enable processing JSON data
app.use(express.json());

// !! Enable CORS
app.use(cors());

async function connect(uri, dbname) {
    let client = await MongoClient.connect(uri, {
        useUnifiedTopology: true
    })
    let db = client.db(dbname);
    return db;
}


// 2. CREATE ROUTES
// SETUP END
async function main() {

    const db = await connect(mongoUri, dbname);
    const { ObjectId } = require('mongodb');

    // Routes
    app.get("/", function (req, res) {
        res.json({
            message: "Hello, nice to see you!",
        });
    });

    app.get("/goods", async (req, res) => {
        try {
            const goods = await db.collection("goods").find().project({
                itemCode: 1,
                brand: 1,
                address: 1,
                urgency: 1,
                recvDate: 1
            }).toArray();

            res.json({ goods });
        } catch (error) {
            console.error("Error fetching goods:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    //look for goods id
    app.get("/goods/:id", async (req, res) => {
        try {
            const id = req.params.id;

            // First, fetch the goods
            const goods = await db.collection("goods").findOne(
                { _id: new ObjectId(id) },
                { projection: { _id: 0 } }
            );

            if (!goods) {
                return res.status(404).json({ error: "Goods not found" });
            }

            res.json(goods);
        } catch (error) {
            console.error("Error fetching goods:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    //search
    app.get('/search_goods', async (req, res) => {
        try {
            const { day, month, year, brand, urgency, address, itemCode } = req.query;
            let query = {};

            if (year) {
                query['recvDate.year'] = parseInt(year); // Exact match for year
            }
            if (month) {
                query['recvDate.month'] = parseInt(month); // Exact match for month
            }
            if (day) {
                query['recvDate.day'] = parseInt(day); // Exact match for day
            }

            if (brand) {
                query['brand.name'] = { $regex: brand, $options: 'i' };
            }

            if (urgency) {
                query.urgency = { $regex: urgency, $options: 'i' };
            }

            if (address) {
                query.address = { $regex: address, $options: 'i' };
            }

            if (itemCode) {
                query.itemCode = { $regex: itemCode, $options: 'i' };
            }

            const goods = await db.collection('goods').find(query).project({
                itemCode: 1,
                address: 1,
                urgency: 1,
                recvDate: 1,
                'brand.name': 1,
                _id: 0
            }).toArray();

            res.json({ goods });
        } catch (error) {
            console.error('Error searching goods:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 4, Step 2| POST goods route
    app.post('/goods', async (req, res) => {
        try {
            const { itemCode, brand, address, urgency, recvDate } = req.body;

            // Basic validation
            if (!itemCode || !brand || !address || !urgency) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Fetch the brands document
            const brandsDoc = await db.collection('brands').findOne({ name: brand });
            if (!brandsDoc) {
                return res.status(400).json({ error: 'Invalid brand' });
            }

            //define date format
            let toDay = {
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
                day: new Date().getDate()
              };
              
            // Create the new goods object
            const newGoods = {
                itemCode,
                brand: {
                    _id: brandsDoc._id,
                    code: brandsDoc.code,
                    name: brandsDoc.name,
                    category: brandsDoc.category
                },
                address,
                urgency,
                recvDate: toDay
            };

            // Insert the new goods into the database
            const result = await db.collection('goods').insertOne(newGoods);

            // Send back the created goods
            res.status(201).json({
                message: 'Goods created successfully',
                goodsId: result.insertedId
            });
        } catch (error) {
            console.error('Error creating goods:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 5, Step 1| Add a PUT route for goods
    app.put('/goods/:id', async (req, res) => {
        try {
            const goodsId = req.params.id;
            const { itemCode, brand, address, urgency, recvDate } = req.body;

            // Basic validation
            if (!itemCode || !brand || !address || !urgency || !recvDate) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Fetch the brands document
            const brandsDoc = await db.collection('brands').findOne({ name: brand });
            if (!brandsDoc) {
                return res.status(400).json({ error: 'Invalid brand' });
            }

            // Create the updated goods object
            const updatedGoods = {
                itemCode,
                brand: {
                    _id: brandsDoc._id,
                    code: brandsDoc.code,
                    name: brandsDoc.name,
                    category: brandsDoc.category
                },
                address,
                urgency,
                recvDate
            };

            // Update the goods in the database
            const result = await db.collection('goods').updateOne(
                { _id: new ObjectId(goodsId) },
                { $set: updatedGoods }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Goods not found' });
            }

            // Send back the success response
            res.json({
                message: 'Goods updated successfully'
            });
        } catch (error) {
            console.error('Error updating goods:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 8, Step 1| Delete goods
    app.delete('/goods/:id', async (req, res) => {
        try {
            const goodsId = req.params.id;

            // Attempt to delete the goods
            const result = await db.collection('goods').deleteOne({ _id: new ObjectId(goodsId) });

            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Goods not found' });
            }

            res.json({ message: 'Goods deleted successfully' });
        } catch (error) {
            console.error('Error deleting goods:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 7, Step 1| POST comments
    app.post('/goods/:id/comments', async (req, res) => {
        try {
            const goodsId = req.params.id;
            const { reply, note, orderRemarks } = req.body;

            // Basic validation
            if (!reply || !note || !orderRemarks) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Create the new comments object
            const newComments = {
                _id: new ObjectId(),
                reply,
                note,
                orderRemarks,
                date: new Date()
            };

            // Add the comments to the goods
            const result = await db.collection('goods').updateOne(
                { _id: new ObjectId(goodsId) },
                { $push: { comments: newComments } }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Comments not found' });
            }

            res.status(201).json({
                message: 'Comments added successfully',
                commentsId: newComments.comments_id
            });
        } catch (error) {
            console.error('Error adding commnets:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //update comments
    app.put('/goods/:goodsId/comments/:commentsId', async (req, res) => {
        try {
            const goodsId = req.params.goodsId;
            const commentsId = req.params.commentsId;
            const { reply, note, orderRemarks } = req.body;
    
            // Basic validation
            if (!reply || !note || !orderRemarks) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
    
            // Create the updated comments object
            const updatedComments = {
                _id: new ObjectId(commentsId),
                reply,
                note,
                orderRemarks,
                date: new Date()  // Update the date to reflect the edit time
            };
    
            // Update the specific comments in the goods document
            const result = await db.collection('goods').updateOne(
                { 
                    _id: new ObjectId(goodsId),
                    // "comments.comments_id": new ObjectId(commentsId)
                    "comments._id": new ObjectId(commentsId)
                },
                { 
                    $set: { "comments.$": updatedComments }
                }
            );
    
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Goods or comments not found' });
            }
    
            res.json({
                message: 'Comments updated successfully',
                commentsId: commentsId
            });
        } catch (error) {
            console.error('Error updating comments:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 7, Step 6| Delete a comments Route
    app.delete('/goods/:goodsId/comments/:commentsId', async (req, res) => {
        try {
            const goodsId = req.params.goodsId;
            const commentsId = req.params.commentsId;
    
            // Remove the specific comments from the goods document
            const result = await db.collection('goods').updateOne(
                { _id: new ObjectId(goodsId) },
                { 
                    $pull: { 
                        comments: { _id: new ObjectId(commentsId) }
                    }
                }
            );
    
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Goods not found' });
            }
    
            if (result.modifiedCount === 0) {
                return res.status(404).json({ error: 'Comments not not found' });
            }
    
            res.json({
                message: 'Comments deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting comments:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    //Lab 8, Part 1: Implementing Authentication with JWT
    app.post('/users', async function (req, res) {
        const result = await db.collection("users").insertOne({
            'email': req.body.email,
            'password': await bcrypt.hash(req.body.password, 12)
        })
        res.json({
            "message": "New user account",
            "result": result
        })
      })

      //Lab 8, Step 3: Create a Log In Route
      app.post('/login', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).json({ message: 'Email and password are required' });
        }
        const user = await db.collection('users').findOne({ email: email });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ message: 'Invalid password' });
        }
        const accessToken = generateAccessToken(user._id, user.email);
        res.json({ accessToken: accessToken });
      });

      //Lab 8, Step 4: Protect Routes with a Middleware
      app.get('/protected-route', verifyToken, (req, res) => {
        // Route handler code here
      });

      app.get('/profile', verifyToken, (req, res) => {
        res.json({ message: 'This is a protected route', user: req.user });
      });
}

main();

// 3. START SERVER (Don't put any routes after this line)
app.listen(3000, function () {
    console.log("Server has started");
})