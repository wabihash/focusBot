const mongoose = require("mongoose");
const PrayerRequest = require("../models/PrayerRequest");
const { setPrayerRequestStatus } = require("./prayerService");
const { notifyCarryOverRemoval } = require("./notificationService");

/**
 * Enable carryOver for a prayer request
 * Keeps the request active for the next prayer week
 * @param {string} requestId - Prayer request ID
 * @returns {Promise<Object>} Updated prayer request
 */
async function enableCarryOver(requestId) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new Error("Invalid prayer request id.");
  }

  const request = await PrayerRequest.findById(requestId).lean();

  if (!request) {
    throw new Error("Prayer request not found.");
  }

  if (request.carryOver) {
    throw new Error("This prayer request already has carry-over enabled.");
  }

  const updated = await PrayerRequest.findByIdAndUpdate(
    requestId,
    { carryOver: true },
    { returnDocument: "after" }
  ).lean();

  return updated;
}

/**
 * Disable carryOver and automatically mark as prayed
 * Sends the standard prayed notification to the user
 * @param {Object} telegram - Telegraf telegram instance
 * @param {string} requestId - Prayer request ID
 * @returns {Promise<Object>} Result object with updated request and notification status
 */
async function disableCarryOverAndMarkPrayed(telegram, requestId) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new Error("Invalid prayer request id.");
  }

  const request = await PrayerRequest.findById(requestId).lean();

  if (!request) {
    throw new Error("Prayer request not found.");
  }

  if (!request.carryOver) {
    throw new Error("This prayer request does not have carry-over enabled.");
  }

  // If already prayed, just disable carryOver without notifying again
  if (request.status === "prayed") {
    const updated = await PrayerRequest.findByIdAndUpdate(
      requestId,
      { carryOver: false },
      { returnDocument: "after" }
    ).lean();

    return {
      updated,
      prayedNow: false,
      notificationSent: false,
      alreadyPrayed: true,
      reason: "Request was already marked as prayed",
    };
  }

  // Mark as prayed and disable carryOver atomically
  const updated = await setPrayerRequestStatus(requestId, "prayed", {
    carryOver: false,
    prayedAt: new Date(),
  });

  // Attempt to notify the user
  let notificationResult = null;

  if (telegram && !request.notifiedPrayed) {
    try {
      notificationResult = await notifyCarryOverRemoval(telegram, updated);
    } catch (error) {
      console.error(
        `[carry-over] Failed to notify user about carry-over removal for ${requestId}:`,
        error.message
      );
      notificationResult = {
        success: false,
        reason: error.message,
      };
    }
  } else if (request.notifiedPrayed) {
    notificationResult = {
      success: false,
      alreadyNotified: true,
      reason: "User already notified",
    };
  }

  return {
    updated,
    prayedNow: true,
    notificationSent: notificationResult?.success || false,
    notificationResult,
  };
}

/**
 * Get all carry-over requests in the system
 * @returns {Promise<Array>} Array of carry-over prayer requests
 */
async function getAllCarryOverRequests() {
  return PrayerRequest.find({ carryOver: true }).sort({ createdAt: -1 }).lean();
}

/**
 * Get carry-over requests for current week
 * @returns {Promise<Array>} Array of carry-over prayer requests for current week
 */
async function getCurrentWeekCarryOverRequests() {
  const { getCurrentPrayerWeekWindow } = require("./prayerService");
  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow();

  return PrayerRequest.find({
    carryOver: true,
    createdAt: {
      $gte: weekStart,
      $lt: weekEnd,
    },
  })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Summary report of carry-over requests
 * @returns {Promise<Object>} Summary with counts and details
 */
async function getCarryOverSummary() {
  const [totalCarryOver, weeklyCarryOver] = await Promise.all([
    getAllCarryOverRequests(),
    getCurrentWeekCarryOverRequests(),
  ]);

  const notifiedCount = totalCarryOver.filter((r) => r.notifiedPrayed).length;
  const unnotifiedCount = totalCarryOver.length - notifiedCount;

  return {
    totalCarryOverRequests: totalCarryOver.length,
    weeklyCarryOverRequests: weeklyCarryOver.length,
    notified: notifiedCount,
    unnotified: unnotifiedCount,
  };
}

module.exports = {
  enableCarryOver,
  disableCarryOverAndMarkPrayed,
  getAllCarryOverRequests,
  getCurrentWeekCarryOverRequests,
  getCarryOverSummary,
};
