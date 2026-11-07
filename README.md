# HostelCast

HostelCast is a live-streaming and campus discovery application with a React/Vite frontend and a Node.js/Express backend.

## Requirements

- Node.js 22 or later
- MongoDB
- Redis (optional features may be disabled if not configured)
- LiveKit and Cloudinary credentials for live streaming and media uploads

## Local development

1. Copy `BACKEND/.env.example` to `BACKEND/.env` and add your local service credentials. Never commit `.env` or put private credentials in frontend variables.
2. Start the backend:

   ```powershell
   cd BACKEND
   npm install
   npm run dev
   ```

3. In a separate terminal, start the frontend:

   ```powershell
   cd FRONTEND/hostelcast
   npm install
   npm run dev
   ```

The Vite development server proxies API and Socket.IO requests to `http://localhost:5000`. For a deployed frontend, set `VITE_API_URL` to the backend's HTTPS origin (for example, `https://your-backend.onrender.com`) in the Cloudflare Pages build environment; use the same origin in the backend's `FRONTEND_ORIGINS`. Never put backend secrets in frontend variables.

## Checks

```powershell
cd BACKEND
npm test
npm audit

cd ../FRONTEND/hostelcast
npm run lint
npm run build
npm audit
```

Set production credentials through your hosting provider's secret/environment-variable settings. Email uses Brevo's HTTPS API; configure `BREVO_API_KEY` and a verified `BREVO_SENDER_EMAIL` from `BACKEND/.env.example`. Set `FRONTEND_ORIGINS` to the exact HTTPS origin(s) of the deployed frontend, comma-separated without trailing slashes. The backend rejects production startup if this is missing or malformed. Never put API keys in frontend variables or commit them. Use HTTPS and restrict database and Redis access.
