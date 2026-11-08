const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5001/api";

async function runProfileTestSuite() {
  console.log(`\n==================================================`);
  console.log(`Starting Therapist Profile Integration Test Suite`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`==================================================\n`);

  const results = [];
  const uniqueId = Date.now();
  const testEmail = `dr.test.profile.${uniqueId}@example.com`;
  const testPassword = "ProfileSecurePass123!";
  const testName = "Dr. Profile Integration Subject";

  let authToken = null;
  let originalSlug = null;

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

  // --- SETUP: Register & Login test therapist ---
  try {
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    originalSlug = regData?.data?.slug;

    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json();
    authToken = loginData?.token;
  } catch (err) {
    console.error(`\n[FATAL] Setup failed: Could not connect to backend at ${BASE_URL}.`);
    console.error(`Ensure the server is running on port 5001. Error: ${err.message}\n`);
    process.exit(1);
  }

  if (!authToken) {
    console.error("\n[FATAL] Setup failed: Could not obtain JWT token.\n");
    process.exit(1);
  }

  // --- TEST 1: Authenticated GET /api/therapist/me returns HTTP 200 ---
  await testCase(1, "Authenticated GET /api/therapist/me returns HTTP 200", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.email === testEmail &&
      !data.data.password_hash;
    return { expected: "200 OK", actual: `${res.status}`, pass };
  });

  // --- TEST 2: Authenticated PUT /api/therapist/me updates valid profile fields ---
  const updatePayload = {
    name: "Dr. Valid Name",
    bio: "Clinical psychologist specializing in CBT.",
    specializations: ["CBT", "Anxiety"],
    languages: ["English"],
  };

  await testCase(2, "Authenticated PUT /api/therapist/me updates valid profile fields", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    });
    const data = await res.json();
    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.name === updatePayload.name &&
      data.data.bio === updatePayload.bio &&
      data.data.specializations.length === 2 &&
      data.data.languages.length === 1;
    return { expected: "200 OK", actual: `${res.status}`, pass };
  });

  // --- TEST 3: Updated values are persisted in MongoDB (verified via GET) ---
  await testCase(3, "Updated values are persisted in MongoDB (verified via GET)", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    const pass =
      res.status === 200 &&
      data.data.name === updatePayload.name &&
      data.data.bio === updatePayload.bio &&
      data.data.specializations[0] === "CBT";
    return { expected: "Persisted correctly", actual: pass ? "Persisted correctly" : "Mismatch", pass };
  });

  // --- TEST 4: PUT without a token returns HTTP 401 ---
  await testCase(4, "PUT /api/therapist/me without a token returns HTTP 401", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthenticated" }),
    });
    return { expected: "401 Unauthorized", actual: `${res.status}`, pass: res.status === 401 };
  });

  // --- TEST 5: PUT with an invalid token returns HTTP 401 ---
  await testCase(5, "PUT /api/therapist/me with an invalid token returns HTTP 401", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer invalid.fake.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Invalid Token" }),
    });
    return { expected: "401 Unauthorized", actual: `${res.status}`, pass: res.status === 401 };
  });

  // --- TEST 6: Invalid profile data returns HTTP 400 ---
  await testCase(6, "Invalid profile data returns HTTP 400 (empty name, non-array specializations, etc.)", async () => {
    const res1 = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "   " }),
    });

    const res2 = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ specializations: "not-an-array" }),
    });

    const pass = res1.status === 400 && res2.status === 400;
    return {
      expected: "400 on invalid input",
      actual: `${res1.status}, ${res2.status}`,
      pass,
    };
  });

  // --- TEST 7: Attempting to update password_hash, email, or slug does not modify those fields ---
  await testCase(7, "Attempting to update password_hash, email, or slug does not modify those fields", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Dr. Guarded",
        email: "hacked@example.com",
        slug: "hacked-slug",
        password_hash: "$2a$10$maliciousFakePasswordHashHacked123",
      }),
    });
    const data = await res.json();
    const emailUnchanged = data.data.email === testEmail;
    const slugUnchanged = data.data.slug === originalSlug;
    const noHashInResponse = !data.data.password_hash;

    const pass = res.status === 200 && emailUnchanged && slugUnchanged && noHashInResponse;
    return {
      expected: "Protected fields unchanged",
      actual: pass ? "Protected fields unchanged" : "Protected fields mutated",
      pass,
    };
  });

  // --- TEST 8: Public GET /api/therapist/dr-unfazed-test returns HTTP 200 ---
  await testCase(8, "Public GET /api/therapist/dr-unfazed-test returns HTTP 200", async () => {
    const res = await fetch(`${BASE_URL}/therapist/dr-unfazed-test`);
    const data = await res.json();
    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.slug === "dr-unfazed-test" &&
      data.data.name === "Dr. Unfazed Test";
    return { expected: "200 OK", actual: `${res.status}`, pass };
  });

  // --- TEST 9: Public GET for nonexistent slug returns HTTP 404 ---
  await testCase(9, "Public GET for nonexistent slug returns HTTP 404", async () => {
    const res = await fetch(`${BASE_URL}/therapist/nonexistent-therapist-slug-9999`);
    const data = await res.json();
    const pass = res.status === 404 && data.success === false;
    return { expected: "404 Not Found", actual: `${res.status}`, pass };
  });

  // --- TEST 10: Public profile response never contains email or password_hash ---
  await testCase(10, "Public profile response never contains email or password_hash", async () => {
    const res = await fetch(`${BASE_URL}/therapist/dr-unfazed-test`);
    const data = await res.json();
    const rawString = JSON.stringify(data);
    const hasNoEmail = !data.data.email && !rawString.includes("unfazed.test@example.com");
    const hasNoPasswordHash = !data.data.password_hash && !rawString.includes("password_hash");
    const pass = res.status === 200 && hasNoEmail && hasNoPasswordHash;
    return {
      expected: "Email and password_hash omitted",
      actual: pass ? "Email and password_hash omitted" : "Sensitive data leaked",
      pass,
    };
  });

  // --- TEST 11: Duplicate specializations are removed ---
  await testCase(11, "Duplicate specializations are removed (deduplication)", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specializations: ["Anxiety", "CBT", "Anxiety", "Trauma", "CBT"],
      }),
    });
    const data = await res.json();
    const specs = data?.data?.specializations || [];
    const isDeduplicated =
      specs.length === 3 &&
      specs.includes("Anxiety") &&
      specs.includes("CBT") &&
      specs.includes("Trauma");
    return {
      expected: "3 unique specializations",
      actual: `${specs.length} items (${JSON.stringify(specs)})`,
      pass: res.status === 200 && isDeduplicated,
    };
  });

  // --- TEST 12: Duplicate languages are removed ---
  await testCase(12, "Duplicate languages are removed (deduplication)", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        languages: ["English", "Hindi", "English", "Spanish", "Hindi"],
      }),
    });
    const data = await res.json();
    const langs = data?.data?.languages || [];
    const isDeduplicated =
      langs.length === 3 &&
      langs.includes("English") &&
      langs.includes("Hindi") &&
      langs.includes("Spanish");
    return {
      expected: "3 unique languages",
      actual: `${langs.length} items (${JSON.stringify(langs)})`,
      pass: res.status === 200 && isDeduplicated,
    };
  });

  // --- TEST 13: Whitespace in specializations and languages is trimmed (and empty items filtered) ---
  await testCase(13, "Whitespace in specializations and languages is trimmed", async () => {
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specializations: ["  Depression  ", "  OCD  ", "   "],
        languages: ["  French  ", "  German  ", "  "],
      }),
    });
    const data = await res.json();
    const specs = data?.data?.specializations || [];
    const langs = data?.data?.languages || [];
    const trimmedAndClean =
      specs.length === 2 &&
      specs[0] === "Depression" &&
      specs[1] === "OCD" &&
      langs.length === 2 &&
      langs[0] === "French" &&
      langs[1] === "German";
    return {
      expected: "Trimmed without empty strings",
      actual: trimmedAndClean ? "Trimmed without empty strings" : `specs: ${JSON.stringify(specs)}, langs: ${JSON.stringify(langs)}`,
      pass: res.status === 200 && trimmedAndClean,
    };
  });

  // --- TEST 14: Names exceeding 100 characters are rejected with HTTP 400 ---
  await testCase(14, "Names exceeding 100 characters are rejected with HTTP 400", async () => {
    const longName = "A".repeat(101);
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: longName }),
    });
    const data = await res.json();
    const pass = res.status === 400 && data.success === false && data.message.includes("100");
    return {
      expected: "400 Bad Request",
      actual: `${res.status} (${data.message})`,
      pass,
    };
  });

  // --- TEST 15: Bios exceeding 2500 characters are rejected with HTTP 400 ---
  await testCase(15, "Bios exceeding 2500 characters are rejected with HTTP 400", async () => {
    const longBio = "B".repeat(2501);
    const res = await fetch(`${BASE_URL}/therapist/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bio: longBio }),
    });
    const data = await res.json();
    const pass = res.status === 400 && data.success === false && data.message.includes("2500");
    return {
      expected: "400 Bad Request",
      actual: `${res.status} (${data.message})`,
      pass,
    };
  });

  // --- TEST 16: Public profile endpoint returns exactly the five approved response fields ---
  await testCase(16, "Public profile endpoint returns exactly the five approved response fields", async () => {
    const res = await fetch(`${BASE_URL}/therapist/dr-unfazed-test`);
    const data = await res.json();
    const keys = Object.keys(data?.data || {}).sort();
    const expectedKeys = ["bio", "languages", "name", "slug", "specializations"].sort();
    const exactMatch =
      keys.length === expectedKeys.length &&
      keys.every((k, idx) => k === expectedKeys[idx]);
    return {
      expected: "Exactly [bio, languages, name, slug, specializations]",
      actual: `Fields: [${keys.join(", ")}]`,
      pass: res.status === 200 && exactMatch,
    };
  });

  // --- SUMMARY ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\n--------------------------------------------------`);
  console.log(`Test Results Summary:`);
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`--------------------------------------------------\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runProfileTestSuite().catch((err) => {
  console.error("Test runner failed unexpectedly:", err);
  process.exit(1);
});

