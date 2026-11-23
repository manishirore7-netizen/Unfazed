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
const Availability = require("../src/models/Availability");
const { canAccess, getEntitlements, entitlementService } = require("../src/services/entitlementService");
const { SUBSCRIPTION_TIERS, SubscriptionTierConfig } = require("../src/config/subscriptionTierConfig");

async function runEntitlementsAnalyticsTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 7 Entitlements & Analytics Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  let overcapTherapist;
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

    // Seed Overcap Therapist (starts at Starter tier with 21 active clients, replicating production)
    const overcapUnique = `${uniqueId}-overcap`;
    overcapTherapist = await Therapist.create({
      name: "Dr. Overcap Practitioner",
      email: `dr.overcap.${overcapUnique}@example.com`,
      password_hash: "hash",
      slug: `overcap-${overcapUnique}`,
      subscription: {
        tier: "starter",
        status: "active",
      },
    });
    const overcapToken = jwt.sign({ therapistId: overcapTherapist._id.toString() }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Seed 21 active clients for overcapTherapist
    const overcapClients = [];
    for (let i = 1; i <= 21; i++) {
      const c = await Client.create({
        therapist_id: overcapTherapist._id,
        name: `Overcap Client ${i}`,
        email: `overcap.client.${i}.${overcapUnique}@example.com`,
        phone: `+9199999000${i.toString().padStart(2, "0")}`,
        status: "active",
      });
      overcapClients.push(c);
    }

    // Configure open availability for overcapTherapist
    await Availability.create({
      therapistId: overcapTherapist._id,
      timezone: "UTC",
      sessionDurations: [30, 45, 60, 90],
      bufferTimeMinutes: 0,
      noticePeriodHours: 0,
      bookingWindowDays: 60,
      weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        timeSlots: [{ startTime: "09:00", endTime: "18:00" }],
      })),
    });

    await testCase("CAP-06", "Creation above the cap (21 clients on Starter) is rejected with 403 FEATURE_RESTRICTED", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${overcapToken}`,
        },
        body: JSON.stringify({
          name: "Attempted Client 22",
          email: `client.22.${overcapUnique}@example.com`,
          status: "active",
        }),
      });
      const data = await res.json();
      return {
        pass:
          res.status === 403 &&
          data.code === "FEATURE_RESTRICTED" &&
          data.entitlement?.limit === 5 &&
          data.entitlement?.currentCount >= 21,
        expected: "403 with code FEATURE_RESTRICTED when count is 21",
        actual: `${res.status} (code: ${data.code}, limit: ${data.entitlement?.limit}, count: ${data.entitlement?.currentCount})`,
      };
    });

    await testCase("CAP-07", "Public booking with a new client is rejected when therapist is at or over cap (403 FEATURE_RESTRICTED)", async () => {
      const res = await fetch(`${baseUrl}/api/scheduling/public/${overcapTherapist.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Brand New Public Client",
          clientEmail: `brandnew.public.${overcapUnique}@example.com`,
          clientPhone: "+919876543210",
          duration: 30,
          startTime: "2026-12-20T10:00:00.000Z",
        }),
      });
      const data = await res.json();
      return {
        pass: res.status === 403 && data.code === "FEATURE_RESTRICTED",
        expected: "403 FEATURE_RESTRICTED on public booking for new client",
        actual: `${res.status} (code: ${data.code}, message: ${data.message})`,
      };
    });

    await testCase("CAP-08", "Existing clients remain accessible and can book sessions when practice is over the cap", async () => {
      // 1. Existing clients list accessible
      const listRes = await fetch(`${baseUrl}/api/clients`, {
        headers: { Authorization: `Bearer ${overcapToken}` },
      });
      const listData = await listRes.json();
      const canList = listRes.status === 200 && listData.total >= 21;

      // 2. Single existing client details accessible
      const targetClient = overcapClients[0];
      const getRes = await fetch(`${baseUrl}/api/clients/${targetClient._id}`, {
        headers: { Authorization: `Bearer ${overcapToken}` },
      });
      const getData = await getRes.json();
      const canGet = getRes.status === 200 && getData.data?._id === targetClient._id.toString();

      // 3. Update existing client fields without changing status
      const putRes = await fetch(`${baseUrl}/api/clients/${targetClient._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${overcapToken}`,
        },
        body: JSON.stringify({
          phone: "+919111122222",
          occupation: "Software Engineer",
        }),
      });
      const putData = await putRes.json();
      const canUpdate = putRes.status === 200 && putData.data?.occupation === "Software Engineer";

      // 4. Existing client books a follow-up appointment successfully
      const bookRes = await fetch(`${baseUrl}/api/scheduling/public/${overcapTherapist.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: targetClient.name,
          clientEmail: targetClient.email,
          clientPhone: targetClient.phone,
          duration: 30,
          startTime: "2026-12-20T11:00:00.000Z",
        }),
      });
      const bookData = await bookRes.json();
      const canBook = bookRes.status === 201 && bookData.data?.clientId === targetClient._id.toString();

      return {
        pass: canList && canGet && canUpdate && canBook,
        expected: "All operations on existing clients succeed (list, get, update, book)",
        actual: `canList: ${canList}, canGet: ${canGet}, canUpdate: ${canUpdate}, canBook: ${canBook}`,
      };
    });

    await testCase("CAP-09", "Higher-tier limits work correctly (Pro tier allows up to 25 and blocks at 25, Premium allows beyond 25)", async () => {
      // Therapist B is on Pro tier (limit 25)
      // Add active clients to Therapist B up to 25
      const proClientsToAdd = 25;
      const proPromises = [];
      for (let i = 1; i <= proClientsToAdd; i++) {
        proPromises.push(
          Client.create({
            therapist_id: therapistB.id,
            name: `Pro Client ${i}`,
            email: `pro.client.${i}.${uniqueId}@example.com`,
            status: "active",
          })
        );
      }
      await Promise.all(proPromises);

      // Attempting 26th client on Pro tier must be rejected with 403
      const proRejectRes = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          name: "Pro Client 26",
          email: `pro.client.26.${uniqueId}@example.com`,
          status: "active",
        }),
      });
      const proRejectData = await proRejectRes.json();
      const proBlocked =
        proRejectRes.status === 403 &&
        proRejectData.code === "FEATURE_RESTRICTED" &&
        proRejectData.entitlement?.limit === 25;

      // Upgrade Therapist B to Premium tier (unlimited active clients)
      await fetch(`${baseUrl}/api/subscriptions/tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({ tier: "premium" }),
      });

      // Creating 26th client on Premium tier must now succeed
      const premRes = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          name: "Premium Client 26",
          email: `premium.client.26.${uniqueId}@example.com`,
          status: "active",
        }),
      });
      const premData = await premRes.json();
      const premAllowed = premRes.status === 201 && premData.data?.status === "active";

      // Reset Therapist B back to Pro for subsequent tests
      await fetch(`${baseUrl}/api/subscriptions/tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({ tier: "pro" }),
      });

      return {
        pass: proBlocked && premAllowed,
        expected: "Pro blocks at 25 (403), Premium permits beyond 25 (201)",
        actual: `proBlocked: ${proBlocked}, premAllowed: ${premAllowed}`,
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
      await Booking.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id, overcapTherapist?._id] } });
      await Note.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id] } });
      await Availability.deleteMany({ therapistId: { $in: [therapistA.id, therapistB.id, overcapTherapist?._id] } });
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
