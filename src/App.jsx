import { WaitlistPage } from "./pages/LandingPage.jsx";
import { BetaApp } from "./pages/beta/BetaApp.jsx";

export default function App() {
  if (window.location.pathname.startsWith("/beta")) {
    return <BetaApp />;
  }

  return <WaitlistPage />;
}
