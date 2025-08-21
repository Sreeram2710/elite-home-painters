// ===== Import Modules =====
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");
const multer = require("multer");
const mongoose = require("mongoose");
const session = require("express-session");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const { Parser } = require("json2csv");

// ===== Import Models =====
const Customer = require("./models/Customer");
const Quote = require("./models/Quote");
const Admin = require("./models/Admin");
const Employee = require("./models/Employee");
const Gallery = require("./models/Gallery");

// ===== MongoDB Connection =====
mongoose
  .connect("mongodb://127.0.0.1:27017/elitehomepainters")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ===== Middleware =====
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "elite_secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ===== Multer Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ===== Global Session Middleware =====
app.use((req, res, next) => {
  res.locals.customer = req.session.customer || null;
  res.locals.admin = req.session.admin || null;
  next();
});

// ===== Public Routes =====
app.get("/", (req, res) => res.render("index"));
app.get("/about", (req, res) => res.render("about"));
app.get("/services", (req, res) => res.render("services"));
app.get("/testimonials", (req, res) => res.render("testimonials"));
app.get("/faq", (req, res) => res.render("faq"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/gallery", async (req, res) => {
  const images = await Gallery.find().sort({ uploadedAt: -1 });
  res.render("gallery", { images });
});

// ===== Admin Authentication =====
app.get("/internal-admin-register", (req, res) => res.render("admin-register"));
app.post("/internal-admin-register", async (req, res) => {
  const { name, email, password } = req.body;
  await Admin.create({ name, email, password });
  res.redirect("/internal-admin-access");
});

app.get("/internal-admin-access", (req, res) => res.render("admin-login"));
app.post("/internal-admin-access", async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email, password });
  if (admin) {
    req.session.admin = admin;
    res.redirect("/admin/dashboard");
  } else {
    res.send("❌ Invalid admin credentials.");
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.admin = null;
  res.redirect("/internal-admin-access");
});

// ===== Admin Dashboard =====
app.get("/admin/dashboard", async (req, res) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  const customerCount = await Customer.countDocuments();
  const quoteCount = await Quote.countDocuments();
  const activeEmployees = await Employee.countDocuments({ status: "Active" });
  res.render("admin-dashboard", { customerCount, quoteCount, activeEmployees });
});

// ===== Employee Management =====
app.get("/admin/add-employee", (req, res) => res.render("add-employee"));
app.post("/admin/add-employee", upload.single("photo"), async (req, res) => {
  const { name, role, salary, contact, doj } = req.body;
  const photo = req.file?.filename;
  await Employee.create({ name, role, salary, contact, doj, photo, status: "Active" });
  res.redirect("/admin/employees");
});

app.get("/admin/employees", async (req, res) => {
  const search = req.query.search || "";
  const query = search
    ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { role: { $regex: search, $options: "i" } },
        ],
      }
    : {};
  const employees = await Employee.find(query);
  res.render("view-employees", { employees, search });
});

app.get("/admin/edit-employee/:id", async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  res.render("edit-employee", { employee });
});

app.post("/admin/edit-employee/:id", upload.single("photo"), async (req, res) => {
  const updates = req.body;
  if (req.file) updates.photo = req.file.filename;
  await Employee.findByIdAndUpdate(req.params.id, updates);
  res.redirect("/admin/employees");
});

app.post("/admin/delete-employee/:id", async (req, res) => {
  await Employee.findByIdAndDelete(req.params.id);
  res.redirect("/admin/employees");
});

app.post("/admin/activate/:id", async (req, res) => {
  await Employee.findByIdAndUpdate(req.params.id, { status: "Active" });
  res.redirect("/admin/employees");
});

app.post("/admin/deactivate/:id", async (req, res) => {
  await Employee.findByIdAndUpdate(req.params.id, { status: "Inactive" });
  res.redirect("/admin/employees");
});

// ===== Quote Requests =====
app.get("/quote", (req, res) => res.render("quote"));
app.post("/quote", async (req, res) => {
  const { name, email, phone, address, paintType, area, message } = req.body;
  const estimatedPrice = area * 1.5;

  const newQuote = await Quote.create({
    name,
    email,
    phone,
    address,
    paintType,
    area,
    message,
    estimatedPrice,
    createdAt: new Date(),
  });

  io.emit("newQuote");

  res.render("quote-confirmation", { quote: newQuote });
});

app.get("/admin/quote-requests", async (req, res) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  const quotes = await Quote.find().sort({ createdAt: -1 });
  res.render("admin-quote-requests", { quotes });
});

app.post("/admin/delete-quote/:id", async (req, res) => {
  if (!req.session.admin) return res.status(403).send("Unauthorized");
  await Quote.findByIdAndDelete(req.params.id);
  res.redirect("/admin/quote-requests");
});

app.post("/admin/reset-notifications", (req, res) => {
  if (!req.session.admin) return res.sendStatus(403);
  res.sendStatus(200);
});

app.get("/admin/api/quote-count", async (req, res) => {
  if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
  const count = await Quote.countDocuments();
  res.json({ count });
});

// ===== Gallery Management =====
app.get("/admin/gallery", async (req, res) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  const images = await Gallery.find().sort({ uploadedAt: -1 });
  res.render("admin-gallery", { images });
});

app.post("/admin/gallery/upload", upload.single("image"), async (req, res) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  const { caption } = req.body;
  const imageFile = req.file ? req.file.filename : null;
  if (!imageFile) return res.send("❌ No file uploaded.");
  await Gallery.create({ caption, image: imageFile, uploadedAt: new Date() });
  res.redirect("/admin/gallery");
});

app.post("/admin/gallery/delete/:id", async (req, res) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  const image = await Gallery.findByIdAndDelete(req.params.id);
  if (image?.image) {
    const filePath = path.join(__dirname, "uploads", image.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  res.redirect("/admin/gallery");
});

// ===== Customer Auth =====
app.get("/customer/register", (req, res) => res.render("customer-register"));
app.post("/customer/register", async (req, res) => {
  const { name, email, password } = req.body;
  await Customer.create({ name, email, password });
  res.redirect("/customer/login");
});

app.get("/customer/login", (req, res) => res.render("customer-login"));
app.post("/customer/login", async (req, res) => {
  const { email, password } = req.body;
  const customer = await Customer.findOne({ email, password });
  if (customer) {
    req.session.customer = customer;
    res.redirect("/customer/dashboard");
  } else {
    res.send("❌ Invalid credentials");
  }
});

app.get("/customer/dashboard", (req, res) => {
  if (!req.session.customer) return res.redirect("/customer/login");
  res.render("customer-dashboard");
});

// ===== Shared Auth Routes =====
app.get("/login", (req, res) => res.render("customer-login"));
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.log("Logout Error:", err);
    res.redirect("/");
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
