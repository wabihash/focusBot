#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const PrayerRequest = require('../src/models/PrayerRequest');

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env. Aborting.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const result = await PrayerRequest.updateMany({ status: 'waiting' }, { $set: { status: 'new' } });
    console.log(`Matched: ${result.matchedCount || result.n}, Modified: ${result.modifiedCount || result.nModified}`);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
