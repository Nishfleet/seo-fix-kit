import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation, useNavigationType } from "react-router";
import { WaitlistPage } from "./pages/LandingPage.jsx";

// The signed-in app is loaded only when a /beta page opens, so the homepage
// ships without the dashboard code.
const BetaApp = lazy(() => import("./pages/beta/BetaApp.jsx").then((module) => ({ default: module.BetaApp })));

// The Worker serves this SPA shell for "/" and "/beta/*" (worker/index.js);
// every other public path is a Worker-rendered page reached by a full load.
export default function App() {
  return (
    <>
      <ScrollToTopOnPush />
      <Routes>
        <Route caseSensitive path="/beta/*" element={<BetaRoute />} />
        <Route path="*" element={<WaitlistPage />} />
      </Routes>
    </>
  );
}

// Each in-app link or back/forward step into a /beta page starts that page
// fresh, exactly as the former full-page loads did. BetaApp's own URL
// rewrites (report path after an audit, invite/access cleanup, lock) carry
// its mount key in history state so they update the URL without remounting.
function BetaRoute() {
  const location = useLocation();
  const mountKey = location.state?.betaMountKey || location.key;
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <BetaApp key={mountKey} mountKey={mountKey} />
    </Suspense>
  );
}

// Library-mode BrowserRouter has no scroll restoration; a pushed in-app
// navigation should land at the top like a page load did.
function ScrollToTopOnPush() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "PUSH") window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}
