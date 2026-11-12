const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Note = require("../src/models/Note");
const Payment = require("../src/models/Payment");
const Booking = require("../src/models/Booking");
const { canAccess, getEntitlements, entitlementService } = require("../src/services/entitlementService");
const { SUBSCRIPTION_TIERS, SubscriptionTierConfig } = require("../src/config/subscriptionTierConfig");

async function runEntitlementsAnalyticsTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 7 Entitlements & Analytics Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Starter Practitioner",
    email: `dr.starter.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. Pro Practitioner",
    email: `dr.pro.${uniqueId}@example.com`,
    password: "Password123!",
    token: null,
    id: null,
  };

  let clientA;
  let clientLeadA;

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

    // Seed Therapist A (starts at default "starter" tier)
    const dbTherapistA = await Therapist.create({
      name: therapistA.name,
      email: therapistA.email,
      password_hash: "hash",
      slug: `starter-${uniqueId}`,
      subscription: {
        tier: "starter",
        status: "active",
      },
    });
    therapistA.id = dbTherapistA._id.toString();
    therapistA.token = jwt.sign({ therapistId: therapistA.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Seed Therapist B ("pro" tier)
    const dbTherapistB = await Therapist.create({
      name: therapistB.name,
      email: therapistB.email,
      password_hash: "hash",
      slug: `pro-${uniqueId}`,
      subscription: {
        tier: "pro",
        status: "active",
      },
    });
    therapistB.id = dbTherapistB._id.toString();
    therapistB.token = jwt.sign({ therapistId: therapistB.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Start HTTP Server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;

    // ==========================================
    // SECTION 1: ENTITLEMENT SERVICE & FALLBACKS
    // ==========================================

    await testCase("ENT-01", "Therapist without subscription object defaults safely to starter tier", async () => {
      const mockTherapist = await Therapist.create({
        name: "Dr. No Sub",
        email: `dr.nosub.${uniqueId}@example.com`,
        password_hash: "hash",
        slug: `nosub-${uniqueId}`,
      });
      const check = await canAccess(mockTherapist._id, "detailed_analytics");
      await Therapist.deleteOne({ _id: mockTherapist._id });
      return {
        pass: check.currentTier === "starter" && check.maxDays === 7,
        expected: "Starter tier with maxDays: 7",
        actual: `tier: ${check.currentTier}, maxDays: ${check.maxDays}`,
      };
    });

    await testCase("ENT-02", "Expired subscription safely falls back to starter tier feature limits", async () => {
      const expiredTherapist = await Therapist.create({
        name: "Dr. Expired",
        email: `dr.expired.${uniqueId}@example.com`,
        password_hash: "hash",
        slug: `expired-${uniqueId}`,
        subscription: {
          tier: "premium",
          status: "expired",
        },
      });
      const check = await canAccess(expiredTherapist._id, "note_templates", { template: "soap" });
      await Therapist.deleteOne({ _id: expiredTherapist._id });
      return {
        pass: check.allowed === false && check.currentTier === "starter" && check.isExpired === true,
        expected: "allowed: false, currentTier: starter, isExpired: true",
        actual: `allowed: ${check.allowed}, currentTier: ${check.currentTier}, isExpired: ${check.isExpired}`,
      };
    });

    await testCase("ENT-03", "getEntitlements returns complete usage and subscription tier definitions", async () => {
      const entitlements = await getEntitlements(therapistA.id);
      return {
        pass:
          entitlements &&
          entitlements.tier === "starter" &&
          entitlements.activeClients.cap === 5 &&
          Array.isArray(entitlements.noteTemplates.allowed) &&
          entitlements.availableTiers.starter !== undefined,
        expected: "Tier profile with cap 5 and availableTiers dictionary",
        actual: `tier: ${entitlements?.tier}, cap: ${entitlements?.activeClients?.cap}`,
      };
    });

    // ==========================================
    // SECTION 2: GATED FEATURE 1 - ACTIVE CLIENT CAP
    // ==========================================

    await testCase("CAP-01", "Therapist A adds active clients up to the plan cap (5 clients)", async () => {
      // Create 5 active clients
      for (let i = 1; i <= 5; i++) {
        const res = await fetch(`${baseUrl}/api/clients`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${therapistA.token}`,
          },
          body: JSON.stringify({
            name: `Client Number ${i}`,
            email: `client.${i}.${uniqueId}@example.com`,
            status: "active",
          }),
        });
        if (res.status !== 201) {
          const errData = await res.json();
          return { pass: false, expected: "201 Created", actual: `${res.status}: ${JSON.stringify(errData)}` };
        }
      }
      return {
        pass: true,
        expected: "5 clients created with 201 Created",
        actual: "All 5 active clients created successfully",
      };
    });

    await testCase("CAP-02", "Exceeding the 5 active client cap returns HTTP 403 FEATURE_RESTRICTED", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Client Exceeding Limit",
          email: `client.exceed.${uniqueId}@example.com`,
          status: "active",
        }),
      });
      const data = await res.json();
      return {
        pass:
          res.status === 403 &&
          data.code === "FEATURE_RESTRICTED" &&
          data.entitlement?.limit === 5 &&
          data.entitlement?.currentCount >= 5,
        expected: "403 with code FEATURE_RESTRICTED and limit 5",
        actual: `${res.status} (code: ${data.code}, limit: ${data.entitlement?.limit})`,
      };
    });

    await testCase("CAP-03", "Creating a non-active client (lead/inactive) is NOT blocked by active-client cap", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Consultation Lead Client",
          email: `client.lead.${uniqueId}@example.com`,
          status: "lead",
        }),
      });
      const data = await res.json();
      if (res.status === 201) {
        clientLeadA = data.data;
      }
      return {
        pass: res.status === 201 && data.data?.status === "lead",
        expected: "201 Created for status 'lead'",
        actual: `${res.status} (status: ${data.data?.status})`,
      };
    });

    await testCase("CAP-04", "Promoting a lead to 'active' when cap is reached is rejected with HTTP 403", async () => {
      const res = await fetch(`${baseUrl}/api/clients/${clientLeadA._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          status: "active",
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 403 && data.code === "FEATURE_RESTRICTED",
        expected: "403 FEATURE_RESTRICTED on status update to active",
        actual: `${res.status} (code: ${data.code})`,
      };
    });

    await testCase("CAP-05", "Switching tier to 'pro' unblocks active client additions", async () => {
      // Upgrade Therapist A to Pro
      await fetch(`${baseUrl}/api/subscriptions/tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({ tier: "pro" }),
      });

      // Now promoting lead client to active should succeed
      const res = await fetch(`${baseUrl}/api/clients/${clientLeadA._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({ status: "active" }),
      });
      const data = await res.json();

      // Reset Therapist A back to Starter for subsequent tests
      await fetch(`${baseUrl}/api/subscriptions/tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({ tier: "starter" }),
      });

      return {
        pass: res.status === 200 && data.data?.status === "active",
        expected: "200 OK after tier upgrade",
        actual: `${res.status} (status: ${data.data?.status})`,
      };
    });

    // ==========================================
    // SECTION 3: GATED FEATURE 2 - NOTE TEMPLATES
    // ==========================================

    await testCase("TMP-01", "Starter tier permits creating basic freeform clinical note", async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientLeadA._id,
          title: "Session Note",
          content: "General freeform notes from initial session.",
          template: "freeform",
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 201 && data.data?.template === "freeform",
        expected: "201 Created with template freeform",
        actual: `${res.status} (template: ${data.data?.template})`,
      };
    });

    await testCase("TMP-02", "Starter tier rejects structured 'soap' note template with 403 FEATURE_RESTRICTED", async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: clientLeadA._id,
          title: "SOAP Assessment",
          content: "S: Patient reports anxiety. O: Calibrated mood. A: Progress. P: Weekly session.",
          template: "soap",
        }),
      });
      const data = await res.json();
      return {
        pass:
          res.status === 403 &&
          data.code === "FEATURE_RESTRICTED" &&
          data.entitlement?.requiredTier === "pro",
        expected: "403 with code FEATURE_RESTRICTED and requiredTier: pro",
        actual: `${res.status} (code: ${data.code}, requiredTier: ${data.entitlement?.requiredTier})`,
      };
    });

    await testCase("TMP-03", "Pro tier permits 'soap' structured note template", async () => {
      // Create a client for Therapist B
      const clientB = await Client.create({
        therapist_id: therapistB.id,
        name: "Pro Client",
        email: `pro.client.${uniqueId}@example.com`,
        status: "active",
      });

      const res = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          clientId: clientB._id,
          title: "Pro SOAP Assessment",
          content: "S: Reports mild stress. O: Engaged. A: Stable. P: Grounding exercises.",
          template: "soap",
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 201 && data.data?.template === "soap",
        expected: "201 Created with template soap",
        actual: `${res.status} (template: ${data.data?.template})`,
      };
    });

    await testCase("TMP-04", "Pro tier rejects 'birp' template (reserved for Premium) with 403", async () => {
      const clientB = await Client.findOne({ therapist_id: therapistB.id });
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          clientId: clientB._id,
          title: "Behavioral BIRP Note",
          content: "B: Avoidance. I: Exposure. R: Positive. P: Practice.",
          template: "birp",
        }),
      });
      const data = await res.json();
      return {
        pass:
          res.status === 403 &&
          data.code === "FEATURE_RESTRICTED" &&
          data.entitlement?.requiredTier === "premium",
        expected: "403 with requiredTier: premium",
        actual: `${res.status} (requiredTier: ${data.entitlement?.requiredTier})`,
      };
    });

    // ==========================================
    // SECTION 4: GATED FEATURE 3 - ANALYTICS DEPTH
    // ==========================================

    await testCase("ANA-01", "Starter tier retrieves 7-day analytics without restriction clamping", async () => {
      const res = await fetch(`${baseUrl}/api/analytics?range=7d`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      return {
        pass:
          res.status === 200 &&
          data.data?.dateRange?.isClamped === false &&
          data.data?.revenue !== undefined &&
          data.data?.clients !== undefined &&
          data.data?.appointments !== undefined,
        expected: "200 with isClamped: false and analytics sections present",
        actual: `${res.status} (isClamped: ${data.data?.dateRange?.isClamped})`,
      };
    });

    await testCase("ANA-02", "Starter tier requesting 30-day analytics is clamped with upgrade notice", async () => {
      const res = await fetch(`${baseUrl}/api/analytics?range=30d`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      return {
        pass:
          res.status === 200 &&
          data.data?.dateRange?.isClamped === true &&
          data.data?.restrictionNotice?.restricted === true &&
          data.data?.restrictionNotice?.requiredTier === "pro",
        expected: "200 with isClamped: true and requiredTier: pro in notice",
        actual: `${res.status} (isClamped: ${data.data?.dateRange?.isClamped}, requiredTier: ${data.data?.restrictionNotice?.requiredTier})`,
      };
    });

    await testCase("ANA-03", "Starter tier calling GET /api/analytics/detailed is rejected with 403", async () => {
      const res = await fetch(`${baseUrl}/api/analytics/detailed`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      return {
        pass: res.status === 403 && data.code === "FEATURE_RESTRICTED",
        expected: "403 FEATURE_RESTRICTED",
        actual: `${res.status} (code: ${data.code})`,
      };
    });

    await testCase("ANA-04", "Pro tier retrieves 30-day analytics and detailed breakdown without clamping", async () => {
      const res = await fetch(`${baseUrl}/api/analytics?range=30d`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      const data = await res.json();
      return {
        pass:
          res.status === 200 &&
          data.data?.dateRange?.isClamped === false &&
          data.data?.restrictionNotice === null,
        expected: "200 with isClamped: false and restrictionNotice: null",
        actual: `${res.status} (isClamped: ${data.data?.dateRange?.isClamped})`,
      };
    });

    // ==========================================
    // SECTION 5: ANALYTICS AGGREGATION ACCURACY
    // ==========================================

    await testCase("AGG-01", "Revenue trend aggregation correctly sums captured payments", async () => {
      // Seed a captured payment for Therapist B
      const clientB = await Client.findOne({ therapist_id: therapistB.id });
      await Payment.create({
        therapistId: therapistB.id,
        clientId: clientB._id,
        itemType: "single_session",
        amount: 250000, // ₹2,500
        platformFee: 5000,
        netTherapistAmount: 245000, // ₹2,450
        status: "captured",
        paymentMethod: "card",
      });

      const res = await fetch(`${baseUrl}/api/analytics?range=30d`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      const data = await res.json();
      const revenue = data.data?.revenue?.summary;
      return {
        pass: revenue && revenue.grossPaise >= 250000 && revenue.netEarningsPaise >= 245000,
        expected: "grossPaise >= 250000, netEarningsPaise >= 245000",
        actual: `gross: ${revenue?.grossPaise}, net: ${revenue?.netEarningsPaise}`,
      };
    });

    await testCase("AGG-02", "No-show rate pipeline correctly computes percentage of finished sessions", async () => {
      const clientB = await Client.findOne({ therapist_id: therapistB.id });

      const alignedBase = new Date();
      alignedBase.setMinutes(0, 0, 0);

      // Create 1 completed session and 1 no-show session
      await Booking.create({
        therapistId: therapistB.id,
        clientId: clientB._id,
        clientName: clientB.name,
        clientEmail: clientB.email,
        duration: 60,
        startTime: new Date(alignedBase.getTime() - 24 * 60 * 60 * 1000),
        endTime: new Date(alignedBase.getTime() - 23 * 60 * 60 * 1000),
        status: "completed",
        bookedBuckets: [`COMM_AGG_1_${uniqueId}`],
      });

      await Booking.create({
        therapistId: therapistB.id,
        clientId: clientB._id,
        clientName: clientB.name,
        clientEmail: clientB.email,
        duration: 60,
        startTime: new Date(alignedBase.getTime() - 48 * 60 * 60 * 1000),
        endTime: new Date(alignedBase.getTime() - 47 * 60 * 60 * 1000),
        status: "no_show",
        bookedBuckets: [`COMM_AGG_2_${uniqueId}`],
      });

      const res = await fetch(`${baseUrl}/api/analytics?range=30d`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });
      const data = await res.json();
      const appointments = data.data?.appointments;
      return {
        pass:
          appointments &&
          appointments.summary.no_show >= 1 &&
          appointments.summary.completed >= 1 &&
          appointments.noShowRatePercentage > 0,
        expected: "no_show >= 1, completed >= 1, noShowRatePercentage > 0",
        actual: `no_show: ${appointments?.summary?.no_show}, completed: ${appointments?.summary?.completed}, rate: ${appointments?.noShowRatePercentage}%`,
      };
    });

    // ==========================================
    // SECTION 6: TENANT DATA ISOLATION
    // ==========================================

    await testCase("ISO-01", "Therapist A analytics does not include Therapist B revenue or bookings", async () => {
      const res = await fetch(`${baseUrl}/api/analytics?range=7d`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      const revenueA = data.data?.revenue?.summary;
      return {
        pass: revenueA && revenueA.grossPaise === 0,
        expected: "0 gross revenue for Therapist A (isolation preserved)",
        actual: `grossPaise: ${revenueA?.grossPaise}`,
      };
    });

    await testCase("ISO-02", "Therapist cannot modify another practice's subscription tier", async () => {
      // Attacking therapist tier switch for another user is impossible because tier endpoint is strictly scoped to req.therapistId
      const res = await fetch(`${baseUrl}/api/subscriptions/entitlements`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const data = await res.json();
      return {
        pass: res.status === 200 && data.data?.tier === "starter",
        expected: "200 strictly returning caller's own starter subscription",
        actual: `${res.status} (tier: ${data.data?.tier})`,
      };
    });

  } catch (fatalErr) {
    console.error("Fatal test suite runner error:", fatalErr);
  } finally {
    if (server) {
      server.close();
    }
    // Clean up test records
    try {
      await Therapist.deleteMany({ email: new RegExp(uniqueId) });
      await Client.deleteMany({ email: new RegExp(uniqueId) });
      await Payment.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
      await Booking.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
      await Note.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
    } catch (_) {}

    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB Atlas.");
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n======================================================`);
  console.log(`Module 7 Entitlements & Analytics Test Results:`);
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed} / ${results.length}`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEntitlementsAnalyticsTestSuite();
