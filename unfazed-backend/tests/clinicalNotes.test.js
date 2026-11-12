const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Booking = require("../src/models/Booking");
const Note = require("../src/models/Note");

async function runClinicalNotesTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 5 Clinical Documentation Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Lead Clinical Psychologist",
    email: `dr.clinical.a.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. Rival Practice Practitioner",
    email: `dr.clinical.b.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  let clientA;
  let rawTokenA;
  let bookingA;
  let privateNoteA;
  let sharedNoteA;

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

    await Promise.all([
      Therapist.syncIndexes(),
      Client.syncIndexes(),
      Booking.syncIndexes(),
      Note.syncIndexes(),
    ]);

    // Start ephemeral server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}/api`;
        console.log(`Ephemeral test server running at ${baseUrl}`);
        resolve();
      });
    });

    // Register & Login Therapist A
    const regA = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistA.name,
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const regAData = await regA.json();
    therapistA.id = regAData.data?.id;

    const loginA = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const loginAData = await loginA.json();
    therapistA.token = loginAData.token;

    // Register & Login Therapist B
    const regB = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistB.name,
        email: therapistB.email,
        password: therapistB.password,
      }),
    });
    const regBData = await regB.json();
    therapistB.id = regBData.data?.id;

    const loginB = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: therapistB.email,
        password: therapistB.password,
      }),
    });
    const loginBData = await loginB.json();
    therapistB.token = loginBData.token;

    // Create Client A under Therapist A
    rawTokenA = crypto.randomBytes(32).toString("hex");
    const tokenHashA = crypto.createHash("sha256").update(rawTokenA).digest("hex");

    clientA = await Client.create({
      therapist_id: therapistA.id,
      name: "Marcus Aurelius",
      email: `marcus.${uniqueId}@example.com`,
      phone: "+919876543210",
      status: "active",
      intakeStatus: "completed",
      intakeTokenHash: tokenHashA,
      intakeTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      intakeSubmittedAt: new Date(),
    });

    // Create a Booking for Client A under Therapist A
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    startTime.setUTCMinutes(0, 0, 0);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    bookingA = await Booking.create({
      therapistId: therapistA.id,
      clientId: clientA._id,
      clientName: clientA.name,
      clientEmail: clientA.email,
      clientPhone: clientA.phone,
      duration: 60,
      startTime,
      endTime,
      status: "confirmed",
      bookedBuckets: ["B1", "B2", "B3", "B4"],
    });

    // ==========================================================
    // 1. Authentication & Parameter Validation Checks
    // ==========================================================
    await testCase("AUTH-01", "Reject note creation without therapist JWT token (401)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          content: "Confidential clinical thought",
        }),
      });
      return { pass: res.status === 401, expected: 401, actual: res.status };
    });

    await testCase("AUTH-02", "Reject note listing without therapist JWT token (401)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "GET",
      });
      return { pass: res.status === 401, expected: 401, actual: res.status };
    });

    await testCase("VAL-01", "Reject note creation with missing content (400)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          content: "   ",
        }),
      });
      return { pass: res.status === 400, expected: 400, actual: res.status };
    });

    await testCase("VAL-02", "Reject note creation with invalid note type (400)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          type: "classified",
          content: "Valid content",
        }),
      });
      return { pass: res.status === 400, expected: 400, actual: res.status };
    });

    // ==========================================================
    // 2. Clinical Notes CRUD & Tenancy Scoping
    // ==========================================================
    await testCase("NOTE-01", "Therapist A creates a 'private' clinical session note (201)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          bookingId: bookingA._id.toString(),
          type: "private",
          title: "Session 1 - Diagnostic Impressions",
          content: "Client presents with mild stoic detachment. Therapist impressions are private.",
        }),
      });
      const data = await res.json();
      privateNoteA = data.data;
      const pass =
        res.status === 201 &&
        data.success === true &&
        data.data.type === "private" &&
        data.data.therapistId === therapistA.id;
      return { pass, expected: "201 Created with private type", actual: `${res.status} type: ${data.data?.type}` };
    });

    await testCase("NOTE-02", "Therapist A creates a 'shared' clinical session note (201)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          bookingId: bookingA._id.toString(),
          type: "shared",
          title: "Session 1 - Agreed Action Items & Prompts",
          content: "Practice mindfulness breathing daily for 10 minutes. Review cognitive reframing worksheet.",
        }),
      });
      const data = await res.json();
      sharedNoteA = data.data;
      const pass =
        res.status === 201 &&
        data.success === true &&
        data.data.type === "shared" &&
        data.data.sharedAt !== null;
      return { pass, expected: "201 Created with shared type", actual: `${res.status} type: ${data.data?.type}` };
    });

    await testCase("NOTE-03", "Therapist A retrieves both private and shared notes for client (200)", async () => {
      const res = await fetch(`${baseUrl}/notes?clientId=${clientA._id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      const pass = res.status === 200 && data.count >= 2 && Array.isArray(data.data);
      return { pass, expected: "200 with >=2 notes", actual: `${res.status} count: ${data.count}` };
    });

    await testCase("NOTE-04", "Therapist A updates note content (200)", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          title: "Session 1 - Diagnostic Impressions (Updated)",
          content: "Updated clinical impressions with symptom timeline details.",
        }),
      });
      const data = await res.json();
      const pass =
        res.status === 200 &&
        data.data.title.includes("(Updated)") &&
        data.data.content.includes("timeline");
      return { pass, expected: "200 with updated content", actual: `${res.status} title: ${data.data?.title}` };
    });

    // ==========================================================
    // 3. Multi-Therapist Isolation & IDOR Protection
    // ==========================================================
    await testCase("ISO-01", "Therapist B cannot create a note for Therapist A's client (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          type: "private",
          content: "Intruder attempt to attach note to another therapist's client",
        }),
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("ISO-02", "Therapist B cannot query notes for Therapist A's client (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/notes?clientId=${clientA._id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("ISO-03", "Therapist B cannot view Therapist A's note by ID (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("ISO-04", "Therapist B cannot update Therapist A's note by ID (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          content: "Malicious update from unauthorized therapist",
        }),
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("ISO-05", "Therapist B cannot delete Therapist A's note by ID (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    // ==========================================================
    // 4. Privacy & API Security Enforcement (Highest Priority)
    // ==========================================================
    await testCase("CL-PRIV-01", "Client-facing endpoint NEVER returns private notes (returns only shared)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawTokenA}`, {
        method: "GET",
      });
      const data = await res.json();
      const hasPrivateNote = data.data.some((n) => n.type === "private" || n._id === privateNoteA._id);
      const hasSharedNote = data.data.some((n) => n._id === sharedNoteA._id && n.type === "shared");

      const pass = res.status === 200 && !hasPrivateNote && hasSharedNote && data.data.length === 1;
      return {
        pass,
        expected: "200 with exactly 1 shared note and 0 private notes",
        actual: `${res.status} totalNotes: ${data.data?.length}, hasPrivate: ${hasPrivateNote}`,
      };
    });

    await testCase("CL-PRIV-02", "Client cannot request private notes by passing query parameter (403)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawTokenA}?type=private`, {
        method: "GET",
      });
      return { pass: res.status === 403, expected: 403, actual: res.status };
    });

    await testCase("CL-PRIV-03", "Direct call to GET /api/notes/:id without auth rejects with 401", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "GET",
      });
      return { pass: res.status === 401, expected: 401, actual: res.status };
    });

    await testCase("CL-PRIV-04", "Client endpoint denies retrieval of private note by noteId (404)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawTokenA}/${privateNoteA._id}`, {
        method: "GET",
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("CL-SHR-01", "Client successfully retrieves shared note by ID via client endpoint (200)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawTokenA}/${sharedNoteA._id}`, {
        method: "GET",
      });
      const data = await res.json();
      const pass =
        res.status === 200 &&
        data.data._id === sharedNoteA._id &&
        data.data.type === "shared";
      return { pass, expected: "200 with shared note details", actual: `${res.status} note: ${data.data?._id}` };
    });

    await testCase("CL-SHR-02", "Invalid or malformed client token is rejected (400 / 404)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/invalid_token_12345678901234567890123456789012`, {
        method: "GET",
      });
      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    // ==========================================================
    // 5. Note Deletion Cleanup
    // ==========================================================
    await testCase("NOTE-05", "Therapist A successfully deletes clinical note (200)", async () => {
      const res = await fetch(`${baseUrl}/notes/${privateNoteA._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      const pass = res.status === 200 && data.success === true;
      return { pass, expected: "200 Deleted", actual: res.status };
    });
  } finally {
    // Cleanup created test records
    try {
      await Note.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
      await Booking.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
      await Client.deleteMany({ therapist_id: { $in: [therapistA.id, therapistB.id] } });
      await Therapist.deleteMany({ _id: { $in: [therapistA.id, therapistB.id] } });
    } catch (_) {}

    if (server) {
      await new Promise((r) => server.close(r));
    }
    await mongoose.disconnect();
  }

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log(`\n======================================================`);
  console.log(`Clinical Notes Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runClinicalNotesTestSuite().catch((err) => {
  console.error("Clinical Notes Test execution failed:", err);
  process.exit(1);
});
