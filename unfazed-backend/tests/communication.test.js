const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { initSocket, getIO } = require("../src/services/socketService");
const { notificationService, NOTIFICATION_EVENTS } = require("../src/services/notificationService");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Booking = require("../src/models/Booking");
const Message = require("../src/models/Message");
const NotificationLog = require("../src/models/NotificationLog");

// Import client-side socket runner from frontend node_modules
const { io: ioClient } = require(
  path.resolve(__dirname, "../../unfazed-frontend/node_modules/socket.io-client")
);

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function runCommunicationTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 6 Communication (Chat + Notifications) Tests`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  let socketUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Communication Specialist A",
    email: `dr.comm.a.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. Communication Specialist B",
    email: `dr.comm.b.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  let clientA;
  let rawPortalTokenA;
  let clientB;
  let testBookingA;

  async function testCase(id, description, fn) {
    try {
      const res = await fn();
      results.push({ id, description, ...res });
      const statusIcon = res.pass ? "✓ PASS" : "✗ FAIL";
      console.log(`[${statusIcon}] Test ${id}: ${description}`);
      if (!res.pass) {
        console.log(`         Expected: ${res.expected} | Actual: ${res.actual}`);
      }
    } catch (err) {
      results.push({
        id,
        description,
        expected: "N/A",
        actual: "Error: " + err.message,
        pass: false,
      });
      console.log(`[✗ FAIL] Test ${id}: ${description} (Threw Error: ${err.message})`);
    }
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas.");

    // Clean up test collections for fresh run
    await Message.deleteMany({ content: new RegExp(`test_msg_${uniqueId}`) });
    await NotificationLog.deleteMany({ message: new RegExp(`comm_test_${uniqueId}`) });

    // Seed Therapists
    const dbTherapistA = await Therapist.create({
      name: therapistA.name,
      email: therapistA.email,
      password_hash: "hash",
      slug: `comm-a-${uniqueId}`,
    });
    therapistA.id = dbTherapistA._id.toString();
    therapistA.token = jwt.sign({ therapistId: therapistA.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const dbTherapistB = await Therapist.create({
      name: therapistB.name,
      email: therapistB.email,
      password_hash: "hash",
      slug: `comm-b-${uniqueId}`,
    });
    therapistB.id = dbTherapistB._id.toString();
    therapistB.token = jwt.sign({ therapistId: therapistB.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Seed Client A under Therapist A
    rawPortalTokenA = crypto.randomBytes(32).toString("hex");
    clientA = await Client.create({
      therapist_id: dbTherapistA._id,
      name: "Alice Communicator",
      email: `alice.${uniqueId}@example.com`,
      phone: "+919876543210",
      status: "active",
      portalTokenHash: hashToken(rawPortalTokenA),
      portalTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Seed Client B under Therapist B
    clientB = await Client.create({
      therapist_id: dbTherapistB._id,
      name: "Bob Practice B",
      email: `bob.${uniqueId}@example.com`,
      phone: "+919876543211",
      status: "active",
    });

    // Seed a confirmed booking for Client A (15-min aligned, duration 60)
    const upcomingStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    upcomingStart.setMinutes(0, 0, 0);
    const upcomingEnd = new Date(upcomingStart.getTime() + 60 * 60 * 1000);

    testBookingA = await Booking.create({
      therapistId: dbTherapistA._id,
      clientId: clientA._id,
      clientName: clientA.name,
      clientEmail: clientA.email,
      clientPhone: clientA.phone,
      duration: 60,
      startTime: upcomingStart,
      endTime: upcomingEnd,
      status: "confirmed",
      bookedBuckets: [`COMM_TEST_${uniqueId}`],
      paymentStatus: "paid",
    });

    // Spin up HTTP Server with Socket.IO
    server = http.createServer(app);
    initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    socketUrl = `http://localhost:${port}`;

    // ==========================================
    // SECTION 1: CHAT REST ENDPOINT TESTS
    // ==========================================

    await testCase("CHAT-01", "Therapist cannot fetch messages without authorization header", async () => {
      const res = await fetch(`${baseUrl}/api/chat/messages/${clientA._id}`);
      return {
        pass: res.status === 401,
        expected: 401,
        actual: res.status,
      };
    });

    await testCase("CHAT-02", "Therapist B cannot fetch messages for Therapist A's client (multi-tenant boundary)", async () => {
      const res = await fetch(`${baseUrl}/api/chat/messages/${clientA._id}`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      return {
        pass: res.status === 404,
        expected: 404,
        actual: res.status,
      };
    });

    await testCase("CHAT-03", "Therapist A successfully sends a chat message to Client A via REST", async () => {
      const res = await fetch(`${baseUrl}/api/chat/messages/${clientA._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          content: `test_msg_${uniqueId} Hello Alice, see you tomorrow!`,
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 201 && data.success === true && data.data.senderType === "therapist",
        expected: "201 Created with senderType: therapist",
        actual: `${res.status} (senderType: ${data.data?.senderType})`,
      };
    });

    await testCase("CHAT-04", "Client cannot fetch messages with invalid/tampered portal token", async () => {
      const res = await fetch(`${baseUrl}/api/chat/portal/invalidtoken123456789012345678901234567890/messages`);
      return {
        pass: res.status === 404,
        expected: 404,
        actual: res.status,
      };
    });

    await testCase("CHAT-05", "Client A retrieves chat history with Therapist A using valid portal token", async () => {
      const res = await fetch(`${baseUrl}/api/chat/portal/${rawPortalTokenA}/messages`);
      const data = await res.json();
      const hasMessage = data.data && data.data.some((m) => m.content.includes(`test_msg_${uniqueId}`));
      return {
        pass: res.status === 200 && data.success === true && hasMessage,
        expected: "200 OK with persisted message in chat history",
        actual: `${res.status} (count: ${data.count}, hasMessage: ${hasMessage})`,
      };
    });

    await testCase("CHAT-06", "Client A sends a reply to Therapist A via portal token", async () => {
      const res = await fetch(`${baseUrl}/api/chat/portal/${rawPortalTokenA}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `test_msg_${uniqueId} Thank you Dr. Comm, looking forward to it.`,
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 201 && data.success === true && data.data.senderType === "client",
        expected: "201 Created with senderType: client",
        actual: `${res.status} (senderType: ${data.data?.senderType})`,
      };
    });

    await testCase("CHAT-07", "Therapist A fetches conversation and sees both therapist and client messages persisted", async () => {
      const res = await fetch(`${baseUrl}/api/chat/messages/${clientA._id}`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      const count = data.data?.filter((m) => m.content.includes(`test_msg_${uniqueId}`)).length || 0;
      return {
        pass: res.status === 200 && count >= 2,
        expected: "200 with >= 2 persisted messages in history",
        actual: `${res.status} (matching messages: ${count})`,
      };
    });

    // ==========================================
    // SECTION 2: REAL-TIME SOCKET.IO TESTS
    // ==========================================

    await testCase("SOCKET-01", "Socket connection rejected when token is missing", async () => {
      const clientSocket = ioClient(socketUrl, {
        transports: ["websocket"],
        auth: {},
        reconnection: false,
      });

      const err = await new Promise((resolve) => {
        clientSocket.on("connect_error", (error) => {
          clientSocket.disconnect();
          resolve(error.message);
        });
        clientSocket.on("connect", () => {
          clientSocket.disconnect();
          resolve("connected_unexpectedly");
        });
      });

      return {
        pass: typeof err === "string" && err.includes("token required"),
        expected: "connect_error: token required",
        actual: err,
      };
    });

    await testCase("SOCKET-02", "Therapist connects successfully via JWT auth and joins client room", async () => {
      const therapistSocket = ioClient(socketUrl, {
        transports: ["websocket"],
        auth: {
          role: "therapist",
          token: therapistA.token,
        },
        reconnection: false,
      });

      const joinResult = await new Promise((resolve) => {
        therapistSocket.on("connect", () => {
          therapistSocket.emit("join_conversation", { clientId: clientA._id.toString() }, (ack) => {
            therapistSocket.disconnect();
            resolve(ack);
          });
        });
        therapistSocket.on("connect_error", (err) => {
          therapistSocket.disconnect();
          resolve({ success: false, error: err.message });
        });
      });

      return {
        pass: joinResult?.success === true,
        expected: "Ack with { success: true }",
        actual: JSON.stringify(joinResult),
      };
    });

    await testCase("SOCKET-03", "Therapist B cannot join chat room of Therapist A's client (Socket isolation)", async () => {
      const therapistBSocket = ioClient(socketUrl, {
        transports: ["websocket"],
        auth: {
          role: "therapist",
          token: therapistB.token,
        },
        reconnection: false,
      });

      const joinResult = await new Promise((resolve) => {
        therapistBSocket.on("connect", () => {
          therapistBSocket.emit("join_conversation", { clientId: clientA._id.toString() }, (ack) => {
            therapistBSocket.disconnect();
            resolve(ack);
          });
        });
        therapistBSocket.on("connect_error", (err) => {
          therapistBSocket.disconnect();
          resolve({ success: false, error: err.message });
        });
      });

      return {
        pass: joinResult?.success === false && joinResult?.error?.includes("Unauthorized"),
        expected: "Ack with { success: false, error: 'Unauthorized...' }",
        actual: JSON.stringify(joinResult),
      };
    });

    await testCase("SOCKET-04", "Client connects with portal token and receives real-time message broadcast", async () => {
      const clientSocket = ioClient(socketUrl, {
        transports: ["websocket"],
        auth: {
          role: "client",
          token: rawPortalTokenA,
        },
        reconnection: false,
      });

      const messageReceivedPromise = new Promise((resolve) => {
        clientSocket.on("connect", () => {
          // Client joins own conversation
          clientSocket.emit("join_conversation", {}, async () => {
            // Therapist sends message via REST which broadcasts to socket room
            await fetch(`${baseUrl}/api/chat/messages/${clientA._id}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${therapistA.token}`,
              },
              body: JSON.stringify({
                content: `test_msg_${uniqueId} Realtime broadcast check`,
              }),
            });
          });
        });

        clientSocket.on("new_message", (msg) => {
          clientSocket.disconnect();
          resolve(msg);
        });

        setTimeout(() => {
          clientSocket.disconnect();
          resolve(null);
        }, 3000);
      });

      const receivedMsg = await messageReceivedPromise;

      return {
        pass: receivedMsg !== null && receivedMsg.content.includes("Realtime broadcast check"),
        expected: "Real-time 'new_message' event received over WebSocket",
        actual: receivedMsg ? receivedMsg.content : "Timeout / No message received",
      };
    });

    // ==========================================
    // SECTION 3: NOTIFICATION SERVICE & SCHEDULER
    // ==========================================

    await testCase("NOTIF-01", "Booking Confirmed event dispatches and creates NotificationLog", async () => {
      notificationService.emit(NOTIFICATION_EVENTS.BOOKING_CONFIRMED, {
        booking: testBookingA,
        therapist: dbTherapistA,
        client: {
          name: clientA.name,
          email: clientA.email,
          phone: clientA.phone,
        },
      });

      // Wait 100ms for async EventEmitter handling
      await new Promise((r) => setTimeout(r, 150));

      const log = await NotificationLog.findOne({
        bookingId: testBookingA._id,
        type: "booking_confirmed",
        channel: "whatsapp",
      });

      return {
        pass: !!log && log.status === "sent" && log.recipientPhone === clientA.phone,
        expected: "NotificationLog record with status 'sent'",
        actual: log ? `Found log with status: ${log.status}, phone: ${log.recipientPhone}` : "Not found",
      };
    });

    await testCase("NOTIF-02", "Duplicate booking confirmed notification is prevented and does not duplicate in DB", async () => {
      // Re-emit event for exact same booking
      notificationService.emit(NOTIFICATION_EVENTS.BOOKING_CONFIRMED, {
        booking: testBookingA,
        therapist: dbTherapistA,
        client: {
          name: clientA.name,
          email: clientA.email,
          phone: clientA.phone,
        },
      });

      await new Promise((r) => setTimeout(r, 150));

      const count = await NotificationLog.countDocuments({
        bookingId: testBookingA._id,
        type: "booking_confirmed",
        channel: "whatsapp",
      });

      return {
        pass: count === 1,
        expected: "Exactly 1 NotificationLog record (no duplicates)",
        actual: `${count} records found`,
      };
    });

    await testCase("NOTIF-03", "24-hour reminder is dispatched idempotently by scheduler scanner", async () => {
      const scheduleResult = await notificationService.processScheduledNotifications();

      const reminderLog = await NotificationLog.findOne({
        bookingId: testBookingA._id,
        type: "reminder_24h",
      });

      return {
        pass: !!reminderLog && scheduleResult.remindersSent >= 1,
        expected: "Reminder created with remindersSent >= 1",
        actual: `remindersSent: ${scheduleResult.remindersSent}, log present: ${!!reminderLog}`,
      };
    });

    await testCase("NOTIF-04", "Running scheduler again does NOT duplicate 24-hour reminder", async () => {
      const secondRun = await notificationService.processScheduledNotifications();
      const count = await NotificationLog.countDocuments({
        bookingId: testBookingA._id,
        type: "reminder_24h",
      });

      return {
        pass: count === 1 && secondRun.remindersSent === 0,
        expected: "remindersSent: 0, total count: 1",
        actual: `remindersSent: ${secondRun.remindersSent}, total count: ${count}`,
      };
    });

    await testCase("NOTIF-05", "Post-session follow-up is dispatched for past completed appointment", async () => {
      // Create past booking 4 hours ago (aligned, duration 60)
      const pastStart = new Date(Date.now() - 4 * 60 * 60 * 1000);
      pastStart.setMinutes(0, 0, 0);
      const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000);

      const pastBooking = await Booking.create({
        therapistId: dbTherapistA._id,
        clientId: clientA._id,
        clientName: clientA.name,
        clientEmail: clientA.email,
        clientPhone: clientA.phone,
        duration: 60,
        startTime: pastStart,
        endTime: pastEnd,
        status: "completed",
        bookedBuckets: [`COMM_PAST_${uniqueId}`],
        paymentStatus: "paid",
      });

      const scheduleResult = await notificationService.processScheduledNotifications();
      const followupLog = await NotificationLog.findOne({
        bookingId: pastBooking._id,
        type: "post_session_followup",
      });

      return {
        pass: !!followupLog && scheduleResult.followupsSent >= 1,
        expected: "Followup created with followupsSent >= 1",
        actual: `followupsSent: ${scheduleResult.followupsSent}, log present: ${!!followupLog}`,
      };
    });

    // ==========================================
    // SECTION 4: NOTIFICATION REST API
    // ==========================================

    await testCase("NOTIF-06", "Therapist A fetches notification logs filtered to own practice", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      return {
        pass: res.status === 200 && data.success === true && data.count >= 2,
        expected: "200 OK with notifications list count >= 2",
        actual: `${res.status} (count: ${data.count})`,
      };
    });

    await testCase("NOTIF-07", "Therapist B notification query does not leak Therapist A's notification records", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      const data = await res.json();
      const leaked = data.data?.some((n) => n.therapistId === therapistA.id);
      return {
        pass: res.status === 200 && !leaked && data.count === 0,
        expected: "200 OK with 0 records for Therapist B",
        actual: `${res.status} (count: ${data.count}, leaked: ${leaked})`,
      };
    });

    await testCase("NOTIF-08", "Notification scheduler startScheduler() starts, scans on startup, and stops cleanly", async () => {
      notificationService.stopScheduler();
      await notificationService.startScheduler(60000);
      const isRunning = !!notificationService.schedulerInterval;
      notificationService.stopScheduler();
      return {
        pass: isRunning && !notificationService.schedulerInterval,
        expected: "Scheduler initialized recurring timer and stopped cleanly",
        actual: `isRunning: ${isRunning}, stopped: ${!notificationService.schedulerInterval}`,
      };
    });

  } catch (fatalErr) {
    console.error("Fatal test suite runner error:", fatalErr);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB Atlas.");
  }

  // Print Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n======================================================`);
  console.log(`Module 6 Communication Test Results:`);
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed} / ${results.length}`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCommunicationTestSuite();
