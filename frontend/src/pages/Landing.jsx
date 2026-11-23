import { useAirQuality } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_COORDS } from "../lib/constants";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingFeatures } from "../components/landing/LandingFeatures";
import { LandingHowItWorks } from "../components/landing/LandingHowItWorks";
import { LandingImpact } from "../components/landing/LandingImpact";
import { LandingCTA } from "../components/landing/LandingCTA";

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const air = useAirQuality(DEFAULT_COORDS);
  return (
    <div>
      <LandingHero isAuthenticated={isAuthenticated} air={air} />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingImpact />
      <LandingCTA isAuthenticated={isAuthenticated} />
    </div>
  );
}
