const mongoose = require("mongoose");
const PrayerRequest = require("../models/PrayerRequest");

function ensureDatabaseReady() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Database is not connected yet. Add MONGO_URI to your .env file first.");
  }
}

async function createPrayerRequest(data) {
  ensureDatabaseReady();

  const prayerRequest = await PrayerRequest.create({
    telegramId: data.telegramId,
    chatId: data.chatId,
    username: data.username || "",
    fullName: data.fullName,
    prayerRequest: data.prayerRequest,
    status: "new",
    carryOver: false,
  });

  return prayerRequest;
}

function mergeRequestsById(requestGroups) {
  const mergedRequests = new Map();

  for (const group of requestGroups) {
    for (const request of group) {
      mergedRequests.set(String(request._id), request);
    }
  }

  return [...mergedRequests.values()].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

async function getPrayerRequests(filter = {}) {
  ensureDatabaseReady();

  const query = {};

  if (filter.status && filter.status !== "all") {
    query.status = filter.status;
  }

  return PrayerRequest.find(query).sort({ createdAt: -1 }).lean();
}

function getCurrentWeekStart(date = new Date()) {
  return getCurrentPrayerWeekWindow(date).weekStart;
}

function getCurrentPrayerWeekWindow(date = new Date()) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  weekStart.setHours(2, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);

  // Monday 12:00 AM-1:59 AM is prayer time, so it belongs to no request-collection window.
  if (date < weekStart) {
    weekStart.setDate(weekStart.getDate() - 7);
    weekEnd.setDate(weekEnd.getDate() - 7);
  }

  return {
    weekStart,
    weekEnd,
  };
}

async function getPrayerRequestsForCurrentWeek(date = new Date(), statuses = ["new", "urgent"]) {
  ensureDatabaseReady();

  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow(date);
  const [currentWeekRequests, carryOverRequests] = await Promise.all([
    PrayerRequest.find({
      createdAt: {
        $gte: weekStart,
        $lt: weekEnd,
      },
      status: {
        $in: statuses,
      },
    })
      .sort({ createdAt: 1 })
      .lean(),
    PrayerRequest.find({
      carryOver: true,
      status: {
        $in: statuses,
      },
      createdAt: {
        $gte: weekStart,
        $lt: weekEnd,
      },
    })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const requests = mergeRequestsById([currentWeekRequests, carryOverRequests]);

  return {
    weekStart,
    weekEnd,
    requests,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchPrayerRequests(searchTerm) {
  ensureDatabaseReady();

  const normalizedTerm = String(searchTerm || "").trim().replace(/^@/, "");

  if (!normalizedTerm) {
    return [];
  }

  const regex = new RegExp(escapeRegex(normalizedTerm), "i");

  return PrayerRequest.find({
    $or: [
      { prayerRequest: regex },
      { fullName: regex },
      { username: regex },
      { status: regex },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();
}

async function getPrayerRequestStats(date = new Date()) {
  ensureDatabaseReady();

  const weeklyRequests = await getPrayerRequestsForCurrentWeek(date);

  const weeklyCounts = weeklyRequests.requests.reduce(
    (accumulator, request) => {
      if (request.status === "new") {
        accumulator.new += 1;
      } else if (request.status === "urgent") {
        accumulator.urgent += 1;
      }

      if (request.carryOver) {
        accumulator.carryOver += 1;
      }

      return accumulator;
    },
    {
      new: 0,
      carryOver: 0,
      urgent: 0,
    }
  );

  const [
    totalRequests,
    allTimePrayedRequests,
    allTimeUrgentRequests,
    uniqueUsers,
  ] = await Promise.all([
    PrayerRequest.countDocuments(),
    PrayerRequest.countDocuments({ status: "prayed" }),
    PrayerRequest.countDocuments({ status: "urgent" }),
    PrayerRequest.distinct("telegramId"),
  ]);

  return {
    totalRequests,
    weekly: {
      new: weeklyCounts.new,
      urgent: weeklyCounts.urgent,
      carryOver: weeklyCounts.carryOver,
      waitingForPrayer: weeklyRequests.requests.length,
    },
    allTime: {
      prayed: allTimePrayedRequests,
      urgent: allTimeUrgentRequests,
    },
    uniqueUsers: uniqueUsers.filter(Boolean).length,
  };
}

async function markPrayerRequestAsPrayed(requestId) {
  ensureDatabaseReady();

  if (!mongoose.isValidObjectId(requestId)) {
    throw new Error("Invalid prayer request id.");
  }

  const existingRequest = await PrayerRequest.findById(requestId).lean();

  if (!existingRequest) {
    throw new Error("Prayer request not found.");
  }

  if (existingRequest.status === "prayed") {
    throw new Error("This prayer request has already been marked as prayed for.");
  }

  return setPrayerRequestStatus(requestId, "prayed", {
    prayedAt: new Date(),
  });
}

async function setPrayerRequestStatus(requestId, status, extraFields = {}) {
  ensureDatabaseReady();

  if (!mongoose.isValidObjectId(requestId)) {
    throw new Error("Invalid prayer request id.");
  }

  const allowedStatuses = new Set(["new", "prayed", "urgent"]);

  if (!allowedStatuses.has(status)) {
    throw new Error("Invalid prayer status.");
  }

  const updateFields = {
    status,
    ...extraFields,
  };

  // A prayed request must never remain in carry-over state.
  if (status === "prayed") {
    updateFields.carryOver = false;
  }

  const updatedRequest = await PrayerRequest.findByIdAndUpdate(
    requestId,
    updateFields,
    {
      returnDocument: "after",
    }
  ).lean();

  if (!updatedRequest) {
    throw new Error("Prayer request not found.");
  }

  return updatedRequest;
}

async function setPrayerRequestCarryOver(requestId, carryOver) {
  ensureDatabaseReady();

  if (!mongoose.isValidObjectId(requestId)) {
    throw new Error("Invalid prayer request id.");
  }

  const updatedRequest = await PrayerRequest.findByIdAndUpdate(
    requestId,
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

async function setPrayerRequestCarryOverByIdentifier(identifier, carryOver) {
  ensureDatabaseReady();

  const { weekStart, weekEnd } = getCurrentPrayerWeekWindow(new Date());

  // If identifier looks like an ObjectId, treat as id, otherwise username
  if (mongoose.isValidObjectId(String(identifier))) {
    const request = await PrayerRequest.findOne({
      _id: identifier,
      createdAt: { $gte: weekStart, $lt: weekEnd },
    }).lean();

    if (!request) {
      throw new Error("Prayer request not found for the current week or invalid id.");
    }

    const updated = await PrayerRequest.findByIdAndUpdate(
      request._id,
      { carryOver: Boolean(carryOver) },
      { returnDocument: "after" }
    ).lean();

    return Array.isArray(updated) ? updated : [updated];
  }

  // Normalize username (strip leading @)
  const normalized = String(identifier || "").trim().replace(/^@/, "");

  if (!normalized) {
    throw new Error("Please provide a valid id or username.");
  }

  const requests = await PrayerRequest.find({
    username: normalized,
    createdAt: { $gte: weekStart, $lt: weekEnd },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!requests.length) {
    throw new Error("No prayer requests found for that username in the current week.");
  }

  const ids = requests.map((r) => r._id);

  const result = await PrayerRequest.updateMany(
    { _id: { $in: ids } },
    { $set: { carryOver: Boolean(carryOver) } }
  );

  // Return the updated docs
  return PrayerRequest.find({ _id: { $in: ids } }).lean();
}

async function getAllCarryOverRequests() {
  ensureDatabaseReady();
  return PrayerRequest.find({ carryOver: true }).sort({ createdAt: -1 }).lean();
}

module.exports = {
  createPrayerRequest,
  getCurrentPrayerWeekWindow,
  getCurrentWeekStart,
  getPrayerRequests,
  getPrayerRequestsForCurrentWeek,
  getPrayerRequestStats,
  markPrayerRequestAsPrayed,
  searchPrayerRequests,
  setPrayerRequestCarryOver,
  setPrayerRequestCarryOverByIdentifier,
  getAllCarryOverRequests,
  setPrayerRequestStatus,
};
