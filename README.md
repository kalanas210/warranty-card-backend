# WarrantyActivation - Backend Service

![CI](https://img.shields.io/badge/CI-passing-success?style=for-the-badge&logo=github)
![Node.js](https://img.shields.io/badge/Node.js-18+-success?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.18-blue?style=for-the-badge&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-green?style=for-the-badge&logo=mongodb)
![JWT](https://img.shields.io/badge/JWT-Auth-orange?style=for-the-badge&logo=jsonwebtokens)

> A secure, scalable backend service that powers real-time product warranty registrations, authentications, and QR code generations. Built to ensure that products are easily verifiable and shop owners can seamlessly activate warranties.

The backend of the Warranty Activation System provides the core logic and database management for handling products, shops, QR codes, and customer warranty records. It includes a comprehensive API used by the frontend to verify serial numbers, manage inventory, and track warranty durations.

## Features

- **QR Code Management:** Automatically generates unique serial numbers and tracks QR codes per product.
- **Role-Based Authentication:** Secure JWT-based authentication with distinct roles for Admin and Shop Owners.
- **Warranty Tracking:** Real-time tracking of warranty durations, activation dates, and remaining valid days.
- **Shop & Product Management:** Full CRUD APIs for managing registered shops and the product catalog.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (with Mongoose ODM)
- **Security:** bcryptjs, jsonwebtoken, helmet, cors
- **Utilities:** multer, cloudinary, pdfkit, qrcode

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd warranty-card-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/warranty-system
   JWT_SECRET=your_super_secret_key
   ```

4. **Start the server:**
   ```bash
   npm start
   # or for development (if nodemon is installed)
   npm run dev
   ```

## API Structure

- `/api/admin/*` - Protected routes for admin management (shops, products, generating QR codes).
- `/api/public/*` - Routes for shop owner logins, QR scanning, and customer warranty activation.

---
*Built with ❤️ for a modern approach to product warranties.*
