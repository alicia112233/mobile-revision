# Mobile Revision Quiz

A simple local quiz app for Android/Kotlin revision.

## What this project does
- Opens a quiz page in your browser (`mobile-test.html`).
- Uses a small local Node.js proxy (`quiz-proxy-server.js`) to securely call Anthropic for question generation.
- Keeps your API key in `.env` instead of exposing it in frontend code.

## Requirements
- Node.js 18+ (recommended: latest LTS)
- An Anthropic API key

## Quick Start
1. Copy the example environment file:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` and set your key:
   ```env
   ANTHROPIC_API_KEY=your_real_key_here
   PORT=8787
   ```
3. Start the server:
   ```powershell
   npm start
   ```
4. Open this URL in your browser:
   `http://127.0.0.1:8787`

## Useful Notes
- `index.html` redirects to `mobile-test.html`.
- If you change `PORT` in `.env`, open that port in your browser instead.
- If you see an API key error, confirm `.env` exists and `ANTHROPIC_API_KEY` is set.

## Project Files
- `mobile-test.html` - main quiz UI
- `style.css` - quiz styling
- `revision-script.js` - quiz logic
- `quiz-proxy-server.js` - local proxy server + API route (`/api/generate-questions`)
- `.env.example` - sample environment variables

## Stop the server
Press `Ctrl + C` in the terminal where the server is running.
