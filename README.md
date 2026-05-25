# Prayer Bot

A Telegram prayer request bot built with Node.js, Telegraf, MongoDB, and Mongoose.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933)
![Telegraf](https://img.shields.io/badge/Telegraf-Telegram_Bot-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248)
![License](https://img.shields.io/badge/License-ISC-lightgrey)

## Overview

Prayer Bot helps a church or ministry collect prayer requests, manage admin updates, and send private follow-up notifications.

## Features

- Submit prayer requests with `/pray`
- Cancel the current prayer flow with `/cancel`
- Admin tools for prayer status updates, carry-over management, exports, and announcements
- Private admin messaging with `/notify @username <message>`
- Automatic weekly rollover and notification support

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create a `.env` file in the project root.

```env
BOT_TOKEN=your_telegram_bot_token
MONGO_URI=your_mongodb_connection_string
ADMIN_IDS=123456789,987654321
```

You can also copy from `.env.example` and fill in your values.

3. Start the bot.

```bash
npm run dev
```

## Usage Examples

### Screenshots

Add a screenshot here after deployment to show the bot menu or admin panel.

### User Commands

```text
/pray
/cancel
```

### Admin Commands

```text
/admin
/weeklyrequests
/search Wabi
/stats
/export weekly
/prayed 6829f2d7c4a1
/urgent @username
/carryover @username
/nocarryover @username
/announce Tonight we will pray together at 8 PM.
/notify @username Your prayer team update is ready.
```

## Deployment

This app can run anywhere that supports Node.js and MongoDB.

1. Set the required environment variables in your hosting platform.
2. Install dependencies with `npm install`.
3. Start the process with `npm start`.
4. Make sure the host can reach MongoDB and the Telegram API.

For production servers, a process manager such as `pm2` can be used if desired.

## Environment Variables

- `BOT_TOKEN` - Telegram bot token
- `MONGO_URI` - MongoDB connection string
- `ADMIN_IDS` - Comma-separated Telegram user IDs allowed to use admin commands
- `ADMIN_ID` - Optional single admin ID fallback

## Command Reference

### User Commands

- `/pray` - Submit a prayer request
- `/cancel` - Cancel the current prayer flow

### Admin Commands

- `/admin` - Open the admin menu
- `/weeklyrequests` - View this week's detailed request list
- `/search <query>` - Search by name, username, text, or status
- `/stats` - View prayer statistics
- `/export <weekly | all | prayed | urgent>` - Export requests
- `/prayed <id | @username>` - Mark a request as prayed
- `/urgent <id | @username>` - Mark a request as urgent
- `/carryover <id | @username>` - Preserve a request for next week
- `/nocarryover <id | @username>` - Clear carry-over for a request
- `/carryoverlist` - Show all requests with carry-over enabled
- `/announce <message>` - Send a community announcement
- `/notify @username <message>` - Send a private message to one user

## Recent Updates

- Added `/notify` for private admin messages to a specific user.
- Improved username-based lookup for admin prayer status actions.
- Added private notification handling for urgent and prayed updates.
- Expanded the README with usage examples and deployment notes.

## Project Structure

- `src/bot.js` - Bot bootstrap and service wiring
- `src/commands/` - Telegram command handlers
- `src/config/` - Database configuration
- `src/middlewares/` - Access control and message handling
- `src/models/` - Mongoose schemas
- `src/scenes/` - Conversation flows
- `src/services/` - Business logic
- `src/utils/` - Formatting and shared helpers
- `scripts/` - One-off maintenance scripts

## Notes

- Admin commands are restricted through `ADMIN_IDS`.
- User records are synchronized from Telegram activity when available.
- Weekly rollover and notification behavior depend on MongoDB being connected.

## License

ISC
