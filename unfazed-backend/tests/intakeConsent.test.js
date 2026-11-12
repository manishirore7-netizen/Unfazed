const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");

async function runIntakeConsentTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Client Intake & Digital Consent Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Intake Lead Practitioner",
    email: `dr.intake.a.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. Isolated Boundary Practitioner",
    email: `dr.intake.b.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  let clientA;
  let rawTokenA;

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
    // 1. Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas.");

    await Promise.all([
      Therapist.syncIndexes(),
      Client.syncIndexes(),
    ]);

    // 2. Start ephemeral test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
    console.log(`Test server running at ${baseUrl}\n`);

    // Setup: Register & Login Therapist A & Therapist B
    for (const th of [therapistA, therapistB]) {
      const regRes = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: th.name,
          email: th.email,
          password: th.password,
        }),
      });
      const regData = await regRes.json();
      th.id = regData.data?.id;
      th.slug = regData.data?.slug;

      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: th.email,
          password: th.password,
        }),
      });
      const loginData = await loginRes.json();
      th.token = loginData.token;

      // Update profile with slug & practice info
      const updateRes = await fetch(`${baseUrl}/therapist/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${th.token}`,
        },
        body: JSON.stringify({
          name: th.name,
          practiceName: `${th.name} Wellness`,
          title: "Licensed Clinical Psychologist",
          credentials: "Psy.D.",
        }),
      });
      await updateRes.json();
    }

    // Setup: Create a client for Therapist A
    const createClientRes = await fetch(`${baseUrl}/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${therapistA.token}`,
      },
      body: JSON.stringify({
        name: "Arthur Pendelton",
        email: `arthur.${uniqueId}@example.com`,
        phone: "+1 555-0199",
        status: "lead",
        occupation: "Architect",
        emergencyContact: {
          name: "Guinevere Pendelton",
          relationship: "Spouse",
          phone: "+1 555-0188",
        },
      }),
    });
    const createClientData = await createClientRes.json();
    clientA = createClientData.data;

    // TEST CASES

    // Test SEC-01: Rejection of intake initiation without auth token (401)
    await testCase("SEC-01", "Reject intake initiation without auth token (401)", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return {
        pass: res.status === 401,
        expected: 401,
        actual: res.status,
      };
    });

    // Test INIT-01: Therapist A initiates intake for clientA
    await testCase("INIT-01", "Therapist A initiates intake -> generates token, hashes in DB, sets pending", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
      });
      const data = await res.json();
      rawTokenA = data.data?.rawToken;

      // Inspect DB record directly to verify SHA-256 hash was stored, NOT the raw token
      const dbClient = await Client.findById(clientA._id);
      const expectedHash = crypto.createHash("sha256").update(rawTokenA).digest("hex");

      const hasHash = dbClient.intakeTokenHash === expectedHash;
      const isPending = dbClient.intakeStatus === "pending";
      const hasExpiry = Boolean(dbClient.intakeTokenExpiresAt);

      return {
        pass: res.status === 200 && data.success && hasHash && isPending && hasExpiry,
        expected: "status 200, intakeTokenHash matches SHA256(rawToken), status pending",
        actual: `status ${res.status}, hasHash=${hasHash}, isPending=${isPending}, hasExpiry=${hasExpiry}`,
      };
    });

    // Test SEC-02: Therapist B cannot initiate intake for Therapist A's client (404 Isolation)
    await testCase("SEC-02", "Therapist B cannot initiate intake for Therapist A's client (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
      });
      return {
        pass: res.status === 404,
        expected: 404,
        actual: res.status,
      };
    });

    // Test GET-01: Client accesses intake via valid raw token
    await testCase("GET-01", "Client accesses intake form with valid token (200)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawTokenA}`);
      const data = await res.json();

      const hasClientData = data.data?.client?.name === "Arthur Pendelton";
      const hasTherapistData = Boolean(data.data?.therapist?.practiceName);
      const hasVersion = data.data?.documentVersion === "1.0";

      return {
        pass: res.status === 200 && data.success && hasClientData && hasTherapistData && hasVersion,
        expected: "status 200 with client prefill and therapist practice details",
        actual: `status ${res.status}, hasClientData=${hasClientData}, hasTherapist=${hasTherapistData}`,
      };
    });

    // Test STAB-01: Parent re-renders / re-fetching client details does NOT generate another token
    await testCase("STAB-01", "Token stability: Re-fetching client details (simulating parent re-render) does NOT alter intakeTokenHash", async () => {
      const dbClientBefore = await Client.findById(clientA._id);
      const hashBefore = dbClientBefore.intakeTokenHash;

      // Simulate parent re-rendering and calling GET /clients/:id multiple times
      await fetch(`${baseUrl}/clients/${clientA._id}`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      await fetch(`${baseUrl}/clients/${clientA._id}`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const dbClientAfter = await Client.findById(clientA._id);
      const hashAfter = dbClientAfter.intakeTokenHash;

      // Also verify that the original raw token is still 100% valid
      const intakeCheck = await fetch(`${baseUrl}/intake/${rawTokenA}`);

      const unchanged = hashBefore === hashAfter && intakeCheck.status === 200;

      return {
        pass: unchanged,
        expected: "hash unchanged after parent re-fetches and intake endpoint returns 200",
        actual: `unchanged=${unchanged}, intakeStatus=${intakeCheck.status}`,
      };
    });

    // Test GET-02: Client cannot access intake with tampered / invalid token (404)
    await testCase("GET-02", "Client cannot access intake with invalid or tampered token (404)", async () => {
      const fakeToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const res = await fetch(`${baseUrl}/intake/${fakeToken}`);
      return {
        pass: res.status === 404,
        expected: 404,
        actual: res.status,
      };
    });

    // Test VAL-01: Submission fails without consent agreement (400)
    await testCase("VAL-01", "Intake submission fails if consentAgreed is not true (400)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawTokenA}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentAgreed: false,
          signatureName: "Arthur Pendelton",
        }),
      });
      return {
        pass: res.status === 400,
        expected: 400,
        actual: res.status,
      };
    });

    // Test VAL-02: Submission fails without digital signature name (400)
    await testCase("VAL-02", "Intake submission fails if signatureName is missing or empty (400)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawTokenA}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentAgreed: true,
          signatureName: "   ",
        }),
      });
      return {
        pass: res.status === 400,
        expected: 400,
        actual: res.status,
      };
    });

    // Test SUB-01: Successful intake submission with clinical history & signed consent
    await testCase("SUB-01", "Client submits intake & consent -> updates clinical fields, preserves contact, sets completed", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawTokenA}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateOfBirth: "1988-06-15",
          gender: "Male",
          pronouns: "he/him",
          presentingConcern: "Persistent work-related anxiety and insomnia.",
          medicalHistory: "Mild hypertension, managed with lifestyle changes.",
          mentalHealthHistory: "Previous brief therapy in 2020 for bereavement.",
          currentMedications: "None currently.",
          goals: "Develop coping mechanisms for executive stress.",
          consentAgreed: true,
          signatureName: "Arthur Pendelton",
        }),
      });
      const data = await res.json();

      const dbClient = await Client.findById(clientA._id);

      const statusCompleted = dbClient.intakeStatus === "completed";
      const consentCompleted = dbClient.consentStatus === "completed";
      const consentSignedName = dbClient.consentRecord?.signedName === "Arthur Pendelton";
      const tokenCleared = dbClient.intakeTokenHash === null;
      const historySaved = dbClient.medicalHistory === "Mild hypertension, managed with lifestyle changes.";
      const originalPhonePreserved = dbClient.phone === "+1 555-0199";

      return {
        pass:
          res.status === 200 &&
          data.success &&
          statusCompleted &&
          consentCompleted &&
          consentSignedName &&
          tokenCleared &&
          historySaved &&
          originalPhonePreserved,
        expected: "status 200, intakeStatus=completed, consentStatus=completed, token cleared, history saved",
        actual: `status ${res.status}, intakeStatus=${dbClient.intakeStatus}, consent=${dbClient.consentStatus}, tokenCleared=${tokenCleared}`,
      };
    });

    // Test SEC-03: Re-submission or reuse with the same token is rejected (404/400)
    await testCase("SEC-03", "Re-submitting with the same token is rejected (Single-use token invalidation)", async () => {
      const res = await fetch(`${baseUrl}/intake/${rawTokenA}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentAgreed: true,
          signatureName: "Arthur Pendelton",
        }),
      });
      return {
        pass: res.status === 404 || res.status === 400,
        expected: "404 or 400",
        actual: res.status,
      };
    });

    // Test EXP-01: Expired intake token is rejected (410)
    await testCase("EXP-01", "Accessing an expired intake link returns 410 Gone", async () => {
      // Create another client with an expired token
      const expiredRawToken = crypto.randomBytes(32).toString("hex");
      const expiredHash = crypto.createHash("sha256").update(expiredRawToken).digest("hex");

      const expClient = await Client.create({
        therapist_id: therapistA.id,
        name: "Expired Candidate",
        email: `expired.${uniqueId}@example.com`,
        intakeStatus: "pending",
        intakeTokenHash: expiredHash,
        intakeTokenExpiresAt: new Date(Date.now() - 1000 * 60), // 1 minute in the past
      });

      const res = await fetch(`${baseUrl}/intake/${expiredRawToken}`);
      const data = await res.json();

      await Client.deleteOne({ _id: expClient._id });

      return {
        pass: res.status === 410 && data.expired === true,
        expected: "410 Gone with expired: true",
        actual: `status ${res.status}, expired=${data.expired}`,
      };
    });

    // Test VIEW-01: Therapist A views submitted intake details & consent audit
    await testCase("VIEW-01", "Therapist A retrieves client's submitted intake & consent record (200)", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake`, {
        headers: {
          Authorization: `Bearer ${therapistA.token}`,
        },
      });
      const data = await res.json();

      const hasIntakeData = Boolean(data.data?.intakeResponses);
      const isConsentSigned = data.data?.consentStatus === "completed";
      const signedBy = data.data?.consentRecord?.signedName === "Arthur Pendelton";

      return {
        pass: res.status === 200 && data.success && hasIntakeData && isConsentSigned && signedBy,
        expected: "200 with complete intake responses and signed consent record",
        actual: `status ${res.status}, hasIntake=${hasIntakeData}, isConsentSigned=${isConsentSigned}`,
      };
    });

    // Test SEC-04: Therapist B cannot view Therapist A's client intake details (404 Isolation)
    await testCase("SEC-04", "Therapist B cannot view Therapist A's client intake details (404 Isolation)", async () => {
      const res = await fetch(`${baseUrl}/clients/${clientA._id}/intake`, {
        headers: {
          Authorization: `Bearer ${therapistB.token}`,
        },
      });
      return {
        pass: res.status === 404,
        expected: 404,
        actual: res.status,
      };
    });

  } catch (error) {
    console.error("Test execution encountered an error:", error);
  } finally {
    // Cleanup created test records
    try {
      if (therapistA.id) {
        await Therapist.deleteOne({ _id: therapistA.id });
        await Client.deleteMany({ therapist_id: therapistA.id });
      }
      if (therapistB.id) {
        await Therapist.deleteOne({ _id: therapistB.id });
        await Client.deleteMany({ therapist_id: therapistB.id });
      }
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();

    console.log(`\n======================================================`);
    console.log(`Client Intake & Digital Consent Test Summary`);
    console.log(`======================================================`);
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log("All Client Intake & Digital Consent integration tests PASSED!\n");
    }
  }
}

runIntakeConsentTestSuite();
