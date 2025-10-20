// =====================
//  EliteHomePainters
//  app.js (Final)
// =====================

// ===== Env & Core =====
require("dotenv").config();
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
const nodemailer = require("nodemailer");
const { verifyTransport, sendNewQuoteAdmin } = require("./utils/mailer");
const cookieParser = require("cookie-parser");

// ===== Models =====
const Message = require("./models/Message");
const Customer = require("./models/Customer");
const Quote = require("./models/Quote");
const Admin = require("./models/Admin");
const Employee = require("./models/Employee");
const Gallery = require("./models/Gallery");

// ---- Pricing (NZD) ----
const PRICING = { sqm: 65, window: 250, door: 250, frame: 250, feature: 500 };

// ===== Ensure Uploads Dir =====
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ===== MongoDB Connection =====
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/elitehomepainters";
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  });

// ===== View Engine & Static =====
app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, "Views"), path.join(__dirname, "views")]);
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== Cookies & Session =====
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "elite_secret",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// ===== Multer Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

// ===== Global Session Locals =====
app.use((req, res, next) => {
  res.locals.customer = req.session.customer || null;
  res.locals.admin = req.session.admin || null;
  res.locals.emailTestMode = !(process.env.SMTP_USER && process.env.SMTP_PASS);
  next();
});

// ===== Chat unread badge =====
app.use(async (req, res, next) => {
  try {
    if (req.session?.admin) {
      res.locals.chatUnreadCount = await Message.countDocuments({
        toId: req.session.admin._id,
        read: false,
      });
    } else if (req.session?.customer) {
      res.locals.chatUnreadCount = await Message.countDocuments({
        toId: req.session.customer._id,
        read: false,
      });
    } else res.locals.chatUnreadCount = 0;
  } catch {
    res.locals.chatUnreadCount = 0;
  }
  next();
});

// ===== Helpers =====
const ensureAdmin = (req, res, next) => {
  if (!req.session.admin) return res.redirect("/internal-admin-access");
  next();
};

function getConversationId(customerId) {
  return `cust_${customerId}__admin`;
}

// ===== Admin ObjectId (set on login if not in ENV) =====
app.locals.ADMIN_OBJECT_ID = (() => {
  try {
    return process.env.ADMIN_OBJECT_ID
      ? new mongoose.Types.ObjectId(process.env.ADMIN_OBJECT_ID)
      : null;
  } catch {
    return null;
  }
})();

// ==========================
// ===== Public Routes =====
// ==========================
app.get("/", (req, res) => res.render("index"));
app.get("/about", (req, res) => res.render("about"));
app.get("/services", (req, res) => res.render("services"));
app.get("/testimonials", (req, res) => res.render("testimonials"));
app.get("/faq", (req, res) => res.render("faq"));
app.get("/contact", (req, res) => res.render("contact"));

app.get("/gallery", async (req, res) => {
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 }).lean();
    res.render("gallery", { images });
  } catch {
    res.status(500).send("Failed to load gallery.");
  }
});

// ================================
// ===== Admin Authentication =====
// ================================
app.get("/internal-admin-register", (req, res) => res.render("admin-register"));
app.post("/internal-admin-register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    await Admin.create({ name, email, password });
    res.redirect("/internal-admin-access");
  } catch {
    res.status(500).send("Failed to register admin.");
  }
});

app.get("/internal-admin-access", (req, res) => res.render("admin-login"));
app.post("/internal-admin-access", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email, password });
    if (admin) {
      req.session.admin = admin;
      if (!app.locals.ADMIN_OBJECT_ID) app.locals.ADMIN_OBJECT_ID = admin._id;
      res.redirect("/admin/dashboard");
    } else res.send("❌ Invalid admin credentials.");
  } catch {
    res.status(500).send("Login error.");
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.admin = null;
  res.redirect("/internal-admin-access");
});

// ===========================
// ===== Admin Dashboard =====
// ===========================
app.get("/admin/dashboard", ensureAdmin, async (req, res) => {
  try {
    const [customerCount, quoteCount, activeEmployees] = await Promise.all([
      Customer.countDocuments(),
      Quote.countDocuments(),
      Employee.countDocuments({ status: "Active" }),
    ]);
    res.render("admin-dashboard", { customerCount, quoteCount, activeEmployees });
  } catch {
    res.status(500).send("Failed to load admin dashboard.");
  }
});

// ===== Employee Management =====
app.get("/admin/add-employee", ensureAdmin, (req, res) =>
  res.render("add-employee")
);
app.post(
  "/admin/add-employee",
  ensureAdmin,
  upload.single("photo"),
  async (req, res) => {
    try {
      const { name, role, salary, contact, doj } = req.body;
      const photo = req.file?.filename;
      await Employee.create({
        name,
        role,
        salary,
        contact,
        doj,
        photo,
        status: "Active",
      });
      res.redirect("/admin/employees");
    } catch {
      res.status(500).send("Failed to add employee.");
    }
  }
);

app.get("/admin/employees", ensureAdmin, async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { role: { $regex: search, $options: "i" } },
          ],
        }
      : {};
    const employees = await Employee.find(query).lean();
    res.render("view-employees", { employees, search });
  } catch {
    res.status(500).send("Failed to load employees.");
  }
});

app.get("/admin/edit-employee/:id", ensureAdmin, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).lean();
    res.render("edit-employee", { employee });
  } catch {
    res.status(500).send("Failed to load employee.");
  }
});

app.post(
  "/admin/edit-employee/:id",
  ensureAdmin,
  upload.single("photo"),
  async (req, res) => {
    try {
      const updates = { ...req.body };
      if (req.file) updates.photo = req.file.filename;
      await Employee.findByIdAndUpdate(req.params.id, updates);
      res.redirect("/admin/employees");
    } catch {
      res.status(500).send("Failed to update employee.");
    }
  }
);

app.post("/admin/delete-employee/:id", ensureAdmin, async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    res.redirect("/admin/employees");
  } catch {
    res.status(500).send("Failed to delete employee.");
  }
});
app.post("/admin/activate/:id", ensureAdmin, async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(req.params.id, { status: "Active" });
    res.redirect("/admin/employees");
  } catch {
    res.status(500).send("Failed to activate employee.");
  }
});
app.post("/admin/deactivate/:id", ensureAdmin, async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(req.params.id, { status: "Inactive" });
    res.redirect("/admin/employees");
  } catch {
    res.status(500).send("Failed to deactivate employee.");
  }
});

// ==============================
// ===== Quote Requests =====
// ==============================
app.get("/quote", (req, res) => res.render("quote"));
app.post("/quote", async (req, res) => {
  try {
    const {
      name = "",
      email = "",
      phone = "",
      address = "",
      paintType = "",
      area = 0,
    } = req.body;
    const message = (
      req.body.message ?? req.body.tellUsMore ?? ""
    ).toString().trim();

    const windows = Math.max(0, parseInt(req.body.windows) || 0);
    const doors = Math.max(0, parseInt(req.body.doors) || 0);
    const frames = Math.max(0, parseInt(req.body.frames) || 0);
    const features = Math.max(0, parseInt(req.body.features) || 0);
    const sqm = Math.max(0, parseFloat(area) || 0);

    const total =
      sqm * PRICING.sqm +
      windows * PRICING.window +
      doors * PRICING.door +
      frames * PRICING.frame +
      features * PRICING.feature;
    const estimatedPrice = Number(total.toFixed(2));

    const newQuote = await Quote.create({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      paintType: paintType.trim(),
      area: sqm,
      windows,
      doors,
      frames,
      features,
      message,
      estimatedPrice,
      createdAt: new Date(),
    });

    sendNewQuoteAdmin(newQuote, { total: estimatedPrice }).catch(() => {});
    io.emit("newQuote");

    res.render("quote-confirmation", { quote: newQuote, breakdown: {} });
  } catch {
    res.status(500).send("Error submitting quote request.");
  }
});

app.get("/admin/quote-requests", ensureAdmin, async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 }).lean();
    const emails = [...new Set(quotes.map((q) => q.email).filter(Boolean))];
    let customerByEmail = {};
    if (emails.length) {
      const customers = await Customer.find(
        { email: { $in: emails } },
        { _id: 1, email: 1 }
      ).lean();
      customerByEmail = Object.fromEntries(
        customers.map((c) => [c.email, String(c._id)])
      );
    }
    res.render("admin-quote-requests", { quotes, customerByEmail });
  } catch {
    res.status(500).send("Failed to load quotes.");
  }
});
app.post("/admin/delete-quote/:id", ensureAdmin, async (req, res) => {
  try {
    await Quote.findByIdAndDelete(req.params.id);
    res.redirect("/admin/quote-requests");
  } catch {
    res.status(500).send("Failed to delete quote.");
  }
});

// =============================
// ===== Gallery Management =====
app.get("/admin/gallery", ensureAdmin, async (req, res) => {
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 }).lean();
    res.render("admin-gallery", { images });
  } catch {
    res.status(500).send("Failed to load gallery.");
  }
});
app.post(
  "/admin/gallery/upload",
  ensureAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.send("❌ No file uploaded.");
      await Gallery.create({
        caption: req.body.caption,
        image: req.file.filename,
        uploadedAt: new Date(),
      });
      res.redirect("/admin/gallery");
    } catch {
      res.status(500).send("Failed to upload image.");
    }
  }
);
app.post("/admin/gallery/delete/:id", ensureAdmin, async (req, res) => {
  try {
    const image = await Gallery.findByIdAndDelete(req.params.id);
    if (image?.image) {
      const filePath = path.join(uploadsDir, image.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.redirect("/admin/gallery");
  } catch {
    res.status(500).send("Failed to delete image.");
  }
});

// =============================
// ===== Customer Auth =====
// =============================
app.get("/customer/register", (req, res) => res.render("customer-register"));
app.post("/customer/register", async (req, res) => {
  try {
    await Customer.create(req.body);
    res.redirect("/customer/login");
  } catch {
    res.status(500).send("Registration failed.");
  }
});
app.get("/customer/login", (req, res) => res.render("customer-login"));
app.post("/customer/login", async (req, res) => {
  try {
    const customer = await Customer.findOne(req.body);
    if (customer) {
      req.session.customer = customer;
      res.redirect("/customer/dashboard");
    } else res.send("❌ Invalid credentials");
  } catch {
    res.status(500).send("Login failed.");
  }
});
app.get("/customer/dashboard", (req, res) => {
  if (!req.session.customer) return res.redirect("/customer/login");
  res.render("customer-dashboard");
});

// ===============================
// ===== Shared Auth Routes =====
// ===============================
app.get("/login", (req, res) => res.render("customer-login"));
app.get("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.redirect("/");
});

// ==============================
// ===== Real-time Chat =====
// ==============================
app.get("/chat/history/:customerId", async (req, res) => {
  try {
    const conversationId = getConversationId(req.params.customerId);
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ ok: true, messages });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/chat/read/:customerId", async (req, res) => {
  try {
    const conversationId = getConversationId(req.params.customerId);
    const viewerId = req.session.admin?._id || req.session.customer?._id;
    if (!viewerId) return res.status(401).json({ ok: false });
    await Message.updateMany(
      { conversationId, toId: viewerId, read: false },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// HTTP send (also emits global notify)
app.post("/chat/send", async (req, res) => {
  try {
    const { customerId, body } = req.body;
    if (!body) return res.status(400).json({ ok: false });
    const isAdmin = !!req.session.admin;
    const fromId = req.session.admin?._id || req.session.customer?._id;
    const toId = isAdmin
      ? new mongoose.Types.ObjectId(customerId) // admin -> customer
      : app.locals.ADMIN_OBJECT_ID;             // customer -> admin
    if (!toId) return res.status(400).json({ ok: false });

    const conversationId = getConversationId(customerId);
    const msg = await Message.create({
      conversationId,
      fromRole: isAdmin ? "admin" : "customer",
      fromId,
      toId,
      body,
    });

    io.to(conversationId).emit("chat:message", { message: msg });
    io.to(`user_${String(toId)}`).emit("chat:notify", { message: msg });

    res.json({ ok: true, message: msg });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Chat UIs
app.get("/chat", (req, res) => {
  if (!req.session.customer) return res.redirect("/customer/login");
  res.render("customer-chat", { customer: req.session.customer });
});
app.get("/admin/chat/:customerId", ensureAdmin, async (req, res) => {
  const admin = await Admin.findById(req.session.admin._id).lean();
  const customer = await Customer.findById(req.params.customerId).lean();
  res.render("admin-chat", { admin, customer });
});
app.get("/admin/chat", ensureAdmin, async (req, res) => {
  const customers = await Customer.find({}, { _id: 1, name: 1, email: 1 })
    .sort({ createdAt: -1 })
    .lean();
  res.render("admin-chat-list", { customers });
});

// ===== Socket.io =====
io.use((socket, next) => {
  const { userId, role, customerIdForRoom } = socket.handshake.query || {};
  if (!userId || !role) return next(new Error("Unauthorized"));
  socket.user = {
    id: String(userId),
    role: String(role),
    customerIdForRoom: customerIdForRoom ? String(customerIdForRoom) : "",
  };
  next();
});

io.on("connection", (socket) => {
  try {
    // Personal room for global notifications on any page
    socket.join(`user_${socket.user.id}`);

    // Conversation room
    const roomCustomerId =
      socket.user.role === "customer"
        ? socket.user.id
        : socket.user.customerIdForRoom || "";
    if (roomCustomerId) socket.join(getConversationId(roomCustomerId));

    // Realtime send from chat pages
    socket.on("chat:send", async ({ customerId, body }) => {
      if (!body || !customerId) return;

      const conversationId = getConversationId(customerId);
      const fromRole = socket.user.role;
      const fromId = new mongoose.Types.ObjectId(socket.user.id);
      const toId =
        fromRole === "admin"
          ? new mongoose.Types.ObjectId(customerId) // to customer
          : new mongoose.Types.ObjectId(app.locals.ADMIN_OBJECT_ID); // to admin
      if (!toId) return;

      const msg = await Message.create({
        conversationId,
        fromRole,
        fromId,
        toId,
        body,
      });

      io.to(conversationId).emit("chat:message", { message: msg });
      io.to(`user_${String(toId)}`).emit("chat:notify", { message: msg });
    });

    // Typing indicator
    socket.on("chat:typing", ({ customerId, isTyping }) => {
      if (!customerId) return;
      io.to(getConversationId(customerId)).emit("chat:typing", {
        fromRole: socket.user.role,
        isTyping: !!isTyping,
      });
    });
  } catch (e) {
    console.error("Socket error:", e);
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
http.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
