import { StationLoginScreen } from "@/components/StationLoginScreen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinical Station Gateway | Quarantine & Treatment Facility",
  description:
    "Role-based clinical station access, staff authentication, and rapid bedside switching for quarantine and treatment facilities.",
};

export default function HomePage() {
  return <StationLoginScreen />;
}
