---
title: "Node.js API Rate Limiting: In-Memory, Redis, and Edge Approaches"
description: "How to protect your API from abuse with three practical strategies"
pubDate: 2025-09-20
tags: ["node","rate-limiting","redis","security"]
heroImage: "./node-api-rate-limiting/1-6rthWZnK2PPmFJr0PdOFEQ.png"
heroImageAlt: "Node.js API Rate Limiting: In-Memory, Redis, and Edge Approaches"
sourceUrl: "https://medium.com/@gosucode/node-js-api-rate-limiting-in-memory-redis-and-edge-approaches-ac94b3ac1c9a"
---

If you’re deploying a Node.js API — whether on **Vercel, Netlify or your own VPS** — you need to think about **rate limiting**. It’s one of the easiest ways to prevent abuse, keep costs under control, and make sure everyone gets a fair share of your resources.

Let’s explore **three practical approaches** to rate limiting on Vercel:

-   **In-memory:** Quick and easy, but limited in production
-   **External store (Redis / KV):** The production-grade solution
-   **Edge Middleware:** The fastest and most scalable option for serverless environments

Each example comes with code you can copy, adapt, and deploy — whether you’re using Vercel or any other platform.

#### 1\. In-Memory Rate Limiting (Not Ideal)

This is the simplest setup. You use something like `express-rate-limit` to store counts in memory.

```javascript
import express from "express";
import rateLimit from "express-rate-limit";

const app = express();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
});

app.use("/api", limiter, (req, res) => {
  res.json({ message: "Hello from Vercel!" });
});
```

**Problem:** Serverless functions on Vercel **don’t keep memory between invocations**, so your counter resets every time. It works in local dev, but not reliably in production.

Use this only for **small projects** or as a quick demo.

#### 2\. Using an External Store (Redis / Vercel KV)

For a real production setup, you need a **shared store** to persist counters across multiple function instances.

The easiest way is to use Upstash Redis or Vercel KV. Example with `rate-limiter-flexible`:

```javascript
import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";

const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  password: process.env.UPSTASH_REDIS_TOKEN,
  tls: {},
});

const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "api-limiter",
  points: 5,
  duration: 60,
});

export default async function handler(req, res) {
try {
  await rateLimiter.consume(req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  res.json({ message: "Success!" });
} catch {
    res.status(429).json({ error: "Too many requests" });
  }
}
```

**Why this is better:**

-   Works across all Vercel regions
-   Survives cold starts
-   Production-grade and scalable

#### 3\. Edge Middleware Rate Limiting

If you want to block requests **before they even hit your serverless function**, use Vercel Edge Middleware.

Example:

```javascript
import { NextResponse } from "next/server";
import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";

const redis = new Redis(process.env.UPSTASH_REDIS_URL);
const limiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "edge-limiter",
  points: 10,
  duration: 60,
});

export async function middleware(req) {
try {
  await limiter.consume(req.ip);
  return NextResponse.next();
} catch {
    return new NextResponse("Too many requests", { status: 429 });
  }
}
```

This approach runs **at the edge**, meaning lower latency and no wasted compute cycles on rejected requests.

#### Which One Should You Use?

-   **Prototype / small project:** In-memory is fine.
-   **Production API:** External store (Redis / Vercel KV).
-   **Performance-critical app:** Edge Middleware + Redis.

#### Conclusion

Rate limiting isn’t just a nice-to-have — it’s a **must** once your API is public. Start small with in-memory limits if you’re prototyping, then move to Redis or a KV store as your app grows. If you’re deploying to Vercel, consider Edge Middleware for maximum efficiency and lower latency.

By adding rate limiting early, you’ll save yourself from abuse, keep your free tier safe, and deliver a better experience to real users.
