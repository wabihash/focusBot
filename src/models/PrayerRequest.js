const mongoose = require("mongoose");

const prayerRequestSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      index: true,
    },
    chatId: {
      type: Number,
      required: true,
      index: true,
    },
    username: {
      type: String,
      default: "",
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    prayerRequest: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "prayed", "urgent"],
      default: "new",
      index: true,
    },
    carryOver: {
      type: Boolean,
      default: false,
      index: true,
    },
    prayedAt: {
      type: Date,
      default: null,
    },
    notifiedPrayed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PrayerRequest", prayerRequestSchema);
