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

The Vite development server proxies API and Socket.IO requests to `http://localhost:5000`.

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

Set production credentials through your hosting provider's secret/environment-variable settings. Use HTTPS, restrict database and Redis access, and configure the backend's allowed web origins for the production frontend.
