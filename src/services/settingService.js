const mongoose = require("mongoose");
const Setting = require("../models/Setting");

function ensureDatabaseReady() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database is not connected yet. Add MONGO_URI to your .env file first.");
  }
}

async function getSetting(key, defaultValue = null) {
  ensureDatabaseReady();

  const setting = await Setting.findOne({ key }).lean();
  return setting ? setting.value : defaultValue;
}

async function setSetting(key, value) {
  ensureDatabaseReady();

  await Setting.findOneAndUpdate(
    { key },
    { $set: { value } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return value;
}

module.exports = {
  getSetting,
  setSetting,
};