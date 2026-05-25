const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn("[db] MONGO_URI is not set yet. Telegram commands will still work, but database features will be disabled.");
    return false;
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);

  console.log("[db] Connected to MongoDB");
  return true;
}

module.exports = connectDB;

