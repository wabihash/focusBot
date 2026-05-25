const mongoose = require("mongoose");
const PrayerRequest = require("../models/PrayerRequest");
const { getCurrentPrayerWeekWindow, setPrayerRequestStatus } = require("./prayerService");
const {
  getUrgentPrayerStatusMessage,
  notifyPrayerCompletion,
  sendNotification,
} = require("./notificationService");

/**
 * Find a prayer request by ID or username
 * Supports both direct ID lookup and username search within current week
 * @param {string} identifier - Prayer request ID or @username
 * @returns {Promise<Object|null>} Prayer request or null if not found
 */
async function findPrayerRequestByIdentifier(identifier) {
  if (!identifier) {
    return null;
  }

  const normalized = String(identifier).trim().replace(/^@/, "");

  if (mongoose.isValidObjectId(normalized)) {
    const request = await PrayerRequest.findById(normalized).lean();
    if (request) {
      return request;
    }
  }

  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow();
  const request = await PrayerRequest.findOne({
    username: new RegExp(`^${escapeRegex(normalized)}$`, "i"),
    createdAt: { $gte: weekStart, $lt: weekEnd },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (request) {

    return request;
  }

  return null;
}

/**
 * Escape special characters in regex patterns
 * @param {string} value - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a request is in the current prayer week
 * @param {Object} request - Prayer request object
 * @returns {boolean} Whether request is in current week
 */
function isCurrentWeekRequest(request) {
  if (!request) return false;

  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow();
  const createdAt = new Date(request.createdAt);

  return createdAt >= weekStart && createdAt < weekEnd;
}

/**
 * Mark a prayer request as urgent
 * Rules:
 * - Only current week requests can become urgent
 * - Cannot mark already urgent as urgent
 * - Cannot mark prayed requests as urgent
 * @param {Object} telegram - Telegraf telegram instance
 * @param {string} identifier - Prayer request ID or @username
 * @returns {Promise<Object>} Result object with updated request and status
 */
async function markAsUrgent(telegram, identifier) {
  const request = await findPrayerRequestByIdentifier(identifier);

  if (!request) {
    return {
      success: false,
      reason: "Prayer request not found.",
    };
  }

  if (!isCurrentWeekRequest(request)) {
    return {
      success: false,
      reason: "⚠️ Only requests from the current week can be marked as urgent.",
    };
  }

  if (request.status === "urgent") {
    return {
      success: false,
      reason: "⚠️ This request is already marked as urgent.",
    };
  }

  if (request.status === "prayed") {
    return {
      success: false,
      reason: "⚠️ This request has already been prayed for and cannot become urgent.",
    };
  }

  try {
    const updated = await PrayerRequest.findByIdAndUpdate(
      request._id,
      { status: "urgent" },
      { returnDocument: "after" }
    ).lean();

    let notificationSent = false;
    let notificationResult = null;
    const recipientId = updated.telegramId || updated.chatId;

    if (telegram && recipientId) {
      const message = getUrgentPrayerStatusMessage();
      notificationSent = await sendNotification(telegram, recipientId, message);
      notificationResult = notificationSent
        ? {
            success: true,
            notificationSent: true,
            recipientId,
          }
        : {
            success: false,
            notificationSent: false,
            recipientId,
            reason: "Failed to send notification",
          };
    }

    return {
      success: true,
      updated,
      statusChanged: true,
      previousStatus: request.status,
      newStatus: "urgent",
      notificationSent,
      notificationResult,
    };
  } catch (error) {
    console.error(`[status] Failed to mark as urgent: ${error.message}`);
    return {
      success: false,
      reason: error.message,
    };
  }
}

/**
 * Mark a prayer request as prayed
 * Rules:
 * - Can transition from any status (new, urgent) to prayed
 * - Cannot mark already prayed as prayed
 * - Notifies user (unless already notified)
 * @param {Object} telegram - Telegraf telegram instance
 * @param {string} identifier - Prayer request ID or @username
 * @returns {Promise<Object>} Result object with updated request and notification status
 */
async function markAsPrayed(telegram, identifier) {
  const request = await findPrayerRequestByIdentifier(identifier);

  if (!request) {
    return {
      success: false,
      reason: "Prayer request not found.",
    };
  }

  // Check if already prayed
  if (request.status === "prayed") {
    return {
      success: false,
      reason: "⚠️ This request is already marked as prayed.",
    };
  }

  try {
    const updated = await setPrayerRequestStatus(request._id, "prayed", {
      prayedAt: new Date(),
    });

    const previousStatus = request.status;

    let notificationResult = null;
    if (telegram) {
      notificationResult = await notifyPrayerCompletion(telegram, updated);
    }

    return {
      success: true,
      updated,
      statusChanged: true,
      previousStatus,
      newStatus: "prayed",
      notificationSent: notificationResult?.success || false,
      notificationResult,
    };
  } catch (error) {
    console.error(`[status] Failed to mark as prayed: ${error.message}`);
    return {
      success: false,
      reason: error.message,
    };
  }
}

/**
 * Get detailed information about a prayer request
 * @param {string} identifier - Prayer request ID or @username
 * @returns {Promise<Object|null>} Prayer request with enriched information
 */
async function getPrayerRequestInfo(identifier) {
  const request = await findPrayerRequestByIdentifier(identifier);

  if (!request) {
    return null;
  }

  const isCurrentWeek = isCurrentWeekRequest(request);

  return {
    ...request,
    isCurrentWeek,
    canBecomeUrgent: isCurrentWeek && request.status !== "urgent" && request.status !== "prayed",
    canBecomePrayed: request.status !== "prayed",
  };
}

module.exports = {
  findPrayerRequestByIdentifier,
  isCurrentWeekRequest,
  markAsUrgent,
  markAsPrayed,
  getPrayerRequestInfo,
};
