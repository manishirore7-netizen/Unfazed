const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Booking = require("../src/models/Booking");
const Client = require("../src/models/Client");

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5001/api";

async function runClientCrmTestSuite() {
  console.log(`\n==================================================`);
  console.log(`Starting Client CRM Integration Test Suite`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`==================================================\n`);

  // Connect to DB directly for teardown and safeguard setup
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. CRM Therapist One",
    email: `dr.crm.one.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. CRM Therapist Two",
    email: `dr.crm.two.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  let client1Id = null;
  let client2Id = null;
  let bookingId = null;

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
    // ==========================================================
    // SETUP: Register & Login Therapist A and Therapist B
    // ==========================================================
    const regA = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistA.name,
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const regAData = await regA.json();

    const loginA = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const loginAData = await loginA.json();
    therapistA.token = loginAData.token;
    therapistA.id = loginAData.data?.id || regAData.data?.id;

    const regB = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistB.name,
        email: therapistB.email,
        password: therapistB.password,
      }),
    });
    const regBData = await regB.json();

    const loginB = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: therapistB.email,
        password: therapistB.password,
      }),
    });
    const loginBData = await loginB.json();
    therapistB.token = loginBData.token;
    therapistB.id = loginBData.data?.id || regBData.data?.id;

    if (!therapistA.token || !therapistB.token) {
      throw new Error("Failed to register test therapists.");
    }

    // ==========================================================
    // 1. Security & Authentication Checks
    // ==========================================================
    await testCase("SEC-01", "Reject client creation without auth token (401)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unauth Client", email: "unauth@example.com" }),
      });
      return { pass: res.status === 401, expected: 401, actual: res.status };
    });

    await testCase("SEC-02", "Reject client listing without auth token (401)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "GET",
      });
      return { pass: res.status === 401, expected: 401, actual: res.status };
    });

    // ==========================================================
    // 2. Input Validation Checks
    // ==========================================================
    await testCase("VAL-01", "Reject client creation with missing name (400)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({ email: `valid.email.${uniqueId}@example.com` }),
      });
      return { pass: res.status === 400, expected: 400, actual: res.status };
    });

    await testCase("VAL-02", "Reject client creation with invalid email (400)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({ name: "Jane Doe", email: "not-an-email" }),
      });
      return { pass: res.status === 400, expected: 400, actual: res.status };
    });

    await testCase("VAL-03", "Reject client creation with invalid status enum (400)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Jane Doe",
          email: `valid.${uniqueId}@example.com`,
          status: "random_status",
        }),
      });
      return { pass: res.status === 400, expected: 400, actual: res.status };
    });

    // ==========================================================
    // 3. Client Creation & Schema Fields
    // ==========================================================
    const client1Email = `client1.${uniqueId}@example.com`;
    await testCase("CRM-01", "Create client with full demographics and clinical context (201)", async () => {
      const payload = {
        name: "Alice Johnson",
        email: client1Email,
        phone: "+1-555-0199",
        status: "active",
        tags: ["anxiety", "cbt"],
        dateOfBirth: "1990-05-15",
        gender: "Female",
        pronouns: "she/her",
        preferredLanguage: "English",
        occupation: "Graphic Designer",
        emergencyContact: {
          name: "Bob Johnson",
          relationship: "Spouse",
          phone: "+1-555-0188",
        },
        address: {
          street: "123 Elm St",
          city: "Metropolis",
          state: "NY",
          postalCode: "10001",
          country: "USA",
        },
        presentingConcern: "Experiencing generalized anxiety and work stress.",
        relevantHistory: "Past panic episode 2 years ago.",
        goals: "Develop coping mechanisms and boundary-setting strategies.",
      };

      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (res.status === 201 && body.data?._id) {
        client1Id = body.data._id;
      }

      const pass =
        res.status === 201 &&
        body.success === true &&
        body.data.name === "Alice Johnson" &&
        body.data.email === client1Email &&
        body.data.status === "active" &&
        body.data.tags.includes("anxiety") &&
        body.data.address?.city === "Metropolis" &&
        body.data.emergencyContact?.name === "Bob Johnson" &&
        body.data.presentingConcern === "Experiencing generalized anxiety and work stress.";

      return { pass, expected: "Status 201 with saved client data", actual: `Status ${res.status}, id: ${client1Id}` };
    });

    await testCase("CRM-02", "Create second client with minimal fields (201)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Charlie Brown",
          email: `client2.${uniqueId}@example.com`,
          status: "lead",
          tags: ["consultation"],
        }),
      });

      const body = await res.json();
      if (res.status === 201 && body.data?._id) {
        client2Id = body.data._id;
      }

      return {
        pass: res.status === 201 && body.success === true && body.data.status === "lead",
        expected: 201,
        actual: res.status,
      };
    });

    // ==========================================================
    // 4. Duplicate Email Enforcement & Multi-Tenancy
    // ==========================================================
    await testCase("DUP-01", "Prevent duplicate client email for the SAME therapist (409)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Alice Duplicate",
          email: client1Email,
        }),
      });

      return { pass: res.status === 409, expected: 409, actual: res.status };
    });

    await testCase("TEN-01", "Allow SAME client email across DIFFERENT therapists (Multi-tenancy) (201)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          name: "Alice Under Therapist B",
          email: client1Email,
          status: "active",
        }),
      });

      const body = await res.json();
      return {
        pass: res.status === 201 && body.success === true,
        expected: 201,
        actual: res.status,
      };
    });

    // ==========================================================
    // 5. Scoped Client Listing & Data Isolation
    // ==========================================================
    await testCase("LIST-01", "List clients scoped strictly to Therapist A (Therapist B clients excluded)", async () => {
      const res = await fetch(`${BASE_URL}/clients`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const body = await res.json();
      const hasOnlyA =
        res.status === 200 &&
        body.success === true &&
        body.total === 2 &&
        body.data.every((c) => c.therapist_id === therapistA.id || c.therapistId === therapistA.id);

      return {
        pass: hasOnlyA,
        expected: "2 clients owned by Therapist A",
        actual: `${body.total} clients returned`,
      };
    });

    await testCase("LIST-02", "Filter clients by status (?status=lead)", async () => {
      const res = await fetch(`${BASE_URL}/clients?status=lead`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const body = await res.json();
      const pass = res.status === 200 && body.total === 1 && body.data[0].status === "lead";

      return { pass, expected: "1 lead client", actual: `${body.total} clients returned` };
    });

    await testCase("LIST-03", "Filter clients by tag (?tag=anxiety)", async () => {
      const res = await fetch(`${BASE_URL}/clients?tag=anxiety`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const body = await res.json();
      const pass = res.status === 200 && body.total === 1 && body.data[0].tags.includes("anxiety");

      return { pass, expected: "1 client with anxiety tag", actual: `${body.total} clients returned` };
    });

    await testCase("LIST-04", "Search clients by partial string (?search=Alice)", async () => {
      const res = await fetch(`${BASE_URL}/clients?search=Alice`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const body = await res.json();
      const pass = res.status === 200 && body.total === 1 && body.data[0].name === "Alice Johnson";

      return { pass, expected: "1 client matching search", actual: `${body.total} clients returned` };
    });

    // ==========================================================
    // 6. Retrieve Client by ID & Isolation
    // ==========================================================
    await testCase("GET-01", "Therapist A retrieves own client by ID (200)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      const body = await res.json();
      return {
        pass: res.status === 200 && body.data?._id === client1Id,
        expected: "200 with client data",
        actual: `Status: ${res.status}, ID: ${body.data?._id}`,
      };
    });

    await testCase("GET-02", "Therapist B cannot retrieve Therapist A's client by ID (404 Isolation)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });

      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    // ==========================================================
    // 7. Update Client Details
    // ==========================================================
    await testCase("UPD-01", "Therapist A updates client details (200)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          phone: "+1-555-9999",
          status: "archived",
          goals: "Updated clinical goals.",
        }),
      });

      const body = await res.json();
      const pass =
        res.status === 200 &&
        body.data?.phone === "+1-555-9999" &&
        body.data?.status === "archived" &&
        body.data?.goals === "Updated clinical goals.";

      return { pass, expected: "200 with updated fields", actual: `Status: ${res.status}` };
    });

    await testCase("UPD-02", "Therapist B cannot update Therapist A's client (404 Isolation)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({ name: "Hacked Name" }),
      });

      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    // ==========================================================
    // 8. Delete Safeguards & Deletion
    // ==========================================================
    // Step 8a: Create a confirmed booking for Client 1 directly in DB
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() + 3);
    bookingDate.setUTCHours(10, 0, 0, 0);

    const bookingEndDate = new Date(bookingDate.getTime() + 60 * 60 * 1000);

    const booking = await Booking.create({
      therapistId: therapistA.id,
      clientName: "Alice Johnson",
      clientEmail: client1Email,
      clientPhone: "+1-555-0199",
      duration: 60,
      startTime: bookingDate,
      endTime: bookingEndDate,
      status: "confirmed",
      bookedBuckets: ["2026-11-20T10:00:00.000Z_15"],
    });
    bookingId = booking._id;

    await testCase("DEL-01", "Prevent deletion of client with active/confirmed bookings (409 Conflict)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      return { pass: res.status === 409, expected: 409, actual: res.status };
    });

    await testCase("DEL-02", "Successfully delete client without active bookings (200)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client2Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      return { pass: res.status === 200, expected: 200, actual: res.status };
    });

    await testCase("DEL-03", "Therapist B cannot delete Therapist A's client (404 Isolation)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });

      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

    await testCase("DEL-04", "Confirm deleted client is no longer retrievable (404)", async () => {
      const res = await fetch(`${BASE_URL}/clients/${client2Id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });

      return { pass: res.status === 404, expected: 404, actual: res.status };
    });

  } finally {
    // Teardown test artifacts in DB
    if (bookingId) {
      await Booking.deleteOne({ _id: bookingId }).catch(() => {});
    }
    await Client.deleteMany({
      email: { $regex: `${uniqueId}@example.com` },
    }).catch(() => {});
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  // ==========================================================
  // Summary
  // ==========================================================
  console.log(`\n==================================================`);
  console.log(`Client CRM Integration Test Summary`);
  console.log(`==================================================`);
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\nTest suite finished with ${failed} failures.`);
    process.exit(1);
  } else {
    console.log(`\nAll CRM integration tests PASSED!`);
    process.exit(0);
  }
}

runClientCrmTestSuite().catch((err) => {
  console.error("CRM Test suite runner error:", err);
  process.exit(1);
});
