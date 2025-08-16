// ===== Imports =====
const express = require('express');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { Parser } = require('json2csv');

const Customer = require('./models/Customer');
const QuoteRequest = require('./models/QuoteRequest');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const Gallery = require('./models/Gallery');

const app = express();

// ===== MongoDB Connect =====
mongoose.connect('mongodb://127.0.0.1:27017/elitehomepainters', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ===== Middleware =====
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'elite_secret',
  resave: false,
  saveUninitialized: true
}));

// ===== Multer Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ===== Global View Data =====
app.use((req, res, next) => {
  res.locals.customer = req.session.customer || null;
  res.locals.admin = req.session.admin || null;
  next();
});

// ===== Static Pages =====
app.get('/', (req, res) => res.render('index'));
app.get('/about', (req, res) => res.render('about'));
app.get('/services', (req, res) => res.render('services'));
app.get('/testimonials', (req, res) => res.render('testimonials'));
app.get('/faq', (req, res) => res.render('faq'));
app.get('/contact', (req, res) => res.render('contact'));

// ===== Public Gallery =====
app.get('/gallery', async (req, res) => {
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 });
    res.render('gallery', { images });
  } catch (err) {
    console.error('Error loading gallery:', err);
    res.render('gallery', { images: [] });
  }
});

// ===== Admin Auth =====
app.get('/internal-admin-register', (req, res) => res.render('admin-register'));
app.post('/internal-admin-register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    await Admin.create({ name, email, password });
    res.send('✅ Admin registered. <a href="/internal-admin-access">Login</a>');
  } catch {
    res.send('❌ Admin registration failed.');
  }
});

app.get('/internal-admin-access', (req, res) => res.render('admin-login'));
app.post('/internal-admin-access', async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email, password });
  if (admin) {
    req.session.admin = admin;
    res.redirect('/admin/dashboard');
  } else {
    res.send('❌ Invalid admin credentials.');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/internal-admin-access');
});

// ===== Admin Dashboard =====
app.get('/admin/dashboard', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const customerCount = await Customer.countDocuments();
  const quoteCount = await QuoteRequest.countDocuments();
  const activeEmployees = await Employee.countDocuments({ status: 'Active' });
  res.render('admin-dashboard', { customerCount, quoteCount, activeEmployees });
});

// ===== Employee Management =====
app.get('/admin/add-employee', (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  res.render('add-employee');
});

app.post('/admin/add-employee', upload.single('photo'), async (req, res) => {
  const { name, role, salary, contact, doj } = req.body;
  const photo = req.file ? req.file.filename : null;
  const count = await Employee.countDocuments();
  const empId = `EMP-${(count + 1).toString().padStart(4, '0')}`;
  const employee = new Employee({
    id: empId,
    number: Math.floor(100000 + Math.random() * 900000),
    name, role, salary, contact, doj: new Date(doj), photo, status: 'Active'
  });
  await employee.save();
  res.send(`<p>✅ Employee <strong>${name}</strong> added with ID: ${empId}</p><a href="/admin/dashboard">Back to Dashboard</a>`);
});

app.get('/admin/employees', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const { search } = req.query;
  let filter = {};
  if (search) {
    filter = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { role: { $regex: search, $options: 'i' } }
      ]
    };
  }
  const employees = await Employee.find(filter);
  res.render('view-employees', { employees, search });
});

app.get('/admin/edit-employee/:id', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const employee = await Employee.findOne({ id: req.params.id });
  if (!employee) return res.send('❌ Employee not found.');
  res.render('edit-employee', { employee });
});

app.post('/admin/edit-employee/:id', upload.single('photo'), async (req, res) => {
  const { name, role, salary, contact, doj } = req.body;
  const updates = { name, role, salary, contact, doj: new Date(doj) };
  if (req.file) updates.photo = req.file.filename;
  await Employee.findOneAndUpdate({ id: req.params.id }, updates);
  res.redirect('/admin/employees');
});

app.post('/admin/deactivate/:id', async (req, res) => {
  await Employee.findOneAndUpdate({ id: req.params.id }, { status: 'Inactive' });
  res.redirect('/admin/employees');
});

app.post('/admin/activate/:id', async (req, res) => {
  await Employee.findOneAndUpdate({ id: req.params.id }, { status: 'Active' });
  res.redirect('/admin/employees');
});

app.get('/admin/export-employees', async (req, res) => {
  const employees = await Employee.find();
  const fields = ['id', 'name', 'role', 'contact', 'salary', 'status'];
  const parser = new Parser({ fields });
  const csv = parser.parse(employees);
  res.setHeader('Content-disposition', 'attachment; filename=employees.csv');
  res.set('Content-Type', 'text/csv');
  res.status(200).send(csv);
});

// ===== Stylish Payslip PDF =====
app.get('/admin/generate-payslip', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const employees = await Employee.find({ status: 'Active' });
  res.render('generate-payslip', { employees });
});

app.post('/admin/generate-payslip', async (req, res) => {
  const { empId, month } = req.body;
  const emp = await Employee.findOne({ id: empId });
  if (!emp) return res.send('❌ Employee not found.');

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${emp.name}_Payslip_${month}.pdf`);
  doc.pipe(res);

  const logoPath = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(logoPath)) doc.image(logoPath, { fit: [100, 100], align: 'left' });
  doc.fontSize(22).text('EliteHomePainters - Monthly Payslip', { align: 'center', underline: true });
  doc.moveDown();

  doc.fontSize(12).text(`Employee Name:`, 50, 160).text(emp.name, 180, 160);
  doc.text(`Employee ID:`, 50, 180).text(emp.id, 180, 180);
  doc.text(`Role:`, 50, 200).text(emp.role, 180, 200);
  doc.text(`Contact:`, 50, 220).text(emp.contact, 180, 220);
  doc.text(`Month:`, 50, 240).text(month, 180, 240);
  doc.text(`Salary:`, 50, 260).text(`$${emp.salary}`, 180, 260);
  doc.text(`Status:`, 50, 280).text(emp.status, 180, 280);
  doc.text(`Date Generated:`, 50, 300).text(new Date().toLocaleDateString(), 180, 300);

  doc.moveDown(2);
  doc.fontSize(10).fillColor('gray').text('No signature required – system generated.', { align: 'center' });

  doc.end();
});

// ===== Admin Quote Requests =====
app.get('/admin/quote-requests', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const quoteRequests = await QuoteRequest.find({});
  res.render('admin-quote-requests', { quoteRequests });
});

// ===== Admin Gallery Management =====
app.get('/admin/gallery', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 });
    res.render('admin-gallery', { images });
  } catch (err) {
    console.error('Gallery loading error:', err);
    res.render('admin-gallery', { images: [] });
  }
});

app.post('/admin/gallery/upload', upload.single('image'), async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const caption = req.body.caption || '';
  const image = req.file ? req.file.filename : null;

  if (!image) return res.send('❌ No file uploaded.');

  try {
    await Gallery.create({ image, caption });
    res.redirect('/admin/gallery');
  } catch (err) {
    console.error('❌ Upload Error:', err);
    res.send('❌ Failed to upload image.');
  }
});

app.post('/admin/gallery/delete/:id', async (req, res) => {
  if (!req.session.admin) return res.redirect('/internal-admin-access');
  const image = await Gallery.findById(req.params.id);
  if (image) {
    const filePath = path.join(__dirname, 'uploads', image.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await Gallery.findByIdAndDelete(req.params.id);
  }
  res.redirect('/admin/gallery');
});

// ===== Customer Auth =====
app.get('/login', (req, res) => res.render('login'));
app.post('/customer/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await Customer.findOne({ email, password });
  if (user) {
    req.session.customer = user;
    res.redirect('/customer/dashboard');
  } else {
    res.send('❌ Login failed. Try again.');
  }
});

app.get('/customer/logout', (req, res) => {
  req.session.customer = null;
  res.redirect('/login');
});

app.get('/customer/register', (req, res) => res.render('customer-register'));
app.post('/customer/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    await Customer.create({ name, email, password });
    res.send('✅ Registration complete. <a href="/login">Login</a>');
  } catch {
    res.send('❌ Registration failed.');
  }
});

// ===== Customer Dashboard =====
app.get('/customer/dashboard', (req, res) => {
  if (!req.session.customer) return res.redirect('/login');
  res.render('customer-dashboard', { customer: req.session.customer });
});

app.get('/customer/request-quote', (req, res) => {
  if (!req.session.customer) return res.redirect('/login');
  res.render('quote-request', { customer: req.session.customer });
});

app.post('/customer/request-quote', upload.single('image'), async (req, res) => {
  if (!req.session.customer) return res.send('❌ Unauthorized');
  const { service, preferredDate } = req.body;
  const image = req.file ? req.file.filename : null;
  const quote = new QuoteRequest({
    customer: req.session.customer.name,
    email: req.session.customer.email,
    service,
    preferredDate,
    image,
    submittedOn: new Date().toLocaleDateString()
  });
  try {
    await quote.save();
    res.send(`<p>✅ Quote request submitted successfully!</p><a href="/customer/dashboard">Back to Dashboard</a>`);
  } catch {
    res.send('❌ Failed to save quote.');
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
