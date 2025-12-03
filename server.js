require("dotenv").config();
require("pg");
const express = require("express");
const path = require("path");
const clientSessions = require("client-sessions");

// Mongo + Postgres
const { connectDB } = require("./config/db");
const  sequelize  = require("./config/pg");

// Models
const User = require("./models/User");
const Task = require("./models/Task");

const app = express();
const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: true }).then(() => {
  console.log("✅ Tables synced with database");
});


// ------------------ MIDDLEWARE ------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Connect Databases
connectDB();
sequelize.sync();


// ------------------ SESSION ------------------
app.use(
  clientSessions({
    cookieName: "session",
    secret: process.env.SESSION_SECRET || "secretkey",
    duration: 30 * 60 * 1000,
    activeDuration: 5 * 60 * 1000,
  })
);



// Auth Helpers
// Only logged-in users can access
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Only logged-out users can access login/register
function requireLogout(req, res, next) {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  next();
}


// ------------------ ROUTES ------------------

// Home
app.get("/", (req, res) => {
  res.render("home");
});

// ------------------ REGISTER ------------------
app.get("/register", (req, res) => {
  res.render("register");
});



app.post("/register", requireLogout,async (req, res) => {
  const { username, email, password } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    return res.render("register", { message: "All fields required." });
  }

  try {
    // Check if username or email already taken
    const exists = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (exists) {
      return res.render("register", {
        message: "Username or email already exists."
      });
    }

    // Create new user
    const newuser = await User.create({ username, email, password });
    

    // Save session
    req.session.user = {
      id: newuser._id,
      username: newuser.username,
      email: newuser.email
    };

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("register", { message: "Something went wrong." });
  }
});

// ------------------ LOGIN ------------------
app.get("/login",  (req, res) => {
  res.render("login");
});

app.post("/login", requireLogout, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render("login", { message: "All fields are required.", username });
    }

    // 1. Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.render("login", { message: "Invalid username or password.", username });
    }

    // 2. Compare password
    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.render("login", { message: "Invalid username or password.", username });
    }

    // 3. Save session
    req.session.user = {
      id: user._id,
      username: user.username,
      email: user.email,
    };

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("login", { message: "Something went wrong. Try again.", username: req.body.username });
  }
});


app.get("/dashboard", requireLogin, async (req, res) => {
  try {
    const tasks = await Task.findAll({
      where: { userId: req.session.user.id },
      order: [["createdAt", "DESC"]],
    });

    const formattedTasks = tasks.map(task => ({
      ...task.toJSON(),
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
    }));

    res.render("dashboard", {
      user: req.session.user,   
      tasks: formattedTasks,    
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Server Error");
  }
});



// ------------------ ADD TASK ------------------
app.get("/tasks/add", requireLogin, (req, res) => {
  res.render("addTask", { user: req.session.user});
});

app.post("/tasks/add", requireLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  if (!title)
    return res.render("addTask", { user: req.session.user, message: "Title is required." });

  await Task.create({
    title,
    description,
    dueDate: dueDate || null,
    status: status || "pending",
    userId: req.session.user.id,
  });

  res.redirect("/dashboard");
});

// ------------------ EDIT TASK ------------------
app.get("/tasks/edit/:id", requireLogin, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id },
  });

  if (!task) return res.redirect("/dashboard");

  res.render("edit-task", { user: req.session.user, task, message: null });
});

app.post("/tasks/edit/:id", requireLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id },
  });

  if (!task) return res.redirect("/dashboard");

  await task.update({
    title,
    description,
    dueDate: dueDate || null,
    status,
  });

  res.redirect("/dashboard");
});

// ------------------ COMPLETE TASK ------------------
app.post("/tasks/complete/:id", requireLogin, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id },
  });

  if (!task) return res.redirect("/dashboard");

  await task.update({ status: "completed" });
  res.redirect("/dashboard");
});

// ------------------ DELETE TASK ------------------
app.post("/tasks/delete/:id", requireLogin, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id },
  });

  if (!task) return res.redirect("/dashboard");

  await task.destroy();
  res.redirect("/dashboard");
});


// ------------------ LOGOUT ------------------
app.get("/logout", (req, res) => {
  req.session.reset();
  res.redirect("/login");
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
