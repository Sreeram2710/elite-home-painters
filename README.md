# 🏠 EliteHomePainters – House Painting Services Web App

A full-stack web application for managing professional house painting services.  
Built with **Node.js**, **Express**, **EJS**, and **MongoDB**.

---

## 📦 Prerequisites

Before running this project, make sure you have:

- ✅ [Node.js](https://nodejs.org/) (v16+ recommended)
- ✅ [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- ✅ Git & GitHub account (for version control)
- ✅ [VS Code](https://code.visualstudio.com/) or any code editor
- ✅ Internet connection for fetching NPM packages

Optional:
- ✅ [MongoDB Compass](https://www.mongodb.com/products/compass) for viewing DB visually
- ✅ Postman for testing backend APIs (optional)

---

## 💡 Features

- 👨‍💼 Admin & Customer Login (Session-based)
- 📋 Quote Request System with Auto-Pricing
- 🧾 Employee Management (Add/Edit/Delete/Search)
- 🖼️ Gallery Management (Upload/View/Delete)
- 📤 Export Employee Data to CSV
- 🧾 Employee Payslip PDF Generator
- 🛎️ Admin Dashboard Alert with Sound
- 💬 Admin-Managed Discount Banner on Homepage
- 🌐 Professional UI with Responsive Design + Dark Theme

---

## 🚀 How to Run Locally

### 1. Clone the Repository

```bash
git clone https://github.com/SRIRAM2710/elite-home-painters.git
cd elite-home-painters
# elite-home-painters

Install Dependencies
npm install

3. Set Up .env File

Create a .env file in the root directory and add the following:

PORT=3000
MONGO_URI=your_mongodb_connection_string
SESSION_SECRET=your_secret_key

Start the App
npm start


Visit: http://localhost:3000


📁 Folder Structure
house-painting-app/
│
├── views/               # EJS templates (Home, Login, Dashboard, Gallery, etc.)
├── models/              # Mongoose schemas (Customer, Admin, Quote, Employee, etc.)
├── routes/              # Express route files (admin.js, customer.js)
├── public/              # Static files (CSS, images, JS, audio)
├── uploads/             # Uploaded employee/gallery images
├── app.js               # Main Express server file
├── .env                 # Environment variables (not tracked in Git)
├── .gitignore           # Files to exclude from Git
└── README.md            # Project documentation


🙌 Author

Sreeram Chowdary
PG Diploma in IT – Auckland Institute of Studies
Built as part of a real-world portfolio project.


---

### 📌 Save As:
- Filename: `README.md`
- Location: Inside your project root folder

### 💬 Then Run:
```bash
git add README.md
git commit -m "Add complete README with prerequisites and project details"
git push
