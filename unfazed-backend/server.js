require("dotenv").config();
const http = require("http");

const app = require("./src/app");
const connectDB = require("./src/config/db");
const { initSocket } = require("./src/services/socketService");
const { notificationService } = require("./src/services/notificationService");

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`Unfazed server running on port ${PORT}`);
      // Start background notification scheduler (survives server restarts)
      notificationService.startScheduler();
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
