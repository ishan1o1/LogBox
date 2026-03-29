const axios = require("axios");

const URL = "http://localhost:4000/log";
const CONCURRENCY = 50;

// ── Simulated microservices ──────────────────────────────────────────────────
const SERVICES = [
  {
    name: "auth-service",
    levelWeights: { INFO: 50, WARN: 25, ERROR: 20, DEBUG: 5 },
    messages: {
      INFO:  ["User login successful", "Token issued", "Session refreshed", "User logged out", "Password changed"],
      WARN:  ["Failed login attempt", "Token near expiry", "Rate limit approaching", "Suspicious IP detected"],
      ERROR: ["Invalid credentials", "Token verification failed", "Account locked after repeated failures", "OAuth provider unreachable"],
      DEBUG: ["JWT payload decoded", "Session store hit", "CSRF token validated"],
    },
  },
  {
    name: "payment-service",
    levelWeights: { INFO: 40, WARN: 20, ERROR: 30, DEBUG: 10 },
    messages: {
      INFO:  ["Payment processed successfully", "Refund initiated", "Invoice generated", "Subscription renewed", "Payout scheduled"],
      WARN:  ["Retry #1 for payment gateway", "High transaction volume detected", "Unusual charge pattern flagged"],
      ERROR: ["Payment gateway timeout", "Insufficient funds", "Card declined", "Webhook delivery failed", "Duplicate transaction detected"],
      DEBUG: ["Stripe API called", "Idempotency key set", "Currency conversion applied"],
    },
  },
  {
    name: "order-service",
    levelWeights: { INFO: 60, WARN: 15, ERROR: 15, DEBUG: 10 },
    messages: {
      INFO:  ["Order placed", "Order confirmed", "Order shipped", "Order delivered", "Order cancelled by user"],
      WARN:  ["Stock running low for SKU", "Delivery SLA at risk", "Order modification requested after shipment"],
      ERROR: ["Inventory sync failed", "Shipping provider error", "Order fulfillment timeout", "Warehouse API unreachable"],
      DEBUG: ["Cart serialised", "Promo code validated", "Tax calculation complete"],
    },
  },
  {
    name: "notification-service",
    levelWeights: { INFO: 45, WARN: 30, ERROR: 20, DEBUG: 5 },
    messages: {
      INFO:  ["Email sent successfully", "SMS delivered", "Push notification dispatched", "Digest email queued"],
      WARN:  ["Email bounce rate elevated", "SMS provider latency high", "Notification queue depth rising"],
      ERROR: ["SMTP connection refused", "Push token expired", "Notification delivery failed after 3 retries"],
      DEBUG: ["Template rendered", "Recipient list resolved", "Unsubscribe check passed"],
    },
  },
  {
    name: "api-gateway",
    levelWeights: { INFO: 55, WARN: 20, ERROR: 15, DEBUG: 10 },
    messages: {
      INFO:  ["Request routed to auth-service", "Request routed to order-service", "Health check passed", "Rate limiter reset"],
      WARN:  ["Upstream latency > 500ms", "Circuit breaker half-open", "Request body limit near threshold"],
      ERROR: ["Upstream service unavailable", "SSL certificate validation failed", "Circuit breaker open — requests dropped"],
      DEBUG: ["Request headers sanitised", "Correlation ID attached", "Load balancer round-robin selected"],
    },
  },
  {
    name: "inventory-service",
    levelWeights: { INFO: 50, WARN: 25, ERROR: 15, DEBUG: 10 },
    messages: {
      INFO:  ["Stock updated", "Restock triggered", "SKU reservation made", "Warehouse sync complete"],
      WARN:  ["SKU below reorder threshold", "Supplier lead time exceeded", "Dead stock flagged"],
      ERROR: ["DB write conflict on SKU update", "Supplier API timeout", "Stock reservation expired"],
      DEBUG: ["Cache invalidated for SKU", "Batch import started", "Diff computed against warehouse snapshot"],
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Weighted random level picker */
function pickLevel(weights) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [level, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return level;
  }
  return "INFO";
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildLog(service) {
  const level = pickLevel(service.levelWeights);
  const baseMessage = rand(service.messages[level]);
  // Optionally append a request/trace ID for realism
  const traceId = Math.random() > 0.5
    ? ` [trace=${Math.random().toString(36).slice(2, 10)}]`
    : "";
  return {
    service: service.name,
    level,
    message: baseMessage + traceId,
    meta: {
      host: `${service.name}-pod-${Math.floor(Math.random() * 4) + 1}`,
    },
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function sendLog(log) {
  try {
    await axios.post(URL, log);
  } catch (err) {
    console.error(`[${log.service}] Send failed:`, err.response?.data ?? err.message);
  }
}

async function run() {
  // Build a batch — random number of logs per service so the distribution feels natural
  const batch = [];
  for (const service of SERVICES) {
    const count = Math.floor(Math.random() * 30) + 20; // 20–50 logs per service
    for (let i = 0; i < count; i++) {
      batch.push(buildLog(service));
    }
  }

  // Shuffle so logs from different services interleave realistically
  batch.sort(() => Math.random() - 0.5);

  console.log(`Sending ${batch.length} logs across ${SERVICES.length} services…`);

  // Send in chunks of CONCURRENCY
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(sendLog));
  }

  // Print a summary
  const summary = {};
  batch.forEach(({ service, level }) => {
    if (!summary[service]) summary[service] = { INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 };
    summary[service][level]++;
  });

  console.log("\n── Summary ──────────────────────────────");
  for (const [svc, counts] of Object.entries(summary)) {
    const parts = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([l, c]) => `${l}:${c}`)
      .join("  ");
    console.log(`  ${svc.padEnd(24)} ${parts}`);
  }
  console.log("─────────────────────────────────────────");
  console.log("Done.");
}

run();