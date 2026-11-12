const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Note = require("../src/models/Note");

async function runPortalLifecycleTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 5 Client Portal Lifecycle Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Portal Lifecycle Practitioner",
    email: `dr.portal.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  let clientA;
  let rawIntakeToken;
  let rawPortalToken;
  let privateNote;
  let sharedNote;

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

    // Register & Login Therapist
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistA.name,
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const regData = await regRes.json();
    therapistA.id = regData.data?.id;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const loginData = await loginRes.json();
    therapistA.token = loginData.token;

    // 1. Therapist creates client
    clientA = await Client.create({
      therapist_id: therapistA.id,
      name: "Marcus Aurelius Portal",
      email: `marcus.portal.${uniqueId}@example.com`,
      phone: "+919876543210",
      status: "lead",
    });

    // 2. Therapist initiates intake
    await testCase("PRT-01", "Therapist initiates intake -> issues single-use intakeToken", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake/initiate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      rawIntakeToken = data.data?.rawToken;
      const pass = res.status === 200 && Boolean(rawIntakeToken);
      return { pass, expected: "200 with rawToken", actual: `${res.status} token=${Boolean(rawIntakeToken)}` };
    });

    // 3. Client views intake form before submission
    await testCase("PRT-02", "Client accesses intake questionnaire via raw intake token (200)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawIntakeToken}`);
      const data = await res.json();
      const pass = res.status === 200 && data.data?.client?.name === "Marcus Aurelius Portal";
      return { pass, expected: "200 with client name", actual: `${res.status} name=${data.data?.client?.name}` };
    });

    // 4. Therapist writes 1 private note and 1 shared note for this client
    await testCase("PRT-03", "Therapist creates 1 private note and 1 shared note", async () => {
      const privRes = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          type: "private",
          title: "Internal Diagnostic Assessment",
          content: "Confidential clinical formulation. Must never be shared with client.",
        }),
      });
      const privData = await privRes.json();
      privateNote = privData.data;

      const shrRes = await fetch(`${baseUrl}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientA._id.toString(),
          type: "shared",
          title: "Session 1 Agreed Action Plan",
          content: "Daily morning breathing exercise (5 mins) and cognitive journaling.",
        }),
      });
      const shrData = await shrRes.json();
      sharedNote = shrData.data;

      const pass = privRes.status === 201 && shrRes.status === 201;
      return { pass, expected: "201 for both", actual: `priv=${privRes.status}, shr=${shrRes.status}` };
    });

    // 5. Client submits intake form
    await testCase("PRT-04", "Client submits intake -> issues independent portalToken and clears intakeToken", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawIntakeToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentingConcern: "Stress management",
          consentAgreed: true,
          signatureName: "Marcus Aurelius Portal",
        }),
      });
      const data = await res.json();
      rawPortalToken = data.data?.portalToken;

      const dbClient = await Client.findById(clientA._id);
      const intakeCleared = dbClient.intakeTokenHash === null;
      const portalTokenSaved = dbClient.portalTokenHash !== null;
      const statusCompleted = dbClient.intakeStatus === "completed";

      const pass =
        res.status === 200 &&
        Boolean(rawPortalToken) &&
        intakeCleared &&
        portalTokenSaved &&
        statusCompleted;

      return {
        pass,
        expected: "200 with portalToken, intakeTokenHash=null, portalTokenHash set, intakeStatus=completed",
        actual: `status=${res.status}, portalToken=${Boolean(rawPortalToken)}, intakeCleared=${intakeCleared}, portalSaved=${portalTokenSaved}`,
      };
    });

    // 6. Intake token cannot be reused (Single-use protection verified)
    await testCase("PRT-05", "Intake token is single-use: re-submitting with intakeToken is rejected (404/400)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawIntakeToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentAgreed: true,
          signatureName: "Marcus Aurelius Portal",
        }),
      });
      const pass = res.status === 404 || res.status === 400;
      return { pass, expected: "404 or 400", actual: res.status };
    });

    // 7. Client opens portal using portalToken
    await testCase("PRT-06", "Client accesses Client Portal via portalToken (200 with ONLY shared note)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawPortalToken}`);
      const data = await res.json();

      const hasShared = data.data?.some((n) => n._id === sharedNote._id && n.type === "shared");
      const hasPrivate = data.data?.some((n) => n.type === "private" || n._id === privateNote._id);
      const countMatch = data.data?.length === 1;

      const pass = res.status === 200 && hasShared && !hasPrivate && countMatch;
      return {
        pass,
        expected: "200 with exactly 1 shared note and 0 private notes",
        actual: `${res.status} count=${data.data?.length}, hasShared=${hasShared}, hasPrivate=${hasPrivate}`,
      };
    });

    // 8. Refreshing portal maintains valid access
    await testCase("PRT-07", "Client refreshes portal: access remains valid (200)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawPortalToken}`);
      const data = await res.json();
      const pass = res.status === 200 && data.data?.length === 1;
      return { pass, expected: "200 with 1 note", actual: `${res.status} count=${data.data?.length}` };
    });

    // 9. Client cannot request private notes
    await testCase("PRT-08", "Client cannot request private notes using portalToken (403)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawPortalToken}?type=private`);
      const pass = res.status === 403;
      return { pass, expected: 403, actual: res.status };
    });

    // 10. Client cannot retrieve private note by ID
    await testCase("PRT-09", "Client cannot retrieve private note by noteId via portalToken (404)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawPortalToken}/${privateNote._id}`);
      const pass = res.status === 404;
      return { pass, expected: 404, actual: res.status };
    });

    // 11. Client can retrieve their shared note by ID
    await testCase("PRT-10", "Client retrieves shared note by ID via portalToken (200)", async () => {
      const res = await fetch(`${baseUrl}/notes/shared/${rawPortalToken}/${sharedNote._id}`);
      const data = await res.json();
      const pass = res.status === 200 && data.data?._id === sharedNote._id && data.data?.type === "shared";
      return { pass, expected: "200 with shared note", actual: `${res.status} note=${data.data?._id}` };
    });

    // 12. Invalid portal token is rejected
    await testCase("PRT-11", "Invalid portal token is rejected with 404", async () => {
      const invalidToken = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const res = await fetch(`${baseUrl}/notes/shared/${invalidToken}`);
      const pass = res.status === 404;
      return { pass, expected: 404, actual: res.status };
    });

    // 13. Expired portal token is rejected
    await testCase("PRT-12", "Expired portal token is rejected with 410", async () => {
      const expClient = await Client.create({
        therapist_id: therapistA.id,
        name: "Expired Portal Client",
        email: `expired.portal.${uniqueId}@example.com`,
        portalTokenHash: crypto.createHash("sha256").update("expiredtoken1234567890123456789012345678").digest("hex"),
        portalTokenExpiresAt: new Date(Date.now() - 1000 * 60), // 1 min in past
      });

      const res = await fetch(`${baseUrl}/notes/shared/expiredtoken1234567890123456789012345678`);
      await Client.deleteOne({ _id: expClient._id });

      const pass = res.status === 410;
      return { pass, expected: 410, actual: res.status };
    });
  } finally {
    try {
      await Note.deleteMany({ therapistId: therapistA.id });
      await Client.deleteMany({ therapist_id: therapistA.id });
      await Therapist.deleteOne({ _id: therapistA.id });
    } catch (_) {}

    if (server) {
      await new Promise((r) => server.close(r));
    }
    await mongoose.disconnect();
  }

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log(`\n======================================================`);
  console.log(`Portal Lifecycle Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPortalLifecycleTestSuite().catch((err) => {
  console.error("Portal Lifecycle Test execution failed:", err);
  process.exit(1);
});
