import { StationLoginScreen } from "@/components/StationLoginScreen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinical Station Login | Quarantine & Treatment Facility",
  description:
    "Role-based clinical station authentication and Fast Bedside PIN switcher for quarantine facility staff.",
};

export default function LoginPage() {
  return <StationLoginScreen />;
}
