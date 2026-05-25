const cron = require("node-cron");
const mongoose = require("mongoose");
const PrayerRequest = require("../models/PrayerRequest");
const { getCurrentPrayerWeekWindow } = require("./prayerService");
const { getPreferredDisplayName } = require("../utils/displayName");
const { getSetting, setSetting } = require("./settingService");
const { notifyMultiplePrayerCompletions } = require("./notificationService");

let botInstance = null;

/**
 * Set the bot instance for sending notifications
 * Called from bot.js during initialization
 * @param {Object} bot - Telegraf bot instance
 */
function setBotInstance(bot) {
  botInstance = bot;
}

const SETTINGS_KEY = "weeklyRolloverState";
const NOTIFICATION_SETTINGS_KEY = "weeklyRolloverNotificationPreference";

function getPreviousPrayerWeekWindow(date = new Date()) {
  const { weekStart: currentWeekStart } = getCurrentPrayerWeekWindow(date);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  return {
    weekStart: previousWeekStart,
    weekEnd: currentWeekStart,
  };
}

function formatWeekLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function summarizeByStatus(requests) {
  return requests.reduce(
    (accumulator, request) => {
      const key = request.status || "unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    },
    {}
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRequestIdentifier(identifier) {
  return String(identifier || "").trim().replace(/^@/, "");
}

function buildCarryOverDisplayName(request) {
  return getPreferredDisplayName({
    fullName: request.fullName,
    username: request.username,
    telegramId: request.telegramId,
  });
}

function buildCarryOverLookupQuery(identifier) {
  const normalizedIdentifier = normalizeRequestIdentifier(identifier);

  if (!normalizedIdentifier) {
    return null;
  }

  if (mongoose.isValidObjectId(normalizedIdentifier)) {
    return { _id: normalizedIdentifier };
  }

  return {
    username: new RegExp(`^${escapeRegex(normalizedIdentifier)}$`, "i"),
  };
}

function formatCarryOverRequestLog(request) {
  const name = buildCarryOverDisplayName(request);
  const identifier = request.username ? `@${request.username}` : `ID ${request._id}`;
  return `${name} (${identifier})`;
}

async function getCurrentWeekPrayerRequests({ identifier, carryOver } = {}) {
  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow();
  const query = {
    createdAt: {
      $gte: weekStart,
      $lt: weekEnd,
    },
  };

  const lookupQuery = buildCarryOverLookupQuery(identifier);

  if (lookupQuery) {
    Object.assign(query, lookupQuery);
  }

  if (typeof carryOver === "boolean") {
    query.carryOver = carryOver;
  }

  const requests = await PrayerRequest.find(query).sort({ createdAt: -1 }).lean();

  return {
    weekStart,
    weekEnd,
    requests,
  };
}

async function getCarryOverRequests() {
  return PrayerRequest.find({ carryOver: true }).sort({ createdAt: -1 }).lean();
}

async function setPrayerRequestCarryOverForCurrentWeek(identifier, carryOver) {
  const normalizedIdentifier = normalizeRequestIdentifier(identifier);

  if (!normalizedIdentifier) {
    throw new Error("Please provide a prayer request id or username.");
  }

  const { requests } = await getCurrentWeekPrayerRequests({ identifier: normalizedIdentifier });

  if (!requests.length) {
    throw new Error("Only prayer requests submitted this week can be marked for carry-over.");
  }

  // When a username matches multiple requests, update the latest current-week request only.
  const targetRequest = requests[0];

  const updatedRequest = await PrayerRequest.findByIdAndUpdate(
    targetRequest._id,
    {
      carryOver: Boolean(carryOver),
    },
    {
      returnDocument: "after",
    }
  ).lean();

  if (!updatedRequest) {
    throw new Error("Prayer request not found.");
  }

  return updatedRequest;
}

async function getWeeklyRolloverState() {
  const state = await getSetting(SETTINGS_KEY, {});
  return state && typeof state === "object" ? state : {};
}

async function setWeeklyRolloverState(patch) {
  const currentState = await getWeeklyRolloverState();
  const nextState = {
    ...currentState,
    ...patch,
  };

  await setSetting(SETTINGS_KEY, nextState);
  return nextState;
}

/**
 * Get the weekly rollover notification preference
 * @returns {Promise<boolean>} Whether to send notifications during weekly rollover
 */
async function getSendWeeklyPrayedNotifications() {
  const preference = await getSetting(NOTIFICATION_SETTINGS_KEY, true);
  return Boolean(preference);
}

/**
 * Set the weekly rollover notification preference
 * @param {boolean} enabled - Whether to send notifications during weekly rollover
 * @returns {Promise<boolean>} The set value
 */
async function setSendWeeklyPrayedNotifications(enabled) {
  await setSetting(NOTIFICATION_SETTINGS_KEY, Boolean(enabled));
  return Boolean(enabled);
}

async function markPreviousWeekAsPrayed({ dryRun = false, reason = "scheduled", telegram = null } = {}) {
  const now = new Date();
  const { weekStart, weekEnd } = getPreviousPrayerWeekWindow(now);
  const requests = await PrayerRequest.find({
    createdAt: {
      $gte: weekStart,
      $lt: weekEnd,
    },
  })
    .sort({ createdAt: 1 })
    .lean();

  const carryOverRequests = requests.filter((request) => request.carryOver === true);
  const eligibleRequests = requests.filter((request) => request.carryOver !== true);
  const statusBreakdown = summarizeByStatus(requests);
  const eligibleStatusBreakdown = summarizeByStatus(eligibleRequests);
  const carryOverStatusBreakdown = summarizeByStatus(carryOverRequests);
  const eligibleRequestIds = eligibleRequests.map((request) => String(request._id));
  const carryOverRequestIds = carryOverRequests.map((request) => String(request._id));
  const carryOverRequestLabels = carryOverRequests.map(formatCarryOverRequestLog);

  if (dryRun) {
    return {
      dryRun: true,
      weekStart,
      weekEnd,
      requests,
      statusBreakdown,
      eligibleStatusBreakdown,
      carryOverStatusBreakdown,
      eligibleRequestIds,
      carryOverRequestIds,
      updatedCount: 0,
      notificationResult: null,
    };
  }

  if (!requests.length || !eligibleRequests.length) {
    await setWeeklyRolloverState({
      lastSuccessfulRolloverAt: now.toISOString(),
      lastRolloverWindowStart: weekStart.toISOString(),
      lastRolloverWindowEnd: weekEnd.toISOString(),
      lastRolloverReason: reason,
    });

    return {
      dryRun: false,
      weekStart,
      weekEnd,
      requests,
      statusBreakdown,
      eligibleStatusBreakdown,
      carryOverStatusBreakdown,
      eligibleRequestIds,
      carryOverRequestIds,
      updatedCount: 0,
      notificationResult: null,
    };
  }

  const updateResult = await PrayerRequest.updateMany(
    {
      _id: { $in: eligibleRequestIds },
    },
    {
      $set: {
        status: "prayed",
        prayedAt: now,
      },
    }
  );

  // Send notifications if enabled and telegram instance is available
  let notificationResult = null;
  const shouldNotify = await getSendWeeklyPrayedNotifications();

  if (shouldNotify && telegram) {
    try {
      const updatedRequests = await PrayerRequest.find({
        _id: { $in: eligibleRequestIds },
      }).lean();

      notificationResult = await notifyMultiplePrayerCompletions(telegram, updatedRequests);

      if (notificationResult.errors.length) {
        console.warn(`[weekly-roll] Notification errors: ${notificationResult.errors.join("; ")}`);
      }
    } catch (error) {
      console.error("[weekly-roll] Failed to send notifications:", error.message);
      notificationResult = {
        sent: 0,
        failed: 0,
        skipped: 0,
        total: eligibleRequests.length,
        errors: [error.message],
      };
    }
  } else if (shouldNotify && !telegram) {
    console.warn("[weekly-roll] Notifications are enabled but telegram instance is not available.");
  }

  await setWeeklyRolloverState({
    lastSuccessfulRolloverAt: now.toISOString(),
    lastRolloverWindowStart: weekStart.toISOString(),
    lastRolloverWindowEnd: weekEnd.toISOString(),
    lastRolloverReason: reason,
  });

  return {
    dryRun: false,
    weekStart,
    weekEnd,
    requests,
    statusBreakdown,
    eligibleStatusBreakdown,
    carryOverStatusBreakdown,
    eligibleRequestIds,
    carryOverRequestIds,
    updatedCount: updateResult.modifiedCount || eligibleRequests.length,
    notificationResult,
  };
}

async function runStartupWeeklyRolloverPreview() {
  const state = await getWeeklyRolloverState();

  if (state.firstDryRunCompletedAt) {
    return { skipped: true };
  }

  const result = await markPreviousWeekAsPrayed({ dryRun: true, reason: "startup-preview" });

  await setWeeklyRolloverState({
    firstDryRunCompletedAt: new Date().toISOString(),
  });

  return result;
}

async function initializeWeeklyRolloverOnStartup() {
  const now = new Date();
  const { weekStart } = getCurrentPrayerWeekWindow(now);
  let previewResult = null;

  if (!(await getWeeklyRolloverState()).firstDryRunCompletedAt) {
    previewResult = await runStartupWeeklyRolloverPreview();
  }

  if (now >= weekStart && (await shouldRunWeeklyRollover())) {
    const catchUpResult = await runScheduledWeeklyRollover();
    return {
      previewResult,
      catchUpResult,
    };
  }

  return previewResult || { skipped: true };
}

async function shouldRunWeeklyRollover() {
  const state = await getWeeklyRolloverState();
  const now = new Date();
  const { weekStart } = getCurrentPrayerWeekWindow(now);

  if (!state.lastSuccessfulRolloverAt) {
    return true;
  }

  return new Date(state.lastSuccessfulRolloverAt) < weekStart;
}

async function runScheduledWeeklyRollover() {
  if (!(await shouldRunWeeklyRollover())) {
    return { skipped: true };
  }

  return markPreviousWeekAsPrayed({ dryRun: false, reason: "scheduled-run", telegram: botInstance });
}

function startWeeklyRolloverScheduler() {
  const scheduledJob = cron.schedule(
    "0 2 * * 1",
    async () => {
      try {
        await runScheduledWeeklyRollover();
      } catch (error) {
        console.error("[weekly-roll] Scheduled rollover failed:", error);
      }
    },
    {
      scheduled: true,
    }
  );

  console.log("[weekly-roll] Scheduler registered for Monday 02:00.");
  return scheduledJob;
}

module.exports = {
  executeWeeklyRollover: markPreviousWeekAsPrayed,
  getCarryOverRequests,
  getPreviousPrayerWeekWindow,
  initializeWeeklyRolloverOnStartup,
  runScheduledWeeklyRollover,
  runStartupWeeklyRolloverPreview,
  markPreviousWeekAsPrayed,
  shouldRunWeeklyRollover,
  setPrayerRequestCarryOverForCurrentWeek,
  startWeeklyRolloverScheduler,
  getSendWeeklyPrayedNotifications,
  setSendWeeklyPrayedNotifications,
  setBotInstance,
};