const PrayerRequest = require("../models/PrayerRequest");

/**
 * Get the formatted notification message for prayer completion
 * @returns {string} Formatted notification message
 */
function getPrayerCompletionMessage() {
  return [
    "🙏 Your prayer request has been prayed for.",
    "",
    "📖 14Akka fedha isaatti yoo isa kadhanne inni nuuf in dhaga'a;  akka kanatti isa in amananna. 15 Kadhata keenya akka inni nuuf dhaga'u yoo beekne, waan kadhanne akka isa biraa argannus in beekna.",
    "1Yohannis 5:14-15",
    "",
    "💙 Our fellowship is praying with you.",
  ].join("\n");
}

/**
 * Get the formatted notification message for urgent prayer requests
 * @returns {string} Formatted notification message
 */
function getUrgentPrayerStatusMessage() {
  return [
    "🙏 Your prayer request has been marked as urgent, and we are standing with you.",
    "",
    "💪 May God give you strength and peace as you wait on Him.",
    "",
    '📖 "So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand."',
    "— Isaiah 41:10",
  ].join("\n");
}

/**
 * Send a prayer completion notification to a user
 * @param {Object} telegram - Telegraf telegram instance
 * @param {number} recipientId - Telegram user ID or chat ID
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} Whether the notification was sent successfully
 */
async function sendNotification(telegram, recipientId, message) {
  if (!telegram || !recipientId || !message) {
    console.error("[notification] Missing required parameters for sending notification");
    return false;
  }

  try {
    await telegram.sendMessage(recipientId, message);
    return true;
  } catch (error) {
    console.error(`[notification] Failed to send notification to user ${recipientId}:`, error.message);
    return false;
  }
}

/**
 * Mark a prayer request as notified (to prevent duplicate notifications)
 * @param {string} requestId - Prayer request ID
 * @returns {Promise<Object>} Updated prayer request
 */
async function markRequestAsNotified(requestId) {
  try {
    const updatedRequest = await PrayerRequest.findByIdAndUpdate(
      requestId,
      { notifiedPrayed: true },
      { returnDocument: "after" }
    ).lean();

    return updatedRequest;
  } catch (error) {
    console.error("[notification] Failed to mark request as notified:", error.message);
    throw error;
  }
}

/**
 * Send prayer completion notification to a user
 * Prevents duplicate notifications and handles errors gracefully
 * @param {Object} telegram - Telegraf telegram instance
 * @param {Object} prayerRequest - Prayer request object with telegramId, chatId, and _id
 * @returns {Promise<Object>} Result object with success status and details
 */
async function notifyPrayerCompletion(telegram, prayerRequest) {
  if (!prayerRequest) {
    return {
      success: false,
      reason: "Prayer request not found",
    };
  }

  // Check if already notified to prevent duplicates
  if (prayerRequest.notifiedPrayed) {
    return {
      success: false,
      reason: "Already notified",
      alreadyNotified: true,
    };
  }

  const recipientId = prayerRequest.telegramId || prayerRequest.chatId;

  if (!recipientId) {
    console.error(`[notification] No recipient ID found for prayer request ${prayerRequest._id}`);
    return {
      success: false,
      reason: "No recipient ID found",
    };
  }

  const message = getPrayerCompletionMessage();
  const notificationSent = await sendNotification(telegram, recipientId, message);

  if (notificationSent) {
    // Mark the request as notified
    try {
      await markRequestAsNotified(prayerRequest._id);
      return {
        success: true,
        notificationSent: true,
        recipientId,
      };
    } catch (error) {
      // Even if marking fails, the notification was sent
      return {
        success: true,
        notificationSent: true,
        recipientId,
        markingError: error.message,
      };
    }
  }

  return {
    success: false,
    notificationSent: false,
    recipientId,
    reason: "Failed to send notification",
  };
}

/**
 * Notify multiple prayer request completions
 * Used for bulk operations like weekly rollover
 * @param {Object} telegram - Telegraf telegram instance
 * @param {Array<Object>} prayerRequests - Array of prayer request objects
 * @returns {Promise<Object>} Summary of notification results
 */
async function notifyMultiplePrayerCompletions(telegram, prayerRequests) {
  if (!Array.isArray(prayerRequests)) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: ["Invalid input: prayerRequests must be an array"],
    };
  }

  const results = {
    total: prayerRequests.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const request of prayerRequests) {
    try {
      const result = await notifyPrayerCompletion(telegram, request);

      if (result.alreadyNotified) {
        results.skipped += 1;
      } else if (result.success) {
        results.sent += 1;
      } else {
        results.failed += 1;
        if (result.reason) {
          results.errors.push(`Request ${request._id}: ${result.reason}`);
        }
      }
    } catch (error) {
      results.failed += 1;
      results.errors.push(`Request ${request._id}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Send carried-over removal notification to a user
 * Reuses the standard prayed notification so carried-over requests receive the same message
 * @param {Object} telegram - Telegraf telegram instance
 * @param {Object} prayerRequest - Prayer request object with telegramId, chatId, and _id
 * @returns {Promise<Object>} Result object with success status and details
 */
async function notifyCarryOverRemoval(telegram, prayerRequest) {
  if (!prayerRequest) {
    return {
      success: false,
      reason: "Prayer request not found",
    };
  }

  // Check if already notified to prevent duplicates
  if (prayerRequest.notifiedPrayed) {
    return {
      success: false,
      reason: "Already notified",
      alreadyNotified: true,
    };
  }

  const recipientId = prayerRequest.telegramId || prayerRequest.chatId;

  if (!recipientId) {
    console.error(`[notification] No recipient ID found for prayer request ${prayerRequest._id}`);
    return {
      success: false,
      reason: "No recipient ID found",
    };
  }

  const notificationSent = await sendNotification(telegram, recipientId, getPrayerCompletionMessage());

  if (!notificationSent) {
    return {
      success: false,
      notificationSent: false,
      recipientId,
      reason: "Failed to send notification",
    };
  }

  // Mark the request as notified
  try {
    await markRequestAsNotified(prayerRequest._id);
    return {
      success: true,
      notificationSent: true,
      recipientId,
    };
  } catch (error) {
    // Even if marking fails, the notification was sent
    return {
      success: true,
      notificationSent: true,
      recipientId,
      markingError: error.message,
    };
  }
}

module.exports = {
  getPrayerCompletionMessage,
  getUrgentPrayerStatusMessage,
  sendNotification,
  markRequestAsNotified,
  notifyPrayerCompletion,
  notifyMultiplePrayerCompletions,
  notifyCarryOverRemoval,
};

