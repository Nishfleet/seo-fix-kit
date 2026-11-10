import assert from "node:assert/strict";
import test from "node:test";
import { PRIVATE_ADDRESS_CHECK_FAILED, fetchPublicUrl, resolvesToPrivateAddress } from "./url-safety.js";

const PUBLIC_A = "93.184.216.34";
const PUBLIC_AAAA = "2606:2800:220:1:248:1893:25c8:1946";
const PRIVATE_A = "10.0.0.7";
const PRIVATE_AAAA = "fd00::1";

function dnsQueryType(url) {
  return new URL(String(url)).searchParams.get("type");
}

function dnsOk(records) {
  return Response.json({ Status: 0, Answer: records.map(([type, data]) => ({ type, data })) });
}

function dnsEmpty() {
  return Response.json({ Status: 0, Answer: [] });
}

function customerPage() {
  return new Response("public page", { status: 200, headers: { "content-type": "text/html" } });
}

function fetchThroughGuard(fetcher, url, lookup) {
  return fetchPublicUrl(fetcher, url, {}, { privateAddressResolver: lookup });
}

test("a DNS fetcher that throws makes fetchPublicUrl reject and never fetch the target", async () => {
  const fetched = [];
  const fetcher = async (url) => {
    if (String(url).includes("cloudflare-dns.com")) throw new Error("nameserver unreachable");
    fetched.push(String(url));
    return customerPage();
  };
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  await assert.rejects(
    () => fetchThroughGuard(fetcher, "https://public.example/page", lookup),
    (error) => {
      assert.equal(error.code, PRIVATE_ADDRESS_CHECK_FAILED);
      assert.match(error.message, /could not check whether public\.example/i);
      assert.match(error.message, /refused/i);
      return true;
    }
  );
  assert.deepEqual(fetched, []);
});

test("a non-200 DNS answer for A makes the guard refuse the fetch before the target is requested", async () => {
  const fetched = [];
  const fetcher = buildFetcher({ fetched, failingType: "A" });
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  await assert.rejects(
    () => fetchThroughGuard(fetcher, "https://public.example/page", lookup),
    (error) => error.code === PRIVATE_ADDRESS_CHECK_FAILED
  );
  assert.deepEqual(fetched, []);
});

test("a non-200 DNS answer for AAAA makes the guard refuse the fetch before the target is requested", async () => {
  const fetched = [];
  const fetcher = buildFetcher({ fetched, failingType: "AAAA" });
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  await assert.rejects(
    () => fetchThroughGuard(fetcher, "https://public.example/page", lookup),
    (error) => error.code === PRIVATE_ADDRESS_CHECK_FAILED
  );
  assert.deepEqual(fetched, []);
});

test("public A and AAAA answers let the fetch through", async () => {
  const fetched = [];
  const fetcher = buildFetcher({ fetched });
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  const { response, finalUrl } = await fetchThroughGuard(fetcher, "https://public.example/page", lookup);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "public page");
  assert.equal(finalUrl, "https://public.example/page");
  assert.deepEqual(fetched, ["https://public.example/page"]);
});

test("a private AAAA answer refuses the fetch", async () => {
  const fetched = [];
  const fetcher = buildFetcher({
    fetched,
    answers: (type) => (type === "A" ? dnsOk([[1, PUBLIC_A]]) : dnsOk([[28, PRIVATE_AAAA]]))
  });
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  await assert.rejects(
    () => fetchThroughGuard(fetcher, "https://public.example/page", lookup),
    /private or internal address/i
  );
  assert.deepEqual(fetched, []);
});

test("a private A answer refuses the fetch", async () => {
  const fetched = [];
  const fetcher = buildFetcher({
    fetched,
    answers: (type) => (type === "A" ? dnsOk([[1, PRIVATE_A]]) : dnsEmpty())
  });
  const lookup = (hostname) => resolvesToPrivateAddress(hostname, fetcher);

  await assert.rejects(
    () => fetchThroughGuard(fetcher, "https://public.example/page", lookup),
    /private or internal address/i
  );
  assert.deepEqual(fetched, []);
});

test("an empty AAAA answer is not a failed lookup", async () => {
  const fetcher = buildFetcher({ answers: (type) => (type === "A" ? dnsOk([[1, PUBLIC_A]]) : dnsEmpty()) });
  assert.equal(await resolvesToPrivateAddress("public.example", fetcher), false);
});

test("resolvesToPrivateAddress throws the clear check-failed error on throw, non-200 and unreadable answers", async () => {
  await assert.rejects(
    () =>
      resolvesToPrivateAddress("public.example", async () => {
        throw new Error("dns failure");
      }),
    (error) => {
      assert.equal(error.code, PRIVATE_ADDRESS_CHECK_FAILED);
      assert.match(error.message, /could not check whether public\.example/i);
      return true;
    }
  );

  await assert.rejects(
    () => resolvesToPrivateAddress("public.example", async () => new Response("bad gateway", { status: 502 })),
    (error) => {
      assert.equal(error.code, PRIVATE_ADDRESS_CHECK_FAILED);
      assert.match(String(error.cause?.message), /DNS (A|AAAA) lookup for public\.example returned HTTP 502/i);
      return true;
    }
  );

  await assert.rejects(
    () => resolvesToPrivateAddress("public.example", async () => new Response("not json", { status: 200 })),
    (error) => error.code === PRIVATE_ADDRESS_CHECK_FAILED
  );
});

function buildFetcher({
  fetched = [],
  answers = (type) => dnsOk(type === "A" ? [[1, PUBLIC_A]] : [[28, PUBLIC_AAAA]]),
  failingType = ""
} = {}) {
  return async (url) => {
    if (String(url).includes("cloudflare-dns.com")) {
      const type = dnsQueryType(url);
      if (type === failingType) return new Response("dns over https is failing", { status: 503 });
      return answers(type);
    }
    fetched.push(String(url));
    return customerPage();
  };
}
